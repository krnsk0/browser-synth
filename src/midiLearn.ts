import { PARAM_BY_ID, type ParamId } from "./params";

const STORAGE_KEY = "browser-synth:midi-map:v1";

/** Buttons that trigger something instead of setting a value. */
export const ACTIONS = ["undo", "commit", "clear"] as const;
export type ActionId = (typeof ACTIONS)[number];
export type LearnTarget = ParamId | ActionId;

export function isAction(target: LearnTarget): target is ActionId {
  return (ACTIONS as readonly string[]).includes(target);
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CcSource {
  channel: number;
  controller: number;
}

const sourceKey = ({ channel, controller }: CcSource) => `${channel}:${controller}`;

/** One CC drives one param or action; binding it again replaces its old CC. */
export class MidiLearn {
  armed: LearnTarget | null = null;
  private readonly bindings = new Map<string, LearnTarget>();

  constructor(private readonly store: KeyValueStore) {
    try {
      const saved = JSON.parse(store.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
      for (const [key, id] of Object.entries(saved)) {
        if (id in PARAM_BY_ID || isAction(id as LearnTarget)) this.bindings.set(key, id as LearnTarget);
      }
    } catch {
      // Corrupt storage just means no saved mappings.
    }
  }

  arm(id: LearnTarget | null): void {
    this.armed = id;
  }

  /** Returns what this CC now controls, or null if it is unmapped. */
  handleCc(source: CcSource): LearnTarget | null {
    const key = sourceKey(source);
    if (this.armed) {
      this.clear(this.armed);
      this.bindings.set(key, this.armed);
      this.armed = null;
      this.save();
    }
    return this.bindings.get(key) ?? null;
  }

  sourceFor(id: LearnTarget): CcSource | undefined {
    for (const [key, bound] of this.bindings) {
      if (bound !== id) continue;
      const [channel, controller] = key.split(":").map(Number);
      return { channel, controller };
    }
    return undefined;
  }

  clear(id: LearnTarget): void {
    for (const [key, bound] of this.bindings) {
      if (bound === id) this.bindings.delete(key);
    }
    this.save();
  }

  private save(): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.bindings)));
  }
}
