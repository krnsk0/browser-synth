export interface VoiceMove {
  /** The held note this voice starts on; null for a note the target chord adds. */
  from: number | null;
  to: number;
}

export interface Voicing {
  notes: number[];
  moves: VoiceMove[];
  /** Total half steps travelled by the voices that move. */
  distance: number;
}

/** Exhaustive search above this many voices gets slow; bigger clusters use a greedy pass. */
const EXACT_LIMIT = 6;
/** Root-position bass is slightly preferred, but never at the cost of a real extra step. */
const INVERSION_PENALTY = 0.75;

const pc = (n: number) => ((n % 12) + 12) % 12;

/** The nearest note of each pitch class to `from`; both directions at a tritone. */
function options(from: number, pcs: readonly number[]): number[] {
  return pcs.flatMap((p) => {
    const up = pc(p - from);
    if (up === 0) return [from];
    if (up === 6) return [from + 6, from - 6];
    return [up < 6 ? from + up : from + up - 12];
  });
}

function score(chosen: readonly number[], voices: readonly number[], root: number): number {
  let cost = 0;
  for (let i = 0; i < voices.length; i++) cost += Math.abs(chosen[i] - voices[i]);
  return cost + (pc(Math.min(...chosen)) === root ? 0 : INVERSION_PENALTY);
}

function exact(voices: readonly number[], pcs: readonly number[], root: number): number[] | null {
  const needed = Math.min(voices.length, pcs.length);
  const chosen: number[] = [];
  let best: number[] | null = null;
  let bestScore = Infinity;
  let partial = 0;

  const visit = (i: number) => {
    if (partial >= bestScore) return;
    if (i === voices.length) {
      if (new Set(chosen.map(pc)).size < needed) return;
      const s = score(chosen, voices, root);
      if (s < bestScore) [best, bestScore] = [[...chosen], s];
      return;
    }
    for (const note of options(voices[i], pcs)) {
      if (chosen.includes(note)) continue;
      chosen.push(note);
      partial += Math.abs(note - voices[i]);
      visit(i + 1);
      partial -= Math.abs(note - voices[i]);
      chosen.pop();
    }
  };
  visit(0);
  return best;
}

function greedy(voices: readonly number[], pcs: readonly number[]): number[] {
  const nearest = (v: number, candidates: readonly number[]) => candidates.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const chosen = voices.map((v) => nearest(v, options(v, pcs)));
  for (const p of pcs) {
    if (chosen.some((n) => pc(n) === p)) continue;
    let bestIndex = -1;
    let bestCost = Infinity;
    for (let i = 0; i < voices.length; i++) {
      if (chosen.filter((n) => pc(n) === pc(chosen[i])).length < 2) continue;
      const target = nearest(voices[i], options(voices[i], [p]));
      const cost = Math.abs(target - voices[i]) - Math.abs(chosen[i] - voices[i]);
      if (cost < bestCost) [bestIndex, bestCost] = [i, cost];
    }
    if (bestIndex >= 0) chosen[bestIndex] = nearest(voices[bestIndex], options(voices[bestIndex], [p]));
  }
  return chosen;
}

/** Places a pitch class the held voices couldn't cover as close to the middle of the voicing as possible. */
function placeAdded(p: number, around: readonly number[], taken: ReadonlySet<number>): number {
  const sorted = [...around].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  const candidates = options(middle, [p]).flatMap((n) => [n, n + 12, n - 12]).filter((n) => !taken.has(n));
  return candidates.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) ? b : a));
}

/**
 * The smoothest way from the held notes to a chord: every voice moves to the
 * nearest chord tone it can, all chord tones are covered, and tones the voices
 * can't cover are added near the middle of the hand.
 */
export function voiceLead(from: Iterable<number>, pcs: readonly number[], root: number): Voicing {
  const voices = [...new Set(from)].sort((a, b) => a - b);
  if (voices.length === 0) {
    const notes = pcs.map((p) => 60 + pc(p - root) + pc(root)).sort((a, b) => a - b);
    return { notes, moves: notes.map((to) => ({ from: null, to })), distance: 0 };
  }

  const chosen = (voices.length <= EXACT_LIMIT && exact(voices, pcs, pc(root))) || greedy(voices, pcs);
  const moves: VoiceMove[] = voices.map((v, i) => ({ from: v, to: chosen[i] }));
  const taken = new Set(chosen);
  for (const p of pcs) {
    if (chosen.some((n) => pc(n) === p)) continue;
    const to = placeAdded(p, chosen, taken);
    taken.add(to);
    moves.push({ from: null, to });
  }
  return {
    notes: [...taken].sort((a, b) => a - b),
    moves,
    distance: moves.reduce((sum, m) => sum + (m.from === null ? 0 : Math.abs(m.to - m.from)), 0),
  };
}
