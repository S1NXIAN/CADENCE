/**
 * Dictionary audit: pool sizes, duplicates, per-letter coverage,
 * repetition math, and adaptive set-cover drill capacity.
 * Run: bun scripts/dict-audit.ts
 */
import { COMMON_WORDS, HARD_WORDS } from "../src/lib/typing/words";
import { computeWeakKeys, collectWeakBigrams, createEmptyLearning } from "../src/lib/typing/profiles";
import { newMemCard, reviewMem } from "../src/lib/typing/memory";
import { keyPrior } from "../src/lib/typing/motor";
import type { LearningData } from "../src/lib/typing/types";

function dupes(list: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const w of list) {
    if (seen.has(w)) d.add(w);
    seen.add(w);
  }
  return [...d];
}

function countValid(list: string[]): { invalid: string[] } {
  const invalid = list.filter((w) => !/^[a-z]+$/.test(w));
  return { invalid };
}

function expectedUnique(poolSize: number, draws: number): number {
  // expected number of distinct words when drawing `draws` words uniformly with replacement
  return poolSize * (1 - Math.pow(1 - 1 / poolSize, draws));
}

function weakProfile(errRate: number, latency: number) {
  const mem0 = newMemCard();
  let mem = mem0;
  for (let i = 0; i < 4; i++) mem = reviewMem(mem, "again");
  return { attempts: 40, errors: Math.round(40 * errRate), errRate, latency, lastSeen: Date.now(), mem };
}

// synthetic learning data resembling a real intermediate typist
function learningWithSignal(): LearningData {
  const l = createEmptyLearning();
  l.totalTests = 12;
  const weak: Array<[string, number, number]> = [
    ["q", 0.28, 380], ["p", 0.22, 340], ["y", 0.19, 330], ["b", 0.15, 310],
    ["v", 0.12, 300], ["x", 0.1, 290], ["z", 0.08, 280], ["u", 0.06, 270],
  ];
  for (const [k, err, lat] of weak) {
    l.keyProfiles[k] = weakProfile(err, lat);
  }
  for (const bg of ["qu", "th", "io", "we", "yp"]) {
    l.bigramProfiles[bg] = weakProfile(0.25, 290);
  }
  return l;
}

// mirror of generateAdaptive's set-cover: how much weak-target urgency does a
// single 25-word drill actually buy, and how many distinct weak items get hit?
function setCoverCapacity(learning: LearningData) {
  const weakKeys = computeWeakKeys(learning).filter((w) => w.weakness > 0.07).slice(0, 8);
  const weakBgs = collectWeakBigrams(learning, 14).filter((w) => w.weakness > 0.07);
  const targetKeys = new Map(weakKeys.map((w) => [w.key, w.weakness]));
  const targetBgs = new Map(weakBgs.map((w) => [w.bigram, w.weakness]));

  const pool = [...new Set([...COMMON_WORDS, ...HARD_WORDS])];
  const DECAY = 0.42;
  const covBg = new Map<string, number>();
  const covKey = new Map<string, number>();
  const picked: string[] = [];
  const slots = 25;

  while (picked.length < slots) {
    let best: string | null = null;
    let bestGain = 0;
    for (const w of pool) {
      if (picked.includes(w)) continue;
      let gain = 0;
      for (let i = 0; i < w.length - 1; i++) {
        const u = targetBgs.get(w.slice(i, i + 2));
        if (u !== undefined) gain += u * Math.pow(DECAY, covBg.get(w.slice(i, i + 2)) ?? 0);
      }
      for (const ch of w) {
        const u = targetKeys.get(ch);
        if (u !== undefined) gain += u * 0.5 * Math.pow(DECAY, covKey.get(ch) ?? 0);
      }
      if (gain <= 0) continue;
      gain /= Math.sqrt(w.length);
      if (gain > bestGain) {
        bestGain = gain;
        best = w;
      }
    }
    if (best === null) break;
    picked.push(best);
    for (let i = 0; i < best.length - 1; i++) {
      const bg = best.slice(i, i + 2);
      if (targetBgs.has(bg)) covBg.set(bg, (covBg.get(bg) ?? 0) + 1);
    }
    for (const ch of best) {
      if (targetKeys.has(ch)) covKey.set(ch, (covKey.get(ch) ?? 0) + 1);
    }
  }

  const totalBgUrgency = [...targetBgs.values()].reduce((a, b) => a + b, 0);
  const totalKeyUrgency = [...targetKeys.values()].reduce((a, b) => a + b, 0);
  const gainedBg = [...covBg.entries()].reduce(
    (a, [bg, n]) => a + (targetBgs.get(bg) ?? 0) * (1 - Math.pow(DECAY, n)) / (1 - DECAY),
    0
  );
  const gainedKey = [...covKey.entries()].reduce(
    (a, [ch, n]) => a + (targetKeys.get(ch) ?? 0) * 0.5 * (1 - Math.pow(DECAY, n)) / (1 - DECAY),
    0
  );
  return {
    drillWords: picked.length,
    sample: picked.slice(0, 8),
    bigramsHit: covBg.size,
    bigramsTotal: targetBgs.size,
    keysHit: covKey.size,
    keysTotal: targetKeys.size,
    coveragePct: Math.round(
      ((gainedBg + gainedKey) / Math.max(1e-9, totalBgUrgency + 0.5 * totalKeyUrgency)) * 100
    ),
  };
}

