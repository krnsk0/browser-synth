import { Drive } from "./drive";
import { createImpulse } from "./reverb";
import { WAVEFORMS, defaultValues, type ParamId, type ParamValues } from "../params";

type Waveform = (typeof WAVEFORMS)[number];

/** Matches each waveform's RMS to the saw's so switching shapes doesn't jump in level. */
const WAVE_LEVEL: Record<Waveform, number> = { sawtooth: 1, square: 0.577, triangle: 1, sine: 0.816 };

function waveAt(index: number): Waveform {
  return WAVEFORMS[Math.min(WAVEFORMS.length - 1, Math.max(0, Math.round(index)))];
}

const MAX_VOICES = 16;
const VOICE_PEAK = 0.25;
const STEAL_RELEASE = 0.015;
const SMOOTHING = 0.02;

function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Freezes a param at its current value so new automation starts from there. */
function holdAt(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
  } else {
    const current = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(current, time);
  }
}

/** Decay and release are exponential approaches; the time constants put them within ~2% of target at the stated time. */
function startEnvelope(param: AudioParam, now: number, peak: number, attack: number, decay: number, sustain: number): void {
  param.setValueAtTime(0, now);
  param.linearRampToValueAtTime(peak, now + attack);
  param.setTargetAtTime(peak * sustain, now + attack, decay / 4);
}

function releaseEnvelope(param: AudioParam, now: number, release: number): void {
  holdAt(param, now);
  param.setTargetAtTime(0, now, release / 5);
}

class Voice {
  readonly note: number;
  readonly startedAt: number;
  private readonly oscillators: OscillatorNode[];
  private readonly level: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly amp: GainNode;
  private stopped = false;

  constructor(ctx: AudioContext, destination: AudioNode, note: number, velocity: number, p: ParamValues, onEnded: (v: Voice) => void) {
    this.note = note;
    const now = ctx.currentTime;
    this.startedAt = now;

    const wave = waveAt(p.wave);
    this.level = new GainNode(ctx, { gain: WAVE_LEVEL[wave] });
    this.filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: p.cutoff, Q: p.resonance });
    this.amp = new GainNode(ctx, { gain: 0 });
    this.level.connect(this.filter).connect(this.amp).connect(destination);

    const frequency = midiToFrequency(note);
    this.oscillators = [-1, 1].map((sign) => {
      const osc = new OscillatorNode(ctx, { type: wave, frequency, detune: sign * p.detune });
      osc.connect(this.level);
      osc.start(now);
      return osc;
    });
    this.oscillators[0].onended = () => {
      this.amp.disconnect();
      onEnded(this);
    };

    const peak = VOICE_PEAK * (velocity / 127);
    startEnvelope(this.amp.gain, now, peak, p.attack, p.decay, p.sustain);
  }

  release(now: number, releaseTime: number): void {
    if (this.stopped) return;
    this.stopped = true;
    releaseEnvelope(this.amp.gain, now, releaseTime);
    for (const osc of this.oscillators) osc.stop(now + releaseTime * 1.2 + 0.01);
  }

  setFilter(now: number, cutoff: number, resonance: number): void {
    this.filter.frequency.setTargetAtTime(cutoff, now, SMOOTHING);
    this.filter.Q.setTargetAtTime(resonance, now, SMOOTHING);
  }

  setDetune(now: number, cents: number): void {
    this.oscillators.forEach((osc, i) => osc.detune.setTargetAtTime((i === 0 ? -1 : 1) * cents, now, SMOOTHING));
  }

  setWave(now: number, wave: Waveform): void {
    for (const osc of this.oscillators) osc.type = wave;
    this.level.gain.setTargetAtTime(WAVE_LEVEL[wave], now, SMOOTHING);
  }
}

export class Synth {
  readonly ctx: AudioContext;
  private params: ParamValues = defaultValues();
  /** Voices still accepting note-off, keyed by note. */
  private readonly active = new Map<number, Voice>();
  /** Every voice that is still producing sound, including released tails. */
  private readonly sounding = new Set<Voice>();
  private readonly held = new Set<number>();
  private sustainPedal = false;

