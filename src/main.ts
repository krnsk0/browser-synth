import { Synth } from "./audio/synth";
import { readChord, type ChordReading } from "./chords";
import { chordPitchClasses, parseChordSymbol, samePitchClasses } from "./harmony";
import { KEYS, keyId, keySpelling, parseKey } from "./keys";
import { ProgressionTracker, type PlayedChord } from "./progression";
import { buildBoard, describeChord, type Card } from "./suggest";
import { SuggestView, type PedalMode, type StripChord } from "./ui/suggestView";
import { ComputerKeyboard } from "./input/computerKeyboard";
import { connectMidi, type MidiMessage, type MidiStatus } from "./input/midi";
import { MidiLearn, isAction, type ActionId, type LearnTarget } from "./midiLearn";
import { Playback, sanitizePlayback } from "./playback";
import { PARAMS, PARAM_BY_ID, defaultValues, fromNormalized, toNormalized, type ParamGroup, type ParamId, type ParamValues } from "./params";
import { PatchStore, patchesEqual, sanitizePatch } from "./patches";
import { EnvelopeView } from "./ui/envelopeView";
import { KeyboardView } from "./ui/keyboard";
import { noteName } from "./ui/noteNames";

const WORKING_PATCH_KEY = "browser-synth:patch:v1";
const PATCH_NAME_KEY = "browser-synth:patch-name:v1";
const KEYBOARD_KEY = "browser-synth:keyboard:v1";
const KEY_KEY = "browser-synth:key:v1";
const MODE_KEY = "browser-synth:mode:v1";
const PEDAL_KEY = "browser-synth:pedal:v1";
const PLAYBACK_KEY = "browser-synth:playback:v1";
const PROGRESSION_KEY = "browser-synth:progression:v1";
const SUSTAIN_CC = 64;
const ALL_NOTES_OFF_CC = 123;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

const synth = new Synth();
const learn = new MidiLearn(localStorage);
const patches = new PatchStore(localStorage);
const values = sanitizePatch(readJson(WORKING_PATCH_KEY));
let patchName = localStorage.getItem(PATCH_NAME_KEY) ?? "";
if (patchName && !patches.get(patchName)) patchName = "";
for (const def of PARAMS) synth.setParam(def.id, values[def.id]);

// --- Controls ---------------------------------------------------------------

interface ControlEls {
  root: HTMLElement;
  slider: HTMLInputElement;
  value: HTMLElement;
  learnButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
}

const controls = new Map<ParamId, ControlEls>();
let saveTimer: number | undefined;

function setParam(id: ParamId, value: number, source: "slider" | "external"): void {
  const def = PARAM_BY_ID[id];
  values[id] = value;
  synth.setParam(id, value);
  const els = controls.get(id);
  if (els) {
    els.value.textContent = def.format(value);
    if (source === "external") els.slider.value = String(toNormalized(def, value));
  }
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => localStorage.setItem(WORKING_PATCH_KEY, JSON.stringify(values)), 250);
  renderPatchModified();
  renderEnvelopes();
}

let envelopeView: EnvelopeView | undefined;

function renderEnvelopes(): void {
  envelopeView?.update({ attack: values.attack, decay: values.decay, sustain: values.sustain, release: values.release });
}

function learnLabel(id: LearnTarget): string {
  const source = learn.sourceFor(id);
  if (learn.armed === id) return "move…";
  return source ? `CC ${source.controller}${source.channel === 1 ? "" : ` · ch ${source.channel}`}` : "learn";
}

/** Set once Suggest mode exists, so its Commit/Undo learn buttons update with the rest. */
let onLearnChange: (() => void) | null = null;

function renderLearnState(): void {
  document.body.classList.toggle("learning", learn.armed !== null);
  for (const [id, els] of controls) {
    const source = learn.sourceFor(id);
    els.root.classList.toggle("armed", learn.armed === id);
    els.learnButton.textContent = learnLabel(id);
    els.learnButton.classList.toggle("bound", Boolean(source));
    els.clearButton.hidden = !source;
  }
  onLearnChange?.();
}

const LAYOUT: readonly (readonly ParamGroup[])[] = [["Oscillator", "Filter"], ["Amp Env", "Drive"], ["Reverb", "Output"]];

