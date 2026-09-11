import type { LearningData, Settings, StatsData, TestResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { emptyLearning } from "./profiles";

const KEYS = {
  settings: "cadence.settings.v1",
  learning: "cadence.learning.v1",
  stats: "cadence.stats.v1",
  onboarded: "cadence.onboarded.v1",
};

const MAX_HISTORY = 500;

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
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(KEYS.settings, JSON.stringify(settings));
}

export function loadLearning(): LearningData {
  const raw = safeGet(KEYS.learning);
  if (!raw) return emptyLearning();
  try {
    const parsed = JSON.parse(raw) as LearningData;
    return { ...emptyLearning(), ...parsed };
  } catch {
    return emptyLearning();
  }
}

export function saveLearning(learning: LearningData): void {
  safeSet(KEYS.learning, JSON.stringify(learning));
}

export function emptyStats(): StatsData {
  return {
    history: [],
    personalBests: {},
    streakDays: 0,
    lastTestDay: "",
    firstTestDay: null,
  };
}

export function loadStats(): StatsData {
  const raw = safeGet(KEYS.stats);
  if (!raw) return emptyStats();
  try {
    const parsed = JSON.parse(raw) as StatsData;
    return { ...emptyStats(), ...parsed };
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats: StatsData): void {
  safeSet(KEYS.stats, JSON.stringify(stats));
}

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  let streakDays = stats.streakDays;
  if (stats.lastTestDay !== today) {
    const gap = stats.lastTestDay ? daysBetween(stats.lastTestDay, today) : Infinity;
    streakDays = gap === 1 ? stats.streakDays + 1 : 1;
  } else if (streakDays === 0) {
    streakDays = 1;
  }

  const history = [stamped, ...stats.history].slice(0, MAX_HISTORY);
  return {
    history,
    personalBests,
    streakDays,
    lastTestDay: today,
    firstTestDay: stats.firstTestDay ?? today,
  };
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
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      learning: { ...emptyLearning(), ...parsed.learning },
      stats: { ...emptyStats(), ...parsed.stats },
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