  private readonly voiceBus: GainNode;
  private readonly drive: Drive;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly master: GainNode;
  private reverbTimer: number | undefined;

  onHeldChange: (held: ReadonlySet<number>) => void = () => {};

  constructor(ctx = new AudioContext({ latencyHint: "interactive" })) {
    this.ctx = ctx;
    this.voiceBus = new GainNode(ctx);
    this.dry = new GainNode(ctx);
    this.wet = new GainNode(ctx);
    this.convolver = new ConvolverNode(ctx, { buffer: createImpulse(ctx, this.params.reverbDecay) });
    const wetTone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 6000 });
    this.master = new GainNode(ctx);
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.15 });

    this.drive = new Drive(ctx, this.params.drive, this.params.driveTone);
    this.voiceBus.connect(this.drive.input);
    this.drive.output.connect(this.dry).connect(this.master);
    this.drive.output.connect(this.convolver).connect(wetTone).connect(this.wet).connect(this.master);
    this.master.connect(limiter).connect(ctx.destination);
    this.applyMix();
    this.master.gain.value = this.params.volume;
  }

  /** Browsers start audio suspended until a user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  get heldNotes(): ReadonlySet<number> {
    return this.held;
  }

  noteOn(note: number, velocity = 100): void {
    void this.resume();
    const now = this.ctx.currentTime;
    this.active.get(note)?.release(now, STEAL_RELEASE);
    this.active.delete(note);
    if (this.active.size >= MAX_VOICES) {
      const oldest = [...this.active.values()].reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
      oldest.release(now, STEAL_RELEASE);
      this.active.delete(oldest.note);
    }
    const voice = new Voice(this.ctx, this.voiceBus, note, velocity, this.params, (v) => this.sounding.delete(v));
    this.active.set(note, voice);
    this.sounding.add(voice);
    this.held.add(note);
    this.onHeldChange(this.held);
  }

  noteOff(note: number): void {
    if (!this.held.delete(note)) return;
    if (!this.sustainPedal) this.releaseNote(note);
    this.onHeldChange(this.held);
  }

  setSustain(down: boolean): void {
    this.sustainPedal = down;
    if (down) return;
    for (const note of [...this.active.keys()]) {
      if (!this.held.has(note)) this.releaseNote(note);
    }
  }

  allNotesOff(): void {
    this.sustainPedal = false;
    this.held.clear();
    for (const note of [...this.active.keys()]) this.releaseNote(note);
    this.onHeldChange(this.held);
  }

  setParam(id: ParamId, value: number): void {
    this.params = { ...this.params, [id]: value };
    const now = this.ctx.currentTime;
    switch (id) {
      case "cutoff":
      case "resonance":
        for (const v of this.sounding) v.setFilter(now, this.params.cutoff, this.params.resonance);
        break;
      case "detune":
        for (const v of this.sounding) v.setDetune(now, value);
        break;
      case "wave":
        for (const v of this.sounding) v.setWave(now, waveAt(value));
        break;
      case "drive":
        this.drive.setDrive(value, now);
        break;
      case "driveTone":
        this.drive.setTone(value, now);
        break;
      case "reverbMix":
        this.applyMix();
        break;
      case "reverbDecay":
        window.clearTimeout(this.reverbTimer);
        this.reverbTimer = window.setTimeout(() => {
          this.convolver.buffer = createImpulse(this.ctx, this.params.reverbDecay);
        }, 150);
        break;
      case "volume":
        this.master.gain.setTargetAtTime(value, now, SMOOTHING);
        break;
      // Envelope params apply from the next note.
    }
  }

  private releaseNote(note: number): void {
    const voice = this.active.get(note);
    if (!voice) return;
    voice.release(this.ctx.currentTime, this.params.release);
    this.active.delete(note);
  }

  /** Equal-power crossfade between dry and reverb. */
  private applyMix(): void {
    const now = this.ctx.currentTime;
    const angle = this.params.reverbMix * (Math.PI / 2);
    this.dry.gain.setTargetAtTime(Math.cos(angle), now, SMOOTHING);
    this.wet.gain.setTargetAtTime(Math.sin(angle), now, SMOOTHING);
  }
}
