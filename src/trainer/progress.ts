/**
 * Learner state and how one graded exercise changes it.
 *
 * Difficulty: a 3-up / 1-down staircase on the level. Three note-clean exercises in a row
 * move up one level; any notes miss moves down one. This converges where p³ = ½, i.e. a
 * pass rate of about 79%: the "optimally deliberate 80%" from docs/QUESTIONS.md #9. There
 * is no ceiling: the ladder continues forever.
 *
 * Tempo: a second, independent 3-up / 1-down staircase on a tempo factor, driven by the
 * timing grade in tempo-mode levels (±5% per step).
 *
 * Spaced repetition, customised for reading (#10): what comes back is not the exact
 * excerpt (re-reading it would test memory, not reading) but the *skill items* behind each
 * miss, such as reading A5 on the treble staff, the F♯ in G major, or a left-hand sixth.
 * A missed item is due again after 3 exercises, then 8, then 25, then after an 8-hour break,
 * and it leaves review after it has been played cleanly on each of those occasions. Due
 * items are fed to the generator, which writes them into fresh music.
 */
import type { Grade } from "./grader";
import { type Card, type Clock, due, isDue, onMiss, onPass } from "./scheduler";

export const UP_AFTER = 3;
export const TEMPO_STEP = 1.05;
export const TEMPO_MIN = 0.4;
export const TEMPO_MAX = 1.6;
/** Most review items written into one exercise. */
export const MAX_FOCUS = 3;

export interface Progress {
  level: number;
  best: number;
  run: number;
  tempoFactor: number;
  tempoRun: number;
  /** Graded exercises so far (the spaced-repetition clock). */
  solves: number;
  cards: Record<string, Card>;
  /** Lifetime [clean, missed] per item, for the advisor. */
  itemStats: Record<string, [number, number]>;
}

export interface HistoryRecord {
  t: number;
  level: number;
  seed: number;
  focus: string[];
  mode: "wait" | "tempo";
  pass: boolean;
  timingPass: boolean | null;
  accuracy: number;
  bpm: number;
  meanAbsMs: number | null;
  sdMs: number | null;
  errors: number;
  /** First error message, for the history list. */
  note?: string;
}

export function newProgress(): Progress {
  return { level: 1, best: 1, run: 0, tempoFactor: 1, tempoRun: 0, solves: 0, cards: {}, itemStats: {} };
}

export interface Change {
  levelFrom: number;
  levelTo: number;
  tempoFrom: number;
  tempoTo: number;
  newReviews: string[];
  clearedReviews: string[];
}

/** Apply one graded exercise. Mutates and returns what changed. */
export function applyGrade(p: Progress, g: Grade, now: number): Change {
  const ch: Change = { levelFrom: p.level, levelTo: p.level, tempoFrom: p.tempoFactor, tempoTo: p.tempoFactor, newReviews: [], clearedReviews: [] };
  const clock: Clock = { solves: p.solves, now };

  // spaced repetition on items, evaluated against the clock *before* this exercise counts
  for (const [item, [ok, bad]] of Object.entries(g.items)) {
    const s = (p.itemStats[item] ??= [0, 0]);
    s[0] += ok;
    s[1] += bad;
    const card = p.cards[item];
    if (bad > 0) {
      if (!card) ch.newReviews.push(item);
      p.cards[item] = onMiss(item, { solves: p.solves + 1, now });
    } else if (card && isDue(card, clock)) {
      const next = onPass(card, { solves: p.solves + 1, now });
      if (next) p.cards[item] = next;
      else {
        delete p.cards[item];
        ch.clearedReviews.push(item);
      }
    }
  }
  p.solves++;

  // level staircase (notes grade)
  if (g.pass) {
    p.run++;
    if (p.run >= UP_AFTER) {
      p.level++;
      p.run = 0;
    }
  } else {
    p.level = Math.max(1, p.level - 1);
    p.run = 0;
  }
  p.best = Math.max(p.best, p.level);
  ch.levelTo = p.level;

  // tempo staircase (timing grade)
  if (g.timingPass !== null) {
    if (g.timingPass) {
      p.tempoRun++;
      if (p.tempoRun >= UP_AFTER) {
        p.tempoFactor = Math.min(TEMPO_MAX, p.tempoFactor * TEMPO_STEP);
        p.tempoRun = 0;
      }
    } else {
      p.tempoFactor = Math.max(TEMPO_MIN, p.tempoFactor / TEMPO_STEP);
      p.tempoRun = 0;
    }
  }
  ch.tempoTo = p.tempoFactor;
  return ch;
}

/** Review items to write into the next exercise. */
export function focusFor(p: Progress, now: number): string[] {
  return due(Object.values(p.cards), { solves: p.solves, now })
    .slice(0, MAX_FOCUS)
    .map((c) => c.key);
}

export function reviewCount(p: Progress, now?: number): { total: number; due: number } {
  const cards = Object.values(p.cards);
  return { total: cards.length, due: now === undefined ? 0 : due(cards, { solves: p.solves, now }).length };
}

/* ---------------- stats ---------------- */

export interface WindowStats {
  n: number;
  passRate: number;
  accuracy: number;
  timingRate: number | null;
  meanAbsMs: number | null;
}

/** Stats over the last n exercises (ao5 … ao1000 in slidy terms). */
export function windowStats(h: readonly HistoryRecord[], n: number): WindowStats | null {
  if (h.length < n) return null;
  const w = h.slice(-n);
  const timed = w.filter((r) => r.timingPass !== null);
  const abs = timed.map((r) => r.meanAbsMs).filter((x): x is number => x !== null);
  return {
    n,
    passRate: w.filter((r) => r.pass).length / n,
    accuracy: w.reduce((a, r) => a + r.accuracy, 0) / n,
    timingRate: timed.length ? timed.filter((r) => r.timingPass).length / timed.length : null,
    meanAbsMs: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : null,
  };
}

/** Items with the worst smoothed miss rate (seen at least `minSeen` times). */
export function weakestItems(p: Progress, k = 8, minSeen = 3): { item: string; rate: number; seen: number }[] {
  return Object.entries(p.itemStats)
    .filter(([, [ok, bad]]) => ok + bad >= minSeen)
    .map(([item, [ok, bad]]) => ({ item, rate: (bad + 0.5) / (ok + bad + 2), seen: ok + bad }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, k);
}
