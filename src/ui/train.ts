/**
 * The Train view: one exercise at a time.
 *
 *   preview (score visible, input locked) → [tempo mode: one-bar count-in] → play → result
 *
 * On a miss the first error is shown in red with a one-line note; R plays the correct bar,
 * Y plays back what you played. Space (or the "next" piano key) moves on; a clean exercise
 * moves on by itself after a short pause.
 */
import { generate } from "../curriculum/generator";
import { levelSpec } from "../curriculum/levels";
import { barLength, beatUnit } from "../curriculum/rhythm";
import { newSeed } from "../curriculum/rng";
import { keyName, midiOf } from "../music/pitch";
import { type RenderedScore, renderScore } from "../score/render";
import { Follower, type Grade, describe } from "../trainer/grader";
import { type Change, applyGrade, focusFor, reviewCount, windowStats } from "../trainer/progress";
import type { Exercise, InputEvent } from "../types";
import type { App } from "./app";
import { h } from "./dom";
import { Keyboard } from "./keyboard";
import { itemLabel } from "./labels";

type Phase = "idle" | "preview" | "countin" | "play" | "result";

export class TrainView {
  readonly el: HTMLElement;
  private app: App;
  private ex?: Exercise;
  private score?: RenderedScore;
  private follower?: Follower;
  private grade?: Grade;
  private phase: Phase = "idle";
  private phaseUntil = 0;
  private startMs = 0;
  private bpm = 60;
  private raf = 0;
  private advanceTimer?: number;
  private kb = new Keyboard();
  private lastBeatShown = -99;

  private hud = h("div", { class: "hud" });
  private stage = h("div", { class: "stage" });
  private scoreEl = h("div", { class: "score" });
  private cursor = h("div", { class: "cursor", hidden: true });
  private overlay = h("div", { class: "overlay", hidden: true });
  private pulse = h("div", { class: "pulse" });
  private fb = h("div", { class: "feedback", "aria-live": "polite" });
  private bar = h("div", { class: "progress" });
  private stats = h("div", { class: "stats", hidden: true });
  private kbWrap = h("div", { class: "kb-wrap" });
  private startBtn = h("button", { class: "btn primary big", type: "button" }, "Start listening");
  private controls = h("div", { class: "controls" });

  constructor(app: App) {
    this.app = app;
    this.stage.append(this.scoreEl, this.cursor, this.overlay);
    this.kbWrap.append(this.kb.el);
    this.kb.onPress = (m) => this.app.dispatch({ time: performance.now(), midis: [m], source: "keyboard", confidence: 1 });
    const btn = (label: string, key: string, fn: () => void, title = "") => {
      const b = h("button", { class: "btn", type: "button", title: title || `${label} (${key})` }, label, h("kbd", {}, key));
      b.addEventListener("click", fn);
      return b;
    };
    this.controls.append(
      btn("Next", "Space", () => this.next()),
      btn("Hear it", "R", () => this.hearIt(), "Play the bar with the first error correctly (R)"),
      btn("Hear yours", "Y", () => this.hearYours(), "Play back what you played (Y)"),
      btn("Crutches", "H", () => this.toggle("crutches"), "Note names on the score and expected keys lit (H)"),
      btn("Stats", "T", () => this.toggle("showStats")),
      btn("Click", "M", () => this.toggle("audibleClick"), "Audible metronome click (M)"),
      btn("Full screen", "F", () => this.fullscreen()),
    );
    this.startBtn.addEventListener("click", async () => {
      await this.app.startInput();
      if (this.app.inputStatus === "on") this.next();
    });
    this.el = h(
      "section",
      { class: "view train" },
      this.hud,
      h("div", { class: "pulse-row" }, this.pulse),
      this.stage,
      this.fb,
      this.bar,
      this.controls,
      this.stats,
      this.kbWrap,
    );
    this.app.listen((e) => this.onInput(e));
    window.addEventListener("resize", () => this.rerender());
    this.renderIdle();
    this.updateChrome();
  }

  /** For the browser smoke test (scripts/smoke.mjs). */
  get debug() {
    return { ex: this.ex, follower: this.follower, phase: this.phase, bpm: this.bpm, grade: this.grade, startMs: this.startMs };
  }

  /* ---------------- lifecycle ---------------- */

