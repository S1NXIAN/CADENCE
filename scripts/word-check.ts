/**
 * Word-level memory scheduler verification (Task 16).
 *
 * 1. normalizeWordKey: punctuation transforms stripped, numbers rejected
 * 2. expectedWordMs: motor-prior fallback, repeat-tap discount ("iii"),
 *    personal-latency uptake once key profiles exist
 * 3. ingest + finalize: tally math, partial skip, grade mapping
 *    (again/hard/good/easy), first-review Easy cap
 * 4. suspension dynamics: clean-fast word drops below the serving floor,
 *    failed word resurfaces once its 1m learning step elapses
 * 5. pickReviewWords: floor/pool/jitter/caps
 * 6. rankings: worst / fastest / due
 * 7. sanitizeLearning: junk keys, errors>attempts, 4000 ceiling keeps recent,
 *    mem reseed, export/import round-trip
 */
import {
  normalizeWordKey, expectedWordMs, ingestWordOutcomes, finalizeWordReviews,
  calculateWordUrgencies, pickReviewWords, collectWorstWords, collectFastestWords, collectDueWords, MIN_REVIEW_URGENCY,
} from "../src/lib/typing/word-scheduler";
import { createEmptyLearning, ingestEvents, finalizeLearning } from "../src/lib/typing/profiles";
import { exportData, importData } from "../src/lib/typing/storage";
import { sanitizeLearning } from "../src/lib/typing/sanitize";
import type { LearningData, WordOutcome } from "../src/lib/typing/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------------------
// 1. normalizeWordKey
// ---------------------------------------------------------------------------
check("normalize: 'The,' -> 'the'", normalizeWordKey("The,") === "the");
check("normalize: '\"quiet\"' -> 'quiet'", normalizeWordKey('"quiet"') === "quiet");
check("normalize: capital -> lower", normalizeWordKey("Freedom!") === "freedom");
check("normalize: apostrophe kept", normalizeWordKey("don't") === "don't");
check("normalize: hyphen kept", normalizeWordKey("e-mail.") === "e-mail");
check("normalize: number token rejected", normalizeWordKey("4821") === null);
check("normalize: empty rejected", normalizeWordKey("") === null);
check("normalize: symbol-only rejected", normalizeWordKey("...'") === null);
check("normalize: >16 chars rejected", normalizeWordKey("superextraordinary") === null);
check("normalize: plain word unchanged", normalizeWordKey("island") === "island");

// ---------------------------------------------------------------------------
// 2. expectedWordMs
// ---------------------------------------------------------------------------
const fresh = createEmptyLearning();
const medianCold = 0; // no personal data yet
const msIii = expectedWordMs("iii", fresh, medianCold);
const msThe = expectedWordMs("the", fresh, medianCold);
const msQj = expectedWordMs("qjkzx", fresh, medianCold);
check("expected 'iii' in sane band", msIii >= 50 && msIii <= 3000, `${msIii.toFixed(0)}ms`);
check("expected 'the' in sane band", msThe >= 50 && msThe <= 3000, `${msThe.toFixed(0)}ms`);
check("expected junk-row 'qjkzx' >= 'the'", msQj >= msThe, `${msQj.toFixed(0)} vs ${msThe.toFixed(0)}`);
check("expected 'iii' < 5-letter alternate word", msIii < expectedWordMs("rover", fresh, medianCold),
  `${msIii.toFixed(0)} vs ${expectedWordMs("rover", fresh, medianCold).toFixed(0)}`);
// personal data uptake: a fast observed 'h' latency lowers 'the' expectation
// (the model reads the SECOND char of each transition: t→h, h→e)
const learned = createEmptyLearning();
learned.keyProfiles["h"] = { attempts: 50, errors: 1, errRate: 0.02, latency: 70, lastSeen: 1, mem: null };
const msTheLearned = expectedWordMs("the", learned, 200);
check("expected uses personal key latency", msTheLearned < msThe, `${msTheLearned.toFixed(0)} vs ${msThe.toFixed(0)}`);

