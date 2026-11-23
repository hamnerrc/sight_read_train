/** Web MIDI input (Chrome): note-ons become InputEvents on the session clock. Optional; the trainer is mic-first. */
import type { InputEvent } from "../types";

export class MidiListener {
  private access?: MIDIAccess;
  onNote?: (e: InputEvent) => void;

  static get supported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  async start(): Promise<string[]> {
    this.access = await navigator.requestMIDIAccess();
    const names: string[] = [];
    const attach = () => {
      names.length = 0;
      this.access!.inputs.forEach((input) => {
        names.push(input.name ?? "MIDI input");
        input.onmidimessage = (msg) => {
          const d = msg.data;
          if (!d || d.length < 3) return;
          const cmd = d[0]! & 0xf0;
          if (cmd === 0x90 && d[2]! > 0) this.onNote?.({ time: msg.timeStamp, midis: [d[1]!], source: "midi", confidence: 1 });
        };
      });
    };
    attach();
    this.access.onstatechange = attach;
    return names;
  }

  stop(): void {
    this.access?.inputs.forEach((i) => (i.onmidimessage = null));
    this.access = undefined;
  }
}
