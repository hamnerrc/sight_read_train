import { describe, expect, it } from "vitest";
import { generate } from "../src/curriculum/generator";
import { LADDER, levelSpec } from "../src/curriculum/levels";
import { barLength } from "../src/curriculum/rhythm";
import { midiOf, posOf } from "../src/music/pitch";

const levels = [...LADDER.map((l) => l.n), LADDER.length + 1, LADDER.length + 7, LADDER.length + 40];

describe("curriculum ladder", () => {
  it("starts with a single middle C", () => {
    const l1 = levelSpec(1);
    expect(l1.rh).toEqual([28, 28]);
    expect(l1.mode).toBe("wait");
    for (let s = 0; s < 20; s++) {
      const ex = generate(1, s);
      expect(ex.events.every((e) => e.midis.length === 1 && e.midis[0] === 60)).toBe(true);
    }
  });

  it("has a long ladder and continues forever", () => {
    expect(LADDER.length).toBeGreaterThan(100);
    expect(levelSpec(LADDER.length + 30).tempo).toBeGreaterThan(levelSpec(LADDER.length).tempo);
  });

  it("covers all 88 keys and all 30 key signatures by the end", () => {
    const last = LADDER[LADDER.length - 1]!;
    expect(last.keys.length).toBe(30);
    expect(last.lh[0]).toBe(5); // A0
    expect(last.rh[1]).toBe(56); // C8
  });
});

describe("generator", () => {
  it("is deterministic from (level, seed)", () => {
    for (const n of [1, 20, 60, 120]) expect(generate(n, 12345)).toEqual(generate(n, 12345));
  });

  it("produces well-formed exercises at every level", { timeout: 60000 }, () => {
    for (const n of levels) {
      const spec = levelSpec(n);
      for (let seed = 0; seed < 8; seed++) {
        const ex = generate(n, seed * 7919);
        const len = barLength(ex.meter);
        expect(ex.events.length, `level ${n}`).toBeGreaterThan(0);
        for (const st of ex.staves) {
          // durations tile the exercise exactly, with no overlaps
          let t = 0;
          for (const note of st.notes) {
            expect(note.start, `level ${n} seed ${seed}`).toBeCloseTo(t, 6);
            t += note.dur;
            // nothing crosses a barline
            const bar = Math.floor(note.start / len + 1e-9);
            expect(note.start + note.dur).toBeLessThanOrEqual((bar + 1) * len + 1e-9);
          }
          expect(t).toBeCloseTo(ex.bars * len, 6);
        }
        for (const ev of ex.events) {
          for (const m of ev.midis) {
            expect(m).toBeGreaterThanOrEqual(21);
            expect(m).toBeLessThanOrEqual(108);
          }
          expect(ev.items.length).toBe(ev.midis.length);
        }
        // single-line melodies respect the level's ranges and leap limit
        if (spec.hands === "R") {
          const ps = ex.staves[0]!.notes.filter((x) => x.pitches.length).map((x) => posOf(x.pitches[x.pitches.length - 1]!));
          for (const p of ps) {
            expect(p).toBeGreaterThanOrEqual(spec.rh[0]);
            expect(p).toBeLessThanOrEqual(spec.rh[1]);
          }
          for (let i = 1; i < ps.length; i++) expect(Math.abs(ps[i]! - ps[i - 1]!)).toBeLessThanOrEqual(spec.maxLeap);
        }
      }
    }
  });

  it("features the level's new note", () => {
    const n = LADDER.findIndex((l) => l.feature?.kind === "rhPos" && l.feature.value === 31) + 1; // F4
    let count = 0;
    let total = 0;
    for (let seed = 0; seed < 50; seed++) {
      const ex = generate(n, seed);
      for (const ev of ex.events) {
        total++;
        if (ev.spelled.some((p) => posOf(p) === 31)) count++;
      }
    }
    expect(count / total).toBeGreaterThan(0.3);
  });

  it("features review items it is asked to", () => {
    const n = LADDER.findIndex((l) => l.title === "Sixths") + 1; // a level that features no particular note
    const spec = levelSpec(n);
    const target = spec.rh[0] + 3;
    const freq = (focus: string[]) => {
      let c = 0;
      let t = 0;
      for (let s = 0; s < 60; s++)
        for (const ev of generate(n, s, focus).events)
          for (const p of ev.spelled) {
            t++;
            if (posOf(p) === target) c++;
          }
      return c / t;
    };
    expect(freq([`read:treble:${target}`])).toBeGreaterThan(freq([]) * 1.5);
  });

  it("spells in the key and raises the leading tone in minor", () => {
    const n = LADDER.findIndex((l) => l.feature?.kind === "key" && l.feature.value === "0m") + 1; // A minor
    let sawGsharp = false;
    for (let s = 0; s < 200 && !sawGsharp; s++) {
      const ex = generate(n, s);
      if (ex.key.mode !== "minor") continue;
      sawGsharp = ex.events.some((e) => e.spelled.some((p) => p.step === 4 && p.alter === 1));
    }
    expect(sawGsharp).toBe(true);
    // G major exercises only ever contain F♯, never F♮ (no chromatics yet)
    const g = LADDER.findIndex((l) => l.feature?.kind === "key" && l.feature.value === "1M") + 1;
    for (let s = 0; s < 30; s++) {
      const ex = generate(g, s);
      if (ex.key.fifths !== 1) continue;
      for (const e of ex.events) for (const p of e.spelled) if (p.step === 3) expect(p.alter).toBe(1);
    }
  });

  it("marks fingering on the first note of each hand", () => {
    const ex = generate(30, 99);
    for (const st of ex.staves) {
      const first = st.notes.find((x) => x.pitches.length === 1);
      if (first) expect(first.fingering?.[0]).toBeGreaterThanOrEqual(1);
    }
  });

  it("prints accidentals only when they differ from the key signature or bar", () => {
    const g = LADDER.findIndex((l) => l.feature?.kind === "key" && l.feature.value === "1M") + 1;
    for (let s = 0; s < 30; s++) {
      const ex = generate(g, s);
      for (const st of ex.staves) for (const nt of st.notes) nt.showAcc?.forEach((show) => expect(show).toBe(false));
    }
    void midiOf;
  });
});
