import type { Voicing } from "../voiceLeading";
import { isBlackKey } from "./noteNames";

const SVG = "http://www.w3.org/2000/svg";
/** Wide, short keys: the cards are wide and Suggest mode has little height to spare. */
const WHITE_W = 20;
const WHITE_H = 68;
const BLACK_W = 12;
const BLACK_H = 42;
/** Room above the keys for the movement arrows. */
const ARROW_ZONE = 18;

let markerId = 0;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A range that starts on C or F and ends on E or B, so the drawing never cuts a key group in half. */
export function keyboardRange(notes: Iterable<number>, minSpan = 17): { low: number; high: number } {
  const all = [...notes];
  if (all.length === 0) all.push(60, 72);
  let low = Math.min(...all) - 2;
  let high = Math.max(...all) + 2;
  while (high - low < minSpan) [low, high] = [low - 1, high + 1];
  while (low % 12 !== 0 && low % 12 !== 5) low--;
  while (high % 12 !== 4 && high % 12 !== 11) high++;
  return { low, high };
}

/**
 * Draws the move from the held notes to a voicing: target notes filled,
 * common tones marked with a dot, notes being left as hollow ghosts, and an
 * arrow above the keys for every voice that moves.
 */
export function miniKeyboard(from: readonly number[], voicing: Voicing, range: { low: number; high: number }): SVGSVGElement {
  const whiteX = new Map<number, number>();
  let x = 0;
  for (let n = range.low; n <= range.high; n++) {
    if (!isBlackKey(n)) {
      whiteX.set(n, x);
      x += WHITE_W;
    }
  }
  const width = x;
  const center = (n: number) => (isBlackKey(n) ? whiteX.get(n + 1)! : whiteX.get(n)! + WHITE_W / 2);

  const svg = el("svg", { viewBox: `0 0 ${width} ${ARROW_ZONE + WHITE_H}`, class: "mini-keyboard", role: "img" });
  const id = `mk-arrow-${markerId++}`;
  const defs = el("defs", {});
  const marker = el("marker", { id, viewBox: "0 0 6 6", refX: 5, refY: 3, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0,0 L6,3 L0,6 z", class: "mk-arrowhead" }));
  defs.append(marker);
  svg.append(defs);

  const target = new Set(voicing.notes);
  const held = new Set(from);
  const stays = new Set(voicing.moves.filter((m) => m.from === m.to).map((m) => m.to));
  const keyClass = (n: number) => (target.has(n) ? (stays.has(n) ? "mk-common" : "mk-target") : held.has(n) ? "mk-leaving" : "");

  const keys = el("g", { transform: `translate(0 ${ARROW_ZONE})` });
  for (const [n, kx] of whiteX) keys.append(el("rect", { x: kx + 0.5, y: 0, width: WHITE_W - 1, height: WHITE_H, rx: 1.5, class: `mk-white ${keyClass(n)}` }));
  for (let n = range.low; n <= range.high; n++) {
    if (isBlackKey(n)) keys.append(el("rect", { x: center(n) - BLACK_W / 2, y: 0, width: BLACK_W, height: BLACK_H, rx: 1.5, class: `mk-black ${keyClass(n)}` }));
  }
  for (const n of stays) {
    const y = isBlackKey(n) ? BLACK_H - 6 : WHITE_H - 7;
    keys.append(el("circle", { cx: center(n), cy: y, r: 3.2, class: "mk-dot" }));
  }
  // One hidden marker per key, switched on by `showHeld`; white-key markers sit below the black keys.
  for (let n = range.low; n <= range.high; n++) {
    keys.append(el("circle", { cx: center(n), cy: isBlackKey(n) ? 14 : 51, r: 3.6, class: "mk-held", "data-note": n }));
  }
  svg.append(keys);

  const arrows = el("g", {});
  for (const m of voicing.moves) {
    if (m.from === m.to) continue;
    const x2 = center(m.to);
    if (m.from === null) {
      const plus = el("text", { x: x2, y: ARROW_ZONE - 5, class: "mk-plus" });
      plus.textContent = "+";
      arrows.append(plus);
      continue;
    }
    const x1 = center(m.from);
    const lift = Math.min(ARROW_ZONE - 4, 6 + Math.abs(x2 - x1) * 0.2);
    const base = ARROW_ZONE - 2;
    arrows.append(el("path", { d: `M${x1},${base} Q${(x1 + x2) / 2},${base - lift} ${x2},${base}`, class: "mk-arrow", "marker-end": `url(#${id})` }));
  }
  svg.append(arrows);
  return svg;
}

/** Marks the keys being played. Notes outside the drawn range show, faded, in the nearest octave that fits. */
export function showHeld(svg: SVGSVGElement, held: Iterable<number>): void {
  const markers = [...svg.querySelectorAll<SVGCircleElement>(".mk-held")];
  if (markers.length === 0) return;
  const low = Number(markers[0].dataset.note);
  const high = Number(markers.at(-1)!.dataset.note);
  const exact = new Set<number>();
  const folded = new Set<number>();
  for (const n of held) {
    if (n >= low && n <= high) {
      exact.add(n);
      continue;
    }
    let m = n;
    while (m < low) m += 12;
    while (m > high) m -= 12;
    if (m >= low) folded.add(m);
  }
  for (const marker of markers) {
    const n = Number(marker.dataset.note);
    marker.classList.toggle("on", exact.has(n) || folded.has(n));
    marker.classList.toggle("folded", folded.has(n) && !exact.has(n));
  }
}
