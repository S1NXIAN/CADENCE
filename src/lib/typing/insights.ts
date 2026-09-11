import type { CoachInsight, LearningData, Settings, StatsData, TestResult } from "./types";
import { computeWeakKeys, topConfusions, topErrorContexts, weakBigrams } from "./profiles";

/**
 * Generate human coaching insights after a completed test.
 * This is the "wants you to improve" personality of the app.
 */
export function generateInsights(
  result: TestResult,
  stats: StatsData,
  learning: LearningData,
  settings: Settings
): CoachInsight[] {
  const insights: CoachInsight[] = [];

  // 1. personal best
  if (result.isPersonalBest && result.wpm > 0) {
    const prev = stats.personalBests[result.modeLabel];
    if (prev && result.wpm > prev.wpm) {
      insights.push({
        kind: "record",
        message: `New personal best for ${result.modeLabel} — ${result.wpm} WPM (+${result.wpm - prev.wpm}). Speed follows accuracy; you just proved it.`,
      });
    } else {
      insights.push({
        kind: "record",
        message: `First baseline set for ${result.modeLabel}: ${result.wpm} WPM. Every test from here is measured against it.`,
      });
    }
  }

  // 2. accuracy coaching (always priority when low)
  if (result.accuracy < 92 && result.chars.incorrect + result.chars.extra > 3) {
    insights.push({
      kind: "accuracy",
      message: `Accuracy ${result.accuracy}% — below your 95% training threshold. Sloppy reps build sloppy muscle memory. Slow down ~10% on the next test; speed will follow.`,
    });
  } else if (result.accuracy >= 98 && result.wpm > 0) {
    insights.push({
      kind: "accuracy",
      message: `${result.accuracy}% accuracy is elite consistency. You've earned a speed push — try nudging the pace on the next test.`,
    });
  }

  // 3. focus keys — what the adaptive engine is watching
  const weak = computeWeakKeys(learning).filter((w) => w.weakness > 0.04).slice(0, 3);
  if (result.focusKeys.length > 0) {
    const focused = weak.length > 0 ? weak.map((w) => w.key) : result.focusKeys;
    insights.push({
      kind: "focus",
      message: `This test was curated around your weak spots: ${focused.map((k) => `'${k}'`).join(", ")}. The next one doubles down where you still slipped.`,
    });
  } else if (weak.length > 0) {
    insights.push({
      kind: "focus",
      message: `Your current bottleneck keys: ${weak.map((w) => w.key).join(", ")}. Switch to adaptive mode and the generator will hunt them for you.`,
    });
  }

  // 4. confusion pairs — the sharpest insight the engine has
  const confusions = topConfusions(learning, 3);
  if (confusions.length > 0) {
    const c = confusions[0];
    insights.push({
      kind: "tip",
      message: `You've mistyped '${c.expected}' as '${c.typed}' ${c.count}× recently. That's a finger-path habit — slow, deliberate reps on that pair will rewire it.`,
    });
  }

  // 4b. error context — which key COMBINATION preceded the mistake.
  // An error right after specific keys is a transition problem, not a key problem.
  const errCtx = topErrorContexts(learning, 1)[0];
  if (errCtx) {
    const before = errCtx.trigram.slice(0, 2);
    const target = errCtx.trigram.slice(2);
    insights.push({
      kind: "tip",
      message: `Your errors cluster on the transition '${before}'→'${target}' (${errCtx.count}× recently). The combo is what trips you, not the lone key — adaptive mode will drill that exact sequence.`,
    });
  }

  // 5. trend vs last 5 tests of same label
  const sameLabel = stats.history.filter((h) => h.modeLabel === result.modeLabel && h.id !== result.id);
  if (sameLabel.length >= 3) {
    const last5 = sameLabel.slice(0, 5);
    const avg = last5.reduce((a, b) => a + b.wpm, 0) / last5.length;
    const delta = Math.round(result.wpm - avg);
    if (delta >= 3) {
      insights.push({
        kind: "trend",
        message: `${delta >= 0 ? "+" : ""}${delta} WPM vs your last ${last5.length} runs of ${result.modeLabel} (avg ${Math.round(avg)}). The training is working — keep the streak alive.`,
      });
    } else if (delta <= -5) {
      insights.push({
        kind: "trend",
        message: `${delta} WPM vs your recent average of ${Math.round(avg)}. Off days are data — check if accuracy dropped or a specific key slowed you down.`,
      });
    }
  }

  // 6. consistency coaching
  if (result.consistency > 0 && result.consistency < 60 && result.duration >= 15) {
    insights.push({
      kind: "tip",
      message: `Rhythm consistency ${result.consistency}% — your bursts and pauses even out slower than your fingers. Try typing in steady phrases instead of word-by-word sprints.`,
    });
  }

  // 7. streak encouragement (called right after a finished test)
  if (stats.streakDays >= 2) {
    insights.push({
      kind: "streak",
      message: `${stats.streakDays}-day practice streak. Muscle memory compounds daily — short sessions beat marathons.`,
    });
  }

  // 8. adaptive mode nudge for new users
  if (settings.mode !== "adaptive" && learning.totalTests < 5) {
    insights.push({
      kind: "tip",
      message: "The coach learns fastest in adaptive mode — every keystroke feeds your weakness profile.",
    });
  }

  // prioritize: record > accuracy > focus > trend > tip/streak, max 3 shown
  const order: CoachInsight["kind"][] = ["record", "accuracy", "focus", "trend", "tip", "streak"];
  return insights.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 3);
}

/** Idle-state line: what the engine will target next */
export function nextTestPreview(learning: LearningData, mode: string): string {
  if (mode !== "adaptive") return "";
  if (learning.totalTests < 1) {
    return "Your first test calibrates the coach. From test 2 onward, every word is chosen for you.";
  }
  const weak = computeWeakKeys(learning).slice(0, 3);
  const bgs = weakBigrams(learning, 2);
  const parts: string[] = [];
  if (weak.length) parts.push(`keys ${weak.map((w) => `'${w.key}'`).join(", ")}`);
  if (bgs.length) parts.push(`pairs ${bgs.map((b) => `'${b.bigram}'`).join(", ")}`);
  if (!parts.length) return "No strong weaknesses yet — the engine is still mapping your fingers.";
  return `Next test is curated to attack your ${parts.join(" and ")}.`;
}
