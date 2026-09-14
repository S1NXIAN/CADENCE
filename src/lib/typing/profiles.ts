import type {
  BigramProfile,
  CharEvent,
  ConfusionPair,
  ErrorContext,
  KeyProfile,
  LearningData,
  MemCard,
  WeakKey,
} from "./types";
import { newMemCard, reviewMem, memRetrievability, type GradeName } from "./memory";
import { keyPrior, classifyBigram, PRIOR_BASE_ERR, PRIOR_BASE_LAT } from "./motor";

// EWMA alphas — how fast the *displayed* recency stats adapt. The actual
// scheduling lives in the FSRS memory model (memory.ts); EWMA error/latency
// remain as fast-reacting signals on top of it.
const ERR_ALPHA = 0.08; // error rate adapts moderately fast
const LATENCY_ALPHA = 0.06; // latency adapts smoothly
const MAX_LATENCY_SAMPLE = 2000; // ignore pauses longer than 2s (thinking, not typing)
const MAX_CONFUSIONS = 60;
const MAX_ERROR_CONTEXTS = 40;

// Bayesian shrinkage strengths: observed data needs this many effective
// samples to fully override the motor priors (motor.ts).
const PRIOR_K_ERR = 4;
const PRIOR_K_LAT = 6;
// The recent-error EWMA signal only earns trust with this many attempts.
const EWMA_CONF_ATTEMPTS = 8;

export function createEmptyLearning(): LearningData {
  return {
    keyProfiles: {},
    bigramProfiles: {},
    wordProfiles: {},
    confusions: [],
    errorContexts: [],
    totalKeystrokes: 0,
    totalChars: 0,
    totalTests: 0,
    totalTimeMs: 0,
    lastVersion: 4,
  };
}

function isTrackedKey(ch: string): boolean {
  return /[a-z0-9',.;!?-]/i.test(ch) && ch.length === 1;
}

function ensureKey(profiles: Record<string, KeyProfile>, key: string): KeyProfile {
  if (!profiles[key]) {
    profiles[key] = { attempts: 0, errors: 0, errRate: 0, latency: null, lastSeen: 0, mem: null };
  }
  return profiles[key];
}

function ensureBigram(
  profiles: Record<string, BigramProfile>,
  bigram: string
): BigramProfile {
  if (!profiles[bigram]) {
    profiles[bigram] = { attempts: 0, errors: 0, errRate: 0, latency: null, lastSeen: 0, mem: null };
  }
  return profiles[bigram];
}

// ---------------------------------------------------------------------------
// Per-test review batching: keystroke-level ingest stays incremental, but the
// FSRS review happens ONCE per item per test, from the aggregated tally.
// ---------------------------------------------------------------------------
export interface Tally {
  n: number; // keystrokes aimed at this item this test
  err: number; // of which wrong
  latSum: number;
  latN: number;
}

export interface ReviewTally {
  keys: Map<string, Tally>;
  bigrams: Map<string, Tally>;
}

export function newReviewTally(): ReviewTally {
  return { keys: new Map(), bigrams: new Map() };
}

function bumpTally(map: Map<string, Tally>, id: string, err: number, lat: number | null): void {
  let t = map.get(id);
  if (!t) {
    t = { n: 0, err: 0, latSum: 0, latN: 0 };
    map.set(id, t);
  }
  t.n += 1;
  t.err += err;
  if (lat !== null) {
    t.latSum += lat;
    t.latN += 1;
  }
}

// --- confusion / error-context indexes ------------------------------------
// The persisted shapes are arrays (sorted-by-count, capped); per-event lookups
// go through a Map index of the same object references so a mistake-heavy test
// never degrades to O(capped-list) scans per error.

function pairKeyOf(expected: string, typed: string): string {
  return `${expected}>${typed}`;
}

function rebuildConfusionIndex(
  confusions: ConfusionPair[],
  index: Map<string, ConfusionPair>,
): void {
  index.clear();
  for (const c of confusions) index.set(pairKeyOf(c.expected, c.typed), c);
}

function recordConfusion(
  learning: LearningData,
  index: Map<string, ConfusionPair>,
  expected: string,
  typed: string,
): void {
  const key = pairKeyOf(expected, typed);
  const existing = index.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = Date.now();
    return;
  }
  const pair: ConfusionPair = { expected, typed, count: 1, lastSeen: Date.now() };
  learning.confusions.push(pair);
  index.set(key, pair);
  if (learning.confusions.length > MAX_CONFUSIONS) {
    learning.confusions.sort((a, b) => b.count - a.count);
    learning.confusions.length = MAX_CONFUSIONS;
    rebuildConfusionIndex(learning.confusions, index);
  }
}

