/**
 * Boundary + sanitization probe (Task 11).
 *
 * 1. Space keystrokes reset the bigram chain: typing "he is" must NOT create
 *    the fake cross-word bigram "ei" (last char of word N vs first char of
 *    word N+1 were never adjacent — a space sits between them).
 * 2. Spaces count as keystrokes for accuracy but are not tracked keys.
 * 3. Sanitizers survive poisoned payloads: latency 1e300, PB wpm Infinity,
 *    memory card last:0, junk confusion/context entries.
 */
import { emptyLearning, ingestEvents, finalizeLearning } from "../src/lib/typing/profiles";
import { sanitizeLearning, sanitizeStats } from "../src/lib/typing/storage";
import { memRetrievability } from "../src/lib/typing/memory";
import type { CharEvent, LearningData } from "../src/lib/typing/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------------------
// 1+2: space events split the bigram chain
// ---------------------------------------------------------------------------
function typeEvents(words: string[]): CharEvent[] {
  // simulate what use-typing-session now records: chars of each word, then a
  // real space keystroke between words (submitWord)
  const evs: CharEvent[] = [];
  let t = 0;
  words.forEach((w, wi) => {
    if (wi > 0) {
      evs.push({ t: (t += 80), expected: " ", typed: " ", correct: true });
    }
    for (const ch of w) {
      evs.push({ t: (t += 120), expected: ch, typed: ch, correct: true });
    }
  });
  return evs;
}

const learning: LearningData = emptyLearning();
const evs = typeEvents(["he", "is", "so"]);
const tally = ingestEvents(learning, evs, 3000);
finalizeLearning(learning, tally);

const bigrams = Object.keys(learning.bigramProfiles);
check("no cross-word bigram 'ei' (he|is)", !bigrams.includes("ei"), bigrams.join(","));
check("no cross-word bigram 'so' boundary ('ss' from is|so)", !bigrams.includes("ss"), bigrams.join(","));
check("real intra-word bigrams present", bigrams.includes("he") && bigrams.includes("is"), bigrams.join(","));
check("space is not a tracked key", !learning.keyProfiles[" "], Object.keys(learning.keyProfiles).join(","));
check("spaces counted as keystrokes", learning.totalKeystrokes === 8, String(learning.totalKeystrokes));
check("space not in FSRS tally", !tally.keys.has(" ") && !tally.bigrams.has(" e"), "keys=" + [...tally.keys.keys()].join(","));

// accuracy math (same formula as finishTest): spaces are correct keystrokes
const total = evs.length;
const correct = evs.filter((e) => e.correct).length;
check("accuracy includes spaces", total === 8 && correct === 8, `${correct}/${total}`);

// ---------------------------------------------------------------------------
// 3: poisoned payload survival
// ---------------------------------------------------------------------------
const poisoned = sanitizeLearning({
  keyProfiles: {
    a: { attempts: 10, errRate: 0.1, latency: 1e300, lastSeen: Date.now(), mem: { s: 3, d: 5, reps: 4, lapses: 0, state: 2, ls: 0, last: 0, due: 0 } },
    "ab": { attempts: 5, errRate: 0.2, latency: 100 }, // 2-char key must be rejected from keyProfiles
  },
  bigramProfiles: { th: { attempts: 8, errRate: 0.05, latency: -50 } },
  confusions: [{ expected: "x".repeat(999), typed: "q", count: "junk", lastSeen: -5 }, "junk"],
  errorContexts: [{ trigram: "the", count: 1e999, lastSeen: 3 }],
  totalTests: 3,
});
const a = poisoned.keyProfiles["a"];
check("latency clamped to ≤2000", a.latency !== null && a.latency <= 2000, String(a.latency));
check("mem last:0 coerced (R > 0 now)", a.mem !== null && memRetrievability(a.mem) > 0.5, `R=${a.mem ? memRetrievability(a.mem).toFixed(3) : "null"}`);
check("2-char key rejected", poisoned.keyProfiles["ab"] === undefined);
check("negative bigram latency clamped", poisoned.bigramProfiles["th"].latency === 0, String(poisoned.bigramProfiles["th"].latency));
check("confusion strings truncated", poisoned.confusions[0]?.expected.length === 3, poisoned.confusions[0]?.expected ?? "missing");
check("confusion count coerced", poisoned.confusions[0]?.count === 1, String(poisoned.confusions[0]?.count));
check("non-object confusion dropped", poisoned.confusions.length === 1, String(poisoned.confusions.length));
check("Infinity context count clamped", poisoned.errorContexts[0]?.count <= 1e6, String(poisoned.errorContexts[0]?.count));

const stats = sanitizeStats({
  personalBests: { "time 30": { wpm: 1e999, accuracy: 94, timestamp: 5 } },
  history: [],
});
check("PB Infinity wpm → default 0 (matches history semantics, self-heals)", stats.personalBests["time 30"].wpm === 0, String(stats.personalBests["time 30"].wpm));

// legit payload round-trips unharmed
const ok = sanitizeLearning(JSON.parse(JSON.stringify(learning)));
check("clean payload survives sanitize", ok.keyProfiles["h"] !== undefined && ok.bigramProfiles["he"] !== undefined);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
