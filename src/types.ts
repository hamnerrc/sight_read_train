/** Core data model shared across modules. See docs/PLAN.md §7. */

/** MIDI note number, 21 (A0) to 108 (C8). */
export type Midi = number;

export type Hand = "L" | "R";

/** One expected event in the score: a single note or a chord. */
export interface NoteEvent {
  /** Onset in beats from the start of the exercise. */
  time: number;
  /** Duration in beats. */
  duration: number;
  pitches: Midi[];
  hand: Hand;
}

export interface Exercise {
  id: string;
  levelId: string;
  /** Seed that regenerates this exercise exactly. */
  seed: number;
  meter: [beats: number, unit: number];
  /** Target tempo in quarter-note BPM. */
  tempo: number;
  events: NoteEvent[];
  /** Feature tags (e.g. "pitch:A5:treble", "rhythm:dotted-quarter-eighth") used for weakness tracking. */
  features: string[];
}

/** Something the listener heard. */
export interface InputEvent {
  /** Milliseconds since the exercise started, latency-corrected. */
  time: number;
  pitches: Midi[];
  source: "audio" | "midi";
  /** 0–1. Low-confidence events can't break a streak (graded "unclear"). */
  confidence: number;
}

export type ErrorKind = "wrong-pitch" | "missing-pitch" | "extra-pitch" | "early" | "late" | "unclear";

export interface EventGrade {
  eventIndex: number;
  ok: boolean;
  errors: { kind: ErrorKind; expected?: Midi; played?: Midi; offsetMs?: number }[];
}

export interface Grade {
  pass: boolean;
  /** Index into events of the first failing event; what the error replay shows. */
  firstError?: number;
  events: EventGrade[];
  timing: { meanOffsetMs: number; sdMs: number };
}
