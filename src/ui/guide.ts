/** Guide: how the trainer works and how to use it well. Static content. */
import { h } from "./dom";

export function guideView(): HTMLElement {
  const sec = (title: string, ...body: (string | HTMLElement)[]) => h("div", { class: "card" }, h("h3", {}, title), ...body.map((b) => (typeof b === "string" ? h("p", {}, b) : b)));
  const li = (...xs: string[]) => h("ul", {}, ...xs.map((x) => h("li", {}, x)));
  return h(
    "section",
    { class: "view guide" },
    h("h2", {}, "How it works"),
    sec(
      "The loop",
      "Every exercise is new music, written for your current level. You read it for a moment (the preview), then play it. The trainer listens, follows the score note by note, and grades it exactly: every note right, nothing extra, nothing skipped. In timed levels, timing gets its own separate grade.",
      "When something goes wrong, the first error turns red and the note under the score names it, for example \"Bar 3, beat 2: you played F♯4; the score has F4\". R plays that bar correctly, Y plays back what you played, and Space moves on.",
    ),
    sec(
      "Difficulty that follows you",
      "There is no final level. Three clean exercises in a row move you up one level, and any miss moves you down one. That holds you at about 80% clean, hard enough to stretch and easy enough to stay accurate. A separate tempo control does the same with the timing grade: three on-time exercises and the tempo rises 5%, a late or rushed one and it drops 5%.",
      "Level 1 is a single middle C. Each level adds exactly one thing: a new note, a skip, the left hand, playing in time, a rhythm, a key, hands together, chords… until the whole keyboard in every key. After that it keeps getting faster, longer and denser.",
    ),
    sec(
      "Misses come back, in new music",
      "Replaying the exact passage you missed would train memory, not reading. Instead the trainer tracks the skills behind each miss: reading that particular note on that staff, the key-signature sharp you forgot, a left-hand sixth. A missed skill is written into fresh exercises after 3, 8 and 25 more exercises, then after an 8-hour break, and leaves review once it's clean every time. Another miss restarts its schedule.",
    ),
    sec(
      "Wait mode and tempo mode",
      li(
        "Wait mode (the first levels): the score waits on each note until you play it. Only the notes are graded. This is for learning where the notes are with no time pressure.",
        "Tempo mode: a one-bar count-in, then the cursor moves at the tempo and does not wait. Stopping to find a note shows up as a missed note, so keep going: that's the sight-reading skill.",
      ),
    ),
    sec(
      "Crutches (H)",
      "Crutches put note names under the notes and light the expected keys on the on-screen keyboard. Use them while a level is new, then turn them off. The level only counts toward real progress if you'd pass it without them.",
    ),
    sec(
      "Reading well",
      li(
        "Use the preview: find the key signature, the time signature, the lowest and highest notes, and any accidentals before you start.",
        "Read intervals, not note names: \"up a third, down a step\" is faster than naming every note.",
        "Keep your eyes moving ahead of your hands. Don't look down; the fingering numbers mark every hand-position change.",
        "Keep going in tempo mode. A wrong note in time beats a right note late.",
      ),
    ),
    sec(
      "Setting up at the piano",
      li(
        "Put the laptop on the music desk with the screen at reading height. Use Chrome.",
        "In Setup, run the three calibrations once: room noise, tuning (play A4 four times), latency (play on the flashes).",
        "Play a few notes and chords and check the \"What the trainer hears\" panel names them correctly.",
        "Keep the sustain pedal off in the early levels.",
        "Piano-key controls: by default the lowest A means \"next\" and the top C means \"hear it\". They only work between exercises, so they never clash with the music.",
      ),
    ),
    sec(
      "Keys",
      li("Space / Enter: next exercise", "R: hear the first error's bar played correctly", "Y: hear what you played", "H: crutches on/off", "T: stats on/off", "M: audible click on/off", "F: full screen"),
    ),
  );
}
