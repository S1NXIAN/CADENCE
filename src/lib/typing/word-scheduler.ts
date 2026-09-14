/**
 * Word-level memory layer — the third FSRS surface (after keys and bigrams).
 *
 * WHY: keys/bigrams say WHICH fingers struggle; words are what the user
 * actually experiences ("worst words", "fastest words", "that word keeps
 * getting me"). This module tracks every committed word attempt and drives
 * the same ts-fsrs scheduler (memory.ts) so ONE memory model spans all three
 * layers — no second, conflicting scheduler is introduced.
 *
 * SERVING — adaptive tests have three channels, and suspension applies to
 * exactly one of them (deliberate design, not an omission):
 *
 *   1. word-review channel (THIS module) — words whose FSRS retrievability
 *      decayed or whose error habit is chronic get a slice of the drill
 *      budget. Failed words return within ~1-3 tests (1m/8m learning steps),
 *      clean-fast words back off for days (Easy grade) — "appear often but
 *      not too often", scaling with difficulty and speed.
 *   2. key/bigram set-cover channel (generator.ts) — IGNORES word memory
 *      entirely: a word needed to drill a weak key ('j') is served on key
 *      merit even if the word itself is "easy". That is the principled
 *      answer to "words used in the test for key practice get lower
 *      suspension".
 *   3. flow channel — high-frequency connective tissue ("the", "and") is
 *      never suspended: English prose needs it regardless of mastery.
 *
 * GRADING: one review per word per test, from the aggregated occurrences.
 * Imperfect final diff → again; recovered slips (perfect diff but wrong
 * keystrokes) → hard; clean-but-slower-than-expected → hard; clean and
 * clearly faster than expected → easy (only with review history, so a lucky
 * first sample can't rocket a word to long-term stability); otherwise good.
 *
 * EXPECTED DURATION (the "difficulty" yardstick): a Bayesian estimate built
 * from the user's own shrunk key/bigram latencies with motor priors as the
 * cold-start fallback (motor.ts) — same evidence the key layer grades with.
 * Same-key repeats ("iii") get a 25% discount: repeat taps are fast.
 */
import type { LearningData, WordOutcome } from "./types";
import { isWordImperfect } from "./diff";
import { newMemCard, reviewMem, memRetrievability, type GradeName } from "./memory";
import { effLatency, personalMedianLatency } from "./profiles";
import { classifyBigram, keyPrior, PRIOR_BASE_LAT } from "./motor";

