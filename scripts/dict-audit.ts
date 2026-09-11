/**
 * Dictionary audit: pool sizes, duplicates, per-letter coverage,
 * repetition math, and adaptive drill-pool capacity.
 * Run: bun scripts/dict-audit.ts
 */
import { COMMON_WORDS, HARD_WORDS } from "../src/lib/typing/words";
import { computeWeakKeys, weakBigrams, emptyLearning } from "../src/lib/typing/profiles";
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

// synthetic learning data resembling a real intermediate typist
function learningWithSignal(): LearningData {
  const l = emptyLearning() as LearningData;
  l.totalTests = 12;
  const weak: Array<[string, number, number]> = [
    ["q", 0.28, 380], ["p", 0.22, 340], ["y", 0.19, 330], ["b", 0.15, 310],
    ["v", 0.12, 300], ["x", 0.1, 290], ["z", 0.08, 280], ["u", 0.06, 270],
  ];
  for (const [k, err, lat] of weak) {
    l.keyProfiles[k] = { attempts: 40, errRate: err, latency: lat, lastSeen: Date.now() };
  }
  for (const bg of ["qu", "th", "io", "we", "yp"]) {
    l.bigramProfiles[bg] = { attempts: 30, errRate: 0.25, latency: 290, lastSeen: Date.now() };
  }
  return l;
}

function drillCandidateCount(learning: LearningData): { candidates: number; distinct: number } {
  // mirrors generateAdaptive's drill-candidate selection
  const weakKeys = computeWeakKeys(learning).slice(0, 10);
  const weakBgs = weakBigrams(learning, 12);
  const keyWeakness = new Map(weakKeys.map((w) => [w.key, w.weakness]));
  const bgWeakness = new Map(weakBgs.map((w) => [w.bigram, w.weakness]));
  const topWeak = new Set(weakKeys.slice(0, 4).map((w) => w.key));
  const pool = [...COMMON_WORDS, ...HARD_WORDS];
  const scored = pool.map((w) => {
    let score = 0;
    for (const ch of w) score += keyWeakness.get(ch) ?? 0;
    for (let i = 0; i < w.length - 1; i++) score += (bgWeakness.get(w.slice(i, i + 2)) ?? 0) * 1.4;
    for (const k of topWeak) if (w.includes(k)) score += 0.35;
    return { word: w, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, Math.max(60, Math.floor(scored.length * 0.45)));
  return { candidates: candidates.length, distinct: new Set(candidates.map((c) => c.word)).size };
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
if (validCommon.invalid.length) console.log(`INVALID COMMON: ${validCommon.invalid.join(", ")}`);
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

console.log("\n=== ADAPTIVE DRILL CAPACITY (intermediate typist, weak q/p/y/b/v/x/z/u) ===");
const dc = drillCandidateCount(learningWithSignal());
console.log(`drill candidate window: ${dc.candidates} entries, ${dc.distinct} distinct`);
for (const ch of ["q", "x", "z", "j", "v", "k"]) {
  console.log(`words containing '${ch}': ${pool.filter((w) => w.includes(ch)).length}`);
}
