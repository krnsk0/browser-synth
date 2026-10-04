import { functionLabel } from "./chords";
import {
  borrowedDegree,
  chordPitchClasses,
  chordSpelling,
  chordSymbol,
  degreeByNumeral,
  diatonicDegree,
  family,
  isSeventh,
  samePitchClasses,
  secondaryTarget,
  semitonesFromTonic,
  type ChordRef,
  type Degree,
  type Quality,
} from "./harmony";
import { tonicPitchClass, type Mode, type MusicalKey } from "./keys";
import type { PlayedChord } from "./progression";
import { voiceLead, type Voicing } from "./voiceLeading";

export type Group = "strong" | "color" | "surprise";

export interface Suggestion {
  chord: ChordRef;
  group: Group;
  technique: string;
  why: string;
  /** The chord just before this one: going back is fine, but it's sorted last. */
  back?: boolean;
}

/** Three cards per column keeps Suggest mode on one screen, so both hands can stay on the keys. */
const PER_GROUP = 3;
const pc = (n: number) => ((n % 12) + 12) % 12;

// --- Rules by scale degree ------------------------------------------------------
// Each entry is [target numeral, technique, why]. Numerals are major-scale relative in both modes.

type Rule = readonly [target: string, technique: string, why: string];
type RuleBook = Record<string, readonly Rule[]>;

const STRONG: Record<Mode, RuleBook> = {
  major: {
    I: [
      ["IV", "tonic → pre-dominant", "Leaves home toward the subdominant; the root stays as the 5th."],
      ["V", "tonic → dominant", "Builds tension that wants to come back to I."],
      ["vi", "relative minor", "Root drops a third and two notes stay put."],
      ["ii", "tonic → pre-dominant", "The start of a ii–V–I."],
    ],
    ii: [
      ["V", "ii–V", "Root down a fifth into the dominant, the core jazz move."],
      ["vii°", "pre-dominant → dominant", "A lighter dominant; its notes then step into I."],
      ["IV", "ii → IV", "Stays pre-dominant and shares two notes."],
    ],
    iii: [
      ["vi", "down a fifth", "Rides the circle of fifths toward ii–V–I."],
      ["IV", "step up", "Moves to the pre-dominant by step."],
    ],
    IV: [
      ["V", "pre-dominant → dominant", "Roots move by step, so the upper voices can move against the bass."],
      ["I", "plagal cadence", "The \"amen\" cadence, softer than V–I."],
      ["ii", "IV → ii", "Shares two notes and sets up V."],
    ],
    V: [["I", "authentic cadence", "The leading tone rises to the tonic and the 7th falls to the 3rd."]],
    vi: [
      ["ii", "down a fifth", "Circle of fifths toward V and I."],
      ["IV", "down a third", "Shares two notes; heads to the pre-dominant."],
      ["V", "vi → V", "The bass steps down into the dominant."],
    ],
    "vii°": [
      ["I", "leading-tone resolution", "Every voice can move by step into the tonic."],
      ["iii", "vii° → iii", "Down a fifth; a gentler landing than I."],
    ],
    bVII: [
      ["I", "♭VII → I", "The Mixolydian cadence: a whole step up into home."],
      ["IV", "♭VII → IV", "Root down a fifth, the I–♭VII–IV rock loop."],
    ],
    bVII7: [["I", "backdoor cadence", "♭VII7 resolves to I from below instead of from V."]],
    iv: [
      ["I", "minor plagal cadence", "The ♭6 falls a half step to the 5th."],
      ["V", "iv → V", "Pre-dominant to dominant with a darker color."],
    ],
    bVI: [
      ["bVII", "♭VI → ♭VII", "Climbs toward the ♭VI–♭VII–I \"Mario\" cadence."],
      ["V", "♭VI → V", "The ♭6 falls a half step onto the dominant's 5th."],
      ["I", "♭VI → I", "Back home by a major third; one note stays."],
    ],
    bIII: [
      ["IV", "♭III → IV", "Steps up toward the pre-dominant."],
      ["bVI", "down a fifth", "Stays in the borrowed minor colors."],
    ],
    bII: [
      ["V", "Neapolitan → V", "The ♭2 falls through the tonic to the leading tone."],
      ["I", "Phrygian cadence", "Slides down a half step into home."],
    ],
    bII7: [["I", "tritone sub → I", "The bass slides down a half step into the tonic."]],
  },
  minor: {
    i: [
      ["iv", "tonic → pre-dominant", "Leaves home toward the minor subdominant."],
      ["V", "tonic → dominant", "The raised 7th creates a strong pull back to i."],
      ["bVI", "down a third", "Root drops a major third; two notes stay."],
      ["bVII", "step down", "The natural-minor descent, often on to ♭VI."],
    ],
    "ii°": [["V", "ii°–V", "Root down a fifth; the minor-key ii–V."]],
    bIII: [
      ["bVI", "down a fifth", "Circle of fifths in the relative major."],
      ["iv", "♭III → iv", "Steps up to the pre-dominant."],
    ],
    iv: [
      ["V", "pre-dominant → dominant", "The bass steps up into the dominant."],
      ["i", "plagal cadence", "The minor \"amen\" cadence."],
      ["bVII", "iv → ♭VII", "Down a fifth toward ♭III, the relative major."],
    ],
    V: [["i", "authentic cadence", "The raised leading tone rises a half step to the tonic."]],
    v: [
      ["bVI", "v → ♭VI", "A modal drift with no leading tone."],
      ["iv", "v → iv", "Steps back down to the pre-dominant."],
    ],
    bVI: [
      ["V", "♭VI → V", "The Andalusian ending: the bass falls a half step."],
      ["iv", "down a third", "Shares two notes; stays dark."],
      ["bVII", "step up", "On toward ♭III or i."],
    ],
    bVII: [
      ["bIII", "cadence to the relative major", "♭VII is the dominant of ♭III."],
      ["i", "Aeolian cadence", "A whole step up into the tonic, no leading tone."],
      ["bVI", "step down", "The Andalusian descent."],
    ],
    "vii°": [["i", "leading-tone resolution", "Every voice can move by step into the tonic."]],
    IV: [["i", "IV → i", "The Dorian IV falls back home."]],
    I: [["iv", "I → iv", "The major tonic turns back to minor."]],
    bII: [["V", "Neapolitan → V", "The ♭2 falls to the leading tone."]],
    bII7: [["i", "tritone sub → i", "The bass slides down a half step into the tonic."]],
  },
};

