/**
 * Probe: adaptive curation integrity — interleave + dedupe + counts.
 *
 * Exercises the REAL production pipeline (generateTest / generateAdaptive),
 * so it can never drift from the source the way a hand-replicated pipeline
 * would. Assertions:
 *   1. exact word count, end to end
 *   2. greedyCover never returns duplicate picks
 *   3. at intensity 0.65 (cluster 2) no more than 2 drill words appear
 *      consecutively — i.e. interleave actually interleaves (regression guard
 *      for the drillSet-pollution bug where all drills bunched at the start)
 *   4. focus keys are surfaced
 *
 * Run: bun scripts/probe-interleave.ts
 */
import { generateTest, generateAdaptive } from "../src/lib/typing/generator";
import { emptyLearning, ingestEvents, finalizeLearning, keyUrgencies, bigramUrgencies } from "../src/lib/typing/profiles";
import type { Settings, LearningData, CharEvent } from "../src/lib/typing/types";

const settings: Settings = {
  mode: "adaptive",
  timeDuration: 30,
  wordCount: 25,
  punctuation: false,
  numbers: false,
  adaptiveIntensity: 65,
  strictMode: false,
  liveWpm: true,
  sound: false,
  caretStyle: "line",
  accent: "lime",
  showCoach: true,
  onlinePacks: false,
};

// Build a realistic learning profile: 12 tests fumbling 'q','z','p' keys.
function simulate(learning: LearningData): void {
  for (let test = 0; test < 12; test++) {
    const events: CharEvent[] = [];
    let t = 0;
    const words = ["quit", "zebra", "plane", "quartz", "zip", "puzzle", "the", "and", "for", "with"];
    for (const w of words) {
      for (let i = 0; i < w.length; i++) {
        t += 140 + Math.random() * 60;
        const miss = "qzp".includes(w[i]) && Math.random() < 0.25;
        events.push({ t, expected: w[i], typed: miss ? "x" : w[i], correct: !miss });
      }
      t += 90; // space
      events.push({ t, expected: null, typed: " ", correct: true });
    }
    const tally = ingestEvents(learning, events, t);
    finalizeLearning(learning, tally);
  }
}

const learning = emptyLearning();
simulate(learning);

// sanity: the profile actually has curation signal
const uk = keyUrgencies(learning).filter((u) => u.urgency > 0.07).slice(0, 8);
const ub = bigramUrgencies(learning).filter((u) => u.urgency > 0.07).slice(0, 14);
console.log(`signal: ${uk.length} urgent keys (${uk.slice(0, 4).map((u) => u.key).join(",")}), ${ub.length} urgent bigrams`);
if (uk.length === 0 && ub.length === 0) {
  console.log("FAIL: simulated profile produced no curation signal — probe invalid");
  process.exit(1);
}

let failed = false;

// 1. end-to-end count, several runs
for (let i = 0; i < 5; i++) {
  const t = generateTest(settings, learning);
  if (t.words.length !== settings.wordCount) {
    console.log(`FAIL: end-to-end word count ${t.words.length} != ${settings.wordCount}`);
    failed = true;
  }
}

// 2+3. production adaptive pipeline: dedupe + interleave invariant
const count = settings.wordCount;
const intensity01 = settings.adaptiveIntensity / 100;
const cluster = intensity01 > 0.6 ? 2 : 1;
let worstRun = 0;
for (let r = 0; r < 20; r++) {
  const { words, drills, focusKeys } = generateAdaptive(learning, count, settings.adaptiveIntensity, false, false);
  if (words.length !== count) {
    console.log(`FAIL: pipeline word count ${words.length} != ${count}`);
    failed = true;
  }
  if (new Set(drills).size !== drills.length) {
    console.log("FAIL: greedyCover produced duplicate picks");
    failed = true;
  }
  let run = 0;
  for (const w of words) {
    run = drills.includes(w) ? run + 1 : 0;
    worstRun = Math.max(worstRun, run);
  }
  if (r === 0 && focusKeys.length === 0) {
    console.log("FAIL: focus keys empty despite curation signal");
    failed = true;
  }
}

console.log(`drill interleave: worst consecutive-drill run = ${worstRun} (cluster limit ${cluster}) over 20 runs`);
if (worstRun > cluster) {
  console.log(`FAIL: ${worstRun} drill words bunch together — interleave is a no-op (drillSet polluted by sampleFlow)`);
  failed = true;
}

// 4. cold start (no signal) still yields exact counts
const cold = generateTest({ ...settings }, emptyLearning());
if (cold.words.length !== settings.wordCount) {
  console.log(`FAIL: cold-start count ${cold.words.length} != ${settings.wordCount}`);
  failed = true;
}

if (failed) process.exit(1);
console.log("PASS: counts exact, drills unique and interleaved, focus keys surfaced");
