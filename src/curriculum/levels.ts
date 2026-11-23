/**
 * The curriculum ladder. Level 1 is a single middle C, the equivalent of a depth-1 3x2 case.
 * Each level adds exactly one thing to the level before it, so the adaptive staircase can
 * move up and down in small, meaningful steps. Past the end of the hand-written ladder the
 * levels continue forever: longer, faster, denser.
 *
 * Ranges are staff positions (octave * 7 + step; C4 = 28), so they mean "lines and spaces"
 * in every key.
 */
import { POS } from "../music/pitch";

export type LhStyle = "line" | "whole" | "half" | "block" | "broken";

export interface LevelSpec {
  n: number;
  /** What this level adds. */
  title: string;
  mode: "wait" | "tempo";
  hands: "R" | "L" | "alt" | "together";
  rh: [number, number];
  lh: [number, number];
  /** Unlocked keys (keyIds), oldest first. The newest is featured when the level introduces it. */
  keys: string[];
  meters: string[];
  /** Unlocked rhythm cells (see rhythm.ts), oldest first. */
  cells: string[];
  lhStyle: LhStyle;
  /** Largest melodic interval, in staff positions (1 = step, 2 = third …). */
  maxLeap: number;
  bars: number;
  /** Base tempo in quarter-note BPM (tempo mode only). */
  tempo: number;
  /** Probability a right-hand note becomes a dyad. */
  dyads: number;
  /** Probability of a chromatic approach note. */
  chromatic: number;
  /** The element this level introduces, featured in its exercises. */
  feature?: { kind: "rhPos" | "lhPos" | "key" | "cell" | "meter"; value: string | number };
}

type Draft = Omit<LevelSpec, "n" | "title" | "feature">;

const ladder: LevelSpec[] = [];
let cur: Draft = {
  mode: "wait",
  hands: "R",
  rh: [POS.C4, POS.C4],
  lh: [POS.C3, POS.C3],
  keys: ["0M"],
  meters: ["4/4"],
  cells: ["q"],
  lhStyle: "line",
  maxLeap: 1,
  bars: 1,
  tempo: 60,
  dyads: 0,
  chromatic: 0,
};

function add(title: string, change: Partial<Draft> = {}, feature?: LevelSpec["feature"]): void {
  cur = { ...cur, ...change, rh: [...(change.rh ?? cur.rh)], lh: [...(change.lh ?? cur.lh)], keys: [...(change.keys ?? cur.keys)], meters: [...(change.meters ?? cur.meters)], cells: [...(change.cells ?? cur.cells)] } as Draft;
  ladder.push({ ...cur, n: ladder.length + 1, title, feature });
}

const NOTE = ["C", "D", "E", "F", "G", "A", "B"];
const posName = (p: number) => `${NOTE[((p % 7) + 7) % 7]}${Math.floor(p / 7)}`;

function rhUpTo(top: number): void {
  for (let p = cur.rh[1] + 1; p <= top; p++) add(`Right hand: ${posName(p)}`, { rh: [cur.rh[0], p] }, { kind: "rhPos", value: p });
}
function rhDownTo(bottom: number): void {
  for (let p = cur.rh[0] - 1; p >= bottom; p--) add(`Right hand: ${posName(p)}`, { rh: [p, cur.rh[1]] }, { kind: "rhPos", value: p });
}
function lhUpTo(top: number): void {
  for (let p = cur.lh[1] + 1; p <= top; p++) add(`Left hand: ${posName(p)}`, { lh: [cur.lh[0], p] }, { kind: "lhPos", value: p });
}
function lhDownTo(bottom: number): void {
  for (let p = cur.lh[0] - 1; p >= bottom; p--) add(`Left hand: ${posName(p)}`, { lh: [p, cur.lh[1]] }, { kind: "lhPos", value: p });
}
function key(id: string, name: string): void {
  add(`Key: ${name}`, { keys: [...cur.keys, id] }, { kind: "key", value: id });
}
function cell(id: string, name: string, extra: Partial<Draft> = {}): void {
  add(name, { cells: [...cur.cells, id], ...extra }, { kind: "cell", value: id });
}
function meter(m: string, cells: string[] = []): void {
  add(`${m} time`, { meters: [...cur.meters, m], cells: [...cur.cells, ...cells] }, { kind: "meter", value: m });
}

/* ---- Stage 1: right-hand note reading, untimed ---- */
add("Middle C, right hand", {}, { kind: "rhPos", value: POS.C4 });
rhUpTo(POS.G4); // D4 … G4, steps only
add("Skips (thirds)", { maxLeap: 2 });
add("Two bars", { bars: 2 });
add("Any interval within five notes", { maxLeap: 4 });

/* ---- Stage 2: left hand ---- */
add("Left hand: C3", { hands: "L", bars: 1, maxLeap: 1 }, { kind: "lhPos", value: POS.C3 });
lhUpTo(POS.G3);
add("Left hand skips", { maxLeap: 2 });
add("Left hand, two bars", { bars: 2 });
add("Left hand, any interval within five notes", { maxLeap: 4 });

