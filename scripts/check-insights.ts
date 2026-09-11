/**
 * Coach engine v2 probe — fabricates keystroke logs / samples / learning state
 * for distinct player archetypes and prints the notes the coach produces.
 * Run: bun scripts/check-insights.ts
 */
import { generateInsights, nextTestPreview } from "../src/lib/typing/insights";
import { emptyLearning } from "../src/lib/typing/profiles";
import { newMemCard, reviewMem } from "../src/lib/typing/memory";
import type { CharEvent, LearningData, Settings, StatsData, TestResult } from "../src/lib/typing/types";
import { DEFAULT_SETTINGS } from "../src/lib/typing/types";

function profile(attempts: number, errRate: number, latency: number) {
  const mem0 = newMemCard();
  let mem = mem0;
  for (let i = 0; i < 3; i++) mem = reviewMem(mem, errRate > 0.05 ? "again" : "good");
  return { attempts, errors: Math.round(attempts * errRate), errRate, latency, lastSeen: Date.now(), mem };
}

function ev(t: number, expected: string | null, typed: string, correct: boolean): CharEvent {
  return { t, expected, typed, correct };
}

/** Type a word list into events; injects errors at the given global char indexes. */
function typeWords(
  words: string[],
  opts: { msPerChar?: number; errorAt?: number[]; missAt?: number[]; extraAfter?: number[]; pauseBeforeIdx?: number }
): CharEvent[] {
  const events: CharEvent[] = [];
  const ms = opts.msPerChar ?? 150;
  let t = 400;
  let charIdx = 0;
  const errorAt = new Set(opts.errorAt ?? []);
  const missAt = new Set(opts.missAt ?? []);
  const extraAfter = new Set(opts.extraAfter ?? []);
  for (const w of words) {
    for (let i = 0; i < w.length; i++) {
      const expected = w[i];
      if (errorAt.has(charIdx)) {
        const wrong = expected === "e" ? "r" : expected === "o" ? "i" : "k";
        events.push(ev(t, expected, wrong, false));
      } else if (missAt.has(charIdx)) {
        events.push(ev(t, expected, "", false));
      } else {
        events.push(ev(t, expected, expected, true));
      }
      t += ms;
      charIdx++;
    }
    if (extraAfter.has(charIdx - 1)) events.push(ev(t, null, "x", false));
    events.push(ev(t, " ", " ", true));
    t += ms;
    if (opts.pauseBeforeIdx !== undefined && charIdx === opts.pauseBeforeIdx) t += 1200;
  }
  return events;
}

/** Build cumulative samples from per-second instantaneous wpm + error counts. */
function samples(instWpm: number[], errors: { second: number; errors: number }[]) {
  const errMap = new Map(errors.map((e) => [e.second, e.errors]));
  let cumChars = 0;
  let cumCorrect = 0;
  const out: TestResult["samples"] = [];
  for (let k = 1; k <= instWpm.length; k++) {
    const contributed = instWpm[k - 1] / 12; // chars this second
    cumChars += contributed;
    cumCorrect += contributed * 0.95;
    out.push({
      second: k,
      wpm: Math.round((cumCorrect * 12) / k),
      raw: Math.round((cumChars * 12) / k),
      errors: errMap.get(k) ?? 0,
    });
  }
  return out;
}

