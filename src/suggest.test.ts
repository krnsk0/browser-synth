import { describe, expect, it } from "vitest";
import { readChord } from "./chords";
import { chordSymbol, parseChordSymbol, rootName, type ChordRef } from "./harmony";
import type { MusicalKey } from "./keys";
import { MidiLearn } from "./midiLearn";
import { sanitizePlayback } from "./playback";
import { ProgressionTracker } from "./progression";
import { buildBoard, suggestNext } from "./suggest";
import { voiceLead } from "./voiceLeading";

const C: MusicalKey = { tonic: "C", mode: "major" };
const Am: MusicalKey = { tonic: "A", mode: "minor" };
const ref = (symbol: string) => parseChordSymbol(symbol)!;
const symbols = (chords: ChordRef[], key: MusicalKey | null = C) => chords.map((c) => chordSymbol(c, key));

describe("parseChordSymbol", () => {
  it("reduces chords to the triad or seventh they function as", () => {
    expect(parseChordSymbol("C")).toEqual({ root: 0, quality: "M" });
    expect(parseChordSymbol("Cmaj9#11/E")).toEqual({ root: 0, quality: "maj7" });
    expect(parseChordSymbol("G7sus4")).toEqual({ root: 7, quality: "7" });
    expect(parseChordSymbol("Bm7b5")).toEqual({ root: 11, quality: "m7b5" });
    expect(parseChordSymbol("Bdim7")).toEqual({ root: 11, quality: "dim7" });
    expect(parseChordSymbol("Am6")).toEqual({ root: 9, quality: "m" });
    expect(parseChordSymbol("D7/A")).toEqual({ root: 2, quality: "7" });
    expect(parseChordSymbol("C5")).toBeNull();
  });
});

describe("rootName", () => {
  it("spells roots by scale degree", () => {
    expect(rootName(10, { tonic: "D", mode: "major" })).toBe("Bb");
    expect(rootName(6, { tonic: "G#", mode: "minor" })).toBe("F#");
    expect(rootName(1, null)).toBe("Db");
  });
});

describe("secondary dominants in the chord readout", () => {
  const roman = (notes: number[], key = C) => readChord(notes, key)?.roman;
  it("names a dominant by its target", () => {
    expect(roman([62, 66, 69, 72])).toBe("V7/V");
    expect(roman([57, 61, 64, 67])).toBe("V7/ii");
    expect(roman([54, 60, 62, 69])).toBe("V⁶₅/V");
    expect(roman([57, 61, 64, 67], Am)).toBe("V7/iv");
  });
  it("keeps borrowed dominants and tritone subs as numerals", () => {
    expect(roman([58, 62, 65, 68])).toBe("bVII7");
    expect(roman([61, 65, 68, 71])).toBe("bII7");
    expect(roman([55, 59, 62, 65])).toBe("V7");
  });
});

