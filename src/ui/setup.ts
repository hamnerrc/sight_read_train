/**
 * Setup: choose the input, watch what the listener hears, and calibrate it to the room and
 * the piano (noise floor, tuning, latency). Also the piano-key controls and display options.
 */
import { peakNear } from "../audio/detector";
import { listInputs, toWav } from "../audio/mic";
import { midiName } from "../music/pitch";
import type { InputSource } from "../storage";
import type { InputEvent } from "../types";
import type { App } from "./app";
import { h } from "./dom";

export class SetupView {
  readonly el: HTMLElement;
  private app: App;
  private meterFill = h("div", { class: "meter-fill" });
  private heard = h("div", { class: "heard" });
  private status = h("span", { class: "muted" });
  private calOut = h("div", { class: "cal-out", "aria-live": "polite" });
  private devSel = h("select", { "aria-label": "Microphone" });
  private capture?: (e: InputEvent) => void;

  constructor(app: App) {
    this.app = app;
    const s = app.settings;

    // input source
    const radios = (["mic", "midi", "keyboard"] as InputSource[]).map((v) => {
      const label = { mic: "Microphone (acoustic piano)", midi: "MIDI (digital piano, Chrome)", keyboard: "On-screen / computer keyboard (testing)" }[v];
      const r = h("input", { type: "radio", name: "input", value: v, checked: s.input === v });
      r.addEventListener("change", () => {
        s.input = v;
        app.saveSoon();
        app.stopInput();
      });
      return h("label", { class: "radio" }, r, label);
    });
    this.devSel.addEventListener("change", () => {
      s.micDeviceId = this.devSel.value || undefined;
      app.saveSoon();
      app.stopInput();
    });
    const startBtn = h("button", { class: "btn primary", type: "button" }, "Start listening");
    startBtn.addEventListener("click", async () => {
      await app.startInput();
      void this.fillDevices();
    });
    const stopBtn = h("button", { class: "btn", type: "button" }, "Stop");
    stopBtn.addEventListener("click", () => app.stopInput());

    // calibration
    const calNoise = h("button", { class: "btn", type: "button" }, "1 · Room noise");
    calNoise.addEventListener("click", () => void this.calibrateNoise());
    const calTune = h("button", { class: "btn", type: "button" }, "2 · Tuning");
    calTune.addEventListener("click", () => void this.calibrateTuning());
    const calLat = h("button", { class: "btn", type: "button" }, "3 · Latency");
    calLat.addEventListener("click", () => void this.calibrateLatency());

    // options
    const num = (label: string, key: "previewSec" | "autoAdvanceSec" | "scale", min: number, max: number, step: number, hint: string) => {
      const inp = h("input", { type: "number", min, max, step, value: s[key] });
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        if (Number.isFinite(v)) s[key] = Math.min(max, Math.max(min, v));
        app.saveSoon();
      });
      return h("label", { class: "opt" }, h("span", {}, label), inp, h("small", { class: "muted" }, hint));
    };
    const check = (label: string, key: "pianoKeyControls" | "showKeyboard" | "audibleClick", hint: string) => {
      const inp = h("input", { type: "checkbox", checked: s[key] });
      inp.addEventListener("change", () => {
        s[key] = inp.checked;
        app.saveSoon();
      });
      return h("label", { class: "opt check" }, inp, h("span", {}, label), h("small", { class: "muted" }, hint));
    };
    const keyPicker = (label: string, key: "nextKey" | "replayKey") => {
      const val = h("strong", {}, midiName(s[key]));
      const b = h("button", { class: "btn", type: "button" }, "Set by playing it");
      b.addEventListener("click", () => {
        b.textContent = "Play the key now…";
        this.capture = (e) => {
          if (e.confidence < 0.5 || !e.midis.length) return;
          s[key] = e.midis[0]!;
          val.textContent = midiName(s[key]);
          b.textContent = "Set by playing it";
          this.capture = undefined;
          app.saveSoon();
        };
      });
      return h("div", { class: "opt" }, h("span", {}, label), val, b);
    };

    const testTone = h("button", { class: "btn", type: "button" }, "Play a test A4");
    testTone.addEventListener("click", () => app.player.note(69, performance.now() + 50, 1));

    this.el = h(
      "section",
      { class: "view setup" },
      h("h2", {}, "Input"),
      h("div", { class: "card" }, ...radios, h("div", { class: "row" }, h("span", {}, "Microphone:"), this.devSel), h("div", { class: "row" }, startBtn, stopBtn, this.status)),
      h("h2", {}, "What the trainer hears"),
      h(
        "div",
        { class: "card" },
        h("div", { class: "meter" }, this.meterFill),
        this.heard,
        h("p", { class: "muted" }, "Play single notes and chords. Each attack should appear once, with the right names. Confidence under 50% is treated as \"unclear\" and never counts against you."),
      ),
      h("h2", {}, "Calibrate"),
      h(
        "div",
        { class: "card" },
        h("p", {}, "Do these once with the laptop where it will sit on the music desk, and again if you move rooms."),
        h("div", { class: "row" }, calNoise, calTune, calLat),
        this.calOut,
        h("p", { class: "muted" }, `Current: noise floor ${s.fluxFloor.toFixed(1)}, A4 = ${s.a4.toFixed(1)} Hz, latency ${Math.round(s.latencyMs)} ms.`),
      ),
      h("h2", {}, "Record test clips (helps tune the detector to your piano)"),
      this.fixtureCard(),
      h("h2", {}, "Piano-key controls"),
      h(
        "div",
        { class: "card" },
        check("Use piano keys as controls between exercises", "pianoKeyControls", "Only active after an exercise ends, so notes in the music never trigger them."),
        keyPicker("Next exercise", "nextKey"),
        keyPicker("Hear it", "replayKey"),
      ),
      h("h2", {}, "Display & pacing"),
      h(
        "div",
        { class: "card" },
        num("Preview before playing (s)", "previewSec", 0, 15, 0.5, "The score shows and input is locked, so you look before you play."),
        num("Move on after a clean exercise (s)", "autoAdvanceSec", 0, 10, 0.1, "0 waits for Space or the next key."),
        num("Score size", "scale", 0.7, 2, 0.05, "Bigger is easier to read from the bench."),
        check("Show the on-screen keyboard", "showKeyboard", "Also clickable as an input when testing."),
        check("Audible metronome click", "audibleClick", "Bleeds into the mic through the speakers; fine with an AirPod in."),
        h("div", { class: "row" }, testTone),
      ),
    );

    app.mic.onLevel = (db) => {
      const pct = Math.max(0, Math.min(100, ((db + 80) / 80) * 100));
      this.meterFill.style.width = `${pct}%`;
    };
    app.listen((e) => this.onHeard(e));
    this.refreshStatus();
    const prev = app.onStatus;
    app.onStatus = () => {
      prev?.();
      this.refreshStatus();
    };
  }

  private fixtureCard(): HTMLElement {
    const prompt = h("p", { class: "fixture-prompt" }, "");
    const start = h("button", { class: "btn", type: "button" }, "Start recording");
    const next = h("button", { class: "btn", type: "button", disabled: true }, "Done, next prompt");
    let i = -1;
    let marks: { prompt: string; expected: number[][]; startSample: number; endSample?: number }[] = [];
    const samples = () => (this.app.mic.recording ?? []).reduce((a, c) => a + c.length, 0);
    const finish = () => {
      const rec = this.app.mic.recording ?? [];
      const sr = this.app.mic.ctx?.sampleRate ?? 48000;
      this.app.mic.recording = undefined;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const meta = { app: "sight-read-trainer", kind: "fixture", sampleRate: sr, settings: { a4: this.app.settings.a4, fluxFloor: this.app.settings.fluxFloor }, userAgent: navigator.userAgent, segments: marks };
      for (const [blob, name] of [
        [toWav(rec, sr), `piano-fixture-${stamp}.wav`],
        [new Blob([JSON.stringify(meta, null, 1)], { type: "application/json" }), `piano-fixture-${stamp}.json`],
      ] as const) {
        const a = h("a", { href: URL.createObjectURL(blob), download: name });
        a.click();
      }
      prompt.textContent = "Saved two files (a .wav and a .json) to Downloads. Put them in the repo's tests/fixtures/audio/ folder, or send them over.";
      start.disabled = false;
      next.disabled = true;
      start.textContent = "Record again";
    };
    const advance = () => {
      if (i >= 0) marks[i]!.endSample = samples();
      i++;
      if (i >= FIXTURE_PROMPTS.length) return finish();
      const p = FIXTURE_PROMPTS[i]!;
      marks.push({ prompt: p.say, expected: p.midis, startSample: samples() });
      prompt.replaceChildren(h("strong", {}, `${i + 1} / ${FIXTURE_PROMPTS.length}: `), p.say);
      next.textContent = i === FIXTURE_PROMPTS.length - 1 ? "Done, save files" : "Done, next prompt";
    };
    start.addEventListener("click", async () => {
      if (!(await this.ensureMic())) return;
      this.app.mic.recording = [];
      marks = [];
      i = -1;
      start.disabled = true;
      next.disabled = false;
      advance();
    });
    next.addEventListener("click", advance);
    return h(
      "div",
      { class: "card" },
      h("p", {}, `${FIXTURE_PROMPTS.length} short prompts, about 3 minutes in all. The recording is saved as a file on this computer; nothing is uploaded. Play each prompt, then click the button (pause a second first so the last note rings).`),
      h("div", { class: "row" }, start, next),
      prompt,
    );
  }

  private refreshStatus(): void {
    const a = this.app;
    this.status.textContent = a.inputStatus === "error" ? `Problem: ${a.inputError}` : a.inputStatus === "on" ? "Listening" : a.inputStatus === "starting" ? "Starting…" : "Not listening";
  }

  private async fillDevices(): Promise<void> {
    try {
      const devs = await listInputs();
      this.devSel.replaceChildren(h("option", { value: "" }, "Default"), ...devs.map((d) => h("option", { value: d.deviceId, selected: d.deviceId === this.app.settings.micDeviceId }, d.label || "Microphone")));
    } catch {
      /* permissions not granted yet */
    }
  }

  private onHeard(e: InputEvent): void {
    this.capture?.(e);
    if (!this.el.isConnected) return;
    const item = h("span", { class: `heard-item ${e.confidence >= 0.5 ? "" : "unsure"}` }, e.midis.map(midiName).join(" "), h("small", {}, ` ${Math.round(e.confidence * 100)}%`));
    this.heard.prepend(item);
    while (this.heard.childElementCount > 16) this.heard.lastElementChild?.remove();
  }

  private say(...parts: (string | HTMLElement)[]): void {
    this.calOut.replaceChildren(...parts.map((p) => (typeof p === "string" ? h("p", {}, p) : p)));
  }

  private async ensureMic(): Promise<boolean> {
    if (this.app.settings.input !== "mic") {
      this.say("Calibration is for the microphone input. Choose Microphone above first.");
      return false;
    }
    if (this.app.inputStatus !== "on") await this.app.startInput();
    return this.app.inputStatus === "on" && !!this.app.mic.det;
  }

  private async calibrateNoise(): Promise<void> {
    if (!(await this.ensureMic())) return;
    const det = this.app.mic.det!;
    this.say("Stay quiet for 3 seconds (normal room sounds are fine: that's the point)…");
    const start = det.fluxLog.length;
    await sleep(3000);
    const vals = det.fluxLog.slice(start).sort((a, b) => a - b);
    if (vals.length < 50) return this.say("Didn't get enough audio. Is the mic running?");
    const p99 = vals[Math.floor(vals.length * 0.99)]!;
    const floor = Math.max(2, Math.min(40, p99 * 2));
    this.app.settings.fluxFloor = floor;
    this.app.mic.setFluxFloor(floor);
    this.app.saveNow();
    this.say(`Noise floor set to ${floor.toFixed(1)} (room peak ${p99.toFixed(1)}).`);
  }

  private async calibrateTuning(): Promise<void> {
    if (!(await this.ensureMic())) return;
    const det = this.app.mic.det!;
    const s = this.app.settings;
    this.say("Play A4 (the A above middle C) four times, firmly, letting each ring for a second.");
    const freqs: number[] = [];
    await new Promise<void>((resolve) => {
      const off = this.app.listen((e) => {
        if (!e.midis.some((m) => Math.abs(m - 69) <= 1) || !det.lastPost) return;
        const f = peakNear(det.lastPost.mag, det.lastPost.size, det.sr, s.a4);
        if (f) freqs.push(f);
        this.say(`Heard ${freqs.length} of 4…`);
        if (freqs.length >= 4) {
          off();
          resolve();
        }
      });
      setTimeout(() => {
        off();
        resolve();
      }, 30000);
    });
    if (freqs.length < 2) return this.say("Didn't hear A4 clearly. Try again a little louder.");
    freqs.sort((a, b) => a - b);
    const a4 = freqs[Math.floor(freqs.length / 2)]!;
    s.a4 = Math.round(a4 * 10) / 10;
    this.app.mic.setTuning(s.a4);
    this.app.saveNow();
    const cents = 1200 * Math.log2(s.a4 / 440);
    this.say(`Your A4 is ${s.a4.toFixed(1)} Hz (${cents >= 0 ? "+" : ""}${cents.toFixed(0)} cents from 440). The listener now uses that.`);
  }

  private async calibrateLatency(): Promise<void> {
    if (!(await this.ensureMic())) return;
    const s = this.app.settings;
    const flash = h("div", { class: "flash" });
    this.say(h("p", {}, "Play any key exactly on each flash (8 flashes after 4 to get ready)."), flash);
    const period = 800;
    const t0 = performance.now() + 1000;
    const flashes = Array.from({ length: 12 }, (_, i) => t0 + i * period);
    const offsets: number[] = [];
    const off = this.app.listen((e) => {
      if (e.confidence < 0.5) return;
      const raw = e.time + s.latencyMs; // undo the current correction
      const nearest = flashes.slice(4).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
      const d = raw - nearest;
      if (Math.abs(d) < period / 2) offsets.push(d);
    });
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        const i = flashes.findIndex((t) => now >= t && now < t + 120);
        flash.classList.toggle("on", i >= 0);
        flash.textContent = i >= 0 ? (i < 4 ? String(4 - i) : "●") : "";
        if (now < flashes[flashes.length - 1]! + 600) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    off();
    if (offsets.length < 4) return this.say("Too few notes heard on the flashes. Try again.");
    offsets.sort((a, b) => a - b);
    const med = offsets[Math.floor(offsets.length / 2)]!;
    s.latencyMs = Math.round(med);
    this.app.mic.opts.latencyMs = s.latencyMs;
    this.app.saveNow();
    const spread = offsets[offsets.length - 1]! - offsets[0]!;
    this.say(`Latency set to ${s.latencyMs} ms (from ${offsets.length} notes, spread ${Math.round(spread)} ms). Timing grades are now measured from when your notes actually sounded.`);
  }
}

