/**
 * Seeded exercise generator. `generate(level, seed, focus)` is a pure function: the same
 * arguments always give the same exercise, so history and reviews store seeds, not scores.
 */
import {
  type Key,
  type Spelled,
  type Step,
  diatonic,
  keyAlter,
  keyId,
  midiOf,
  onPiano,
  parseKeyId,
  posOf,
  tonicStep,
} from "../music/pitch";
import type { Clef, ExpectedEvent, Exercise, Hand, Meter, ScoreNote, Staff } from "../types";
import { type LevelSpec, levelSpec } from "./levels";
import { barLength, beatUnit, fillBar, fillRestsSpan, isCompound, parseMeter } from "./rhythm";
import { Rng } from "./rng";

/* ---------------- items ---------------- */

/** Skill items a pitch exercises. These are what spaced repetition tracks. */
export function itemsFor(p: Spelled, clef: Clef, key: Key, prevPos: number | undefined, hand: Hand): string[] {
  const pos = posOf(p);
  const items = [`read:${clef}:${pos}`];
  const ks = keyAlter(key, p.step);
  if (ks !== 0 && p.alter === ks) items.push(`ks:${keyId(key)}:${p.step}`);
  if (p.alter !== ks) items.push(`acc:${p.alter > ks ? "up" : "down"}`);
  if (prevPos !== undefined && prevPos !== pos) items.push(`int:${hand}:${pos - prevPos}`);
  return items;
}

/** What a focus item asks the generator to do. */
interface Focus {
  rhPos: Set<number>;
  lhPos: Set<number>;
  keys: Set<string>;
  steps: Map<string, Set<number>>; // keyId → steps whose key-signature accidental to feature
  intervals: { R: Set<number>; L: Set<number> };
  cell?: string;
}

function parseFocus(items: readonly string[], spec: LevelSpec): Focus {
  const f: Focus = { rhPos: new Set(), lhPos: new Set(), keys: new Set(), steps: new Map(), intervals: { R: new Set(), L: new Set() } };
  for (const it of items) {
    const [kind, a, b] = it.split(":");
    if (kind === "read") (a === "treble" ? f.rhPos : f.lhPos).add(Number(b));
    else if (kind === "ks" && spec.keys.includes(a!)) {
      f.keys.add(a!);
      if (!f.steps.has(a!)) f.steps.set(a!, new Set());
      f.steps.get(a!)!.add(Number(b));
    } else if (kind === "int" && (a === "R" || a === "L")) f.intervals[a].add(Number(b));
  }
  const ft = spec.feature;
  if (ft?.kind === "rhPos") f.rhPos.add(Number(ft.value));
  if (ft?.kind === "lhPos") f.lhPos.add(Number(ft.value));
  if (ft?.kind === "cell") f.cell = String(ft.value);
  return f;
}

/* ---------------- harmony ---------------- */

/** Scale degree (0 = tonic) of the chord root for each bar: start on I, cadence V–I. */
function progression(rng: Rng, bars: number): number[] {
  if (bars <= 2) return Array.from({ length: bars }, () => 0);
  const out = [0];
  for (let b = 1; b < bars - 2; b++) out.push(rng.weighted([0, 3, 4, 5, 1], [2, 3, 3, 2, 1]));
  out.push(4, 0);
  return out;
}

function isChordTone(pos: number, key: Key, degree: number): boolean {
  const rel = (((pos - tonicStep(key) - degree) % 7) + 7) % 7;
  return rel === 0 || rel === 2 || rel === 4;
}

/* ---------------- melodic lines ---------------- */

interface LineOpts {
  lo: number;
  hi: number;
  maxLeap: number;
  featured: Set<number>;
  intervals: Set<number>;
  /** Chord degree per onset, for strong-beat chord tones (undefined = no harmony). */
  harmony?: (number | undefined)[];
  endOnTonic: boolean;
  start?: number;
}

