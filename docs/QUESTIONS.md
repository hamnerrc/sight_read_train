# Questions for Richard

Answer inline under each question (or just say "default is fine"). Each one has the default I'll use if you don't answer.

## Your setup
1. **Piano**: acoustic (upright or grand) or digital? If digital, does it have USB-MIDI or Bluetooth MIDI? MIDI gives exact grading and helps me test the mic detector.
   *Default: build for an acoustic piano and the mic first, with MIDI as an optional bonus input.*
2. **Laptop and browser**: which Mac, and which browser will you use? Safari has no Web MIDI, Chrome does.
   *Default: Chrome as the primary target, with Safari mic-only.*
3. **Room**: is it quiet, or are there other people or a TV? Do you use the sustain pedal much when reading?
   *Default: assume a quiet room, with early levels pedal-free.*

## Your level and goals
4. **Current reading level**: e.g. "I read treble fine, bass slowly", "Grade 3 RCM/ABRSM", or "total beginner at reading". This sets which tracks you skip.
5. **Target**: what does "done" look like? For example, sight-read hymns or chorales at tempo, pop lead sheets, classical Grade 5–8 pieces, or accompanying.
   *Default: classical-style grand-staff reading up to roughly Grade 5 hands together.*
6. **Lead sheets / chord symbols**: should chord-symbol reading (C, Am7, G/B) be its own track?
   *Default: not in v1.*

## Grading philosophy
7. **How strict is a "pass"?** In slidy one extra move is a miss. On piano the equivalent would be any wrong note, any missed note, or any onset outside the timing window. Should a **timing** slip count as a miss the same way a wrong note does, or should timing be graded separately (e.g. "notes perfect, timing 92%")?
   *Default: both must be clean for a pass, with the timing window widening at lower levels.*
8. **Wait mode vs tempo mode**: real sight reading never stops. Should early note-reading levels use wait mode (the score waits for the right note), with tempo mode required from track 4 on?
   *Default: yes.*
9. **100-in-a-row** per level: keep exactly 100, or allow e.g. 50 for the easy atom levels and 100 for the generated levels?
   *Default: 100 everywhere, matching your 3x2 standard.*
10. **Spaced repetition**: keep 3 / 8 / 25 solves + an 8-hour break exactly?
    *Default: yes.*

## Content
11. **Range** to cover: full 88 keys eventually, or a practical range (e.g. C2–C7 with up to 3 ledger lines)?
    *Default: C2–C7 first.*
12. **Key signatures**: all 15 major and their relative minors eventually?
    *Default: yes, introduced gradually. C/G/F come first.*
13. **Fingering**: should exercises show fingering numbers, or should it be pure note reading?
    *Default: no fingering.*
14. **Real repertoire**: do you want a track of public-domain pieces (Bach chorales, Czerny, etc.) besides generated exercises?
    *Default: later (M9).*

## Product and tech
15. **Stack**: I've proposed **TypeScript + Vite** (a build step, with tests) instead of slidy's no-build plain JS, because the audio DSP, generator and grader need unit tests. OK?
    *Default: yes. It still deploys as a static site to GitHub Pages.*
16. **Hosting**: deploy to GitHub Pages at `hamnerrc.github.io/sight_read_train` like slidy?
    *Default: yes. I added the workflow; Pages needs enabling in the repo settings (Settings → Pages → Source: GitHub Actions).*
17. **Repo visibility and license**: public with MIT, or private?
    *Default: no license file until you say.*
18. **Name**: the repo is `sight_read_train` and the folder is `sight_read_trainer`. Any app name you want shown in the UI (slidy was "Speedsliding Atlas")?
    *Default: "Sight Read Trainer".*
19. **Audible metronome**: OK with a visual-only metronome by default? An audible click bleeds into the mic.
    *Default: visual, with an optional audible click.*
20. **Piano-key controls**: OK to use extreme keys (e.g. A0 = next, C8 = replay) as hands-free controls?
    *Default: yes, configurable.*
21. **Slidy copy**: the `slidysim_training/` folder is git-ignored and not pushed. Its features are recorded in `docs/reference/slidy-trainer-features.md`. Delete the folder now?
