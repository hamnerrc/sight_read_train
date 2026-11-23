# Sight Read Trainer: plan

**Goal:** put a laptop on the Chickering's music desk and get a sight-reading trainer that listens in real time and brings the slidy trainer's deliberate-practice machinery to piano. That machinery is exact grading, a replay that pinpoints the first error, misses that come back on a schedule, crutches you remove later, and hard progress gates. The target is **MTAC level 10 / advanced repertoire, slightly under the marked tempo, with no stops and all the right notes** (small slips OK).

Background: [`reference/slidy-trainer-features.md`](reference/slidy-trainer-features.md), [`reference/slidy-3x2-writeup.pdf`](reference/slidy-3x2-writeup.pdf), [`reference/grok-initial-framework.txt`](reference/grok-initial-framework.txt). Decisions and open questions: [`QUESTIONS.md`](QUESTIONS.md). Detector results and the Wednesday test protocol: [`AUDIO.md`](AUDIO.md).

---

## 1. Decisions (from QUESTIONS.md, 2026-11-23)

| Topic | Decision |
|---|---|
| Input | **Mic first** (acoustic baby grand). Web MIDI kept as an optional exact input. Chrome. |
| Starting point | **Absolute zero**: level 1 is a single middle C, like a depth-1 3x2 case. Nothing is skipped, whatever the player's current level, so no bad habits form. |
| Grading | **Notes and timing graded separately.** The notes grade is exact: wrong, missing, extra or skipped is a miss. Timing has its own grade and its own tempo control. |
| Progress gate | **No 100-in-a-row.** Sight reading has no max depth, so difficulty adapts to hold **≈80% clean**: a 3-up/1-down staircase that converges at 79.4%. |
| Spaced repetition | **Customised for reading.** It schedules the *skill items* behind each miss (that note on that clef, that key-signature accidental, that interval), not the excerpt, and writes them into fresh music after 3 / 8 / 25 exercises, then after 8 h. Repeating the excerpt would train memory, not reading. |
| Range / keys | All 88 keys, all 15 majors and 15 minors, introduced gradually. |
| Fingering | As in real music: printed only where not obvious (first note, position changes). |
| Repertoire | Later. Generated material starts far below any real piece. |
| Metronome | Visual by default, audible click toggleable (M), with an AirPod in to avoid mic bleed. |
| Piano-key controls | Yes, but **only between exercises**, so keys in the music never trigger them. |
| Stack / hosting | TypeScript + Vite + Vitest, static site on GitHub Pages. MIT licence. |

## 2. Core idea: verify, don't transcribe

The trainer wrote the exercise, so it knows exactly which notes should sound and when. The listener only has to confirm expected notes and catch anything else. That makes exact grading feasible from a laptop mic, including chords. See [`AUDIO.md`](AUDIO.md) for the method and the measured numbers.

## 3. Mapping the slidy trainer onto piano

| Slidy trainer | Sight Read Trainer | Status |
|---|---|---|
| Position (finite) | Generated exercise from `(level, seed)`, plus finite skill items | ✅ |
| Depth | Level on an endless ladder (130 hand-written levels, then parametric) | ✅ |
| Optimal = pass | Notes clean (separate timing grade) | ✅ |
| Replay to the first wrong move | First error in red, plus a one-line note: "Bar 3, beat 2: you played F♯4; the score has F4". R plays the bar correctly, Y plays back yours | ✅ |
| Every position, easiest first | Ladder adds one element per level, starting at middle C | ✅ |
| Depth range | Staircase holds you at the edge (≈80%) | ✅ |
| Spaced repetition 3/8/25/8 h | Same schedule on skill items, injected into new music | ✅ |
| Show optimal (H) | Crutches: note names, lit keys | ✅ |
| Pause before scramble | Preview time (input locked) | ✅ |
| Stats (T) | Clean %, notes %, on-time %, timing ± for ao5…ao1000 | ✅ |
| Advisor | Weakest skills, advice from pass/timing rates | ✅ (basic) |
| Guide | How it works, reading tips, setup | ✅ |
| Export / import / reset | Same (replace or merge) | ✅ |

## 4. Isolating skills, then combining them slowly

The 3x2 had one thing to learn. Sight reading has many separable skills, and each needs to be **isolated** (trained alone, everything else held trivially easy) before it's **combined**. The main ladder (section 5) is the combining track. The drills below are the isolating tracks. Each drill has its **own staircase toward 80%** and its own metric, so the advisor can see which skill is holding the combined level back.

### 4.1 The skills

