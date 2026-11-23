# Slidy trainer: feature inventory

This is a record of the Speedsliding Atlas trainer (repo `hamnerrc/slidy_sim_trainer`) so the local copy can be deleted. The sight-reading trainer copies its *training loop*. The puzzle content does not carry over.

## Stack
- Static site: `index.html`, `css/styles.css` and plain `js/*.js` (IIFE modules, no build step).
- Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
- All state lives in `localStorage` (`ssa-ui-v3` for UI prefs, `ssa-v3-<puzzle>` for progress).
- Asset URLs carry a version (`?v=20261122a`) so browsers fetch new code instead of a cached copy.

## Views
| View | Purpose |
|---|---|
| Train | The trainer (described below) |
| Advisor | "What should I work on?" Takes your ao movecount and time, compares them with about 200 leaderboard players at your level, and recommends a plan |
| Guide | A long-form field guide: real numbers, per-puzzle lessons, techniques, setup, tiers, sources |

## Trainer
**Puzzle tabs** (3x2, 3x3, 4x3, 4x4). Keys 1–4 switch between them.

**Methods**: each puzzle is trained with a chosen method, made of graded *steps*, for example "column then 3x2". Each step is graded against its own exact standard: the step's optimum, or for set-up steps the best total including the next step. Users can define custom methods (`1-5-9-13 / 4 / 2-3 / rest`).

**Scramble source**
- *Every position, easiest first*: serves every case once, in order of depth, until all are cleared. A progress bar counts toward the total.
- *Depth by depth*: about 10 cases per depth level (used where the space is too big to enumerate).
- *Random states*: used after clearing, with an optional **depth range** (from/to) to concentrate on hard bands.

**Grading**: exact. Meeting or beating the standard is a pass. One extra move is a miss.

**On a miss**: the solve stops and a **replay** runs. It plays the user's moves up to the point where they left optimal, highlights the tile optimal would have moved, then plays the optimal finish. A note names the exact move ("On move 4 you went ←; optimal goes ↑"). `R` replays it and `Space` goes to the next case. Replay speed is a setting (auto ≈ 6 s, or 2/4/8 moves/s).

**Spaced repetition**: a missed case comes back after 3 solves. It leaves the pool only after it meets the standard 4 times in a row, spread over **3, 8 and 25 solves and then an 8-hour break**. Another miss restarts the schedule. Reviews are cleared before new cases are added.

**Drill reviews** mode: practice only the cases in review, with a button to return to normal training.

**While-solving settings**
- *Show optimal* (`H`): shows the target movecount and the case's depth. When it's off, both stay hidden until the case ends (recall test).
- *Show the timer*.
- *Hover controls*: the gap follows the mouse or a dragged finger.
- *Board size*.
- *Pause before a new scramble* (0 / 0.5 / 1 / 1.5 / 2 s): locks input so you look before you move.

**Progress and stats**
- Progress bar: cleared/total in phase 1, then the current streak and the pass rate over the last 100.
- Stats (`T`): last solve, ao5 … ao1000 and session mean, each with "over optimal" and σ, adjusted for case difficulty. "+0.00 / ±0.0" means every solve in the window was optimal.
- "Last 100 solves" panel, with a "use in advisor" link.

**Data management**: export and import a progress file (replace or merge), reset one method, or erase everything.

**Other keys**: arrows/WASD/IJKL to move, `F` fullscreen.

## The training recipe it encodes (from the 3x2 write-up)
1. Learn easiest first, with the target shown and stats hidden.
2. Clear reviews before adding new cases.
3. After clearing everything, switch to random states, hide the target, and focus on hard bands with the depth range.
4. Mastery gate: **100 in a row with zero misses**.

What made it work: exact grading, a replay that pinpoints the single wrong move, misses that return on a schedule, hiding the target at the end, and a hard pass bar.
