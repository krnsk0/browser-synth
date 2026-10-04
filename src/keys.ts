import { Key, Note } from "tonal";
import { DEFAULT_SPELLING } from "./ui/noteNames";

export type Mode = "major" | "minor";

export interface MusicalKey {
  tonic: string;
  mode: Mode;
}

/** The usual name for each key, avoiding seven-sharp/seven-flat spellings. */
const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

export const KEYS: readonly MusicalKey[] = [
  ...MAJOR_TONICS.map((tonic) => ({ tonic, mode: "major" as const })),
  ...MINOR_TONICS.map((tonic) => ({ tonic, mode: "minor" as const })),
];

export function keyId(key: MusicalKey): string {
  return `${key.tonic} ${key.mode}`;
}

export function parseKey(id: string | null): MusicalKey | null {
  return KEYS.find((k) => keyId(k) === id) ?? null;
}

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Name for each pitch class (index 0 = C) in this key: scale tones use the
 * key's own spelling (so F# major has E#), and chromatic notes follow the key
 * signature's direction.
 */
export function keySpelling(key: MusicalKey | null): readonly string[] {
  if (!key) return DEFAULT_SPELLING;
  const { alteration, scale } =
    key.mode === "major" ? Key.majorKey(key.tonic) : { alteration: Key.minorKey(key.tonic).alteration, scale: Key.minorKey(key.tonic).natural.scale };
  const base = alteration > 0 ? SHARPS : alteration < 0 ? FLATS : DEFAULT_SPELLING;
  const names = [...base];
  for (const note of scale) names[Note.chroma(note)] = note;
  return names;
}

export function tonicPitchClass(key: MusicalKey): number {
  return Note.chroma(key.tonic);
}

/**
 * Degrees are measured against the major scale on the tonic in both modes,
 * the pop/jazz convention: in A minor, C is bIII and G is bVII.
 */
const DEGREES = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];

export function degreeNumeral(semitonesFromTonic: number): string {
  return DEGREES[((semitonesFromTonic % 12) + 12) % 12];
}
