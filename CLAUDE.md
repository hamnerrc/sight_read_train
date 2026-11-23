# CLAUDE.md

- The plan lives in `docs/PLAN.md` and open questions in `docs/QUESTIONS.md`. Keep both current as decisions are made.
- This project ports the training loop of the slidy trainer (`docs/reference/slidy-trainer-features.md`): exact grading, a first-error replay, a 3/8/25 + 8 h spaced-repetition schedule, crutches toggled with H, stats toggled with T, and a 100-in-a-row gate. Preserve these semantics.
- The listener *verifies* expected notes (score-informed) rather than transcribing freely. When confidence is low, grade "unclear", which never breaks a streak.
- The generator must stay deterministic from `(levelId, seed)`. Reviews store seeds, not scores.
- Stack: TypeScript + Vite + Vitest, a static site on GitHub Pages, no backend. Run `npm test` and `npm run build` before committing.
