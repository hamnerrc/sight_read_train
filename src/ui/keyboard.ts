/** On-screen 88-key keyboard: shows expected keys (crutch), flashes what was heard, and is clickable as an input for testing. */

const BLACK = new Set([1, 3, 6, 8, 10]);

export class Keyboard {
  readonly el: HTMLElement;
  private keys = new Map<number, SVGRectElement>();
  onPress?: (midi: number) => void;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "keyboard";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const whiteW = 10;
    let whites = 0;
    for (let m = 21; m <= 108; m++) if (!BLACK.has(m % 12)) whites++;
    svg.setAttribute("viewBox", `0 0 ${whites * whiteW} 60`);
    svg.setAttribute("preserveAspectRatio", "none");
    const blackLayer: SVGRectElement[] = [];
    let x = 0;
    for (let m = 21; m <= 108; m++) {
      const r = document.createElementNS(ns, "rect");
      if (BLACK.has(m % 12)) {
        r.setAttribute("x", String(x - 3));
        r.setAttribute("width", "6");
        r.setAttribute("height", "37");
        r.setAttribute("class", "k k-black");
        blackLayer.push(r);
      } else {
        r.setAttribute("x", String(x));
        r.setAttribute("width", String(whiteW));
        r.setAttribute("height", "60");
        r.setAttribute("class", m === 60 ? "k k-white k-c4" : "k k-white");
        svg.appendChild(r);
        x += whiteW;
      }
      r.setAttribute("y", "0");
      r.dataset.midi = String(m);
      this.keys.set(m, r);
    }
    blackLayer.forEach((r) => svg.appendChild(r));
    svg.addEventListener("pointerdown", (e) => {
      const t = e.target as SVGElement;
      const m = Number(t.dataset?.midi);
      if (m) this.onPress?.(m);
    });
    this.el.appendChild(svg);
  }

  /** Highlight the keys of the current event (crutch). */
  setExpected(midis: number[]): void {
    this.keys.forEach((r, m) => r.classList.toggle("k-expected", midis.includes(m)));
  }

  flash(midis: number[], ok: boolean): void {
    for (const m of midis) {
      const r = this.keys.get(m);
      if (!r) continue;
      const cls = ok ? "k-hit" : "k-miss";
      r.classList.add(cls);
      setTimeout(() => r.classList.remove(cls), 350);
    }
  }
}
