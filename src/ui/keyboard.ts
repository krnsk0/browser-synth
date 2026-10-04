import { KEY_LABEL_BY_SEMITONE } from "../input/computerKeyboard";
import { isBlackKey, noteName } from "./noteNames";

export interface KeyboardViewOptions {
  lowest: number;
  highest: number;
  noteOn: (note: number) => void;
  noteOff: (note: number) => void;
}

/** On-screen keyboard: shows held notes and plays with mouse or touch. */
export class KeyboardView {
  private readonly keys = new Map<number, HTMLElement>();

  constructor(container: HTMLElement, private readonly opts: KeyboardViewOptions) {
    const whiteCount = this.range().filter((n) => !isBlackKey(n)).length;
    const whiteWidth = 100 / whiteCount;
    let whiteIndex = 0;

    for (const note of this.range()) {
      const key = document.createElement("div");
      const black = isBlackKey(note);
      key.className = black ? "key black" : "key white";
      key.title = noteName(note);
      if (black) {
        key.style.left = `${whiteIndex * whiteWidth - whiteWidth * 0.3}%`;
        key.style.width = `${whiteWidth * 0.6}%`;
      } else {
        key.style.left = `${whiteIndex * whiteWidth}%`;
        key.style.width = `${whiteWidth}%`;
        whiteIndex++;
      }
      if (note % 12 === 0) {
        const c = document.createElement("span");
        c.className = "octave-label";
        c.textContent = noteName(note);
        key.append(c);
      }
      const hint = document.createElement("span");
      hint.className = "key-hint";
      key.append(hint);

      this.bindPointer(key, note);
      this.keys.set(note, key);
      container.append(key);
    }
  }

  setHeld(held: ReadonlySet<number>): void {
    for (const [note, key] of this.keys) key.classList.toggle("held", held.has(note));
  }

  /** Labels the keys the computer keyboard currently plays. */
  setComputerOctave(octave: number): void {
    const base = (octave + 1) * 12;
    for (const [note, key] of this.keys) {
      const hint = key.querySelector(".key-hint");
      if (hint) hint.textContent = KEY_LABEL_BY_SEMITONE[note - base] ?? "";
    }
  }

  private range(): number[] {
    const notes: number[] = [];
    for (let n = this.opts.lowest; n <= this.opts.highest; n++) notes.push(n);
    return notes;
  }

  private bindPointer(key: HTMLElement, note: number): void {
    let pressed = false;
    const on = () => {
      if (pressed) return;
      pressed = true;
      this.opts.noteOn(note);
    };
    const off = () => {
      if (!pressed) return;
      pressed = false;
      this.opts.noteOff(note);
    };
    key.addEventListener("pointerdown", (e) => {
      key.releasePointerCapture(e.pointerId);
      on();
    });
    key.addEventListener("pointerenter", (e) => {
      if (e.buttons === 1) on();
    });
    key.addEventListener("pointerup", off);
    key.addEventListener("pointerleave", off);
    key.addEventListener("pointercancel", off);
  }
}
