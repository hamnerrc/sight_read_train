import { describe as group, expect, it } from "vitest";
import { generate } from "../src/curriculum/generator";
import { LADDER } from "../src/curriculum/levels";
import { Follower, describe } from "../src/trainer/grader";
import type { Exercise, InputEvent } from "../src/types";

const ev = (time: number, midis: number[], confidence = 1): InputEvent => ({ time, midis, source: "keyboard", confidence });

function perfect(ex: Exercise, bpm: number, start = 1000, jitter = () => 0): InputEvent[] {
  return ex.events.map((e) => ev(start + e.beat * (60000 / bpm) + jitter(), e.midis));
}

const waitLevel = 8;
const tempoLevel = LADDER.findIndex((l) => l.hands === "together") + 3;

group("wait mode", () => {
  it("passes a clean run regardless of timing", () => {
    const ex = generate(waitLevel, 1);
    const f = new Follower(ex);
    ex.events.forEach((e, i) => f.input(ev(i * 3000, e.midis)));
    expect(f.done).toBe(true);
    const g = f.grade();
    expect(g.pass).toBe(true);
    expect(g.timingPass).toBeNull();
    expect(g.accuracy).toBe(1);
  });

  it("waits on a wrong note and reports it as the first error", () => {
    const ex = generate(waitLevel, 2);
    const f = new Follower(ex);
    ex.events.forEach((e, i) => {
      if (i === 2) f.input(ev(i * 1000 - 500, [e.midis[0]! + 1]));
      f.input(ev(i * 1000, e.midis));
    });
    const g = f.grade();
    expect(g.pass).toBe(false);
    expect(g.firstError).toMatchObject({ event: 2, kind: "wrong", played: ex.events[2]!.midis[0]! + 1 });
    expect(describe(ex, g)).toMatch(/Bar 1, beat 3: you played/);
    expect(g.eventOk.filter((x) => !x).length).toBe(1);
  });

  it("ignores low-confidence stray detections", () => {
    const ex = generate(waitLevel, 3);
    const f = new Follower(ex);
    ex.events.forEach((e, i) => {
      f.input(ev(i * 1000 - 300, [30], 0.2));
      f.input(ev(i * 1000, e.midis));
    });
    expect(f.grade().pass).toBe(true);
  });

  it("charges skill items for misses", () => {
    const ex = generate(waitLevel, 4);
    const f = new Follower(ex);
    ex.events.forEach((e, i) => {
      if (i === 0) f.input(ev(-1, [e.midis[0]! + 2]));
      f.input(ev(i * 1000, e.midis));
    });
    const g = f.grade();
    const readItem = ex.events[0]!.items[0]![0]!;
    expect(g.items[readItem]![1]).toBeGreaterThanOrEqual(1);
  });
});

group("tempo mode", () => {
  it("passes notes and timing for an on-grid performance with small jitter", () => {
    const ex = generate(tempoLevel, 5);
    const bpm = 72;
    const f = new Follower(ex, { bpm, startMs: 1000 });
    let s = 1;
    const jitter = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 40;
    for (const e of perfect(ex, bpm, 1000, jitter)) f.input(e);
    f.tick(f.endMs + 1);
    const g = f.grade();
    expect(g.pass).toBe(true);
    expect(g.timingPass).toBe(true);
    expect(Math.abs(g.timing!.meanMs)).toBeLessThan(25);
  });

  it("grades timing separately: right notes, one late onset", () => {
    const ex = generate(tempoLevel, 6);
    const bpm = 60;
    const f = new Follower(ex, { bpm, startMs: 0 });
    const ins = perfect(ex, bpm, 0);
    ins[3] = { ...ins[3]!, time: ins[3]!.time + 300 };
    for (const e of ins.sort((a, b) => a.time - b.time)) f.input(e);
    f.tick(f.endMs + 1);
    const g = f.grade();
    expect(g.pass).toBe(true);
    expect(g.timingPass).toBe(false);
    expect(g.firstTimingError).toMatchObject({ event: 3, kind: "late" });
    expect(describe(ex, g)).toMatch(/Notes clean\..*300 ms late/);
  });

  it("treats a stop (very late note) as a missed note", () => {
    const ex = generate(tempoLevel, 7);
    const bpm = 60;
    const f = new Follower(ex, { bpm, startMs: 0 });
    const ins = perfect(ex, bpm, 0);
    const k = 4;
    for (const e of ins) {
      if (ins.indexOf(e) === k) continue;
      f.input(e);
    }
    f.tick(f.endMs + 1);
    const g = f.grade();
    expect(g.pass).toBe(false);
    expect(g.firstError).toMatchObject({ event: k, kind: "missing" });
  });

  it("flags a wrong note in a chord", () => {
    const ex = generate(tempoLevel, 8);
    const i = ex.events.findIndex((e) => e.midis.length >= 2);
    expect(i).toBeGreaterThanOrEqual(0);
    const bpm = 60;
    const f = new Follower(ex, { bpm, startMs: 0 });
    for (const [j, e] of perfect(ex, bpm, 0).entries()) f.input(j === i ? { ...e, midis: [e.midis[0]!, e.midis[1]! + 1] } : e);
    f.tick(f.endMs + 1);
    const g = f.grade();
    expect(g.pass).toBe(false);
    expect(g.firstError).toMatchObject({ event: i, kind: "wrong", expected: ex.events[i]!.midis[1] });
  });
});

group("wait mode, repeated pitches", () => {
  it("counts a confident wrong note even if it was just played", () => {
    const ex = generate(waitLevel, 11);
    const f = new Follower(ex);
    const first = ex.events[0]!.midis[0]!;
    const i = ex.events.findIndex((e, k) => k > 0 && e.midis[0] !== first);
    ex.events.forEach((e, k) => {
      if (k === i) f.input(ev(k * 100 - 10, [first]));
      f.input(ev(k * 100, e.midis));
    });
    expect(f.grade().pass).toBe(false);
  });
  it("ignores a low-confidence re-detection of a ringing note", () => {
    const ex = generate(waitLevel, 11);
    const f = new Follower(ex);
    const first = ex.events[0]!.midis[0]!;
    const i = ex.events.findIndex((e, k) => k > 0 && e.midis[0] !== first);
    ex.events.forEach((e, k) => {
      if (k === i) f.input(ev(k * 100 - 10, [first], 0.6));
      f.input(ev(k * 100, e.midis));
    });
    expect(f.grade().pass).toBe(true);
  });
});
