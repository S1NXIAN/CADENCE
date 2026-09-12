import type {
  CharEvent,
  CoachInsight,
  LearningData,
  PersonalBest,
  Settings,
  StatsData,
  TestResult,
} from "./types";
import {
  computeWeakKeys,
  personalMedianLatency,
  topErrorContexts,
  weakBigrams,
} from "./profiles";
import { memRetrievability } from "./memory";
import {
  analyzeCurve,
  analyzeEvents,
  HESITATION_MS,
  type CurveAnalysis,
  type EventAnalysis,
} from "./audit";

/**
 * Coach engine v2 — "observant, not generic".
 *
 * The old coach only looked at aggregate scores (accuracy, wpm, consistency).
 * This version also reads the two richest sources the app already records:
 *
 *   1. the keystroke event log — which exact letters slipped, which targeted
 *      keys failed, where the fingers froze, which keys ran slow THIS test;
 *   2. the per-second samples — fade (stamina), cold opens (warmup), burst
 *      spread (rhythm), and error clusters ("second 14 is where it went").
 *
 * Detectors produce prioritized candidates; the selector keeps the most
 * urgent notes with kind caps so the panel never shows four variations of
 * the same observation. Phrase variants rotate deterministically per test
 * (hash of result id) so consecutive similar tests don't read identically.
 */

// ---------------------------------------------------------------------------
// Detector bank
// ---------------------------------------------------------------------------

interface Candidate {
  note: CoachInsight;
  priority: number; // higher = more urgent
}