const COLOR: Record<Mode, RuleBook> = {
  major: {
    I: [
      ["bVII", "borrowed ♭VII", "From Mixolydian: a rock way to leave home."],
      ["iv", "borrowed iv", "The minor iv from the parallel minor; bittersweet."],
      ["bVI", "borrowed ♭VI", "From the parallel minor; big and cinematic."],
    ],
    ii: [["bVII7", "backdoor dominant", "♭VII7 stands in for V and resolves to I from below."]],
    IV: [
      ["iv", "IV → iv", "One note drops a half step; then go to I."],
      ["bVII", "borrowed ♭VII", "Down a fourth into Mixolydian color."],
    ],
    V: [
      ["vi", "deceptive cadence", "Sounds like it's going home, then lands on vi."],
      ["IV", "rock retrogression", "V–IV–I runs the cadence backward, a blues and rock staple."],
      ["bVI", "deceptive to ♭VI", "A darker fake-out using a borrowed chord."],
    ],
    vi: [["bVI", "vi → ♭VI", "The 5th of vi drops a half step."]],
  },
  minor: {
    i: [["IV", "Dorian IV", "A borrowed major IV: raises the 6th for a brighter sound."]],
    V: [
      ["bVI", "deceptive cadence", "Sounds like it's going home, then lands on ♭VI."],
      ["I", "Picardy third", "Ends on a major tonic."],
    ],
    iv: [["IV", "iv → IV", "The 3rd rises a half step into Dorian color."]],
    bVII: [["V", "♭VII → V", "Swaps the natural-minor dominant for the real one."]],
  },
};

