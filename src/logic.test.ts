import { describe, expect, it } from "vitest";
import { noteForCode } from "./input/computerKeyboard";
import { parseMidi } from "./input/midi";
import { MidiLearn, type KeyValueStore } from "./midiLearn";
import { PARAMS, PARAM_BY_ID, defaultValues, fromNormalized, toNormalized } from "./params";
import { PatchStore, patchesEqual, sanitizePatch } from "./patches";
import { driveAmount, driveCurve, makeupGain, shape } from "./audio/drive";
import { readChord } from "./chords";
import { KEYS, keySpelling, parseKey } from "./keys";
import { envelopePoints } from "./ui/envelopeView";
import { noteName } from "./ui/noteNames";

class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("params", () => {
  it("round-trips every param through normalized space", () => {
    for (const def of PARAMS) {
      expect(fromNormalized(def, toNormalized(def, def.defaultValue))).toBeCloseTo(def.defaultValue, 6);
    }
  });

  it("maps exponential params geometrically", () => {
    const cutoff = PARAM_BY_ID.cutoff;
    expect(fromNormalized(cutoff, 0)).toBeCloseTo(40);
    expect(fromNormalized(cutoff, 1)).toBeCloseTo(16000);
    expect(fromNormalized(cutoff, 0.5)).toBeCloseTo(Math.sqrt(40 * 16000));
  });

  it("snaps stepped params to whole steps", () => {
    const wave = PARAM_BY_ID.wave;
    expect(fromNormalized(wave, 0)).toBe(0);
    expect(fromNormalized(wave, 0.4)).toBe(1);
    expect(fromNormalized(wave, 1)).toBe(3);
    expect(wave.format(fromNormalized(wave, 0.7))).toBe("Triangle");
    expect(sanitizePatch({ wave: 1.6 }).wave).toBe(2);
  });

  it("clamps out-of-range input", () => {
    expect(fromNormalized(PARAM_BY_ID.sustain, 2)).toBe(1);
    expect(toNormalized(PARAM_BY_ID.sustain, -1)).toBe(0);
  });
});

describe("computer keyboard", () => {
  it("uses Ableton's layout with middle C on A at octave 4", () => {
    expect(noteForCode("KeyA", 4)).toBe(60);
    expect(noteForCode("KeyW", 4)).toBe(61);
    expect(noteForCode("KeyK", 4)).toBe(72);
    expect(noteForCode("Semicolon", 4)).toBe(76);
    expect(noteForCode("KeyA", 3)).toBe(48);
  });

  it("ignores unmapped keys and notes above 127", () => {
    expect(noteForCode("KeyQ", 4)).toBeUndefined();
    expect(noteForCode("Semicolon", 9)).toBeUndefined();
  });
});

describe("parseMidi", () => {
  it("parses note on with 1-based channel", () => {
    expect(parseMidi([0x91, 60, 100])).toEqual({ type: "noteon", channel: 2, note: 60, velocity: 100 });
  });

  it("treats note on with velocity 0 as note off", () => {
    expect(parseMidi([0x90, 60, 0])).toEqual({ type: "noteoff", channel: 1, note: 60 });
  });

  it("parses note off and CC", () => {
    expect(parseMidi([0x80, 64, 40])).toEqual({ type: "noteoff", channel: 1, note: 64 });
    expect(parseMidi([0xb0, 21, 127])).toEqual({ type: "cc", channel: 1, controller: 21, value: 127 });
  });

  it("ignores short and unhandled messages", () => {
    expect(parseMidi([0xf8])).toBeNull();
    expect(parseMidi([0xe0, 0, 64])).toBeNull();
  });
});

