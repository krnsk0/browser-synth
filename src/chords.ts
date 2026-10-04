import { Chord, Note } from "tonal";
import { degreeNumeral, keySpelling, tonicPitchClass, type MusicalKey } from "./keys";
import { noteName, pitchClassName } from "./ui/noteNames";

const INTERVALS: readonly [short: string, long: string][] = [
  ["P1", "unison"],
  ["m2", "minor 2nd"],
  ["M2", "major 2nd"],
  ["m3", "minor 3rd"],
  ["M3", "major 3rd"],
  ["P4", "perfect 4th"],
  ["TT", "tritone"],
  ["P5", "perfect 5th"],
  ["m6", "minor 6th"],
  ["M6", "major 6th"],
  ["m7", "minor 7th"],
  ["M7", "major 7th"],
];

const ALTERATION = /#5|b5|#9|b9|#11|b13|no\d|alt/g;
const ROOT = /^[A-G][#b]?/;
const SLASH_BASS = /\/[A-G][#b]?$/;

const SCALE_DEGREES = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];
const TRIAD_TYPES = new Set(["M", "m", "dim", "aug"]);
const SEVENTH_TYPES = new Set(["7", "maj7", "m7", "m7b5", "dim7"]);

export interface ChordReading {
  kind: "note" | "interval" | "chord" | "unknown";
  /** Short label for the big display, e.g. "C/E", "Am7", "M3". */
  symbol: string;
  /** Spelled-out description, e.g. "C major over E". */
  name: string;
  /** Other valid names for the same notes, best first. */
  alternatives: string[];
  /** Function in the key, e.g. "V⁶₅" for a chord or "b3" (scale degree) for a note; null without a key. */
  roman: string | null;
}

/** Tonal writes major triads as "CM"; lead sheets write "C". */
export function displaySymbol(symbol: string): string {
  return symbol.replace(/^([A-G][#b]?)M(?=$|\/|add)/, "$1");
}

function chordType(symbol: string): string {
  return symbol.replace(ROOT, "").replace(SLASH_BASS, "");
}

/** Half-diminished is a stock chord, not an altered one, even though its symbol contains b5. */
function alterations(symbol: string): number {
  const type = chordType(symbol);
  return type === "m7b5" ? 0 : (type.match(ALTERATION)?.length ?? 0);
}

/** Lower is more likely what a player means: plain chords beat altered spellings, root position beats inversions. */
function score(symbol: string): number {
  return alterations(symbol) * 3 + (SLASH_BASS.test(symbol) ? 1 : 0) + symbol.length * 0.05;
}

function describe(symbol: string): string {
  const chord = Chord.get(symbol);
  return chord.type ? chord.name : displaySymbol(symbol);
}

/** Case shows quality (upper major, lower minor); symbols follow the numeral, e.g. vii°, iiø7, V7. */
function quality(type: string): { lower: boolean; suffix: string } {
  if (type === "M" || type === "") return { lower: false, suffix: "" };
  if (type.startsWith("Madd")) return { lower: false, suffix: type.slice(1) };
  if (type === "m7b5") return { lower: true, suffix: "ø7" };
  if (type.startsWith("dim")) return { lower: true, suffix: `°${type.slice(3)}` };
  if (type.startsWith("aug")) return { lower: false, suffix: `+${type.slice(3)}` };
  if (type.startsWith("m") && !type.startsWith("maj")) return { lower: true, suffix: type.slice(1).replace("/ma7", "maj7") };
  return { lower: false, suffix: type };
}

/** Figured-bass inversion marks for triads and sevenths; anything else falls back to a slash bass. */
function inversion(type: string, bassInterval: number): string | null {
  const third = bassInterval === 3 || bassInterval === 4;
  const fifth = bassInterval >= 6 && bassInterval <= 8;
  const seventh = bassInterval >= 9 && bassInterval <= 11;
  if (TRIAD_TYPES.has(type)) return third ? "⁶" : fifth ? "⁶₄" : null;
  if (SEVENTH_TYPES.has(type)) return third ? "⁶₅" : fifth ? "⁴₃" : seventh ? "⁴₂" : null;
  return null;
}

export function romanNumeral(symbol: string, key: MusicalKey, spelling: readonly string[]): string {
  const chord = Chord.get(symbol);
  const rootPc = Note.chroma(chord.tonic ?? "");
  const type = chordType(symbol);
  const numeral = degreeNumeral(rootPc - tonicPitchClass(key));
  const accidental = numeral.match(/^[b#]?/)?.[0] ?? "";
  const { lower, suffix } = quality(type);
  const base = numeral.slice(accidental.length);

  let figure = "";
  let tail = suffix;
  if (chord.bass) {
    const bassInterval = (Note.chroma(chord.bass) - rootPc + 12) % 12;
    const mark = inversion(type, bassInterval);
    if (mark) {
      figure = mark;
      if (SEVENTH_TYPES.has(type)) tail = suffix.replace(/7$/, "");
    } else {
      figure = `/${spelling[Note.chroma(chord.bass)]}`;
    }
  }
  return `${accidental}${lower ? base.toLowerCase() : base}${tail}${figure}`;
}

export function readChord(notes: Iterable<number>, key: MusicalKey | null = null): ChordReading | null {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const spelling = keySpelling(key);

  const pitchClasses: number[] = [];
  for (const n of sorted) {
    const pc = n % 12;
    if (!pitchClasses.includes(pc)) pitchClasses.push(pc);
  }
  const names = pitchClasses.map((pc) => pitchClassName(pc, spelling));

  if (pitchClasses.length === 1) {
    const roman = key ? SCALE_DEGREES[(pitchClasses[0] - tonicPitchClass(key) + 12) % 12] : null;
    return { kind: "note", symbol: names[0], name: sorted.length > 1 ? "octaves" : noteName(sorted[0], spelling), alternatives: [], roman };
  }

  const candidates = Chord.detect(names, { assumePerfectFifth: true }).sort((a, b) => score(a) - score(b));
  if (candidates.length > 0) {
    const [best, ...rest] = candidates;
    const alternatives = rest.filter((s) => alterations(s) <= alterations(best)).slice(0, 3).map(displaySymbol);
    const roman = key ? romanNumeral(best, key, spelling) : null;
    return { kind: "chord", symbol: displaySymbol(best), name: describe(best), alternatives, roman };
  }

  if (pitchClasses.length === 2) {
    const [short, long] = INTERVALS[(pitchClasses[1] - pitchClasses[0] + 12) % 12];
    return { kind: "interval", symbol: short, name: `${long}, ${names[0]} up to ${names[1]}`, alternatives: [], roman: null };
  }

  return { kind: "unknown", symbol: "?", name: "no standard chord name", alternatives: [], roman: null };
}
