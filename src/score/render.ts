/**
 * Score rendering with VexFlow: grand staff (or single staff), systems wrapped to the
 * container width, key and time signatures, accidentals, fingering, optional note-name
 * crutch. Keeps a handle on each expected event so the trainer can colour it live and
 * position the cursor.
 */
import {
  Accidental,
  Annotation,
  AnnotationVerticalJustify,
  Beam,
  Dot,
  Formatter,
  Fraction,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} from "vexflow/bravura";
import { barLength, isCompound } from "../curriculum/rhythm";
import { nameOf, vexKey, vexKeySig } from "../music/pitch";
import type { Exercise, ScoreNote } from "../types";

export interface RenderOptions {
  /** Staff space scale (1 = VexFlow default). */
  scale: number;
  noteNames: boolean;
  /** Hide everything after this beat (look-ahead mask); undefined = show all. */
  maskAfterBeat?: number;
}

export type Mark = "pending" | "current" | "ok" | "bad" | "review";

export interface EventGeom {
  x: number;
  top: number;
  bottom: number;
}

export interface RenderedScore {
  setMark(event: number, mark: Mark): void;
  clearMarks(): void;
  geom(event: number): EventGeom | undefined;
  /** x/top/bottom at an arbitrary beat (interpolated between events), for the tempo cursor. */
  geomAtBeat(beat: number): EventGeom | undefined;
  height: number;
}

const DUR: Record<string, [string, number]> = {
  "4": ["w", 0],
  "3": ["h", 1],
  "2": ["h", 0],
  "1.5": ["q", 1],
  "1": ["q", 0],
  "0.75": ["8", 1],
  "0.5": ["8", 0],
  "0.25": ["16", 0],
};

const ACC: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "n", 1: "#", 2: "##" };

function vfNote(n: ScoreNote, clef: string, hand: "L" | "R", names: boolean): StaveNote {
  const [duration, dots] = DUR[String(n.dur)] ?? ["q", 0];
  const rest = n.pitches.length === 0;
  const keys = rest ? [clef === "treble" ? "b/4" : "d/3"] : n.pitches.map(vexKey);
  const note = new StaveNote({ keys, duration: rest ? `${duration}r` : duration, clef, autoStem: !rest, dots });
  if (dots) Dot.buildAndAttach([note], { all: true });
  if (!rest) {
    n.pitches.forEach((p, i) => {
      if (n.showAcc?.[i]) note.addModifier(new Accidental(ACC[p.alter] ?? "n"), i);
    });
    const f = n.fingering?.find((x) => x !== undefined);
    if (f !== undefined) {
      const a = new Annotation(String(f));
      a.setFont("Academico", 11, "bold");
      a.setVerticalJustification(hand === "R" ? AnnotationVerticalJustify.TOP : AnnotationVerticalJustify.BOTTOM);
      note.addModifier(a, 0);
    }
    if (names) {
      const a = new Annotation(n.pitches.map((p) => nameOf(p).replace(/\d+$/, "")).join(" "));
      a.setFont("Academico", 10, "normal");
      a.setVerticalJustification(hand === "R" ? AnnotationVerticalJustify.BOTTOM : AnnotationVerticalJustify.TOP);
      note.addModifier(a, 0);
    }
  }
  return note;
}

