import type {
  CoachInsight,
  LearningData,
  PersonalBest,
  Settings,
  StatsData,
  TestResult,
} from "./types";
import type { CurveAnalysis, EventAnalysis } from "./audit";
import { recordNote,
  errorTaxNote,
  accuracyNote,
  wpmTrendNote,
  accuracyTrendNote,
  speedPushNote,
  recoveredNote,
  dueNote,
  streakNote,
  adaptiveNudgeNote } from "./insights-detectors-score";
import { fadeNote,
  warmupNote,
  errorSpikeNote,
  spreadNote,
  focusNote,
  charLossNote,
  confusionNote,
  transitionNote,
  slowKeysNote,
  hesitationNote } from "./insights-detectors-stream";

/** one detector's verdict: the note plus its urgency (higher = more urgent) */
export interface Candidate {
  note: CoachInsight;
  priority: number;
}

export interface DetectorCtx {
  result: TestResult;
  ev: EventAnalysis;
  curve: CurveAnalysis | null;
  stats: StatsData;
  learning: LearningData;
  settings?: Settings;
  prevBest?: PersonalBest | null;
  /** deterministic phrase variant for this test (so repeats don't read identical) */
  variant: <T>(arr: T[]) => T;
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function recentSameLabel(stats: StatsData, label: string, excludeId: string): TestResult[] {
  return stats.history.filter((h) => h.modeLabel === label && h.id !== excludeId);
}

/** all detectors, evaluated per finished test; the selector caps by kind */
export const DETECTORS: Array<(c: DetectorCtx) => Candidate | null> = [
recordNote,
  errorTaxNote,
  accuracyNote,
  wpmTrendNote,
  accuracyTrendNote,
  speedPushNote,
  recoveredNote,
  dueNote,
  streakNote,
  adaptiveNudgeNote,
  fadeNote,
  warmupNote,
  errorSpikeNote,
  spreadNote,
  focusNote,
  charLossNote,
  confusionNote,
  transitionNote,
  slowKeysNote,
  hesitationNote,
];
