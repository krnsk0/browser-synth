import { chordPitchClasses, samePitchClasses, type ChordRef, type Quality } from "./harmony";

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
  maxHistory: number;
}

const DEFAULTS: TrackerOptions = { mergeMs: 350, maxHistory: 16 };

/**
 * A progression built on purpose: whatever is played becomes the candidate,
 * and only `commit` adds it to the history. Trying chords never changes the
 * progression.
 */
export class ProgressionTracker {
  /** Committed chords, oldest first. */
  history: PlayedChord[] = [];
  candidate: PlayedChord | null = null;
  private readonly opts: TrackerOptions;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** The chord suggestions are made from: the last committed one, or the candidate before anything is committed. */
  get anchor(): PlayedChord | null {
    return this.history.at(-1) ?? this.candidate;
  }

  play(chord: ChordRef, notes: readonly number[], now: number): PlayResult {
    const next: PlayedChord = { chord, notes: [...notes], at: now };
    const prev = this.candidate;
    if (prev && samePitchClasses(chordPitchClasses(prev.chord), chordPitchClasses(chord))) {
      this.candidate = { ...prev, notes: next.notes, at: now };
      return "revoiced";
    }
    if (prev && now - prev.at < this.opts.mergeMs && prev.notes.every((n) => notes.includes(n))) {
      this.candidate = { ...next, via: prev.via };
      return "extended";
    }
    this.candidate = next;
    return "new";
  }

  /** Adds the candidate to the progression. Returns it, or null if there was nothing to commit. */
  commit(): PlayedChord | null {
    const chord = this.candidate;
    if (!chord) return null;
    const last = this.history.at(-1);
    if (last && samePitchClasses(chordPitchClasses(last.chord), chordPitchClasses(chord.chord))) {
      this.history = [...this.history.slice(0, -1), { ...last, notes: chord.notes }];
    } else {
      this.history = [...this.history, chord].slice(-this.opts.maxHistory);
    }
    this.candidate = null;
    return chord;
  }

  /** Removes the last committed chord. */
  undo(): PlayedChord | null {
    const last = this.history.at(-1) ?? null;
    this.history = this.history.slice(0, -1);
    return last;
  }

  clear(): void {
    this.history = [];
    this.candidate = null;
  }

  snapshot(): ProgressionSnapshot {
    return { history: this.history, candidate: this.candidate };
  }

  /** Loads a saved progression, dropping anything malformed. */
  restore(raw: unknown): void {
    const saved = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    this.history = (Array.isArray(saved.history) ? saved.history : []).map(sanitizePlayed).filter((p) => p !== null).slice(-this.opts.maxHistory);
    this.candidate = sanitizePlayed(saved.candidate);
  }
}

export interface ProgressionSnapshot {
  history: PlayedChord[];
  candidate: PlayedChord | null;
}

const QUALITIES: readonly Quality[] = ["M", "m", "dim", "aug", "7", "maj7", "m7", "m7b5", "dim7"];

function sanitizePlayed(raw: unknown): PlayedChord | null {
  if (!raw || typeof raw !== "object") return null;
  const { chord, notes, via } = raw as Record<string, unknown>;
  const { root, quality } = (chord && typeof chord === "object" ? chord : {}) as Record<string, unknown>;
  if (!Number.isInteger(root) || (root as number) < 0 || (root as number) > 11) return null;
  if (!QUALITIES.includes(quality as Quality)) return null;
  if (!Array.isArray(notes) || notes.length === 0 || !notes.every((n) => Number.isInteger(n) && n >= 0 && n <= 127)) return null;
  // Saved timestamps come from an earlier page load, so a restored chord can never merge with a new one.
  const played: PlayedChord = { chord: { root: root as number, quality: quality as Quality }, notes: [...(notes as number[])], at: -Infinity };
  if (typeof via === "string") played.via = via;
  return played;
}
