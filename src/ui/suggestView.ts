import { ACTIONS, type ActionId } from "../midiLearn";
import { BEAT_CHOICES, BPM_RANGE, type PlaybackSettings } from "../playback";
import type { Card, Group } from "../suggest";
import { keyboardRange, miniKeyboard, showHeld } from "./miniKeyboard";
export interface StripChord {
  symbol: string;
  roman: string | null;
  via?: string;
}

export type PedalMode = "commit" | "sustain";

export interface SuggestState {
  /** Committed chords, oldest first. */
  history: StripChord[];
  /** What's being tried; not part of the progression until committed. */
  candidate: StripChord | null;
  /** The notes the cards voice-lead from. */
  anchorNotes: number[];
  cards: Card[];
  /** The card whose chord is the candidate. */
  trying: Card | null;
  pedal: PedalMode;
  /** Button label for each action's MIDI mapping: "learn", "move…", or "CC 102". */
  learnLabels: Record<ActionId, string>;
  playing: { index: number | null; settings: PlaybackSettings };
}

export interface SuggestViewOptions {
  /** Display-only formatting for symbols (♭ and ♯). */
  pretty: (text: string) => string;
  play: (notes: number[]) => void;
  commit: () => void;
  undo: () => void;
  clear: () => void;
  setPedal: (mode: PedalMode) => void;
  learn: (action: ActionId) => void;
  togglePlayback: () => void;
  setPlayback: (settings: PlaybackSettings) => void;
}

const COLUMNS: readonly { group: Group; title: string; blurb: string }[] = [
  { group: "strong", title: "Strong moves", blurb: "Functional harmony: where the chord wants to go." },
  { group: "color", title: "Color", blurb: "Borrowed chords, secondary dominants, deceptive moves." },
  { group: "surprise", title: "Surprises", blurb: "Substitutions, mediants, and one-note moves." },
];

function div(className: string, text?: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, title: string, onClick: () => void, className = ""): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.title = title;
  node.className = className;
  node.addEventListener("click", () => {
    onClick();
    node.blur();
  });
  return node;
}

export class SuggestView {
  private readonly chain = div("progression-chain");
  private readonly columns = div("suggest-columns");
  private readonly playButton: HTMLButtonElement;
  private readonly bpmInput = document.createElement("input");
  private readonly beatsSelect = document.createElement("select");
  private readonly pedalButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly commitButton: HTMLButtonElement;
  private readonly learnButtons: Record<ActionId, HTMLButtonElement>;
  private readonly clearButton: HTMLButtonElement;
  private held: number[] = [];
  private settings: PlaybackSettings | null = null;

  constructor(root: HTMLElement, private readonly opts: SuggestViewOptions) {
    // Controls are built once and only updated, so typing a tempo isn't interrupted by re-renders.
    this.playButton = button("▶ Play", "Loop the progression", () => opts.togglePlayback(), "play");
    this.bpmInput.type = "number";
    this.bpmInput.min = String(BPM_RANGE.min);
    this.bpmInput.max = String(BPM_RANGE.max);
    this.bpmInput.title = "Tempo (BPM)";
    this.bpmInput.addEventListener("change", () => this.emitPlayback());
    this.beatsSelect.title = "Beats per chord";
    this.beatsSelect.replaceChildren(...BEAT_CHOICES.map((b) => new Option(`${b} beat${b === 1 ? "" : "s"}`, String(b))));
    this.beatsSelect.addEventListener("change", () => {
      this.emitPlayback();
      this.beatsSelect.blur();
    });

    this.pedalButton = button("", "What the sustain pedal does in Suggest mode", () => opts.setPedal(this.pedalButton.dataset.mode === "commit" ? "sustain" : "commit"), "pedal");
    this.undoButton = button("Undo", "Remove the last chord (Backspace)", () => opts.undo());
    this.commitButton = button("Commit", "Add the chord you're trying to the progression (Enter or pedal)", () => opts.commit(), "commit");
    this.learnButtons = {
      undo: button("learn", "Map a Launchkey button to Undo", () => opts.learn("undo"), "learn"),
      commit: button("learn", "Map a Launchkey button to Commit", () => opts.learn("commit"), "learn"),
      clear: button("learn", "Map a Launchkey button to Clear", () => opts.learn("clear"), "learn"),
    };
    this.clearButton = button("Clear", "Start a new progression", () => opts.clear());

    const tempo = div("strip-group");
    const bpmLabel = document.createElement("label");
    bpmLabel.className = "bpm";
    bpmLabel.append(this.bpmInput, " bpm");
    tempo.append(this.playButton, bpmLabel, this.beatsSelect);
    const actions = div("strip-group");
    const stack = (action: HTMLButtonElement, learn: HTMLButtonElement) => {
      const el = div("action-stack");
      el.append(action, learn);
      return el;
    };
    actions.append(
      this.pedalButton,
      stack(this.undoButton, this.learnButtons.undo),
      stack(this.commitButton, this.learnButtons.commit),
      stack(this.clearButton, this.learnButtons.clear),
    );

    const chainRow = div("progression-row");
    chainRow.append(div("progression-label", "Progression"), this.chain);
    const controlsRow = div("progression-row progression-controls");
    controlsRow.append(tempo, actions);
    const strip = div("progression");
    strip.append(chainRow, controlsRow);
    root.append(strip, this.columns);
  }

