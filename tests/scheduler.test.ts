import { describe, expect, it } from "vitest";
import { BREAK_MS, due, isDue, onMiss, onPass } from "../src/trainer/scheduler";

describe("spaced repetition scheduler", () => {
  it("brings a miss back after 3 solves", () => {
    const c = onMiss("x", { solves: 10, now: 0 });
    expect(isDue(c, { solves: 12, now: 0 })).toBe(false);
    expect(isDue(c, { solves: 13, now: 0 })).toBe(true);
  });

  it("graduates after passes at 3, 8, 25 solves and an 8-hour break", () => {
    let c = onMiss("x", { solves: 0, now: 0 });
    c = onPass(c, { solves: 3, now: 0 })!;
    expect(c.dueClock).toBe(11);
    c = onPass(c, { solves: 11, now: 0 })!;
    expect(c.dueClock).toBe(36);
    c = onPass(c, { solves: 36, now: 1000 })!;
    expect(isDue(c, { solves: 99, now: 1000 + BREAK_MS - 1 })).toBe(false);
    expect(isDue(c, { solves: 99, now: 1000 + BREAK_MS })).toBe(true);
    expect(onPass(c, { solves: 99, now: 1000 + BREAK_MS })).toBeNull();
  });

  it("lists due cards most overdue first", () => {
    const a = onMiss("a", { solves: 5, now: 0 });
    const b = onMiss("b", { solves: 1, now: 0 });
    expect(due([a, b], { solves: 9, now: 0 }).map((c) => c.key)).toEqual(["b", "a"]);
  });
});