function line(rng: Rng, n: number, key: Key, o: LineOpts): number[] {
  const out: number[] = [];
  const pool: number[] = [];
  for (let p = o.lo; p <= o.hi; p++) pool.push(p);
  const tonic = tonicStep(key);
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1];
    const prev2 = out[i - 2];
    let cands = prev === undefined ? pool : pool.filter((p) => Math.abs(p - prev) <= o.maxLeap);
    if (cands.length === 0) cands = pool;
    const last = i === n - 1;
    if (last && o.endOnTonic) {
      const tonics = cands.filter((p) => ((p % 7) + 7) % 7 === tonic);
      if (tonics.length) cands = tonics;
    }
    const w = cands.map((p) => {
      let x = 1;
      if (prev !== undefined) {
        const d = Math.abs(p - prev);
        x = d === 0 ? 0.6 : d === 1 ? 3 : d === 2 ? 2 : d === 3 ? 1.2 : 0.8 / (d - 2);
        if (prev2 !== undefined && Math.abs(prev - prev2) >= 3 && d === 1 && Math.sign(p - prev) !== Math.sign(prev - prev2)) x *= 3;
        if (o.intervals.has(p - prev)) x *= 4;
      } else if (o.start !== undefined) {
        x = Math.abs(p - o.start) <= 2 ? 3 : 1;
      } else {
        const mid = (o.lo + o.hi) / 2;
        x = 1 / (1 + Math.abs(p - mid) / 3);
      }
      if (o.featured.has(p)) x *= 4;
      const deg = o.harmony?.[i];
      if (deg !== undefined && isChordTone(p, key, deg)) x *= 2.5;
      return x;
    });
    out.push(rng.weighted(cands, w));
  }
  return out;
}

/** Turn positions into spelled pitches: key signature, harmonic-minor leading tone, chromatic approach notes. */
function spellLine(rng: Rng, positions: number[], key: Key, chromatic: number): Spelled[] {
  const tonic = tonicStep(key);
  const out = positions.map((pos) => diatonic(pos, key));
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i]!;
    const next = out[i + 1]!;
    const up = positions[i + 1]! === positions[i]! + 1;
    const down = positions[i + 1]! === positions[i]! - 1;
    // raised leading tone resolving to the tonic in minor
    if (key.mode === "minor" && up && cur.step === (tonic + 6) % 7 && next.step === tonic) {
      out[i] = { ...cur, alter: cur.alter + 1 };
      continue;
    }
    if (i > 0 && chromatic > 0 && rng.chance(chromatic)) {
      const gap = midiOf(next) - midiOf(cur);
      if (up && gap === 2 && cur.alter < 1) out[i] = { ...cur, alter: cur.alter + 1 };
      else if (down && gap === -2 && cur.alter > -1) out[i] = { ...cur, alter: cur.alter - 1 };
    }
  }
  return out;
}

/* ---------------- fingering ---------------- */

/**
 * Mark fingering where it isn't obvious: the first note, and every note that moves the hand
 * to a new five-finger position. Each position is fitted to the longest upcoming run of notes
 * that spans five keys or fewer.
 */
function addFingering(notes: ScoreNote[], hand: Hand): void {
  const singles = notes.filter((n) => n.pitches.length === 1);
  const pos = singles.map((n) => posOf(n.pitches[0]!));
  let lo: number | undefined;
  for (let i = 0; i < singles.length; i++) {
    const p = pos[i]!;
    if (lo !== undefined && p >= lo && p <= lo + 4) continue;
    let min = p;
    let max = p;
    for (let j = i + 1; j < pos.length; j++) {
      const q = pos[j]!;
      if (Math.max(max, q) - Math.min(min, q) > 4) break;
      min = Math.min(min, q);
      max = Math.max(max, q);
    }
    lo = hand === "R" ? min : max - 4;
    const finger = hand === "R" ? p - lo + 1 : lo + 4 - p + 1;
    singles[i]!.fingering = [finger];
  }
}

/* ---------------- staves ---------------- */

interface Onset {
  start: number;
  dur: number;
  rest: boolean;
}

function rhythmLine(rng: Rng, m: Meter, bars: number, cells: readonly string[], featured?: string): Onset[] {
  const len = barLength(m);
  const out: Onset[] = [];
  for (let b = 0; b < bars; b++) {
    let t = b * len;
    for (const d of fillBar(rng, m, cells, featured)) {
      out.push({ start: t, dur: Math.abs(d), rest: d < 0 });
      t += Math.abs(d);
    }
  }
  return out;
}

