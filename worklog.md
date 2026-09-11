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
