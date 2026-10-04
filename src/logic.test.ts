import { describe, expect, it } from "vitest";
import { noteForCode } from "./input/computerKeyboard";
import { parseMidi } from "./input/midi";
import { MidiLearn, type KeyValueStore } from "./midiLearn";
import { PARAMS, PARAM_BY_ID, defaultValues, fromNormalized, toNormalized } from "./params";
import { PatchStore, patchesEqual, sanitizePatch } from "./patches";
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

describe("noteName", () => {
  it("uses scientific pitch", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(36)).toBe("C2");
  });
});
