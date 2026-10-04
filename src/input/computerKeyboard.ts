/** Ableton's Computer MIDI Keyboard layout, by physical key (`KeyboardEvent.code`). */
const SEMITONE_BY_CODE: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

export const KEY_LABEL_BY_SEMITONE: readonly string[] = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K", "O", "L", "P", ";"];

export const MIN_OCTAVE = 0;
export const MAX_OCTAVE = 8;
const VELOCITY_STEP = 20;

/** Octave uses scientific pitch: octave 4 starts at middle C (MIDI 60). */
export function noteForCode(code: string, octave: number): number | undefined {
  const semitone = SEMITONE_BY_CODE[code];
  if (semitone === undefined) return undefined;
  const note = (octave + 1) * 12 + semitone;
  return note <= 127 ? note : undefined;
}

export interface ComputerKeyboardHandlers {
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  onStateChange: (state: { octave: number; velocity: number }) => void;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range" && target.type !== "button" && target.type !== "checkbox";
}

export class ComputerKeyboard {
  octave = 4;
  velocity = 100;
  /** Note sounding per physical key, so an octave change mid-hold still releases the right note. */
  private readonly down = new Map<string, number>();

  constructor(private readonly handlers: ComputerKeyboardHandlers, initial?: { octave: number; velocity: number }) {
    if (initial) {
      this.octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(initial.octave)));
      this.velocity = Math.min(127, Math.max(1, Math.round(initial.velocity)));
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseAll);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
    if (e.repeat) {
      if (this.down.has(e.code)) e.preventDefault();
      return;
    }
    switch (e.code) {
      case "KeyZ": return this.shiftOctave(-1);
      case "KeyX": return this.shiftOctave(1);
      case "KeyC": return this.shiftVelocity(-VELOCITY_STEP);
      case "KeyV": return this.shiftVelocity(VELOCITY_STEP);
    }
    const note = noteForCode(e.code, this.octave);
    if (note === undefined) return;
    e.preventDefault();
    this.down.set(e.code, note);
    this.handlers.noteOn(note, this.velocity);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const note = this.down.get(e.code);
    if (note === undefined) return;
    this.down.delete(e.code);
    this.handlers.noteOff(note);
  };

  private readonly releaseAll = (): void => {
    for (const note of this.down.values()) this.handlers.noteOff(note);
    this.down.clear();
  };

  private shiftOctave(delta: number): void {
    this.octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, this.octave + delta));
    this.emit();
  }

  private shiftVelocity(delta: number): void {
    this.velocity = Math.min(127, Math.max(1, this.velocity + delta));
    this.emit();
  }

  private emit(): void {
    this.handlers.onStateChange({ octave: this.octave, velocity: this.velocity });
  }
}