export function renderScore(el: HTMLElement, ex: Exercise, o: RenderOptions): RenderedScore {
  el.innerHTML = "";
  const width = Math.max(320, el.clientWidth || 900);
  const s = o.scale;
  const innerW = width / s;
  const len = barLength(ex.meter);
  const keySig = vexKeySig(ex.key);
  const firstExtra = 90 + Math.abs(ex.key.fifths) * 11;
  const minBar = 150 + 12 * Math.max(...ex.staves.map((st) => st.notes.filter((n) => n.start < len).length));
  const perLine = Math.max(1, Math.min(ex.bars, Math.floor((innerW - 20 - firstExtra) / minBar)));
  const lines = Math.ceil(ex.bars / perLine);
  const grand = ex.staves.length === 2;
  const staffGap = 110;
  const lineH = grand ? 250 : 140;
  const height = (lines * lineH + 30) * s;

  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.scale(s, s);

  // event lookup: staff/note → event index
  const refToEvent = new Map<string, number>();
  ex.events.forEach((ev, i) => ev.refs.forEach((r) => refToEvent.set(`${r.staff}:${r.note}`, i)));
  const eventNotes: StaveNote[][] = ex.events.map(() => []);
  const geoms: (EventGeom | undefined)[] = ex.events.map(() => undefined);

  for (let line = 0; line < lines; line++) {
    const firstBar = line * perLine;
    const nBars = Math.min(perLine, ex.bars - firstBar);
    const y0 = 20 + line * lineH;
    const usable = innerW - 20 - firstExtra;
    const barW = usable / nBars;
    let x = 10;
    const systemStaves: Stave[][] = [];
    for (let b = 0; b < nBars; b++) {
      const bar = firstBar + b;
      const w = b === 0 ? barW + firstExtra : barW;
      const staves = ex.staves.map((st, si) => {
        const stave = new Stave(x, y0 + si * staffGap, w);
        if (b === 0) {
          stave.addClef(st.clef).addKeySignature(keySig);
          if (line === 0) stave.addTimeSignature(`${ex.meter.num}/${ex.meter.den}`);
        }
        if (bar === ex.bars - 1) stave.setEndBarType(3); // final double bar
        stave.setContext(ctx).draw();
        return stave;
      });
      systemStaves.push(staves);
      if (b === 0 && grand) {
        new StaveConnector(staves[0]!, staves[1]!).setType("brace").setContext(ctx).draw();
        new StaveConnector(staves[0]!, staves[1]!).setType("singleLeft").setContext(ctx).draw();
      }
      if (grand) new StaveConnector(staves[0]!, staves[1]!).setType(bar === ex.bars - 1 ? "boldDoubleRight" : "singleRight").setContext(ctx).draw();

      // notes in this bar
      const voices: Voice[] = [];
      const beams: Beam[] = [];
      ex.staves.forEach((st, si) => {
        const inBar = st.notes.map((n, ni) => ({ n, ni })).filter(({ n }) => n.start >= bar * len - 1e-9 && n.start < (bar + 1) * len - 1e-9);
        const vnotes = inBar.map(({ n, ni }) => {
          const vn = vfNote(n, st.clef, st.hand, o.noteNames);
          const ei = refToEvent.get(`${si}:${ni}`);
          if (ei !== undefined) eventNotes[ei]!.push(vn);
          if (o.maskAfterBeat !== undefined && n.start > o.maskAfterBeat + 1e-9) vn.setStyle({ fillStyle: "transparent", strokeStyle: "transparent" });
          return vn;
        });
        const groups = isCompound(ex.meter) ? [new Fraction(3, 8)] : [new Fraction(1, 4)];
        beams.push(...Beam.generateBeams(vnotes, { groups }));
        const v = new Voice({ numBeats: ex.meter.num, beatValue: ex.meter.den }).setStrict(false);
        v.addTickables(vnotes);
        voices.push(v);
      });
      const fmt = new Formatter();
      voices.forEach((v) => fmt.joinVoices([v]));
      const noteStart = Math.max(...staves.map((st) => st.getNoteStartX()));
      staves.forEach((st) => st.setNoteStartX(noteStart));
      fmt.format(voices, staves[0]!.getNoteEndX() - noteStart - 10);
      voices.forEach((v, i) => v.draw(ctx, staves[i]!));
      beams.forEach((bm) => bm.setContext(ctx).draw());
      x += w;
    }
    const top = systemStaves[0]![0]!.getYForLine(0) - 30;
    const last = systemStaves[0]![systemStaves[0]!.length - 1]!;
    const bottom = last.getYForLine(4) + 30;
    // geometry for events in this system
    ex.events.forEach((ev, i) => {
      if (ev.bar < firstBar || ev.bar >= firstBar + nBars) return;
      const vn = eventNotes[i]![0];
      if (vn) geoms[i] = { x: vn.getAbsoluteX() + 6, top, bottom };
    });
  }

  const svg = el.querySelector("svg");
  if (svg) svg.setAttribute("class", "score-svg");

  const colorOf: Record<Mark, string | null> = { pending: null, current: "var(--cur)", ok: "var(--ok)", bad: "var(--bad)", review: "var(--bad)" };
  const paint = (i: number, mark: Mark) => {
    for (const vn of eventNotes[i] ?? []) {
      const g = vn.getSVGElement();
      if (!g) continue;
      const c = colorOf[mark];
      g.querySelectorAll<SVGElement>("path, text, rect").forEach((p) => {
        if (c) {
          p.style.fill = c;
          p.style.stroke = c;
        } else {
          p.style.fill = "";
          p.style.stroke = "";
        }
      });
    }
  };

  return {
    setMark: paint,
    clearMarks: () => ex.events.forEach((_, i) => paint(i, "pending")),
    geom: (i) => scaleGeom(geoms[i], s),
    geomAtBeat(beat) {
      const evs = ex.events;
      let i = evs.findIndex((e) => e.beat > beat) - 1;
      if (i < -1) i = evs.length - 1;
      if (i < 0) return scaleGeom(geoms[0], s);
      const a = geoms[i];
      const nextI = i + 1;
      const b = geoms[nextI];
      if (!a) return undefined;
      if (!b || b.top !== a.top) return scaleGeom(a, s);
      const t = (beat - evs[i]!.beat) / (evs[nextI]!.beat - evs[i]!.beat);
      return scaleGeom({ x: a.x + (b.x - a.x) * Math.max(0, Math.min(1, t)), top: a.top, bottom: a.bottom }, s);
    },
    height,
  };
}

function scaleGeom(g: EventGeom | undefined, s: number): EventGeom | undefined {
  return g && { x: g.x * s, top: g.top * s, bottom: g.bottom * s };
}
