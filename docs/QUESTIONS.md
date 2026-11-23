# Questions

## Answered (2026-11-23)

The decisions are summarised in [PLAN.md §1](PLAN.md#1-decisions-from-questionsmd-2026-11-23). Your answers, kept verbatim:

1. **Piano**: Chickering baby grand.
2. **Browser**: Chrome is good.
3. **Room / pedal**: default good (quiet room, early levels pedal-free).
4. **Current level**: "even if I was able to solve the 15 puzzle in 10 seconds, I started with optimal 3x2 in 1 move, and progressed. The whole point is to start as easy as possible to make absolutely no bad habits."
5. **Target**: "MTAC level 10/advanced at slightly slower than indicated tempo with no stops, all the right notes, slight mistakes okay."
6. **Lead sheets**: default (not in v1).
7. **Strictness**: notes and timing graded separately.
8. **Wait mode early, tempo mode later**: yes.
9. **100-in-a-row**: "too trivial of a metric … we just want to hold an optimally deliberate 80% accuracy by going up and down with the user."
10. **Spaced repetition**: customise for this specifically.
11. **Range**: all 88.
12. **Keys**: all 15 major and their relative minors.
13. **Fingering**: "just like normal music, the composer adds fingering where they feel it is not obvious."
14. **Repertoire**: later; generated material starts bare-bones.
15. **Stack**: TypeScript + Vite OK.
16. **Hosting**: GitHub Pages (it's live: https://hamnerrc.github.io/sight_read_train/; the workflow was fine).
17. **License**: MIT.
18. **Name**: Sight Read Trainer.
19. **Metronome**: togglable; AirPod to stop bleed.
20. **Piano-key controls**: yes (only active between exercises, since the extreme keys appear in real music).
21. **Slidy copy**: deleted.

Plus your note: the trainer must isolate many separate skills (rhythm, note accuracy, volume of notes, look-ahead, recovering from mistakes / being quick on your feet, note-recognition speed …) and combine them slowly. That's now [PLAN.md §4](PLAN.md#4-isolating-skills-then-combining-them-slowly).

## Open: answer inline when you can

22. **"Slight mistakes okay" at the target level.** The notes grade is exact (any wrong note = miss) and the staircase keeps you at ~80% clean. At the top end, do you want a looser pass (e.g. ≤1 wrong note per 8 bars counts as a pass), or keep the exact bar and let the 80% target absorb the slips?
    *Default: keep exact; the 80% target already allows 1 exercise in 5 to have a slip.*
23. **Which isolated drills first?** My order: (1) note-recognition speed, (2) rhythm, (3) cold start / recovery, (4) look-ahead masking. Change it if you like.
24. **Gating the ladder on drills** (PLAN §4.2): should the combined ladder *wait* for a lagging drill (strict, like slidy's "clear reviews before new cases"), or only *suggest* the drill?
    *Default: strict gating.*
25. **Session shape**: do you want a session plan, e.g. 5 min recognition drill → 15 min ladder → 5 min recovery game, or free choice each time?
    *Default: free choice, with the advisor suggesting.*
26. **Real-piano test clips**: OK to commit your recordings (~15 MB per 3-minute session) into the public repo under `tests/fixtures/audio/`? If not, I'll make that folder git-ignored and you can send them another way.
