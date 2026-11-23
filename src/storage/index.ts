/** Versioned localStorage persistence plus progress export / import / merge. */
import { type HistoryRecord, type Progress, newProgress } from "../trainer/progress";

export type InputSource = "mic" | "midi" | "keyboard";

export interface Settings {
  input: InputSource;
  micDeviceId?: string;
  /** Seconds the new score is shown before playing starts (input locked). */
  previewSec: number;
  /** Notation scale. */
  scale: number;
  /** Seconds before moving on after a clean exercise (0 = wait for Space / the next key). */
  autoAdvanceSec: number;
  audibleClick: boolean;
  /** Crutches (H): note names on the score and expected keys lit on the keyboard. */
  crutches: boolean;
  showStats: boolean;
  showKeyboard: boolean;
  a4: number;
  fluxFloor: number;
  latencyMs: number;
  /** Piano keys that act as controls between exercises (MIDI numbers). */
  nextKey: number;
  replayKey: number;
  pianoKeyControls: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  input: "mic",
  previewSec: 2,
  scale: 1.15,
  autoAdvanceSec: 1.2,
  audibleClick: false,
  crutches: false,
  showStats: false,
  showKeyboard: true,
  a4: 440,
  fluxFloor: 4,
  latencyMs: 0,
  nextKey: 21,
  replayKey: 108,
  pianoKeyControls: true,
};

export interface SaveFile {
  app: "sight-read-trainer";
  version: 1;
  settings: Settings;
  progress: Progress;
  history: HistoryRecord[];
}

const KEY = "srt-v1";
const MAX_HISTORY = 5000;

export function load(): SaveFile {
  let raw: Partial<SaveFile> | null = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    raw = null;
  }
  return normalise(raw);
}

function normalise(raw: Partial<SaveFile> | null): SaveFile {
  return {
    app: "sight-read-trainer",
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) },
    progress: { ...newProgress(), ...(raw?.progress ?? {}) },
    history: Array.isArray(raw?.history) ? raw!.history.slice(-MAX_HISTORY) : [],
  };
}

export function save(f: SaveFile): void {
  f.history = f.history.slice(-MAX_HISTORY);
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
}

export function exportFile(f: SaveFile): Blob {
  return new Blob([JSON.stringify(f, null, 1)], { type: "application/json" });
}

export function parseImport(text: string): SaveFile {
  const raw = JSON.parse(text) as Partial<SaveFile>;
  if (raw?.app !== "sight-read-trainer") throw new Error("That file isn't a Sight Read Trainer progress export.");
  return normalise(raw);
}

/** Merge: union of history (by time), the higher level and best, later review state per item, summed item stats. */
export function merge(a: SaveFile, b: SaveFile): SaveFile {
  const seen = new Set(a.history.map((h) => `${h.t}:${h.seed}`));
  const history = [...a.history, ...b.history.filter((h) => !seen.has(`${h.t}:${h.seed}`))].sort((x, y) => x.t - y.t);
  const pa = a.progress;
  const pb = b.progress;
  const itemStats = { ...pa.itemStats };
  for (const [k, [ok, bad]] of Object.entries(pb.itemStats)) {
    const c = (itemStats[k] ??= [0, 0]);
    itemStats[k] = [c[0] + ok, c[1] + bad];
  }
  const cards = { ...pb.cards, ...pa.cards };
  const progress: Progress = {
    ...pa,
    level: Math.max(pa.level, pb.level),
    best: Math.max(pa.best, pb.best),
    solves: Math.max(pa.solves, pb.solves),
    tempoFactor: Math.max(pa.tempoFactor, pb.tempoFactor),
    cards,
    itemStats,
  };
  return { ...a, progress, history };
}

export function reset(): SaveFile {
  const s = load().settings;
  const f = normalise(null);
  f.settings = s;
  save(f);
  return f;
}
