# FEATURES.md

This is the strip map for Cadence: a complete inventory of every user-facing
feature, what it touches, where it persists, and what it would cost to remove.
Use it to decide what to cut when the app needs to shrink — each section names
the exact files, flags, storage keys, and UI surfaces a strip would have to
revisit, plus the couplings that make a clean removal hard. Read the "safe
strip order" at the bottom before cutting anything; some features are the
product (adaptive coaching per PRODUCT.md) and others are trim.

## Index

| # | Feature | Core files | Storage coupling | Strip cost |
|---|---------|-----------|------------------|------------|
| 1 | Adaptive mode (default) | `page.tsx`, `generator.ts`, `profiles.ts`, `word-scheduler.ts`, `pool.ts` | `cadence.learning.v1` | entangled |
| 2 | Time mode (15/30/60/120s) | `generator.ts`, `mode-bar.tsx` | `cadence.settings.v1` (timeDuration) | isolated |
| 3 | Words mode (10/25/50/100) | `generator.ts`, `mode-bar.tsx` | none beyond mode | isolated |
| 4 | Quote mode (+ next quote) | `generator.ts`, `words.ts`, `pool.ts` | none beyond mode | isolated |
| 5 | Punctuation / numbers transforms | `generator.ts` | `cadence.settings.v1` (hasPunctuation, hasNumbers) | isolated |
| 6 | Strict mode (no backspace) | `use-typing-session.ts` | `cadence.settings.v1` (isStrict) | moderate |
| 7 | Live WPM / accuracy gauges | `stage-hud.tsx`, `use-typing-session.ts` | `cadence.settings.v1` (isLiveWpmOn) | moderate |
| 8 | Caret styles (line/block/underline) | `word-display.tsx` | `cadence.settings.v1` (caretStyle) | isolated |
| 9 | Keypress sound | `page.tsx` | `cadence.settings.v1` (isSoundOn) | isolated |
| 10 | Accent switching (4 hues) | `page.tsx`, `types.ts` | `cadence.settings.v1` (accent) | isolated |
| 11 | Coach notes | `results.tsx`, `page.tsx`, `insights.ts` | `cadence.settings.v1` (isCoachOn) | entangled |
| 12 | Results screen | `results.tsx`, `result-chart.tsx`, `audit.ts`, `motor.ts` | `cadence.stats.v1` (PB compare) | moderate |
| 13 | Stats panel (5 tabs) | `stats-panel.tsx`, `key-heatmap.tsx`, `history-chart.tsx` | `cadence.stats.v1` | moderate |
| 14 | Activity heatmap + streaks | `activity-heatmap.tsx`, `activity.ts` | `cadence.stats.v1` (ledger) | isolated |
| 15 | Settings modal | `settings-modal.tsx` | `cadence.settings.v1` (all flags) | moderate |
| 16 | Command palette (Esc) | `command-palette.tsx` | reads/writes settings via actions | moderate |
| 17 | Keyboard shortcuts | `use-global-keys.ts`, `use-typing-session.ts` | none | moderate |
| 18 | Export / import / reset backups | `backup.ts`, `storage.ts`, `stats-panel.tsx` | all keys (full snapshot) | isolated |
| 19 | Full-potential online packs | `online-pack.ts`, `connection-badge.tsx`, `use-pack-lifecycle.ts`, `pool.ts` | `cadence.pack.words.v2`, `cadence.pack.quotes.v1` | moderate |
| 20 | Onboarding hint | `page.tsx` | `cadence.onboarded.v1` | isolated |
| 21 | Progress hairline + footer dot | `page.tsx`, `globals.css` | none | isolated |
| 22 | Learning engine (EWMA + FSRS + priors) | `profiles.ts`, `memory.ts`, `motor.ts`, `word-scheduler.ts` | `cadence.learning.v1` | entangled |
| 23 | Forensics (keystroke audit + diff) | `audit.ts`, `diff.ts` | none (per-test, ephemeral) | entangled |

## 1. Adaptive mode (default)

