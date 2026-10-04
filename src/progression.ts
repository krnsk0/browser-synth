import { chordPitchClasses, samePitchClasses, type ChordRef } from "./harmony";

export interface PlayedChord {
  chord: ChordRef;
  notes: number[];
  at: number;
  /** Technique of the suggestion this chord matched, e.g. "deceptive cadence". */
  via?: string;
}

export type PlayResult = "new" | "revoiced" | "extended";

export interface TrackerOptions {
  /** A chord that grows into a bigger one this quickly was still being played, not a separate chord. */
  mergeMs: number;
  /** After this much silence the next chord starts a new progression. */
  resetMs: number;
  maxHistory: number;
}

const DEFAULTS: TrackerOptions = { mergeMs: 350, resetMs: 30_000, maxHistory: 6 };

/** The chords played so far, oldest first, with the one being held now kept apart as `current`. */
export class ProgressionTracker {
  history: PlayedChord[] = [];
  current: PlayedChord | null = null;
  private readonly opts: TrackerOptions;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  play(chord: ChordRef, notes: readonly number[], now: number): PlayResult {
    const next: PlayedChord = { chord, notes: [...notes], at: now };
    const prev = this.current;
    if (prev && now - prev.at > this.opts.resetMs) this.history = [];
    else if (prev && samePitchClasses(chordPitchClasses(prev.chord), chordPitchClasses(chord))) {
      this.current = { ...prev, notes: next.notes, at: now };
      return "revoiced";
    } else if (prev && now - prev.at < this.opts.mergeMs && prev.notes.every((n) => notes.includes(n))) {
      this.current = { ...next, via: prev.via };
      return "extended";
    } else if (prev) {
      this.history = [...this.history, prev].slice(-this.opts.maxHistory);
    }
    this.current = next;
    return "new";
  }

  clear(): void {
    this.history = [];
    this.current = null;
  }
}
