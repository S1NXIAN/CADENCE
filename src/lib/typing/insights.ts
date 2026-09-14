import type {
  CharEvent,
  CoachInsight,
  LearningData,
  PersonalBest,
  Settings,
  StatsData,
  TestResult,
} from "./types";
import { collectWeakBigrams, computeWeakKeys } from "./profiles";
import { analyzeCurve, analyzeEvents } from "./audit";
import { DETECTORS, hashStr, type Candidate, type DetectorCtx } from "./insights-detectors";

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
    variant: <T,>(arr: T[]) => arr[h % arr.length],
  };

  const candidates = DETECTORS.map((run) => run(ctx)).filter(
    (x): x is Candidate => x !== null && x.note.message.length > 0
  );

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
  const bgs = collectWeakBigrams(learning, 3).filter((b) => b.weakness > 0.08).slice(0, 2);

  const horizon = Date.now() + 48 * 3600 * 1000;
  // the word layer feeds the same refresher queue (word-level FSRS) — the
  // preview must count it too or it under-reports what the next test serves
  const due =
    countDueBefore(learning.keyProfiles, horizon) +
    countDueBefore(learning.bigramProfiles, horizon) +
    countDueBefore(learning.wordProfiles, horizon);

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

/** items whose FSRS card has been reviewed at least once and is due within `horizon` */
function countDueBefore(
  profiles: Record<string, { mem: { reps: number; due: number } | null }>,
  horizon: number,
): number {
  let due = 0;
  for (const p of Object.values(profiles)) {
    if (p.mem && p.mem.reps > 0 && p.mem.due <= horizon) due += 1;
  }
  return due;
}
