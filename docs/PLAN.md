# Sight Read Trainer: plan

**Goal:** put a laptop on the piano's music desk and get a sight-reading trainer that listens to you play in real time. It should have the same training loop as the slidy trainer (exact grading, a replay that pinpoints the first error, spaced return of misses, hidden crutches, a 100-in-a-row mastery gate) over a piano curriculum. Unlike the puzzle, that curriculum has an effectively infinite sample space.

Background: [`reference/slidy-trainer-features.md`](reference/slidy-trainer-features.md), [`reference/slidy-3x2-writeup.pdf`](reference/slidy-3x2-writeup.pdf), [`reference/grok-initial-framework.txt`](reference/grok-initial-framework.txt). Open decisions: [`QUESTIONS.md`](QUESTIONS.md).

---

## 1. Core idea: verify, don't transcribe

Commercial apps such as Simply Piano and Yousician try to *transcribe* whatever you play. We don't need to. The trainer generated the exercise, so it always knows **exactly which notes should sound, and when**. The listener only has to answer narrower questions:

- Did an onset happen near the expected time?
- Are the expected pitches now sounding (all of them, for a chord)?
- Did any pitch sound that shouldn't have?

This **score-informed verification** is far more reliable from a laptop mic than open polyphonic transcription, especially for chords. It is what makes slidy-style exact grading feasible on audio.

Web MIDI is a second, exact input for digital pianos. It gives ground truth for grading and for tuning and testing the audio detector.

## 2. Mapping the slidy trainer onto piano

| Slidy trainer | Sight Read Trainer |
|---|---|
| Puzzle tab (3x2, 3x3 …) | **Track**: note reading, rhythm, intervals, chords/harmony, hands-together pieces |
| Method with graded steps | **Level** within a track: a parameter set (range, key, rhythm vocabulary, hands, tempo …) |
| Position (finite, 359 cases) | **Item**: a finite drill atom (one pitch, interval, chord or rhythm cell) *or* a generated exercise (infinite) |
| Depth (move count) | **Difficulty score** computed from the exercise's features |
| Optimal = exact pass | **Clean pass**: every note right, nothing extra, every onset inside the timing window, at or above target tempo |
| Replay to the first wrong move | **Error replay**: the score scrolls back to the first error, highlights expected vs played, and plays both versions |
| "On move 4 you went ←; optimal goes ↑" | "Bar 3, beat 2: you played F♯4, the score has F4" / "Bar 5, beat 1: 140 ms late" |
| Every position, easiest first | **Phase 1**: enumerate the finite atoms of a level, easiest first, each once |
| Random states + depth range | **Phase 3**: random generated exercises within a difficulty band |
| Spaced repetition 3 / 8 / 25 / 8 h | Same schedule, applied to the *missed excerpt* and to the *feature* that caused the miss |
| Drill reviews | Same |
| Show optimal (H) | **Crutches** (H): note names, lit keyboard, metronome, count-in, wait mode, target tempo display |
| Pause before a new scramble | **Preview time** before the count-in (a real sight-reading variable that shrinks with skill) |
| Stats (T): ao5–ao1000, over-optimal, σ | Accuracy %, timing error (mean, σ), tempo reached, pass rate, ao5–ao1000 |
| 100 in a row | Same gate, per level |
| Advisor | **Advisor**: reads your error log and names your weakest features and the next level to work on |
| Guide | **Guide**: a sight-reading field guide (reading ahead, intervallic reading, rhythm counting …) |
| Export / import / reset | Same |

## 3. Audio pipeline (the hard part)

Everything runs in the browser on an `AudioWorklet`, with no server.

1. **Capture**: `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` all **off**. These macOS/browser filters destroy piano attacks and sustain.
2. **Front end**: a 48 kHz frame with roughly 10 ms hop. Use a constant-Q or log-frequency spectrum across A0–C8, with a long window for low notes and a short window for timing.
3. **Onset detection**: spectral flux with an adaptive threshold. Onsets give the timing grade.
4. **Pitch verification**, in stages:
   - **v1, monophonic**: YIN/MPM pitch for single-line exercises. Robust and quick to ship.
   - **v2, score-informed polyphonic**: at each onset, score each *expected* pitch by the harmonic energy that rose (fundamental plus partials, allowing for piano inharmonicity). Then look for strong unexplained peaks, which indicate wrong or extra notes. Wrong-note candidates are the plausible errors: neighbouring keys, the same note in the wrong octave, the right note with a missing accidental.
   - **v3, optional ML**: evaluate Spotify **Basic Pitch** (TF.js, polyphonic) as a second opinion if the template method plateaus.