  render(state: SuggestState): void {
    this.renderChain(state);
    this.renderControls(state);
    this.renderColumns(state);
    this.setHeld(this.held);
  }

  /** Marks the keys being played on every card, without rebuilding the board. */
  setHeld(held: Iterable<number>): void {
    this.held = [...held];
    for (const svg of this.columns.querySelectorAll<SVGSVGElement>("svg.mini-keyboard")) showHeld(svg, this.held);
  }

  private emitPlayback(): void {
    const bpm = Number(this.bpmInput.value);
    this.opts.setPlayback({ bpm: Number.isFinite(bpm) ? bpm : (this.settings?.bpm ?? 90), beatsPerChord: Number(this.beatsSelect.value) });
  }

  private renderChain({ history, candidate, playing }: SuggestState): void {
    const { pretty } = this.opts;
    const nodes: HTMLElement[] = [];
    const chip = (chord: StripChord, className: string) => {
      const node = div(`progression-chip ${className}`);
      node.append(div("chip-symbol", pretty(chord.symbol)));
      if (chord.roman) node.append(div("chip-roman", pretty(chord.roman)));
      return node;
    };
    const step = (via: string | undefined, tentative: boolean) => {
      const node = div(`progression-step${via ? " followed" : ""}${tentative ? " tentative" : ""}`, via ? `→ ${via} →` : "→");
      return node;
    };

    history.forEach((chord, i) => {
      if (i > 0) nodes.push(step(chord.via, false));
      const node = chip(chord, playing.index === i ? "playing" : "");
      if (i === history.length - 1) {
        const remove = button("×", "Remove this chord (Undo)", () => this.opts.undo(), "chip-remove");
        node.append(remove);
      }
      nodes.push(node);
    });
    if (candidate) {
      if (history.length) nodes.push(step(candidate.via, true));
      const node = chip({ ...candidate, symbol: `${candidate.symbol}?` }, "candidate");
      node.title = "Trying this chord: click, press Enter, or use the pedal to commit it";
      node.addEventListener("click", () => this.opts.commit());
      nodes.push(node);
    }
    if (nodes.length === 0) nodes.push(div("progression-empty", "Play a chord, then commit it with the pedal, Enter, or Commit."));
    this.chain.replaceChildren(...nodes);
    this.chain.scrollLeft = this.chain.scrollWidth;
  }

  private renderControls({ history, candidate, pedal, learnLabels, playing }: SuggestState): void {
    this.settings = playing.settings;
    if (document.activeElement !== this.bpmInput) this.bpmInput.value = String(playing.settings.bpm);
    this.beatsSelect.value = String(playing.settings.beatsPerChord);
    const active = playing.index !== null;
    this.playButton.textContent = active ? "■ Stop" : "▶ Play";
    this.playButton.classList.toggle("active", active);
    this.playButton.disabled = !active && history.length === 0;

    this.pedalButton.dataset.mode = pedal;
    this.pedalButton.textContent = pedal === "commit" ? "Pedal: commit" : "Pedal: sustain";
    this.undoButton.disabled = history.length === 0;
    this.commitButton.disabled = !candidate;
    this.clearButton.disabled = history.length === 0 && !candidate;
    for (const action of ACTIONS) {
      const label = learnLabels[action];
      this.learnButtons[action].textContent = label;
      this.learnButtons[action].classList.toggle("bound", label.startsWith("CC"));
      this.learnButtons[action].classList.toggle("armed", label === "move…");
    }
  }

  private renderColumns({ cards, trying, anchorNotes }: SuggestState): void {
    const range = keyboardRange([...anchorNotes, ...cards.flatMap((c) => c.voicing.notes)]);
    this.columns.replaceChildren(
      ...COLUMNS.map(({ group, title, blurb }) => {
        const column = div(`suggest-column ${group}`);
        const heading = div("suggest-title", title);
        heading.title = blurb;
        column.append(heading);
        const groupCards = cards.filter((c) => c.group === group);
        if (groupCards.length === 0) column.append(div("suggest-none", cards.length ? "Nothing here for this chord." : ""));
        for (const card of groupCards) column.append(this.card(card, card === trying, anchorNotes, range));
        return column;
      }),
    );
  }

  private card(card: Card, trying: boolean, held: readonly number[], range: { low: number; high: number }): HTMLElement {
    const { pretty } = this.opts;
    const node = document.createElement("button");
    node.type = "button";
    node.className = `suggestion${card.back ? " back" : ""}${trying ? " trying" : ""}`;
    node.title = "Click to try this voicing";
    node.addEventListener("click", () => {
      this.opts.play(card.voicing.notes);
      node.blur();
    });

    const head = div("suggestion-head");
    const technique = card.back ? `${card.technique} · back where you were` : card.technique;
    head.append(div("suggestion-symbol", pretty(card.symbol)), div("suggestion-technique", pretty(technique)));
    if (card.roman) head.append(div("suggestion-roman", pretty(card.roman)));
    const why = div("suggestion-why", pretty(card.why));
    why.title = card.why;
    // Always present, even when empty, so every card in a row lines up.
    const then = div("suggestion-then", card.then.length ? pretty(`then → ${card.then.join(" / ")}`) : "");
    const keys = div("mini-keyboard-box");
    keys.append(miniKeyboard(held, card.voicing, range));
    node.append(head, why, then, keys);
    return node;
  }
}