/** Fill the gaps of a staff with readable rests, bar by bar. */
function withRests(notes: ScoreNote[], m: Meter, bars: number): ScoreNote[] {
  const len = barLength(m);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const out: ScoreNote[] = [];
  let t = 0;
  const gap = (a: number, b: number) => {
    let x = a;
    while (x < b - 1e-9) {
      const barEnd = (Math.floor(x / len + 1e-9) + 1) * len;
      const end = Math.min(b, barEnd);
      const barStart = barEnd - len;
      let p = x;
      for (const d of fillRestsSpan(x - barStart, end - barStart, m)) {
        out.push({ start: p, dur: d, pitches: [] });
        p += d;
      }
      x = end;
    }
  };
  for (const n of sorted) {
    if (n.start > t + 1e-9) gap(t, n.start);
    out.push(n);
    t = n.start + n.dur;
  }
  if (t < bars * len - 1e-9) gap(t, bars * len);
  return out;
}

/** Compute which accidentals to print: anything that differs from the key signature or an earlier accidental in the bar. */
function markAccidentals(staff: Staff, key: Key, m: Meter): void {
  const len = barLength(m);
  let bar = -1;
  let state = new Map<number, number>();
  for (const n of staff.notes) {
    const b = Math.floor(n.start / len + 1e-9);
    if (b !== bar) {
      bar = b;
      state = new Map();
    }
    n.showAcc = n.pitches.map((p) => {
      const pos = posOf(p);
      const cur = state.get(pos) ?? keyAlter(key, p.step);
      state.set(pos, p.alter);
      return p.alter !== cur;
    });
  }
}

/** Closed triad on `degree` with its lowest note as close to `near` as possible, inside [lo, hi]. */
function triad(key: Key, degree: number, lo: number, hi: number, near: number): number[] | undefined {
  let best: number[] | undefined;
  for (let b = lo; b <= hi - 4; b++) {
    if (!isChordTone(b, key, degree)) continue;
    const v = [b];
    for (let p = b + 1; p <= b + 5 && v.length < 3; p++) if (isChordTone(p, key, degree)) v.push(p);
    if (v.length < 3 || v[2]! > hi) continue;
    if (!best || Math.abs(b - near) < Math.abs(best[0]! - near)) best = v;
  }
  return best;
}

function chordSpell(positions: number[], key: Key, degree: number): Spelled[] {
  // V in minor takes the raised leading tone
  const raise = key.mode === "minor" && degree === 4;
  return positions.map((p) => diatonic(p, key, raise));
}

/* ---------------- main ---------------- */