// ---- report ----
const commonDupes = dupes(COMMON_WORDS);
const hardDupes = dupes(HARD_WORDS);
const commonUnique = new Set(COMMON_WORDS).size;
const hardUnique = new Set(HARD_WORDS).size;
const overlap = [...new Set(COMMON_WORDS)].filter((w) => new Set(HARD_WORDS).has(w));
const validCommon = countValid(COMMON_WORDS);
const validHard = countValid(HARD_WORDS);

console.log("=== POOL SIZES ===");
console.log(`COMMON_WORDS: ${COMMON_WORDS.length} entries, ${commonUnique} unique${commonDupes.length ? ` | DUPLICATES: ${commonDupes.join(", ")}` : ""}`);
console.log(`HARD_WORDS:   ${HARD_WORDS.length} entries, ${hardUnique} unique${hardDupes.length ? ` | DUPLICATES: ${hardDupes.join(", ")}` : ""}`);
console.log(`cross-list overlap (in both): ${overlap.length ? overlap.join(", ") : "none"}`);
if (validCommon.invalid.length) console.log(`INVALID COMMON: ${validCommon.invalid.slice(0, 20).join(", ")}${validCommon.invalid.length > 20 ? ` (+${validCommon.invalid.length - 20} more)` : ""}`);
if (validHard.invalid.length) console.log(`INVALID HARD: ${validHard.invalid.join(", ")}`);

console.log("\n=== PER-LETTER COVERAGE (words containing letter, common+hard unique) ===");
const pool = [...new Set([...COMMON_WORDS, ...HARD_WORDS])];
const letters = "abcdefghijklmnopqrstuvwxyz".split("");
const coverage = letters.map((ch) => ({ ch, n: pool.filter((w) => w.includes(ch)).length }));
const sorted = [...coverage].sort((a, b) => a.n - b.n);
console.log(`rarest: ${sorted.slice(0, 8).map((c) => `${c.ch}:${c.n}`).join("  ")}`);
console.log(`median: ${sorted[Math.floor(sorted.length / 2)].n}   most: ${sorted.slice(-4).map((c) => `${c.ch}:${c.n}`).join("  ")}`);
const zero = coverage.filter((c) => c.n === 0).map((c) => c.ch);
if (zero.length) console.log(`!! letters with ZERO words: ${zero.join(", ")}`);

console.log("\n=== REPETITION MATH (expected distinct words per test) ===");
for (const draws of [25, 50, 100]) {
  const u = expectedUnique(commonUnique, draws);
  console.log(`words ${draws}: expect ${u.toFixed(1)} distinct from ${commonUnique} common (~${(draws - u).toFixed(1)} repeats)`);
}
for (const sec of [30, 60, 120]) {
  const draws = Math.round((sec * 5.5) / 1.2); // mirrors generateTime's approxWords
  const u = expectedUnique(commonUnique, draws);
  console.log(`time ${sec}s (~${draws} words): expect ${u.toFixed(0)} distinct (~${(draws - u).toFixed(0)} repeats, ${(((draws - u) / draws) * 100).toFixed(0)}% repeated)`);
}

console.log("\n=== ADAPTIVE SET-COVER CAPACITY (intermediate typist, weak q/p/y/b/v/x/z/u) ===");
const cap = setCoverCapacity(learningWithSignal());
console.log(`drill words in a 25-word test: ${cap.drillWords}`);
console.log(`weak bigrams covered: ${cap.bigramsHit}/${cap.bigramsTotal}   weak keys covered: ${cap.keysHit}/${cap.keysTotal}`);
console.log(`weighted urgency coverage: ~${cap.coveragePct}%`);
console.log(`sample drill words: ${cap.sample.join(" ")}`);

console.log("\n=== MOTOR PRIORS (cold-start ranking) ===");
const priorRank = letters
  .map((ch) => ({ ch, rel: keyPrior(ch).err / 0.035 }))
  .sort((a, b) => b.rel - a.rel);
console.log(`hardest: ${priorRank.slice(0, 6).map((p) => `${p.ch}(${p.rel.toFixed(2)})`).join("  ")}`);
console.log(`easiest: ${priorRank.slice(-5).map((p) => `${p.ch}(${p.rel.toFixed(2)})`).join("  ")}`);