const WORD_KEY_RE = /^[a-z][a-z'-]{0,15}$/;

/** words are noisy samples: 6 phantom observations before data dominates */
const WORD_PRIOR_K = 6;
/**
 * Prior ERROR RATE for a whole WORD — deliberately NOT the per-keystroke
 * PRIOR_BASE_ERR: a word fails if ANY of its ~5 keystrokes slip, so a
 * healthy typist still misses ~16% of word occurrences
 * (1-(1-0.035)^5). Measuring words against the keystroke prior made every
 * normal word look chronically broken.
 */
const WORD_PRIOR_ERR = 0.16;

/** urgency at or above this enters the review queue (R ≈ 0.79 on a clean word) */
export const MIN_REVIEW_URGENCY = 0.28;

/** a word needs this many attempts before it ranks on worst/fastest lists */
export const MIN_RANK_ATTEMPTS = 3;

const MAX_WORD_MS = 120000; // >2min on one word: measurement, not typing
const MIN_WORD_MS = 100;

/**
 * Canonical profile key for a displayed word: lowercase, generator
 * punctuation transforms stripped ("The," → "the", '"quiet"' → "quiet").
 * Internal apostrophes/hyphens survive ("don't"). Returns null for tokens
 * that are not trackable words (numbers from numbers-mode, symbols, >16 chars).
 */
export function normalizeWordKey(raw: string): string | null {
  if (!raw) return null;
  let w = raw.toLowerCase();
  w = w.replace(/^["']*/, "").replace(/["']*$/, "");
  w = w.replace(/[,.;:!?]+$/, "");
  if (!WORD_KEY_RE.test(w)) return null;
  return w;
}

/**
 * Expected wall time (ms) for typing `displayed` — sum of shrunk transition
 * estimates + one final space interval. Falls back per transition:
 * observed bigram latency → observed key latency of the second char →
 * motor prior. Clamped to [50, 8000] so a poisoned profile can't make one
 * word "impossible" and grade everything again forever.
 */
export function expectedWordMs(displayed: string, learning: LearningData, medianLatency: number): number {
  const w = displayed.toLowerCase();
  let total = 0;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i];
    const b = w[i + 1];
    if (a === b) {
      // repeat taps ("iii", "ll") run ~25% faster than alternating transitions
      const kp = learning.keyProfiles[b];
      const lat = kp ? effLatency(kp.latency, kp.attempts, keyPrior(b).lat) : keyPrior(b).lat;
      total += lat * 0.75;
      continue;
    }
    const bg = learning.bigramProfiles[a + b];
    if (bg) {
      total += effLatency(bg.latency, bg.attempts, classifyBigram(a, b).lat);
      continue;
    }
    const kp2 = learning.keyProfiles[b];
    if (kp2 && kp2.latency !== null) {
      total += effLatency(kp2.latency, kp2.attempts, keyPrior(b).lat);
      continue;
    }
    total += classifyBigram(a, b).lat;
  }
  total += medianLatency > 0 ? medianLatency : PRIOR_BASE_LAT + 15;
  return Math.max(50, Math.min(8000, total));
}

// ---------------------------------------------------------------------------
// Per-test review batching (mirrors profiles.ts Tally pattern)
// ---------------------------------------------------------------------------

export interface WordOccurrence {
  ms: number | null;
  perfect: boolean;
  errKeys: number;
}

export interface WordReviewTally {
  entries: Map<string, { displayed: string; occ: WordOccurrence[] }>;
}

/**
 * Fold a finished test's word outcomes into the lifetime tallies (attempts,
 * errors, bestWpm) and return the per-test review batch. Partial attempts
 * (timer-truncated) and non-words (numbers) are skipped entirely — they are
 * not reviews.
 */
export function ingestWordOutcomes(learning: LearningData, outcomes: WordOutcome[]): WordReviewTally {
  const tally: WordReviewTally = { entries: new Map() };
  const now = Date.now();

  for (const o of outcomes) {
    if (o.partial) continue;
    const key = normalizeWordKey(o.target);
    if (!key) continue;
    const perfect = !isWordImperfect(o.target, o.typed);
    const ms =
      o.ms !== null && Number.isFinite(o.ms) && o.ms >= MIN_WORD_MS && o.ms <= MAX_WORD_MS ? o.ms : null;

    let wp = learning.wordProfiles[key];
    if (!wp) {
      wp = { attempts: 0, errors: 0, bestWpm: null, lastSeen: 0, mem: null };
      learning.wordProfiles[key] = wp;
    }
    wp.attempts += 1;
    if (!perfect) wp.errors += 1;
    if (ms !== null && perfect) {
      const wpm = Math.max(0, Math.min(500, (o.target.length / 5) / (ms / 60000)));
      wp.bestWpm = wp.bestWpm === null ? wpm : Math.max(wp.bestWpm, wpm);
    }
    wp.lastSeen = now;

    let entry = tally.entries.get(key);
    if (!entry) {
      entry = { displayed: o.target, occ: [] };
      tally.entries.set(key, entry);
    }
    if (o.target.length > entry.displayed.length) entry.displayed = o.target;
    entry.occ.push({ ms, perfect, errKeys: o.errKeys });
  }
  return tally;
}

/** Map aggregated occurrences to an FSRS grade (see module docblock). */
function gradeWord(entry: { occ: WordOccurrence[] }, expectedMs: number, hasHistory: boolean): GradeName {
  if (entry.occ.some((o) => !o.perfect)) return "again";
  if (entry.occ.some((o) => o.errKeys > 0)) return "hard";
  const timed = entry.occ.filter((o) => o.ms !== null).map((o) => o.ms as number).sort((a, b) => a - b);
  const median = timed.length ? timed[Math.floor(timed.length / 2)] : null;
  const ratio = median !== null && expectedMs > 0 ? expectedMs / median : null;
  if (ratio !== null && ratio < 0.85) return "hard"; // clean but slower than expected
  if (hasHistory && ratio !== null && ratio > 1.18) return "easy";
  return "good";
}

/**
 * Called once per test (after finalizeLearning): advance each reviewed
 * word's FSRS card. Guarded never-throw like the rest of the scheduler —
 * a scheduling hiccup must not break finishing a test.
 */
export function finalizeWordReviews(learning: LearningData, tally: WordReviewTally | null | undefined): void {
  if (!tally || tally.entries.size === 0) return;
  const now = Date.now();
  const median = personalMedianLatency(learning);
  for (const [key, entry] of tally.entries) {
    try {
      const wp = learning.wordProfiles[key];
      if (!wp) continue;
      const expected = expectedWordMs(entry.displayed, learning, median);
      const grade = gradeWord(entry, expected, (wp.mem?.reps ?? 0) > 0);
      wp.mem = reviewMem(wp.mem ?? newMemCard(now), grade, now);
    } catch {
      // leave the card untouched — the tally is still counted
    }
  }
}

// ---------------------------------------------------------------------------
// Urgency + rankings
// ---------------------------------------------------------------------------

export interface UrgentWord {
  word: string;
  urgency: number;
  retrievability: number;
  errRate: number;
  errors: number;
  attempts: number;
  bestWpm: number | null;
  /** ms until the FSRS card is due (negative = overdue), null = never reviewed */
  dueInMs: number | null;
}

function shrunkErrRate(errors: number, attempts: number): number {
  return (errors + WORD_PRIOR_K * WORD_PRIOR_ERR) / (attempts + WORD_PRIOR_K);
}

/**
 * Urgency of every tracked word, sorted descending. Mirrors keyUrgencies:
 * FSRS retrievability decay is the heartbeat, chronic error habit keeps
 * stubborn words hot, FSRS difficulty adds a residual pull.
 * Never-reviewed words start at ~0 — a word can't be "due" before it has
 * been seen; it enters rotation naturally via flow/cover.
 */
export function wordUrgencies(learning: LearningData, now = Date.now()): UrgentWord[] {
  const out: UrgentWord[] = [];
  for (const [word, p] of Object.entries(learning.wordProfiles)) {
    const R = p.mem ? memRetrievability(p.mem, now) : 0;
    const hasHistory = (p.mem?.reps ?? 0) > 0;
    const chronic = Math.max(0, shrunkErrRate(p.errors, p.attempts) / WORD_PRIOR_ERR - 1.15);
    const urgency = hasHistory
      ? (1 - R) * 1.35 + chronic * 0.55 + ((p.mem?.d ?? 5) / 10) * 0.12
      : Math.max(0, chronic - 0.5) * 0.3;
    out.push({
      word,
      urgency,
      retrievability: R,
      errRate: p.attempts > 0 ? p.errors / p.attempts : 0,
      errors: p.errors,
      attempts: p.attempts,
      bestWpm: p.bestWpm,
      dueInMs: p.mem ? p.mem.due - now : null,
    });
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

/**
 * Words to inject into the next adaptive test's review channel: urgency
 * above floor, jittered so consecutive tests don't serve identical queues,
 * capped at `max` (the generator reserves the drill slice). Pool membership
 * is the caller's concern (quote-only words shouldn't leak into drills).
 */
export function pickReviewWords(learning: LearningData, pool: Set<string>, max: number, now = Date.now()): string[] {
  if (max <= 0) return [];
  const urgent = wordUrgencies(learning, now).filter((u) => u.urgency >= MIN_REVIEW_URGENCY && pool.has(u.word));
  if (!urgent.length) return [];
  const jittered = urgent.map((u) => ({ word: u.word, j: u.urgency * (0.75 + Math.random() * 0.5) }));
  jittered.sort((a, b) => b.j - a.j);
  return jittered.slice(0, max).map((u) => u.word);
}

/** Words the user keeps getting wrong (error rate first, then volume). */
export function worstWords(learning: LearningData, n = 8): UrgentWord[] {
  return wordUrgencies(learning)
    .filter((u) => u.attempts >= MIN_RANK_ATTEMPTS && u.errRate > 0)
    .sort((a, b) => b.errRate - a.errRate || b.errors - a.errors || b.urgency - a.urgency)
    .slice(0, n);
}

/** Clean quick wins — best wpm on a perfect attempt, mostly-clean records only. */
export function fastestWords(learning: LearningData, n = 8): UrgentWord[] {
  return wordUrgencies(learning)
    .filter((u) => u.attempts >= MIN_RANK_ATTEMPTS && u.bestWpm !== null && u.errRate < 0.15)
    .sort((a, b) => (b.bestWpm ?? 0) - (a.bestWpm ?? 0))
    .slice(0, n);
}

/** What the review queue will serve next (highest urgency first). */
export function dueWords(learning: LearningData, n = 6): UrgentWord[] {
  return wordUrgencies(learning).filter((u) => u.urgency >= MIN_REVIEW_URGENCY).slice(0, n);
}
