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

// ---------------------------------------------------------------------------
// Sanitizers — anything read back from localStorage or an imported backup is
// UNTRUSTED (corrupted quota write, hand-edited JSON, older schema). A bad
// payload must degrade to defaults instead of poisoning the engine: e.g. a
// settings.mode of "bogus" falls through generateTest()'s switch and returns
// undefined, which crashes the whole app on the next render.
// ---------------------------------------------------------------------------

const TEST_MODES: Settings["mode"][] = ["adaptive", "time", "words", "quote"];
const ACCENTS: Settings["accent"][] = ["lime", "amber", "cyan", "rose"];
const CARET_STYLES: Settings["caretStyle"][] = ["line", "block", "underline"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : NaN;
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function sanitizeSettings(raw: unknown): Settings {
  const p = isPlainObject(raw) ? raw : {};
  return {
    mode: oneOf(p.mode, TEST_MODES, DEFAULT_SETTINGS.mode),
    timeDuration: clampNum(p.timeDuration, 5, 600, DEFAULT_SETTINGS.timeDuration),
    wordCount: clampNum(p.wordCount, 5, 200, DEFAULT_SETTINGS.wordCount),
    punctuation: boolOr(p.punctuation, DEFAULT_SETTINGS.punctuation),
    numbers: boolOr(p.numbers, DEFAULT_SETTINGS.numbers),
    adaptiveIntensity: clampNum(p.adaptiveIntensity, 0, 100, DEFAULT_SETTINGS.adaptiveIntensity),
    strictMode: boolOr(p.strictMode, DEFAULT_SETTINGS.strictMode),
    liveWpm: boolOr(p.liveWpm, DEFAULT_SETTINGS.liveWpm),
    sound: boolOr(p.sound, DEFAULT_SETTINGS.sound),
    caretStyle: oneOf(p.caretStyle, CARET_STYLES, DEFAULT_SETTINGS.caretStyle),
    accent: oneOf(p.accent, ACCENTS, DEFAULT_SETTINGS.accent),
    showCoach: boolOr(p.showCoach, DEFAULT_SETTINGS.showCoach),
  };
}

export function sanitizeLearning(raw: unknown): LearningData {
  const base = emptyLearning();
  if (!isPlainObject(raw)) return base;
  const p = raw as Partial<LearningData>;

  const keyProfiles: LearningData["keyProfiles"] = {};
  if (isPlainObject(p.keyProfiles)) {
    for (const [k, v] of Object.entries(p.keyProfiles)) {
      if (!isPlainObject(v)) continue;
      keyProfiles[k] = {
        attempts: clampNum(v.attempts, 0, 1e9, 0),
        errRate: clampNum(v.errRate, 0, 1, 0),
        latency: typeof v.latency === "number" && Number.isFinite(v.latency) ? v.latency : null,
        lastSeen: clampNum(v.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
      };
    }
  }

  const bigramProfiles: LearningData["bigramProfiles"] = {};
  if (isPlainObject(p.bigramProfiles)) {
    for (const [k, v] of Object.entries(p.bigramProfiles)) {
      if (!isPlainObject(v)) continue;
      bigramProfiles[k] = {
        attempts: clampNum(v.attempts, 0, 1e9, 0),
        errRate: clampNum(v.errRate, 0, 1, 0),
        latency: typeof v.latency === "number" && Number.isFinite(v.latency) ? v.latency : null,
        lastSeen: clampNum(v.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
      };
    }
  }

  const confusions = Array.isArray(p.confusions)
    ? p.confusions.filter(
        (c): c is LearningData["confusions"][number] =>
          isPlainObject(c) && typeof c.expected === "string" && typeof c.typed === "string"
      )
    : [];
  const errorContexts = Array.isArray(p.errorContexts)
    ? p.errorContexts.filter(
        (c): c is LearningData["errorContexts"][number] =>
          isPlainObject(c) && typeof c.trigram === "string"
      )
    : [];

  return {
    keyProfiles,
    bigramProfiles,
    confusions,
    errorContexts,
    totalKeystrokes: clampNum(p.totalKeystrokes, 0, Number.MAX_SAFE_INTEGER, 0),
    totalChars: clampNum(p.totalChars, 0, Number.MAX_SAFE_INTEGER, 0),
    totalTests: Math.round(clampNum(p.totalTests, 0, 1e6, 0)),
    totalTimeMs: clampNum(p.totalTimeMs, 0, Number.MAX_SAFE_INTEGER, 0),
    lastVersion: 2,
  };
}

export function sanitizeStats(raw: unknown): StatsData {
  const base = emptyStats();
  if (!isPlainObject(raw)) return base;
  const p = raw as Partial<StatsData>;

  const history = Array.isArray(p.history)
    ? p.history.filter(
        (h): h is TestResult => isPlainObject(h) && typeof h.id === "string" && typeof h.wpm === "number"
      )
    : base.history;

  const personalBests: StatsData["personalBests"] = {};
  if (isPlainObject(p.personalBests)) {
    for (const [k, v] of Object.entries(p.personalBests)) {
      if (isPlainObject(v) && typeof v.wpm === "number") {
        personalBests[k] = {
          wpm: v.wpm,
          accuracy: clampNum(v.accuracy, 0, 100, 0),
          timestamp: clampNum(v.timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
        };
      }
    }
  }

  return {
    history,
    personalBests,
    streakDays: Math.round(clampNum(p.streakDays, 0, 36500, 0)),
    lastTestDay: typeof p.lastTestDay === "string" ? p.lastTestDay : base.lastTestDay,
    firstTestDay: typeof p.firstTestDay === "string" ? p.firstTestDay : null,
  };
}

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
  if (!raw) return emptyLearning();
  try {
    return sanitizeLearning(JSON.parse(raw));
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
    return sanitizeStats(JSON.parse(raw));
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