/** Dominant resolutions land on a triad even when sevenths are in play: in Cmaj7 the leading tone wouldn't rise. */
const RESOLVES_TO_TRIAD = new Set(["authentic cadence", "leading-tone resolution", "backdoor cadence", "tritone sub → I", "tritone sub → i"]);

/** Neapolitan ♭II: a pre-dominant surprise from these degrees. */
const NEAPOLITAN_FROM = new Set(["I", "ii", "IV", "i", "iv", "ii°"]);

// --- Building suggestions -------------------------------------------------------

function fromDegree(d: Degree, key: MusicalKey, sevenths: boolean): ChordRef {
  return { root: pc(tonicPitchClass(key) + d.s), quality: sevenths ? d.seventh : d.triad };
}

function currentNumeral(chord: ChordRef, key: MusicalKey): string | undefined {
  return (diatonicDegree(chord, key) ?? borrowedDegree(chord, key))?.numeral;
}

/** Numerals without the seventh, so V7 continues a pattern written with V. */
function patternNumeral(chord: ChordRef, key: MusicalKey): string | undefined {
  return currentNumeral(chord, key)?.replace(/7$/, "");
}

const rel = (chord: ChordRef, semitones: number, quality: Quality): ChordRef => ({ root: pc(chord.root + semitones), quality });

function isDominantTarget(s: Suggestion, key: MusicalKey | null, current: ChordRef): boolean {
  if (s.chord.quality === "7") return true;
  if (!key) return pc(s.chord.root - current.root) === 7 && family(s.chord.quality) === "M";
  return semitonesFromTonic(s.chord, key) === 7 && family(s.chord.quality) === "M";
}

function secondaryDominants(strong: readonly Suggestion[], key: MusicalKey | null, current: ChordRef): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of strong) {
    if (family(s.chord.quality) === "dim") continue;
    const dominant = rel(s.chord, 7, "7");
    if (dominant.root === current.root) continue;
    if (key && diatonicDegree(dominant, key)) continue;
    const name = key ? (diatonicDegree(s.chord, key)?.numeral ?? currentNumeral(s.chord, key)) : chordSymbol(s.chord, null);
    if (!name) continue;
    out.push({
      chord: dominant,
      group: "color",
      technique: "secondary dominant",
      why: `Tonicizes ${name}: its 3rd leads up a half step into ${name}'s root.`,
    });
  }
  return out;
}

function neoRiemannian(current: ChordRef): Suggestion[] {
  const fam = family(current.quality);
  if (fam !== "M" && fam !== "m") return [];
  const major = fam === "M";
  return [
    { chord: rel(current, 0, major ? "m" : "M"), group: "surprise", technique: "parallel (P)", why: "Only the 3rd moves, by a half step: same root, opposite mode." },
    { chord: rel(current, major ? 9 : 3, major ? "m" : "M"), group: "surprise", technique: "relative (R)", why: "Only one note moves, by a whole step." },
    { chord: rel(current, major ? 4 : 8, major ? "m" : "M"), group: "surprise", technique: "leading-tone exchange (L)", why: "Only one note moves, by a half step." },
  ];
}

function mediants(current: ChordRef): Suggestion[] {
  const fam = family(current.quality);
  if (fam !== "M" && fam !== "m") return [];
  const q: Quality = fam === "M" ? "M" : "m";
  return [
    { chord: rel(current, 8, q), group: "surprise", technique: "chromatic mediant", why: "Root falls a major third; one note stays and the rest move a half step." },
    { chord: rel(current, 4, q), group: "surprise", technique: "chromatic mediant", why: "Root rises a major third: a bright, filmic lift." },
  ];
}

