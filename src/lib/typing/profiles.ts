import type {
  BigramProfile,
  CharEvent,
  ConfusionPair,
  ErrorContext,
  KeyProfile,
  LearningData,
  WeakKey,
} from "./types";

// EWMA alphas — how fast the model adapts to recent behavior.
const ERR_ALPHA = 0.08; // error rate adapts moderately fast
const LATENCY_ALPHA = 0.06; // latency adapts smoothly
const EXPOSURE_DECAY = 0.985; // old exposure fades so stale keys drop out of focus
const MIN_ATTEMPTS = 4; // below this, a key isn't confident enough to be called weak
const MAX_LATENCY_SAMPLE = 2000; // ignore pauses longer than 2s (thinking, not typing)
const MAX_CONFUSIONS = 60;
const MAX_ERROR_CONTEXTS = 40;

export function emptyLearning(): LearningData {
  return {
    keyProfiles: {},
    bigramProfiles: {},
    confusions: [],
    errorContexts: [],
    totalKeystrokes: 0,
    totalChars: 0,
    totalTests: 0,
    totalTimeMs: 0,
    lastVersion: 2,
  };
}

function isTrackedKey(ch: string): boolean {
  return /[a-z0-9',.;!?-]/i.test(ch) && ch.length === 1;
}

function ensureKey(profiles: Record<string, KeyProfile>, key: string): KeyProfile {
  if (!profiles[key]) {
    profiles[key] = { attempts: 0, errRate: 0, latency: null, lastSeen: 0 };
  }
  return profiles[key];
}

function ensureBigram(
  profiles: Record<string, BigramProfile>,
  bigram: string
): BigramProfile {
  if (!profiles[bigram]) {
    profiles[bigram] = { attempts: 0, errRate: 0, latency: null, lastSeen: 0 };
  }
  return profiles[bigram];
}

/**
 * Ingest all character events from a finished test into the learning data.
 * - correct keystrokes update motor latency (EWMA) for the pressed key
 *   and for the bigram transition (prev -> current).
 * - errors update the error rate of the EXPECTED key, the transition bigram
 *   (prev -> expected — the key COMBINATION that failed), and record a
 *   confusion pair (expected -> typed) plus a trigram error context
 *   (the 2 keys typed before the mistake).
 * - exposure decays so the model always reflects recent typing habits.
 */
export function ingestEvents(learning: LearningData, events: CharEvent[], durationMs: number): void {
  let prevTyped: string | null = null;
  let prevTime: number | null = null;
  const lastPressed: string[] = []; // last 2 tracked pressed chars, for error context

  for (const ev of events) {
    learning.totalKeystrokes += 1;

    // decay everything a little each keystroke batch (cheap and effective)
    // exposure decay is applied per keystroke at a tiny rate
    // (EXPOSURE_DECAY^keystroke would be too strong; we apply it in finalizeLearning)
    if (isTrackedKey(ev.typed)) {
      const kp = ensureKey(learning.keyProfiles, ev.typed.toLowerCase());
      kp.attempts += 1;
      kp.lastSeen = Date.now();

      if (ev.correct && prevTime !== null) {
        const delta = ev.t - prevTime;
        if (delta > 20 && delta < MAX_LATENCY_SAMPLE) {
          kp.latency =
            kp.latency === null
              ? delta
              : kp.latency * (1 - LATENCY_ALPHA) + delta * LATENCY_ALPHA;
        }
      }
      if (!ev.correct) {
        kp.errRate = kp.errRate * (1 - ERR_ALPHA) + 1 * ERR_ALPHA;
      } else {
        kp.errRate = kp.errRate * (1 - ERR_ALPHA) + 0 * ERR_ALPHA;
      }
    }

    // error attribution: the key you WERE SUPPOSED to press gets the blame
    if (ev.expected && !ev.correct && isTrackedKey(ev.expected)) {
      const kp = ensureKey(learning.keyProfiles, ev.expected.toLowerCase());
      kp.errRate = kp.errRate * (1 - ERR_ALPHA) + 1 * ERR_ALPHA;
      kp.lastSeen = Date.now();
    }

    // bigram transition: prev -> (typed when correct, expected when not).
    // This is the KEY COMBINATION model: latency when clean, error-rate always,
    // so combinations that fall apart under your fingers show up here.
    const transitionEnd = ev.correct ? ev.typed : ev.expected;
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
      if (ev.correct && prevTime !== null) {
        const delta = ev.t - prevTime;
        if (delta > 20 && delta < MAX_LATENCY_SAMPLE) {
          bp.latency =
            bp.latency === null
              ? delta
              : bp.latency * (1 - LATENCY_ALPHA) + delta * LATENCY_ALPHA;
        }
      }
      bp.errRate = bp.errRate * (1 - ERR_ALPHA) + (ev.correct ? 0 : 1) * ERR_ALPHA;
    }

    // confusion pair expected -> typed
    if (ev.expected && ev.expected !== ev.typed && ev.expected.toLowerCase() !== ev.typed.toLowerCase()) {
      const exp = ev.expected.toLowerCase();
      const typ = ev.typed.toLowerCase();
      if (isTrackedKey(exp) && typ.length === 1) {
        const existing = learning.confusions.find((c) => c.expected === exp && c.typed === typ);
        if (existing) {
          existing.count += 1;
          existing.lastSeen = Date.now();
        } else {
          learning.confusions.push({
            expected: exp,
            typed: typ,
            count: 1,
            lastSeen: Date.now(),
          });
          if (learning.confusions.length > MAX_CONFUSIONS) {
            learning.confusions.sort((a, b) => b.count - a.count);
            learning.confusions.length = MAX_CONFUSIONS;
          }
        }
      }
    }

    // trigram error context: the 2 keys pressed immediately BEFORE the mistake
    if (ev.expected && !ev.correct && isTrackedKey(ev.expected) && lastPressed.length === 2) {
      const tri = (lastPressed[0] + lastPressed[1] + ev.expected).toLowerCase();
      const existing = learning.errorContexts.find((c) => c.trigram === tri);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = Date.now();
      } else {
        learning.errorContexts.push({ trigram: tri, count: 1, lastSeen: Date.now() });
        if (learning.errorContexts.length > MAX_ERROR_CONTEXTS) {
          learning.errorContexts.sort((a, b) => b.count - a.count);
          learning.errorContexts.length = MAX_ERROR_CONTEXTS;
        }
      }
    }

    // pressed-char history for error contexts
    if (isTrackedKey(ev.typed)) {
      lastPressed.push(ev.typed.toLowerCase());
      if (lastPressed.length > 2) lastPressed.shift();
    }

    prevTyped = ev.typed;
    prevTime = ev.t;
  }

  learning.totalChars += events.filter((e) => e.correct).length;
  learning.totalTimeMs += durationMs;
}

