import "./style.css";
import { App } from "./ui/app";
import { h } from "./ui/dom";
import { guideView } from "./ui/guide";
import { ProgressView } from "./ui/progress-view";
import { SetupView } from "./ui/setup";
import { COMPUTER_KEYS, TrainView } from "./ui/train";

const app = new App();
const train = new TrainView(app);
const setup = new SetupView(app);
const progress = new ProgressView(app);
const guide = guideView();

const VIEWS = { train: train.el, progress: progress.el, setup: setup.el, guide } as const;
type ViewName = keyof typeof VIEWS;

const nav = h("nav", { class: "views", "aria-label": "Views" }, ...(Object.keys(VIEWS) as ViewName[]).map((v) => h("a", { href: `#${v}`, "data-view": v }, v[0]!.toUpperCase() + v.slice(1))));
const main = h("main", { class: "main" });
document.getElementById("app")!.append(h("header", { class: "appbar" }, h("div", { class: "brand" }, "Sight Read Trainer"), nav), main);

let current: ViewName = "train";
function route(): void {
  const v = (location.hash.slice(1) || "train") as ViewName;
  current = v in VIEWS ? v : "train";
  main.replaceChildren(VIEWS[current]);
  nav.querySelectorAll("a").forEach((a) => (a.dataset.view === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (current === "progress") progress.render();
  if (current === "train") train.updateChrome();
}
window.addEventListener("hashchange", route);
route();

app.onStatus = () => train.updateChrome();

// handle for scripts/smoke.mjs and for poking at the trainer from the console
(window as unknown as { __srt: unknown }).__srt = { app, train };

// computer-keyboard piano (testing without a piano): a w s e d f t g y h u j k o l p ; = C4 … E5, z / x shift octaves
let octaveShift = 0;
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
  const k = e.key.toLowerCase();
  if (app.settings.input === "keyboard" && !e.repeat) {
    if (k === "z" || k === "x") {
      octaveShift += k === "z" ? -12 : 12;
      return;
    }
    const m = COMPUTER_KEYS.get(k);
    if (m !== undefined) {
      app.dispatch({ time: performance.now(), midis: [m + octaveShift], source: "keyboard", confidence: 1 });
      e.preventDefault();
      return;
    }
  }
  if (current === "train" && train.key(e)) e.preventDefault();
});