function rebuildContextIndex(
  contexts: ErrorContext[],
  index: Map<string, ErrorContext>,
): void {
  index.clear();
  for (const c of contexts) index.set(c.trigram, c);
}

function recordErrorContext(
  learning: LearningData,
  index: Map<string, ErrorContext>,
  trigram: string,
): void {
  const existing = index.get(trigram);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = Date.now();
    return;
  }
  const context: ErrorContext = { trigram, count: 1, lastSeen: Date.now() };
  learning.errorContexts.push(context);
  index.set(trigram, context);
  if (learning.errorContexts.length > MAX_ERROR_CONTEXTS) {
    learning.errorContexts.sort((a, b) => b.count - a.count);
    learning.errorContexts.length = MAX_ERROR_CONTEXTS;
    rebuildContextIndex(learning.errorContexts, index);
  }
}

/**
 * Ingest all character events from a finished test into the learning data.
 * - correct keystrokes update motor latency (EWMA) for the pressed key
 *   and for the bigram transition (prev -> current), and count toward the
 *   per-test FSRS review tally.
 * - errors update the error rate of the EXPECTED key, the transition bigram
 *   (prev -> expected — the key COMBINATION that failed), record a confusion
 *   pair (expected -> typed) plus a trigram error context, and count as
 *   failures in the tally for both the expected and the typed key.
 * Returns the tally that finalizeLearning consumes for FSRS scheduling.
 */
