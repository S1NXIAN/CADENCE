/**
 * Generator integrity check: adaptive/words tests must contain EXACTLY the
 * requested word count, across modes, counts and intensities.
 * Run: bun scripts/check-generator.ts
 */
import { generateTest } from "../src/lib/typing/generator";
import { emptyLearning } from "../src/lib/typing/profiles";
import { newMemCard, reviewMem } from "../src/lib/typing/memory";
import { DEFAULT_SETTINGS, type LearningData, type Settings } from "../src/lib/typing/types";

// synthetic learning data with weak keys so the adaptive path has signal.
// Profiles are built through real FSRS reviews (same path the app uses).
function weakProfile(errRate: number, latency: number) {
  const mem = newMemCard();
  let m = mem;
  for (let i = 0; i < 4; i++) m = reviewMem(m, "again"); // build difficulty/lapses
  return { attempts: 40, errors: Math.round(40 * errRate), errRate, latency, lastSeen: Date.now(), mem: m };
}
function learningWithSignal(): LearningData {
  const l = emptyLearning();
  l.totalTests = 5;
  const weak = ["q", "p", "y", ";", "x"];
  for (const k of weak) {
    l.keyProfiles[k] = weakProfile(0.3, 320);
  }
  for (const bg of ["qu", "th", "io", "xy"]) {
    l.bigramProfiles[bg] = weakProfile(0.25, 290);
  }
  l.confusions.push({ expected: "e", typed: "r", count: 4, lastSeen: Date.now() });
  l.errorContexts.push({ trigram: "the", count: 3, lastSeen: Date.now() });
  return l;
}

function settingsFor(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

let failures = 0;
let checks = 0;

function expectCount(label: string, words: string[], want: number) {
  checks++;
  if (words.length !== want) {
    failures++;
    console.log(`FAIL ${label}: expected ${want} words, got ${words.length}`);
  }
}

const learning = learningWithSignal();
const empty = emptyLearning();

// adaptive: all counts x intensities x both learning states
for (const count of [10, 25, 50, 100]) {
  for (const intensity of [0, 25, 65, 100]) {
    for (const [tag, l] of [["signal", learning], ["empty", empty]] as const) {
      const s = settingsFor({ mode: "adaptive", wordCount: count, adaptiveIntensity: intensity });
      const t = generateTest(s, l);
      expectCount(`adaptive ${tag} count=${count} intensity=${intensity}`, t.words, count);
      // no adjacent duplicates
      checks++;
      for (let i = 1; i < t.words.length; i++) {
        if (t.words[i] === t.words[i - 1]) {
          failures++;
          console.log(`FAIL adjacent duplicate at ${i} in adaptive count=${count}`);
          break;
        }
      }
    }
  }

  const t = generateTest(settingsFor({ mode: "words", wordCount: count }), learning);
  expectCount(`words count=${count}`, t.words, count);
}

console.log(`${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
console.log("PASS: generator respects requested word count exactly");
