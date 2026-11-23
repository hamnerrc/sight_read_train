/** Progress: where you are on the ladder, what to work on (advisor), reviews, history, and the progress file. */
import { LADDER, levelSpec } from "../curriculum/levels";
import { exportFile, merge, parseImport, reset } from "../storage";
import { reviewCount, weakestItems, windowStats } from "../trainer/progress";
import type { App } from "./app";
import { h } from "./dom";
import { itemLabel } from "./labels";

export class ProgressView {
  readonly el = h("section", { class: "view progress-view" });
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  render(): void {
    const { progress: p, history } = this.app.file;
    const spec = levelSpec(p.level);
    const s100 = windowStats(history, Math.min(100, history.length || 1));
    const rc = reviewCount(p, Date.now());

    // level over time
    const recent = history.slice(-400);
    const chart = levelChart(recent.map((r) => r.level));

    // advisor
    const weak = weakestItems(p, 8);
    const due = Object.values(p.cards).sort((a, b) => a.dueClock - b.dueClock);
    const advice: string[] = [];
    if (s100 && history.length >= 20) {
      if (s100.passRate < 0.7) advice.push("You're below the 80% band: the staircase is stepping you down. That's working as intended; stay with it.");
      else if (s100.passRate > 0.9) advice.push("Above 90% clean: the staircase will push you up soon. If it feels too easy, shorten the preview time in Setup.");
      if (s100.timingRate !== null && s100.timingRate < 0.6) advice.push("Notes are ahead of timing. Turn on the audible click (M, with an AirPod) and count aloud for a while.");
    }
    if (weak[0]) advice.push(`Biggest leak: ${itemLabel(weak[0].item)} (${Math.round(weak[0].rate * 100)}% missed over ${weak[0].seen}). The generator is already feeding it back to you.`);
    if (!advice.length) advice.push("Play a few dozen exercises and this will name your weakest notes, intervals and key signatures.");

    // file
    const exportBtn = h("button", { class: "btn", type: "button" }, "Export progress");
    exportBtn.addEventListener("click", () => {
      const a = h("a", { href: URL.createObjectURL(exportFile(this.app.file)), download: `sight-read-trainer-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
    });
    const fileIn = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    const importBtn = h("button", { class: "btn", type: "button" }, "Import progress…");
    importBtn.addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        const replace = confirm("Replace everything saved in this browser with the file?\n\nOK = replace, Cancel = merge the file into what's here.");
        this.app.file = replace ? { ...data, settings: this.app.file.settings } : merge(this.app.file, data);
        this.app.saveNow();
        this.render();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
    const resetBtn = h("button", { class: "btn danger", type: "button" }, "Reset progress…");
    resetBtn.addEventListener("click", () => {
      if (!confirm("Erase level, reviews and history? Settings and calibration are kept. This can't be undone.")) return;
      this.app.file = reset();
      this.render();
    });

    // ladder map
    const ladder = h(
      "ol",
      { class: "ladder" },
      ...LADDER.map((l) =>
        h(
          "li",
          { class: l.n === p.level ? "here" : l.n <= p.best ? "seen" : "" },
          h("span", { class: "n" }, String(l.n)),
          ` ${l.title}`,
          h("small", { class: "muted" }, ` · ${l.mode === "wait" ? "wait" : `♩${l.tempo}`} · ${l.bars} bar${l.bars > 1 ? "s" : ""}`),
        ),
      ),
      h("li", { class: p.level > LADDER.length ? "here" : "" }, h("span", { class: "n" }, "∞"), " …and on forever: faster, longer, denser"),
    );

    const rows = history
      .slice(-40)
      .reverse()
      .map((r) =>
        h(
          "tr",
          {},
          h("td", {}, new Date(r.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })),
          h("td", {}, String(r.level)),
          h("td", { class: r.pass ? "ok" : "bad" }, r.pass ? "clean" : "miss"),
          h("td", {}, r.timingPass === null ? "–" : r.timingPass ? "on time" : `±${r.meanAbsMs ?? "?"} ms`),
          h("td", { class: "muted" }, r.note ?? ""),
        ),
      );

    this.el.replaceChildren(
      h("h2", {}, "Where you are"),
      h(
        "div",
        { class: "card stats-cards" },
        stat("Level", String(p.level), spec.title),
        stat("Best", String(p.best), levelSpec(p.best).title),
        stat("Clean (last 100)", s100 ? `${Math.round(s100.passRate * 100)}%` : "–", "target ≈ 80%"),
        stat("Tempo factor", `×${p.tempoFactor.toFixed(2)}`, "adjusted by the timing grade"),
        stat("Reviews", `${rc.due}/${rc.total}`, "due now / in review"),
        stat("Exercises", String(history.length), ""),
      ),
      chart,
      h("h2", {}, "What to work on"),
      h("div", { class: "card" }, ...advice.map((a) => h("p", {}, a))),
      weak.length
        ? h(
            "div",
            { class: "card" },
            h("h3", {}, "Weakest skills"),
            h("ul", { class: "weak" }, ...weak.map((w) => h("li", {}, h("span", { class: "bar-mini", style: `--w:${Math.round(w.rate * 100)}%` }), `${itemLabel(w.item)} `, h("small", { class: "muted" }, `${Math.round(w.rate * 100)}% missed · seen ${w.seen}`)))),
          )
        : "",
      due.length
        ? h(
            "div",
            { class: "card" },
            h("h3", {}, "In spaced review"),
            h("p", { class: "muted" }, "Each comes back inside fresh exercises after 3, 8 and 25 exercises, then after an 8-hour break, and leaves once it's clean every time."),
            h("ul", {}, ...due.slice(0, 30).map((c) => h("li", {}, itemLabel(c.key), h("small", { class: "muted" }, ` · step ${c.step + 1} of 4`)))),
          )
        : "",
      h("h2", {}, "Recent exercises"),
      h("div", { class: "card scroll" }, h("table", { class: "hist" }, h("tbody", {}, ...rows))),
      h("h2", {}, "The curriculum"),
      h("details", { class: "card" }, h("summary", {}, `${LADDER.length} levels from a single middle C to the whole keyboard in every key, then on forever`), ladder),
      h("h2", {}, "Progress file"),
      h("div", { class: "card row" }, exportBtn, importBtn, fileIn, resetBtn),
    );
    this.el.querySelector(".ladder .here")?.scrollIntoView?.({ block: "nearest" });
  }
}

function stat(label: string, value: string, sub: string): HTMLElement {
  return h("div", { class: "stat" }, h("div", { class: "stat-label" }, label), h("div", { class: "stat-value" }, value), h("div", { class: "stat-sub muted" }, sub));
}

function levelChart(levels: number[]): HTMLElement {
  const wrap = h("div", { class: "card chart" });
  if (levels.length < 2) {
    wrap.append(h("p", { class: "muted" }, "Your level over time will show here."));
    return wrap;
  }
  const W = 600;
  const H = 120;
  const max = Math.max(...levels) + 1;
  const min = Math.max(0, Math.min(...levels) - 1);
  const pts = levels.map((l, i) => `${((i / (levels.length - 1)) * W).toFixed(1)},${(H - ((l - min) / (max - min)) * H).toFixed(1)}`).join(" ");
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark" role="img" aria-label="Level over the last ${levels.length} exercises"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="chart-axis muted"><span>${levels.length} exercises ago</span><span>levels ${min + 1}–${max - 1}</span><span>now</span></div>`;
  return wrap;
}
