/**
 * Playback: a light additive piano voice for "hear it" replays, and the metronome click.
 * Uses its own AudioContext (output only), scheduled against the session clock.
 */
import { midiToHz } from "../music/pitch";

export class Player {
  private ctx?: AudioContext;
  private out?: GainNode;
  private live: AudioScheduledSourceNode[] = [];

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
    return this.ctx;
  }

  /** Context time for a session-clock time, compensating the reported output latency. */
  ctxTime(perfMs: number): number {
    const ctx = this.ensure();
    const ts = ctx.getOutputTimestamp();
    const base = (ts.contextTime ?? ctx.currentTime) + (perfMs - (ts.performanceTime ?? performance.now())) / 1000;
    return Math.max(ctx.currentTime, base - (ctx.outputLatency || 0));
  }

  note(midi: number, perfMs: number, dur: number, vel = 0.6): void {
    const ctx = this.ensure();
    const t = this.ctxTime(perfMs);
    const f = midiToHz(midi);
    const g = ctx.createGain();
    const decay = 0.3 + 3 * Math.pow(2, -(midi - 21) / 18);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.005, decay / 3);
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    g.connect(this.out!);
    [1, 2, 3, 4, 5].forEach((h, i) => {
      if (f * h > 8000) return;
      const o = ctx.createOscillator();
      o.frequency.value = f * h * Math.sqrt(1 + 0.0004 * h * h);
      const pg = ctx.createGain();
      pg.gain.value = [1, 0.5, 0.25, 0.15, 0.08][i]!;
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + dur + 0.4);
      this.live.push(o);
    });
  }

  click(perfMs: number, accent: boolean): void {
    const ctx = this.ensure();
    const t = this.ctxTime(perfMs);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.06);
    this.live.push(o);
  }

  stopAll(): void {
    for (const n of this.live) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
  }
}
