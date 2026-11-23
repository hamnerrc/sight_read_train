# Sight Read Trainer

A piano sight-reading trainer that **listens to you play in real time** through the laptop mic (or exact Web MIDI from a digital piano). Put the laptop on the music desk and play.

It uses the deliberate-practice loop from the slidy-puzzle trainer:

- **Exact grading**: a pass means every note right, nothing extra, every onset on time.
- **Error replay**: shows the *first* wrong note or timing slip and plays it back next to the correct version.
- **Spaced return of misses**: after 3, 8 and 25 exercises, then after an 8-hour break.
- **Crutches you remove later**: note names, lit keyboard, metronome, wait mode.
- **A hard mastery gate**: 100 clean exercises in a row to clear a level.

Content comes from finite drill atoms (every note, interval, chord and rhythm cell) plus a seeded generator that produces endless graded exercises.

**Status:** planning / M0. See [`docs/PLAN.md`](docs/PLAN.md) and the open [`docs/QUESTIONS.md`](docs/QUESTIONS.md).

## Develop

```sh
npm install
npm run dev     # local dev server (mic access works on localhost)
npm test        # unit tests (Vitest)
npm run build   # static build to dist/, deployed to GitHub Pages on push to main
```

## Layout

```
src/audio/       mic + Web MIDI input, onset/pitch verification, calibration
src/score/       score model, VexFlow rendering, cursor, playback
src/curriculum/  tracks, levels, seeded generator, difficulty
src/trainer/     session loop, grader, spaced-repetition scheduler, stats
src/ui/          views and controls
src/storage/     persistence, export/import
tests/           unit tests and audio fixtures
docs/            plan, questions, reference material
```
