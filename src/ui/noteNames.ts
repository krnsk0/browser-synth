const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Scientific pitch: 60 is C4. Ableton labels the same note C3. */
export function noteName(note: number): string {
  return `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

export function isBlackKey(note: number): boolean {
  return NAMES[note % 12].includes("#");
}