| # | Skill | Isolated by | Measured as | Status |
|---|---|---|---|---|
| 1 | **Note recognition speed** (see a note, know the key) | Flash drill: one note at a time, random clef/position, no rhythm; the next appears the instant you play | ms per note (median, by clef/register); a finite set (88 keys × 2 clefs × spellings), so "every note, easiest first" applies literally | planned |
| 2 | **Note accuracy** (no rush) | Wait-mode levels: the score waits for you | % notes clean | ✅ (ladder stage 1–3) |
| 3 | **Rhythm reading** | Rhythm-only exercises on one repeated key: rhythm cells, rests, ties, dots, syncopation, triplets | onset error vs grid; % on time | planned (cells exist) |
| 4 | **Pulse / steadiness** | Long runs of simple notes at a fixed click, then with the click fading out | tempo drift (bpm/bar), σ of onsets | planned |
| 5 | **Intervals and contour** (read shapes, not names) | Two- to five-note cells starting from a given note; landmark notes | % clean, ms per cell | partial (interval items tracked) |
| 6 | **Key-signature recall** | Exercises dense in the signature's altered notes | % of altered notes right | partial (`ks:` items) |
| 7 | **Accidentals in the bar** (persistence, cancellation, courtesy) | Chromatic-heavy exercises | % clean on accidental notes | partial |
| 8 | **Vertical reading** (chords, intervals stacked, inversions) | Block chords, wait mode, increasing size | ms per chord, % clean | partial |
| 9 | **Hand independence** | Hands together with contrasting rhythms; LH melody vs RH accompaniment | % clean together vs each hand alone | partial |
| 10 | **Volume of notes / density** | Same material at growing notes per second (more notes per beat, more voices, bigger chords) | highest notes/sec held at 80% | planned (tempo staircase covers part) |
| 11 | **Look-ahead (eye–hand span)** | (a) *Masking*: each bar disappears just before it's played, so you must already have read it. (b) *Reveal window*: notes appear only N beats ahead; shrink N until reading breaks | beats of look-ahead held at 80% | planned (renderer has `maskAfterBeat`) |
| 12 | **Starting cold / no inspection** | Preview time → 0, then the music starts rolling immediately at tempo with no count-in | beats until the first clean run of N events | planned |
| 13 | **Recovery: quick on your feet** | (a) Cold start as above. (b) *Rejoin drill*: mid-exercise the cursor jumps to a random bar (or the music is "bumped" a beat) and you must pick it up. (c) After your own error, measure how long until you're clean again | **recovery time** in beats/ms; % of errors followed by an immediate clean continuation; stops counted separately | planned (follower has the data) |
| 14 | **Keep going (no stopping)** | Tempo mode never waits; a stop shows as missing notes | stops per exercise | ✅ (enforced in tempo mode) |
| 15 | **Range, ledger lines, clefs** | Extreme registers, clef changes mid-piece, 8va/8vb | % clean by register | partial (ledger lines; 8va and clef changes planned) |
| 16 | **Position shifts and fingering** | Lines that force shifts; fingering only at shifts | % clean at shift points | partial |
| 17 | **Patterns** (scales, arpeggios, sequences, Alberti, chord shapes) | Pattern-rich generation; recognising a pattern lets you read it as one unit | ms per note on patterned vs random passages | planned |
| 18 | **Harmonic prediction** (expect the cadence, the bass line) | Progression-driven exercises, then deliberate surprises | % clean on predicted vs surprise notes | partial (progressions exist) |
| 19 | **Texture within one hand** (melody + accompaniment, two voices) | Two-voice staves | % clean | planned |
| 20 | **Meter and rhythm variety** (6/8, 5/4, changing meters, tuplets) | Meter-change exercises | % on time | partial (4/4, 3/4, 2/4, 6/8) |
| 21 | **Dynamics and articulation** | Markings to obey; the detector already measures loudness (dB per attack) | loudness contour vs markings | later |
| 22 | **Pedalling** | Pedal markings; the detector handles ringing notes | (honour system at first) | later |
| 23 | **Navigation** (repeats, voltas, D.S./coda, system breaks) | Multi-line exercises with repeats; the eye jump at the end of a line | % clean at line breaks / jumps | planned |
| 24 | **Endurance** | Long exercises (16+ bars), then pages | clean % over the last half vs first half | partial (bars grow) |
| 25 | **Not looking at the hands** | Can't be measured from audio; Guide advice, and the look-ahead drills make looking down costly | – | advice only |

### 4.2 How isolating and combining fit together

- **Drill mode selector** in the Train view: *Ladder* (combined, the default) or one of the drills above. Each drill keeps its own level, staircase and history in the same save file.
- **Gating:** the ladder introduces an element in combination only after its isolated drill has reached a matching level. A ladder level that adds sixteenths waits until the rhythm drill holds sixteenths at 80%. Until then the advisor sends you to the drill.
- **Weakest-link advice:** the advisor compares drill levels with what the current ladder level demands and names the bottleneck ("rhythm is 12 levels behind your reading").
- **Recovery as a game:** cold start + rejoin is scored like a speed event: "back on track in 1.5 beats". It gets its own best and ao12, so recovering fast becomes something to chase.

