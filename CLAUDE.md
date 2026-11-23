# CLAUDE.md

- The plan is in `docs/PLAN.md`, decisions and open questions in `docs/QUESTIONS.md`, and detector method, results and the real-piano test protocol in `docs/AUDIO.md`. Keep all three current.
- Training loop (user decisions, don't drift from them):
  - Notes and timing are graded separately.
  - A 3-up/1-down staircase holds the player at ~80% clean. There is no 100-in-a-row gate.
  - Spaced repetition (3/8/25 exercises + 8 h) schedules *skill items*, injected into fresh music, never the exact excerpt.
  - The curriculum starts at a single middle C and adds one element per level.
  - Isolated skill drills feed the combined ladder (PLAN §4).
- The listener verifies expected notes (score-informed). Low-confidence detections are "unclear", which never counts as a wrong note.
- The generator must stay deterministic from `(level, seed, focus)`.
- Before committing: `npm test`, `npm run build`, and for UI changes `npm run smoke` (needs Google Chrome installed).
- The user is away from the piano until they say otherwise. Detector changes must be validated with the synthetic tests (and with real fixtures in `tests/fixtures/audio/` once they exist).
