# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build "Cadence" — a keyboard/desktop-first adaptive typing trainer (MonkeyType-like) that studies the user's stats/mistakes and curates the next test. Local-first/only.

Work Log:
- Initialized fullstack environment via init script (Next.js 16 + TS + Tailwind 4 + shadcn/ui scaffold at /home/z/my-project).
- Built learning core in `src/lib/typing/`:
  - `words.ts`: ~800 common words, ~250 hard words, 16 quotes.
  - `types.ts`: Settings, TestResult, KeyProfile/BigramProfile, ConfusionPair, LearningData, StatsData, CoachInsight + defaults.
  - `profiles.ts`: EWMA-based keystroke ingestion (per-key error rate + motor latency, bigram latency, expected→typed confusion pairs, exposure decay), weakness scoring with confidence weighting.
  - `generator.ts`: 4 modes (adaptive/time/words/quote); adaptive scores every candidate word against weak keys/bigrams, blends drill+flow words by intensity, applies punctuation/number transforms.
  - `storage.ts`: localStorage persistence (settings/learning/stats), personal bests per mode, day-streaks, JSON export/import, wipe.
  - `insights.ts`: coach messages (PB, accuracy coaching, focus keys, confusion callouts, trend vs last 5, consistency, streaks) + idle "next test targets 'o','l'" preview.
- Built session engine `src/hooks/use-typing-session.ts`: full state machine — per-keystroke event log, per-second wpm/raw/error samples, word diffs (correct/incorrect/extra/missed), space-submit, backspace rules (into previous word only if it had errors; ctrl+backspace pops word; strict mode disables), time-mode auto-finish, auto-finish on last word, consistency calc.
- Built UI in `src/components/typing/`: word-display (smooth animated caret, 3-line scrolling stream, per-char coloring, live metrics), result-chart (custom SVG wpm/raw/error markers), results (big numbers + chart + coach notes), key-heatmap (QWERTY colored by speed/errors), history-chart (wpm progression), stats-panel (overlay: overview/keys/history/data tabs incl. export/import/reset), command-palette (cmdk: modes, lengths, toggles, data actions), settings-modal (intensity slider, strict mode, caret style, 4 accent themes).
- Composed `src/app/page.tsx`: mode bar + sub-options, capture-phase global key handling (Tab=restart, Esc=palette, typing-key focus redirect when input lost focus), WebAudio keypress sound, accent CSS var theming, onboarding hints, hydration-safe localStorage load.
- Theming: dark charcoal + lime accent in globals.css mapped to shadcn tokens; Geist Mono throughout.
- Fixed during verification: pointer-events on progress hairline; React-19 ref-during-render lint errors (moved ref sync into effects); Escape double-handling between window handler and Radix dialogs (moved global shortcuts to capture phase with stopPropagation); fake raw-wpm sampling replaced with real cumulative keystroke math.
- Browser-verified end-to-end with agent-browser: typed 2 full tests via CDP keys (deliberate error + backspace correction), confirmed results (83 WPM/97.7%, 105 WPM/100%), PB badges, coach notes naming bottleneck keys, adaptive curation visibly weighting weak keys, localStorage persistence (4 keys), time-15 auto-finish, quote mode, punctuation injection, stats tabs, heatmap, palette actions, accent theming, mobile viewport. Lint clean; dev.log clean.

