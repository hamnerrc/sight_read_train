/**
 * Detector regression tests on synthetic piano audio (see src/audio/synth-test-signal.ts).
 * These guard the numbers recorded in docs/AUDIO.md; real-piano fixtures come later.
 */
import { describe, expect, it } from "vitest";
import { Detector, type Detection } from "../src/audio/detector";
import { addNote, addNoise } from "../src/audio/synth-test-signal";

const sr = 48000;

interface N {
  t: number;
  m: number;
  d: number;
  v?: number;
}

function run(notes: N[], total: number, prior: (ms: number) => number[], bScale = 1, seed = 1): Detection[] {
  const x = new Float32Array(Math.floor(total * sr));
  notes.forEach((n, i) => addNote(x, sr, Math.floor(n.t * sr), n.m, n.d, { seed: seed + i, bScale, velocity: n.v }));
  addNoise(x, 0.0005, seed);
  const det = new Detector(sr);
  det.prior = prior;
  const out: Detection[] = [];
  for (let i = 0; i < x.length; i += 128) out.push(...det.push(x.subarray(i, i + 128)));
  out.push(...det.flush());
  return out;
}

const sure = (d: Detection) => d.midis.filter((_, i) => d.confidence[i]! >= 0.5).sort((a, b) => a - b);

describe("detector on synthetic piano", () => {
  it("finds single notes across the keyboard, with and without the score prior", { timeout: 60000 }, () => {
    for (let m = 21; m <= 108; m += 4) {
      for (const withPrior of [true, false]) {
        const d = run([{ t: 0.3, m, d: 0.8 }], 1.3, () => (withPrior ? [m] : []), 1, m);
        expect(d.length, `onsets for ${m}`).toBe(1);
        expect(sure(d[0]!), `pitch ${m} prior=${withPrior}`).toEqual([m]);
        expect(Math.abs(d[0]!.time - 300)).toBeLessThan(10);
      }
    }
  });

  it("follows a legato scale (notes overlapping) in several registers", { timeout: 60000 }, () => {
    for (const base of [36, 55, 74]) {
      const scale = [0, 2, 4, 5, 7, 9, 11, 12, 12, 11, 9, 7].map((x) => base + x);
      const notes = scale.map((m, i) => ({ t: 0.3 + i * 0.25, m, d: 0.6 }));
      const d = run(notes, 0.3 + scale.length * 0.25 + 1, (ms) => notes.filter((n) => Math.abs(n.t * 1000 - ms) < 300).map((n) => n.m));
      expect(d.length).toBe(scale.length);
      d.forEach((x, i) => {
        expect(sure(x), `base ${base} note ${i}`).toContain(scale[i]);
        expect(sure(x).every((m) => notes.some((n) => n.m === m && Math.abs(n.t * 1000 - x.time) < 300))).toBe(true);
        expect(Math.abs(x.time - notes[i]!.t * 1000)).toBeLessThan(12);
      });
    }
  });

  it("does not report a damper release as a new note", () => {
    const d = run([{ t: 0.3, m: 64, d: 0.5 }], 1.5, () => [64]);
    expect(d.length).toBe(1);
  });

  it("verifies chords and catches wrong notes in them", { timeout: 120000 }, () => {
    let r = 7;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const shapes = [[0, 4, 7], [0, 3, 7], [0, 3, 8], [0, 5, 9], [0, 4, 7, 10], [0, 4], [0, 3], [0, 7], [0, 9]];
    let trials = 0;
    let complete = 0;
    let phantom = 0;
    let wrongTrials = 0;
    let wrongNamed = 0;
    let wrongPassed = 0;
    for (let t = 0; t < 40; t++) {
      const shape = shapes[Math.floor(rnd() * shapes.length)]!;
      const root = 36 + Math.floor(rnd() * 45);
      const chord = shape.map((x) => root + x);
      const v = 0.35 + 0.3 * rnd();
      const d = run(chord.map((m) => ({ t: 0.3, m, d: 0.8, v })), 1.3, () => chord, 1, t * 13 + 1);
      trials++;
      const got = d.length === 1 ? sure(d[0]!) : [];
      if (chord.every((m) => got.includes(m))) complete++;
      if (got.some((m) => !chord.includes(m))) phantom++;
      const k = Math.floor(rnd() * chord.length);
      const played = chord.map((m, i) => (i === k ? m + (rnd() < 0.5 ? 1 : -1) : m));
      if (new Set(played).size !== played.length) continue;
      const d2 = run(played.map((m) => ({ t: 0.3, m, d: 0.8, v })), 1.3, () => chord, 1, t * 13 + 5);
      const got2 = d2.length === 1 ? sure(d2[0]!) : [];
      wrongTrials++;
      if (got2.includes(played[k]!)) wrongNamed++;
      // the grade only goes wrong if every expected note still looks played and nothing is extra
      if (chord.every((m) => got2.includes(m)) && got2.every((m) => chord.includes(m))) wrongPassed++;
    }
    expect(complete / trials).toBeGreaterThanOrEqual(0.92);
    expect(phantom).toBeLessThanOrEqual(1);
    expect(wrongNamed / wrongTrials).toBeGreaterThanOrEqual(0.85);
    expect(wrongPassed).toBe(0);
  });

  it("gives a masked octave the benefit of the doubt", () => {
    const d = run([{ t: 0.3, m: 48, d: 0.8 }, { t: 0.3, m: 60, d: 0.8 }], 1.3, () => [48, 60]);
    expect(sure(d[0]!)).toEqual([48, 60]);
  });
});
