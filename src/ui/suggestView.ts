import type { Card, Group } from "../suggest";
import { keyboardRange, miniKeyboard } from "./miniKeyboard";
import { noteName } from "./noteNames";

export interface StripChord {
  symbol: string;
  roman: string | null;
  via?: string;
}

export interface SuggestState {
  history: StripChord[];
  current: StripChord | null;
  heldNotes: number[];
  /** Pitch-class names for the held chord, so moves read "E→D" in its own spelling. */
  heldSpelling: readonly string[];
  cards: Card[];
}

export interface SuggestViewOptions {
  /** Display-only formatting for symbols (♭ and ♯). */
  pretty: (text: string) => string;
  play: (notes: number[]) => void;
  clear: () => void;
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

export class SuggestView {
  private readonly strip = div("progression");
  private readonly columns = div("suggest-columns");

  constructor(root: HTMLElement, private readonly opts: SuggestViewOptions) {
    root.append(this.strip, this.columns);
  }

  render(state: SuggestState): void {
    this.renderStrip(state);
    this.renderColumns(state);
  }

  private renderStrip({ history, current }: SuggestState): void {
    const { pretty } = this.opts;
    const label = div("progression-label", "Progression");
    const chain = div("progression-chain");
    const all = current ? [...history, current] : history;
    if (all.length === 0) chain.append(div("progression-empty", "Play a chord to see where it can go."));
    all.forEach((chord, i) => {
      if (i > 0) {
        const step = div("progression-step", "→");
        if (chord.via) {
          step.textContent = `→ ${chord.via} →`;
          step.classList.add("followed");
        }
        chain.append(step);
      }
      const chip = div(`progression-chip${chord === current ? " current" : ""}`);
      chip.append(div("chip-symbol", pretty(chord.symbol)));
      if (chord.roman) chip.append(div("chip-roman", pretty(chord.roman)));
      chain.append(chip);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.title = "Start a new progression (also happens after 30 s of silence)";
    clear.disabled = all.length === 0;
    clear.addEventListener("click", () => this.opts.clear());
    this.strip.replaceChildren(label, chain, clear);
  }

  private renderColumns({ cards, heldNotes, heldSpelling }: SuggestState): void {
    const range = keyboardRange([...heldNotes, ...cards.flatMap((c) => c.voicing.notes)]);
    this.columns.replaceChildren(
      ...COLUMNS.map(({ group, title, blurb }) => {
        const column = div(`suggest-column ${group}`);
        const heading = div("suggest-title", title);
        heading.title = blurb;
        column.append(heading);
        const groupCards = cards.filter((c) => c.group === group);
        if (groupCards.length === 0) column.append(div("suggest-none", cards.length ? "Nothing here for this chord." : ""));
        for (const card of groupCards) column.append(this.card(card, heldNotes, heldSpelling, range));
        return column;
      }),
    );
  }

  private card(card: Card, held: readonly number[], heldSpelling: readonly string[], range: { low: number; high: number }): HTMLElement {
    const { pretty } = this.opts;
    const node = document.createElement("button");
    node.type = "button";
    node.className = `suggestion${card.back ? " back" : ""}`;
    node.title = "Click to hear this voicing";
    node.addEventListener("click", () => this.opts.play(card.voicing.notes));

    const head = div("suggestion-head");
    const technique = card.back ? `${card.technique} · back where you were` : card.technique;
    head.append(div("suggestion-symbol", pretty(card.symbol)), div("suggestion-technique", pretty(technique)));
    if (card.roman) head.append(div("suggestion-roman", pretty(card.roman)));
    const why = div("suggestion-why", pretty(card.why));
    why.title = card.why;
    const foot = div("suggestion-foot");
    foot.append(div("suggestion-motion", pretty(this.motion(card, heldSpelling))));
    if (card.then.length) foot.append(div("suggestion-then", pretty(`then → ${card.then.join(" / ")}`)));
    node.append(head, why, miniKeyboard(held, card.voicing, range), foot);
    return node;
  }

  /** "E→D  G→F  +B · C stays", named with the target chord's spelling. */
  private motion(card: Card, heldSpelling: readonly string[]): string {
    const name = (n: number, spelling: readonly string[] = card.spelling) => noteName(n, spelling).replace(/-?\d+$/, "");
    const moving: string[] = [];
    const staying: string[] = [];
    for (const m of [...card.voicing.moves].sort((a, b) => a.to - b.to)) {
      if (m.from === null) moving.push(`+${name(m.to)}`);
      else if (m.from === m.to) staying.push(name(m.to));
      else moving.push(`${name(m.from, heldSpelling)}→${name(m.to)}`);
    }
    const parts = [moving.join("  ")];
    if (staying.length) parts.push(`${staying.join(", ")} ${staying.length === 1 ? "stays" : "stay"}`);
    return parts.filter(Boolean).join(" · ") || "same notes";
  }
}