interface DetectorCtx {
  result: TestResult;
  ev: EventAnalysis;
  curve: CurveAnalysis | null;
  stats: StatsData;
  learning: LearningData;
  settings?: Settings;
  prevBest?: PersonalBest | null;
  /** deterministic phrase variant for this test (so repeats don't read identical) */
  v: <T>(arr: T[]) => T;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function recentSameLabel(stats: StatsData, label: string, excludeId: string): TestResult[] {
  return stats.history.filter((h) => h.modeLabel === label && h.id !== excludeId);
}

/** record: new PB with delta, first baseline, or a near-miss. */
function recordNote(c: DetectorCtx): Candidate | null {
  const { result, v } = c;
  if (result.wpm <= 0) return null;
  const prev = c.prevBest !== undefined ? c.prevBest : c.stats.personalBests[result.modeLabel];
  if (result.isPersonalBest) {
    if (prev && result.wpm > prev.wpm) {
      return {
        priority: 85,
        note: {
          kind: "record",
          title: v(["new personal best", "record falls"]),
          message: v([
            `${result.wpm} WPM for ${result.modeLabel}, up ${result.wpm - prev.wpm} from your previous best. Speed follows accuracy — you just proved it again.`,
            `+${result.wpm - prev.wpm} over your old ${result.modeLabel} best. Whatever pace you held in the clean middle stretch — that's the new default to train at.`,
          ]),
          metric: `+${result.wpm - prev.wpm} wpm`,
        },
      };
    }
    return {
      priority: 85,
      note: {
        kind: "record",
        title: "baseline set",
        message: `First score on record for ${result.modeLabel}: ${result.wpm} WPM at ${result.accuracy}%. Every test from here is measured against it.`,
        metric: `${result.wpm} wpm`,
      },
    };
  }
  if (prev && prev.wpm - result.wpm <= 2 && prev.wpm > result.wpm) {
    return {
      priority: 55,
      note: {
        kind: "record",
        title: "knocking on the record",
        message: `${prev.wpm - result.wpm === 0 ? "Tied pace with" : `Just ${prev.wpm - result.wpm} under`} your ${result.modeLabel} best (${prev.wpm}). One cleaner run today takes it.`,
        metric: `best ${prev.wpm}`,
      },
    };
  }
  return null;
}

/** error tax: how much raw speed leaked away to mistakes. */
function errorTaxNote(c: DetectorCtx): Candidate | null {
  const { result, v } = c;
  const tax = result.rawWpm - result.wpm;
  if (tax < 6 || result.rawWpm <= 0) return null;
  return {
    priority: tax >= 10 ? 88 : 80,
    note: {
      kind: "speed",
      title: v(["the error tax", "mistakes are expensive"]),
      message: v([
        `Raw pace was ${result.rawWpm} wpm; ${tax} of it leaked away to errors. The fix isn't faster fingers today — it's cleaner ones.`,
        `You typed at ${result.rawWpm} raw and kept only ${result.wpm}. At ${result.accuracy}% accuracy, easing off ~10% nets you MORE speed, not less.`,
      ]),
      metric: `${result.rawWpm} → ${result.wpm}`,
    },
  };
}

/** accuracy bands with per-test error counts. */
function accuracyNote(c: DetectorCtx): Candidate | null {
  const { result, ev, v } = c;
  if (result.accuracy < 92) {
    if (result.chars.incorrect + result.chars.extra <= 3) return null;
    return {
      priority: 92,
      note: {
        kind: "accuracy",
        title: v(["accuracy below threshold", "sloppy reps detected"]),
        message: v([
          `${result.accuracy}% with ${ev.errors} bad keystrokes. Sloppy reps build sloppy muscle memory — drop ~10% pace next run and let accuracy lead again.`,
          `At ${result.accuracy}%, every rep is partly practice for the WRONG motion. Slow down until you're back above 95; speed re-earns itself fast.`,
        ]),
        metric: `${result.accuracy}%`,
      },
    };
  }
  if (result.accuracy < 96 && ev.errors >= 4) {
    return {
      priority: 64,
      note: {
        kind: "accuracy",
        title: "nearly clean",
        message: `${result.accuracy}% — ${ev.errors} slips from a spotless run. You're one focused test away from a 96%+ anchor; pick precision over pace for one round.`,
        metric: `${ev.errors} slips`,
      },
    };
  }
  if (result.accuracy >= 98 && result.wpm > 0) {
    return {
      priority: 50,
      note: {
        kind: "accuracy",
        title: v(["elite precision", "surgical run"]),
        message: v([
          `${result.accuracy}% accuracy. Runs this clean are the ones to push pace on — nudge speed next test and keep the error count at zero.`,
          `${result.accuracy}% — nothing to fix there. The coach says earn speed now: hold this accuracy and raise the pace one notch.`,
        ]),
        metric: `${result.accuracy}%`,
      },
    };
  }
  return null;
}

/** trend: wpm vs last runs of the same label. */
function wpmTrendNote(c: DetectorCtx): Candidate | null {
  const { result, v } = c;
  const same = recentSameLabel(c.stats, result.modeLabel, result.id);
  if (same.length < 3) return null;
  const last5 = same.slice(0, 5);
  const avg = last5.reduce((a, b) => a + b.wpm, 0) / last5.length;
  const delta = Math.round(result.wpm - avg);
  if (delta >= 3) {
    return {
      priority: 60,
      note: {
        kind: "trend",
        title: v(["above your curve", "trending up"]),
        message: v([
          `+${delta} WPM over your last ${last5.length} ${result.modeLabel} runs (avg ${Math.round(avg)}). The training is compounding — same time tomorrow keeps the curve bent.`,
          `${delta} wpm better than your recent ${Math.round(avg)} average. Progress like this is made of boring, repeated, accurate reps — keep stacking them.`,
        ]),
        metric: `${delta >= 0 ? "+" : ""}${delta} wpm`,
      },
    };
  }
  if (delta <= -5) {
    return {
      priority: 62,
      note: {
        kind: "trend",
        title: "off-pace day",
        message: `${delta} WPM vs your recent ${Math.round(avg)} average. Off days are data: check whether accuracy dipped or one key cluster slowed the whole run.`,
        metric: `${delta} wpm`,
      },
    };
  }
  return null;
}

/** trend: accuracy vs recent average. */
function accuracyTrendNote(c: DetectorCtx): Candidate | null {
  const { result } = c;
  const same = recentSameLabel(c.stats, result.modeLabel, result.id);
  if (same.length < 3) return null;
  const last5 = same.slice(0, 5);
  const avg = last5.reduce((a, b) => a + b.accuracy, 0) / last5.length;
  const delta = Math.round(result.accuracy - avg);
  if (delta <= -4) {
    return {
      priority: 68,
      note: {
        kind: "trend",
        title: "accuracy drifting down",
        message: `${result.accuracy}% vs a recent ${Math.round(avg)}% average — ${Math.abs(delta)} points of drift. That pattern usually precedes a plateau; one deliberately slow, clean session resets it.`,
        metric: `${delta} pts`,
      },
    };
  }
  return null;
}

/** rhythm: fade — speed endurance gave out partway through. */
function fadeNote(c: DetectorCtx): Candidate | null {
  const { result, curve, v } = c;
  if (!curve || result.duration < 20) return null;
  if (curve.fade < 0.15 || curve.firstMean < 25) return null;
  return {
    priority: 78,
    note: {
      kind: "rhythm",
      title: v(["stamina fade", "second-half slump"]),
      message: v([
        `You opened at ~${Math.round(curve.firstMean)} wpm and closed at ~${Math.round(curve.lastMean)}. Burst speed isn't the limiter — endurance is. Short breaks between tests keep the shoulders loose and the tail fast.`,
        `The last third ran ~${Math.round((1 - curve.fade) * 100)}% of your opening pace. That fade is tension, not talent: relax the wrists and treat the final stretch like the first.`,
      ]),
      metric: `${Math.round(curve.firstMean)} → ${Math.round(curve.lastMean)}`,
    },
  };
}

/** rhythm: cold open — slow first seconds before settling. */
function warmupNote(c: DetectorCtx): Candidate | null {
  const { result, curve, v } = c;
  if (!curve || result.duration < 20) return null;
  if (curve.warmup < 0.35) return null;
  return {
    priority: 54,
    note: {
      kind: "rhythm",
      title: "cold open",
      message: v([
        `The first seconds ran ~${Math.round(curve.first3)} wpm before settling at ~${Math.round(curve.overallMean)}. A short warmup test before your measured runs would lift every number on this screen.`,
        `Opening pace was ~${Math.round(curve.first3)} vs ~${Math.round(curve.overallMean)} once rolling. Nothing wrong mid-run — you just started cold.`,
      ]),
      metric: `+${Math.round(curve.warmup * 100)}% ramp`,
    },
  };
}

/** error: cluster — a specific moment decided the test. */
function errorSpikeNote(c: DetectorCtx): Candidate | null {
  const { curve, v } = c;
  if (!curve) return null;
  if (curve.worstSecErrs < 2 || curve.errTotal < 3) return null;
  return {
    priority: 74,
    note: {
      kind: "error",
      title: v([`error cluster at ${curve.worstWindowStart}s`, `the ${curve.worstWindowStart}s wobble`]),
      message: v([
        `${curve.worstWindowErrs} errors landed inside a 3-second window around second ${curve.worstWindowStart} — one rough patch shaped this whole result. When that hits: stop, breathe, restart the line clean instead of pushing through.`,
        `Errors bunched at second ${curve.worstWindowStart} (${curve.worstWindowErrs} in 3s). Panic spikes like that are rhythm breaks, not skill gaps — steadier pacing through hard words prevents the cascade.`,
      ]),
      metric: `${curve.worstWindowErrs} err @ ${curve.worstWindowStart}s`,
    },
  };
}

/** rhythm: burst spread — peak vs trough gap. */
function spreadNote(c: DetectorCtx): Candidate | null {
  const { result, curve } = c;
  if (!curve || result.duration < 15) return null;
  if (curve.peak < 50 || curve.low < 4 || curve.peak < curve.low * 2.2) return null;
  return {
    priority: 56,
    note: {
      kind: "rhythm",
      title: "burst-and-stall pattern",
      message: `Peaks hit ~${Math.round(curve.peak)} wpm while the slowest active second sank to ~${Math.round(curve.low)}. The spread, not the average, is capping you — try typing in steady phrase chunks instead of sprint-and-hesitate.`,
      metric: `${Math.round(curve.peak)}/${Math.round(curve.low)} wpm`,
    },
  };
}

/** focus: did the keys this test targeted actually fail or hold? */
function focusNote(c: DetectorCtx): Candidate | null {
  const { result, ev } = c;
  if (result.focusKeys.length === 0) return null;
  const slips = [...ev.focusSlips.entries()].sort((a, b) => b[1] - a[1]);
  const worst = slips[0];
  if (worst && worst[1] >= 2) {
    return {
      priority: 76,
      note: {
        kind: "focus",
        title: "targeted key still slipping",
        message: `'${worst[0]}' — a key this test was built around — slipped ${worst[1]}×. That's the point: the generator feeds you your weakness until it's automatic. Next round features it again.`,
        metric: `'${worst[0]}' ×${worst[1]}`,
      },
    };
  }
  if (slips.length === 0 && ev.keystrokes >= 40) {
    return {
      priority: 44,
      note: {
        kind: "recovery",
        title: "targets held clean",
        message: `Every key this test drilled (${result.focusKeys.map((k) => `'${k}'`).join(", ")}) stayed error-free. Clean exposure is how weak keys graduate — the engine will rotate in the next bottleneck.`,
      },
    };
  }
  return null;
}

/** error: dropped letters vs overshoot diagnosis. */
function charLossNote(c: DetectorCtx): Candidate | null {
  const { result, v } = c;
  const { missed, extra } = result.chars;
  if (missed >= 4 && missed >= extra * 2) {
    return {
      priority: 66,
      note: {
        kind: "error",
        title: v(["dropping letters", "truncated words"]),
        message: v([
          `${missed} expected characters never landed (vs ${extra} extras). That signature means releasing a word before its last letter — finish every word to the final character, THEN hit space.`,
          `${missed} letters silently skipped. Fingers are finishing early — a beat of patience on each word's tail letters erases this whole class of error.`,
        ]),
        metric: `${missed} missed`,
      },
    };
  }
  if (extra >= 4 && extra > missed) {
    return {
      priority: 62,
      note: {
        kind: "error",
        title: "overshooting words",
        message: `${extra} extra characters landed past word ends. Anticipating fingers type the letter they EXPECT next — let the target word finish before the space bar does.`,
        metric: `${extra} extra`,
      },
    };
  }
  return null;
}

/** tip: the sharpest finger habit, lifetime + this test combined. */
function confusionNote(c: DetectorCtx): Candidate | null {
  const { ev, learning, v } = c;
  const combined = new Map<string, { expected: string; typed: string; total: number; thisTest: number }>();
  for (const c2 of learning.confusions) {
    const key = `${c2.expected}>${c2.typed}`;
    combined.set(key, { expected: c2.expected, typed: c2.typed, total: c2.count, thisTest: 0 });
  }
  for (const [key, n] of ev.confusions) {
    const [e, t] = key.split(">");
    const cur = combined.get(key);
    if (cur) {
      cur.total += n;
      cur.thisTest += n;
    } else {
      combined.set(key, { expected: e, typed: t, total: n, thisTest: n });
    }
  }
  let best: { expected: string; typed: string; total: number; thisTest: number } | null = null;
  for (const x of combined.values()) {
    if (x.total < 3 && x.thisTest < 2) continue;
    if (!best || x.total > best.total || (x.total === best.total && x.thisTest > best.thisTest)) best = x;
  }
  if (!best) return null;
  return {
    priority: 70,
    note: {
      kind: "tip",
      title: v([`finger habit: '${best.expected}' → '${best.typed}'`, `'${best.expected}' keeps turning into '${best.typed}'`]),
      message: v([
        `You've swapped '${best.expected}' for '${best.typed}' ${best.total}× recently${best.thisTest > 0 ? `, ${best.thisTest} in this very test` : ""}. That's a fixed finger-path habit — slow, deliberate reps on exactly that pair rewire it faster than volume does.`,
        `The scorecard says '${best.expected}' becomes '${best.typed}' under pressure (${best.total}×). Isolate it: type ten slow words containing '${best.expected}' before the next run.`,
      ]),
      metric: `×${best.total}${best.thisTest ? ` · ${best.thisTest} now` : ""}`,
    },
  };
}

/** tip: trigram error context — the transition, not the key. */
function transitionNote(c: DetectorCtx): Candidate | null {
  const ctx = topErrorContexts(c.learning, 1)[0];
  if (!ctx) return null;
  const before = ctx.trigram.slice(0, 2);
  const target = ctx.trigram.slice(2);
  return {
    priority: 58,
    note: {
      kind: "tip",
      title: `transition '${before}' → '${target}'`,
      message: `Your errors cluster right after '${before}' (${ctx.count}× recently). The combination is what trips you, not the lone key — adaptive mode drills that exact sequence.`,
      metric: `×${ctx.count}`,
    },
  };
}

/** tip: slowest keys THIS test vs personal baseline. */
function slowKeysNote(c: DetectorCtx): Candidate | null {
  const { ev, learning } = c;
  const median = personalMedianLatency(learning) || 150;
  const ranked: Array<{ key: string; ms: number; ratio: number }> = [];
  for (const [key, arr] of ev.latencies) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const ratio = med / median;
    if (ratio >= 1.35) ranked.push({ key, ms: med, ratio });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => b.ratio - a.ratio);
  const top = ranked.slice(0, 2);
  return {
    priority: 48,
    note: {
      kind: "tip",
      title: "slowest keys this run",
      message: `${top.map((k) => `'${k.key}' (${k.ms}ms)`).join(" and ")} ran well above your ~${Math.round(median)}ms baseline. They're pace-killers, not error-makers — deliberate reps on words containing them pays double.`,
      metric: top.map((k) => `'${k.key}' ${k.ms}ms`).join(" "),
    },
  };
}