export function ingestEvents(learning: LearningData, events: CharEvent[], durationMs: number): ReviewTally {
  const tally = newReviewTally();
  let prevTyped: string | null = null;
  let prevTime: number | null = null;
  const lastPressed: string[] = []; // last 2 tracked pressed chars, for error context
  const confusionIndex = new Map<string, ConfusionPair>();
  rebuildConfusionIndex(learning.confusions, confusionIndex);
  const contextIndex = new Map<string, ErrorContext>();
  rebuildContextIndex(learning.errorContexts, contextIndex);
  let correctCount = 0;

  for (const ev of events) {
    learning.totalKeystrokes += 1;
    if (ev.isCorrect) correctCount += 1;
    const delta = ev.isCorrect && prevTime !== null && ev.t - prevTime > 20 && ev.t - prevTime < MAX_LATENCY_SAMPLE
      ? ev.t - prevTime
      : null;

    if (isTrackedKey(ev.typed)) {
      const kp = ensureKey(learning.keyProfiles, ev.typed.toLowerCase());
      kp.attempts += 1;
      kp.lastSeen = Date.now();

      if (ev.isCorrect) {
        if (delta !== null) {
          kp.latency = kp.latency === null ? delta : kp.latency * (1 - LATENCY_ALPHA) + delta * LATENCY_ALPHA;
        }
        bumpTally(tally.keys, ev.typed.toLowerCase(), 0, delta);
      } else {
        kp.errors += 1;
        kp.errRate = kp.errRate * (1 - ERR_ALPHA) + 1 * ERR_ALPHA;
        bumpTally(tally.keys, ev.typed.toLowerCase(), 1, null);
      }
    }

    // error attribution: the key you WERE SUPPOSED to press gets the blame
    if (ev.expected && !ev.isCorrect && isTrackedKey(ev.expected)) {
      const exp = ev.expected.toLowerCase();
      const kp = ensureKey(learning.keyProfiles, exp);
      kp.errors += 1;
      kp.errRate = kp.errRate * (1 - ERR_ALPHA) + 1 * ERR_ALPHA;
      kp.lastSeen = Date.now();
      bumpTally(tally.keys, exp, 1, null);
    }

    // bigram transition: prev -> (typed when correct, expected when not).
    // This is the KEY COMBINATION model: latency when clean, error-rate always,
    // so combinations that fall apart under your fingers show up here.
    const transitionEnd = ev.isCorrect ? ev.typed : ev.expected;
    if (
      prevTyped &&
      isTrackedKey(prevTyped) &&
      transitionEnd &&
      isTrackedKey(transitionEnd)
    ) {
      const bg = (prevTyped + transitionEnd).toLowerCase();
      const bp = ensureBigram(learning.bigramProfiles, bg);
      bp.attempts += 1;
      bp.lastSeen = Date.now();
      if (ev.isCorrect) {
        if (delta !== null) {
          bp.latency = bp.latency === null ? delta : bp.latency * (1 - LATENCY_ALPHA) + delta * LATENCY_ALPHA;
        }
        bumpTally(tally.bigrams, bg, 0, delta);
      } else {
        bp.errors += 1;
        bp.errRate = bp.errRate * (1 - ERR_ALPHA) + 1 * ERR_ALPHA;
        bumpTally(tally.bigrams, bg, 1, null);
      }
    }

    // confusion pair expected -> typed
    if (ev.expected && ev.expected !== ev.typed && ev.expected.toLowerCase() !== ev.typed.toLowerCase()) {
      const exp = ev.expected.toLowerCase();
      const typ = ev.typed.toLowerCase();
      if (isTrackedKey(exp) && typ.length === 1) {
        recordConfusion(learning, confusionIndex, exp, typ);
      }
    }

    // trigram error context: the 2 keys pressed immediately BEFORE the mistake
    if (ev.expected && !ev.isCorrect && isTrackedKey(ev.expected) && lastPressed.length === 2) {
      const tri = (lastPressed[0] + lastPressed[1] + ev.expected).toLowerCase();
      recordErrorContext(learning, contextIndex, tri);
    }

    // pressed-char history for error contexts
    if (isTrackedKey(ev.typed)) {
      lastPressed.push(ev.typed.toLowerCase());
      if (lastPressed.length > 2) lastPressed.shift();
    }

    prevTyped = ev.typed;
    prevTime = ev.t;
  }

  learning.totalChars += correctCount;
  learning.totalTimeMs += durationMs;
  return tally;
}

/** Median observed inter-key latency across all tracked items (0 if none). */
export function calculateMedianLatency(learning: LearningData): number {
  const latencies: number[] = [];
  for (const p of Object.values(learning.keyProfiles)) {
    if (p.latency !== null) latencies.push(p.latency);
  }
  for (const p of Object.values(learning.bigramProfiles)) {
    if (p.latency !== null) latencies.push(p.latency);
  }
  if (!latencies.length) return 0;
  latencies.sort((a, b) => a - b);
  return latencies[Math.floor(latencies.length / 2)];
}

/**
 * Map one item's aggregated test performance to an FSRS grade.
 * Accuracy dominates; clean-but-slow runs grade Hard; fast-and-clean grades
 * Easy once the item has history (first review is capped at Good so a lucky
 * 2-keystroke sample can't rocket an item to long-term stability).
 */
function gradeTally(t: Tally, avgLatRatio: number | null, hasHistory: boolean): GradeName {
  const acc = t.n > 0 ? 1 - t.err / t.n : 1;
  if (acc < 0.8) return "again";
  if (acc < 0.97 || t.err >= 2) return "hard";
  if (avgLatRatio !== null && avgLatRatio > 1.3) return "hard";
  if (hasHistory && avgLatRatio !== null && avgLatRatio < 0.72) return "easy";
  return "good";
}

