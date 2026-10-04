export interface PlaybackHooks {
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  /** The index of the chord now sounding, or null when playback stops. */
  onStep(index: number | null): void;
}

export interface PlaybackSettings {
  bpm: number;
  beatsPerChord: number;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = { bpm: 90, beatsPerChord: 4 };
export const BPM_RANGE = { min: 40, max: 200 } as const;
export const BEAT_CHOICES = [1, 2, 4, 8] as const;

/** A short gap before each new chord so repeated notes re-attack instead of blurring together. */
const GAP_MS = 40;
const VELOCITY = 85;

export function sanitizePlayback(raw: unknown): PlaybackSettings {
  const r = (raw ?? {}) as Partial<Record<keyof PlaybackSettings, unknown>>;
  const bpm = typeof r.bpm === "number" ? Math.round(Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, r.bpm))) : DEFAULT_PLAYBACK.bpm;
  const beats = BEAT_CHOICES.find((b) => b === r.beatsPerChord) ?? DEFAULT_PLAYBACK.beatsPerChord;
  return { bpm, beatsPerChord: beats };
}

/**
 * Loops a progression, one chord every `beatsPerChord` beats. The chord list
 * is read again at every step, so committing or undoing while it plays takes
 * effect on the next chord.
 */
export class Playback {
  settings: PlaybackSettings;
  private stepTimer: number | undefined;
  private releaseTimer: number | undefined;
  private sounding: number[] = [];
  private index = 0;

  constructor(
    private readonly hooks: PlaybackHooks,
    private readonly chords: () => readonly (readonly number[])[],
    settings: PlaybackSettings = DEFAULT_PLAYBACK,
  ) {
    this.settings = settings;
  }

  private running = false;

  get active(): boolean {
    return this.running;
  }

  start(): void {
    this.stop();
    this.running = true;
    this.index = 0;
    this.step();
  }

  stop(): void {
    window.clearTimeout(this.stepTimer);
    window.clearTimeout(this.releaseTimer);
    this.running = false;
    this.release();
    this.hooks.onStep(null);
  }

  private step(): void {
    const chords = this.chords();
    if (chords.length === 0) return this.stop();
    const i = this.index % chords.length;
    this.release();
    for (const n of chords[i]) this.hooks.noteOn(n, VELOCITY);
    this.sounding = [...chords[i]];
    this.hooks.onStep(i);
    this.index = i + 1;
    const ms = (this.settings.beatsPerChord * 60_000) / this.settings.bpm;
    this.releaseTimer = window.setTimeout(() => this.release(), ms - GAP_MS);
    this.stepTimer = window.setTimeout(() => this.step(), ms);
  }

  private release(): void {
    for (const n of this.sounding) this.hooks.noteOff(n);
    this.sounding = [];
  }
}