// ---------------------------------------------------------------------------
// 3. ingest + finalize
// ---------------------------------------------------------------------------
const L = createEmptyLearning();
const outcomes: WordOutcome[] = [
  { target: "the", typed: "the", ms: 800, errKeys: 0 },            // clean slow -> hard
  { target: "because", typed: "becuase", ms: 900, errKeys: 2 },    // failed -> again
  { target: "cat", typed: "cat", ms: 250, errKeys: 0 },            // clean fast, first sight -> capped good
  { target: "The,", typed: "The,", ms: 420, errKeys: 0 },          // same word (normalized) again
  { target: "1234", typed: "1234", ms: 300, errKeys: 0 },          // number: skipped
  { target: "house", typed: "hous", ms: 500, errKeys: 0, isPartial: true }, // truncated: skipped
];
const wt = ingestWordOutcomes(L, outcomes);
check("tally: 3 unique words", wt.entries.size === 3, [...wt.entries.keys()].join(","));
check("profile: 'the' attempts 2", L.wordProfiles["the"]?.attempts === 2, String(L.wordProfiles["the"]?.attempts));
check("profile: 'the' errors 0", L.wordProfiles["the"]?.errors === 0);
check("profile: 'the' bestWpm from best attempt", L.wordProfiles["the"]?.bestWpm !== null && (L.wordProfiles["the"]?.bestWpm ?? 0) > 40,
  String(L.wordProfiles["the"]?.bestWpm));
check("profile: 'because' errors 1", L.wordProfiles["because"]?.errors === 1);
check("profile: number token not tracked", L.wordProfiles["1234"] === undefined);
check("profile: partial attempt not counted", L.wordProfiles["house"] === undefined);
check("profile: lastSeen stamped", (L.wordProfiles["cat"]?.lastSeen ?? 0) > 0);
check("profile: no mem before finalize", L.wordProfiles["cat"]?.mem === null);

finalizeWordReviews(L, wt);
const memThe = L.wordProfiles["the"]!.mem!;
const memBecause = L.wordProfiles["because"]!.mem!;
const memCat = L.wordProfiles["cat"]!.mem!;
check("mem: 'the' reviewed once (clean slow -> hard)", memThe.reps === 1 && memThe.d >= 4, `reps=${memThe.reps} d=${memThe.d.toFixed(1)}`);
check("mem: 'because' reviewed (again)", memBecause.reps === 1, `reps=${memBecause.reps}`);
check("mem: 'cat' first review capped at good (no Easy rocket)", memCat.reps === 1 && memCat.s < 6, `s=${memCat.s.toFixed(2)}`);
check("mem: 'because' due soon (learning step, <10min)", memBecause.due - Date.now() < 10 * 60_000, `${((memBecause.due - Date.now()) / 1000).toFixed(0)}s`);
check("mem: 'the' not Easy-graded (slow)", memThe.d >= memCat.d, `${memThe.d.toFixed(1)} vs ${memCat.d.toFixed(1)}`);

// second review: now Easy unlocks for a clean fast attempt
const L2outcomes: WordOutcome[] = [{ target: "cat", typed: "cat", ms: 180, errKeys: 0 }];
const wt2 = ingestWordOutcomes(L, L2outcomes);
finalizeWordReviews(L, wt2);
const memCat2 = L.wordProfiles["cat"]!.mem!;
check("mem: 'cat' second fast clean review -> stability jump (easy)", memCat2.reps === 2 && memCat2.s > memCat.s * 1.5,
  `s ${memCat.s.toFixed(2)} -> ${memCat2.s.toFixed(2)}`);

// ---------------------------------------------------------------------------
// 4. suspension dynamics
// ---------------------------------------------------------------------------
// 'cat' now easy & just reviewed -> urgency below the serving floor
// 'because' failed ~3 min ago -> learning step elapsed -> due & hot
const L3 = createEmptyLearning();
L3.wordProfiles["calm"] = { attempts: 10, errors: 0, bestWpm: 110, lastSeen: Date.now(), mem: null };
const wtc = ingestWordOutcomes(L3, [{ target: "calm", typed: "calm", ms: 250, errKeys: 0 }]);
finalizeWordReviews(L3, wtc);
finalizeWordReviews(L3, ingestWordOutcomes(L3, [{ target: "calm", typed: "calm", ms: 240, errKeys: 0 }]));
const urgCalm = calculateWordUrgencies(L3).find((u) => u.word === "calm")!;
check("suspension: freshly mastered word urgency below floor", urgCalm.urgency < MIN_REVIEW_URGENCY,
  `u=${urgCalm.urgency.toFixed(3)} floor=${MIN_REVIEW_URGENCY}`);
check("suspension: mastered word retrievability high", urgCalm.retrievability > 0.9, `R=${urgCalm.retrievability.toFixed(3)}`);