/**
 * Called once after each test: apply FSRS reviews from the tally (one review
 * per item per test) and bump the test counter.
 */
export function finalizeLearning(learning: LearningData, tally?: ReviewTally): void {
  if (tally) {
    const now = Date.now();
    const median = calculateMedianLatency(learning);

    for (const [ch, t] of tally.keys) {
      const kp = ensureKey(learning.keyProfiles, ch);
      const effLat = effLatency(kp.latency, kp.attempts, keyPrior(ch).lat);
      const ratio = t.latN > 0 && effLat > 0 && median > 0 ? (t.latSum / t.latN) / median : null;
      const grade = gradeTally(t, ratio, (kp.mem?.reps ?? 0) > 0);
      kp.mem = reviewMem(kp.mem ?? newMemCard(now), grade, now);
    }

    for (const [bg, t] of tally.bigrams) {
      const bp = ensureBigram(learning.bigramProfiles, bg);
      const prior = classifyBigram(bg[0], bg[1]).lat;
      const effLat = effLatency(bp.latency, bp.attempts, prior);
      const ratio = t.latN > 0 && effLat > 0 && median > 0 ? (t.latSum / t.latN) / median : null;
      const grade = gradeTally(t, ratio, (bp.mem?.reps ?? 0) > 0);
      bp.mem = reviewMem(bp.mem ?? newMemCard(now), grade, now);
    }
  }
  learning.totalTests += 1;
}

/**
 * Latency shrunk toward the motor prior (cold start -> prior itself).
 * Exported for the word scheduler, which estimates a word's expected
 * duration from the same per-key/bigram evidence.
 */
export function effLatency(ewma: number | null, attempts: number, priorLat: number): number {
  if (ewma === null) return priorLat;
  return (attempts * ewma + PRIOR_K_LAT * priorLat) / (attempts + PRIOR_K_LAT);
}

// ---------------------------------------------------------------------------
// Urgency — the unified "how much does this item need practice right now"
// score that replaced the old weakness heuristic. Signals:
//   (1-R)   FSRS retrievability decay (the spaced-repetition heartbeat)
//   chronic errors   shrunk lifetime error rate vs motor prior
//   recent errors    EWMA error rate, confidence-gated
//   slow latency     shrunk latency vs personal median
//   difficulty       FSRS D keeps stubborn items warm
// ---------------------------------------------------------------------------
export interface UrgentKey {
  key: string;
  urgency: number;
  retrievability: number;
  errRate: number;
  latency: number | null;
  attempts: number;
}

function shrunkErrRate(errors: number, attempts: number, priorErr: number): number {
  return (errors + PRIOR_K_ERR * priorErr) / (attempts + PRIOR_K_ERR);
}

