/**
 * Spaced repetition for missed items, carried over unchanged from the slidy trainer:
 * a missed card comes back after 3 solves and leaves the pool after 4 clean passes in a row,
 * spread over 3, 8 and 25 solves and then an 8-hour break. Another miss restarts the schedule.
 *
 * "Solves" is a global counter of graded exercises (the solve clock), so reviews are
 * interleaved with new material rather than drilled back-to-back.
 */

export const STEPS = [3, 8, 25, "break"] as const;
export const BREAK_MS = 8 * 3600e3;

export interface Card {
  key: string;
  /** Index into STEPS of the review currently awaited. */
  step: number;
  /** Solve-clock value at which the card is due (for numeric steps). */
  dueClock: number;
  /** Wall-clock time (ms) at which the card is due (for the break step). */
  dueAt: number;
}

export interface Clock {
  /** Number of graded exercises so far. */
  solves: number;
  /** Wall-clock milliseconds. */
  now: number;
}

function schedule(key: string, step: number, clock: Clock): Card {
  const s = STEPS[step] ?? "break";
  return s === "break"
    ? { key, step, dueClock: clock.solves, dueAt: clock.now + BREAK_MS }
    : { key, step, dueClock: clock.solves + s, dueAt: clock.now };
}

/** A miss (re)starts the schedule from the first step. */
export function onMiss(key: string, clock: Clock): Card {
  return schedule(key, 0, clock);
}

/** A clean review pass advances the card; returns null when it graduates out of the pool. */
export function onPass(card: Card, clock: Clock): Card | null {
  const next = card.step + 1;
  return next >= STEPS.length ? null : schedule(card.key, next, clock);
}

export function isDue(card: Card, clock: Clock): boolean {
  return clock.solves >= card.dueClock && clock.now >= card.dueAt;
}

/** Cards due now, most overdue first. */
export function due(cards: Iterable<Card>, clock: Clock): Card[] {
  return [...cards].filter((c) => isDue(c, clock)).sort((a, b) => a.dueClock - b.dueClock || a.dueAt - b.dueAt);
}
