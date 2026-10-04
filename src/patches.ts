import type { KeyValueStore } from "./midiLearn";
import { PARAMS, clampValue, defaultValues, type ParamValues } from "./params";

const PATCHES_KEY = "browser-synth:patches:v1";

/** Fills missing or invalid fields with defaults and clamps to each param's range. */
export function sanitizePatch(raw: unknown): ParamValues {
  const values = defaultValues();
  if (typeof raw !== "object" || raw === null) return values;
  const record = raw as Record<string, unknown>;
  for (const def of PARAMS) {
    const v = record[def.id];
    if (typeof v === "number" && Number.isFinite(v)) values[def.id] = clampValue(def, v);
  }
  return values;
}

export function patchesEqual(a: ParamValues, b: ParamValues): boolean {
  return PARAMS.every((def) => Math.abs(a[def.id] - b[def.id]) <= (def.max - def.min) * 1e-6);
}

/** Named patches, saved as one JSON object. */
export class PatchStore {
  private patches: Record<string, ParamValues> = {};

  constructor(private readonly store: KeyValueStore) {
    try {
      const saved = JSON.parse(store.getItem(PATCHES_KEY) ?? "{}") as Record<string, unknown>;
      for (const [name, raw] of Object.entries(saved)) this.patches[name] = sanitizePatch(raw);
    } catch {
      // Corrupt storage just means no saved patches.
    }
  }

  names(): string[] {
    return Object.keys(this.patches).sort((a, b) => a.localeCompare(b));
  }

  get(name: string): ParamValues | undefined {
    const patch = this.patches[name];
    return patch ? { ...patch } : undefined;
  }

  save(name: string, values: ParamValues): void {
    this.patches[name] = { ...values };
    this.persist();
  }

  delete(name: string): void {
    delete this.patches[name];
    this.persist();
  }

  private persist(): void {
    this.store.setItem(PATCHES_KEY, JSON.stringify(this.patches));
  }
}
