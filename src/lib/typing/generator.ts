import { COMMON_WORDS, HARD_WORDS, QUOTES } from "./words";
import type { LearningData, Settings, TestMode, WeakKey } from "./types";
import { computeWeakKeys, weakBigrams } from "./profiles";

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

/**
 * Score a word by how much it exercises the typist's weak spots.
 */
function scoreWord(
  word: string,
  keyWeakness: Map<string, number>,
  bigramWeakness: Map<string, number>,
  topWeak: Set<string>
): number {
  let score = 0;
  for (const ch of word) {
    score += keyWeakness.get(ch) ?? 0;
  }
  for (let i = 0; i < word.length - 1; i++) {
    score += (bigramWeakness.get(word.slice(i, i + 2)) ?? 0) * 1.4;
  }
  // bonus if the word contains any of the top weak keys
  for (const k of topWeak) {
    if (word.includes(k)) score += 0.35;
  }
  return score;
}

/**
 * Adaptive curation: blend of weak-spot-heavy words + normal flow words.
 * intensity (0..100) controls the ratio.
 */
function generateAdaptive(
  learning: LearningData,
  count: number,
  intensity: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[]; focusKeys: string[] } {
  const weakKeys: WeakKey[] = computeWeakKeys(learning).slice(0, 10);
  const weakBgs = weakBigrams(learning, 12);

  const keyWeakness = new Map<string, number>();
  for (const wk of weakKeys) keyWeakness.set(wk.key, wk.weakness);
  const bgWeakness = new Map<string, number>();
  for (const wb of weakBgs) bgWeakness.set(wb.bigram, wb.weakness);
  const topWeak = new Set(weakKeys.slice(0, 4).map((w) => w.key));

  const pool = [...COMMON_WORDS, ...HARD_WORDS];
  const intensity01 = Math.max(0, Math.min(1, intensity / 100));

  // If we don't know the typist yet, fall back to a normal word test
  const hasSignal = weakKeys.length > 0 && learning.totalTests >= 1;

  const scored = pool.map((w) => ({
    word: w,
    score: hasSignal ? scoreWord(w, keyWeakness, bgWeakness, topWeak) : Math.random() * 0.1,
  }));
  scored.sort((a, b) => b.score - a.score);

  const targetDrill = Math.round(count * (0.25 + 0.55 * intensity01));
  const targetFlow = count - targetDrill;

  const words: string[] = [];

  // drill words: drawn from the highest-scored words, with randomness in top 45%
  const drillCandidates = scored.slice(0, Math.max(60, Math.floor(scored.length * 0.45)));
  const drillSet = new Set<string>();
  let guard = 0;
  while (drillSet.size < targetDrill && guard < 500) {
    const candidate = drillCandidates[rand(drillCandidates.length)].word;
    // avoid same word twice in a row
    if (words[words.length - 1] !== candidate) {
      drillSet.add(candidate);
      words.push(candidate);
    }
    guard++;
  }

  // flow words: random common words to keep rhythm natural
  const flowPool = shuffle(COMMON_WORDS);
  let fi = 0;
  while (words.length < count && fi < flowPool.length) {
    const w = flowPool[fi++];
    if (!drillSet.has(w)) words.push(w);
  }

  // interleave drill + flow for rhythm (already mixed by construction order, reshuffle lightly)
  const mixed = interleave(words, drillSet, intensity01);

  const finalWords = mixed.map((w) => {
    let out = w;
    if (withNumbers && Math.random() < 0.08) out = maybeNumber();
    if (withPunct) out = applyPunctuation(out);
    return out;
  });

  return { words: finalWords, focusKeys: weakKeys.slice(0, 3).map((w) => w.key) };
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

function generateTime(
  duration: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[] } {
  // generate plenty of words for the longest plausible duration
  const approxWords = Math.ceil((duration * 5.5) / 1.2) + 30;
  const words: string[] = [];
  while (words.length < approxWords) {
    words.push(pick(COMMON_WORDS));
  }
  return {
    words: words.map((w) => {
      let out = w;
      if (withNumbers && Math.random() < 0.08) out = maybeNumber();
      if (withPunct) out = applyPunctuation(out);
      return out;
    }),
  };
}

function generateWords(
  count: number,
  withPunct: boolean,
  withNumbers: boolean
): { words: string[] } {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    let w = pick(COMMON_WORDS);
    // avoid immediate repetition
    while (words.length > 0 && words[words.length - 1] === w) w = pick(COMMON_WORDS);
    words.push(w);
  }
  return {
    words: words.map((w) => {
      let out = w;
      if (withNumbers && Math.random() < 0.08) out = maybeNumber();
      if (withPunct) out = applyPunctuation(out);
      return out;
    }),
  };
}

function generateQuote(): { words: string[]; author: string } {
  const q = pick(QUOTES);
  return { words: q.text.split(/\s+/), author: q.author };
}

export function generateTest(settings: Settings, learning: LearningData): GeneratedTest {
  switch (settings.mode) {
    case "adaptive": {
      const { words, focusKeys } = generateAdaptive(
        learning,
        settings.wordCount,
        settings.adaptiveIntensity,
        settings.punctuation,
        settings.numbers
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
      const { words } = generateTime(settings.timeDuration, settings.punctuation, settings.numbers);
      return {
        words,
        focusKeys: [],
        label: `time ${settings.timeDuration}`,
        mode: "time",
        timeLimit: settings.timeDuration,
      };
    }
    case "words": {
      const { words } = generateWords(settings.wordCount, settings.punctuation, settings.numbers);
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
