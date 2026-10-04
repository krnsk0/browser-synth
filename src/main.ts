import { Synth } from "./audio/synth";
import { ComputerKeyboard } from "./input/computerKeyboard";
import { connectMidi, type MidiMessage, type MidiStatus } from "./input/midi";
import { MidiLearn } from "./midiLearn";
import { PARAMS, PARAM_BY_ID, defaultValues, fromNormalized, toNormalized, type ParamGroup, type ParamId, type ParamValues } from "./params";
import { PatchStore, patchesEqual, sanitizePatch } from "./patches";
import { KeyboardView } from "./ui/keyboard";
import { noteName } from "./ui/noteNames";

const WORKING_PATCH_KEY = "browser-synth:patch:v1";
const PATCH_NAME_KEY = "browser-synth:patch-name:v1";
const KEYBOARD_KEY = "browser-synth:keyboard:v1";
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
}

function renderLearnState(): void {
  document.body.classList.toggle("learning", learn.armed !== null);
  for (const [id, els] of controls) {
    const source = learn.sourceFor(id);
    const armed = learn.armed === id;
    els.root.classList.toggle("armed", armed);
    els.learnButton.textContent = armed ? "move a knob…" : source ? `CC ${source.controller}${source.channel === 1 ? "" : ` · ch ${source.channel}`}` : "learn";
    els.learnButton.classList.toggle("bound", Boolean(source));
    els.clearButton.hidden = !source;
  }
}

function buildControls(container: HTMLElement): void {
  const groups = new Map<ParamGroup, HTMLElement>();
  for (const def of PARAMS) {
    let group = groups.get(def.group);
    if (!group) {
      group = document.createElement("fieldset");
      group.className = "group";
      const legend = document.createElement("legend");
      legend.textContent = def.group;
      group.append(legend);
      groups.set(def.group, group);
      container.append(group);
    }

    const root = document.createElement("div");
    root.className = "control";

    const label = document.createElement("label");
    label.textContent = def.label;
    label.htmlFor = `param-${def.id}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = `param-${def.id}`;
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.001";
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
  if (e.key === "Escape" && learn.armed) {
    learn.arm(null);
    renderLearnState();
  }
});

// --- Notes ------------------------------------------------------------------

const heldEl = $("held-notes");
const keyboardView = new KeyboardView($("keyboard"), {
  lowest: 36,
  highest: 84,
  noteOn: (note) => synth.noteOn(note, 100),
  noteOff: (note) => synth.noteOff(note),
});

synth.onHeldChange = (held) => {
  keyboardView.setHeld(held);
  const names = [...held].sort((a, b) => a - b).map(noteName);
  heldEl.textContent = names.length ? names.join(" ") : "—";
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
      if (wasArmed) renderLearnState();
      if (id) {
        setParam(id, fromNormalized(PARAM_BY_ID[id], msg.value / 127), "external");
      } else if (msg.controller === SUSTAIN_CC) {
        synth.setSustain(msg.value >= 64);
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