/* ---- Stage 3: hands alternate, still untimed ---- */
add("Hands alternate", { hands: "alt" });
add("Hands alternate, four bars", { bars: 4 });
rhUpTo(POS.C5);
lhDownTo(POS.G2);

/* ---- Stage 4: playing in time ---- */
add("In time: quarter notes", { mode: "tempo", hands: "R", bars: 2, tempo: 60 });
add("In time, left hand", { hands: "L" });
add("In time, hands alternate", { hands: "alt" });
cell("h", "Half notes");
cell("w", "Whole notes");
cell("qr", "Quarter rests");
meter("3/4");
cell("hd", "Dotted half notes");
cell("hr", "Half rests");
add("In time, four bars", { bars: 4 });

/* ---- Stage 5: hands together ---- */
add("Hands together: whole-note bass", { hands: "together", lhStyle: "whole", bars: 2 });
add("Hands together: half-note bass", { lhStyle: "half" });
add("Hands together, four bars", { bars: 4 });
key("1M", "G major");
key("-1M", "F major");
rhUpTo(POS.G5);
lhDownTo(POS.C2 + 3); // F2
add("Sixths", { maxLeap: 5 });

/* ---- Stage 6: eighths and moving bass ---- */
cell("ee", "Eighth notes", { tempo: 66 });
meter("2/4");
add("Hands together: moving bass line", { lhStyle: "line" });
cell("qde", "Dotted quarter and eighth");
key("2M", "D major");
key("-2M", "B♭ major");
key("0m", "A minor");
key("1m", "E minor");
key("-1m", "D minor");
add("Block chords in the left hand", { lhStyle: "block" });
add("Thirds and sixths in the right hand", { dyads: 0.15 });
add("Seventh and octave leaps", { maxLeap: 7 });

/* ---- Stage 7: compound time, chromatics, sixteenths ---- */
meter("6/8", ["dq", "eee", "qe", "dh"]);
add("Chromatic notes", { chromatic: 0.06 });
cell("er", "Eighth rests");
cell("ssss", "Sixteenth notes", { tempo: 60 });
cell("ess", "Eighth and two sixteenths");
cell("sse", "Two sixteenths and eighth");
cell("eqe", "Syncopation");
rhUpTo(POS.C6);
lhDownTo(POS.C2);
key("3M", "A major");
key("-3M", "E♭ major");
key("2m", "B minor");
key("-2m", "G minor");
add("Broken chords in the left hand", { lhStyle: "broken" });
add("Six bars", { bars: 6, tempo: 66 });

/* ---- Stage 8: the whole keyboard and every key ---- */
key("4M", "E major");
key("-4M", "A♭ major");
key("3m", "F♯ minor");
key("-3m", "C minor");
rhUpTo(POS.C6 + 4); // G6
lhDownTo(POS.C2 - 4); // F1
key("5M", "B major");
key("-5M", "D♭ major");
key("4m", "C♯ minor");
key("-4m", "F minor");
add("More chromatic notes", { chromatic: 0.12 });
add("Denser right-hand chords", { dyads: 0.3 });
key("6M", "F♯ major");
key("-6M", "G♭ major");
key("5m", "G♯ minor");
key("-5m", "B♭ minor");
rhUpTo(56); // to C8
lhDownTo(5); // to A0
rhDownTo(POS.C4 - 3); // right hand reaches down to G3
lhUpTo(POS.C4 + 4); // left hand reaches up to G4
key("7M", "C♯ major");
key("-7M", "C♭ major");
key("6m", "D♯ minor");
key("-6m", "E♭ minor");
key("7m", "A♯ minor");
key("-7m", "A♭ minor");
add("Eight bars", { bars: 8, tempo: 72 });

export const LADDER: readonly LevelSpec[] = ladder;

/**
 * Level n, forever. Past the hand-written ladder each level rotates through: +4% tempo,
 * +1 bar (up to 16), more chromatic notes and chords.
 */
export function levelSpec(n: number): LevelSpec {
  const i = Math.max(1, Math.floor(n));
  if (i <= ladder.length) return ladder[i - 1]!;
  const last = ladder[ladder.length - 1]!;
  const k = i - ladder.length;
  const tempo = Math.round(last.tempo * Math.pow(1.04, Math.ceil(k / 3)));
  const bars = Math.min(16, last.bars + Math.floor((k + 1) / 3));
  const chromatic = Math.min(0.3, last.chromatic + 0.01 * Math.floor(k / 3));
  const dyads = Math.min(0.6, last.dyads + 0.02 * Math.floor(k / 3));
  const what = ["Faster", "Longer", "Denser"][(k - 1) % 3]!;
  return { ...last, n: i, title: `${what} (beyond the ladder, +${k})`, tempo, bars, chromatic, dyads, feature: undefined };
}
