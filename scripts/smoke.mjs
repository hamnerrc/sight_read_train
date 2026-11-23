// Browser smoke test: builds nothing, serves dist/ with `vite preview`, drives the real app in
// headless Chrome with the on-screen-keyboard input, and plays exercises both cleanly and with
// a deliberate wrong note. Screenshots go to the directory given as the first argument.
//   npm run build && node scripts/smoke.mjs /tmp/shots
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "smoke-shots";
mkdirSync(out, { recursive: true });
const port = 4319;
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

try {
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => {
    localStorage.setItem("srt-v1", JSON.stringify({ app: "sight-read-trainer", version: 1, settings: { input: "keyboard", previewSec: 0.3, autoAdvanceSec: 0 } }));
  });
  await page.reload();
  await page.screenshot({ path: `${out}/0-idle.png` });
  await page.click("text=Start listening");
  await page.waitForTimeout(300);

  /** Play the current exercise: correctly, or with one wrong note at event `wrongAt`. */
  const play = (wrongAt = -1) =>
    page.evaluate(async (wrongAt) => {
      const { app, train } = window.__srt;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      while (train.debug.phase === "preview") await sleep(20);
      const { ex } = train.debug;
      if (ex.mode === "wait") {
        for (let i = 0; i < ex.events.length; i++) {
          const ev = ex.events[i];
          if (i === wrongAt) app.dispatch({ time: performance.now(), midis: [ev.midis[0] + 1], source: "keyboard", confidence: 1 });
          app.dispatch({ time: performance.now(), midis: ev.midis, source: "keyboard", confidence: 1 });
          await sleep(30);
        }
      } else {
        const f = train.debug.follower;
        for (let i = 0; i < ex.events.length; i++) {
          const t = f.timeOf(i);
          while (performance.now() < t) await sleep(2);
          const ev = ex.events[i];
          const midis = i === wrongAt ? [ev.midis[0] + 1, ...ev.midis.slice(1)] : ev.midis;
          app.dispatch({ time: t + 5, midis, source: "keyboard", confidence: 1 });
        }
      }
      while (train.debug.phase !== "result") await sleep(20);
      const g = train.debug.grade;
      return { level: ex.level, mode: ex.mode, pass: g.pass, timingPass: g.timingPass, fb: document.querySelector(".feedback").textContent, events: ex.events.length };
    }, wrongAt);

  // climb: 3 clean exercises per level
  for (let i = 0; i < 9; i++) {
    const r = await play();
    check(r.pass, `clean run passes (level ${r.level}, ${r.mode}, ${r.events} events)`);
    await page.keyboard.press("Space");
  }
  const lvl = await page.evaluate(() => window.__srt.app.file.progress.level);
  check(lvl === 4, `three clean in a row moves up a level each time (now level ${lvl})`);
  await page.screenshot({ path: `${out}/1-train-wait.png` });

  const miss = await play(1);
  check(!miss.pass && /you played/.test(miss.fb), `wrong note fails and is named: "${miss.fb.slice(0, 90)}"`);
  await page.screenshot({ path: `${out}/2-miss.png` });
  const lvl2 = await page.evaluate(() => window.__srt.app.file.progress.level);
  check(lvl2 === 3, `a miss moves down one level (now ${lvl2})`);
  await page.keyboard.press("r"); // hear it: must not throw
  await page.keyboard.press("y");

  // jump to timed, hands-together levels and play them
  for (const level of [25, 36, 55, 75, 131]) {
    await page.evaluate((l) => {
      window.__srt.app.file.progress.level = l;
    }, level);
    await page.keyboard.press("Space");
    const r = await play();
    check(r.pass && r.timingPass !== false, `level ${level} (${r.mode}) clean in time: pass=${r.pass} timing=${r.timingPass}`);
    await page.screenshot({ path: `${out}/3-level-${level}.png` });
    await page.keyboard.press("Space");
    const w = await play(2);
    check(!w.pass, `level ${level} wrong note fails: "${w.fb.slice(0, 80)}"`);
  }
  await page.keyboard.press("h");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/4-crutches.png` });
  await page.keyboard.press("t");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/5-stats.png`, fullPage: true });

  for (const v of ["progress", "setup", "guide"]) {
    await page.goto(`http://localhost:${port}/#${v}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/6-${v}.png`, fullPage: true });
  }
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  console.log("FAIL exception", e);
  failures++;
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} failure(s)` : "all smoke checks passed");
process.exit(failures ? 1 : 0);