/** Prompts for the labelled fixture recording: what to play, and the MIDI notes expected. */
const FIXTURE_PROMPTS: { say: string; midis: number[][] }[] = [
  { say: "Middle C (C4), four times, a second apart", midis: [[60], [60], [60], [60]] },
  { say: "A0 (lowest A) twice, then C8 (top C) twice", midis: [[21], [21], [108], [108]] },
  { say: "C major scale up and down, right hand, C4 to C5 and back, steady quarter notes", midis: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60].map((m) => [m]) },
  { say: "Left hand, C3 down to C2 and back up, legato", midis: [48, 47, 45, 43, 41, 40, 38, 36, 38, 40, 41, 43, 45, 47, 48].map((m) => [m]) },
  { say: "Block chord C4-E4-G4, three times", midis: [[60, 64, 67], [60, 64, 67], [60, 64, 67]] },
  { say: "Block chord F2-C3-A3 (left hand), three times", midis: [[41, 48, 57], [41, 48, 57], [41, 48, 57]] },
  { say: "Octave C3+C4 together, three times", midis: [[48, 60], [48, 60], [48, 60]] },
  { say: "Single C3 alone, three times (to compare with the octave)", midis: [[48], [48], [48]] },
  { say: "Wrong-note check: play C4-E4-G4, then C4-E♭4-G4, then C4-F4-G4", midis: [[60, 64, 67], [60, 63, 67], [60, 65, 67]] },
  { say: "Repeated G4, eight fast notes (about 4 per second)", midis: Array.from({ length: 8 }, () => [67]) },
  { say: "With the sustain pedal down: C4 D4 E4 F4 G4, then release", midis: [60, 62, 64, 65, 67].map((m) => [m]) },
  { say: "Hands together: C3+E4, D3+F4, E3+G4, F3+A4 (quarter notes)", midis: [[48, 64], [50, 65], [52, 67], [53, 69]] },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
