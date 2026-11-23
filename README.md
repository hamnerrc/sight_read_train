# Sight Read Trainer

A piano sight-reading trainer that **listens to you play in real time** through the laptop mic (or exact Web MIDI from a digital piano). Put the laptop on the music desk and play.

It uses the deliberate-practice loop from the slidy-puzzle trainer:

- **Exact grading**: a pass means every note right, nothing extra, every onset on time.
- **Error replay**: shows the *first* wrong note or timing slip and plays it back next to the correct version.
- **Spaced return of misses**: the *skills* behind each miss (that note, that key-signature sharp, that interval) are written into fresh music after 3, 8 and 25 exercises, then after an 8-hour break.
- **Crutches you remove later**: note names, lit keyboard, metronome, wait mode.
- **Difficulty that follows you**: 3 clean in a row moves up a level and a miss moves down, holding you at about 80% clean. Tempo adapts separately from the timing grade.

Content comes from finite drill atoms (every note, interval, chord and rhythm cell) plus a seeded generator that produces endless graded exercises.

**Live:** https://hamnerrc.github.io/sight_read_train/ (Chrome).

**Status:** the trainer is usable end to end: an endless curriculum from a single middle C, live grading, replays, adaptive difficulty and spaced review. The microphone detector is verified on synthetic piano audio only; the first real-piano check follows [`docs/AUDIO.md`](docs/AUDIO.md#wednesday-checklist-about-20-minutes). See [`docs/PLAN.md`](docs/PLAN.md) and [`docs/QUESTIONS.md`](docs/QUESTIONS.md).

## Develop

```sh
npm install
npm run dev     # local dev server (mic access works on localhost)
npm test        # unit tests (Vitest)
npm run build   # static build to dist/, deployed to GitHub Pages on push to main
npm run smoke   # build + headless-Chrome end-to-end test (plays exercises clean and with errors)
```

## Layout

```
src/music/       pitch spelling, keys, staff positions
src/audio/       mic + Web MIDI input, onset/pitch verification, playback, synthetic test audio
src/score/       score model, VexFlow rendering, cursor, playback
src/curriculum/  tracks, levels, seeded generator, difficulty
src/trainer/     session loop, grader, spaced-repetition scheduler, stats
src/ui/          views and controls
src/storage/     persistence, export/import
tests/           unit tests and audio fixtures
scripts/         smoke.mjs (browser end-to-end test)
docs/            plan, audio notes, questions, reference material
```