function keyedRules(current: ChordRef, key: MusicalKey, sevenths: boolean): Suggestion[] {
  const out: Suggestion[] = [];
  const target = secondaryTarget(current, key);
  if (target) {
    const resolved = fromDegree(target, key, sevenths);
    out.push({ chord: resolved, group: "strong", technique: `resolve to ${target.numeral}`, why: "A secondary dominant resolves down a fifth; its 3rd rises a half step." });
    out.push({ chord: rel(current, 5, "7"), group: "color", technique: "dominant chain", why: "Keep resolving down by fifths, each chord a dominant of the next." });
    const deceptiveRoot = pc(current.root + (family(target.triad) === "m" ? 1 : 2));
    const deceptive = diatonicDegree({ root: deceptiveRoot, quality: "m" }, key) ?? diatonicDegree({ root: deceptiveRoot, quality: "M" }, key);
    if (deceptive) out.push({ chord: fromDegree(deceptive, key, sevenths), group: "color", technique: "deceptive resolution", why: `Sets up ${target.numeral}, then steps somewhere else.` });
    return out;
  }

  const numeral = currentNumeral(current, key);
  if (!numeral) return out;
  for (const group of ["strong", "color"] as const) {
    for (const [targetNumeral, technique, why] of (group === "strong" ? STRONG : COLOR)[key.mode][numeral] ?? []) {
      const d = degreeByNumeral(key.mode, targetNumeral);
      const asSeventh = d && (d.triad === "7" || (sevenths && !RESOLVES_TO_TRIAD.has(technique)));
      if (d) out.push({ chord: fromDegree(d, key, Boolean(asSeventh)), group, technique, why });
    }
  }
  if (NEAPOLITAN_FROM.has(numeral)) {
    const n = degreeByNumeral(key.mode, "bII")!;
    out.push({ chord: fromDegree(n, key, false), group: "surprise", technique: "Neapolitan ♭II", why: "A major chord on the lowered 2nd; follow it with V." });
  }
  return out;
}

function genericRules(current: ChordRef, sevenths: boolean): Suggestion[] {
  const M: Quality = sevenths ? "maj7" : "M";
  const m: Quality = sevenths ? "m7" : "m";
  switch (family(current.quality)) {
    case "M":
      if (current.quality === "7") {
        return [
          { chord: rel(current, 5, M), group: "strong", technique: "resolve down a fifth", why: "The 3rd rises a half step and the 7th falls." },
          { chord: rel(current, 5, m), group: "strong", technique: "resolve to minor", why: "The same resolution into a minor chord." },
          { chord: rel(current, 2, m), group: "color", technique: "deceptive resolution", why: "Sounds like it's resolving, then steps up instead." },
          { chord: rel(current, 5, "7"), group: "color", technique: "dominant chain", why: "Keep resolving down by fifths, each chord a dominant of the next." },
        ];
      }
      return [
        { chord: rel(current, 5, M), group: "strong", technique: "down a fifth", why: "Heard as I → IV: the root stays as the 5th." },
        { chord: rel(current, 7, sevenths ? "7" : "M"), group: "strong", technique: "up a fifth", why: "Heard as I → V: tension that wants to come back." },
        { chord: rel(current, 9, m), group: "strong", technique: "relative minor", why: "Root drops a third and two notes stay." },
        { chord: rel(current, 10, "M"), group: "color", technique: "♭VII", why: "A whole step down, the Mixolydian rock move." },
        { chord: rel(current, 5, "m"), group: "color", technique: "minor iv", why: "The minor subdominant: bittersweet." },
      ];
    case "m":
      return [
        { chord: rel(current, 5, "7"), group: "strong", technique: "as ii → V7", why: "Treats this chord as ii and moves to its dominant." },
        { chord: rel(current, 8, M), group: "strong", technique: "as vi → IV", why: "Root drops a major third; two notes stay." },
        { chord: rel(current, 3, M), group: "strong", technique: "relative major", why: "Root rises a minor third; two notes stay." },
        { chord: rel(current, 5, m), group: "color", technique: "as i → iv", why: "Treats this chord as home and moves to the minor iv." },
      ];
    case "dim":
      return [
        { chord: rel(current, 1, M), group: "strong", technique: "leading-tone resolution", why: "The root rises a half step into a major chord." },
        { chord: rel(current, 1, m), group: "strong", technique: "leading-tone resolution", why: "The root rises a half step into a minor chord." },
      ];
    case "aug":
      return [
        { chord: rel(current, 5, M), group: "strong", technique: "augmented resolves", why: "The raised 5th rises a half step to the next root's 3rd." },
        { chord: rel(current, 9, m), group: "color", technique: "augmented → relative", why: "The raised 5th rises to the 5th of the relative minor." },
      ];
  }
}