describe("suggestNext", () => {
  const groups = (current: string, key: MusicalKey | null = C, history: string[] = []) => {
    const out = suggestNext(ref(current), key, history.map(ref));
    return {
      strong: symbols(out.filter((s) => s.group === "strong").map((s) => s.chord), key),
      color: symbols(out.filter((s) => s.group === "color").map((s) => s.chord), key),
      surprise: symbols(out.filter((s) => s.group === "surprise").map((s) => s.chord), key),
      all: out,
    };
  };

  it("resolves V7 home first, with the deceptive cadence as color", () => {
    const g = groups("G7");
    expect(g.strong[0]).toBe("C");
    expect(g.color).toContain("Am7");
    expect(groups("G7", C, ["C"]).all[0].technique).toBe("authentic cadence");
  });

  it("matches the quality the player is using", () => {
    expect(groups("Dm").strong[0]).toBe("G");
    expect(groups("Dm7").strong[0]).toBe("G7");
  });

  it("offers borrowed chords and a tritone sub from ii", () => {
    const g = groups("Dm7");
    expect(g.color).toContain("Bb7");
    expect(g.surprise).toContain("Db7");
  });

  it("resolves a secondary dominant to its target", () => {
    const g = groups("D7");
    expect(g.strong[0]).toBe("G7");
    expect(g.all[0].technique).toBe("resolve to V");
  });

  it("works in minor keys", () => {
    const g = groups("E7", Am);
    expect(g.strong[0]).toBe("Am");
    expect(g.color).toContain("Fmaj7");
  });

  it("continues known progressions from the history", () => {
    expect(groups("G", C, ["Dm"]).all[0].technique).toBe("continues ii–V–I");
    const axis = groups("F", C, ["C", "G", "Am"]).all[0];
    expect(axis.technique).toBe("continues I–V–vi–IV (axis)");
    expect(chordSymbol(axis.chord, C)).toBe("C");
  });

  it("sorts the chord you just came from last, except as a strong move", () => {
    expect(groups("C", null).surprise).toContain("Cm");
    expect(groups("C", null, ["Cm"]).surprise).not.toContain("Cm");
    expect(groups("G7", C, ["C"]).all.some((s) => s.back)).toBe(false);
  });

  it("still suggests without a key", () => {
    const g = groups("C", null);
    expect(g.strong).toEqual(["F", "G", "Am"]);
    expect(g.surprise.length).toBeGreaterThan(0);
  });

  it("never suggests the current chord or the same notes twice", () => {
    const out = suggestNext(ref("C"), C);
    const keys = out.map((s) => chordSymbol(s.chord, C));
    expect(keys).not.toContain("C");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("voiceLead", () => {
  it("moves each voice to the nearest chord tone", () => {
    const v = voiceLead([60, 64, 67], [5, 9, 0], 5);
    expect(v.notes).toEqual([60, 65, 69]);
    expect(v.distance).toBe(3);
  });

  it("adds tones the held voices can't cover", () => {
    const v = voiceLead([60, 64, 67], [7, 11, 2, 5], 7);
    expect(v.distance).toBe(2);
    expect(v.notes).toContain(67);
    expect(v.moves.filter((m) => m.from === null)).toHaveLength(1);
    expect(new Set(v.notes.map((n) => n % 12))).toEqual(new Set([7, 11, 2, 5]));
  });

  it("keeps the classic ii–V–I guide-tone motion", () => {
    const v = voiceLead([53, 60, 62, 65], [7, 11, 2, 5], 7);
    expect(v.distance).toBeLessThanOrEqual(3);
  });

  it("handles big clusters", () => {
    const v = voiceLead([48, 52, 55, 59, 62, 64, 67, 71, 74], [5, 9, 0], 5);
    expect(new Set(v.notes.map((n) => n % 12))).toEqual(new Set([5, 9, 0]));
  });
});

describe("ProgressionTracker", () => {
  it("only adds chords to the progression on commit", () => {
    const t = new ProgressionTracker();
    t.play(ref("C"), [60, 64, 67], 0);
    expect(t.history).toHaveLength(0);
    expect(t.anchor?.chord).toEqual(ref("C"));
    t.commit();
    t.play(ref("F"), [60, 65, 69], 2000);
    t.play(ref("Am"), [60, 64, 69], 4000);
    expect(t.history.map((h) => h.chord)).toEqual([ref("C")]);
    expect(t.anchor?.chord).toEqual(ref("C"));
    expect(t.candidate?.chord).toEqual(ref("Am"));
    t.commit();
    expect(t.history.map((h) => h.chord)).toEqual([ref("C"), ref("Am")]);
    expect(t.candidate).toBeNull();
    expect(t.commit()).toBeNull();
  });

  it("merges a chord still being built and follows revoicings", () => {
    const t = new ProgressionTracker();
    t.play(ref("C"), [60, 64, 67], 0);
    expect(t.play(ref("Cmaj7"), [60, 64, 67, 71], 100)).toBe("extended");
    expect(t.play(ref("Cmaj7"), [64, 67, 71, 72], 2000)).toBe("revoiced");
    expect(t.candidate?.notes).toEqual([64, 67, 71, 72]);
  });

  it("revoices instead of repeating when the same chord is committed twice", () => {
    const t = new ProgressionTracker();
    t.play(ref("C"), [60, 64, 67], 0);
    t.commit();
    t.play(ref("C"), [64, 67, 72], 1000);
    t.commit();
    expect(t.history).toHaveLength(1);
    expect(t.history[0].notes).toEqual([64, 67, 72]);
  });

  it("undoes the last committed chord", () => {
    const t = new ProgressionTracker();
    for (const [s, notes, at] of [["C", [60, 64, 67], 0], ["G", [59, 62, 67], 1000]] as const) {
      t.play(ref(s), notes, at);
      t.commit();
    }
    expect(t.undo()?.chord).toEqual(ref("G"));
    expect(t.history.map((h) => h.chord)).toEqual([ref("C")]);
    t.undo();
    expect(t.undo()).toBeNull();
  });
});

describe("saved progressions", () => {
  it("restores history and candidate through JSON, dropping bad entries", () => {
    const t = new ProgressionTracker();
    t.play(ref("C"), [60, 64, 67], 0);
    t.commit();
    t.play(ref("G7"), [59, 62, 65, 67], 1000);
    t.candidate!.via = "dominant";
    const saved = JSON.parse(JSON.stringify(t.snapshot()));
    saved.history.push({ chord: { root: 14, quality: "M" }, notes: [60] }, "junk");

    const restored = new ProgressionTracker();
    restored.restore(saved);
    expect(restored.history.map((h) => h.chord)).toEqual([ref("C")]);
    expect(restored.candidate).toMatchObject({ chord: ref("G7"), notes: [59, 62, 65, 67], via: "dominant" });
    // A fresh chord right after reload is new, not merged into the restored candidate.
    expect(restored.play(ref("Cmaj7"), [59, 60, 62, 64, 65, 67], 10)).toBe("new");
  });

  it("ignores garbage", () => {
    const t = new ProgressionTracker();
    t.restore("nope");
    expect(t.snapshot()).toEqual({ history: [], candidate: null });
  });
});

describe("MidiLearn actions", () => {
  it("binds a button to Commit and remembers it", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const learn = new MidiLearn(store);
    learn.arm("commit");
    expect(learn.handleCc({ channel: 1, controller: 102 })).toBe("commit");
    expect(new MidiLearn(store).sourceFor("commit")).toEqual({ channel: 1, controller: 102 });
  });
});

describe("playback settings", () => {
  it("clamps tempo and snaps beats per chord", () => {
    expect(sanitizePlayback({ bpm: 500, beatsPerChord: 3 })).toEqual({ bpm: 200, beatsPerChord: 4 });
    expect(sanitizePlayback({ bpm: 72.4, beatsPerChord: 2 })).toEqual({ bpm: 72, beatsPerChord: 2 });
    expect(sanitizePlayback(null)).toEqual({ bpm: 90, beatsPerChord: 4 });
  });
});

describe("buildBoard", () => {
  it("labels cards with voicings, numerals and next steps", () => {
    const cards = buildBoard({ chord: ref("G7"), notes: [55, 59, 62, 65], at: 0 }, [], C);
    const home = cards[0];
    expect(home.symbol).toMatch(/^C(\/|$)/);
    expect(home.roman).toMatch(/^I/);
    expect(home.then.length).toBeGreaterThan(0);
    const a7 = buildBoard({ chord: ref("C"), notes: [60, 64, 67], at: 0 }, [], C).find((c) => c.technique === "secondary dominant");
    expect(a7?.roman).toMatch(/^V/);
  });
});
