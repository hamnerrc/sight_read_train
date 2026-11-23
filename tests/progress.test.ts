import { describe, expect, it } from "vitest";
import type { Grade } from "../src/trainer/grader";
import { BREAK_MS } from "../src/trainer/scheduler";
import { applyGrade, focusFor, newProgress } from "../src/trainer/progress";

function grade(pass: boolean, items: Record<string, [number, number]> = {}, timingPass: boolean | null = null): Grade {
  return { mode: timingPass === null ? "wait" : "tempo", pass, timingPass, accuracy: pass ? 1 : 0.8, eventOk: [], errors: [], timing: null, items, bpm: 60, durationMs: 0 };
}

describe("difficulty staircase", () => {
  it("moves up after 3 passes and down after 1 miss, never below 1", () => {
    const p = newProgress();
    applyGrade(p, grade(true), 0);
    applyGrade(p, grade(true), 0);
    expect(p.level).toBe(1);
    applyGrade(p, grade(true), 0);
    expect(p.level).toBe(2);
    applyGrade(p, grade(false), 0);
    expect(p.level).toBe(1);
    applyGrade(p, grade(false), 0);
    expect(p.level).toBe(1);
    expect(p.best).toBe(2);
  });

  it("holds a simulated learner near an 80% pass rate", () => {
    const p = newProgress();
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const skill = 60;
    let passes = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const pPass = 1 / (1 + Math.exp((p.level - skill) / 2));
      const pass = rand() < pPass;
      if (i > 2000) passes += pass ? 1 : 0;
      applyGrade(p, grade(pass), 0);
    }
    const rate = passes / (N - 2001);
    expect(rate).toBeGreaterThan(0.76);
    expect(rate).toBeLessThan(0.83);
  });

  it("adjusts tempo from the timing grade independently", () => {
    const p = newProgress();
    for (let i = 0; i < 3; i++) applyGrade(p, grade(true, {}, true), 0);
    expect(p.tempoFactor).toBeCloseTo(1.05);
    applyGrade(p, grade(true, {}, false), 0);
    expect(p.tempoFactor).toBeCloseTo(1);
    expect(p.level).toBe(2); // notes kept passing
  });
});

describe("item spaced repetition", () => {
  it("brings a missed item back after 3 exercises and clears it after 3, 8, 25 and a break", () => {
    const p = newProgress();
    const item = "read:treble:33";
    let t = 0;
    applyGrade(p, grade(false, { [item]: [0, 1] }), t);
    expect(focusFor(p, t)).toEqual([]);
    for (let i = 0; i < 2; i++) applyGrade(p, grade(true), t);
    expect(focusFor(p, t)).toEqual([]);
    applyGrade(p, grade(true), t);
    expect(focusFor(p, t)).toEqual([item]);
    // passes on each due occasion
    const passWhenDue = () => {
      let guard = 0;
      while (!focusFor(p, t).includes(item)) {
        applyGrade(p, grade(true), t);
        if (++guard > 100) throw new Error("never due");
      }
      applyGrade(p, grade(true, { [item]: [2, 0] }), t);
    };
    passWhenDue(); // after 3
    passWhenDue(); // after 8
    passWhenDue(); // after 25
    expect(p.cards[item]).toBeDefined();
    t += BREAK_MS;
    passWhenDue(); // after the break
    expect(p.cards[item]).toBeUndefined();
  });

  it("restarts the schedule on another miss", () => {
    const p = newProgress();
    const item = "int:R:5";
    applyGrade(p, grade(false, { [item]: [0, 1] }), 0);
    for (let i = 0; i < 3; i++) applyGrade(p, grade(true), 0);
    applyGrade(p, grade(true, { [item]: [1, 0] }), 0);
    expect(p.cards[item]!.step).toBe(1);
    applyGrade(p, grade(false, { [item]: [0, 1] }), 0);
    expect(p.cards[item]!.step).toBe(0);
  });
});
