import { DetectorCtx, type Candidate } from "./insights-detectors";
import { calculateMedianLatency, collectTopErrorContexts } from "./profiles";
import { HESITATION_MS } from "./audit";

export function fadeNote(c: DetectorCtx): Candidate | null {
  const { result, curve, variant } = c;
  if (!curve || result.duration < 20) return null;
  if (curve.fade < 0.15 || curve.firstMean < 25) return null;
  return {
    priority: 78,
    note: {
      kind: "rhythm",
      title: variant(["stamina fade", "second-half slump"]),
      message: variant([
        `You opened at ~${Math.round(curve.firstMean)} wpm and closed at ~${Math.round(curve.lastMean)}. Burst speed isn't the limiter — endurance is. Short breaks between tests keep the shoulders loose and the tail fast.`,
        `The last third ran ~${Math.round((1 - curve.fade) * 100)}% of your opening pace. That fade is tension, not talent: relax the wrists and treat the final stretch like the first.`,
      ]),
      metric: `${Math.round(curve.firstMean)} → ${Math.round(curve.lastMean)}`,
    },
  };
}

/** rhythm: cold open — slow first seconds before settling. */
export function warmupNote(c: DetectorCtx): Candidate | null {
  const { result, curve, variant } = c;
  if (!curve || result.duration < 20) return null;
  if (curve.warmup < 0.35) return null;
  return {
    priority: 54,
    note: {
      kind: "rhythm",
      title: "cold open",
      message: variant([
        `The first seconds ran ~${Math.round(curve.first3)} wpm before settling at ~${Math.round(curve.overallMean)}. A short warmup test before your measured runs would lift every number on this screen.`,
        `Opening pace was ~${Math.round(curve.first3)} vs ~${Math.round(curve.overallMean)} once rolling. Nothing wrong mid-run — you just started cold.`,
      ]),
      metric: `+${Math.round(curve.warmup * 100)}% ramp`,
    },
  };
}

/** error: cluster — a specific moment decided the test. */
export function errorSpikeNote(c: DetectorCtx): Candidate | null {
  const { curve, variant } = c;
  if (!curve) return null;
  if (curve.worstSecErrs < 2 || curve.errTotal < 3) return null;
  return {
    priority: 74,
    note: {
      kind: "error",
      title: variant([`error cluster at ${curve.worstWindowStart}s`, `the ${curve.worstWindowStart}s wobble`]),
      message: variant([
        `${curve.worstWindowErrs} errors landed inside a 3-second window around second ${curve.worstWindowStart} — one rough patch shaped this whole result. When that hits: stop, breathe, restart the line clean instead of pushing through.`,
        `Errors bunched at second ${curve.worstWindowStart} (${curve.worstWindowErrs} in 3s). Panic spikes like that are rhythm breaks, not skill gaps — steadier pacing through hard words prevents the cascade.`,
      ]),
      metric: `${curve.worstWindowErrs} err @ ${curve.worstWindowStart}s`,
    },
  };
}

/** rhythm: burst spread — peak vs trough gap. */
export function spreadNote(c: DetectorCtx): Candidate | null {
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
export function focusNote(c: DetectorCtx): Candidate | null {
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
export function charLossNote(c: DetectorCtx): Candidate | null {
  const { result, variant } = c;
  const { missed, extra } = result.chars;
  if (missed >= 4 && missed >= extra * 2) {
    return {
      priority: 66,
      note: {
        kind: "error",
        title: variant(["dropping letters", "truncated words"]),
        message: variant([
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
export function confusionNote(c: DetectorCtx): Candidate | null {
  const { ev, learning, variant } = c;
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
      title: variant([`finger habit: '${best.expected}' → '${best.typed}'`, `'${best.expected}' keeps turning into '${best.typed}'`]),
      message: variant([
        `You've swapped '${best.expected}' for '${best.typed}' ${best.total}× recently${best.thisTest > 0 ? `, ${best.thisTest} in this very test` : ""}. That's a fixed finger-path habit — slow, deliberate reps on exactly that pair rewire it faster than volume does.`,
        `The scorecard says '${best.expected}' becomes '${best.typed}' under pressure (${best.total}×). Isolate it: type ten slow words containing '${best.expected}' before the next run.`,
      ]),
      metric: `×${best.total}${best.thisTest ? ` · ${best.thisTest} now` : ""}`,
    },
  };
}

/** tip: trigram error context — the transition, not the key. */
export function transitionNote(c: DetectorCtx): Candidate | null {
  const ctx = collectTopErrorContexts(c.learning, 1)[0];
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
export function slowKeysNote(c: DetectorCtx): Candidate | null {
  const { ev, learning } = c;
  const median = calculateMedianLatency(learning) || 150;
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
export function hesitationNote(c: DetectorCtx): Candidate | null {
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