5. **Calibration** (a one-time setup wizard, re-runnable):
   - Noise floor in the room, with the laptop fan running.
   - Tuning offset (many acoustic pianos aren't at A440).
   - **Per-key templates**: the user plays each key, or a sampled subset, and we store that piano's harmonic fingerprint. This lifts chord accuracy a lot.
   - **Input latency**: play along to clicks to measure the audio delay, so timing grades aren't biased.
6. **Metronome bleed**: the click comes out of the speakers and goes into the mic. Use a visual metronome by default. An audible click is optional and gated out of onset detection, because we know exactly when each click happens.
7. **Sustain pedal**: early levels say "no pedal". Later, a note counts as *played* by its new onset rather than by whether it is still ringing.

**Detector test harness** (built early): record real sessions (audio, plus MIDI when available) into a fixture set. Every detector change is scored for precision and recall on wrong notes and missed notes, and for timing error. This is how we'll know "exact grading" is honest on audio.

## 4. Curriculum: finite atoms plus an infinite generator

### 4.1 Feature model
Every exercise is described by features that both the generator and the grader understand:
- **Pitch**: clef, range (staff lines, then ledger lines), key signature, accidentals.
- **Melodic motion**: steps, skips, specific intervals, leaps, direction changes.
- **Rhythm**: note values, rests, dots, ties, syncopation, triplets, meter.
- **Texture**: one hand, then hands alternating, hands together, two voices in one hand, chords (dyads → triads → inversions → 7ths).
- **Harmony**: diatonic chords, common progressions, cadences.
- **Performance**: tempo (BPM), exercise length, preview time, dynamics (later).

**Difficulty** is a weighted function of these features, playing the role of slidy's depth. We tune the weights from the user's own error data.

### 4.2 Tracks and levels (draft, to be refined in QUESTIONS.md)
1. **Note reading**: single notes, untimed, in wait mode. Finite atoms: every pitch on the grand staff (C2–C7 to start, with accidentals added level by level). This is the direct analogue of "every position, easiest first".
2. **Rhythm**: a single repeated pitch, timed. Finite atoms: rhythm cells (♩, ♫, ♩., syncopations …) per meter.
3. **Intervals / melodic reading**: two-note to five-note cells read as shapes. Finite atoms: interval × clef × direction.
4. **Melodies**: one hand, generated. The parameters grow: range 5 notes → octave → two octaves; keys C/G/F → all; rhythm vocabulary from track 2.
5. **Chords**: block chords and inversions, then broken chords. Finite atoms: chord type × inversion × key.
6. **Hands together**: melody plus a simple bass (whole notes → Alberti → independent lines), then chorale-style four-part writing.
7. **Mixed sight-reading**: everything combined, with short preview time and no crutches. This is the "real solve".

Each level unlocks after its own 100-in-a-row gate. Atoms from earlier levels keep appearing inside generated exercises, so earlier skills are maintained.

### 4.3 Generator
- Rule-based and seeded, so any exercise can be regenerated exactly from `(level, seed)`. A miss can be stored as a seed instead of a whole score, and replays and reviews are deterministic.
- Melodies come from a constrained random walk: interval distribution per level, a leap followed by a step back, phrase shapes ending on a stable degree, and range clamped to the level.
- Rhythm comes from the level's cell vocabulary, filling each bar exactly.
- Bass and harmony come from progression templates per level, with voice-leading rules for later levels.
- **Weakness weighting**: features you miss are sampled more often, like adaptive depth bands.
- Later, optional: a library of public-domain pieces (MusicXML) as a "real music" track.

### 4.4 Spaced repetition on an infinite space
You never see the exact same random exercise twice unless it's a review, so repetition runs on two layers:
- **Excerpt cards**: the bar or two around a miss, stored as `(level, seed, bar range)`. They return on the 3 / 8 / 25 solves + 8 h schedule and leave after 4 clean passes in a row, exactly as in slidy.
- **Feature cards**: the feature that caused the miss, for example "ledger-line A5 in treble", "dotted quarter → eighth" or "first-inversion G major". Each miss raises that feature's sampling weight, and clean passes containing it lower it again. Fresh exercises keep testing the skill, not just the memorised excerpt.

## 5. Grading spec
For each expected event (a note or chord at time *t*):
- **Pitch**: every expected pitch was detected, and nothing unexpected sounded in that window.
- **Timing**: the onset falls within ±*w* of *t*, after latency correction. *w* tightens with level, for example 150 ms → 80 ms.
- **Tempo**: the exercise's effective tempo is at least the target.
- **Wait mode** (crutch): timing isn't graded, and the score advances only once the correct notes sound. Used in early reading levels.

An exercise **passes** when every event is clean. The **first failing event** is the error the replay shows, just as slidy shows the first move off optimal. Secondary errors are logged for stats and the advisor but don't take over the feedback.

## 6. UI (laptop on the music desk)
- Full-screen score with large notation, readable from about 60 cm. The size is adjustable (slidy's "board size").
- A **cursor or bar highlight** that runs at tempo, with an optional **look-ahead mask** that greys out the bar you're playing to train reading ahead.
- A live input meter and a "hearing you" indicator, so mic problems are obvious.
- After a miss: freeze, highlight the first error in red with what you played in grey, then show the text note. `R` replays (audio of expected vs yours) and `Space` goes to the next exercise.
- The main controls also work from the piano, since hands are on the keys: for example, play low A0 for "next" and high C8 for "replay". Key bindings remain for the laptop.
- Views: **Train · Advisor · Guide · Setup** (mic calibration).
- Keys: `Space` next, `R` replay, `H` crutches, `T` stats, `F` fullscreen, `M` metronome, `1–7` tracks.

## 7. Architecture

**Stack (proposed)**: TypeScript + Vite, static build deployed to GitHub Pages, no backend. Vitest for unit tests. Notation rendering with **VexFlow**. Playback with a small Web Audio sampler (Salamander Grand piano samples, CC-BY).

```
src/
  audio/        mic capture, AudioWorklet DSP, onset + pitch verification, calibration, Web MIDI input
  score/        internal score model, VexFlow rendering, cursor/highlight, playback synth
  curriculum/   feature model, tracks/levels, seeded generator, difficulty scoring
  trainer/      session loop, grader, spaced repetition scheduler, streaks/stats
  ui/           views (train, advisor, guide, setup), settings panel, keyboard/piano shortcuts
  storage/      versioned localStorage, export/import/merge
tests/          unit tests (generator determinism, grader, scheduler) and audio fixtures
docs/           plan, questions, reference material
```

**Key interfaces**
- `Exercise { id, level, seed, events: NoteEvent[], meter, tempo, features }`
- `NoteEvent { time (beats), pitches (MIDI numbers), hand, duration }`
- `InputEvent { time (ms), pitches, source: 'audio' | 'midi', confidence }`
- `Grade { pass, firstError?, events: EventGrade[], timingStats }`
- The scheduler API is copied from slidy's: `onPass(card)`, `onMiss(card)`, `due(now, solveClock)`.

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo organised, plan, questions | ✅ this commit |
| M1 | **Input spike**: mic capture plus monophonic pitch and onset display; Web MIDI input | Playing single notes on your piano shows the right note name and onset times live, with a measured latency |
| M2 | Score model + VexFlow rendering + playback | A hard-coded exercise renders, the cursor runs at tempo, and the playback synth works |
| M3 | Grader + error replay (MIDI first, then mono audio) | Single-line exercises are graded exactly; a miss shows the first error and replays |
| M4 | Track 1, note reading, end to end: atoms easiest first, wait mode, spaced repetition, streak, 100-gate, stats, export/import | **First usable trainer**, the equivalent of slidy's 3x2 tab |
| M5 | Generator v1 + tracks 2–4 (rhythm, intervals, melodies), difficulty bands, crutch toggles, look-ahead mask | Endless graded one-hand reading |
| M6 | Calibration wizard + detector test harness with recorded fixtures | Measured wrong-note detection on your piano |
| M7 | Score-informed polyphonic verification + track 5 (chords) | Chords graded reliably from the mic |
| M8 | Track 6 (hands together) + advisor + guide | The full loop |
| M9 | Polish: piano-key shortcuts, PWA/offline, a public-domain repertoire track | — |

Risks, highest first: (1) polyphonic accuracy from a laptop mic on an acoustic piano, which M6/M7 measure before we depend on it; (2) false "wrong note" grades eroding trust, so when confidence is low the grader says "unclear" instead of "wrong" and doesn't break the streak; (3) the generator producing unmusical exercises, handled with per-level musical rules and a "flag this exercise" button.