const L4 = createEmptyLearning();
L4.wordProfiles["gauge"] = { attempts: 6, errors: 4, bestWpm: null, lastSeen: Date.now(), mem: null };
const wtg = ingestWordOutcomes(L4, [{ target: "gauge", typed: "guage", ms: 900, errKeys: 1 }]);
finalizeWordReviews(L4, wtg);
// backdate the review 3 minutes so the 1m learning step has elapsed
const memG = L4.wordProfiles["gauge"]!.mem!;
memG.last = Date.now() - 180_000;
memG.due = Date.now() - 120_000;
const urgGauge = calculateWordUrgencies(L4).find((u) => u.word === "gauge")!;
check("resurfacing: failed word hot after learning step", urgGauge.urgency >= MIN_REVIEW_URGENCY,
  `u=${urgGauge.urgency.toFixed(3)}`);
check("resurfacing: failed word overdue", urgGauge.dueInMs !== null && urgGauge.dueInMs < 0);

// never-reviewed word: low urgency regardless of habit (can't be 'due' unseen)
const L5 = createEmptyLearning();
L5.wordProfiles["quirk"] = { attempts: 2, errors: 2, bestWpm: null, lastSeen: Date.now(), mem: null };
const urgQuirk = calculateWordUrgencies(L5).find((u) => u.word === "quirk")!;
check("cold word (no reviews): low urgency", urgQuirk.urgency < MIN_REVIEW_URGENCY, `u=${urgQuirk.urgency.toFixed(3)}`);

// ---------------------------------------------------------------------------
// 5. pickReviewWords
// ---------------------------------------------------------------------------
const pool = new Set(["gauge", "calm", "rhythm", "sphinx"]);
const picks = pickReviewWords(L4, pool, 5);
check("serving: due word picked", picks.includes("gauge"), picks.join(","));
check("serving: respects cap", pickReviewWords(L4, pool, 0).length === 0);
const poolNoGauge = new Set(["calm"]);
check("serving: pool filter excludes off-pool words", pickReviewWords(L4, poolNoGauge, 5).length === 0);
const LETTERS = "abcdefghijkl";
const many: LearningData = createEmptyLearning();
for (let i = 0; i < 12; i++) {
  const w = `word${LETTERS[i]}`; // letters only — digits are not trackable words
  many.wordProfiles[w] = { attempts: 5, errors: 3, bestWpm: null, lastSeen: Date.now(), mem: null };
  const t = ingestWordOutcomes(many, [{ target: w, typed: w.slice(0, 1), ms: 800, errKeys: 0 }]);
  finalizeWordReviews(many, t);
  const m = many.wordProfiles[w]!.mem!;
  m.last = Date.now() - 300_000;
  m.due = Date.now() - 60_000;
}
check("serving: max bounds the queue", pickReviewWords(many, new Set(Object.keys(many.wordProfiles)), 4).length === 4);

// ---------------------------------------------------------------------------
// 6. rankings
// ---------------------------------------------------------------------------
const worst = collectWorstWords(L4, 5);
check("worst: 'gauge' ranked first", worst[0]?.word === "gauge", worst.map((w) => w.word).join(","));
check("worst: fresh 'calm' not listed (L4 lacks it)", !worst.some((w) => w.word === "calm"));
const fastest = collectFastestWords(L3, 5);
check("fastest: 'calm' ranked first with bestWpm", fastest[0]?.word === "calm" && (fastest[0]?.bestWpm ?? 0) > 100,
  fastest.map((w) => `${w.word}:${w.bestWpm?.toFixed(0)}`).join(","));
const due = collectDueWords(L4, 5);
check("due: failed word queued", due.some((w) => w.word === "gauge"));
check("due: mastered 'calm' not queued (L4 lacks it)", !due.some((w) => w.word === "calm"));

// needs >=3 attempts to rank
const L6 = createEmptyLearning();
L6.wordProfiles["hi"] = { attempts: 2, errors: 2, bestWpm: null, lastSeen: Date.now(), mem: null };
check("rank floor: <3 attempts excluded from worst", collectWorstWords(L6).length === 0);

// ---------------------------------------------------------------------------
// 7. sanitizeLearning + round-trip
// ---------------------------------------------------------------------------
const junk = sanitizeLearning({
  ...createEmptyLearning(),
  wordProfiles: {
    Good: { attempts: 2, errors: 1, bestWpm: 80, lastSeen: 5, mem: null },          // uppercase key dropped
    "x": { attempts: "9", errors: 0, bestWpm: null, lastSeen: 5 },                  // non-numeric attempts
    legit: { attempts: 7, errors: 9, bestWpm: 1e999, lastSeen: 200, mem: null },    // errors clamped to attempts
    seeded: { attempts: 6, errors: 3, bestWpm: null, lastSeen: 300 },               // mem missing -> reseeded
  },
});
check("sanitize: uppercase key dropped", junk.wordProfiles["Good"] === undefined);
check("sanitize: non-numeric attempts dropped... kept with defaults", junk.wordProfiles["x"] !== undefined && junk.wordProfiles["x"].attempts === 0);
check("sanitize: errors clamped to attempts", junk.wordProfiles["legit"]?.errors === 7 && junk.wordProfiles["legit"]?.attempts === 7);
check("sanitize: Infinity bestWpm -> null", junk.wordProfiles["legit"]?.bestWpm === null);
check("sanitize: missing mem reseeded from lifetime stats", (junk.wordProfiles["seeded"]?.mem?.reps ?? 0) > 0);
check("sanitize: version bumped to 4", junk.lastVersion === 4);

