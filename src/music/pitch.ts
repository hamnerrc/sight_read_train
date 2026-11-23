/**
 * Music theory primitives: spelled pitches, staff positions, key signatures.
 *
 * A *staff position* (diatonic index) is octave * 7 + step, with C = 0 … B = 6, so C4 = 28.
 * It is what a reader sees: one line or space per position, independent of accidentals.
 */

export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const STEP_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Spelled {
  step: Step;
  /** -2 … 2 (double flat … double sharp). */
  alter: number;
  octave: number;
}

export const MIDI_A0 = 21;
export const MIDI_C8 = 108;

export function midiOf(p: Spelled): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter;
}

export function posOf(p: Spelled): number {
  return p.octave * 7 + p.step;
}

export function fromPos(pos: number, alter = 0): Spelled {
  const octave = Math.floor(pos / 7);
  return { step: (pos - octave * 7) as Step, alter, octave };
}

const ACC_TEXT: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };

/** "F♯4" */
export function nameOf(p: Spelled): string {
  return `${STEP_NAMES[p.step]}${ACC_TEXT[p.alter] ?? ""}${p.octave}`;
}

/** Name for a bare MIDI number, preferring sharps (used for detected pitches with no spelling). */
export function midiName(m: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Spell a MIDI number in a key, preferring the key's own accidentals. */
export function spellMidi(m: number, key: Key): Spelled {
  const octave = Math.floor(m / 12) - 1;
  const pc = ((m % 12) + 12) % 12;
  // try diatonic spelling in the key first
  for (let s = 0; s < 7; s++) {
    const step = s as Step;
    const alter = keyAlter(key, step);
    const sp = STEP_SEMITONES[step] + alter;
    const oct = octave + (sp < 0 ? 1 : sp > 11 ? -1 : 0);
    if (((sp % 12) + 12) % 12 === pc) return { step, alter, octave: oct };
  }
  // chromatic: sharps in sharp keys, flats in flat keys
  const sharpward = key.fifths >= 0;
  const want = sharpward ? 1 : -1;
  for (let s = 0; s < 7; s++) {
    const step = s as Step;
    const alter = ((pc - STEP_SEMITONES[step] + 18) % 12) - 6;
    if (alter !== want) continue;
    // B♯ belongs to the octave below its sounding C; C♭ to the octave above its sounding B
    const sounding = STEP_SEMITONES[step] + alter;
    return { step, alter, octave: octave + (sounding >= 12 ? -1 : sounding < 0 ? 1 : 0) };
  }
  return { step: 0, alter: 0, octave }; // unreachable for valid input
}

export function vexKey(p: Spelled): string {
  const acc = { [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "##" }[p.alter] ?? "";
  return `${STEP_NAMES[p.step].toLowerCase()}${acc}/${p.octave}`;
}

/* ---------------- keys ---------------- */

export interface Key {
  /** -7 … 7: number of sharps (positive) or flats (negative). */
  fifths: number;
  mode: "major" | "minor";
}

const SHARP_ORDER: Step[] = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER: Step[] = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** Accidental the key signature applies to a step. */
export function keyAlter(key: Key, step: Step): number {
  if (key.fifths > 0) return SHARP_ORDER.slice(0, key.fifths).includes(step) ? 1 : 0;
  if (key.fifths < 0) return FLAT_ORDER.slice(0, -key.fifths).includes(step) ? -1 : 0;
  return 0;
}

export function tonicStep(key: Key): Step {
  const major = (((key.fifths * 4) % 7) + 7) % 7;
  return (key.mode === "major" ? major : (major + 5) % 7) as Step;
}

export function keyName(key: Key): string {
  const step = tonicStep(key);
  const alter = keyAlter(key, step);
  return `${STEP_NAMES[step]}${ACC_TEXT[alter]} ${key.mode}`;
}

/** VexFlow key-signature spec, e.g. "F#", "Bbm". */
export function vexKeySig(key: Key): string {
  const step = tonicStep(key);
  const alter = keyAlter(key, step);
  return `${STEP_NAMES[step]}${alter === 1 ? "#" : alter === -1 ? "b" : ""}${key.mode === "minor" ? "m" : ""}`;
}

export function keyId(key: Key): string {
  return `${key.fifths}${key.mode === "major" ? "M" : "m"}`;
}

export function parseKeyId(id: string): Key {
  return { fifths: parseInt(id, 10), mode: id.endsWith("m") ? "minor" : "major" };
}

/** Diatonic spelling of a staff position in a key (with the raised leading tone in harmonic minor when asked). */
export function diatonic(pos: number, key: Key, raiseLeading = false): Spelled {
  const p = fromPos(pos);
  let alter = keyAlter(key, p.step);
  if (raiseLeading && key.mode === "minor" && p.step === (tonicStep(key) + 6) % 7) alter += 1;
  return { ...p, alter };
}

/** Clamp check: within the 88 keys. */
export function onPiano(p: Spelled): boolean {
  const m = midiOf(p);
  return m >= MIDI_A0 && m <= MIDI_C8;
}

/** Frequency in Hz of a MIDI note given the A4 reference. */
export function midiToHz(m: number, a4 = 440): number {
  return a4 * Math.pow(2, (m - 69) / 12);
}

export function hzToMidi(f: number, a4 = 440): number {
  return 69 + 12 * Math.log2(f / a4);
}

/** Positions of common reference points. */
export const POS = {
  C2: 14, G2: 18, C3: 21, F3: 24, G3: 25, B3: 27, C4: 28, D4: 29, E4: 30, G4: 32, C5: 35, F5: 38, G5: 39, C6: 42,
} as const;