  private renderIdle(): void {
    this.scoreEl.innerHTML = "";
    const s = this.app.settings;
    const src = s.input === "mic" ? "the microphone" : s.input === "midi" ? "MIDI" : "the on-screen keyboard";
    this.scoreEl.append(
      h(
        "div",
        { class: "idle" },
        h("p", {}, `Put the laptop on the music desk. The trainer listens through ${src} and grades every note.`),
        this.startBtn,
        h("p", { class: "muted" }, "Change the input, calibrate the mic and set the piano-key controls in Setup."),
      ),
    );
  }

  /** Start the next exercise. */
  next(): void {
    if (this.app.inputStatus !== "on") {
      void this.app.startInput().then(() => this.app.inputStatus === "on" && this.next());
      return;
    }
    clearTimeout(this.advanceTimer);
    this.app.player.stopAll();
    const p = this.app.file.progress;
    const focus = focusFor(p, Date.now());
    this.ex = generate(p.level, newSeed(), focus);
    this.grade = undefined;
    const spec = levelSpec(p.level);
    this.bpm = Math.round(spec.tempo * (this.ex.mode === "tempo" ? p.tempoFactor : 1));
    this.rerender();
    this.phase = "preview";
    this.phaseUntil = performance.now() + this.app.settings.previewSec * 1000;
    this.follower = undefined;
    this.fb.textContent = this.app.settings.previewSec > 0 ? "Read ahead…" : "";
    this.fb.className = "feedback";
    this.setPrior();
    this.updateChrome();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  private rerender(): void {
    if (!this.ex) return;
    this.score = renderScore(this.scoreEl, this.ex, { scale: this.app.settings.scale, noteNames: this.app.settings.crutches });
    // restore marks
    if (this.grade) this.showGradeMarks();
    else if (this.follower) this.follower.ex.events.forEach((_, i) => i < this.follower!.position && this.score?.setMark(i, "ok"));
  }

  private beginPlay(): void {
    const ex = this.ex!;
    const now = performance.now();
    if (ex.mode === "wait") {
      this.follower = new Follower(ex, { onUpdate: (u) => this.onUpdate(u.event, u.state) });
      this.phase = "play";
      this.fb.textContent = "Play when ready. The score waits for each note.";
    } else {
      const beat = 60000 / this.bpm;
      const countBeats = barLength(ex.meter) / beatUnit(ex.meter);
      const unit = beatUnit(ex.meter) * beat;
      this.startMs = now + countBeats * unit + 200;
      this.follower = new Follower(ex, { bpm: this.bpm, startMs: this.startMs, onUpdate: (u) => this.onUpdate(u.event, u.state) });
      if (this.app.settings.audibleClick) {
        const total = countBeats + Math.ceil((ex.bars * barLength(ex.meter)) / beatUnit(ex.meter));
        for (let i = -countBeats; i < total; i++) this.app.player.click(this.startMs + i * unit, i % countBeats === 0);
      }
      this.phase = "countin";
      this.fb.textContent = "";
    }
    this.setPrior();
  }

  private loop = (): void => {
    const now = performance.now();
    const ex = this.ex;
    if (!ex) return;
    if (this.phase === "preview" && now >= this.phaseUntil) this.beginPlay();
    if (this.phase === "countin" || this.phase === "play") {
      const f = this.follower!;
      if (ex.mode === "tempo") {
        const unitMs = beatUnit(ex.meter) * (60000 / this.bpm);
        const beatIdx = Math.floor((now - this.startMs) / unitMs);
        if (beatIdx !== this.lastBeatShown) {
          this.lastBeatShown = beatIdx;
          const perBar = barLength(ex.meter) / beatUnit(ex.meter);
          this.pulse.classList.remove("beat", "down");
          void this.pulse.offsetWidth;
          this.pulse.classList.add("beat");
          if (((beatIdx % perBar) + perBar) % perBar === 0) this.pulse.classList.add("down");
          if (now < this.startMs) {
            this.overlay.hidden = false;
            this.overlay.textContent = String(perBar + beatIdx + 1);
          } else this.overlay.hidden = true;
        }
        if (now >= this.startMs && this.phase === "countin") this.phase = "play";
        f.tick(now);
        const beat = (now - this.startMs) / (60000 / this.bpm);
        this.placeCursor(this.score?.geomAtBeat(Math.max(0, beat)));
        if (now > f.endMs + 50) {
          f.tick(now);
          this.finish();
          return;
        }
      } else {
        this.placeCursor(this.score?.geom(f.position));
        if (this.app.settings.crutches) this.kb.setExpected(ex.events[f.position]?.midis ?? []);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private placeCursor(g: { x: number; top: number; bottom: number } | undefined): void {
    if (!g) {
      this.cursor.hidden = true;
      return;
    }
    this.cursor.hidden = false;
    this.cursor.style.transform = `translate(${g.x}px, ${g.top}px)`;
    this.cursor.style.height = `${g.bottom - g.top}px`;
  }

  private onUpdate(event: number, state: string): void {
    if (state === "ok") this.score?.setMark(event, "ok");
    else if (state === "bad") this.score?.setMark(event, "bad");
    else if (state === "current" && this.ex?.mode === "wait") this.score?.setMark(event, "current");
  }

  private setPrior(): void {
    const ex = this.ex;
    this.app.mic.prior = (ms) => {
      const f = this.follower;
      if (!ex || !f) return ex?.events[0]?.midis ?? [];
      if (ex.mode === "wait") return ex.events[f.position]?.midis ?? [];
      const beatMs = 60000 / this.bpm;
      const out: number[] = [];
      ex.events.forEach((ev, i) => {
        const d = ms - f.timeOf(i);
        if (d > -0.6 * beatMs && d < 0.8 * beatMs) out.push(...ev.midis);
      });
      return out;
    };
  }

  private onInput(e: InputEvent): void {
    if (!this.el.isConnected) return;
    const s = this.app.settings;
    if (this.phase === "result" || this.phase === "idle") {
      if (s.pianoKeyControls && e.confidence >= 0.5) {
        if (e.midis.includes(s.nextKey)) this.next();
        else if (e.midis.includes(s.replayKey)) this.hearIt();
      }
      return;
    }
    if (this.phase === "preview") return; // input locked while reading ahead
    const f = this.follower;
    if (!f) return;
    if (this.ex?.mode === "tempo" && e.time < this.startMs - 0.6 * (60000 / this.bpm)) return;
    const cur = this.ex!.events[f.position];
    f.input(e);
    this.kb.flash(e.midis, !!cur && e.midis.every((m) => cur.midis.includes(m)));
    if (this.ex!.mode === "wait" && f.done) this.finish();
  }

  private finish(): void {
    cancelAnimationFrame(this.raf);
    const ex = this.ex!;
    const f = this.follower!;
    const g = f.grade();
    this.grade = g;
    this.phase = "result";
    this.overlay.hidden = true;
    this.cursor.hidden = true;
    this.kb.setExpected([]);
    const now = Date.now();
    const change = applyGrade(this.app.file.progress, g, now);
    this.app.file.history.push({
      t: now,
      level: ex.level,
      seed: ex.seed,
      focus: ex.focus,
      mode: ex.mode,
      pass: g.pass,
      timingPass: g.timingPass,
      accuracy: g.accuracy,
      bpm: this.bpm,
      meanAbsMs: g.timing ? Math.round(g.timing.meanAbsMs) : null,
      sdMs: g.timing ? Math.round(g.timing.sdMs) : null,
      errors: g.errors.length,
      note: g.firstError || g.firstTimingError ? describe(ex, g) : undefined,
    });
    this.app.saveNow();
    this.showGradeMarks();
    this.showResult(g, change);
    this.updateChrome();
    const s = this.app.settings;
    if (g.pass && (g.timingPass ?? true) && s.autoAdvanceSec > 0) this.advanceTimer = window.setTimeout(() => this.next(), s.autoAdvanceSec * 1000);
  }

  private showGradeMarks(): void {
    const g = this.grade;
    if (!g || !this.score) return;
    g.eventOk.forEach((ok, i) => this.score!.setMark(i, ok ? "ok" : "bad"));
    if (g.firstError) this.score.setMark(g.firstError.event, "review");
  }

  private showResult(g: Grade, ch: Change): void {
    const ex = this.ex!;
    const parts: (string | HTMLElement)[] = [];
    const msg = describe(ex, g);
    parts.push(h("strong", {}, g.pass ? (g.timingPass === false ? "Notes clean · timing missed" : "Clean") : "Miss"), " ", msg);
    const notes: string[] = [];
    if (ch.levelTo > ch.levelFrom) notes.push(`Level ${ch.levelTo}: ${levelSpec(ch.levelTo).title}`);
    else if (ch.levelTo < ch.levelFrom) notes.push(`Back to level ${ch.levelTo}`);
    if (ch.tempoTo > ch.tempoFrom) notes.push("Tempo up 5%");
    else if (ch.tempoTo < ch.tempoFrom) notes.push("Tempo down 5%");
    if (ch.newReviews.length) notes.push(`Coming back: ${ch.newReviews.slice(0, 3).map(itemLabel).join("; ")}`);
    if (ch.clearedReviews.length) notes.push(`Cleared from review: ${ch.clearedReviews.slice(0, 3).map(itemLabel).join("; ")}`);
    this.fb.replaceChildren(...parts, ...(notes.length ? [h("div", { class: "muted" }, notes.join(" · "))] : []));
    this.fb.className = `feedback ${g.pass ? "ok" : "bad"}`;
    if (!g.pass) this.fb.append(h("div", { class: "muted" }, "R hears it · Y hears yours · Space next"));
  }

  /* ---------------- replays ---------------- */

  /** Play the bar with the first error (or the whole exercise if clean), correctly. */
  hearIt(): void {
    const ex = this.ex;
    if (!ex) return;
    const err = this.grade?.firstError ?? this.grade?.firstTimingError;
    const len = barLength(ex.meter);
    const fromBeat = err ? ex.events[err.event]!.bar * len : 0;
    const toBeat = err ? fromBeat + len : ex.bars * len;
    const bpm = ex.mode === "wait" ? 72 : this.bpm;
    const beatMs = 60000 / bpm;
    const t0 = performance.now() + 150;
    this.app.player.stopAll();
    for (const st of ex.staves)
      for (const n of st.notes) {
        if (!n.pitches.length || n.start < fromBeat - 1e-9 || n.start >= toBeat - 1e-9) continue;
        for (const p of n.pitches) this.app.player.note(midiOf(p), t0 + (n.start - fromBeat) * beatMs, (n.dur * beatMs) / 1000);
      }
  }

  /** Play back what was heard, from the bar with the first error. */
  hearYours(): void {
    const ex = this.ex;
    const f = this.follower;
    if (!ex || !f || !f.inputs.length) return;
    const err = this.grade?.firstError ?? this.grade?.firstTimingError;
    let from = f.inputs[0]!.time;
    if (err && ex.mode === "tempo") from = f.timeOf(ex.events.findIndex((e) => e.bar === ex.events[err.event]!.bar)) - 100;
    else if (err) {
      // wait mode: from the first input at or after the error's bar
      const barStart = ex.events.findIndex((e) => e.bar === ex.events[err.event]!.bar);
      from = f.inputs.find((x) => x.time >= (f.inputs[barStart]?.time ?? from))?.time ?? from;
    }
    const t0 = performance.now() + 150;
    this.app.player.stopAll();
    for (const x of f.inputs) {
      if (x.time < from - 1 || x.confidence < 0.5) continue;
      for (const m of x.midis) this.app.player.note(m, t0 + (x.time - from), 0.5);
    }
  }

  /* ---------------- chrome ---------------- */

  toggle(k: "crutches" | "showStats" | "audibleClick"): void {
    this.app.settings[k] = !this.app.settings[k];
    this.app.saveSoon();
    if (k === "crutches") this.rerender();
    if (k === "crutches" && !this.app.settings.crutches) this.kb.setExpected([]);
    this.updateChrome();
  }

  fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  updateChrome(): void {
    const p = this.app.file.progress;
    const spec = levelSpec(p.level);
    const ex = this.ex;
    const rc = reviewCount(p, Date.now());
    const status = this.app.inputStatus;
    const dot = h("span", { class: `dot dot-${status}`, title: status === "error" ? this.app.inputError : `Input ${status}` });
    this.hud.replaceChildren(
      h("span", { class: "chip strong" }, `Level ${p.level}`),
      h("span", { class: "chip" }, spec.title),
      ex ? h("span", { class: "chip" }, ex.mode === "wait" ? "Wait mode" : `♩ = ${this.bpm}`) : "",
      ex ? h("span", { class: "chip" }, `${keyName(ex.key)} · ${ex.meter.num}/${ex.meter.den}`) : "",
      rc.total ? h("span", { class: "chip", title: "Skill items in spaced review (due now / total)" }, `Reviews ${rc.due}/${rc.total}`) : "",
      h("span", { class: "spacer" }),
      dot,
    );
    if (status === "error") this.fb.textContent = `Input problem: ${this.app.inputError}`;

    // progress bar: run toward the next level and recent pass rate vs the 80% target
    const h20 = windowStats(this.app.file.history, Math.min(20, this.app.file.history.length || 1));
    const rate = h20 ? Math.round(h20.passRate * 100) : null;
    const runDots = [0, 1, 2].map((i) => h("span", { class: `run ${i < p.run ? "on" : ""}` }));
    this.bar.replaceChildren(
      h("span", { class: "muted" }, "Next level"),
      ...runDots,
      h("span", { class: "muted" }, rate === null ? "" : `Last ${h20!.n}: ${rate}% clean (target ≈ 80%)`),
      h("span", { class: "spacer" }),
      h("span", { class: "muted" }, `Best level ${p.best}`),
    );

    // stats panel (T)
    this.stats.hidden = !this.app.settings.showStats;
    if (!this.stats.hidden) this.renderStats();
    this.kbWrap.hidden = !this.app.settings.showKeyboard;
    this.controls.querySelectorAll("button").forEach((b) => {
      const t = b.textContent ?? "";
      if (t.startsWith("Crutches")) b.classList.toggle("on", this.app.settings.crutches);
      if (t.startsWith("Stats")) b.classList.toggle("on", this.app.settings.showStats);
      if (t.startsWith("Click")) b.classList.toggle("on", this.app.settings.audibleClick);
    });
    if (status === "on" && this.phase === "idle" && !this.ex) this.renderIdle();
  }

  private renderStats(): void {
    const hist = this.app.file.history;
    const rows = [5, 12, 50, 100, 1000]
      .map((n) => ({ n, s: windowStats(hist, n) }))
      .filter((r) => r.s)
      .map(({ n, s }) =>
        h(
          "tr",
          {},
          h("td", {}, `ao${n}`),
          h("td", {}, `${Math.round(s!.passRate * 100)}%`),
          h("td", {}, `${(s!.accuracy * 100).toFixed(1)}%`),
          h("td", {}, s!.timingRate === null ? "–" : `${Math.round(s!.timingRate * 100)}%`),
          h("td", {}, s!.meanAbsMs === null ? "–" : `${Math.round(s!.meanAbsMs)} ms`),
        ),
      );
    const last = hist[hist.length - 1];
    this.stats.replaceChildren(
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Clean"), h("th", {}, "Notes"), h("th", {}, "On time"), h("th", {}, "Timing ±"))),
        h("tbody", {}, ...rows),
      ),
      h(
        "p",
        { class: "muted" },
        last ? `Last: level ${last.level}, ${last.pass ? "clean" : "miss"}${last.meanAbsMs !== null ? `, ±${last.meanAbsMs} ms` : ""}. ` : "",
        `Session total ${hist.length} exercises. Tempo factor ×${this.app.file.progress.tempoFactor.toFixed(2)}.`,
      ),
    );
  }

  /** Keyboard shortcuts while this view is active. */
  key(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === " " || k === "enter") {
      this.next();
      return true;
    }
    if (this.app.settings.input === "keyboard" && COMPUTER_KEYS.has(k)) return false;
    const map: Record<string, () => void> = {
      r: () => this.hearIt(),
      y: () => this.hearYours(),
      h: () => this.toggle("crutches"),
      t: () => this.toggle("showStats"),
      m: () => this.toggle("audibleClick"),
      f: () => this.fullscreen(),
    };
    const fn = map[k];
    if (fn) {
      fn();
      return true;
    }
    return false;
  }
}

/** Computer-keyboard piano for testing without a piano: a w s e d f t g y h u j k o l p ; = C4 … E5. */
export const COMPUTER_KEYS = new Map<string, number>(
  ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"].map((c, i) => [c, 60 + i]),
);
