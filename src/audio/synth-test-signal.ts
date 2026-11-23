/**
 * Synthetic piano-like tones for testing the detector without a piano: inharmonic partials,
 * register-dependent spectra and decay, a hammer-noise transient, plus optional room noise.
 * Deliberately harsher than a real piano in places (weak bass fundamentals, stretched partials).
 */
import { midiToHz } from "../music/pitch";
import { inharmonicity } from "./piano-model";

export interface ToneOpts {
  a4?: number;
  velocity?: number;
  /** Multiply the true inharmonicity (to test robustness to a different piano). */
  bScale?: number;
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Add one note into `out`, starting at sample `at`, sounding for `dur` seconds (then a quick damper release). */
export function addNote(out: Float32Array, sr: number, at: number, m: number, dur: number, o: ToneOpts = {}): void {
  const r = rng((o.seed ?? 1) * 7919 + m);
  const f0 = midiToHz(m, o.a4 ?? 440);
  const B = inharmonicity(m) * (o.bScale ?? 1);
  const v = o.velocity ?? 0.5;
  const tau0 = 0.4 + 4 * Math.pow(2, -(m - 21) / 18); // seconds; long in the bass, short in the treble
  const partials: { f: number; a: number; tau: number; ph: number }[] = [];
  for (let h = 1; h <= 40; h++) {
    const f = h * f0 * Math.sqrt(1 + B * h * h);
    if (f > sr / 2 - 500 || f > 9000) break;
    let a = 1 / Math.pow(h, 1.1);
    if (m < 40 && h === 1) a *= 0.15; // weak bass fundamentals
    if (m < 33 && h === 2) a *= 0.4;
    a *= 0.7 + 0.6 * r();
    partials.push({ f, a, tau: tau0 / (1 + 0.25 * h), ph: r() * 2 * Math.PI });
  }
  const norm = v * 0.25 / Math.sqrt(partials.reduce((s, p) => s + p.a * p.a, 0) || 1);
  const n = Math.floor((dur + 0.15) * sr);
  const attack = Math.floor(0.002 * sr);
  const release = Math.floor(dur * sr);
  for (let i = 0; i < n && at + i < out.length; i++) {
    const t = i / sr;
    let env = i < attack ? i / attack : 1;
    if (i > release) env *= Math.exp(-(i - release) / (0.03 * sr));
    let s = 0;
    for (const p of partials) s += p.a * Math.exp(-t / p.tau) * Math.sin(2 * Math.PI * p.f * t + p.ph);
    out[at + i]! += s * env * norm;
  }
  // hammer thump
  const nt = Math.floor(0.008 * sr);
  for (let i = 0; i < nt && at + i < out.length; i++) out[at + i]! += (r() * 2 - 1) * v * 0.05 * (1 - i / nt);
}

export function addNoise(out: Float32Array, level: number, seed = 3): void {
  const r = rng(seed);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    lp = 0.95 * lp + 0.05 * (r() * 2 - 1); // low-frequency rumble (laptop fan / room)
    out[i]! += level * ((r() * 2 - 1) * 0.5 + lp * 3);
  }
}