export function generate(level: number, seed: number, focusItems: readonly string[] = []): Exercise {
  const spec = levelSpec(level);
  const rng = new Rng(seed ^ (level * 2654435761));
  const focus = parseFocus(focusItems, spec);

  // key
  let kId: string;
  const focusKeys = spec.keys.filter((k) => focus.keys.has(k));
  if (spec.feature?.kind === "key" && rng.chance(0.7)) kId = String(spec.feature.value);
  else if (focusKeys.length && rng.chance(0.6)) kId = rng.pick(focusKeys);
  else kId = rng.pick(spec.keys);
  const key = parseKeyId(kId);

  // meter
  const mStr = spec.feature?.kind === "meter" && rng.chance(0.7) ? String(spec.feature.value) : rng.pick(spec.meters);
  const meter = parseMeter(mStr);
  const len = barLength(meter);
  const bars = spec.bars;
  const cells = spec.mode === "wait" ? (isCompound(meter) ? ["dq"] : ["q"]) : spec.cells;

  const harmonyByBar = spec.hands === "together" ? progression(rng, bars) : undefined;
  const degreeAt = (beat: number) => harmonyByBar?.[Math.min(bars - 1, Math.floor(beat / len + 1e-9))];
  const onBeat = (beat: number) => Math.abs(beat % beatUnit(meter)) < 1e-9;

  const rhNotes: ScoreNote[] = [];
  const lhNotes: ScoreNote[] = [];

  const melodyOnsets = rhythmLine(rng, meter, bars, cells, focus.cell).filter((o) => !o.rest);

  if (spec.hands === "R" || spec.hands === "L" || spec.hands === "together") {
    const hand: Hand = spec.hands === "L" ? "L" : "R";
    const [lo, hi] = hand === "R" ? spec.rh : spec.lh;
    const pos = line(rng, melodyOnsets.length, key, {
      lo,
      hi,
      maxLeap: spec.maxLeap,
      featured: hand === "R" ? focus.rhPos : focus.lhPos,
      intervals: focus.intervals[hand],
      harmony: harmonyByBar ? melodyOnsets.map((o) => (onBeat(o.start) ? degreeAt(o.start) : undefined)) : undefined,
      endOnTonic: true,
    });
    const spelled = spellLine(rng, pos, key, spec.chromatic);
    const target = hand === "R" ? rhNotes : lhNotes;
    melodyOnsets.forEach((o, i) => {
      const p = spelled[i]!;
      const pitches = [p];
      if (hand === "R" && spec.dyads > 0 && o.dur >= 1 && rng.chance(spec.dyads)) {
        const below = posOf(p) - rng.pick([2, 5]);
        if (below >= lo) pitches.unshift(diatonic(below, key));
      }
      target.push({ start: o.start, dur: o.dur, pitches });
    });
  } else {
    // alt: one line passed between the hands
    const n = melodyOnsets.length;
    let hand: Hand = rng.chance(0.5) ? "R" : "L";
    let left = 0;
    const handAt: Hand[] = [];
    for (let i = 0; i < n; i++) {
      if (left === 0) {
        hand = i === 0 ? hand : hand === "R" ? "L" : "R";
        left = rng.int(1, 4);
      }
      handAt.push(hand);
      left--;
    }
    // generate each hand's notes as its own line, then interleave
    for (const h of ["R", "L"] as Hand[]) {
      const idx = handAt.map((x, i) => (x === h ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      const [lo, hi] = h === "R" ? spec.rh : spec.lh;
      const pos = line(rng, idx.length, key, {
        lo,
        hi,
        maxLeap: spec.maxLeap,
        featured: h === "R" ? focus.rhPos : focus.lhPos,
        intervals: focus.intervals[h],
        endOnTonic: idx[idx.length - 1] === n - 1,
      });
      const spelled = spellLine(rng, pos, key, spec.chromatic);
      idx.forEach((i, j) => {
        const o = melodyOnsets[i]!;
        (h === "R" ? rhNotes : lhNotes).push({ start: o.start, dur: o.dur, pitches: [spelled[j]!] });
      });
    }
  }

  if (spec.hands === "together" && harmonyByBar) {
    const [lo, hi] = spec.lh;
    let near = Math.round((lo + hi) / 2) - 2;
    const halves = isCompound(meter) ? [1.5, 1.5].slice(0, Math.round(len / 1.5)) : len === 4 ? [2, 2] : len === 3 ? [2, 1] : [2];
    for (let b = 0; b < bars; b++) {
      const deg = harmonyByBar[b]!;
      const t0 = b * len;
      const style = spec.lhStyle;
      const chord = triad(key, deg, lo, hi, near);
      const roots: number[] = [];
      for (let p = lo; p <= hi; p++) if ((((p - tonicStep(key) - deg) % 7) + 7) % 7 === 0) roots.push(p);
      const root = roots.length ? roots.reduce((a, p) => (Math.abs(p - near) < Math.abs(a - near) ? p : a)) : lo;
      if (style === "whole") {
        lhNotes.push({ start: t0, dur: len, pitches: chordSpell([root], key, deg) });
      } else if (style === "half") {
        let t = t0;
        halves.forEach((d, i) => {
          const fifth = root + 4 <= hi ? root + 4 : root - 3 >= lo ? root - 3 : root;
          lhNotes.push({ start: t, dur: d, pitches: chordSpell([i % 2 === 0 ? root : fifth], key, deg) });
          t += d;
        });
      } else if ((style === "block" || style === "broken") && chord) {
        if (style === "block") {
          let t = t0;
          for (const d of halves) {
            lhNotes.push({ start: t, dur: d, pitches: chordSpell(chord, key, deg) });
            t += d;
          }
        } else {
          const pattern = isCompound(meter) ? [0, 1, 2] : [0, 2, 1, 2];
          const step = 0.5;
          let i = 0;
          for (let t = t0; t < t0 + len - 1e-9; t += step) {
            lhNotes.push({ start: t, dur: step, pitches: chordSpell([chord[pattern[i++ % pattern.length]!]!], key, deg) });
          }
        }
        near = chord[0]!;
      } else {
        // "line" (or a chord that doesn't fit): an independent bass line in slower values
        const simple = cells.filter((c) => ["q", "h", "hd", "w", "dq", "dh"].includes(c));
        const onsets = rhythmLine(rng, meter, 1, simple.length ? simple : cells).filter((o) => !o.rest);
        const pos = line(rng, onsets.length, key, {
          lo,
          hi,
          maxLeap: Math.min(spec.maxLeap, 4),
          featured: focus.lhPos,
          intervals: focus.intervals.L,
          harmony: onsets.map(() => deg),
          endOnTonic: b === bars - 1,
          start: near,
        });
        const spelled = spellLine(rng, pos, key, 0);
        onsets.forEach((o, i) => lhNotes.push({ start: t0 + o.start, dur: o.dur, pitches: [spelled[i]!] }));
        near = pos[pos.length - 1]!;
      }
      if (style !== "line" && style !== "block" && style !== "broken") near = root;
    }
  }

  // drop anything off the keyboard (only possible at the extreme ranges)
  for (const ns of [rhNotes, lhNotes]) for (const n of ns) n.pitches = n.pitches.filter(onPiano);

  // staves
  const staves: Staff[] = [];
  const useR = spec.hands !== "L";
  const useL = spec.hands !== "R";
  if (useR) staves.push({ clef: "treble", hand: "R", notes: withRests(rhNotes.filter((n) => n.pitches.length), meter, bars) });
  if (useL) staves.push({ clef: "bass", hand: "L", notes: withRests(lhNotes.filter((n) => n.pitches.length), meter, bars) });
  for (const s of staves) {
    markAccidentals(s, key, meter);
    addFingering(s.notes, s.hand);
  }

  const events = buildEvents(staves, key, meter);
  const focusList = [...focusItems];
  if (spec.feature) focusList.push(`feature:${spec.feature.kind}:${spec.feature.value}`);
  return {
    id: `${level}-${seed}`,
    level,
    seed,
    key,
    meter,
    bars,
    tempo: spec.tempo,
    mode: spec.mode,
    staves,
    events,
    focus: focusList,
  };
}

export function buildEvents(staves: Staff[], key: Key, meter: Meter): ExpectedEvent[] {
  const len = barLength(meter);
  const unit = beatUnit(meter);
  const byBeat = new Map<number, ExpectedEvent>();
  staves.forEach((s, si) => {
    let prevPos: number | undefined;
    s.notes.forEach((n, ni) => {
      if (!n.pitches.length) return;
      const k = Math.round(n.start * 1000);
      let ev = byBeat.get(k);
      if (!ev) {
        const bar = Math.floor(n.start / len + 1e-9);
        ev = { beat: n.start, bar, beatInBar: 1 + (n.start - bar * len) / unit, midis: [], spelled: [], refs: [], items: [] };
        byBeat.set(k, ev);
      }
      const top = n.pitches.length === 1 ? undefined : posOf(n.pitches[n.pitches.length - 1]!);
      n.pitches.forEach((p, pi) => {
        const m = midiOf(p);
        if (ev!.midis.includes(m)) return;
        ev!.midis.push(m);
        ev!.spelled.push(p);
        ev!.refs.push({ staff: si, note: ni, pitch: pi });
        const items = itemsFor(p, s.clef, key, n.pitches.length === 1 ? prevPos : undefined, s.hand);
        if (n.pitches.length > 1) items.push(`chord:${s.hand}:${n.pitches.length}`);
        ev!.items.push(items);
      });
      prevPos = top ?? posOf(n.pitches[0]!);
    });
  });
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

/** Exported for tests and the UI. */
export const _internal = { progression, triad, line, spellLine };
export type { Step };
