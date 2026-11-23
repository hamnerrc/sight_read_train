/**
 * Score following and grading. Notes and timing are graded separately (docs/QUESTIONS.md #7):
 *
 * - `pass` (notes): every expected pitch was played, nothing wrong or extra, nothing skipped.
 *   This is the slidy "optimal" bar, and it is what drives the difficulty staircase.
 * - `timingPass` (tempo mode only): every onset within the timing window of the metronome grid.
 *   This drives the separate tempo staircase.
 *
 * Wait mode: the score waits on each event until its pitches sound. A wrong pitch while an
 * event is current makes that event dirty.
 *
 * Tempo mode: the metronome runs from `startMs`. Each heard pitch is matched to the nearest
 * unmatched expected copy of that pitch within [-early, +late] beats. Pitches that match
 * nothing are wrong or extra notes; expected pitches whose window passes unmatched are missing.
 * Playing far too late, i.e. stopping, therefore fails the notes grade as well, which enforces
 * "no stops".
 *
 * Heard pitches below `minConfidence` that match nothing are ignored ("unclear"), so a dubious
 * detection never fails an exercise.
 */
import { midiName, nameOf } from "../music/pitch";
import type { ExpectedEvent, Exercise, InputEvent } from "../types";

export type ErrorKind = "wrong" | "missing" | "extra" | "early" | "late";

export interface GradeError {
  event: number;
  kind: ErrorKind;
  expected?: number;
  played?: number;
  offsetMs?: number;
}

export interface Grade {
  mode: "wait" | "tempo";
  /** Notes grade: no wrong, missing or extra notes. */
  pass: boolean;
  /** Timing grade (tempo mode); null in wait mode. */
  timingPass: boolean | null;
  /** Fraction of events played cleanly. */
  accuracy: number;
  eventOk: boolean[];
  /** First notes error, in score order; what the replay and message show. */
  firstError?: GradeError;
  /** First timing error (shown when the notes were clean). */
  firstTimingError?: GradeError;
  errors: GradeError[];
  timing: { meanMs: number; sdMs: number; meanAbsMs: number; n: number } | null;
  /** Per skill item: [clean, missed] counts in this exercise. */
  items: Record<string, [number, number]>;
  bpm: number;
  durationMs: number;
}

export type EventState = "pending" | "current" | "ok" | "bad";

export interface FollowerUpdate {
  event: number;
  state: EventState;
  /** Per pitch of the event: true = heard. */
  heard: boolean[];
  /** A heard pitch that didn't belong (for the UI to draw in grey). */
  wrong?: number;
}

export interface FollowerOptions {
  minConfidence?: number;
  /** Effective tempo in quarter-note BPM (tempo mode). */
  bpm?: number;
  /** Session-clock time of beat 0 (tempo mode). */
  startMs?: number;
  /** Matching window in beats. */
  earlyBeats?: number;
  lateBeats?: number;
  /** Timing tolerance in ms; defaults to max(70 ms, 12% of a beat). */
  timingWindowMs?: number;
  onUpdate?: (u: FollowerUpdate) => void;
}

interface Slot {
  heard: boolean[];
  offsets: (number | undefined)[];
  wrong: GradeError[];
  closed: boolean;
}

export class Follower {
  readonly ex: Exercise;
  private readonly o: Required<Omit<FollowerOptions, "onUpdate" | "startMs" | "bpm">> & { bpm: number; startMs: number };
  private readonly onUpdate?: (u: FollowerUpdate) => void;
  private slots: Slot[];
  private cur = 0;
  /** When each pitch was last correctly heard (wait mode), to ignore re-detections of ringing notes. */
  private lastHeard = new Map<number, number>();
  private firstInputMs?: number;
  private lastInputMs?: number;
  readonly inputs: InputEvent[] = [];
  done = false;

  constructor(ex: Exercise, opts: FollowerOptions = {}) {
    this.ex = ex;
    const bpm = opts.bpm ?? ex.tempo;
    const beatMs = 60000 / bpm;
    this.o = {
      minConfidence: opts.minConfidence ?? 0.5,
      bpm,
      startMs: opts.startMs ?? 0,
      earlyBeats: opts.earlyBeats ?? 0.5,
      lateBeats: opts.lateBeats ?? 0.75,
      timingWindowMs: opts.timingWindowMs ?? Math.max(70, 0.12 * beatMs),
    };
    this.onUpdate = opts.onUpdate;
    this.slots = ex.events.map((e) => ({ heard: e.midis.map(() => false), offsets: e.midis.map(() => undefined), wrong: [], closed: false }));
    if (ex.mode === "wait" && ex.events.length) this.emit(0, "current");
  }

  get beatMs(): number {
    return 60000 / this.o.bpm;
  }

