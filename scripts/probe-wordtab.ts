/**
 * Probe: does a realistic 3-test word history light up the words tab?
 * Seeds the exact payload sanitizeLearning will read, computes urgency with
 * the real module, then prints what the UI *should* show.
 */
import { calculateWordUrgencies, collectWorstWords, collectFastestWords, collectDueWords } from "../src/lib/typing/word-scheduler";
import { sanitizeLearning } from "../src/lib/typing/sanitize";
import { reviewMem, newMemCard } from "../src/lib/typing/memory";

const MIN = 60_000;
const now = Date.now();
const raw = {
  keyProfiles: {}, bigramProfiles: {}, confusions: [], errorContexts: [],
  totalKeystrokes: 3000, totalChars: 2800, totalTests: 3, totalTimeMs: 240000, lastVersion: 4,
  wordProfiles: {
    // chronic nemesis: 5 errors in 8 attempts, last failed 3 min ago
    weave: { attempts: 8, errors: 5, bestWpm: null, lastSeen: now - 3 * MIN, mem: null },
    // solid word: 6 clean attempts, best 96 wpm, reviewed 10 min ago (good)
    shelter: { attempts: 6, errors: 0, bestWpm: 96, lastSeen: now - 10 * MIN, mem: null },
    // recovered-slip word: perfect diffs but errKeys — graded hard twice
    rhythm: { attempts: 4, errors: 1, bestWpm: 62, lastSeen: now - 6 * MIN, mem: null },
  },
};

const L = sanitizeLearning(raw);
// simulate the review trail the app would have built
L.wordProfiles.weave.mem = newMemCard(now - 40 * MIN);
L.wordProfiles.weave.mem = reviewMem(L.wordProfiles.weave.mem, "again", now - 40 * MIN);
L.wordProfiles.weave.mem = reviewMem(L.wordProfiles.weave.mem, "again", now - 20 * MIN);
L.wordProfiles.weave.mem = reviewMem(L.wordProfiles.weave.mem, "good", now - 3 * MIN);
L.wordProfiles.shelter.mem = newMemCard(now - 60 * MIN);
L.wordProfiles.shelter.mem = reviewMem(L.wordProfiles.shelter.mem, "good", now - 60 * MIN);
L.wordProfiles.shelter.mem = reviewMem(L.wordProfiles.shelter.mem, "easy", now - 10 * MIN);
L.wordProfiles.rhythm.mem = newMemCard(now - 30 * MIN);
L.wordProfiles.rhythm.mem = reviewMem(L.wordProfiles.rhythm.mem, "hard", now - 30 * MIN);
L.wordProfiles.rhythm.mem = reviewMem(L.wordProfiles.rhythm.mem, "good", now - 6 * MIN);

console.log("urgencies:");
for (const u of calculateWordUrgencies(L)) {
  console.log(`  ${u.word}: u=${u.urgency.toFixed(3)} R=${u.retrievability.toFixed(2)} err=${(u.errRate * 100).toFixed(0)}% dueIn=${u.dueInMs === null ? "null" : (u.dueInMs / MIN).toFixed(1) + "m"}`);
}
console.log("worst:", collectWorstWords(L).map((w) => w.word));
console.log("fastest:", collectFastestWords(L).map((w) => `${w.word}:${w.bestWpm?.toFixed(0)}`));
console.log("due:", collectDueWords(L).map((w) => w.word));