/** rhythm: the single longest freeze and where it happened. */
function hesitationNote(c: DetectorCtx): Candidate | null {
  const { ev } = c;
  if (ev.hesitations.length === 0) return null;
  const h = ev.hesitations.reduce((a, b) => (b.ms > a.ms ? b : a));
  if (h.ms < HESITATION_MS) return null;
  return {
    priority: 52,
    note: {
      kind: "rhythm",
      title: "the longest freeze",
      message: `You paused ${(h.ms / 1000).toFixed(1)}s before '${h.ch}'. One hesitation like that costs more than any typo — it usually means the eyes arrived late. Reading a word ahead of your fingers is the fix.`,
      metric: `${(h.ms / 1000).toFixed(1)}s`,
    },
  };
}

/** speed: cleared for a push. */
function speedPushNote(c: DetectorCtx): Candidate | null {
  const { result, curve } = c;
  const tax = result.rawWpm - result.wpm;
  if (result.accuracy < 97 || result.consistency < 72 || tax > 3) return null;
  if (curve && curve.fade >= 0.08) return null;
  return {
    priority: 58,
    note: {
      kind: "speed",
      title: "cleared for a speed push",
      message: `${result.accuracy}% accuracy, ${result.consistency}% consistency, almost no error tax. Everything is green — the next test should hurt a little: aim ${result.wpm + 5}+ and let accuracy be the guardrail.`,
      metric: `target ${result.wpm + 5}+`,
    },
  };
}