  /** Session time at which event i should sound (tempo mode). */
  timeOf(i: number): number {
    return this.o.startMs + this.ex.events[i]!.beat * this.beatMs;
  }

  /** Current event index (wait mode) or the next event due (tempo mode). */
  get position(): number {
    return this.cur;
  }

  input(e: InputEvent): void {
    if (this.done) return;
    this.inputs.push(e);
    this.firstInputMs ??= e.time;
    this.lastInputMs = e.time;
    if (this.ex.mode === "wait") this.inputWait(e);
    else this.inputTempo(e);
  }

  private inputWait(e: InputEvent): void {
    const ev = this.ex.events[this.cur];
    const slot = this.slots[this.cur];
    if (!ev || !slot) return;
    for (const m of e.midis) {
      const k = ev.midis.findIndex((x, i) => x === m && !slot.heard[i]);
      if (k >= 0) {
        slot.heard[k] = true;
        this.lastHeard.set(m, e.time);
        continue;
      }
      if (ev.midis.includes(m)) continue; // repeat of a pitch already heard in this event
      const last = this.lastHeard.get(m);
      if (last !== undefined && e.time - last < 1500) continue; // an earlier note still ringing, re-detected
      if (e.confidence < this.o.minConfidence) continue;
      const expected = nearest(ev.midis.filter((_, i) => !slot.heard[i]), m);
      slot.wrong.push({ event: this.cur, kind: "wrong", expected, played: m });
      this.emit(this.cur, "current", m);
    }
    if (slot.heard.every(Boolean)) {
      slot.closed = true;
      this.emit(this.cur, slot.wrong.length ? "bad" : "ok");
      this.cur++;
      if (this.cur >= this.ex.events.length) this.done = true;
      else this.emit(this.cur, "current");
    } else {
      this.emit(this.cur, "current");
    }
  }

  private inputTempo(e: InputEvent): void {
    const beat = this.beatMs;
    const early = this.o.earlyBeats * beat;
    const late = this.o.lateBeats * beat;
    this.tick(e.time);
    for (const m of e.midis) {
      let best: { i: number; k: number; d: number } | undefined;
      this.ex.events.forEach((ev, i) => {
        const slot = this.slots[i]!;
        if (slot.closed) return;
        const d = e.time - this.timeOf(i);
        if (d < -early || d > late) return;
        ev.midis.forEach((x, k) => {
          if (x === m && !slot.heard[k] && (!best || Math.abs(d) < Math.abs(best.d))) best = { i, k, d };
        });
      });
      if (best) {
        const slot = this.slots[best.i]!;
        slot.heard[best.k] = true;
        slot.offsets[best.k] = best.d;
        this.emit(best.i, slot.heard.every(Boolean) && !slot.wrong.length ? "ok" : "current");
        continue;
      }
      // a pitch that was just matched and is re-detected (ringing) is not an error
      const recent = this.ex.events.some((ev, i) => ev.midis.includes(m) && this.slots[i]!.heard[ev.midis.indexOf(m)] && Math.abs(e.time - this.timeOf(i)) < late + 300);
      if (recent) continue;
      if (e.confidence < this.o.minConfidence) continue;
      // attribute the stray pitch to the event nearest in time
      const i = this.nearestEvent(e.time);
      const slot = this.slots[i]!;
      const open = this.ex.events[i]!.midis.filter((_, k) => !slot.heard[k]);
      slot.wrong.push(open.length ? { event: i, kind: "wrong", expected: nearest(open, m), played: m } : { event: i, kind: "extra", played: m });
      this.emit(i, "bad", m);
    }
  }

