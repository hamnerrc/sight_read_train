/**
 * Rhythm cells: short beat-aligned patterns the generator fills bars with. Durations are in
 * quarter-note beats; a negative duration is a rest. Working in cells rather than raw note
 * values keeps every bar readable (no half note starting on beat 2 of 4/4, eighths always
 * beamable in pairs).
 */
import type { Meter } from "../types";
import type { Rng } from "./rng";

interface Cell {
  durs: number[];
  compound: boolean;
  /** Allowed start offsets within the bar, given the bar length in quarters. */
  starts: (barLen: number, m: Meter) => number[];
}

const everyBeat = (barLen: number) => range(0, barLen, 1);
const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let x = a; x < b - 1e-9; x += step) out.push(x);
  return out;
};
/** Two-beat cells start on beats 1 and 3 of 4/4, 1 and 2 of 3/4, 1 of 2/4. */
const twoBeat = (barLen: number) => (barLen === 4 ? [0, 2] : barLen === 3 ? [0, 1] : [0]);

export const CELLS: Record<string, Cell> = {
  q: { durs: [1], compound: false, starts: everyBeat },
  qr: { durs: [-1], compound: false, starts: everyBeat },
  h: { durs: [2], compound: false, starts: twoBeat },
  hr: { durs: [-2], compound: false, starts: twoBeat },
  hd: { durs: [3], compound: false, starts: (l) => (l === 4 ? [0, 1] : l === 3 ? [0] : []) },
  w: { durs: [4], compound: false, starts: (l) => (l === 4 ? [0] : []) },
  ee: { durs: [0.5, 0.5], compound: false, starts: everyBeat },
  er: { durs: [-0.5, 0.5], compound: false, starts: everyBeat },
  qde: { durs: [1.5, 0.5], compound: false, starts: twoBeat },
  ssss: { durs: [0.25, 0.25, 0.25, 0.25], compound: false, starts: everyBeat },
  ess: { durs: [0.5, 0.25, 0.25], compound: false, starts: everyBeat },
  sse: { durs: [0.25, 0.25, 0.5], compound: false, starts: everyBeat },
  eqe: { durs: [0.5, 1, 0.5], compound: false, starts: twoBeat },
  // compound (6/8): the beat is a dotted quarter
  dq: { durs: [1.5], compound: true, starts: (l) => range(0, l, 1.5) },
  eee: { durs: [0.5, 0.5, 0.5], compound: true, starts: (l) => range(0, l, 1.5) },
  qe: { durs: [1, 0.5], compound: true, starts: (l) => range(0, l, 1.5) },
  dh: { durs: [3], compound: true, starts: () => [0] },
};

export function isCompound(m: Meter): boolean {
  return m.den === 8 && m.num % 3 === 0;
}

export function barLength(m: Meter): number {
  return (m.num * 4) / m.den;
}

/** Beat unit in quarters: a dotted quarter in compound meters, otherwise the denominator. */
export function beatUnit(m: Meter): number {
  return isCompound(m) ? 1.5 : 4 / m.den;
}

export function parseMeter(s: string): Meter {
  const [num, den] = s.split("/").map(Number);
  return { num: num!, den: den! };
}

/**
 * Fill one bar with cells. Returns signed durations (negative = rest). `featured` cells are
 * more likely; rests are less likely, and a bar is never all rests.
 */
export function fillBar(rng: Rng, m: Meter, cellIds: readonly string[], featured?: string): number[] {
  const len = barLength(m);
  const compound = isCompound(m);
  const ids = cellIds.filter((id) => CELLS[id] && CELLS[id]!.compound === compound);
  for (let attempt = 0; attempt < 20; attempt++) {
    const out: number[] = [];
    let pos = 0;
    while (pos < len - 1e-9) {
      const fits = ids.filter((id) => {
        const c = CELLS[id]!;
        const span = c.durs.reduce((a, d) => a + Math.abs(d), 0);
        return pos + span <= len + 1e-9 && c.starts(len, m).some((s) => Math.abs(s - pos) < 1e-9);
      });
      const fallback = compound ? [1.5] : [1];
      if (fits.length === 0) {
        out.push(...fallback);
        pos += fallback[0]!;
        continue;
      }
      const w = fits.map((id) => (id === featured ? 4 : 1) * (CELLS[id]!.durs.every((d) => d < 0) ? 0.35 : 1));
      const c = CELLS[rng.weighted(fits, w)]!;
      out.push(...c.durs);
      pos += c.durs.reduce((a, d) => a + Math.abs(d), 0);
    }
    if (out.some((d) => d > 0)) return out;
  }
  return [compound ? 1.5 : 1, ...fillRestsSpan(compound ? 1.5 : 1, len, m).map((d) => -d)];
}

/**
 * Decompose the silent span [a, b) of a bar into readable rest durations (positive values),
 * largest aligned value first.
 */
export function fillRestsSpan(a: number, b: number, m: Meter): number[] {
  const len = barLength(m);
  const sizes = isCompound(m) ? [3, 1.5, 1, 0.5, 0.25] : [4, 3, 2, 1, 0.5, 0.25];
  const out: number[] = [];
  let pos = a;
  while (pos < b - 1e-9) {
    const d = sizes.find((s) => {
      if (pos + s > b + 1e-9 || s > len + 1e-9) return false;
      if (s === len) return Math.abs(pos) < 1e-9; // whole-bar rest only from the downbeat
      if (s === 3 && !isCompound(m)) return false; // no dotted-half rests in simple time
      if (s === 1.5) return Math.abs(pos % 1.5) < 1e-9;
      if (s === 1 && isCompound(m)) return false;
      return Math.abs(pos % s) < 1e-9;
    });
    const step = d ?? 0.25;
    out.push(step);
    pos += step;
  }
  return out;
}