// ceiling: 4100 entries -> 4000, keeps the most recent
const ceilKey = (i: number): string => `word${String(i).split("").map((d) => LETTERS[+d]).join("")}`; // digits -> letters (word keys reject digits)
const ceiling: Record<string, unknown> = {};
for (let i = 0; i < 4100; i++) {
  const recent = i >= 100;
  ceiling[ceilKey(i)] = { attempts: 1, errors: 0, bestWpm: null, lastSeen: recent ? Date.now() + i : 1, mem: null };
}
const cappedOut = sanitizeLearning({ ...createEmptyLearning(), wordProfiles: ceiling });
check("ceiling: capped to 4000", Object.keys(cappedOut.wordProfiles).length === 4000, String(Object.keys(cappedOut.wordProfiles).length));
check("ceiling: keeps recent over stale", cappedOut.wordProfiles[ceilKey(4099)] !== undefined && cappedOut.wordProfiles[ceilKey(0)] === undefined);

// export/import round-trip preserves word memory
const rt = importData(exportData({ ...createEmptyLearning, ...{} } as never, L4, {
  history: [], personalBests: {}, dailyActivity: {}, streakDays: 0, lastTestDay: "", firstTestDay: null,
}));
check("round-trip: wordProfiles survive export/import", JSON.stringify(rt?.learning.wordProfiles) === JSON.stringify(L4.wordProfiles));

// ---------------------------------------------------------------------------
// integration sanity: adaptive test actually serves a due word
// ---------------------------------------------------------------------------
import { generateAdaptive } from "../src/lib/typing/generator";
import { reviewMem, newMemCard } from "../src/lib/typing/memory";
const LI: LearningData = createEmptyLearning();
LI.totalTests = 5;
// give the key layer some signal so hasSignal is true
LI.keyProfiles["q"] = { attempts: 40, errors: 12, errRate: 0.3, latency: 260, lastSeen: 1, mem: null };
LI.keyProfiles["q"].mem = newMemCard();
LI.keyProfiles["q"].mem = reviewMem(LI.keyProfiles["q"].mem, "again", Date.now() - 3600_000);
LI.keyProfiles["q"].mem.last = Date.now() - 3600_000;
// a chronic failed word, overdue
LI.wordProfiles["quiet"] = { attempts: 8, errors: 5, bestWpm: null, lastSeen: Date.now(), mem: null };
const wq = ingestWordOutcomes(LI, [{ target: "quiet", typed: "qiuet", ms: 900, errKeys: 2 }]);
finalizeWordReviews(LI, wq);
const mq = LI.wordProfiles["quiet"]!.mem!;
mq.last = Date.now() - 300_000;
mq.due = Date.now() - 120_000;
// a mastered word that must NOT come back
LI.wordProfiles["calm"] = { attempts: 10, errors: 0, bestWpm: 110, lastSeen: Date.now(), mem: null };
const wc = ingestWordOutcomes(LI, [{ target: "calm", typed: "calm", ms: 250, errKeys: 0 }]);
finalizeWordReviews(LI, wc);
finalizeWordReviews(LI, ingestWordOutcomes(LI, [{ target: "calm", typed: "calm", ms: 240, errKeys: 0 }]));
finalizeWordReviews(LI, ingestWordOutcomes(LI, [{ target: "calm", typed: "calm", ms: 245, errKeys: 0 }]));
let sawQuiet = 0;
let sawCalm = 0;
for (let i = 0; i < 12; i++) {
  const g = generateAdaptive(LI, 25, 65, false, false);
  sawQuiet += g.words.includes("quiet") ? 1 : 0;
  sawCalm += g.words.includes("calm") ? 1 : 0;
}
check("integration: due 'quiet' served in most adaptive tests", sawQuiet >= 8, `${sawQuiet}/12`);
check("integration: mastered 'calm' served rarely via review channel", sawCalm <= 6, `${sawCalm}/12 (flow/cover may still surface it)`);
check("integration: drills non-empty", generateAdaptive(LI, 25, 65, false, false).drills.length > 0);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
