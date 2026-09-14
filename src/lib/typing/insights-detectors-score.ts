import { DetectorCtx, recentSameLabel, type Candidate } from "./insights-detectors";
import { memRetrievability } from "./memory";

export function recordNote(c: DetectorCtx): Candidate | null {
  const { result, variant } = c;
  if (result.wpm <= 0) return null;
  const prev = c.prevBest !== undefined ? c.prevBest : c.stats.personalBests[result.modeLabel];
  if (result.isPersonalBest) {
    if (prev && result.wpm > prev.wpm) {
      return {
        priority: 85,
        note: {
          kind: "record",
          title: variant(["new personal best", "record falls"]),
          message: variant([
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
export function errorTaxNote(c: DetectorCtx): Candidate | null {
  const { result, variant } = c;
  const tax = result.rawWpm - result.wpm;
  if (tax < 6 || result.rawWpm <= 0) return null;
  return {
    priority: tax >= 10 ? 88 : 80,
    note: {
      kind: "speed",
      title: variant(["the error tax", "mistakes are expensive"]),
      message: variant([
        `Raw pace was ${result.rawWpm} wpm; ${tax} of it leaked away to errors. The fix isn't faster fingers today — it's cleaner ones.`,
        `You typed at ${result.rawWpm} raw and kept only ${result.wpm}. At ${result.accuracy}% accuracy, easing off ~10% nets you more speed, not less.`,
      ]),
      metric: `${result.rawWpm} → ${result.wpm}`,
    },
  };
}

/** accuracy bands with per-test error counts. */
export function accuracyNote(c: DetectorCtx): Candidate | null {
  const { result, ev, variant } = c;
  if (result.accuracy < 92) {
    if (result.chars.incorrect + result.chars.extra <= 3) return null;
    return {
      priority: 92,
      note: {
        kind: "accuracy",
        title: variant(["accuracy below threshold", "sloppy reps detected"]),
        message: variant([
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
        title: variant(["elite precision", "surgical run"]),
        message: variant([
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
export function wpmTrendNote(c: DetectorCtx): Candidate | null {
  const { result, variant } = c;
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
        title: variant(["above your curve", "trending up"]),
        message: variant([
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
export function accuracyTrendNote(c: DetectorCtx): Candidate | null {
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

/** speed: cleared for a push. */
export function speedPushNote(c: DetectorCtx): Candidate | null {
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
export function recoveredNote(c: DetectorCtx): Candidate | null {
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
export function dueNote(c: DetectorCtx): Candidate | null {
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
      message: `${due} keys and transitions come due within two days. Adaptive mode resurfaces them before they fade — a couple of runs there clears the queue.`,
      metric: `${due} due`,
    },
  };
}

/** streak. */
export function streakNote(c: DetectorCtx): Candidate | null {
  if (c.stats.streakDays < 2) return null;
  return {
    priority: 30,
    note: {
      kind: "streak",
      title: `${c.stats.streakDays}-day streak`,
      message: c.variant([
        `${c.stats.streakDays} days in a row. Muscle memory compounds daily — short sessions beat marathons.`,
        `Day ${c.stats.streakDays}. The fingers remember what the calendar confirms — see you tomorrow.`,
      ]),
      metric: `${c.stats.streakDays}d`,
    },
  };
}

/** adaptive nudge for new users not yet in adaptive mode. */
export function adaptiveNudgeNote(c: DetectorCtx): Candidate | null {
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
