# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a typist who wants to measurably improve, not just take tests —
they practice regularly, care about their weak keys and words, and expect the
app to study their mistakes and decide what to drill next (selected as the
adaptive-coaching audience in the init interview). The app assumes a
desktop-class keyboard; touch use is incidental, not a design target.

## Product Purpose

Cadence is a keyboard-first typing coach. Every test studies the typist's
stats and mistakes, then curates the next test to attack their weak keys,
bigrams, and words. Success means weak spots get fixed faster than generic
tests could — visible in rising WPM/accuracy and watch-list keys leaving
the list.

## Positioning

"The coach that learns you" (user-confirmed tagline). The mechanism a
neighboring typing-test product could not truthfully copy as-is:

- A three-layer FSRS-5 memory model (keys, bigrams, words) tuned for a
  motor skill instead of flashcards, deciding what comes back and when.
- Bayesian motor priors from typing research (pinky load, bottom-row
  reaches, same-finger bigrams) so the app is already smart on test one.
- Forensic per-test audit (keystroke log, per-second samples, final word
  diffs) powering coach notes that cite the user's own data — confusion
  pairs, trigram error contexts, rhythm/stamina/recovery — never generic
  advice.
- All of it fully local: no account, no cloud, no sync.

## Operating Context

- Desktop browser with a physical keyboard; typing is the whole
  interaction — practice requires no mouse (modes, durations, restarts
  are keyboard-reachable via command palette).
- Practice happens in short repeated sessions; coach notes and stats
  (history, personal bests, activity heatmap, streaks, key heatmap) are
  reviewed between tests.
- Works forever offline; when the browser reports a connection, an
  optional "full potential" layer fetches vocabulary packs (frequency
  word list + quote collection), validates and caches them locally.

## Capabilities and Constraints

Capabilities (confirmed in code):

- Four test modes: adaptive (default — curated from key/bigram/word
  urgency, intensity 0–100), time, words, quote.
- Strict mode (no backspace), live WPM, sound, caret styles, accent
  choice, coach panel toggle, optional online packs.
- Coach insights across focus, accuracy, speed, trend, record, streak,
  tip, error diagnosis, rhythm, and recovery.
- Stats: per-mode personal bests, 500-test history, 400-day activity
  ledger, streaks, key heatmap, per-test forensic charts.

Constraints (confirmed):

- Fully client-side (Next.js 16, React 19, TypeScript, Tailwind 4);
  persistence is localStorage only (settings, learning data, stats); no
  account system.
- Nothing user-specific ever leaves the device; the network only ever
  delivers vocabulary (pack fetch can be disabled in settings).
- Repo engineering gate: CODING_STANDARDS.md (nesting/complexity/file
  caps, naming, Conventional Commits) binds all future code changes.

## Brand Commitments

- Name: Cadence (product/package id "cadence").
- Tagline, binding: "The coach that learns you" — user-confirmed in the
  init interview; already the site title.
- Voice: a coach who cites evidence — direct, second-person,
  data-grounded ("'e'→'r' ×7", "78 → 61 wpm"), encouraging without fluff.

## Evidence on Hand

- The codebase itself: documented engine modules (memory, motor,
  word-scheduler, insights, audit, storage) are the product truth.
- Site metadata copy stating the positioning; in-app coach and stat copy.
- Absences future work must not fabricate: no marketing site, no
  testimonials, no user research, no benchmark or usage-count claims.

## Product Principles

1. The data is the coach — curation beats content; every test should be
   shaped by what the typist actually fumbles.
2. Local-first trust — no account, no cloud, works forever offline; the
   network only ever adds vocabulary.
3. Motor memory is memory — schedule like spaced repetition, but tuned
   for fingers; cold-start smart from research-backed priors.
4. Forensics over vibes — every coaching claim must cite the user's own
   recorded data, never generic advice.
5. Keyboard-first speed — the app must never come between the fingers
   and the keys; practice requires no mouse.

## Accessibility & Inclusion

- The product is inherently keyboard-operable; future UI work must keep
  full practice flows reachable without a pointing device. No other
  product-specific accessibility standard has been established.
