import { Chord, Interval, Note } from "tonal";
import { keySpelling, tonicPitchClass, type Mode, type MusicalKey } from "./keys";

export type Quality = "M" | "m" | "dim" | "aug" | "7" | "maj7" | "m7" | "m7b5" | "dim7";
export type Family = "M" | "m" | "dim" | "aug";

/** A chord reduced to what it does harmonically: root pitch class plus a triad or seventh quality. */
export interface ChordRef {
  root: number;
  quality: Quality;
}

const INTERVALS: Record<Quality, readonly number[]> = {
  M: [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

const SUFFIX: Record<Quality, string> = { M: "", m: "m", dim: "dim", aug: "aug", "7": "7", maj7: "maj7", m7: "m7", m7b5: "m7b5", dim7: "dim7" };

const pc = (n: number) => ((n % 12) + 12) % 12;

export function chordPitchClasses(chord: ChordRef): number[] {
  return INTERVALS[chord.quality].map((i) => pc(chord.root + i));
}

export function samePitchClasses(a: readonly number[], b: readonly number[]): boolean {
  const sa = new Set(a.map(pc));
  const sb = new Set(b.map(pc));
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

export function family(quality: Quality): Family {
  if (quality === "m" || quality === "m7") return "m";
  if (quality === "dim" || quality === "m7b5" || quality === "dim7") return "dim";
  if (quality === "aug") return "aug";
  return "M";
}

export function isSeventh(quality: Quality): boolean {
  return INTERVALS[quality].length === 4;
}

/**
 * Reduces a detected symbol ("Cmaj9#11/E", "G7sus4", "Am6") to the triad or
 * seventh it functions as. Sus chords act as major; power chords and other
 * chords without a third have no function and return null.
 */
export function parseChordSymbol(symbol: string): ChordRef | null {
  // Tonal measures a slash chord's intervals from the bass, which hides the third.
  const chord = Chord.get(symbol.replace(/\/[A-G][#b]*$/, ""));
  if (chord.empty || !chord.tonic) return null;
  let third: number | undefined;
  let fifth: number | undefined;
  let seventh: number | undefined;
  let sus = false;
  for (const name of chord.intervals) {
    const { num, semitones } = Interval.get(name);
    if (num === 3) third = pc(semitones);
    else if (num === 5) fifth = pc(semitones);
    else if (num === 7) seventh = pc(semitones);
    else if (num === 2 || num === 4) sus = true;
  }
  if (third === undefined && !sus) return null;
  const root = Note.chroma(chord.tonic);

  if (third === undefined || third === 4) {
    if (fifth === 8 && seventh === undefined) return { root, quality: "aug" };
    return { root, quality: seventh === 10 ? "7" : seventh === 11 ? "maj7" : "M" };
  }
  if (fifth === 6) return { root, quality: seventh === 9 ? "dim7" : seventh === 10 ? "m7b5" : "dim" };
  return { root, quality: seventh === 10 ? "m7" : "m" };
}

// --- Degrees in a key -------------------------------------------------------

export interface Degree {
  /** Semitones above the tonic. */
  s: number;
  /** Display numeral, major-scale relative in both modes (bVII, not VII, in minor). */
  numeral: string;
  triad: Quality;
  seventh: Quality;
}

const deg = (s: number, numeral: string, triad: Quality, seventh: Quality): Degree => ({ s, numeral, triad, seventh });

const DIATONIC: Record<Mode, readonly Degree[]> = {
  major: [deg(0, "I", "M", "maj7"), deg(2, "ii", "m", "m7"), deg(4, "iii", "m", "m7"), deg(5, "IV", "M", "maj7"), deg(7, "V", "M", "7"), deg(9, "vi", "m", "m7"), deg(11, "vii°", "dim", "m7b5")],
  // V is the harmonic-minor dominant; v and bVII are the natural-minor ones.
  minor: [
    deg(0, "i", "m", "m7"),
    deg(2, "ii°", "dim", "m7b5"),
    deg(3, "bIII", "M", "maj7"),
    deg(5, "iv", "m", "m7"),
    deg(7, "V", "M", "7"),
    deg(7, "v", "m", "m7"),
    deg(8, "bVI", "M", "maj7"),
    deg(10, "bVII", "M", "7"),
    deg(11, "vii°", "dim", "dim7"),
  ],
};

/** Chords from outside the key that the suggestion rules know by name. */
const BORROWED: Record<Mode, readonly Degree[]> = {
  major: [
    deg(10, "bVII", "M", "7"),
    deg(5, "iv", "m", "m7"),
    deg(8, "bVI", "M", "maj7"),
    deg(3, "bIII", "M", "maj7"),
    deg(1, "bII", "M", "maj7"),
    deg(1, "bII7", "7", "7"),
    deg(10, "bVII7", "7", "7"),
  ],
  minor: [deg(5, "IV", "M", "7"), deg(0, "I", "M", "maj7"), deg(1, "bII", "M", "maj7"), deg(1, "bII7", "7", "7")],
};

export function degreeByNumeral(mode: Mode, numeral: string): Degree | undefined {
  return DIATONIC[mode].find((d) => d.numeral === numeral) ?? BORROWED[mode].find((d) => d.numeral === numeral);
}

export function semitonesFromTonic(chord: ChordRef, key: MusicalKey): number {
  return pc(chord.root - tonicPitchClass(key));
}

function matches(chord: ChordRef, d: Degree, s: number): boolean {
  if (d.s !== s || family(d.triad) !== family(chord.quality)) return false;
  // A dominant seventh on I or IV is a secondary dominant, not that degree.
  return chord.quality !== "7" || d.seventh === "7";
}

export function diatonicDegree(chord: ChordRef, key: MusicalKey): Degree | undefined {
  const s = semitonesFromTonic(chord, key);
  return DIATONIC[key.mode].find((d) => matches(chord, d, s));
}

export function borrowedDegree(chord: ChordRef, key: MusicalKey): Degree | undefined {
  const s = semitonesFromTonic(chord, key);
  const options = BORROWED[key.mode].filter((d) => matches(chord, d, s));
  return options.find((d) => (d.triad === "7") === (chord.quality === "7")) ?? options[0];
}

/** For a dominant seventh outside the key, the diatonic chord it resolves to, if any (D7 in C → V). */
export function secondaryTarget(chord: ChordRef, key: MusicalKey): Degree | undefined {
  if (chord.quality !== "7" || diatonicDegree(chord, key)) return undefined;
  const s = pc(semitonesFromTonic(chord, key) + 5);
  if (s === 0) return undefined;
  const target = DIATONIC[key.mode].find((d) => d.s === s && d.triad !== "dim");
  return target;
}

// --- Spelling ---------------------------------------------------------------

const DEGREE_INTERVALS = ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M"];

/** Spells a root by its scale degree (bVI of D is Bb, not A#), avoiding double accidentals. */
export function rootName(root: number, key: MusicalKey | null): string {
  const spelling = keySpelling(key);
  if (!key) return spelling[pc(root)];
  const name = Note.transpose(key.tonic, DEGREE_INTERVALS[pc(root - tonicPitchClass(key))]);
  return /##|bb/.test(name) ? spelling[pc(root)] : name;
}

export function chordSymbol(chord: ChordRef, key: MusicalKey | null): string {
  return `${rootName(chord.root, key)}${SUFFIX[chord.quality]}`;
}

/** Pitch-class names with the chord's own tones spelled from its root (A7 in C has C#, not Db). */
export function chordSpelling(symbol: string, key: MusicalKey | null): string[] {
  const names = [...keySpelling(key)];
  for (const note of Chord.get(symbol).notes) names[Note.chroma(note)] = note;
  return names;
}
