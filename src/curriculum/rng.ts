/** Small seeded PRNG (mulberry32) so every exercise regenerates exactly from its seed. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error("pick from empty list");
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  /** Pick by non-negative weights; falls back to uniform if all weights are 0. */
  weighted<T>(xs: readonly T[], w: readonly number[]): T {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(xs);
    let r = this.next() * total;
    for (let i = 0; i < xs.length; i++) {
      r -= w[i]!;
      if (r < 0) return xs[i]!;
    }
    return xs[xs.length - 1]!;
  }
}

export function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