- **What it does:** the default test type. Instead of a fixed list, it curates
  words attacking the typist's weakest keys, bigrams, and due review words,
  scaled by intensity (0–100). The mode bar previews which focus keys the next
  test targets.
- **Flow:** `page.tsx` mode bar -> `generateTest()` dispatch ->
  `generateAdaptive()` in `generator.ts` (set-cover via `greedyCover()` over
  `calculateKeyUrgencies()` / `calculateBigramUrgencies()` from `profiles.ts`
  + `pickReviewWords()` from `word-scheduler.ts`, drawing from
  `pool.getAdaptivePool()`) -> performance ingested via `ingestEvents()` /
  `ingestWordOutcomes()` and persisted by `finalizeLearning()` into
  `cadence.learning.v1`.
- **Files:** `src/app/page.tsx`, `src/lib/typing/generator.ts`,
  `src/lib/typing/profiles.ts`, `src/lib/typing/word-scheduler.ts`,
  `src/lib/typing/pool.ts`.
- **Stripping it requires:** removing the `"adaptive"` branch from
  `generateTest()`, `generateAdaptive()` + `greedyCover()`, the focus-keys
  preview in `page.tsx`, and the default mode in `types.ts` — the mode bar,
  palette, and mode enum all list it.
- **Couplings:** the consumer of the entire learning engine (#22) and the
  adaptive pool (#19). TestResult carries `focusKeys`; results and coach
  reference targeted keys. Removing adaptive without the engine leaves the
  engine writing data nothing reads.

## 2. Static test modes: time, words, quote

- **What it does:** time mode runs a countdown (15/30/60/120s) and
  auto-finishes; words mode runs a fixed count (10/25/50/100); quote mode
  presents a quote with a "next quote" button. Pure generator variants;
  learning ingestion is shared by all modes.
- **Flow:** mode bar / palette selection -> `generateTest()` ->
  `generateTime()` / `generateWords()` / `generateQuote()` (quotes pull from
  `pool.getQuotes()`, backed by `QUOTES` in `words.ts`); `timeDuration`
  persists in `cadence.settings.v1`.
- **Files:** `src/lib/typing/generator.ts`, `src/lib/typing/words.ts`,
  `src/lib/typing/pool.ts`, `src/components/typing/mode-bar.tsx`.
- **Stripping them requires:** deleting the generator functions, mode bar
  sub-options, and palette entries. Each mode is an independent branch in
  `generateTest()`; removals do not touch each other.
- **Couplings:** minimal. Time's auto-finish timer lives in the shared session
  hook but is gated on the time-mode branch.

## 3. Punctuation / numbers transforms

- **What it does:** decorates generated words with punctuation and injects
  numbers (~8% rate). Composes with all four modes, applied after generation.
- **Flow:** flags `hasPunctuation` / `hasNumbers` -> `withTransforms()`
  wrapping every generator's word list -> `applyPunctuation()` /
  `maybeNumber()` in `generator.ts`.
- **Files:** `src/lib/typing/generator.ts`, plus toggles in
  `src/components/typing/settings-modal.tsx` and the command palette.
- **Stripping it requires:** removing `withTransforms` calls from each
  generator branch, both flags from `Settings` in `types.ts`, and their
  sanitizer lines in `sanitize.ts` (which carry legacy-key fallbacks — keep
  the migration unless you own a wipe).
- **Couplings:** none beyond the settings surface. Punctuation shows up in
  forensic per-word diffs but nothing in `audit.ts` parses it specially.

## 4. Strict mode (no backspace)

- **What it does:** disables backspace for the test, forcing accuracy. The
  footer shows a standing "strict mode — no backspace" warning while on.
- **Flow:** flag `isStrict` -> `use-typing-session.ts` keydown handler
  swallows backspace (and blocks the ctrl/cmd+Backspace word pop) -> warning
  in `console-footer.tsx` reads the flag.
- **Files:** `src/hooks/use-typing-session.ts`,
  `src/components/typing/console-footer.tsx`, toggle in
  `src/components/typing/settings-modal.tsx`.
- **Stripping it requires:** removing the flag check in the session hook's
  key handler, the footer branch, and the toggle. The hook is shared by every
  mode — the backspace path also serves normal delete and word-pop (#17).
- **Couplings:** touches the session hook directly. Audit data unaffected;
  strict errors record the same way.

## 5. Live WPM / accuracy gauges

- **What it does:** live words-per-minute and accuracy in the stage HUD while
  typing, updated on a 100ms tick driven by incremental counters (not full
  recomputation).
- **Flow:** flag `isLiveWpmOn` -> `stage-hud.tsx` renders gauges ->
  `use-typing-session.ts` runs a 100ms interval tick with incremental
  counters while the test is active.
- **Files:** `src/components/typing/stage-hud.tsx`,
  `src/hooks/use-typing-session.ts`, toggle in
  `src/components/typing/settings-modal.tsx`.
- **Stripping it requires:** removing the HUD gauge block, the flag, and the
  tick interval. Verify what else subscribes to the 100ms tick (caret blink,
  progress timing) before deleting the interval.
- **Couplings:** lives inside the shared session hook. Final wpm/acc
  computations for results are separate and must survive.

## 6. Cosmetics group: caret styles, accent, sound, hairline, onboarding hint

- **What it does:** caret style picks line/block/underline rendering in
  `word-display.tsx`; accent switches the UI hue (lime/amber/cyan/rose) by
  writing `--hue`/`--primary`/`--ring` CSS vars from an effect in `page.tsx`
  (values in `ACCENT_COLORS`, `types.ts`); sound plays a WebAudio oscillator
  click per keypress (`playClick` in `page.tsx`, flag `isSoundOn`); a fixed
  2px progress hairline tracks completion (`page.tsx` render + `globals.css`
  styling, footer dot via `dot-breathe`); a one-time onboarding hint shows
  until `cadence.onboarded.v1` is set. All presentational; nothing feeds
  engines or stats.
- **Flow:** settings modal / first visit -> flags in `cadence.settings.v1` ->
  render-time changes only.
- **Files:** `src/components/typing/word-display.tsx`, `src/app/page.tsx`,
  `src/app/globals.css`, `src/lib/typing/types.ts`,
  `src/components/typing/settings-modal.tsx`.
- **Stripping them requires:** deleting the render blocks, flag plumbing, and
  sanitizer lines. Each is independent. The accent effect mirrors hue into
  shadcn `--primary`/`--ring`, so removing it should restore static defaults
  in `globals.css` to avoid a half-themed UI.
- **Couplings:** effectively none — the safest cuts in the codebase.

## 7. Coach notes

- **What it does:** after each test (and as an idle preview of the next), a
  panel of evidence-citing insights: confusion pairs, error contexts, rhythm,
  stamina, recovery, trend, record, streak, tips — always quoting the user's
  own numbers, per PRODUCT.md's "forensics over vibes."
- **Flow:** `isCoachOn` flag -> `page.tsx` calls `generateInsights()` /
  `nextTestPreview()` from `insights.ts` on completion -> results panel
  (`results.tsx`) renders them; idle preview renders when no test is active.
- **Files:** `src/lib/typing/insights.ts`, `src/components/typing/results.tsx`,
  `src/app/page.tsx`.
- **Stripping it requires:** removing `insights.ts`, both call sites in
  `page.tsx`, the coach panel in `results.tsx`, and the toggle + flag. The
  flag is only a visibility gate — audit (#23) is computed regardless, so
  stripping coach does not strip audit work.
- **Couplings:** deeply entangled. `insights.ts` consumes TestAudit output
  (`buildTestAudit()`), learning state (weak keys, word memory), and stats
  (history, PBs, streaks via `activity.ts`). Removing those producers instead
  would break results. Regression harness `scripts/check-insights.ts` retires
  too.

## 8. Results screen

- **What it does:** the post-test report: wpm/accuracy hero, personal-best
  compare strip, wpm/raw/error SVG chart, error autopsy with fate bars,
  per-key report blended with motor priors, word check, consistency.
- **Flow:** completion in `use-typing-session.ts` -> `page.tsx` calls
  `buildTestAudit()` on the keystroke log -> `results.tsx` renders;
  `result-chart.tsx` draws the per-second series; key report merges measured
  latencies with `motor.ts` priors; PB compare reads `cadence.stats.v1`.
- **Files:** `src/components/typing/results.tsx`,
  `src/components/typing/result-chart.tsx`, `src/lib/typing/audit.ts`,
  `src/lib/typing/motor.ts`, `src/app/page.tsx`.
- **Stripping it requires:** it cannot be removed outright — the app needs a
  completion state. The chart, autopsy/fate bars, key report, and word check
  can each be stripped as self-contained blocks. Full removal means replacing
  results with a minimal wpm/acc + retry screen and orphaning `audit.ts`.
- **Couplings:** consumes forensics (#23) and motor priors (#22); hosts coach
  notes (#7); PB compare couples it to stats history.
  `scripts/audit-check.ts` covers the audit side.

## 9. Stats panel (5 tabs)

- **What it does:** the review surface between tests. Tabs: overview
  (per-mode PBs, averages), keys (weak-key heatmap), words (worst / due /
  fastest word memory lists), history (chart + table of the last 500 tests),
  data (export / import / reset — see #18).
- **Flow:** open action -> `stats-panel.tsx` -> overview reads
  `cadence.stats.v1`; keys tab calls `calculateWeakKeys()` (profiles) + motor
  priors into `key-heatmap.tsx`; words tab calls `collectWorstWords()` /
  `collectDueWords()` / `collectFastestWords()` (word-scheduler); history tab
  feeds `history-chart.tsx` from the capped 500-entry history.
- **Files:** `src/components/typing/stats-panel.tsx`,
  `src/components/typing/key-heatmap.tsx`,
  `src/components/typing/history-chart.tsx`, `src/lib/typing/storage.ts`.
- **Stripping it requires:** removing the component and its mounts in
  `page.tsx` plus palette/header actions. Tabs strip independently — each
  owns its data calls. Removing the data tab orphans the import UI for #18
  (move it first).
- **Couplings:** reads learning state but never writes it — stripping stats
  does NOT strip the learning engine; `cadence.learning.v1` keeps
  accumulating. Export/import lives inside it (#18 coupling). Word/keys tabs
  share collectors with coach insights (#7).

## 10. Activity heatmap + streaks

- **What it does:** 53-week SVG activity heatmap plus current/longest
  streaks; also feeds coach insights (record/streak/trend).
- **Flow:** completion stamps a history entry -> `storage.ts` prunes the
  ledger to 400 days (`MAX_ACTIVITY_DAYS`) while history caps at 500 entries
  -> `activity.ts` `buildActivityDays()` / `activitySummary()` build day
  buckets and streaks -> `activity-heatmap.tsx` renders; `insights.ts` reuses
  the summary.
- **Files:** `src/components/typing/activity-heatmap.tsx`,
  `src/lib/typing/activity.ts`, `src/lib/typing/storage.ts` (pruning),
  `src/app/page.tsx` (mount).
- **Stripping it requires:** removing the component mount and optionally
  `activity.ts`. If coach notes stay, streak/record insights need
  `activitySummary()` — keep the module, drop only the heatmap render. The
  ledger pruning in `storage.ts` can stay harmlessly.
- **Couplings:** one-way consumer of `cadence.stats.v1`; feeds insights (#7).
  Timezone/DST-sensitive (`scripts/activity-check.ts`, `probe-dst.ts`).

## 11. Settings modal

- **What it does:** the settings surface: intensity slider (0–100), seven
  toggles (strict, punctuation, numbers, live wpm, sound, coach, online
  packs), caret picker, accent picker. Every change persists immediately via
  `storage.saveSettings()`.
- **Flow:** header gear / palette -> `settings-modal.tsx` -> writes
  `cadence.settings.v1` -> consumers re-render on settings state in
  `page.tsx`.
- **Files:** `src/components/typing/settings-modal.tsx`,
  `src/lib/typing/storage.ts`, `src/lib/typing/sanitize.ts` (schema),
  `src/app/page.tsx` (mount).
- **Stripping it requires:** the modal is removable, but every flag then has
  no UI — features become hardcoded defaults. When stripping individual
  features (#4–#6, #19), shrink the modal, the `Settings` type, and
  `sanitize.ts` in the same change to keep the schema honest.
- **Couplings:** the single write path for every behavior flag. Shadcn
  primitives (`slider.tsx`, `switch.tsx`, `label.tsx`, `dialog.tsx`) exist
  mainly to serve it and the palette. Sanitizer legacy-key migrations should
  survive any strip.

## 12. Command palette (Esc)

- **What it does:** keyboard-first control surface (cmdk): mode switching,
  durations, counts, all toggles, intensity, restart, stats, settings,
  export, import. Every command maps to a `PaletteAction` handled by
  `page.runAction`.
- **Flow:** Esc opens it (via `use-global-keys.ts`) -> selection produces a
  `PaletteAction` -> `page.tsx` `runAction()` applies it to settings/session
  state -> persistence through the same settings path as #11.
- **Files:** `src/components/typing/command-palette.tsx`,
  `src/components/ui/command.tsx`, `src/hooks/use-global-keys.ts` (opener),
  `src/app/page.tsx` (`runAction`).
- **Stripping it requires:** removing the component, `runAction`, and the Esc
  opener branch. Caution: PRODUCT.md principle 5 commits to "practice
  requires no mouse" — the palette is the mouse-free path for
  modes/settings, so cutting it weakens a brand commitment, not just a
  feature.
- **Couplings:** shares action semantics with the settings modal; the Esc
  binding lives in the shared shortcuts hook (#17), so palette removal must
  leave overlay-closing intact.

## 13. Keyboard shortcuts

- **What it does:** Tab restarts the test; Esc opens/closes the palette and
  other overlays; ctrl/cmd+Backspace pops the whole typed word; all typing
  keys are redirected into the session when focus drifts — no click needed to
  refocus.
- **Flow:** `use-global-keys.ts` window-level listeners (Tab, Escape,
  Backspace modifier) -> session API in `use-typing-session.ts` (restart,
  word pop; focus redirect handled inside the hook's key handler).
- **Files:** `src/hooks/use-global-keys.ts`, `src/hooks/use-typing-session.ts`.
- **Stripping it requires:** partial strips are fine (drop the word-pop
  modifier branch, keep Tab/Esc). Full removal breaks overlay dismissal —
  Esc handling for the palette/settings/stats overlays lives here, so any
  strip must relocate or keep it.
- **Couplings:** entangled with every overlay (#11, #12) and with the session
  hook's keydown pipeline (#4, #5). This is PRODUCT.md principle 5 made real;
  treat as load-bearing infrastructure, not a strippable feature.

## 14. Export / import / reset backups

- **What it does:** one JSON snapshot of settings, learning, and stats via
  download; import restores a sanitized snapshot; reset wipes everything.
  Found in the stats panel data tab and the palette.
- **Flow:** `backup.ts` `downloadBackup()` builds and downloads the file ->
  `storage.ts` `exportData()` / `importData()` serialize/deserialize through
  the sanitizers -> `wipeAll()` clears every `cadence.*` key.
- **Files:** `src/lib/typing/backup.ts`, `src/lib/typing/storage.ts`,
  `src/components/typing/stats-panel.tsx` (data tab), `src/app/page.tsx`
  (handleImport).
- **Stripping it requires:** removing the data tab, palette actions, and the
  three storage functions. Isolated — nothing reads the backup format.
- **Couplings:** the only escape hatch for localStorage data. With no
  accounts, removing import/reset means a corrupted store can only be fixed
  by hand in devtools. Pack caches (#19) are separate keys; check `wipeAll()`
  coverage when editing.

## 15. Full-potential online packs (optional layer)

- **What it does:** when online and `usesOnlinePacks` is on, the app fetches
  a 10k frequency word list and a quote collection, validates and caches them
  locally, refreshing at most weekly. A header badge shows pack state (via
  `useSyncExternalStore`). Pack words merge invisibly into the pools.
- **Flow:** `use-pack-lifecycle.ts` (mounted by `page.tsx`) -> `online-pack.ts`
  fetch + validate + weekly gate -> `pool.registerPack()` merges into
  common/hard/quote pools and invalidates caches -> `connection-badge.tsx`
  subscribes to pack state. Cached under `cadence.pack.words.v2` /
  `cadence.pack.quotes.v1`.
- **Files:** `src/lib/typing/online-pack.ts`, `src/hooks/use-pack-lifecycle.ts`,
  `src/components/typing/connection-badge.tsx`, `src/lib/typing/pool.ts`.
- **Stripping it requires:** removing the lifecycle hook, badge, fetch
  module, two cache keys, the flag, and `registerPack()` / `clearPacks()`
  from `pool.ts`. The static base (`words.ts` COMMON/HARD/QUOTES plus
  `words-generated.ts`) stays and every generator keeps working — the pool
  abstraction was built so packs are pure additive content.
- **Couplings:** feeds the adaptive pool (#1) and quote pool (#2) additively;
  disabling packs degrades vocabulary, never correctness. Only network code
  in the app — PRODUCT.md's local-first claim is easiest to defend with it
  gone.

## 16. Learning engine

- **What it does:** the product's core mechanism. Per-key EWMA latency with
  Bayesian shrinkage toward QWERTY motor priors (pinky load, bottom-row
  reaches, same-finger bigrams from `motor.ts`), FSRS-5 spaced-repetition
  scheduling (`memory.ts`, the ts-fsrs wrapper) at key level in `profiles.ts`
  and word level in `word-scheduler.ts`. Urgencies drive adaptive curation;
  memory state drives the words tab, coach notes, and review picks.
- **Flow:** every test's keystrokes -> `ingestEvents()` /
  `ingestWordOutcomes()` -> `finalizeLearning()` / `finalizeWordReviews()` ->
  `cadence.learning.v1` -> read back next test by `calculateKeyUrgencies()` /
  `calculateBigramUrgencies()` / `pickReviewWords()`.
- **Files:** `src/lib/typing/profiles.ts`, `src/lib/typing/motor.ts`,
  `src/lib/typing/memory.ts`, `src/lib/typing/word-scheduler.ts`.
- **Stripping it requires:** do not, unless adaptive mode (#1) goes too and
  the product becomes a plain typing test — that contradicts PRODUCT.md's
  identity ("the coach that learns you"). A strip removes the
  ingest/finalize pipeline from `page.tsx`, both urgency calculators, the
  word-scheduler, `cadence.learning.v1`, the `fsrs-sanity.ts` harness, and
  the ts-fsrs dependency.
- **Couplings:** the root of the dependency graph. Feeds adaptive mode (#1),
  coach insights (#7), key/word stats tabs (#9), and results motor priors
  (#8). Written on every test regardless of which UI surfaces read it.

## 17. Forensics (keystroke audit + word diff)

- **What it does:** per-test forensic analysis: full keystroke log,
  per-second wpm/raw/error samples, confusion pairs (Map-indexed), trigram
  error contexts, rhythm/stamina/recovery metrics; `diff.ts` provides the
  canonical positional word diff that attributes errors to exact characters.
- **Flow:** session keystrokes accumulate -> on completion `page.tsx` calls
  `buildTestAudit()` -> results (#8) render the autopsy and chart; coach
  insights (#7) consume the same audit. Nothing persists — recomputed per
  test, ephemeral.
- **Files:** `src/lib/typing/audit.ts`, `src/lib/typing/diff.ts`,
  `src/app/page.tsx` (call site).
- **Stripping it requires:** removing the audit call and both consumer
  families — results' autopsy/chart/key report and the coach panel degrade to
  bare numbers. No partial strip keeps coach notes with cited evidence;
  insights without audit would be exactly the generic advice PRODUCT.md
  forbids. Harness: `scripts/audit-check.ts`.
- **Couplings:** entangled with results (#8) and coach (#7). Not coupled to
  storage — the cheapest big feature to verify, the most expensive to remove.

## Safe strip order

### Tier 1 — zero cross-feature damage (remove freely, in any order)

Cosmetics group (#6): onboarding hint, progress hairline, accent switching,
keypress sound, caret styles — each presentational, flag-gated, engine-blind.
Next: punctuation/numbers transforms (#3), quote mode (#4), words mode (#3 in
index), time mode (#2) — independent generator branches. Then: heatmap render
(#10 in index, keep `activity.ts` if coach stays), strict mode, live gauges,
and export/import/reset (#14 in index) if losing the only data escape hatch is
acceptable. Each leaves every other feature byte-identical; drop matching
sanitizer lines, flags, and regression harnesses (`scripts/*.ts`) in the same
change.

### Tier 2 — surgery required (plan before cutting)

- Online packs (#15 in index): clean boundaries (`pool.ts` registry was
  designed for additive removal), but touches page lifecycle, header UI, two
  storage keys, and the app's only network code.
- Stats panel (#9 in index): strippable tab-by-tab; the data tab hosts
  import/export UI (#14 in index) — relocate or accept the loss. Words/keys
  tabs share collectors with coach insights.
- Settings modal (#11 in index): only strippable if remaining flags get
  hardcoded defaults; keep the `sanitize.ts` legacy-key migrations.
- Command palette (#12 in index) and shortcuts (#13 in index): technically
  removable, but they are the keyboard-first identity (PRODUCT.md principle
  5). Esc overlay handling lives in the shared `use-global-keys.ts` — any cut
  must preserve overlay dismissal.
- Results screen extras (#8 in index): chart, autopsy, key report, word check
  strip block-by-block; a bare results screen is viable.

### Tier 3 — load-bearing for product identity (do not strip)

The learning engine (#16 in index), adaptive mode (#1 in index), forensics
(#17 in index), and coach notes (#7 in index) form one interlocked system —
this is the "coach that learns you" (PRODUCT.md positioning). Adaptive
curation is the engine's visible output; forensics lets the coach cite
evidence instead of generic advice; the engine feeds coach, stats tabs, and
results motor priors simultaneously. Stripping any one degrades the others:
coach without forensics violates "forensics over vibes"; adaptive without the
engine is impossible; the engine without adaptive mode writes data nothing
consumes. If the product must shrink to one thing, it is adaptive mode plus
the engine — everything else in this document is trim around that core.

### Honest entanglement notes

- Learning data (`cadence.learning.v1`) is written on every completed test
  regardless of mode or any UI toggle. Stripping the stats panel, heatmap, or
  coach does NOT stop learning accumulation — only removing the
  ingest/finalize calls in `page.tsx` does.
- `buildTestAudit()` runs for every test even when `isCoachOn` is false; the
  flag only gates the panel. Stripping coach notes saves the panel render,
  not the audit computation.
- The 100ms live tick (#5 in index) and the backspace path (#4, #13 in index)
  live inside the shared `use-typing-session.ts`; edits there affect all four
  modes at once.
- `pool.ts` is the deliberate seam between static dictionaries and pack
  content: generators never know packs exist, so pack removal is safe by
  construction while dictionary removal is not.
- `sanitize.ts` carries legacy-key migrations for renamed flags; a strip that
  removes a flag should keep the migration lines unless a full `wipeAll()` is
  acceptable for existing users.
- Regression harnesses (`scripts/check-generator.ts`, `check-insights.ts`,
  `audit-check.ts`, `activity-check.ts`, `word-check.ts`, `fsrs-sanity.ts`)
  assert behavior of the features above; retire or update each harness with
  its feature or CI goes red.
