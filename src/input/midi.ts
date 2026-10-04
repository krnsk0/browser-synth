export type MidiMessage =
  | { type: "noteon"; channel: number; note: number; velocity: number }
  | { type: "noteoff"; channel: number; note: number }
  | { type: "cc"; channel: number; controller: number; value: number };

/** Channels are 1-based to match what controllers and DAWs display. */
export function parseMidi(data: ArrayLike<number>): MidiMessage | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  const d1 = data[1];
  const d2 = data[2];
  switch (status) {
    case 0x90:
      return d2 === 0 ? { type: "noteoff", channel, note: d1 } : { type: "noteon", channel, note: d1, velocity: d2 };
    case 0x80:
      return { type: "noteoff", channel, note: d1 };
    case 0xb0:
      return { type: "cc", channel, controller: d1, value: d2 };
    default:
      return null;
  }
}

export type MidiStatus =
  | { kind: "unsupported" }
  | { kind: "denied"; reason: string }
  | { kind: "ready"; inputs: string[] };

/** Listens to every connected input, including devices plugged in later. */
export async function connectMidi(onMessage: (msg: MidiMessage) => void, onStatus: (status: MidiStatus) => void): Promise<void> {
  if (!("requestMIDIAccess" in navigator)) {
    onStatus({ kind: "unsupported" });
    return;
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (err) {
    onStatus({ kind: "denied", reason: err instanceof Error ? err.message : String(err) });
    return;
  }

  const handle = (e: MIDIMessageEvent) => {
    if (!e.data) return;
    const msg = parseMidi(e.data);
    if (msg) onMessage(msg);
  };

  const refresh = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = handle;
      if (input.state === "connected") names.push(input.name ?? input.id);
    });
    onStatus({ kind: "ready", inputs: names });
  };

  access.onstatechange = refresh;
  refresh();
}
