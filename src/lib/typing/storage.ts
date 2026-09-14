import type { LearningData, Settings, StatsData, TestResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { createEmptyLearning } from "./profiles";
import {
  MAX_ACTIVITY_DAYS, MAX_HISTORY, createEmptyStats,
  sanitizeLearning, sanitizeSettings, sanitizeStats,
} from "./sanitize";

const KEYS = {
  settings: "cadence.settings.v1",
  learning: "cadence.learning.v1",
  stats: "cadence.stats.v1",
  onboarded: "cadence.onboarded.v1",
};

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage full / disabled — degrade silently
  }
}

export function loadSettings(): Settings {
  const raw = safeGet(KEYS.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(KEYS.settings, JSON.stringify(settings));
}

export function loadLearning(): LearningData {
  const raw = safeGet(KEYS.learning);
  if (!raw) return createEmptyLearning();
  try {
    return sanitizeLearning(JSON.parse(raw));
  } catch {
    return createEmptyLearning();
  }
}

/**
 * Schema version recorded in the persisted learning payload (0 if absent or
 * corrupt). Lets the page detect "stored < current" migrations without
 * reaching into raw localStorage keys from outside this module.
 */
export function storedLearningVersion(): number {
  const raw = safeGet(KEYS.learning);
  if (!raw) return 0;
  try {
    const p = JSON.parse(raw) as { lastVersion?: unknown };
    return typeof p.lastVersion === "number" && Number.isFinite(p.lastVersion)
      ? Math.max(0, Math.floor(p.lastVersion))
      : 0;
  } catch {
    return 0;
  }
}

export function saveLearning(learning: LearningData): void {
  safeSet(KEYS.learning, JSON.stringify(learning));
}

export function loadStats(): StatsData {
  const raw = safeGet(KEYS.stats);
  if (!raw) return createEmptyStats();
  try {
    return sanitizeStats(JSON.parse(raw));
  } catch {
    return createEmptyStats();
  }
}

export function saveStats(stats: StatsData): void {
  safeSet(KEYS.stats, JSON.stringify(stats));
}

/**
 * Local-timezone calendar day for a timestamp, "yyyy-mm-dd" — the same key
 * format as todayKey()/lastTestDay (never UTC: a 23:40 test must land on
 * the day the user experienced, not the next UTC day).
 */
export function isoDayLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey(d = new Date()): string {
  return isoDayLocal(d);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/**
 * Append a result to history, update personal bests and streak.
 * Returns updated stats (with isPersonalBest already set on the result).
 */
export function recordResult(stats: StatsData, result: TestResult): StatsData {
  const pbKey = result.modeLabel;
  const prevBest = stats.personalBests[pbKey];
  const isPB = !prevBest || result.wpm > prevBest.wpm;
  const stamped: TestResult = { ...result, isPersonalBest: isPB };

  const personalBests = { ...stats.personalBests };
  if (isPB) {
    personalBests[pbKey] = { wpm: result.wpm, accuracy: result.accuracy, timestamp: result.timestamp };
  }

  const today = todayKey();
  const streakDays = advanceStreak(stats, today);

  const history = [stamped, ...stats.history].slice(0, MAX_HISTORY);

  return {
    history,
    personalBests,
    dailyActivity: bumpDayLedger(stats.dailyActivity, today, result.duration, result.wpm),
    streakDays,
    lastTestDay: today,
    firstTestDay: stats.firstTestDay ?? today,
  };
}

/** streak = consecutive local days ending today; any 2+ day gap resets to 1 */
function advanceStreak(stats: StatsData, today: string): number {
  if (stats.lastTestDay === today) return Math.max(stats.streakDays, 1);
  const gap = stats.lastTestDay ? daysBetween(stats.lastTestDay, today) : Infinity;
  return gap === 1 ? stats.streakDays + 1 : 1;
}

/** bump today's heatmap entry and prune days that left the ledger window */
function bumpDayLedger(
  ledger: StatsData["dailyActivity"],
  today: string,
  durationS: number,
  wpm: number,
): StatsData["dailyActivity"] {
  const dailyActivity = { ...ledger };
  const t = dailyActivity[today] ?? { tests: 0, timeS: 0, bestWpm: null };
  dailyActivity[today] = {
    tests: Math.min(5000, t.tests + 1),
    timeS: Math.min(86400, Math.round(t.timeS + Math.max(0, durationS))),
    bestWpm:
      t.bestWpm === null
        ? Math.max(0, Math.min(500, wpm))
        : Math.max(t.bestWpm, Math.min(500, wpm)),
  };
  const cutoff = isoDayLocal(new Date(Date.now() - MAX_ACTIVITY_DAYS * 86400000));
  for (const k of Object.keys(dailyActivity)) {
    if (k < cutoff) delete dailyActivity[k];
  }
  return dailyActivity;
}

export interface ExportPayload {
  app: "cadence";
  version: 1;
  exportedAt: string;
  settings: Settings;
  learning: LearningData;
  stats: StatsData;
}

export function exportData(settings: Settings, learning: LearningData, stats: StatsData): string {
  const payload: ExportPayload = {
    app: "cadence",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    learning,
    stats,
  };
  return JSON.stringify(payload, null, 2);
}

export function importData(json: string): { settings: Settings; learning: LearningData; stats: StatsData } | null {
  try {
    const parsed = JSON.parse(json) as ExportPayload;
    if (parsed.app !== "cadence") return null;
    return {
      settings: sanitizeSettings(parsed.settings),
      learning: sanitizeLearning(parsed.learning),
      stats: sanitizeStats(parsed.stats),
    };
  } catch {
    return null;
  }
}

export function persistAll(settings: Settings, learning: LearningData, stats: StatsData): void {
  saveSettings(settings);
  saveLearning(learning);
  saveStats(stats);
}

export function isOnboarded(): boolean {
  return safeGet(KEYS.onboarded) === "1";
}

export function setOnboarded(): void {
  safeSet(KEYS.onboarded, "1");
}

export function wipeAll(): void {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}
