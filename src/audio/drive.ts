const CURVE_SIZE = 4096;
/** The negative half clips more gently, like a single-ended tube stage; the asymmetry adds even harmonics. */
const NEGATIVE_SOFTNESS = 0.6;
/** WaveShaper clamps input to ±1, so scale down first; a 6-note full-velocity chord still fits. */
const INPUT_SCALE = 0.35;
/** A full-velocity single voice peaks around here; makeup gain keeps it at that level at any drive. */
const REFERENCE_LEVEL = 0.25;

/** Maps drive 0..1 to a saturation amount; 0 is effectively clean. */
export function driveAmount(drive: number): number {
  return 0.01 + Math.min(1, Math.max(0, drive)) * 24;
}

export function shape(x: number, k: number): number {
  const kn = k * NEGATIVE_SOFTNESS;
  return x >= 0 ? Math.tanh(k * x) / Math.tanh(k) : Math.tanh(kn * x) / Math.tanh(kn);
}

export function driveCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = driveAmount(drive);
  const curve = new Float32Array(CURVE_SIZE);
  for (let i = 0; i < CURVE_SIZE; i++) curve[i] = shape((i / (CURVE_SIZE - 1)) * 2 - 1, k);
  return curve;
}

export function makeupGain(drive: number): number {
  return REFERENCE_LEVEL / shape(REFERENCE_LEVEL * INPUT_SCALE, driveAmount(drive));
}

/**
 * Warm amp-style saturation: asymmetric soft clip, a DC blocker for the
 * offset the asymmetry creates, and a lowpass "tone" like a speaker rolloff.
 * Sits on the summed voices, so chords drive harder than single notes.
 */
export class Drive {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly tone: BiquadFilterNode;

  constructor(ctx: BaseAudioContext, drive: number, toneHz: number) {
    this.input = new GainNode(ctx, { gain: INPUT_SCALE });
    this.shaper = new WaveShaperNode(ctx, { curve: driveCurve(drive), oversample: "4x" });
    const dcBlock = new BiquadFilterNode(ctx, { type: "highpass", frequency: 25, Q: 0.7 });
    this.tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: toneHz, Q: 0.6 });
    this.output = new GainNode(ctx, { gain: makeupGain(drive) });
    this.input.connect(this.shaper).connect(dcBlock).connect(this.tone).connect(this.output);
  }

  setDrive(drive: number, now: number): void {
    this.shaper.curve = driveCurve(drive);
    this.output.gain.setTargetAtTime(makeupGain(drive), now, 0.02);
  }

  setTone(hz: number, now: number): void {
    this.tone.frequency.setTargetAtTime(hz, now, 0.02);
  }
}