export function calculateKeyUrgencies(learning: LearningData): UrgentKey[] {
  const now = Date.now();
  const median = calculateMedianLatency(learning) || PRIOR_BASE_LAT + 15;
  const out: UrgentKey[] = [];

  for (const [key, p] of Object.entries(learning.keyProfiles)) {
    const prior = keyPrior(key);
    const mem: MemCard | null = p.mem;
    const R = mem ? memRetrievability(mem, now) : 0;
    const chronic = Math.max(0, shrunkErrRate(p.errors, p.attempts, prior.err) / PRIOR_BASE_ERR - 1.15);
    const ewmaConf = Math.min(1, p.attempts / EWMA_CONF_ATTEMPTS);
    const recent = Math.max(0, p.errRate * ewmaConf - PRIOR_BASE_ERR * 1.35);
    const effLat = effLatency(p.latency, p.attempts, prior.lat);
    const slow = Math.max(0, effLat / median - 1);

    let urgency: number;
    if (mem && mem.reps > 0) {
      urgency =
        (1 - R) * 1.35 +
        chronic * 0.6 * prior.freqW +
        recent * 1.15 * prior.freqW +
        Math.max(0, slow - 0.12) * 0.55 * prior.freqW +
        (mem.d / 10) * 0.1;
    } else {
      // cold start (no review history): motor priors point at pinky/bottom-row keys
      urgency = Math.max(0, prior.err / PRIOR_BASE_ERR - 1) * 0.22;
    }

    out.push({ key, urgency, retrievability: R, errRate: p.errRate, latency: p.latency, attempts: p.attempts });
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

export interface WeakBigram {
  bigram: string;
  weakness: number;
  errRate: number;
  latency: number | null;
  attempts: number;
}

export interface UrgentBigram {
  bigram: string;
  urgency: number;
  retrievability: number;
}

export function calculateBigramUrgencies(learning: LearningData): UrgentBigram[] {
  const now = Date.now();
  const median = calculateMedianLatency(learning) || PRIOR_BASE_LAT + 15;
  const out: UrgentBigram[] = [];

  for (const [bg, p] of Object.entries(learning.bigramProfiles)) {
    if (!bg || bg.length < 2) continue;
    const prior = classifyBigram(bg[0], bg[1]);
    const mem: MemCard | null = p.mem;
    const R = mem ? memRetrievability(mem, now) : 0;
    const chronic = Math.max(0, shrunkErrRate(p.errors, p.attempts, prior.err) / PRIOR_BASE_ERR - 1.15);
    const ewmaConf = Math.min(1, p.attempts / EWMA_CONF_ATTEMPTS);
    const recent = Math.max(0, p.errRate * ewmaConf - PRIOR_BASE_ERR * 1.35);
    const effLat = effLatency(p.latency, p.attempts, prior.lat);
    const slow = Math.max(0, effLat / median - 1);

    let urgency: number;
    if (mem && mem.reps > 0) {
      urgency =
        (1 - R) * 1.35 +
        chronic * 0.75 +
        recent * 1.2 +
        Math.max(0, slow - 0.12) * 0.6 +
        (mem.d / 10) * 0.1;
    } else {
      urgency = Math.max(0, prior.err / PRIOR_BASE_ERR - 1) * 0.22;
    }
    out.push({ bigram: bg, urgency, retrievability: R });
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

/**
 * Weak keys ranked by urgency. Interface-compatible with the old heuristic;
 * `weakness` is now the FSRS+prior urgency score.
 */
export function computeWeakKeys(
  learning: LearningData,
  pool: string[] = Object.keys(learning.keyProfiles)
): WeakKey[] {
  const poolSet = new Set(pool);
  return calculateKeyUrgencies(learning)
    .filter((u) => poolSet.has(u.key))
    .map((u) => ({
      key: u.key,
      weakness: u.urgency,
      errRate: u.errRate,
      latency: u.latency,
      attempts: u.attempts,
    }));
}

/**
 * Weak bigram transitions, ranked by urgency (FSRS decay + prior-shrunk
 * errors/latency). This is how the coach knows WHICH key combinations need work.
 */
export function collectWeakBigrams(learning: LearningData, topN = 8): WeakBigram[] {
  return calculateBigramUrgencies(learning)
    .slice(0, topN)
    .map((u) => {
      const p = learning.bigramProfiles[u.bigram];
      return {
        bigram: u.bigram,
        weakness: u.urgency,
        errRate: p?.errRate ?? 0,
        latency: p?.latency ?? null,
        attempts: p?.attempts ?? 0,
      };
    });
}

/** Trigram contexts where errors cluster: the 2 keys before a mistake + the fumbled key. */
export function collectTopErrorContexts(learning: LearningData, topN = 3): ErrorContext[] {
  return [...learning.errorContexts]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function collectTopConfusions(learning: LearningData, topN = 5): ConfusionPair[] {
  return [...learning.confusions]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