function buildControls(container: HTMLElement): void {
  const groups = new Map<ParamGroup, HTMLElement>();
  for (const columnGroups of LAYOUT) {
    const column = document.createElement("div");
    column.className = "column";
    for (const name of columnGroups) {
      const group = document.createElement("fieldset");
      group.className = "group";
      if (PARAMS.filter((p) => p.group === name).length >= 4) group.classList.add("wide");
      const legend = document.createElement("legend");
      legend.textContent = name;
      group.append(legend);
      if (name === "Amp Env") envelopeView = new EnvelopeView(group);
      groups.set(name, group);
      column.append(group);
    }
    container.append(column);
  }

  for (const def of PARAMS) {
    const group = groups.get(def.group)!;

    const root = document.createElement("div");
    root.className = `control control-${def.id}`;

    const label = document.createElement("label");
    label.textContent = def.label;
    label.htmlFor = `param-${def.id}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `param-${def.id}`;
    slider.min = "0";
    slider.max = "1";
    slider.step = def.curve === "stepped" ? String(1 / (def.max - def.min)) : "0.001";
    slider.value = String(toNormalized(def, values[def.id]));
    slider.addEventListener("input", () => setParam(def.id, fromNormalized(def, Number(slider.value)), "slider"));
    slider.addEventListener("dblclick", () => setParam(def.id, def.defaultValue, "external"));

    const value = document.createElement("output");
    value.className = "value";
    value.textContent = def.format(values[def.id]);

    const learnButton = document.createElement("button");
    learnButton.type = "button";
    learnButton.className = "learn";
    learnButton.addEventListener("click", () => {
      learn.arm(learn.armed === def.id ? null : def.id);
      renderLearnState();
    });

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "clear";
    clearButton.textContent = "×";
    clearButton.title = "Remove mapping";
    clearButton.addEventListener("click", () => {
      learn.clear(def.id);
      renderLearnState();
    });

    const mapping = document.createElement("div");
    mapping.className = "mapping";
    mapping.append(learnButton, clearButton);

    root.append(label, value, slider, mapping);
    group.append(root);
    controls.set(def.id, { root, slider, value, learnButton, clearButton });
  }
  renderLearnState();
  renderEnvelopes();
}

buildControls($("controls"));

// --- Patches ----------------------------------------------------------------

const patchSelect = $<HTMLSelectElement>("patch-select");
const INIT_LABEL = "Init";

function isModified(): boolean {
  return !patchesEqual(values, patches.get(patchName) ?? defaultValues());
}

function renderPatchModified(): void {
  $("patch-modified").hidden = !isModified();
}

function renderPatchBar(): void {
  patchSelect.replaceChildren(new Option(INIT_LABEL, ""), ...patches.names().map((name) => new Option(name, name)));
  patchSelect.value = patchName;
  $<HTMLButtonElement>("patch-delete").disabled = !patchName;
  renderPatchModified();
}

function selectPatch(name: string): void {
  patchName = name;
  localStorage.setItem(PATCH_NAME_KEY, name);
  renderPatchBar();
}

function applyPatch(next: ParamValues): void {
  for (const def of PARAMS) setParam(def.id, next[def.id], "external");
}

function saveAs(): void {
  const name = window.prompt("Patch name", patchName || "")?.trim();
  if (!name || name === INIT_LABEL) return;
  if (name !== patchName && patches.get(name) && !window.confirm(`Overwrite "${name}"?`)) return;
  patches.save(name, values);
  selectPatch(name);
}

patchSelect.addEventListener("change", () => {
  const next = patchSelect.value;
  if (isModified() && !window.confirm("Discard unsaved changes to this patch?")) {
    patchSelect.value = patchName;
    return;
  }
  selectPatch(next);
  applyPatch(patches.get(next) ?? defaultValues());
  patchSelect.blur();
});

$("patch-save").addEventListener("click", () => {
  if (!patchName) return saveAs();
  patches.save(patchName, values);
  renderPatchModified();
});

$("patch-save-as").addEventListener("click", saveAs);

$("patch-delete").addEventListener("click", () => {
  if (!patchName || !window.confirm(`Delete "${patchName}"?`)) return;
  patches.delete(patchName);
  selectPatch("");
});

renderPatchBar();

window.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
  if (viewMode === "suggest" && !typing && !e.repeat && (e.key === "Enter" || e.key === "Backspace")) {
    e.preventDefault();
    if (e.key === "Enter") commitChord();
    else undoChord();
    return;
  }
  if (e.key === "Escape" && learn.armed) {
    learn.arm(null);
    renderLearnState();
  }
});

// --- Notes ------------------------------------------------------------------

const keyboardView = new KeyboardView($("keyboard"), {
  lowest: 36,
  highest: 84,
  noteOn: (note) => synth.noteOn(note, 100),
  noteOff: (note) => synth.noteOff(note),
});

const chordPanel = $("chord-panel");

const keySelect = $<HTMLSelectElement>("key-select");
let musicalKey = parseKey(localStorage.getItem(KEY_KEY));
let lastHeldCount = 0;
let shownNotes: number[] = [];

/** Display-only: lead sheets print ♭ and ♯, Tonal's symbols use b and #. */
const pretty = (text: string) =>
  text
    // Note names (Bb, Abmaj7), numerals and degrees (bVII, b3, V/bVI), and alterations (m7b5);
    // never the b that starts a word like "borrowed".
    .replace(/([A-G])b/g, "$1♭")
    .replace(/(^|[\s/(])b(?=\d|[IViv]+(?:$|[^a-z]|m|dim|aug))/g, "$1♭")
    .replace(/(\d)b(?=\d)/g, "$1♭")
    .replace(/#/g, "♯");

/** Roman first: its box sets how much width is left for the symbol. */
const FIT_TEXT = ["chord-roman", "chord-symbol"];

/**
 * Shrinks the big readouts so long symbols like Cmaj9♯11/E fit their box.
 * The box's CSS height is the largest size, so each mode sets its own.
 */
function fitChordText(): void {
  for (const id of FIT_TEXT) {
    const el = $(id);
    let size = parseFloat(getComputedStyle(el).height);
    el.style.fontSize = `${size}px`;
    while (size > 20 && el.scrollWidth > el.clientWidth) {
      size = Math.max(20, Math.min(size - 1, Math.floor((size * el.clientWidth) / el.scrollWidth)));
      el.style.fontSize = `${size}px`;
    }
  }
}

window.addEventListener("resize", fitChordText);

function showReading(notes: number[]): ChordReading | null {
  const reading = readChord(notes, musicalKey);
  if (!reading) return null;
  shownNotes = notes;
  const spelling = keySpelling(musicalKey);
  $("chord-symbol").textContent = pretty(reading.symbol);
  $("chord-name").textContent = pretty(reading.name);
  $("chord-notes").textContent = pretty(notes.map((n) => noteName(n, spelling)).join("  "));
  $("chord-alternatives").textContent = reading.alternatives.length ? pretty(`also ${reading.alternatives.join(" · ")}`) : "";
  $("chord-roman").textContent = reading.roman ? pretty(reading.roman) : "";
  for (const id of ["chord-name", "chord-notes", "chord-alternatives"]) $(id).title = $(id).textContent ?? "";
  fitChordText();
  return reading;
}

/**
 * Only adding notes changes the reading: keys come up one at a time, and
 * re-reading on each release would end on a lone note instead of the chord.
 * After full release the chord stays up, dimmed.
 */
function renderChord(held: ReadonlySet<number>): void {
  const added = held.size > lastHeldCount;
  lastHeldCount = held.size;
  chordPanel.classList.toggle("released", held.size === 0);
  if (!added) return;
  const notes = [...held].sort((a, b) => a - b);
  const reading = showReading(notes);
  if (reading) trackChord(reading, notes);
}

// --- Suggest mode -----------------------------------------------------------

type ViewMode = "synth" | "suggest";
let viewMode: ViewMode = localStorage.getItem(MODE_KEY) === "suggest" ? "suggest" : "synth";

const tracker = new ProgressionTracker();
tracker.restore(readJson(PROGRESSION_KEY));
let cards: Card[] = [];
/** Index of the chord playback is sounding, or null when stopped. */
let playingIndex: number | null = null;
let pedalMode: PedalMode = localStorage.getItem(PEDAL_KEY) === "sustain" ? "sustain" : "commit";

const playback = new Playback(
  {
    noteOn: (n, v) => synth.noteOn(n, v),
    noteOff: (n) => synth.noteOff(n),
    onStep: (index) => {
      playingIndex = index;
      renderSuggest();
    },
  },
  () => tracker.history.map((h) => h.notes),
  sanitizePlayback(readJson(PLAYBACK_KEY)),
);

const suggestView = new SuggestView($("suggest"), {
  pretty,
  play: audition,
  commit: commitChord,
  undo: undoChord,
  clear: clearProgression,
  setPedal: (mode) => {
    pedalMode = mode;
    localStorage.setItem(PEDAL_KEY, mode);
    synth.setSustain(false);
    renderSuggest();
  },
  learn: (action) => {
    learn.arm(learn.armed === action ? null : action);
    renderLearnState();
  },
  togglePlayback: () => {
    void synth.resume();
    if (playback.active) playback.stop();
    else playback.start();
  },
  setPlayback: (settings) => {
    playback.settings = sanitizePlayback(settings);
    localStorage.setItem(PLAYBACK_KEY, JSON.stringify(playback.settings));
    renderSuggest();
  },
});
onLearnChange = renderSuggest;

function trackChord(reading: ChordReading, notes: number[]): void {
  if (playback.active) return;
  const chord = reading.kind === "chord" ? parseChordSymbol(reading.symbol) : null;
  if (!chord) return;
  tracker.play(chord, notes, performance.now());
  // The board stays on the last committed chord, so the candidate can be checked against it.
  // Exact notes, not the reduced chord: C6 shares Am7's notes but would reduce to plain C.
  const candidate = tracker.candidate;
  const followed = tracker.history.length ? cards.find((c) => samePitchClasses(chordPitchClasses(c.chord), notes)) : undefined;
  if (candidate && followed) {
    candidate.via = followed.technique;
    // Same notes, read the way the suggestion meant them: Am7/E after G7, not C6/E.
    candidate.chord = followed.chord;
  }
  progressionChanged();
}

function commitChord(): void {
  if (tracker.commit()) progressionChanged();
}

function undoChord(): void {
  tracker.undo();
  progressionChanged();
}

function clearProgression(): void {
  playback.stop();
  tracker.clear();
  progressionChanged();
}

function progressionChanged(): void {
  localStorage.setItem(PROGRESSION_KEY, JSON.stringify(tracker.snapshot()));
  renderSuggest();
}

function stripChord(played: PlayedChord): StripChord {
  if (played.via) return { ...describeChord(played.chord, played.notes, musicalKey), via: played.via };
  const reading = readChord(played.notes, musicalKey);
  return { symbol: reading?.symbol ?? "?", roman: reading?.roman ?? null };
}

function renderSuggest(): void {
  if (viewMode !== "suggest") return;
  const anchor = tracker.anchor;
  const past = anchor === tracker.history.at(-1) ? tracker.history.slice(0, -1) : tracker.history;
  cards = anchor ? buildBoard(anchor, past, musicalKey) : [];
  const candidate = tracker.candidate;
  const trying = candidate && tracker.history.length ? (cards.find((c) => samePitchClasses(chordPitchClasses(c.chord), candidate.notes)) ?? null) : null;
  suggestView.render({
    history: tracker.history.map(stripChord),
    candidate: candidate ? stripChord(candidate) : null,
    anchorNotes: anchor?.notes ?? [],
    cards,
    trying,
    pedal: pedalMode,
    learnLabels: { commit: learnLabel("commit"), undo: learnLabel("undo"), clear: learnLabel("clear") },
    playing: { index: playingIndex, settings: playback.settings },
  });
}

let auditionNotes: number[] = [];
let auditionTimer: number | undefined;

function audition(notes: number[]): void {
  void synth.resume();
  window.clearTimeout(auditionTimer);
  for (const n of auditionNotes) synth.noteOff(n);
  auditionNotes = notes;
  for (const n of notes) synth.noteOn(n, 90);
  auditionTimer = window.setTimeout(() => {
    for (const n of notes) synth.noteOff(n);
    auditionNotes = [];
  }, 1100);
}

const modeTabs = [...document.querySelectorAll<HTMLButtonElement>(".mode-tabs button")];

function setViewMode(next: ViewMode): void {
  viewMode = next;
  localStorage.setItem(MODE_KEY, next);
  document.body.dataset.mode = next;
  for (const tab of modeTabs) tab.classList.toggle("active", tab.dataset.mode === next);
  fitChordText();
  renderSuggest();
}

for (const tab of modeTabs) {
  tab.addEventListener("click", () => {
    setViewMode(tab.dataset.mode === "suggest" ? "suggest" : "synth");
    tab.blur();
  });
}

keySelect.replaceChildren(new Option("None", ""), ...KEYS.map((k) => new Option(pretty(keyId(k)), keyId(k))));
keySelect.value = musicalKey ? keyId(musicalKey) : "";
keySelect.addEventListener("change", () => {
  musicalKey = parseKey(keySelect.value);
  localStorage.setItem(KEY_KEY, keySelect.value);
  if (shownNotes.length) showReading(shownNotes);
  renderSuggest();
  keySelect.blur();
});

setViewMode(viewMode);

synth.onHeldChange = (held) => {
  keyboardView.setHeld(held);
  // Before renderChord, which may rebuild the board and re-mark from the stored notes.
  if (viewMode === "suggest") suggestView.setHeld(held);
  renderChord(held);
};

function renderKeyboardState(octave: number, velocity: number): void {
  $("octave").textContent = String(octave);
  $("velocity").textContent = String(velocity);
  keyboardView.setComputerOctave(octave);
}

const savedKeyboard = readJson(KEYBOARD_KEY) as { octave?: unknown; velocity?: unknown } | null;
const computerKeyboard = new ComputerKeyboard(
  {
    noteOn: (note, velocity) => synth.noteOn(note, velocity),
    noteOff: (note) => synth.noteOff(note),
    onStateChange: (state) => {
      localStorage.setItem(KEYBOARD_KEY, JSON.stringify(state));
      renderKeyboardState(state.octave, state.velocity);
    },
  },
  typeof savedKeyboard?.octave === "number" && typeof savedKeyboard.velocity === "number"
    ? { octave: savedKeyboard.octave, velocity: savedKeyboard.velocity }
    : undefined,
);
renderKeyboardState(computerKeyboard.octave, computerKeyboard.velocity);

$("panic").addEventListener("click", () => synth.allNotesOff());

// --- Audio start ------------------------------------------------------------

const audioStatus = $("audio-status");
const renderAudioState = () => {
  const running = synth.ctx.state === "running";
  audioStatus.textContent = running ? "Audio on" : "Click or press a key to start audio";
  audioStatus.classList.toggle("warn", !running);
  audioStatus.classList.toggle("ok", running);
};
synth.ctx.addEventListener("statechange", renderAudioState);
const startAudio = () => void synth.resume();
window.addEventListener("pointerdown", startAudio);
window.addEventListener("keydown", startAudio);
renderAudioState();

// --- MIDI -------------------------------------------------------------------

const lastCcValue = new Map<string, number>();

/** True when a button or pedal goes from up to down; holding it or letting go isn't a press. */
function isPress(channel: number, controller: number, value: number): boolean {
  const key = `${channel}:${controller}`;
  const was = lastCcValue.get(key) ?? 0;
  lastCcValue.set(key, value);
  return value >= 64 && was < 64;
}

function runAction(action: ActionId): void {
  if (action === "commit") commitChord();
  else if (action === "undo") undoChord();
  else clearProgression();
}

function onMidi(msg: MidiMessage): void {
  switch (msg.type) {
    case "noteon":
      synth.noteOn(msg.note, msg.velocity);
      return;
    case "noteoff":
      synth.noteOff(msg.note);
      return;
    case "cc": {
      const wasArmed = learn.armed !== null;
      const id = learn.handleCc(msg);
      const pressed = isPress(msg.channel, msg.controller, msg.value);
      if (wasArmed) renderLearnState();
      if (id && isAction(id)) {
        // The press that binds a button shouldn't also fire it.
        if (pressed && !wasArmed) runAction(id);
      } else if (id) {
        setParam(id, fromNormalized(PARAM_BY_ID[id], msg.value / 127), "external");
      } else if (msg.controller === SUSTAIN_CC) {
        if (viewMode === "suggest" && pedalMode === "commit") {
          if (pressed) commitChord();
        } else {
          synth.setSustain(msg.value >= 64);
        }
      } else if (msg.controller === ALL_NOTES_OFF_CC) {
        synth.allNotesOff();
      }
    }
  }
}

function renderMidiStatus(status: MidiStatus): void {
  const el = $("midi-status");
  el.classList.remove("ok", "warn");
  switch (status.kind) {
    case "unsupported":
      el.textContent = "MIDI: not supported in this browser (use Chrome)";
      el.classList.add("warn");
      break;
    case "denied":
      el.textContent = `MIDI: blocked (${status.reason})`;
      el.classList.add("warn");
      break;
    case "ready":
      el.textContent = status.inputs.length ? `MIDI: ${status.inputs.join(", ")}` : "MIDI: no devices connected";
      el.classList.add(status.inputs.length ? "ok" : "warn");
      el.title = status.inputs.join("\n");
      break;
  }
}

void connectMidi(onMidi, renderMidiStatus);
