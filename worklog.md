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

---
Task ID: 4
Agent: Super Z (main agent)
Task: User reported a bug via screen recording (29s webm): during a 25-word test the word stream visibly jumps backward/forward and the caret detaches from the active word.

Work Log:
- Frame-by-frame analysis of the recording (extracted 29 frames @1fps): confirmed the view oscillates — at words 14→16 the stream scrolled BACKWARD revealing earlier words, caret rendered after "funky" while the user was typing "step" (6 words behind); self-corrected, regressed again at word 22. Results screen itself was fine.
- Root cause in src/components/typing/word-display.tsx: the caret's top was measured via elRect.top - OUTER.getBoundingClientRect().top (viewport space, i.e. AFTER the translateY scroll). scrollY was then derived from that measurement (activeLine = round(caret.top/lineH)) → feedback loop: caret → activeLine → scrollY → caret. With the active word on stream line 3 the system hit a stable 2-cycle (scrollY 0 ↔ 1 line) that flip-flopped on every keystroke. The caret div is a child of the transformed inner stream but was fed outer-relative coordinates → it drifted off the active word whenever scrollY ≠ 0.
- Fix: measure the caret in the INNER stream's coordinate space (elRect.top - innerRect.top). Inner-relative tops are invariant to the transform, so activeLine is always the true absolute line; scrollY = max(0, activeLine-1)*lineH is now monotonic (0 → -lineH once) and the caret coordinates are in the same space the caret div is drawn in.
- Bonus fix found during verification: word spans (inline-block, full 80px line-height + pb + border) put the active-word underline ~24px below the glyphs (the floating line visible in the user's video) and inflated line stride to 84px, clipping the 3rd line. Added leading-[1.1] to the word span → underline hugs the text, stride back to exactly 80px (5rem).
- Regression harness scripts/e2e-scroll-fix.sh: types a full 25-word test at 1366x768 (user's screen) via agent-browser, sampling computed translateY of the stream + caret-vs-active-word rects after every submitted word. Old code: 3 backward scrolls + 3 caret mispositions (oscillation reproduced). Fixed code: 0 backward scrolls, 0 mispositions, single scroll event ty 0 → -80 at word 15, PASS.
- Cross-breakpoint sanity: 390x844 (underline snug, 3 lines) and 1920x1080 (4-line mode, no clipping). tsc (src) clean, eslint clean, dev.log clean.

Stage Summary:
- Word-stream scroll oscillation + detached caret eliminated (measurement made scroll-invariant); active-word underline now hugs the text; line stride exact at 80px so the 3-line viewport no longer clips.
- Verified files: src/components/typing/word-display.tsx only.
- Regression script kept at scripts/e2e-scroll-fix.sh for future scroll/caret changes.

---
Task ID: 5
Agent: Super Z (main agent)
Task: User report — "words keep moving at the top line whenever I finish something past the middle point" (mid-test top-line reshuffle).

Work Log:
- Diagnosis: the render window start was `wordIndex - 15`, sliding ONE WORD every keystroke past word 15. Each 1-word shift re-wraps the entire stream (line breaks depend on all preceding content), so every finished word reshuffled all lines — worst at the top line, exactly past the test midpoint. The ±1-line flip of the active word's line during re-wrap also caused occasional scroll jumps.
- Fix in src/components/typing/word-display.tsx — window now advances only by WHOLE LINES, lazily and pixel-invisibly:
  - `winStart` state replaces the wordIndex-derived `from`; rendered slice = [winStart, wordIndex+45]. Adjust-during-render guards: fresh `words` array → winStart 0; backspace walking above the window → winStart = wordIndex (re-wrap acceptable in that rare correction path).
  - Measure effect: when the active word's measured line >= 3, count the words on rendered line 0, retire exactly that line (setWinStart) and compensate caret.top by -lineH in the same pre-paint commit. Retiring whole lines never changes later words' wrapping, and the caret/scrollY compensation keeps scrollY continuity (S_new = S_old - lineH) → the retire is pixel-invisible; the visible scroll remains the smooth per-crossing translateY glide.
  - react-hooks v6 (set-state-in-effect): resets moved to the documented adjust-during-render pattern; the retire's setWinStart uses functional-updater form. tsc + eslint clean.
- Verification (scripts/e2e-scroll-fix.sh, extended with wrap assertions): full 25-word test @1366x768 — 0 backward scrolls, 0 re-wraps, 0 caret mispositions; window retired twice (0→7→12), always whole lines; single smooth scroll 0→-80. Probe at 1920x1080 (4-line, 88px stride): stream-space top of a tracked word constant (527.1) across 24 words through two retires (0→6→11); one glide 0→-88. Initially the e2e flagged rewrap=1 at the crossing word — turned out to be a sign error in the test assertion itself (stream = screen - ty, ty is negative); app was correct.
- Screenshots scrollcheck-w12/w20: after crossing + after retires the layout is stable, active word underlined with caret attached.

Stage Summary:
- Mid-test top-line reshuffle eliminated: between line crossings the stream layout is now byte-stable; window shrinks/grows only by whole lines at pixel-invisible moments.
- Verified file: src/components/typing/word-display.tsx only. Regression harness updated (rewrap assertions) at scripts/e2e-scroll-fix.sh; crossing probe at scripts/probe-crossing.sh.

---
Task ID: 6
Agent: Super Z (main agent)
Task: User report — spacing past an unfinished word "lights up the whole letters of that word" instead of only marking/blurring the skipped letters.

Work Log:
- Reproduced + inspected computed styles: skipped letters rendered FULL WHITE (rgb(232,234,240)) — identical to correctly-typed letters.
- Root cause (app-wide, not just word display): Cadence colors were hand-written utilities in globals.css (@layer utilities: .text-hue/.text-err/.text-dim/…) and NOT registered in Tailwind's @theme. Every opacity-modified variant (text-err/50, text-err/60, border-hue/50, bg-hue/15, border-hue/30, bg-hue/10, bg-hue/20) matched NO CSS — silently inheriting body white or default border color. Broken call sites: word-display (missed chars, extra chars, active-word underline), page.tsx (logo box, active mode button, progress dot), results.tsx (PB badge), settings-modal.tsx (active option).
- Fix in globals.css: registered all Cadence tokens in @theme inline (--color-hue/err/warn/sub/dim/faint/surface/elevated/missed → var(--…)); deleted the hand-written one-off utilities; Tailwind now generates the full utility set with working opacity modifiers (verified: active underline = lime/50, mode button bg = lime/15, mode border = lime/30).
- New "missed" treatment per user intent: --missed token = muted mauve #93676f (≈ 35% error + 65% dim). Skipped letters use text-missed — clearly dimmer than typed white, subtly red-tinted so the skip is still visible, never "lit up". NOTE: the token value must be a literal hex — a color-mix() value inside @theme inline stops Tailwind from generating the utility (type-check fails silently).
- extra chars stay text-err/60 (now actually renders 60% red instead of inheriting white); wrong keystrokes unchanged (text-err full red).
- Verified: computed colors (typed=white, skipped=rgb(147,103,111), wrong=rgb(248,113,113)); screenshot shows dimmed skipped word + lime active underline + tinted mode button; full e2e re-run PASS (0 backward scrolls, 0 rewraps, 0 caret mispositions); tsc + eslint clean.

Stage Summary:
- All Cadence opacity-modified utilities now real (theme-registered tokens); skipped-letter feedback is a muted mauve "blur" instead of accidentally full-white.
- Files: src/app/globals.css (theme registration), src/components/typing/word-display.tsx (text-missed). Visual side effect: several UI elements regain their intended lime tint (mode button, PB badge, active underline, settings options).

---
Task ID: 7
Agent: Super Z (main agent)
Task: User request — "Review the current codebase and implementation, troubleshoot potential issues, and continue improving the engineering details."

Work Log:
- Full codebase audit (all 14 app files): typing session hook, word display, page shell, generator, profiles/insights, storage, results/stats/settings/palette components, charts, globals.css.
- Built a per-frame rAF probe (scripts/probe-retire-transient.sh, probe-retire2.sh, probe-restart.sh) because the settled-state e2e (350ms sleep before sampling) can never see 150ms transitions. Two key findings:
  1. EXONERATED the Task-5 whole-line window retire: at both retires (winStart 0→9→15 in time mode) translateY never moved, the active word never jumped, caret deviation stayed ≤12px. The >12px caret deviations that DO exist (~84px decaying over 120ms) are the two DESIGNED line-crossing caret glides.
  2. CONFIRMED a real defect: Tab/new-test GLIDE — after restart, the stream's translateY animated -80→0 over ~200ms (7 interpolated frames) because the scrollY rewind fires the inner stream's transition-transform (and the caret's top transition) from the stale scroll position. Every restart visibly slid.
- Fixes:
  - word-display.tsx: new snapUi state — suspends the stream's transform transition AND the caret's left/top transition for exactly one commit, set (a) on fresh word list (restart/mode change → instant snap to top) and (b) defensively on window-retire commits; re-enabled via double-rAF after the snap frame paints (geometry at rest → re-adding transition animates nothing). Real line-crossing scrolls keep their designed 150ms glide.
  - storage.ts: untrusted-input sanitizers (sanitizeSettings/sanitizeLearning/sanitizeStats) now guard localStorage loads AND importData — validated enums (mode/accent/caretStyle), clamped numerics, shape-checked objects/arrays. Previously mode:"bogus" fell through generateTest()'s switch → undefined test → full app crash on next render; non-object keyProfiles would throw in computeWeakKeys.
  - generator.ts: adaptive drill loop pushed non-unique picks, so a test could exceed the requested count ("adaptive 25" with 27 words, label/PB key mismatch). Now only unique picks push → count integrity verified: 68-check bun script (scripts/check-generator.ts) across counts 10/25/50/100 × intensities 0/25/65/100 × signal/empty learning → all exact, 0 adjacent duplicates.
  - page.tsx: resume() a suspended AudioContext inside the keystroke gesture (autoplay policy could silence keypress sound permanently after tab background).
- Regression evidence: probe-restart post-fix = ty -80→0 in ONE frame, 0 interpolated frames. probe-retire2 post-fix identical to pre-fix baseline (retires pixel-invisible). Full e2e-scroll-fix.sh (ran 45-word time mode — settings persisted from probe session, bonus coverage) → 0 backward scrolls, 0 rewraps, 0 caret mispositions, PASS. Corrupt-storage browser check: poisoned localStorage (bogus mode, -50 count, 9999 intensity, wrong-typed arrays) → app boots, falls back to defaults, clamps ranges, re-persists sanitized values. tsc + eslint clean.
- Kept as-is (reviewed, deliberately not changed): PB stamping duplicated between page.tsx handleFinish and recordResult (consistent, harmless); time-mode premature finish if stream exhausted (needs >330wpm — unrealistic); 0.5px lineH measurement artifact (self-consistent within the compensation math); caret line-crossing glide (designed, Monkeytype-like).

Stage Summary:
- Restart/new-test now snaps instead of gliding; corrupt or hand-edited localStorage/backups can no longer crash the app; adaptive tests contain exactly the requested word count; keypress sound survives autoplay suspension.
- Verified files: src/components/typing/word-display.tsx, src/lib/typing/storage.ts, src/lib/typing/generator.ts, src/app/page.tsx.
- New tooling: scripts/probe-retire-transient.sh, probe-retire2.sh, probe-restart.sh (rAF transition-integrity probes), scripts/check-generator.ts (count integrity), all reusable.

---
Task ID: 8
Agent: Super Z (main agent)
Task: User asked whether the dictionary is dynamic or static/hardcoded, worried about repetitiveness and insufficient word supply for adaptive mode.

Work Log:
- Answered the question: dictionary is 100% static/hardcoded in src/lib/typing/words.ts (local-first design — no network fetches). Quantified the worry with a new audit tool (scripts/dict-audit.ts) measuring pool sizes, duplicates, per-letter coverage, repetition math, and adaptive drill-window capacity.
- Audit findings (before): COMMON 521 entries (1 accidental dup "eager"), HARD 275, ~790-word adaptive pool. Time mode repeats 22% of words at 60s and 38% at 120s. Rare letters starved: j:9, x:9, q:14, z:14, k:32 carrier words — a typist weak on "q" would recycle the same 14 words every drill. Everyday basics missing entirely (big, bad, night, week, cat, fish, egg, milk, window, kitchen, mother, risk, skill) — the thematic tail (animals/NATO alphabet/adjectives) had crowded them out.
- Expansion (words.ts restructured): COMMON_WORDS split into CORE_WORDS (original 521) + EXTENDED_WORDS (~810 curated additions banded by theme: animals/nature/food/body/household/places/people/society/verbs/descriptors — 15 commented bands); COMMON_WORDS = dedup union via Set at module load. HARD_WORDS +285 additions (longer/lower-frequency words, chosen to also lift rare-letter carriers). QUOTES 16 → 27 (well-known short aphorisms/proverbs). File header documents sizing rationale.
- generator.ts: adaptive merged pool now deduped (5 words existed in both lists — information/research/experience/society/performance — and would double-count in the drill-candidate window).
- Verification: dict-audit after → COMMON 1471 unique (+950), HARD 560 (+285), zero duplicates, all /^[a-z]+$/; rare letters now q:28 x:42 j:31 z:30 k:124 (all ≥2×); repetition: 25-word tests 0.6→0.2 expected repeats, 60s time mode 22%→9%, 120s 38%→17%; adaptive drill window 358→913 distinct candidates. check-generator.ts 68/68 PASS (count integrity all modes × counts × intensities). tsc clean (src; remaining repo errors are pre-existing in examples/ + skills/, untouched), eslint clean. Browser smoke (scripts/smoke-dict.sh): words/adaptive/quote modes render valid words from the new pool (new words confirmed live: television, evident, depend, refer), typing works, stream alive. New reusable tooling: scripts/dict-audit.ts, scripts/smoke-dict.sh.

Stage Summary:
- Dictionary stays static (correct for local-first) but is now ~2.5x deeper: 1471 common + 560 hard unique words, 27 quotes. Repetition in long/time tests roughly halved; adaptive mode has 2.5x the drill candidates and no starved letters. Bundle cost ~26KB raw for the whole dictionary (single local file, no network).
- Files: src/lib/typing/words.ts (restructured + expanded), src/lib/typing/generator.ts (1-line pool dedupe). New tools: scripts/dict-audit.ts, scripts/smoke-dict.sh.
- Not done (deliberate): dynamic/network dictionaries would break local-first; a user-defined custom word list remains the natural future extension if more variety is ever wanted.

---
Task ID: 9
Agent: Super Z (main agent)
Task: Adaptive Engine v2 (user-approved) — #1 FSRS scheduler + #2 weighted set-cover curation + #3 motor priors, combined with a WiFi-detection "full potential" layer (online content packs, cached, offline-first).

Work Log:
- Installed ts-fsrs@5.4.2; inspected its v5 API (Card/State/Rating, next(), get_retrievability, generatorParameters, S_MIN).
- #3 motor priors (src/lib/typing/motor.ts NEW): QWERTY touch-typing model (finger × row × stretch for all tracked chars incl. digits/punct), prior error/latency tables calibrated to an intermediate typist (0.035 base err, 150ms base latency), bigram classification (sameFinger/sameHandAdjacent/sameHandFar/alternate + row-skip) normalized so the average transition ≈ base, English letter-frequency urgency weights.
- #1 FSRS scheduler (src/lib/typing/memory.ts NEW): MemCard = serializable {s,d,reps,lapses,state,ls,last,due}; reviewMem() advances a card via scheduler.next with typing-tuned params (retention 0.92, max interval 240d, learning steps 1m/8m, relearn 5m) + a motor floor (easy ×1.12 / good ×1.06 / hard ×1.01 per review) because pure FSRS gives zero growth at t≈0; memRetrievability() for urgency; seedMemFromHistory() + sanitizeMem() for migration/defense.
  - Debugged two real ts-fsrs gotchas: New cards must carry exactly s=0,d=0 (v5 validates memory state), and learning_steps MUST be persisted or cards never graduate from Learning to Review (lapses never count). Fixed via isNew branch + `ls` field.
- profiles.ts rewritten: ingestEvents now ALSO accumulates a per-test ReviewTally; finalizeLearning applies ONE FSRS review per item per test via gradeTally (acc<0.8→again, <0.97/2+ errors→hard, clean+slow(>1.3× median)→hard, clean+fast(<0.72×)→easy once known, first review capped at Good); keyUrgencies()/bigramUrgencies() = (1-R)×1.35 + prior-shrunk chronic errors + confidence-gated EWMA recent errors + prior-shrunk latency penalty + FSRS difficulty; computeWeakKeys/weakBigrams kept as interface-compatible wrappers. Shrinkage: (errors + K×prior)/(attempts+K), K_err=4, K_lat=6 → 1 bad pinky attempt is actionable, cold start runs on priors alone.
- storage.ts: learning schema v3 — keyProfiles/bigramProfiles gain errors (lifetime) + mem; v2 payloads auto-migrate (errors inferred from attempts×errRate, memory cards seeded so practice history survives); page.tsx writes migrated payload back to localStorage once on mount; key/bigram id regex guards added.
- #2 set-cover curation (generator.ts rewritten): greedy weighted set cover — every drill slot picks the word maximizing uncovered weak-target gain (urgency × 0.42^coverage-repeats) ÷ √len with 0.5 jitter so consecutive tests differ; targets = top 8 keys + top 14 bigrams above urgency 0.07; flow fill from common pool; interleave preserved; calibration runs (no signal) sample the pool. Generator now reads pools via src/lib/typing/pool.ts (NEW registry: static + pack words + pack quotes, deduped, memoized).
- #2b dictionary expansion: scripts/expand-dict-data.ts (curated: ~330 new base words banded by theme, 340+ regular verbs, 90 irregular verb maps, ~880 plural nouns + 25 irregular maps, 130 gradable adjectives, 200 adverb bases, 240 explicit derivations) + scripts/expand-dict.ts (orthographic rule engine: -s/-es/-ies, drop-e/-ee/-ie, curated CVC doubling incl. qu-digraph, y→i, -le/-ic/-ll adverb rules, exceptions true→truly etc.) → src/lib/words-generated.ts: 4,838 generated forms. Junk purged (ams/bes/quiting/squating/weting/teeths/plural-only nouns etc.). COMMON_WORDS = CORE+EXTENDED+GENERATED deduped.
- #4 WiFi full-potential layer: online-pack.ts (NEW) — navigator.onLine + online/offline events; fetches 10k frequency list (jsDelivr google-10000-english-no-swears, filtered to 3+ chars with a vowel → 9,334) + dwyl quotes.json (600, printable-ASCII, 12–220 chars); validates, dedupes into pool registry, caches localStorage (pack.words.v2/pack.quotes.v1, weekly refresh), full offline fallback from cache; status machine off/local/loading/ready/error. connection-badge.tsx (NEW header chip: local core / syncing / full potential +N words / full potential cached / sync failed) via useSyncExternalStore. Settings gained onlinePacks (default on) + toggle in settings modal. Page: initPacks on boot, refresh on 'online', restart idle session when packs land (never mid-test).
- Dictionary audit (scripts/dict-audit.ts updated): COMMON 6,309 + HARD 560 = 6,869 static; 120s repetition 17%→4%; rare letters q:85 j:106 z:106 x:110; set-cover covers 5/5 weak bigrams + 8/8 weak keys per drill; cold-start prior ranking sane (z/p/q/x hardest, f/j/k easiest).
- Verification: NEW scripts/fsrs-sanity.ts 21/21 (stability ordering, spacing effect 25.6× vs 1.34×, motor floor, lapses, R decay, prior orderings, end-to-end ingest→urgency, JSON round-trip, v2 migration, decay resurfacing); check-generator 68/68; check-insights PASS; tsc + eslint clean; smoke-v2.sh browser E2E: badge "full potential · +5,930 words", packs cached live from jsDelivr (0 invalid), v2→v3 migration asserts PASS, real typed 10-word test → 22 keys + 62 bigrams got FSRS memory + totalTests++, offline → "6,423w cached", adaptive curation visibly targeting the profile's weak 'q'; smoke-dict.sh still PASS; dev.log clean (only historical mid-edit refresh notes).
- Fixed during verification: missing PRIOR_BASE_LAT export; DERIVED map duplicate keys (10); circular expansion (script must exclude COMMON_WORDS from its existing-set); ts-fsrs New-card validation; learning_steps persistence; page.tsx missing saveLearning import; badge testid.

Stage Summary:
- Cadence now runs a genuine FSRS-5 spaced-repetition scheduler over every key/bigram with Bayesian motor priors for cold start, greedy weighted set-cover test curation, a 6.9k static dictionary (4× task-8), and an online full-potential layer that lifts the active pool to ~12.2k words + 600+ quotes while staying 100% offline-capable (packs cached; engine never needs network).
- Files: src/lib/typing/{motor,memory,pool,online-pack}.ts NEW; profiles.ts, generator.ts, types.ts, storage.ts, words.ts rewritten/extended; words-generated.ts generated; page.tsx wired; settings-modal + connection-badge UI; scripts/{expand-dict,expand-dict-data,fsrs-sanity,smoke-v2,dict-audit,check-generator,check-insights}.
- Scheduler semantics: one FSRS review per item per test (aggregated grade), spacing effect preserved, massed practice floors at ~6%/good, lapses/difficulty track real fumbles, urgency = retrievability decay + shrunk errors/latency — the same math family as modern SRS apps, tuned for motor skill.
