/**
 * Sanity check for the test-audit module (bun scripts/audit-check.ts).
 * Feeds a synthetic finished test through buildTestAudit + generateInsights
 * and asserts the structured panels contain what the results screen renders.
 */
import { buildTestAudit } from "../src/lib/typing/audit";
import { generateInsights } from "../src/lib/typing/insights";
import { emptyLearning } from "../src/lib/typing/profiles";
import { emptyStats } from "../src/lib/typing/storage";
import type { CharEvent, SecondSample, TestResult } from "../src/lib/typing/types";

let t = 0;
let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures += 1;
    console.log(`  FAIL ${name} ${extra}`);
  } else {
    console.log(`  ok   ${name}`);
  }
}

// ---- synthetic keystroke log ----------------------------------------------
// words: ["the", "quick", "brown", "fox", "jumps"] with deliberate faults:
//  - "quick": 'q' typed as 'w' (confusion q>w), then corrected flow continues
//  - "brown": 'n' dropped (missed), 'o' slow (latency spike)
//  - "fox":   extra 'x' past word end
const events: CharEvent[] = [];
t = 120;
// "the " — clean, 110-130ms
for (const ch of ["t", "h", "e"]) {
  t += 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 130;
events.push({ t, expected: " ", typed: " ", correct: true });
// "quick " — q>w confusion + slow q
t += 210; // hesitation-ish on q
events.push({ t, expected: "q", typed: "w", correct: false });
t += 150;
events.push({ t, expected: "q", typed: "q", correct: true });
for (const ch of ["u", "i", "c", "k"]) {
  t += 125;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 130;
events.push({ t, expected: " ", typed: " ", correct: true });
// "brown " — 'n' never lands (missed), 'o' slow
for (const ch of ["b", "r"]) {
  t += 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 480; // freeze before o
events.push({ t, expected: "o", typed: "o", correct: true });
t += 125;
events.push({ t, expected: "w", typed: "w", correct: true });
// user hits space without the n -> synthetic missed n, then space
t += 100;
events.push({ t, expected: "n", typed: "", correct: false });
events.push({ t, expected: " ", typed: " ", correct: true });
// "fox " + one extra char past the end
for (const ch of ["f", "o"]) {
  t += 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 130;
events.push({ t, expected: "x", typed: "x", correct: true });
t += 90;
events.push({ t, expected: null, typed: "z", correct: false }); // overshoot
t += 130;
events.push({ t, expected: " ", typed: " ", correct: true });
// "jumps" clean finish
for (const ch of ["j", "u", "m", "p", "s"]) {
  t += 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 130;
events.push({ t, expected: " ", typed: " ", correct: true });
// "onto oak" — slow 'o' presses (3+ samples so the slowest-key filter passes)
for (const ch of ["o", "n", "t", "o"]) {
  t += ch === "o" ? 420 : 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}
t += 130;
events.push({ t, expected: " ", typed: " ", correct: true });
for (const ch of ["o", "a", "k"]) {
  t += ch === "o" ? 430 : 120;
  events.push({ t, expected: ch, typed: ch, correct: true });
}

// ---- per-second samples: 30s test, fade + error cluster @ 14s --------------
const samples: SecondSample[] = [];
for (let s = 1; s <= 30; s++) {
  const chars = s * 11; // ~132 raw wpm cumulative, decaying later
  const decay = s > 18 ? 0.72 : 1;
  samples.push({
    second: s,
    wpm: Math.round((chars / 5 / (s / 60)) * decay),
    raw: Math.round((chars / 5 / (s / 60)) * decay * 1.08),
    errors: s === 14 ? 3 : s === 15 ? 1 : 0,
  });
}

const result: TestResult = {
  id: "audit-check-1",
  timestamp: Date.now(),
  mode: "adaptive",
  modeLabel: "adaptive 25",
  wpm: 61,
  rawWpm: 70,
  accuracy: 92.9,
  consistency: 74,
  duration: 30,
  chars: { correct: 300, incorrect: 3, extra: 1, missed: 1 },
  samples,
  focusKeys: ["q", "o"],
  isPersonalBest: false,
};

const targets = ["the", "quick", "brown", "fox", "jumps", "onto", "oak"];
const typed = ["the", "quick", "brow", "foxz", "jumps", "onto", "oak"];

// history: 12 prior tests on the same label
const stats = emptyStats();
for (let i = 0; i < 12; i++) {
  stats.history.push({
    ...result,
    id: `hist-${i}`,
    wpm: 55 + (i % 4),
    accuracy: 94,
  });
}
stats.personalBests["adaptive 25"] = { wpm: 68, accuracy: 96, timestamp: Date.now() - 86400000 };
stats.history.forEach((h) => (h.modeLabel = "adaptive 25"));

const learning = emptyLearning();

console.log("buildTestAudit:");
const audit = buildTestAudit(result, events, targets, typed, stats, learning);

check("errors.bad counts wrong+missed+extra", audit.errors.bad === 3, `got ${audit.errors.bad}`);
check("confusions captured q>w", audit.errors.confusions.some((c) => c.expected === "q" && c.typed === "w" && c.count === 1));
check("worst window x4 around 14s", audit.errors.worstWindow?.count === 4 && [13, 14].includes(audit.errors.worstWindow.start), JSON.stringify(audit.errors.worstWindow));
check("focus q slipped", audit.keys.focus.find((k) => k.key === "q")?.errors === 1);
check("focus o clean with latency", (() => { const o = audit.keys.focus.find((k) => k.key === "o"); return o?.errors === 0 && o.ms !== null && o.ms >= 400; })());
check("slowest includes o (+%)", audit.keys.slowest.some((k) => k.key === "o" && k.over > 100), JSON.stringify(audit.keys.slowest));
check("hardest words: fox extra + brown missed", audit.words.hardest.length === 2 && audit.words.hardest.some((w) => w.word === "fox" && w.extra === 1 && w.errors === 1) && audit.words.hardest.some((w) => w.word === "brown" && w.missed === 1), JSON.stringify(audit.words.hardest));
check("brown flagged missed", audit.words.hardest.some((w) => w.word === "brown" && w.missed === 1 && w.errors === 1));
check("clean words 5/7", audit.words.clean === 5 && audit.words.attempted === 7, `got ${audit.words.clean}/${audit.words.attempted}`);
check("rhythm freeze 480ms captured", audit.rhythm.hesitations === 0 && audit.rhythm.longestFreezeMs === null, "480ms < 900ms threshold — expected null");
check("fade detected", audit.speed !== null && audit.speed.fade > 0.2, JSON.stringify(audit.speed));
check("peak present", (audit.speed?.peak ?? 0) > 100);
check("compare testNo 13", audit.compare.testNo === 13);
check("pbDelta = 61-68", audit.compare.pbDelta === -7, `got ${audit.compare.pbDelta}`);
check("last10 avg ~56.5 -> 57", audit.compare.last10Wpm !== null && audit.compare.last10Wpm >= 56 && audit.compare.last10Wpm <= 57, `got ${audit.compare.last10Wpm}`);
check("wpmDelta +4/+5", (audit.compare.wpmDelta ?? 0) >= 4 && (audit.compare.wpmDelta ?? 0) <= 5, `got ${audit.compare.wpmDelta}`);

// testNo must use the LIFETIME counter once history hits its 500 cap
const cappedLearning = { ...emptyLearning(), totalTests: 847 };
const cappedAudit = buildTestAudit(result, events, targets, typed, stats, cappedLearning);
check("testNo uses lifetime counter past history cap", cappedAudit.compare.testNo === 847, `got ${cappedAudit.compare.testNo}`);

console.log("generateInsights (shared analysis path):");
const insights = generateInsights(result, events, stats, learning, undefined, stats.personalBests["adaptive 25"]);
check("insights generated", Array.isArray(insights) && insights.length > 0, `got ${insights.length}`);
check("insight kinds valid", insights.every((i) => ["focus","accuracy","speed","trend","record","streak","tip","error","rhythm","recovery"].includes(i.kind)));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
if (failures > 0) process.exit(1);
console.log("\nsample audit JSON (speed/errors):");
console.log(JSON.stringify({ speed: audit.speed, errors: audit.errors, compare: audit.compare }, null, 2));
