import { generateInsights, nextTestPreview } from "../src/lib/typing/insights";
import { emptyLearning } from "../src/lib/typing/profiles";
import type { LearningData, Settings, StatsData, TestResult } from "../src/lib/typing/types";
import { DEFAULT_SETTINGS } from "../src/lib/typing/types";

// simulate: 3 errors on 'e' right after 'th' + one on 'o' after 'w'
const learning: LearningData = emptyLearning();
learning.totalTests = 5;
learning.errorContexts.push(
  { trigram: "the", count: 3, lastSeen: Date.now() },
  { trigram: "wo", count: 2, lastSeen: Date.now() }
);
learning.keyProfiles["e"] = { attempts: 40, errRate: 0.09, latency: 220, lastSeen: Date.now() };
learning.keyProfiles["t"] = { attempts: 60, errRate: 0.01, latency: 150, lastSeen: Date.now() };
learning.bigramProfiles["th"] = { attempts: 30, errRate: 0.05, latency: 260, lastSeen: Date.now() };

const result: TestResult = {
  id: "t1", timestamp: Date.now(), mode: "adaptive", modeLabel: "adaptive 25",
  wpm: 78, rawWpm: 84, accuracy: 94.2, consistency: 88, duration: 42,
  chars: { correct: 320, incorrect: 12, extra: 4, missed: 6 },
  samples: [], focusKeys: ["e", "a"], isPersonalBest: false,
};
const stats: StatsData = { history: [], personalBests: {}, streakDays: 0, lastTestDay: "", firstTestDay: null };

const insights = generateInsights(result, stats, learning, DEFAULT_SETTINGS);
console.log("=== coach insights ===");
for (const i of insights) console.log(`[${i.kind}] ${i.message}`);

console.log("\n=== idle preview ===");
console.log(nextTestPreview(learning, "adaptive"));

// sanity: context insight should mention 'th'->'e'
const ctxInsight = insights.find((i) => i.message.includes("'th'→'e'"));
console.log("\ncontext insight present:", Boolean(ctxInsight));
