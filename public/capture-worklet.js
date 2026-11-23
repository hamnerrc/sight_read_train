// Posts raw mic samples to the main thread in 1024-sample chunks, tagged with the
// AudioContext frame of their first sample so detections can be timed exactly.
class SrtCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024);
    this.n = 0;
    this.start = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      if (this.n === 0) this.start = currentFrame;
      this.buf.set(ch, this.n);
      this.n += ch.length;
      if (this.n >= this.buf.length) {
        this.port.postMessage({ frame: this.start, data: this.buf.slice(0, this.n) });
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("srt-capture", SrtCapture);
