import type { LearningData, Settings, TestMode } from "./types";
import { calculateBigramUrgencies, calculateKeyUrgencies } from "./profiles";
import { pickReviewWords } from "./word-scheduler";
import { getAdaptivePool, getCommonPool, getQuotes } from "./pool";

export interface GeneratedTest {
  words: string[];
  focusKeys: string[];
  label: string;
  mode: TestMode;
  /** time mode duration; null for word-based modes */
  timeLimit: number | null;
}

function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

function pick<T>(arr: T[]): T {
  return arr[rand(arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyPunctuation(word: string): string {
  const r = Math.random();
  if (r < 0.06) return word.charAt(0).toUpperCase() + word.slice(1);
  if (r < 0.1) return word + ",";
  if (r < 0.115) return word + ".";
  if (r < 0.125) return word + "?";
  if (r < 0.13) return word + "!";
  if (r < 0.136) return word + ";";
  if (r < 0.14) {
    const open = Math.random() < 0.5;
    return open ? `"${word}` : `${word}"`;
  }
  return word;
}

function maybeNumber(): string {
  return String(Math.floor(Math.random() * 9000) + 10);
}

function withTransforms(words: string[], withPunct: boolean, withNumbers: boolean): string[] {
  return words.map((w) => {
    let out = w;
    if (withNumbers && Math.random() < 0.08) out = maybeNumber();
    if (withPunct) out = applyPunctuation(out);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Set-cover curation.
//
// The old approach *ranked* words by weakness and sampled the top slice —
// rare-but-weak bigrams starved because few words contain them. The set-cover
// approach flips the objective: pick the word whose UNCOVERED weak-bigram
// gain is highest, right now, with diminishing returns per repeat coverage.
// Every drill slot buys the most useful new coverage, so even a bigram that
// lives in only three English words gets those words into the test.
// ---------------------------------------------------------------------------

const COVERAGE_DECAY = 0.42; // 2nd coverage of the same target ≈ 42% of its gain
const KEY_GAIN_SHARE = 0.5; // per-key targets weigh half of per-bigram targets
const MIN_URGENCY = 0.07; // below this an item isn't worth targeted drilling
const JITTER = 0.5; // randomization on gain so consecutive tests differ

function greedyCover(
  pool: string[],
  targetKeys: Map<string, number>,
  targetBgs: Map<string, number>,
  slots: number
): string[] {
  const covBg = new Map<string, number>();
  const covKey = new Map<string, number>();
  const picked: string[] = [];
  const pickedSet = new Set<string>();

  // Precompute each word's target contributions ONCE (per test) instead of
  // rescanning every bigram/char of the full pool on every slot. With a ~12k
  // pool and 100-word tests this removes ~95% of the cover-loop work; words
  // with zero target hits never enter the candidate list at all.
  //   kind 0 = bigram target, kind 1 = key target (already × KEY_GAIN_SHARE)
  interface Hit { k: 0 | 1; id: string; u: number }
  const candidates: Array<{ w: string; hits: Hit[]; invSqrtLen: number }> = [];
  for (const w of pool) {
    const hits: Hit[] = [];
    for (let i = 0; i < w.length - 1; i++) {
      const u = targetBgs.get(w.slice(i, i + 2));
      if (u !== undefined) hits.push({ k: 0, id: w.slice(i, i + 2), u });
    }
    if (targetKeys.size) {
      for (const ch of w) {
        const u = targetKeys.get(ch);
        if (u !== undefined) hits.push({ k: 1, id: ch, u: u * KEY_GAIN_SHARE });
      }
    }
    if (hits.length) candidates.push({ w, hits, invSqrtLen: 1 / Math.sqrt(w.length) });
  }

  while (picked.length < slots) {
    let best: string | null = null;
    let bestGain = 0;

    for (const c of candidates) {
      if (pickedSet.has(c.w)) continue;
      let gain = 0;
      for (const h of c.hits) {
        const cov = h.k === 0 ? covBg.get(h.id) : covKey.get(h.id);
        gain += h.u * Math.pow(COVERAGE_DECAY, cov ?? 0);
      }
      // efficiency: dense coverage per keystroke beats long words that pad
      gain *= c.invSqrtLen;
      // jitter keeps consecutive tests from converging on identical picks
      gain *= 1 - JITTER / 2 + Math.random() * JITTER;
      if (gain > bestGain) {
        bestGain = gain;
        best = c.w;
      }
    }

    if (best === null || bestGain <= 1e-6) break; // all targets covered

    picked.push(best);
    pickedSet.add(best);
    for (let i = 0; i < best.length - 1; i++) {
      const bg = best.slice(i, i + 2);
      if (targetBgs.has(bg)) covBg.set(bg, (covBg.get(bg) ?? 0) + 1);
    }
    for (const ch of best) {
      if (targetKeys.has(ch)) covKey.set(ch, (covKey.get(ch) ?? 0) + 1);
    }
  }
  return picked;
}

function sampleFlow(common: string[], count: number, exclude: Set<string>): string[] {
  const out: string[] = [];
  const flow = shuffle(common);
  let i = 0;
  let guard = 0;
  while (out.length < count && i < flow.length && guard < count * 40) {
    const w = flow[i++];
    guard++;
    if (exclude.has(w)) continue;
    if (out.length > 0 && out[out.length - 1] === w) continue;
    out.push(w);
    exclude.add(w);
  }
  // ultra-small pool fallback: allow repeats rather than come up short
  while (out.length < count && common.length > 0) {
    const w = pick(common);
    if (out.length > 0 && out[out.length - 1] === w) continue;
    out.push(w);
  }
  return out;
}

function interleave(words: string[], drillSet: Set<string>, intensity01: number): string[] {
  // When intensity is high, keep weak-word clusters tighter (more drilling);
  // when low, spread them out for natural flow.
  const drills = words.filter((w) => drillSet.has(w));
  const flow = words.filter((w) => !drillSet.has(w));
  const out: string[] = [];
  const cluster = intensity01 > 0.6 ? 2 : 1;
  let di = 0;
  let fi = 0;
  while (out.length < words.length) {
    for (let c = 0; c < cluster && di < drills.length; c++) out.push(drills[di++]);
    if (fi < flow.length) out.push(flow[fi++]);
    if (di >= drills.length && fi >= flow.length) break;
  }
  return out;
}

/**
 * Adaptive curation, v2: FSRS urgency ranks the targets, greedy weighted
 * set-cover buys maximal weak-spot coverage per test, flow words keep the
 * rhythm natural. intensity (0..100) controls the drill/flow ratio.
 * Exported (with the drill partition) for probe/test tooling.
 */
/** review words take at most this share of the drill budget (rest = set-cover) */
const REVIEW_SHARE = 0.45;
const REVIEW_HARD_CAP = 8;

export function generateAdaptive(
  learning: LearningData,
  count: number,
  intensity: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[]; focusKeys: string[]; drills: string[] } {
  const urgentKeys = calculateKeyUrgencies(learning).filter((u) => u.urgency > MIN_URGENCY).slice(0, 8);
  const urgentBgs = calculateBigramUrgencies(learning).filter((u) => u.urgency > MIN_URGENCY).slice(0, 14);
  const hasSignal = learning.totalTests >= 1 && (urgentKeys.length > 0 || urgentBgs.length > 0);

  const pool = getAdaptivePool();
  const common = getCommonPool();
  const intensity01 = Math.max(0, Math.min(1, intensity / 100));

  let words: string[] = [];
  let focusKeys: string[] = [];
  let drills: string[] = [];

  if (!hasSignal) {
    // calibration run: plain sample from the pool
    words = sampleFlow(pool, count, new Set());
  } else {
    const targetKeys = new Map(urgentKeys.map((u) => [u.key, u.urgency]));
    const targetBgs = new Map(urgentBgs.map((u) => [u.bigram, u.urgency]));
    const targetDrill = Math.round(count * (0.25 + 0.55 * intensity01));

    // Word-review channel: FSRS-due words (recently failed, chronic, or stale)
    // reserve a slice of the drill budget. Suspension applies ONLY here — the
    // set-cover picks below ignore word memory, so a word needed to drill a
    // weak key is served regardless of its own "easy" state.
    const reviewSlots = Math.min(Math.round(targetDrill * REVIEW_SHARE), REVIEW_HARD_CAP);
    const reviews = pickReviewWords(learning, new Set(pool), reviewSlots);
    const reviewSet = new Set(reviews);
    const cover = greedyCover(pool, targetKeys, targetBgs, Math.max(0, targetDrill - reviews.length));
    // cover may pick a due word on bigram merit — dedupe without double-serving
    drills = [...reviews, ...cover.filter((w) => !reviewSet.has(w))];
    focusKeys = urgentKeys.slice(0, 3).map((u) => u.key);

    // sampleFlow ADDS its picks to the exclude set it receives (to avoid
    // duplicates) — pass a COPY so drillSet stays the pure drill partition
    // that interleave needs. Sharing it used to collapse the partition (every
    // word looked like a drill) and interleave degenerated to a no-op, which
    // bunched all drill words into one leading block.
    const drillSet = new Set(drills);
    const flow = sampleFlow(common, count - drills.length, new Set(drillSet));
    words = interleave([...drills, ...flow], drillSet, intensity01);
  }

  return { words: withTransforms(words, withPunct, withNumbers), focusKeys, drills };
}

function generateTime(
  duration: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[] } {
  // generate plenty of words for the longest plausible duration
  const approxWords = Math.ceil((duration * 5.5) / 1.2) + 30;
  const pool = getCommonPool();
  const words: string[] = [];
  for (let i = 0; i < approxWords; i++) {
    let w = pick(pool);
    // avoid immediate repetition (same guard as generateWords)
    while (words.length > 0 && words[words.length - 1] === w) w = pick(pool);
    words.push(w);
  }
  return { words: withTransforms(words, withPunct, withNumbers) };
}

function generateWords(
  count: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[] } {
  const pool = getCommonPool();
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    let w = pick(pool);
    // avoid immediate repetition
    while (words.length > 0 && words[words.length - 1] === w) w = pick(pool);
    words.push(w);
  }
  return { words: withTransforms(words, withPunct, withNumbers) };
}

function generateQuote(): { words: string[]; author: string } {
  const q = pick(getQuotes());
  return { words: q.text.split(/\s+/), author: q.author };
}

export function generateTest(settings: Settings, learning: LearningData): GeneratedTest {
  switch (settings.mode) {
    case "adaptive": {
      const { words, focusKeys } = generateAdaptive(
        learning,
        settings.wordCount,
        settings.adaptiveIntensity,
        settings.hasPunctuation,
        settings.hasNumbers
      );
      return {
        words,
        focusKeys,
        label: `adaptive ${settings.wordCount}`,
        mode: "adaptive",
        timeLimit: null,
      };
    }
    case "time": {
      const { words } = generateTime(settings.timeDuration, settings.hasPunctuation, settings.hasNumbers);
      return {
        words,
        focusKeys: [],
        label: `time ${settings.timeDuration}`,
        mode: "time",
        timeLimit: settings.timeDuration,
      };
    }
    case "words": {
      const { words } = generateWords(settings.wordCount, settings.hasPunctuation, settings.hasNumbers);
      return {
        words,
        focusKeys: [],
        label: `words ${settings.wordCount}`,
        mode: "words",
        timeLimit: null,
      };
    }
    case "quote": {
      const { words, author } = generateQuote();
      return {
        words,
        focusKeys: [],
        label: `quote · ${author}`,
        mode: "quote",
        timeLimit: null,
      };
    }
  }
}
