/**
 * Streaming note detector: onsets from spectral flux, pitches from score-informed
 * harmonic matching on the *new* energy after each onset.
 *
 * 1. Onsets: 2048-sample frames every 256 samples; log-magnitude spectral flux with an
 *    adaptive threshold and peak picking. Gives the time of each attack to about ±5 ms.
 * 2. Pitch: after an onset, take a long window (8192 samples, 16384 when bass notes are
 *    expected) starting just after the hammer noise and stopping before the next onset. Subtract
 *    the spectrum from just before the onset, which leaves what the attack added (so
 *    ringing and pedalled notes don't count again). Then iteratively find the MIDI note
 *    whose inharmonic partial series best explains that energy, cancel its partials, and repeat.
 *    Expected pitches (the score prior) get a lower bar than unexpected ones, so the detector
 *    is quick to confirm the right note and slow to call a wrong note.
 *
 * Everything here is pure TypeScript on Float32 samples, so it runs in unit tests with
 * synthetic audio as well as in the browser.
 */
import { magnitude } from "./fft";
import { inharmonicity } from "./piano-model";
import { midiToHz } from "../music/pitch";

export interface Detection {
  /** Onset time in ms from the start of the stream. */
  time: number;
  /** Onset sample index. */
  sample: number;
  midis: number[];
  /** 0–1 per detected pitch. Below ~0.5 means "probably a ghost". */
  confidence: number[];
  /** Attack strength in dB (relative to full scale). */
  db: number;
}

export interface DetectorOptions {
  a4?: number;
  /** Flux must exceed this absolute floor (set from the room-noise calibration). */
  fluxFloor?: number;
  /** Minimum gap between onsets, ms. */
  minGapMs?: number;
  /** Relative salience needed for an expected pitch / an unexpected pitch. */
  priorRatio?: number;
  strayRatio?: number;
}

const ONSET_N = 2048;
const HOP = 256;
const RING = 1 << 17;
const LOWEST = 21;
const HIGHEST = 108;

export class Detector {
  readonly sr: number;
  a4: number;
  fluxFloor: number;
  private minGap: number;
  private priorRatio: number;
  private strayRatio: number;
  private ring = new Float32Array(RING);
  private written = 0;
  private nextFrameEnd = ONSET_N;
  private prevLog: Float64Array | null = null;
  private flux: number[] = [];
  private fluxEnd: number[] = [];
  private lastOnset = -Infinity;
  private pending: { sample: number; flux: number }[] = [];
  private attackFlux: number[] = [];
  private prevAnalysed = -Infinity;
  /** Expected pitches around a given stream time (ms). */
  prior: (ms: number) => number[] = () => [];
  /** Latest frame level in dBFS, for the input meter. */
  levelDb = -120;
  /** Latest onset flux, for calibration. */
  lastFlux = 0;
  /** Recent flux values (for the noise-floor calibration). */
  readonly fluxLog: number[] = [];

  constructor(sr: number, o: DetectorOptions = {}) {
    this.sr = sr;
    this.a4 = o.a4 ?? 440;
    this.fluxFloor = o.fluxFloor ?? 4;
    this.minGap = Math.round(((o.minGapMs ?? 45) / 1000) * sr);
    this.priorRatio = o.priorRatio ?? 0.3;
    this.strayRatio = o.strayRatio ?? 0.35;
  }

  get timeMs(): number {
    return (this.written / this.sr) * 1000;
  }

  push(chunk: Float32Array): Detection[] {
    for (let i = 0; i < chunk.length; i++) this.ring[(this.written + i) & (RING - 1)] = chunk[i]!;
    this.written += chunk.length;
    while (this.written >= this.nextFrameEnd) {
      this.frame(this.nextFrameEnd);
      this.nextFrameEnd += HOP;
    }
    return this.drain(false);
  }

  /** Analyse any onsets still waiting for audio (end of stream). */
  flush(): Detection[] {
    return this.drain(true);
  }

