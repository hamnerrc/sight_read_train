/** Iterative radix-2 FFT with cached twiddles and window functions. Pure, so it runs in tests. */

const cache = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();

function tables(n: number) {
  let t = cache.get(n);
  if (t) return t;
  if (n & (n - 1)) throw new Error(`FFT size must be a power of two, got ${n}`);
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
    rev[i] = r;
  }
  t = { cos, sin, rev };
  cache.set(n, t);
  return t;
}

/** In-place complex FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { cos, sin, rev } = tables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]!;
        const s = sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const xr = re[b]! * c - im[b]! * s;
        const xi = re[b]! * s + im[b]! * c;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

const windows = new Map<number, Float64Array>();
export function hann(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    windows.set(n, w);
  }
  return w;
}

/**
 * Magnitude spectrum of `x[start .. start+n)` with a Hann window, zero-padded to `size`.
 * Returns size/2 bins, normalised so a full-scale sine reads ≈ 1.
 */
export function magnitude(x: ArrayLike<number>, start: number, n: number, size = n): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const w = hann(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * w[i]!;
  fft(re, im);
  const out = new Float64Array(size / 2);
  const norm = 4 / n;
  for (let i = 0; i < size / 2; i++) out[i] = Math.hypot(re[i]!, im[i]!) * norm;
  return out;
}
