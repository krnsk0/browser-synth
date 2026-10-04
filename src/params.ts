export type ParamId =
  | "wave"
  | "detune"
  | "cutoff"
  | "resonance"
  | "attack"
  | "decay"
  | "sustain"
  | "release"
  | "drive"
  | "driveTone"
  | "reverbMix"
  | "reverbDecay"
  | "volume";

export type ParamGroup = "Oscillator" | "Filter" | "Amp Env" | "Drive" | "Reverb" | "Output";

export interface ParamDef {
  id: ParamId;
  label: string;
  group: ParamGroup;
  min: number;
  max: number;
  defaultValue: number;
  /** Exponential curves need min > 0. Stepped params hold integer indexes from min to max. */
  curve: "linear" | "exponential" | "stepped";
  format: (value: number) => string;
}

const seconds = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const percent = (v: number) => `${Math.round(v * 100)}%`;
const hertz = (v: number) => (v < 1000 ? `${Math.round(v)} Hz` : `${(v / 1000).toFixed(2)} kHz`);

export const WAVEFORMS = ["sawtooth", "square", "triangle", "sine"] as const satisfies readonly OscillatorType[];
const WAVE_LABELS = ["Saw", "Square", "Triangle", "Sine"];

export const PARAMS: readonly ParamDef[] = [
  { id: "wave", label: "Wave", group: "Oscillator", min: 0, max: WAVEFORMS.length - 1, defaultValue: 0, curve: "stepped", format: (v) => WAVE_LABELS[Math.round(v)] },
  { id: "detune", label: "Detune", group: "Oscillator", min: 0, max: 40, defaultValue: 0, curve: "linear", format: (v) => `${v.toFixed(1)} ct` },
  { id: "cutoff", label: "Cutoff", group: "Filter", min: 40, max: 16000, defaultValue: 2000, curve: "exponential", format: hertz },
  { id: "resonance", label: "Resonance", group: "Filter", min: 0.5, max: 20, defaultValue: 1, curve: "exponential", format: (v) => `Q ${v.toFixed(1)}` },
  { id: "attack", label: "Attack", group: "Amp Env", min: 0.001, max: 2, defaultValue: 0.005, curve: "exponential", format: seconds },
  { id: "decay", label: "Decay", group: "Amp Env", min: 0.01, max: 4, defaultValue: 0.3, curve: "exponential", format: seconds },
  { id: "sustain", label: "Sustain", group: "Amp Env", min: 0, max: 1, defaultValue: 0.7, curve: "linear", format: percent },
  { id: "release", label: "Release", group: "Amp Env", min: 0.01, max: 5, defaultValue: 0.4, curve: "exponential", format: seconds },
  { id: "drive", label: "Drive", group: "Drive", min: 0, max: 1, defaultValue: 0.2, curve: "linear", format: percent },
  { id: "driveTone", label: "Tone", group: "Drive", min: 800, max: 12000, defaultValue: 6000, curve: "exponential", format: hertz },
  { id: "reverbMix", label: "Mix", group: "Reverb", min: 0, max: 1, defaultValue: 0.25, curve: "linear", format: percent },
  { id: "reverbDecay", label: "Decay", group: "Reverb", min: 0.3, max: 6, defaultValue: 2, curve: "exponential", format: seconds },
  { id: "volume", label: "Volume", group: "Output", min: 0, max: 1, defaultValue: 0.7, curve: "linear", format: percent },
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p])) as Record<ParamId, ParamDef>;

export type ParamValues = Record<ParamId, number>;

export function defaultValues(): ParamValues {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.defaultValue])) as ParamValues;
}

/** Maps a normalized 0..1 position (slider or MIDI CC) to a real value. */
export function fromNormalized(def: ParamDef, n: number): number {
  const t = Math.min(1, Math.max(0, n));
  if (def.curve === "exponential") return def.min * Math.pow(def.max / def.min, t);
  if (def.curve === "stepped") return def.min + Math.round((def.max - def.min) * t);
  return def.min + (def.max - def.min) * t;
}

/** Clamps to range; stepped params also snap to a whole step. */
export function clampValue(def: ParamDef, value: number): number {
  const v = Math.min(def.max, Math.max(def.min, value));
  return def.curve === "stepped" ? Math.round(v) : v;
}

export function toNormalized(def: ParamDef, value: number): number {
  const v = clampValue(def, value);
  if (def.curve === "exponential") return Math.log(v / def.min) / Math.log(def.max / def.min);
  return (v - def.min) / (def.max - def.min);
}
