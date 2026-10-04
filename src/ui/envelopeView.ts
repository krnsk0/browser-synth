export interface EnvelopeShape {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const WIDTH = 240;
const HEIGHT = 64;
const PAD = 3;
const MAX_SEGMENT = 5;
const SUSTAIN_WIDTH = 0.16;
const SAMPLES = 24;

/** Square-root time scale so a 5 ms attack and a 4 s decay are both visible. */
function segmentWidth(seconds: number): number {
  return (WIDTH - PAD * 2) * 0.28 * Math.sqrt(Math.min(seconds, MAX_SEGMENT) / MAX_SEGMENT);
}

/** Points (x, level 0..1) matching the synth's linear attack and exponential decay/release. */
export function envelopePoints(env: EnvelopeShape): [number, number][] {
  const points: [number, number][] = [[PAD, 0]];
  let x = PAD + segmentWidth(env.attack);
  points.push([x, 1]);

  const decayW = segmentWidth(env.decay);
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    points.push([x + decayW * t, env.sustain + (1 - env.sustain) * Math.exp(-4 * t)]);
  }
  x += decayW;

  x += (WIDTH - PAD * 2) * SUSTAIN_WIDTH;
  points.push([x, env.sustain]);

  const releaseW = segmentWidth(env.release);
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    points.push([x + releaseW * t, env.sustain * Math.exp(-5 * t)]);
  }
  return points;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export class EnvelopeView {
  private readonly svg: SVGSVGElement;
  private readonly area: SVGPathElement;
  private readonly line: SVGPathElement;

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    this.svg.setAttribute("preserveAspectRatio", "none");
    this.svg.classList.add("envelope");
    this.area = document.createElementNS(SVG_NS, "path");
    this.area.classList.add("envelope-area");
    this.line = document.createElementNS(SVG_NS, "path");
    this.line.classList.add("envelope-line");
    this.svg.append(this.area, this.line);
    container.append(this.svg);
  }

  update(env: EnvelopeShape): void {
    const baseline = HEIGHT - PAD;
    const y = (level: number) => baseline - level * (HEIGHT - PAD * 2);
    const points = envelopePoints(env);
    const d = points.map(([x, level], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y(level).toFixed(1)}`).join(" ");
    const last = points[points.length - 1][0];
    this.line.setAttribute("d", d);
    this.area.setAttribute("d", `${d} L${last.toFixed(1)},${baseline} L${PAD},${baseline} Z`);
  }
}