/**
 * Called once after each test: decay all exposures so stale data fades.
 */
export function finalizeLearning(learning: LearningData): void {
  const decay = (obj: Record<string, { attempts: number }>) => {
    for (const k of Object.keys(obj)) {
      obj[k].attempts *= EXPOSURE_DECAY;
    }
  };
  decay(learning.keyProfiles as unknown as Record<string, { attempts: number }>);
  decay(learning.bigramProfiles as unknown as Record<string, { attempts: number }>);
  learning.totalTests += 1;
}

/**
 * Weakness score per key:
 *   weakness = confidence * (errRate * 1.4 + max(0, latencyPenalty) * 0.9)
 * Keys with very few attempts are not confident → dampened.
 */
export function computeWeakKeys(
  learning: LearningData,
  pool: string[] = Object.keys(learning.keyProfiles)
): WeakKey[] {
  const latencies: number[] = [];
  for (const k of pool) {
    const p = learning.keyProfiles[k];
    if (p && p.latency !== null) latencies.push(p.latency);
  }
  latencies.sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 180;

  const weak: WeakKey[] = [];
  for (const key of pool) {
    const p = learning.keyProfiles[key];
    if (!p) continue;
    const confidence = Math.min(1, p.attempts / (MIN_ATTEMPTS * 3));
    const latencyPenalty = p.latency !== null ? Math.max(0, (p.latency - median) / median) : 0;
    const weakness = confidence * (p.errRate * 1.4 + latencyPenalty * 0.9);
    if (p.attempts >= MIN_ATTEMPTS) {
      weak.push({
        key,
        weakness,
        errRate: p.errRate,
        latency: p.latency,
        attempts: p.attempts,
      });
    }
  }
  return weak.sort((a, b) => b.weakness - a.weakness);
}

export interface WeakBigram {
  bigram: string;
  weakness: number;
  errRate: number;
  latency: number | null;
  attempts: number;
}

/**
 * Weak bigram transitions: combinations that either produce errors or slow you
 * down relative to your median transition speed. This is how the coach knows
 * WHICH key combinations (not just keys) need work.
 */
export function weakBigrams(learning: LearningData, topN = 8): WeakBigram[] {
  const latencies: number[] = [];
  for (const p of Object.values(learning.bigramProfiles)) {
    if (p.latency !== null) latencies.push(p.latency);
  }
  latencies.sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 180;

  const out: WeakBigram[] = [];
  for (const [bg, p] of Object.entries(learning.bigramProfiles)) {
    if (p.attempts < MIN_ATTEMPTS) continue;
    const confidence = Math.min(1, p.attempts / (MIN_ATTEMPTS * 3));
    const latencyPenalty = p.latency !== null ? Math.max(0, (p.latency - median) / median) : 0;
    out.push({
      bigram: bg,
      weakness: confidence * (p.errRate * 1.6 + latencyPenalty * 0.8),
      errRate: p.errRate,
      latency: p.latency,
      attempts: p.attempts,
    });
  }
  return out.sort((a, b) => b.weakness - a.weakness).slice(0, topN);
}

/** Trigram contexts where errors cluster: the 2 keys before a mistake + the fumbled key. */
export function topErrorContexts(learning: LearningData, topN = 3): ErrorContext[] {
  return [...learning.errorContexts]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function topConfusions(learning: LearningData, topN = 5): ConfusionPair[] {
  return [...learning.confusions]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