describe("MidiLearn", () => {
  it("binds the next CC to the armed param and persists it", () => {
    const store = new MemoryStore();
    const learn = new MidiLearn(store);
    learn.arm("cutoff");
    expect(learn.handleCc({ channel: 1, controller: 21 })).toBe("cutoff");
    expect(learn.armed).toBeNull();
    expect(learn.handleCc({ channel: 1, controller: 21 })).toBe("cutoff");
    expect(learn.handleCc({ channel: 2, controller: 21 })).toBeNull();
    expect(new MidiLearn(store).sourceFor("cutoff")).toEqual({ channel: 1, controller: 21 });
  });

  it("moves a param to a new CC and lets a CC change owner", () => {
    const learn = new MidiLearn(new MemoryStore());
    learn.arm("cutoff");
    learn.handleCc({ channel: 1, controller: 21 });
    learn.arm("cutoff");
    learn.handleCc({ channel: 1, controller: 22 });
    expect(learn.handleCc({ channel: 1, controller: 21 })).toBeNull();

    learn.arm("resonance");
    learn.handleCc({ channel: 1, controller: 22 });
    expect(learn.sourceFor("cutoff")).toBeUndefined();
    expect(learn.sourceFor("resonance")).toEqual({ channel: 1, controller: 22 });
  });

  it("survives corrupt storage", () => {
    const store = new MemoryStore();
    store.setItem("browser-synth:midi-map:v1", "{not json");
    expect(new MidiLearn(store).sourceFor("cutoff")).toBeUndefined();
  });
});

describe("patches", () => {
  it("sanitizes partial, invalid, and out-of-range data", () => {
    const patch = sanitizePatch({ cutoff: 99999, resonance: "loud", sustain: 0.5 });
    expect(patch.cutoff).toBe(16000);
    expect(patch.resonance).toBe(PARAM_BY_ID.resonance.defaultValue);
    expect(patch.sustain).toBe(0.5);
    expect(sanitizePatch(null)).toEqual(defaultValues());
  });

  it("saves, lists, loads, and deletes named patches across instances", () => {
    const store = new MemoryStore();
    const patches = new PatchStore(store);
    patches.save("pad", { ...defaultValues(), attack: 1.5 });
    patches.save("bass", { ...defaultValues(), cutoff: 300 });
    const reloaded = new PatchStore(store);
    expect(reloaded.names()).toEqual(["bass", "pad"]);
    expect(reloaded.get("pad")?.attack).toBe(1.5);
    reloaded.delete("pad");
    expect(new PatchStore(store).names()).toEqual(["bass"]);
  });

  it("returns copies so edits don't leak into saved patches", () => {
    const patches = new PatchStore(new MemoryStore());
    patches.save("a", defaultValues());
    const loaded = patches.get("a")!;
    loaded.cutoff = 100;
    expect(patches.get("a")?.cutoff).toBe(PARAM_BY_ID.cutoff.defaultValue);
  });

  it("compares patches with float tolerance", () => {
    const a = defaultValues();
    expect(patchesEqual(a, { ...a, cutoff: a.cutoff + 1e-9 })).toBe(true);
    expect(patchesEqual(a, { ...a, cutoff: a.cutoff + 10 })).toBe(false);
  });

  it("defaults detune to zero", () => {
    expect(defaultValues().detune).toBe(0);
  });
});

describe("readChord", () => {
  const symbol = (notes: number[]) => readChord(notes)?.symbol;

  it("names triads and sevenths with lead-sheet symbols", () => {
    expect(symbol([60, 64, 67])).toBe("C");
    expect(symbol([60, 63, 67, 70])).toBe("Cm7");
    expect(symbol([62, 66, 69, 72])).toBe("D7");
    expect(symbol([60, 64, 67, 74])).toBe("Cadd9");
    expect(symbol([66, 70, 73])).toBe("F#");
  });

  it("prefers inversions over altered spellings", () => {
    expect(symbol([64, 67, 72])).toBe("C/E");
    expect(symbol([55, 60, 64])).toBe("C/G");
    expect(readChord([60, 64, 67])?.alternatives).toEqual([]);
  });

  it("assumes the fifth for shell voicings", () => {
    expect(symbol([60, 64, 70])).toBe("C7");
  });

  it("describes chords, intervals, notes, and clusters", () => {
    expect(readChord([64, 67, 72])?.name).toBe("C major over E");
    expect(readChord([60, 64, 67, 74])?.name).toBe("Cadd9");
    expect(readChord([60, 64])).toMatchObject({ kind: "interval", symbol: "M3" });
    expect(readChord([60])).toMatchObject({ kind: "note", symbol: "C", name: "C4" });
    expect(readChord([60, 72])).toMatchObject({ kind: "note", name: "octaves" });
    expect(readChord([60, 61, 62])?.kind).toBe("unknown");
    expect(readChord([])).toBeNull();
  });
});