## 5. Curriculum: the combining ladder (built)

`src/curriculum/levels.ts`. Each level adds exactly one element:

1. RH note reading, untimed: C4, then D4 … G4 one at a time, then skips, two bars, any interval in the position
2. LH the same from C3
3. Hands alternate; range grows to C5 / G2
4. **In time**: quarters, then halves, wholes, rests, 3/4, dotted halves, four bars
5. **Hands together**: whole-note bass, half-note bass; keys G and F; range to G5 / F2; sixths
6. Eighths, 2/4, moving bass line, dotted quarter–eighth, keys D, B♭, A/E/D minor, LH block chords, RH dyads, wider leaps
7. 6/8, chromatic notes, eighth rests, sixteenths, syncopation, range to C6 / C2, more keys, Alberti bass, six bars
8. The rest of the keys, the whole keyboard (A0–C8), chords denser, eight bars
9. **Beyond level 130**: forever, rotating +4% tempo, +1 bar (to 16), more chromatics and chords

The generator (`generator.ts`) is pure and seeded. It writes melodies (stepwise preference, leap recovery, cadence on the tonic), alternating-hand lines, harmonised hands-together textures (I–IV–V–vi progressions, voice-led block and broken chords, raised leading tone in minor), fingering at position changes, and correct accidental display. It also features the level's new element and any due review items.

**Still to add to the ladder:** ties, triplets, 8va/8vb, clef changes, two voices per staff, dynamics, longer forms with repeats.

## 6. Grading (built)

`src/trainer/grader.ts`:
- **Wait mode:** the score waits on each event. A confident wrong pitch while an event is current makes it dirty.
- **Tempo mode:** one-bar count-in, then each heard pitch is matched to the nearest unmatched expected copy within −0.5…+0.75 beats. Anything unmatched is wrong or extra, and expected pitches whose window passes are missing. That's how stopping fails the notes grade.
- **Timing:** each event's offset against the grid, with a window of max(70 ms, 12% of a beat). Its own pass/fail feeds the tempo staircase.
- **Unclear, never wrong:** detections under 50% confidence that match nothing are ignored. Re-detections of ringing notes are ignored when the detector marks them as guesses.
- **Feedback:** the first error drives the message and the red mark, like slidy's first wrong move.

## 7. Audio (built, verified on synthetic piano only)

Details and numbers in [`AUDIO.md`](AUDIO.md). In short: spectral-flux onsets, then score-informed iterative harmonic matching on the *new* energy after each attack, with piano inharmonicity, re-strike/release handling, sub-octave guards, and masked octaves given the benefit of the doubt. Calibration covers room noise, tuning (A4) and latency (play on visual flashes).

## 8. Architecture

```
src/
  music/        pitch spelling, keys, staff positions
  curriculum/   ladder (levels.ts), rhythm cells, seeded generator, RNG
  trainer/      grader (score follower), progress (staircases + item spaced repetition), scheduler
  audio/        FFT, detector, mic (AudioWorklet), MIDI, playback synth, synthetic test signals
  score/        VexFlow rendering with live marks and cursor geometry
  storage/      versioned localStorage, export/import/merge
  ui/           app shell, Train / Progress / Setup / Guide views, on-screen keyboard
public/capture-worklet.js   mic capture worklet
scripts/smoke.mjs           headless-Chrome end-to-end test (plays exercises clean and with errors)
tests/                      unit tests: generator, grader, progress, scheduler, detector
```

## 9. Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Repo, plan, questions | ✅ |
| M1 | Input: mic capture, onsets, pitch; Web MIDI | ✅ code, ✅ synthetic tests, ⏳ **real piano (Wed)** |
| M2 | Score model, rendering, playback | ✅ |
| M3 | Grader and error replay | ✅ |
| M4 | First usable trainer: ladder, staircase, reviews, stats, export | ✅ (needs the real-piano check) |
| M5 | Generator for all stages, crutches | ✅ (look-ahead mask not wired to a drill yet) |
| M6 | Calibration wizard, **real-audio fixture harness**: record your piano and score the detector against the recordings | calibration ✅; fixtures ⏳ need recordings |
| M7 | Polyphonic hardening: per-key templates from your piano (fixes octaves), pedal | planned |
| M8 | **Isolated drills** (section 4): recognition speed, rhythm, look-ahead, cold start / recovery first | next |
| M9 | Ladder additions: ties, triplets, 8va, clef changes, two voices, repeats, dynamics | planned |
| M10 | Repertoire track (public-domain), PWA/offline | later |

Risks, highest first:
1. Real-piano detection accuracy, especially chords with octaves, pedal, and a fan-noisy room. Wednesday's test plus recorded fixtures will measure it.
2. False "wrong" grades eroding trust, mitigated by the unclear-not-wrong policy and the "hear yours" check.
3. Generator musicality at higher levels.