interface Progression {
  name: string;
  chords: readonly string[];
  loop: boolean;
}

const PROGRESSIONS: Record<Mode, readonly Progression[]> = {
  major: [
    { name: "ii–V–I", chords: ["ii", "V", "I"], loop: false },
    { name: "I–V–vi–IV (axis)", chords: ["I", "V", "vi", "IV"], loop: true },
    { name: "I–vi–IV–V ('50s)", chords: ["I", "vi", "IV", "V"], loop: true },
    { name: "I–IV–V–I", chords: ["I", "IV", "V", "I"], loop: false },
    { name: "iii–vi–ii–V–I (circle of fifths)", chords: ["iii", "vi", "ii", "V", "I"], loop: false },
    { name: "I–♭VII–IV–I (Mixolydian)", chords: ["I", "bVII", "IV", "I"], loop: false },
    { name: "IV–iv–I (minor plagal)", chords: ["IV", "iv", "I"], loop: false },
    { name: "♭VI–♭VII–I (Mario cadence)", chords: ["bVI", "bVII", "I"], loop: false },
    { name: "Pachelbel's Canon", chords: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"], loop: true },
  ],
  minor: [
    { name: "i–♭VII–♭VI–V (Andalusian)", chords: ["i", "bVII", "bVI", "V"], loop: false },
    { name: "ii°–V–i", chords: ["ii°", "V", "i"], loop: false },
    { name: "i–♭VI–♭III–♭VII (epic)", chords: ["i", "bVI", "bIII", "bVII"], loop: true },
    { name: "i–iv–V–i", chords: ["i", "iv", "V", "i"], loop: false },
  ],
};

/** Known progressions whose opening matches the end of what was just played, longest match first. */
function patternRules(played: readonly ChordRef[], key: MusicalKey, sevenths: boolean): Suggestion[] {
  const numerals = played.map((c) => patternNumeral(c, key));
  const found: { length: number; next: string; name: string }[] = [];
  for (const p of PROGRESSIONS[key.mode]) {
    const n = p.chords.length;
    const rotations = p.loop ? p.chords.map((_, r) => [...p.chords.slice(r), ...p.chords.slice(0, r)]) : [p.chords];
    for (const seq of rotations) {
      // Two chords of a four-chord loop is too weak a signal (any I–V would match the axis progression).
      for (let k = Math.min(p.loop ? n : n - 1, numerals.length); k >= (p.loop ? 3 : 2); k--) {
        const tail = numerals.slice(-k);
        if (tail.every((x, i) => x === seq[i])) {
          found.push({ length: k, next: seq[k % n], name: p.name });
          break;
        }
      }
    }
  }
  found.sort((a, b) => b.length - a.length);
  const out: Suggestion[] = [];
  for (const f of found) {
    const d = degreeByNumeral(key.mode, f.next);
    if (!d) continue;
    out.push({ chord: fromDegree(d, key, sevenths || d.triad === "7"), group: "strong", technique: `continues ${f.name}`, why: `You've played ${f.length} chords of ${f.name}; this is the next one.` });
  }
  return out;
}

/** Where the current chord can go, grouped from expected to adventurous, with `history` oldest first. */
export function suggestNext(current: ChordRef, key: MusicalKey | null, history: readonly ChordRef[] = []): Suggestion[] {
  const sevenths = isSeventh(current.quality);
  const raw: Suggestion[] = [];
  if (key) raw.push(...patternRules([...history, current], key, sevenths), ...keyedRules(current, key, sevenths));
  if (!raw.some((s) => s.group === "strong")) raw.push(...genericRules(current, sevenths));

  const strong = raw.filter((s) => s.group === "strong");
  raw.push(...secondaryDominants(strong.slice(0, 3), key, current));
  const dominant = strong.find((s) => isDominantTarget(s, key, current));
  if (dominant) {
    raw.push({ chord: rel(dominant.chord, 6, "7"), group: "surprise", technique: "tritone substitution", why: `Stands in for ${chordSymbol(dominant.chord, key)}: same tritone, and the bass then slides down a half step.` });
  }
  raw.push(...mediants(current), ...neoRiemannian(current));

  const currentPcs = chordPitchClasses(current);
  const previous = history.at(-1);
  const seen: number[][] = [];
  const kept: Suggestion[] = [];
  for (const s of raw) {
    const pcs = chordPitchClasses(s.chord);
    if (samePitchClasses(pcs, currentPcs) || seen.some((p) => samePitchClasses(p, pcs))) continue;
    seen.push(pcs);
    // Going back is the point of a strong move (V → I after I → V), so only the other groups demote it.
    const back = s.group !== "strong" && previous !== undefined && samePitchClasses(pcs, chordPitchClasses(previous));
    kept.push(back ? { ...s, back } : s);
  }

  // With few slots per column, show one of each technique before a second of any:
  // borrowed ♭VII, a secondary dominant, then borrowed iv, rather than three borrowed chords.
  const groups: Group[] = ["strong", "color", "surprise"];
  return groups.flatMap((g) => {
    const seenKinds = new Map<string, number>();
    return kept
      .filter((s) => s.group === g)
      .map((s) => {
        const kind = s.technique.split(" ")[0];
        const repeat = seenKinds.get(kind) ?? 0;
        seenKinds.set(kind, repeat + 1);
        return { s, rank: (s.back ? 100 : 0) + (g === "strong" ? 0 : repeat) };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, PER_GROUP)
      .map(({ s }) => s);
  });
}

// --- Board: suggestions ready to draw -----------------------------------------------

export interface Card extends Suggestion {
  symbol: string;
  roman: string | null;
  voicing: Voicing;
  /** Pitch-class names for this chord's notes. */
  spelling: string[];
  /** The top strong moves from this chord: one step of branching. */
  then: string[];
}

/** Symbol and numeral for a chord as the engine understood it, with the bass actually played. */
export function describeChord(chord: ChordRef, notes: readonly number[], key: MusicalKey | null): { symbol: string; roman: string | null } {
  const base = chordSymbol(chord, key);
  const spelling = chordSpelling(base, key);
  const bass = pc(Math.min(...notes));
  const symbol = bass === chord.root ? base : `${base}/${spelling[bass]}`;
  return { symbol, roman: key ? functionLabel(symbol, key, spelling) : null };
}

export function buildBoard(current: PlayedChord, history: readonly PlayedChord[], key: MusicalKey | null): Card[] {
  const past = history.map((h) => h.chord);
  return suggestNext(current.chord, key, past).map((s) => {
    const spelling = chordSpelling(chordSymbol(s.chord, key), key);
    const voicing = voiceLead(current.notes, chordPitchClasses(s.chord), s.chord.root);
    const { symbol, roman } = describeChord(s.chord, voicing.notes, key);
    const then = suggestNext(s.chord, key, [...past, current.chord])
      .filter((n) => n.group === "strong")
      .slice(0, 2)
      .map((n) => chordSymbol(n.chord, key));
    return { ...s, symbol, roman, voicing, spelling, then };
  });
}
