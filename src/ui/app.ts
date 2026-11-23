/** Shared app state: saved file, input devices, player, and the save/notify plumbing between views. */
import { MicListener } from "../audio/mic";
import { MidiListener } from "../audio/midi";
import { Player } from "../audio/player";
import { type SaveFile, load, save } from "../storage";
import type { InputEvent } from "../types";

export type InputHandler = (e: InputEvent, raw?: { db: number }) => void;

export class App {
  file: SaveFile;
  readonly player = new Player();
  mic: MicListener;
  readonly midi = new MidiListener();
  private handlers = new Set<InputHandler>();
  private saveTimer?: number;
  inputStatus: "off" | "starting" | "on" | "error" = "off";
  inputError = "";
  onStatus?: () => void;

  constructor() {
    this.file = load();
    const s = this.file.settings;
    this.mic = new MicListener({ a4: s.a4, fluxFloor: s.fluxFloor, latencyMs: s.latencyMs, deviceId: s.micDeviceId });
    this.mic.onNote = (e, d) => this.dispatch(e, { db: d.db });
    this.midi.onNote = (e) => this.dispatch(e);
  }

  get settings() {
    return this.file.settings;
  }

  /** Subscribe to heard notes from whichever input is active. */
  listen(h: InputHandler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  dispatch(e: InputEvent, raw?: { db: number }): void {
    for (const h of this.handlers) h(e, raw);
  }

  /** Start the selected input. Needs a user gesture the first time (mic permission). */
  async startInput(): Promise<void> {
    const src = this.settings.input;
    this.inputStatus = "starting";
    this.onStatus?.();
    try {
      if (src === "mic") {
        this.midi.stop();
        this.mic.opts = { a4: this.settings.a4, fluxFloor: this.settings.fluxFloor, latencyMs: this.settings.latencyMs, deviceId: this.settings.micDeviceId };
        await this.mic.start();
      } else if (src === "midi") {
        this.mic.stop();
        if (!MidiListener.supported) throw new Error("This browser has no Web MIDI (use Chrome).");
        const names = await this.midi.start();
        if (!names.length) throw new Error("No MIDI device found.");
      } else {
        this.mic.stop();
        this.midi.stop();
      }
      this.inputStatus = "on";
      this.inputError = "";
    } catch (err) {
      this.inputStatus = "error";
      this.inputError = err instanceof Error ? err.message : String(err);
    }
    this.onStatus?.();
  }

  stopInput(): void {
    this.mic.stop();
    this.midi.stop();
    this.inputStatus = "off";
    this.onStatus?.();
  }

  saveSoon(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => save(this.file), 300);
  }

  saveNow(): void {
    clearTimeout(this.saveTimer);
    save(this.file);
  }
}