  private segment(start: number, n: number): Float32Array {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = start + i;
      out[i] = j >= 0 && j < this.written && j >= this.written - RING ? this.ring[j & (RING - 1)]! : 0;
    }
    return out;
  }

  private frame(end: number): void {
    const x = this.segment(end - ONSET_N, ONSET_N);
    let e = 0;
    for (let i = 0; i < ONSET_N; i++) e += x[i]! * x[i]!;
    this.levelDb = 10 * Math.log10(e / ONSET_N + 1e-12);
    const mag = magnitude(x, 0, ONSET_N);
    const lo = Math.floor((25 * ONSET_N) / this.sr);
    const hi = Math.ceil((8000 * ONSET_N) / this.sr);
    const log = new Float64Array(hi);
    let f = 0;
    for (let k = lo; k < hi; k++) {
      log[k] = Math.log1p(1000 * mag[k]!);
      if (this.prevLog) f += Math.max(0, log[k]! - this.prevLog[k]!);
    }
    this.prevLog = log;
    this.flux.push(f);
    this.fluxEnd.push(end);
    this.fluxLog.push(f);
    if (this.fluxLog.length > 2000) this.fluxLog.splice(0, 1000);
    if (this.flux.length > 400) {
      this.flux.splice(0, 200);
      this.fluxEnd.splice(0, 200);
    }
    this.pick();
  }

  /** Peak picking with 2 frames of look-ahead. */
  private pick(): void {
    const n = this.flux.length;
    const j = n - 3;
    if (j < 3) return;
    const fj = this.flux[j]!;
    for (let k = j - 3; k <= j + 2; k++) if (k !== j && this.flux[k]! > fj) return;
    let mean = 0;
    let c = 0;
    for (let k = Math.max(0, j - 20); k < j - 2; k++) {
      mean += this.flux[k]!;
      c++;
    }
    mean = c ? mean / c : 0;
    if (fj < this.fluxFloor || fj < 1.6 * mean + 0.5 * this.fluxFloor) return;
    // The frame whose flux peaks has the attack roughly a quarter of the way into its newest hop range.
    const sample = this.fluxEnd[j]! - Math.round(ONSET_N * 0.25);
    if (sample - this.lastOnset < this.minGap) return;
    this.lastOnset = sample;
    this.lastFlux = fj;
    this.pending.push({ sample, flux: fj });
  }

  private drain(final: boolean): Detection[] {
    const out: Detection[] = [];
    while (this.pending.length) {
      const { sample: s0, flux } = this.pending[0]!;
      const next = this.pending[1]?.sample;
      const ms = (s0 / this.sr) * 1000;
      const expected = this.prior(ms);
      const wantN = expected.some((m) => m < 45) ? 16384 : 8192;
      const a = s0 + Math.round(0.012 * this.sr);
      let avail = next !== undefined ? next - Math.round(0.004 * this.sr) - a : this.written - a;
      if (next === undefined && avail < wantN && !final) break;
      avail = Math.min(avail, wantN);
      let n = 1024;
      while (n * 2 <= avail) n *= 2;
      this.pending.shift();
      // only an onset as strong as a typical attack may count as a re-strike of a ringing note
      const typical = this.attackFlux.length ? [...this.attackFlux].sort((x, y) => x - y)[Math.floor(this.attackFlux.length / 2)]! : 0;
      const det = this.analyse(s0, a, n, expected, flux >= 0.5 * typical);
      if (det.confidence.some((c) => c >= 0.5)) {
        this.attackFlux.push(flux);
        if (this.attackFlux.length > 15) this.attackFlux.shift();
      }
      // an onset with no pitched new energy (a damper release, a knock) is not a note
      if (det.confidence.some((c) => c >= 0.5)) out.push(det);
    }
    return out;
  }

  private analyse(s0: number, a: number, n: number, expected: number[], strongAttack: boolean): Detection {
    const size = n * 2;
    const post = magnitude(this.segment(a, n), 0, n, size);
    // "Before" spectrum: up to n samples before the onset, but never reaching back past the
    // previous onset (that would make the previous note look new again).
    const preEnd = s0 - Math.round(0.004 * this.sr);
    const preStart = Math.max(preEnd - n, this.prevAnalysed + Math.round(0.012 * this.sr));
    const preLen = Math.max(512, preEnd - preStart);
    const pre = magnitude(this.segment(preEnd - preLen, preLen), 0, preLen, size);
    this.prevAnalysed = s0;
    const d = new Float64Array(post.length);
    for (let k = 0; k < d.length; k++) d[k] = Math.max(0, post[k]! - pre[k]!);
    const { midis, confidence } = this.verify(d, size, expected, post, strongAttack ? pre : undefined);
    let e = 0;
    for (let k = 0; k < post.length; k++) e += post[k]! * post[k]!;
    return { time: (s0 / this.sr) * 1000, sample: s0, midis, confidence, db: 10 * Math.log10(e + 1e-12) };
  }

  /** Harmonic matching with iterative cancellation. Exposed for tests. */
  verify(spec: Float64Array, size: number, expected: number[], total?: Float64Array, before?: Float64Array): { midis: number[]; confidence: number[] } {
    const res = Float64Array.from(spec);
    const binHz = this.sr / size;
    // noise floor: median of the analysed band
    const band = Array.from(res.slice(Math.floor(40 / binHz), Math.floor(5000 / binHz))).sort((x, y) => x - y);
    const floor = band[Math.floor(band.length / 2)] ?? 0;
    const partials = (m: number) => {
      const f0 = midiToHz(m, this.a4);
      const B = inharmonicity(m);
      const maxH = m < 40 ? 14 : m < 60 ? 10 : m < 80 ? 7 : 4;
      const list: { lo: number; hi: number; h: number }[] = [];
      for (let h = 1; h <= maxH; h++) {
        const f = h * f0 * Math.sqrt(1 + B * h * h);
        if (f > Math.min(this.sr / 2 - 200, 7500)) break;
        const cents = Math.min(45, 25 + 3 * h);
        const r = Math.pow(2, cents / 1200);
        let lo = Math.floor(f / r / binHz);
        let hi = Math.ceil((f * r) / binHz);
        const c = Math.round(f / binHz);
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
        list.push({ lo, hi, h });
      }
      return list;
    };
    const peaks = (m: number, on: Float64Array = res) =>
      partials(m).map((p) => {
        let v = 0;
        for (let k = p.lo; k <= p.hi; k++) v = Math.max(v, on[k] ?? 0);
        return { ...p, v };
      });
    const score = (m: number, on: Float64Array = res, skip?: (lo: number, hi: number) => boolean) => {
      const ps = peaks(m, on).filter((p) => !skip?.(p.lo, p.hi));
      if (!ps.length) return 0;
      let s = 0;
      let support = 0;
      for (const p of ps) {
        s += p.v / Math.sqrt(p.h);
        if (p.v > 4 * floor + 1e-6) support++;
      }
      // a real note shows most of its partials; a sub-octave ghost misses its odd ones
      return s * Math.pow(support / ps.length, 1.5);
    };
    const prior = new Set(expected);
    const midis: number[] = [];
    const confidence: number[] = [];
    // Reference level: the strongest new note, or a share of everything sounding, whichever is
    // larger. A re-struck note adds little *new* energy, and the second term stops ringing
    // notes from looking significant next to it.
    let refNew = 0;
    for (let m = LOWEST; m <= HIGHEST; m++) refNew = Math.max(refNew, score(m));
    let tot = refNew;
    if (total) {
      tot = 0;
      for (let m = LOWEST; m <= HIGHEST; m++) tot = Math.max(tot, score(m, total));
    }
    const ref = Math.max(refNew, 0.35 * tot);
    if (refNew > 1e-4) {
      for (let iter = 0; iter < 8; iter++) {
        let best = -1;
        let bestS = 0;
        // Unexpected candidates are judged only on partials no detected note explains, so a
        // played note's sub-octave (whose even partials are that note) can't pass as a wrong note.
        const taken = (lo: number, hi: number) => midis.some((o) => partials(o).some((q) => q.lo <= hi + 1 && q.hi >= lo - 1));
        for (let m = LOWEST; m <= HIGHEST; m++) {
          if (midis.includes(m)) continue;
          const s = prior.has(m) ? score(m) * 1.25 : score(m, res, midis.length ? taken : undefined);
          if (s > bestS) {
            bestS = s;
            best = m;
          }
        }
        if (best < 0) break;
        const ratio = bestS / ref;
        if (ratio < (prior.has(best) ? this.priorRatio : this.strayRatio)) break;
        midis.push(best);
        confidence.push(Math.min(1, prior.has(best) ? 0.5 + ratio : ratio / 0.8));
        // cancel this note's partials, keeping energy above a smooth envelope (another note's share)
        const ps = peaks(best);
        ps.forEach((p, i) => {
          const nb = [ps[i - 1]?.v, ps[i + 1]?.v].filter((x): x is number => x !== undefined);
          const smooth = nb.length ? nb.reduce((x, y) => x + y, 0) / nb.length : p.v;
          const est = Math.min(p.v, Math.max(smooth, 0.6 * p.v));
          const keep = p.v > 0 ? 1 - est / p.v : 0;
          for (let k = p.lo - 1; k <= p.hi + 1; k++) if (k >= 0 && k < res.length) res[k] = res[k]! * keep;
        });
      }
    }

    // Masked notes: an expected note an octave, a twelfth or two octaves above a detected note
    // has every partial on top of that note's partials, so a single spectrum can't tell
    // whether it was played. Give the benefit of the doubt (confidence exactly 0.5) rather
    // than risk a false "missing". Per-key calibration templates can tighten this later.
    for (const m of expected) {
      if (midis.includes(m)) continue;
      if ([m - 12, m - 19, m - 24].some((l) => midis.includes(l) && confidence[midis.indexOf(l)]! >= 0.5)) {
        midis.push(m);
        confidence.push(0.5);
      }
    }

    // Re-strike: an onset happened, nothing new was confidently identified, and an expected
    // note is clearly sounding. A struck wrong note would have shown up as new energy, so
    // this is the expected note played again with its partials cancelling the ringing ones.
    if (total && before && !confidence.some((c) => c >= 0.5)) {
      let pick = -1;
      let pickS = 0;
      for (const m of expected) {
        if (score(m, total) < 0.5 * tot) continue;
        // a damper release also triggers onsets; there the note's energy falls fast
        if (score(m, total) < 0.8 * score(m, before)) continue;
        const sNew = score(m);
        if (pick < 0 || sNew > pickS) {
          pick = m;
          pickS = sNew;
        }
      }
      if (pick >= 0) {
        const i = midis.indexOf(pick);
        if (i >= 0) confidence[i] = 0.6;
        else {
          midis.push(pick);
          confidence.push(0.6);
        }
      }
    }
    return { midis, confidence };
  }
}
