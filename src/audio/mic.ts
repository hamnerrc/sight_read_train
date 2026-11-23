/**
 * Microphone listener: getUserMedia with every voice-processing filter off, an AudioWorklet
 * that forwards raw samples, and the Detector. Emits InputEvents on the session clock
 * (performance.now() milliseconds), corrected by the calibrated input latency.
 */
import type { InputEvent } from "../types";
import { type Detection, Detector } from "./detector";

export interface MicOptions {
  a4: number;
  fluxFloor: number;
  latencyMs: number;
  deviceId?: string;
}

export class MicListener {
  ctx?: AudioContext;
  det?: Detector;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private startFrame?: number;
  opts: MicOptions;
  /** Expected pitches around a session time (ms). */
  prior: (ms: number) => number[] = () => [];
  onNote?: (e: InputEvent, d: Detection) => void;
  /** When set, raw samples are appended here (for recording test fixtures). */
  recording?: Float32Array[];
  /** Called for every chunk with the latest level (dBFS). */
  onLevel?: (db: number) => void;

  constructor(opts: MicOptions) {
    this.opts = opts;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.opts.deviceId ? { exact: this.opts.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
    const src = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, "srt-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node = node;
    const det = new Detector(ctx.sampleRate, { a4: this.opts.a4, fluxFloor: this.opts.fluxFloor });
    this.det = det;
    det.prior = (streamMs) => this.prior(this.streamToSession(streamMs));
    node.port.onmessage = (ev: MessageEvent<{ frame: number; data: Float32Array }>) => {
      this.startFrame ??= ev.data.frame;
      this.recording?.push(ev.data.data);
      for (const d of det.push(ev.data.data)) this.emit(d);
      this.onLevel?.(det.levelDb);
    };
    src.connect(node);
    if (ctx.state !== "running") await ctx.resume();
  }

  stop(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = undefined;
    this.det = undefined;
    this.startFrame = undefined;
  }

  setTuning(a4: number): void {
    this.opts.a4 = a4;
    if (this.det) this.det.a4 = a4;
  }

  setFluxFloor(f: number): void {
    this.opts.fluxFloor = f;
    if (this.det) this.det.fluxFloor = f;
  }

  /** Convert a stream time (ms since the first captured sample) to the session clock. */
  streamToSession(streamMs: number): number {
    const ctx = this.ctx;
    if (!ctx || this.startFrame === undefined) return performance.now();
    const ctxTime = this.startFrame / ctx.sampleRate + streamMs / 1000;
    const ts = ctx.getOutputTimestamp();
    const perf = (ts.performanceTime ?? performance.now()) + (ctxTime - (ts.contextTime ?? ctx.currentTime)) * 1000;
    return perf - this.opts.latencyMs;
  }

  private emit(d: Detection): void {
    const time = this.streamToSession(d.time);
    // Confident pitches and probable ghosts go out as separate events, so a ghost's low
    // confidence never masks a real wrong note in the same attack.
    const sure = d.midis.filter((_, i) => d.confidence[i]! >= 0.5);
    const unsure = d.midis.filter((_, i) => d.confidence[i]! < 0.5);
    if (sure.length) this.onNote?.({ time, midis: sure, source: "audio", confidence: Math.min(...sure.map((m) => d.confidence[d.midis.indexOf(m)]!)) }, d);
    if (unsure.length) this.onNote?.({ time, midis: unsure, source: "audio", confidence: Math.max(...unsure.map((m) => d.confidence[d.midis.indexOf(m)]!)) }, d);
  }
}

export async function listInputs(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput");
}

/** 16-bit mono WAV from float chunks. */
export function toWav(chunks: Float32Array[], sr: number): Blob {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks)
    for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i]!)) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}
