import { PARAM_BY_ID, type ParamId } from "./params";

const STORAGE_KEY = "browser-synth:midi-map:v1";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CcSource {
  channel: number;
  controller: number;
}

const sourceKey = ({ channel, controller }: CcSource) => `${channel}:${controller}`;

/** One CC drives one param; binding a param again replaces its old CC. */
export class MidiLearn {
  armed: ParamId | null = null;
  private readonly bindings = new Map<string, ParamId>();

  constructor(private readonly store: KeyValueStore) {
    try {
      const saved = JSON.parse(store.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
      for (const [key, id] of Object.entries(saved)) {
        if (id in PARAM_BY_ID) this.bindings.set(key, id as ParamId);
      }
    } catch {
      // Corrupt storage just means no saved mappings.
    }
  }

  arm(id: ParamId | null): void {
    this.armed = id;
  }

  /** Returns the param this CC now controls, or null if it is unmapped. */
  handleCc(source: CcSource): ParamId | null {
    const key = sourceKey(source);
    if (this.armed) {
      this.clear(this.armed);
      this.bindings.set(key, this.armed);
      this.armed = null;
      this.save();
    }
    return this.bindings.get(key) ?? null;
  }

  sourceFor(id: ParamId): CcSource | undefined {
    for (const [key, bound] of this.bindings) {
      if (bound !== id) continue;
      const [channel, controller] = key.split(":").map(Number);
      return { channel, controller };
    }
    return undefined;
  }

  clear(id: ParamId): void {
    for (const [key, bound] of this.bindings) {
      if (bound === id) this.bindings.delete(key);
    }
    this.save();
  }

  private save(): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.bindings)));
  }
}
