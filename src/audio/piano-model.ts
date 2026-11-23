/** Rough piano string inharmonicity B by MIDI note: lowest near C3, rising toward both ends. */
export function inharmonicity(m: number): number {
  return m >= 48 ? Math.pow(10, -3.8 + 0.035 * (m - 48)) : Math.pow(10, -3.8 + 0.012 * (48 - m));
}