  private nearestEvent(t: number): number {
    let bi = 0;
    let bd = Infinity;
    this.ex.events.forEach((_, i) => {
      const d = Math.abs(t - this.timeOf(i));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  }

  /** Advance the clock (tempo mode): close events whose window has passed. Call every frame. */
  tick(now: number): void {
    if (this.ex.mode !== "tempo" || this.done) return;
    const late = this.o.lateBeats * this.beatMs;
    while (this.cur < this.ex.events.length && now > this.timeOf(this.cur) + late) {
      const slot = this.slots[this.cur]!;
      slot.closed = true;
      this.emit(this.cur, slot.heard.every(Boolean) && !slot.wrong.length ? "ok" : "bad");
      this.cur++;
    }
    if (this.cur >= this.ex.events.length) this.done = true;
  }

  /** Session time after which the exercise is over (tempo mode). */
  get endMs(): number {
    const n = this.ex.events.length;
    return n ? this.timeOf(n - 1) + this.o.lateBeats * this.beatMs : this.o.startMs;
  }

  private emit(event: number, state: EventState, wrong?: number): void {
    const slot = this.slots[event];
    if (!slot || !this.onUpdate) return;
    this.onUpdate({ event, state, heard: [...slot.heard], wrong });
  }

  /** Final grade. In wait mode call when `done`; in tempo mode after `tick(endMs + 1)`. */
  grade(): Grade {
    const errors: GradeError[] = [];
    const eventOk: boolean[] = [];
    const items: Record<string, [number, number]> = {};
    const offsets: number[] = [];
    const timingErrors: GradeError[] = [];
    this.ex.events.forEach((ev, i) => {
      const slot = this.slots[i]!;
      const missing = ev.midis.filter((_, k) => !slot.heard[k]);
      for (const m of missing) if (!slot.wrong.some((w) => w.expected === m)) errors.push({ event: i, kind: "missing", expected: m });
      errors.push(...slot.wrong);
      eventOk.push(missing.length === 0 && slot.wrong.length === 0);
      ev.midis.forEach((m, k) => {
        const ok = slot.heard[k] && !slot.wrong.some((w) => w.expected === m);
        for (const it of ev.items[k] ?? []) {
          const c = (items[it] ??= [0, 0]);
          c[ok ? 0 : 1]++;
        }
      });
      if (this.ex.mode === "tempo") {
        const offs = slot.offsets.filter((x): x is number => x !== undefined);
        if (offs.length) {
          const off = offs.reduce((a, b) => a + b, 0) / offs.length;
          offsets.push(off);
          if (Math.abs(off) > this.o.timingWindowMs) timingErrors.push({ event: i, kind: off < 0 ? "early" : "late", offsetMs: Math.round(off) });
        }
      }
    });
    errors.sort((a, b) => a.event - b.event);
    const n = offsets.length;
    const mean = n ? offsets.reduce((a, b) => a + b, 0) / n : 0;
    const timing =
      this.ex.mode === "tempo"
        ? {
            meanMs: mean,
            sdMs: n > 1 ? Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0,
            meanAbsMs: n ? offsets.reduce((a, b) => a + Math.abs(b), 0) / n : 0,
            n,
          }
        : null;
    const pass = errors.length === 0;
    return {
      mode: this.ex.mode,
      pass,
      timingPass: this.ex.mode === "tempo" ? timingErrors.length === 0 && n === this.ex.events.length : null,
      accuracy: this.ex.events.length ? eventOk.filter(Boolean).length / this.ex.events.length : 1,
      eventOk,
      firstError: errors[0],
      firstTimingError: timingErrors[0],
      errors: [...errors, ...timingErrors],
      timing,
      items,
      bpm: this.o.bpm,
      durationMs: this.firstInputMs !== undefined && this.lastInputMs !== undefined ? this.lastInputMs - this.firstInputMs : 0,
    };
  }
}

function nearest(xs: number[], m: number): number | undefined {
  let best: number | undefined;
  for (const x of xs) if (best === undefined || Math.abs(x - m) < Math.abs(best - m)) best = x;
  return best;
}

/** "Bar 3, beat 2" with "&" for off-beats. */
export function where(ev: ExpectedEvent): string {
  const whole = Math.floor(ev.beatInBar + 1e-9);
  const frac = ev.beatInBar - whole;
  const sub = frac < 1e-6 ? "" : Math.abs(frac - 0.5) < 1e-6 ? "&" : Math.abs(frac - 0.25) < 1e-6 ? "e" : Math.abs(frac - 0.75) < 1e-6 ? "a" : `+${frac.toFixed(2)}`;
  return `Bar ${ev.bar + 1}, beat ${whole}${sub}`;
}

/** The note under the board: the single most useful sentence about what went wrong. */
export function describe(ex: Exercise, g: Grade): string {
  const err = g.firstError ?? g.firstTimingError;
  if (!err) return g.mode === "tempo" ? `Clean. Timing ${fmtMs(g.timing?.meanMs ?? 0)} average, ±${Math.round(g.timing?.sdMs ?? 0)} ms.` : "Clean.";
  const ev = ex.events[err.event]!;
  const spell = (m?: number) => {
    if (m === undefined) return "?";
    const k = ev.midis.indexOf(m);
    return k >= 0 ? nameOf(ev.spelled[k]!) : midiName(m);
  };
  const at = where(ev);
  switch (err.kind) {
    case "wrong":
      return `${at}: you played ${midiName(err.played!)}; the score has ${spell(err.expected)}.`;
    case "missing":
      return `${at}: ${spell(err.expected)} wasn't played.`;
    case "extra":
      return `${at}: extra note ${midiName(err.played!)}.`;
    case "early":
    case "late":
      return `Notes clean. ${at} was ${Math.abs(err.offsetMs ?? 0)} ms ${err.kind}.`;
  }
}

function fmtMs(x: number): string {
  const r = Math.round(x);
  return `${r >= 0 ? "+" : ""}${r} ms`;
}
