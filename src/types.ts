/** Core data model shared across modules. See docs/PLAN.md §7. */
import type { Key, Spelled } from "./music/pitch";

export type Hand = "L" | "R";
export type Clef = "treble" | "bass";
export type Mode = "wait" | "tempo";

/** One notated note, chord or rest on a staff. */
export interface ScoreNote {
  /** Onset in quarter-note beats from the start of the exercise. */
  start: number;
  /** Duration in quarter-note beats. */
  dur: number;
  /** Empty for a rest. */
  pitches: Spelled[];
  /** Per pitch: show an accidental glyph (computed from key signature and earlier accidentals in the bar). */
  showAcc?: boolean[];
  /** Per pitch: fingering number to print, if any. */
  fingering?: (number | undefined)[];
}

export interface Staff {
  clef: Clef;
  hand: Hand;
  notes: ScoreNote[];
}

export interface Meter {
  num: number;
  den: number;
}

/** What should sound at one moment: the union of every onset at that beat across staves. */
export interface ExpectedEvent {
  beat: number;
  /** 0-based bar index. */
  bar: number;
  /** 1-based beat within the bar, in the meter's beat unit. */
  beatInBar: number;
  midis: number[];
  spelled: Spelled[];
  /** Where each pitch is drawn, parallel to midis. */
  refs: { staff: number; note: number; pitch: number }[];
  /** Skill items exercised by each pitch, parallel to midis. */
  items: string[][];
}

export interface Exercise {
  id: string;
  level: number;
  seed: number;
  key: Key;
  meter: Meter;
  bars: number;
  /** Quarter-note BPM (before the player's tempo factor). */
  tempo: number;
  mode: Mode;
  staves: Staff[];
  events: ExpectedEvent[];
  /** Items the generator was asked to feature (spaced-repetition reviews and the level's new element). */
  focus: string[];
}

/** Something the listener heard. */
export interface InputEvent {
  /** Milliseconds on the session clock (performance.now() based), latency-corrected. */
  time: number;
  midis: number[];
  source: "audio" | "midi" | "keyboard";
  /** 0–1. Low-confidence pitches that match nothing are ignored instead of graded wrong. */
  confidence: number;
}