/** recovery: keys that used to cost errors are now clean. */
function recoveredNote(c: DetectorCtx): Candidate | null {
  const { learning } = c;
  const now = Date.now();
  const healed: Array<{ key: string; r: number }> = [];
  for (const [key, p] of Object.entries(learning.keyProfiles)) {
    if (p.attempts < 20 || p.errors < 2) continue;
    if (p.errRate > 0.02) continue;
    if (!p.mem || p.mem.reps === 0) continue;
    const r = memRetrievability(p.mem, now);
    if (r >= 0.8) healed.push({ key, r });
  }
  if (healed.length < 2) return null;
  healed.sort((a, b) => b.r - a.r);
  const top = healed.slice(0, 2);
  return {
    priority: 45,
    note: {
      kind: "recovery",
      title: "off the watch list",
      message: `'${top.map((k) => k.key).join("', '")}' used to cost you errors — recent runs are clean and the memory model holds them at ${Math.round(top[0].r * 100)}% reliability. The generator will fade them out of drills and hunt the next bottleneck.`,
      metric: `${Math.round(top[0].r * 100)}% solid`,
    },
  };
}

/** tip: FSRS refresher queue is building. */
function dueNote(c: DetectorCtx): Candidate | null {
  const { learning } = c;
  const horizon = Date.now() + 48 * 3600 * 1000;
  let due = 0;
  for (const p of Object.values(learning.keyProfiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }
  for (const p of Object.values(learning.bigramProfiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }
  if (due < 6) return null;
  return {
    priority: 38,
    note: {
      kind: "tip",
      title: "refresher queue building",
      message: `${due} keys and transitions are due (or due within two days) for a refresher. Adaptive mode schedules them back in before they fade — switching to it for a couple of runs clears the queue.`,
      metric: `${due} due`,
    },
  };
}

/** streak. */
function streakNote(c: DetectorCtx): Candidate | null {
  if (c.stats.streakDays < 2) return null;
  return {
    priority: 30,
    note: {
      kind: "streak",
      title: `${c.stats.streakDays}-day streak`,
      message: c.v([
        `${c.stats.streakDays} days in a row. Muscle memory compounds daily — short sessions beat marathons.`,
        `Day ${c.stats.streakDays}. The fingers remember what the calendar confirms — see you tomorrow.`,
      ]),
      metric: `${c.stats.streakDays}d`,
    },
  };
}

/** adaptive nudge for new users not yet in adaptive mode. */
function adaptiveNudgeNote(c: DetectorCtx): Candidate | null {
  if (c.learning.totalTests >= 5) return null;
  if (c.settings && c.settings.mode === "adaptive") return null;
  return {
    priority: 20,
    note: {
      kind: "tip",
      title: "feed the coach",
      message: "The coach learns fastest in adaptive mode — every keystroke there feeds your weakness profile and reshapes the next test.",
    },
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Generate human coaching insights after a completed test.
 * This is the "wants you to improve" personality of the app.
 *
 * `events` is the raw keystroke log of the finished test — the coach reads it
 * directly (which letters slipped, where pauses fell) instead of judging from
 * aggregates alone. `stats` should be the POST-record stats (so streak/history
 * notes reflect the test that just finished); `prevBest` is the personal best
 * BEFORE this test was recorded — pass it so the "new PB +delta" math works
 * (after recording, the PB already IS this result, and the delta would read 0).
 */
export function generateInsights(
  result: TestResult,
  events: CharEvent[],
  stats: StatsData,
  learning: LearningData,
  settings?: Settings,
  prevBest?: PersonalBest | null
): CoachInsight[] {
  const ev = analyzeEvents(events, result.focusKeys);
  const curve = analyzeCurve(result);
  const h = hashStr(result.id);
  const ctx: DetectorCtx = {
    result,
    ev,
    curve,
    stats,
    learning,
    settings,
    prevBest,
    v: <T,>(arr: T[]) => arr[h % arr.length],
  };

  const candidates = [
    recordNote(ctx),
    errorTaxNote(ctx),
    accuracyNote(ctx),
    wpmTrendNote(ctx),
    accuracyTrendNote(ctx),
    fadeNote(ctx),
    warmupNote(ctx),
    errorSpikeNote(ctx),
    spreadNote(ctx),
    focusNote(ctx),
    charLossNote(ctx),
    confusionNote(ctx),
    transitionNote(ctx),
    slowKeysNote(ctx),
    hesitationNote(ctx),
    speedPushNote(ctx),
    recoveredNote(ctx),
    dueNote(ctx),
    streakNote(ctx),
    adaptiveNudgeNote(ctx),
  ].filter((x): x is Candidate => x !== null && x.note.message.length > 0);

  candidates.sort((a, b) => b.priority - a.priority);

  // kind caps: one note per kind (tips may double up), max 4 total, no dupes
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  const kindCount = new Map<CoachInsight["kind"], number>();
  for (const cand of candidates) {
    const sig = cand.note.message;
    if (seen.has(sig)) continue;
    const n = kindCount.get(cand.note.kind) ?? 0;
    const cap = cand.note.kind === "tip" ? 2 : 1;
    if (n >= cap) continue;
    kindCount.set(cand.note.kind, n + 1);
    seen.add(sig);
    picked.push(cand);
    if (picked.length >= 4) break;
  }
  return picked.map((p) => p.note);
}

// ---------------------------------------------------------------------------
// Idle-state preview
// ---------------------------------------------------------------------------

/** Idle-state line: what the engine will target next (adaptive mode only). */
export function nextTestPreview(learning: LearningData, mode: string): string {
  if (mode !== "adaptive") return "";
  if (learning.totalTests < 1) {
    return "Your first test calibrates the coach. From test 2 onward, every word is chosen for you.";
  }
  const weak = computeWeakKeys(learning).filter((w) => w.weakness > 0.08).slice(0, 2);
  const bgs = weakBigrams(learning, 3).filter((b) => b.weakness > 0.08).slice(0, 2);

  const horizon = Date.now() + 48 * 3600 * 1000;
  let due = 0;
  for (const p of Object.values(learning.keyProfiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }
  for (const p of Object.values(learning.bigramProfiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }
  // the word layer feeds the same refresher queue (word-level FSRS) — the
  // preview must count it or it under-reports what the next test will serve
  for (const p of Object.values(learning.wordProfiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }

  const parts: string[] = [];
  if (weak.length) parts.push(`keys ${weak.map((w) => `'${w.key}'`).join(", ")}`);
  if (bgs.length) parts.push(`transitions ${bgs.map((b) => `'${b.bigram}'`).join(", ")}`);

  if (!parts.length) {
    if (due >= 4) {
      return `${due} items are coming due for a refresher — the next test will start resurfacing them before they fade.`;
    }
    return "No strong weaknesses right now — the engine keeps mapping your fingers.";
  }
  const suffix = due >= 4 ? `, plus ${due} items due for a refresher` : "";
  return `Next test attacks your ${parts.join(" and ")}${suffix}.`;
}