describe("keys and roman numerals", () => {
  const C = parseKey("C major");
  const Am = parseKey("A minor");
  const roman = (notes: number[], key = C) => readChord(notes, key)?.roman;

  it("parses and lists all 24 keys", () => {
    expect(KEYS).toHaveLength(24);
    expect(parseKey("Bb major")).toEqual({ tonic: "Bb", mode: "major" });
    expect(parseKey("nope")).toBeNull();
  });

  it("spells notes for the key", () => {
    expect(keySpelling(parseKey("F major"))[10]).toBe("Bb");
    expect(keySpelling(parseKey("E major"))[8]).toBe("G#");
    expect(keySpelling(parseKey("F# major"))[5]).toBe("E#");
    expect(keySpelling(parseKey("Eb minor"))[11]).toBe("Cb");
    expect(readChord([56, 59, 63], parseKey("E major"))?.symbol).toBe("G#m");
  });

  it("names diatonic chords with case for quality", () => {
    expect(roman([60, 64, 67])).toBe("I");
    expect(roman([62, 65, 69, 72])).toBe("ii7");
    expect(roman([55, 59, 62, 65])).toBe("V7");
    expect(roman([59, 62, 65])).toBe("vii°");
    expect(roman([59, 62, 65, 69])).toBe("viiø7");
  });

  it("marks inversions with figured bass", () => {
    expect(roman([64, 67, 72])).toBe("I⁶");
    expect(roman([55, 60, 64])).toBe("I⁶₄");
    expect(roman([59, 62, 65, 67])).toBe("V⁶₅");
    expect(roman([62, 65, 67, 71])).toBe("V⁴₃");
    expect(roman([53, 59, 62, 67])).toBe("V⁴₂");
  });

  it("shows borrowed chords against the tonic's major scale, in both modes", () => {
    expect(roman([58, 62, 65])).toBe("bVII");
    expect(roman([53, 56, 60])).toBe("iv");
    expect(roman([57, 60, 64], Am)).toBe("i");
    expect(roman([60, 64, 67], Am)).toBe("bIII");
    expect(roman([52, 56, 59, 62], Am)).toBe("V7");
  });

  it("gives scale degrees for single notes and nothing without a key", () => {
    expect(roman([67])).toBe("5");
    expect(roman([63])).toBe("b3");
    expect(readChord([60, 64, 67])?.roman).toBeNull();
  });
});

describe("envelopePoints", () => {
  it("starts silent, peaks after attack, holds sustain, and ends near zero", () => {
    const pts = envelopePoints({ attack: 0.1, decay: 0.5, sustain: 0.6, release: 1 });
    expect(pts[0][1]).toBe(0);
    expect(pts[1][1]).toBe(1);
    expect(pts.some(([, level]) => Math.abs(level - 0.6) < 1e-9)).toBe(true);
    expect(pts[pts.length - 1][1]).toBeLessThan(0.01);
    for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThanOrEqual(pts[i - 1][0]);
  });
});

describe("drive curve", () => {
  it("is near-linear at zero drive", () => {
    const k = driveAmount(0);
    for (const x of [-0.8, -0.2, 0.1, 0.5]) expect(shape(x, k)).toBeCloseTo(x, 3);
  });

  it("is monotonic, bounded, and clips the negative half more gently", () => {
    const k = driveAmount(0.6);
    expect(shape(1, k)).toBeCloseTo(1);
    expect(shape(-1, k)).toBeCloseTo(-1);
    expect(shape(0.3, k)).toBeGreaterThan(-shape(-0.3, k));
    const curve = driveCurve(0.6);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });

  it("compensates level so more drive isn't just louder", () => {
    for (const d of [0, 0.3, 1]) expect(makeupGain(d) * shape(0.25 * 0.35, driveAmount(d))).toBeCloseTo(0.25, 5);
  });
});

describe("noteName", () => {
  it("uses scientific pitch", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("Db4");
    expect(noteName(66)).toBe("F#4");
    expect(noteName(36)).toBe("C2");
  });
});
