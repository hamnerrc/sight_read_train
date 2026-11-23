# Listening: method, results, and the Wednesday test

## Method (`src/audio/detector.ts`)

1. **Capture**: `getUserMedia` with echo cancellation, noise suppression and auto-gain all off, then an AudioWorklet forwarding raw 48 kHz samples. Every detection is timed by its audio frame, mapped to the session clock and corrected by the calibrated latency.
2. **Onsets**: 2048-sample frames every 256 samples (5.3 ms). Log-magnitude spectral flux with an adaptive threshold and peak picking. Onset times land within about ±5 ms.
3. **New energy**: after each onset, take a long window (8192 samples, or 16384 when bass notes are expected) that skips the hammer noise and stops before the next onset. Subtract the spectrum from just before the onset, never reaching back past the previous onset. What's left is what the attack *added*, so ringing and pedalled notes don't count again.
4. **Score-informed harmonic matching**: score every MIDI note by its inharmonic partial series (piano stiffness modelled by register), weighted by how many partials are actually present. Take the best, cancel its partials (keeping any excess above a smooth envelope, which belongs to another note), and repeat. Expected notes need 30% of the reference level; unexpected notes need 35%, judged only on partials no detected note explains.
5. **Special cases**:
   - **Re-strike** of a ringing note, when little new energy shows: accepted if the attack was strong and the note's energy didn't fall.
   - **Damper release**: rejected, because energy falls and nothing new appears.
   - **Masked octave** (an octave, twelfth or double octave above a detected note): assumed played, at confidence 0.5. A single spectrum can't tell whether it was.
6. **Confidence**: anything under 0.5 is a guess. It can confirm an expected note but never counts as a wrong note.

## Results on synthetic piano (`tests/detector.test.ts`)

The synthetic tones (`src/audio/synth-test-signal.ts`) have stretched partials, weak bass fundamentals, register-dependent decay, hammer noise and room rumble. Some runs use strings 2–2.5× stiffer than the model expects.

| Test | Result |
|---|---|
| Single notes A0–C8, with and without the score prior | all correct, onset within ±4 ms |
| Legato scales with overlapping notes (C2, G3, D5 regions) | all notes found once, onset ±12 ms |
| Damper release | no false onset |
| 120 random chords (dyads to 7th chords), random velocity, stiff-string variants | ~98% complete, 0 phantom notes |
| Wrong note in a chord (one tone a semitone off) | named in ~95%; in the rest the exercise still fails because the expected note is missing |
| Tuning probe on pianos at 432 / 440 / 446 Hz | within 2 cents |

**Known limitations, to measure on the real piano:**
- An octave that's expected but not played is not caught (benefit of the doubt). Per-key templates recorded from your piano (M7) should fix it.
- Very fast repeated notes (about 8 per second and up) and heavy pedal are untested.
- A real room, laptop fan and the Chickering's actual spectrum are unknown until Wednesday.

## Wednesday checklist (about 20 minutes)

1. Open https://hamnerrc.github.io/sight_read_train/ in **Chrome** with the laptop on the music desk.
2. **Setup → Input**: Microphone, then **Start listening** and allow the mic.
3. **Setup → Calibrate**: 1 room noise (stay quiet 3 s), 2 tuning (play A4 four times), 3 latency (play on the 8 flashes).
4. **What the trainer hears**: play single notes in every register, then chords. Each attack should show once, with the right names. Note anything wrong.
5. **Record test clips**: run the 12 prompts (~3 min). Save the `.wav` and `.json`, put them in `tests/fixtures/audio/` and commit, or send them. These become real-piano regression tests, and I tune the detector on them.
6. **Train**: start at level 1 and play. Things to note: wrong notes it missed, right notes it called wrong, lag before the score advances, anything confusing.
7. If something misbehaves, **Progress → Export progress** and send the file along with a description.