function baseResult(partial: Partial<TestResult>): TestResult {
  return {
    id: `probe-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    mode: "adaptive",
    modeLabel: "adaptive 25",
    wpm: 0,
    rawWpm: 0,
    accuracy: 100,
    consistency: 50,
    duration: 30,
    chars: { correct: 300, incorrect: 4, extra: 1, missed: 1 },
    samples: [],
    focusKeys: [],
    isPersonalBest: false,
    ...partial,
  };
}

function baseStats(history: TestResult[] = []): StatsData {
  return { history, personalBests: {}, dailyActivity: {}, streakDays: 3, lastTestDay: "", firstTestDay: null };
}

function show(name: string, notes: ReturnType<typeof generateInsights>) {
  console.log(`\n=== ${name} (${notes.length} notes) ===`);
  for (const n of notes) {
    console.log(`  [${n.kind}] ${n.title ?? ""} | ${n.message}${n.metric ? `  ⟨${n.metric}⟩` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — sloppy: error tax, fade, error cluster, focus slips, confusion
// ---------------------------------------------------------------------------
const sloppyWords = "the quick brown fox jumps over the lazy dog while typing fast".split(" ");
const sloppyEvents = typeWords(sloppyWords, {
  msPerChar: 160,
  errorAt: [2, 23, 27, 44, 45], // 2,23,27 are 'e' — a focus key this test targeted
  missAt: [12],
  extraAfter: [20],
  pauseBeforeIdx: 22,
});
const sloppyResult = baseResult({
  wpm: 62,
  rawWpm: 78,
  accuracy: 88.4,
  consistency: 54,
  duration: 38,
  chars: { correct: 340, incorrect: 14, extra: 5, missed: 6 },
  samples: samples(
    Array.from({ length: 38 }, (_, i) => (i < 12 ? 80 : i < 24 ? 70 : 58)),
    [{ second: 20, errors: 2 }, { second: 21, errors: 2 }, { second: 10, errors: 1 }]
  ),
  focusKeys: ["e", "a"],
  isPersonalBest: false,
});
const sloppyLearning = emptyLearning();
sloppyLearning.totalTests = 5;
sloppyLearning.confusions.push({ expected: "e", typed: "r", count: 4, lastSeen: Date.now() });
sloppyLearning.keyProfiles["e"] = profile(40, 0.09, 220);
show("sloppy (fade + cluster + slips)", generateInsights(sloppyResult, sloppyEvents, baseStats(), sloppyLearning, DEFAULT_SETTINGS));

// ---------------------------------------------------------------------------
// Scenario 2 — clean PB: speed push territory
// ---------------------------------------------------------------------------
const pbResult = baseResult({
  wpm: 82,
  rawWpm: 84,
  accuracy: 98.6,
  consistency: 81,
  duration: 30,
  samples: samples(Array.from({ length: 30 }, () => 84), []),
  isPersonalBest: true,
});
show("clean PB", generateInsights(pbResult, [], baseStats(), emptyLearning(), DEFAULT_SETTINGS, { wpm: 76, accuracy: 97, timestamp: Date.now() - 8e6 }));

// ---------------------------------------------------------------------------
// Scenario 3 — cold start, first ever test
// ---------------------------------------------------------------------------
const firstResult = baseResult({ wpm: 41, rawWpm: 44, accuracy: 93.2, isPersonalBest: true, duration: 25 });
show(
  "cold start (baseline + nudge)",
  generateInsights(firstResult, [], baseStats(), emptyLearning(), { ...DEFAULT_SETTINGS, mode: "time" })
);

// ---------------------------------------------------------------------------
// Scenario 4 — near-miss PB + slow keys + hesitation
// ---------------------------------------------------------------------------
const slowLearning = emptyLearning();
slowLearning.totalTests = 9;
slowLearning.keyProfiles["a"] = profile(120, 0.01, 150);
slowLearning.keyProfiles["s"] = profile(110, 0.01, 155);
slowLearning.keyProfiles["d"] = profile(100, 0.01, 150);
const slowEvents = typeWords("a salad was as a lad had a salad".split(" "), { msPerChar: 340 });
const nearMissResult = baseResult({
  wpm: 79,
  rawWpm: 81,
  accuracy: 96.9,
  consistency: 76,
  duration: 30,
  samples: samples(Array.from({ length: 30 }, () => 81), []),
});
show(
  "near-miss PB + slow keys",
  generateInsights(nearMissResult, slowEvents, baseStats(), slowLearning, DEFAULT_SETTINGS, { wpm: 80, accuracy: 97, timestamp: Date.now() - 4e6 })
);

// ---------------------------------------------------------------------------
// Scenario 5 — idle preview with due queue
// ---------------------------------------------------------------------------
const previewLearning = emptyLearning();
previewLearning.totalTests = 6;
previewLearning.keyProfiles["j"] = profile(50, 0.08, 240);
previewLearning.keyProfiles["u"] = profile(55, 0.07, 235);
previewLearning.bigramProfiles["ju"] = profile(20, 0.09, 300);
for (let i = 0; i < 8; i++) {
  const k = String.fromCharCode(97 + i);
  previewLearning.keyProfiles[k] = profile(60, 0.01, 150);
  if (previewLearning.keyProfiles[k].mem) previewLearning.keyProfiles[k].mem!.due = Date.now();
}
console.log("\n=== idle preview (due queue) ===");
console.log(nextTestPreview(previewLearning, "adaptive"));
console.log(nextTestPreview(emptyLearning(), "adaptive"));

// ---------------------------------------------------------------------------
// Sanity assertions
// ---------------------------------------------------------------------------
const s1 = generateInsights(sloppyResult, sloppyEvents, baseStats(), sloppyLearning, DEFAULT_SETTINGS);
const kinds = s1.map((n) => n.kind);
const nonTip = kinds.filter((k) => k !== "tip");
const all = [...s1];
console.log("\n=== assertions ===");
console.log("max 4 notes:", s1.length <= 4);
console.log("every note has message:", all.every((n) => n.message.length > 10));
console.log("no non-tip kind dupes:", new Set(nonTip).size === nonTip.length);
console.log("sloppy has speed/error-tax note:", kinds.includes("speed"));
console.log("sloppy has accuracy note:", kinds.includes("accuracy"));
console.log("sloppy has focus-slip note:", kinds.includes("focus") && s1.some((n) => n.message.includes("slipped 3")));
console.log("sloppy has error-diagnosis or rhythm note:", kinds.includes("error") || kinds.includes("rhythm"));