Stage Summary:
- Deliverable: fully local-first adaptive typing coach at `/` (no DB, no server calls; everything in localStorage + JSON export/import).
- Key artifacts: src/lib/typing/* (engine), src/hooks/use-typing-session.ts, src/components/typing/* (UI), src/app/page.tsx, globals.css theme.
- The adaptive loop is proven: keystrokes → EWMA profiles → weakness scores → curated next test + coach notes.

---
Task ID: 2
Agent: Super Z (main agent)
Task: Fix wasted screen space on desktop — scale the typing stage to use available viewport (user screenshot showed test area capped at 768px with small words on a ~1366px screen).

Work Log:
- globals.css: turned the word stream into viewport-responsive tokens — `--word-size`/`--word-line-h` now scale per breakpoint (base 1.55/3.6rem → sm 1.7/3.8 → lg 2/4.4 → xl 2.25/5 → 2xl 2.5/5.5rem), added `--word-lines` (3 base; 4 when ≥1280px wide AND ≥820px tall).
- word-display.tsx: inner stream now uses `fontSize: var(--word-size)` / `lineHeight: var(--word-line-h)` (removed hardcoded rem classes); outer height uses `calc(var(--word-line-h) * var(--word-lines, 3))`; live metrics row scales up at xl (timer 3xl→4xl, wpm/acc lg→2xl); render window widened (15 back / 45 ahead) for the wider lines.
- page.tsx: main container `max-w-3xl` → `lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl`; main padding py-10→py-6/xl:py-8; nav mt-6→mt-5; coach line scales to text-sm at xl.
- results.tsx: wpm/acc numbers scale to 8xl/6xl at xl, detail grid gaps up, coach notes 15px at xl; added missing `speed` icon to KIND_ICON (fixes pre-existing tsc error); typed `chars` array as React.ReactNode[] (fixes pre-existing tsc error). src/ now tsc-clean, eslint clean.
- Browser-verified: 1366×720 → 1024px wide stream, 36px words, 3 lines, zero page scroll; 1920×1080 → 1152px wide, 40px words, 4 lines, zero page scroll, scroll-offset works when caret passes line 3; 390×844 mobile unchanged (1.55rem, 3 lines). Typed full 25-word test + mid-test states via CDP; caret tracking, error coloring, word diffs, auto-finish, live metrics all correct. Pre-existing transient CDP key-drops during 100 rapid presses were misread as app bug — isolated repro (quote/letter/space presses) confirmed focus + input handling are solid.

Stage Summary:
- The typing stage now scales with the viewport: ~2.2× more screen area used at 1366px (768→1024px wide, 27→36px words), 4-line stream on tall desktops; mobile untouched.
- Verified files: src/app/globals.css, src/components/typing/word-display.tsx, src/components/typing/results.tsx, src/app/page.tsx.

---
Task ID: 3
Agent: Super Z (main agent)
Task: User asked (1) does the engine measure time-to-find a key, (2) does it measure the 2-3 key combination before an error; requested research of major typing trainers' strategies and to implement only non-redundant features.

Work Log:
- Engine audit: per-key motor latency ALREADY implemented (EWMA inter-key interval, 2s cap, feeds weakness latencyPenalty + heatmap "slower keys" + overview chips) → feature 1 already covered, no change. Found REAL BUG: bigramProfiles[].errRate never updated (bigram error model was dead code; weakBigrams always returned weakness 0).
- Research (web search x5): keybr = per-key confidence + progressive unlock + weakest-key-targeted pseudo-words (Cadence already matches per-key + real-word curation); Monkeytype = no adaptation, "practice missed words" only; Typing.com = tracks troublesome keys + TypeAI stories around them; TypingClub = home-row progressive curriculum; Ratatype/TypingTest.com = problem-key drills; motor research (IKI studies 2022-2025) validates inter-key intervals as skill measure and error-context (preceding chars) as diagnostic signal. None of the popular trainers implement error-context transitions → non-redundant differentiator.
- Implemented error-context tracking (feature 2):
  - types.ts: ErrorContext (trigram = prev2+prev1+expected) + errorContexts in LearningData; lastVersion 2.
  - profiles.ts: bigram ingestion restructured — transitions (prev->typed on correct, prev->expected on errors) now update attempts, latency (correct only) AND errRate EWMA (always); trigram error contexts recorded with count, capped 40 sorted by count; weakBigrams adds latency penalty vs median (slow combos now weak too); new topErrorContexts().
  - insights.ts: new coach insight "errors cluster on the transition 'th'→'e' (N× recently)..." when a context reaches count>=2.
  - stats-panel.tsx: "trickiest letter pairs" → "trickiest key transitions (errors & slow combos)" with err% + latency ms per chip.
  - storage.ts: no migration needed (loadLearning/importData merge emptyLearning defaults).
  - Generator consumes weakBigrams already → adaptive curation now automatically boosts words containing error-prone/slow transitions (confidence-gated by MIN_ATTEMPTS=4).
- Verified: bun unit check (insights fire 'th'→'e' message, idle preview lists real weak pairs); e2e script scripts/e2e-error-context.sh — 3 deliberate mid-word errors → localStorage shows errRate on exactly wa/ro/ma transitions + trigram contexts ewa/pro/yma; keys tab heatmap latency colors + transitions chips render; tsc + eslint clean.

Stage Summary:
- Feature 1 (key-finding latency): was already fully implemented and surfaced — confirmed correct, untouched.
- Feature 2 (error context): now measured at both bigram (transition error rate + latency → weakness → curation) and trigram (2-keys-before-mistake contexts → coach notes) levels; fixed dead bigram errRate bug.
- Rejected as redundant: everything else (progressive letter unlock = keybr-style curriculum is redundant with Cadence's real-word adaptive curation; missed-word practice mode redundant with auto-curated adaptive mode; pseudo-words rejected to keep real-word flow).
