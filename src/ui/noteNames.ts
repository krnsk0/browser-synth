/** Without a key there is no right spelling, so use the names most common in pop charts. */
export const DEFAULT_SPELLING: readonly string[] = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

/** Scientific pitch: 60 is C4. Ableton labels the same note C3. */
export function noteName(note: number, spelling: readonly string[] = DEFAULT_SPELLING): string {
  const name = pitchClassName(note, spelling);
  // Cb and B# sit across the octave boundary from the C they sound as.
  const octaveShift = name.startsWith("Cb") ? 1 : name.startsWith("B#") ? -1 : 0;
  return `${name}${Math.floor(note / 12) - 1 + octaveShift}`;
}

export function pitchClassName(note: number, spelling: readonly string[] = DEFAULT_SPELLING): string {
  return spelling[((note % 12) + 12) % 12];
}

export function isBlackKey(note: number): boolean {
  return BLACK.has(note % 12);
}
