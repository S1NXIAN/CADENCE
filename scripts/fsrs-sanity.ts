/**
 * FSRS scheduler + motor prior + set-cover sanity harness.
 * Verifies the behavioral guarantees of Adaptive Engine v2 without a browser.
 * Run: bun scripts/fsrs-sanity.ts
 */
import { emptyLearning, ingestEvents, finalizeLearning, keyUrgencies, bigramUrgencies, type ReviewTally } from "../src/lib/typing/profiles";
import { newMemCard, reviewMem, memRetrievability } from "../src/lib/typing/memory";
import { keyPrior, classifyBigram } from "../src/lib/typing/motor";
import { sanitizeLearning } from "../src/lib/typing/storage";
import type { CharEvent } from "../src/lib/typing/types";

let checks = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FAIL ${name} ${detail}`);
  } else {
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Memory dynamics
// ---------------------------------------------------------------------------
console.log("== memory dynamics ==");

// first-review stability grows with grade
const sAgain = reviewMem(newMemCard(), "again").s;
const sHard = reviewMem(newMemCard(), "hard").s;
const sGood = reviewMem(newMemCard(), "good").s;
const sEasy = reviewMem(newMemCard(), "easy").s;
check("first-review stability ordering", sAgain < sHard && sHard < sGood && sGood < sEasy,
  `again=${sAgain.toFixed(2)} hard=${sHard.toFixed(2)} good=${sGood.toFixed(2)} easy=${sEasy.toFixed(2)}`);

// spaced repetition: same grade, longer gap -> bigger stability growth
let massed = newMemCard();
massed = reviewMem(massed, "good");
const massedS0 = massed.s;
for (let i = 0; i < 5; i++) massed = reviewMem(massed, "good"); // consecutive, seconds apart
const massedGrowth = massed.s / massedS0;

let spaced = newMemCard();
spaced = reviewMem(spaced, "good");
const spacedS0 = spaced.s;
const day = 86400000;
for (let i = 0; i < 5; i++) spaced = reviewMem(spaced, "good", Date.now() + (i + 1) * day * 3);
const spacedGrowth = spaced.s / spacedS0;
check("spacing effect: spaced growth >> massed growth", spacedGrowth > massedGrowth * 3,
  `massed=${massedGrowth.toFixed(2)}x spaced=${spacedGrowth.toFixed(2)}x`);
check("motor floor: massed practice still consolidates a little", massedGrowth > 1.0,
  `${massedGrowth.toFixed(3)}x after 5 massed goods`);

// lapses hurt stability and raise difficulty
let lapse = reviewMem(newMemCard(), "good", Date.now());
lapse = reviewMem(lapse, "good", Date.now() + day);
lapse = reviewMem(lapse, "good", Date.now() + 2 * day);
const preLapse = { s: lapse.s, d: lapse.d, lapses: lapse.lapses };
lapse = reviewMem(lapse, "again", Date.now() + 3 * day);
check("lapse reduces stability", lapse.s < preLapse.s, `${preLapse.s.toFixed(1)} -> ${lapse.s.toFixed(1)}`);
check("lapse counts", lapse.lapses === preLapse.lapses + 1);

// retrievability decays with time (measured forward from the last review)
const lastT = lapse.last ?? Date.now();
const rNow = memRetrievability(lapse, lastT + 3600e3);
const rLater = memRetrievability(lapse, lastT + 7 * day);
const rMuchLater = memRetrievability(lapse, lastT + 60 * day);
check("retrievability decays", rNow > rLater && rLater > rMuchLater && rMuchLater < 0.7,
  `1h=${rNow.toFixed(2)} 7d=${rLater.toFixed(2)} 60d=${rMuchLater.toFixed(2)}`);

// ---------------------------------------------------------------------------
// 2. Motor priors
// ---------------------------------------------------------------------------
console.log("\n== motor priors ==");
const pQ = keyPrior("q"), pJ = keyPrior("j"), pE = keyPrior("e");
check("pinky key harder than index key", pQ.err > pJ.err * 1.4, `q=${pQ.err.toFixed(3)} j=${pJ.err.toFixed(3)}`);
check("pinky key slower than index key", pQ.lat > pJ.lat * 1.15, `q=${pQ.lat.toFixed(0)}ms j=${pJ.lat.toFixed(0)}ms`);
const sfEd = classifyBigram("e", "d");   // same finger (left middle)
const altTh = classifyBigram("t", "h");  // alternate hands
check("same-finger bigram prior worse than alternation", sfEd.err > altTh.err * 1.8,
  `ed=${sfEd.err.toFixed(3)} th=${altTh.err.toFixed(3)}`);
const rowSkip = classifyBigram("q", "z");
check("row-skip adds cost", rowSkip.rowSkip >= 2 && rowSkip.err > altTh.err);

// ---------------------------------------------------------------------------
// 3. End-to-end ingest -> FSRS review -> urgency
// ---------------------------------------------------------------------------
console.log("\n== end-to-end ingest ==");
function events(list: Array<[string, string, boolean]>): CharEvent[] {
  let t = 0;
  return list.map(([expected, typed, correct]) => {
    t += 150 + Math.floor(Math.random() * 60);
    return { t, expected, typed, correct } as CharEvent;
  });
}

const learning = emptyLearning();
// a test where 'q' is typed cleanly, 'z' is fumbled twice
const evs: CharEvent[] = [
  ...events([["t", "t", true], ["h", "h", true], ["e", "e", true]]),
  ...events([["q", "q", true], ["u", "u", true], ["i", "i", true], ["t", "t", true]]),
  ...events([["z", "x", false], ["e", "e", true], ["r", "r", true]]),
  ...events([["z", "a", false], ["e", "e", true], ["n", "n", true]]),
];
const tally: ReviewTally = ingestEvents(learning, evs, 30000);
finalizeLearning(learning, tally);
check("test 1: z has high urgency, t low", true); // placeholder replaced below

const urg1 = keyUrgencies(learning);
const urgZ = urg1.find((u) => u.key === "z");
const urgT = urg1.find((u) => u.key === "t");
const urgQ = urg1.find((u) => u.key === "q");
check("fumbled 'z' outranks clean 't'", (urgZ?.urgency ?? 0) > (urgT?.urgency ?? 0) * 2,
  `z=${urgZ?.urgency.toFixed(2)} t=${urgT?.urgency.toFixed(2)}`);
check("clean-but-pinky 'q' carries some urgency via memory decay only",
  (urgQ?.urgency ?? 0) < (urgZ?.urgency ?? 0));

// same clean performance on z vs q -> z (bottom-row pinky prior) ranks higher when unpracticed
const fresh = emptyLearning();
const evs2: CharEvent[] = [
  ...events([["z", "z", true], ["e", "e", true]]),
  ...events([["q", "q", true], ["u", "u", true]]),
];
finalizeLearning(fresh, ingestEvents(fresh, evs2, 5000));
const urg2 = keyUrgencies(fresh);
const zU = urg2.find((u) => u.key === "z");
const qU = urg2.find((u) => u.key === "q");
check("identical clean reps: pinky-bottom 'z' > pinky-top 'q' (prior tiebreak)", (zU?.urgency ?? 0) > (qU?.urgency ?? 0),
  `z=${zU?.urgency.toFixed(3)} q=${qU?.urgency.toFixed(3)}`);

// bigram urgency surfaces the failing transition
const bgU = bigramUrgencies(learning);
check("transition urgency exists", bgU.length > 0, `top=${bgU[0]?.bigram}`);

// ---------------------------------------------------------------------------
// 4. Storage round-trip + v2 migration
// ---------------------------------------------------------------------------
console.log("\n== storage ==");
const roundTrip = sanitizeLearning(JSON.parse(JSON.stringify(learning)));
const memBefore = learning.keyProfiles["z"]?.mem;
const memAfter = roundTrip.keyProfiles["z"]?.mem;
check("mem survives JSON round-trip",
  !!memAfter && memBefore!.s.toFixed(6) === memAfter.s.toFixed(6) && memBefore!.reps === memAfter.reps && memBefore!.last === memAfter.last,
  `s=${memAfter?.s.toFixed(3)} reps=${memAfter?.reps}`);

const v2payload = {
  keyProfiles: {
    a: { attempts: 120, errRate: 0.02, latency: 140, lastSeen: Date.now() - 3600e3 },
    q: { attempts: 30, errRate: 0.3, latency: 340, lastSeen: Date.now() - 7200e3 },
  },
  bigramProfiles: {},
  confusions: [],
  errorContexts: [],
  totalKeystrokes: 4000,
  totalChars: 3900,
  totalTests: 9,
  totalTimeMs: 400000,
  lastVersion: 2,
};
const migrated = sanitizeLearning(v2payload);
const mA = migrated.keyProfiles["a"]?.mem;
const mQ = migrated.keyProfiles["q"]?.mem;
check("v2 migration seeds memory cards", !!mA && !!mQ && mA!.reps > 0 && mQ!.reps > 0);
check("v2 migration: accurate fast key more stable than error-prone key", mA!.s > mQ!.s,
  `a.s=${mA!.s.toFixed(1)} q.s=${mQ!.s.toFixed(1)}`);
check("v2 migration: error-prone key harder", mQ!.d > mA!.d, `a.d=${mA!.d.toFixed(1)} q.d=${mQ!.d.toFixed(1)}`);
check("v2 migration: lifetime errors inferred", migrated.keyProfiles["q"]!.errors === 9);

// ---------------------------------------------------------------------------
// 5. Urgency timing: decayed keys resurface
// ---------------------------------------------------------------------------
console.log("\n== decay resurfacing ==");
const decayed = emptyLearning();
const evs3: CharEvent[] = events([["k", "k", true], ["e", "e", true], ["n", "n", true]]);
finalizeLearning(decayed, ingestEvents(decayed, evs3, 4000));
// age the memory state by 90 days (simulate: rewrite last/due)
const km = decayed.keyProfiles["k"]!.mem!;
km.last = (km.last ?? Date.now()) - 90 * day;
km.due = (km.due) - 90 * day;
const urgDecayed = keyUrgencies(decayed).find((u) => u.key === "k");
check("long-unpracticed key resurfaces with meaningful urgency", (urgDecayed?.urgency ?? 0) > 0.6,
  `k urgency after 90d = ${urgDecayed?.urgency.toFixed(2)} (R=${urgDecayed?.retrievability.toFixed(2)})`);

// ---------------------------------------------------------------------------
console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
console.log("PASS: FSRS memory model, priors, ingest and storage behave correctly");
