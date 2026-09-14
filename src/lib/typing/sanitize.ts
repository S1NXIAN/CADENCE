import type { LearningData, Settings, StatsData, TestResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { createEmptyLearning } from "./profiles";
import { sanitizeMem } from "./memory";

export const MAX_HISTORY = 500;
export const MAX_ACTIVITY_DAYS = 400; // heatmap ledger window (longer than a 53-week grid)
export const MAX_WORD_PROFILES = 4000; // word memory ceiling — keep the most recently seen

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

/**
 * Settings flags were renamed to read as questions (§2.2); payloads written
 * before the rename carry the old keys. Read new key first, fall back to the
 * legacy one — the next save writes the new schema for good.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const p = isPlainObject(raw) ? raw : {};
  return {
    mode: oneOf(p.mode, TEST_MODES, DEFAULT_SETTINGS.mode),
    timeDuration: clampNum(p.timeDuration, 5, 600, DEFAULT_SETTINGS.timeDuration),
    wordCount: clampNum(p.wordCount, 5, 200, DEFAULT_SETTINGS.wordCount),
    hasPunctuation: boolOr(p.hasPunctuation, boolOr(p.punctuation, DEFAULT_SETTINGS.hasPunctuation)),
    hasNumbers: boolOr(p.hasNumbers, boolOr(p.numbers, DEFAULT_SETTINGS.hasNumbers)),
    adaptiveIntensity: clampNum(p.adaptiveIntensity, 0, 100, DEFAULT_SETTINGS.adaptiveIntensity),
    isStrict: boolOr(p.isStrict, boolOr(p.strictMode, DEFAULT_SETTINGS.isStrict)),
    isLiveWpmOn: boolOr(p.isLiveWpmOn, boolOr(p.liveWpm, DEFAULT_SETTINGS.isLiveWpmOn)),
    isSoundOn: boolOr(p.isSoundOn, boolOr(p.sound, DEFAULT_SETTINGS.isSoundOn)),
    caretStyle: oneOf(p.caretStyle, CARET_STYLES, DEFAULT_SETTINGS.caretStyle),
    accent: oneOf(p.accent, ACCENTS, DEFAULT_SETTINGS.accent),
    isCoachOn: boolOr(p.isCoachOn, boolOr(p.showCoach, DEFAULT_SETTINGS.isCoachOn)),
    usesOnlinePacks: boolOr(p.usesOnlinePacks, boolOr(p.onlinePacks, DEFAULT_SETTINGS.usesOnlinePacks)),
  };
}

export function sanitizeLearning(raw: unknown): LearningData {
  const base = createEmptyLearning();
  if (!isPlainObject(raw)) return base;
  const p = raw as Partial<LearningData>;

  const keyProfiles = sanitizeItemProfiles(p.keyProfiles, /^[a-z0-9',.;!?-]{1}$/i);
  const bigramProfiles = sanitizeItemProfiles(p.bigramProfiles, /^[a-z0-9',.;!?-]{2}$/i);

  const confusions = Array.isArray(p.confusions)
    ? p.confusions
        .map((c): LearningData["confusions"][number] | null => {
          if (!isPlainObject(c)) return null;
          if (typeof c.expected !== "string" || typeof c.typed !== "string") return null;
          if (!c.expected || !c.typed) return null;
          return {
            expected: c.expected.slice(0, 3),
            typed: c.typed.slice(0, 3),
            count: Math.round(clampNum(c.count, 0, 1e6, 1)),
            lastSeen: clampNum(c.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
          };
        })
        .filter((c): c is LearningData["confusions"][number] => c !== null)
        .slice(0, 200)
    : [];
  const errorContexts = Array.isArray(p.errorContexts)
    ? p.errorContexts
        .map((c): LearningData["errorContexts"][number] | null => {
          if (!isPlainObject(c) || typeof c.trigram !== "string" || !c.trigram) return null;
          return {
            trigram: c.trigram.slice(0, 8),
            count: Math.round(clampNum(c.count, 0, 1e6, 1)),
            lastSeen: clampNum(c.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
          };
        })
        .filter((c): c is LearningData["errorContexts"][number] => c !== null)
        .slice(0, 200)
    : [];

  return {
    keyProfiles,
    bigramProfiles,
    wordProfiles: sanitizeWordProfiles(p.wordProfiles),
    confusions,
    errorContexts,
    totalKeystrokes: clampNum(p.totalKeystrokes, 0, Number.MAX_SAFE_INTEGER, 0),
    totalChars: clampNum(p.totalChars, 0, Number.MAX_SAFE_INTEGER, 0),
    totalTests: Math.round(clampNum(p.totalTests, 0, 1e6, 0)),
    totalTimeMs: clampNum(p.totalTimeMs, 0, Number.MAX_SAFE_INTEGER, 0),
    lastVersion: 4,
  };
}

/**
 * Key/bigram profile maps share one shape and one set of trust rules: keys
 * must match the tracked alphabet, every number clamped, latency capped (a
 * hand-edited 1e300 is finite and would poison calculateMedianLatency and
 * collapse ALL urgency/grading math), corrupt mem reseeded from the item's
 * own lifetime stats. v2 payloads (EWMA, no mem) are migrated by sanitizeMem.
 */
function sanitizeItemProfiles(
  raw: unknown,
  keyPattern: RegExp,
): LearningData["keyProfiles"] {
  const profiles: LearningData["keyProfiles"] = {};
  if (!isPlainObject(raw)) return profiles;
  for (const [k, v] of Object.entries(raw)) {
    if (!isPlainObject(v)) continue;
    if (!keyPattern.test(k)) continue;
    const attempts = clampNum(v.attempts, 0, 1e9, 0);
    const errRate = clampNum(v.errRate, 0, 1, 0);
    const lastSeen = clampNum(v.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0);
    const latencyRaw = typeof v.latency === "number" && Number.isFinite(v.latency) ? v.latency : null;
    const latency = latencyRaw !== null ? Math.min(2000, Math.max(0, latencyRaw)) : null;
    profiles[k.toLowerCase()] = {
      attempts,
      errors: Math.round(clampNum(v.errors, 0, 1e9, attempts * errRate)),
      errRate,
      latency,
      lastSeen,
      mem: sanitizeMem(v.mem, errRate, attempts, lastSeen),
    };
  }
  return profiles;
}

function sanitizeWordProfiles(raw: unknown): LearningData["wordProfiles"] {
  const profiles: LearningData["wordProfiles"] = {};
  if (!isPlainObject(raw)) return profiles;
  let entries = Object.entries(raw);
  // ceiling: a runaway profile (or hostile import) can't balloon localStorage;
  // keep the most recently seen words — stale ones rebuild naturally
  if (entries.length > MAX_WORD_PROFILES) {
    const lastOf = (e: [string, unknown]): number =>
      isPlainObject(e[1]) && typeof (e[1] as { lastSeen?: unknown }).lastSeen === "number"
        ? (e[1] as { lastSeen: number }).lastSeen
        : 0;
    entries = entries.sort((a, b) => lastOf(b) - lastOf(a)).slice(0, MAX_WORD_PROFILES);
  }
  for (const [k, v] of entries) {
    if (!isPlainObject(v)) continue;
    if (!/^[a-z][a-z'-]{0,15}$/.test(k)) continue;
    const attempts = Math.round(clampNum(v.attempts, 0, 1e8, 0));
    const errors = Math.round(clampNum(v.errors, 0, attempts, 0));
    const bestWpmRaw = typeof v.bestWpm === "number" && Number.isFinite(v.bestWpm) ? v.bestWpm : null;
    const lastSeen = clampNum(v.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0);
    profiles[k] = {
      attempts,
      errors,
      bestWpm: bestWpmRaw !== null ? clampNum(bestWpmRaw, 0, 500, 0) : null,
      lastSeen,
      // missing/corrupt mem is reseeded from the word's own lifetime stats
      mem: sanitizeMem(v.mem, attempts > 0 ? errors / attempts : 0, attempts, lastSeen),
    };
  }
  return profiles;
}

export function sanitizeStats(raw: unknown): StatsData {
  const base = createEmptyStats();
  if (!isPlainObject(raw)) return base;
  const p = raw as Partial<StatsData>;

  // History entries are untrusted too: `{"wpm": 1e999}` parses as Infinity,
  // hand-edited fields can be negative/strings — every numeric field is
  // clamped and arrays truncated so charts/insights math can never see NaN.
  const history = Array.isArray(p.history)
    ? p.history
        .filter(
          (h): h is TestResult =>
            isPlainObject(h) && typeof (h as Partial<TestResult>).id === "string" && typeof (h as Partial<TestResult>).wpm === "number"
        )
        .slice(0, MAX_HISTORY)
        .map(sanitizeHistoryEntry)
    : base.history;

  return {
    history,
    personalBests: sanitizePersonalBests(p.personalBests),
    dailyActivity: sanitizeDailyActivity(p.dailyActivity),
    streakDays: Math.round(clampNum(p.streakDays, 0, 36500, 0)),
    lastTestDay: typeof p.lastTestDay === "string" ? p.lastTestDay : base.lastTestDay,
    firstTestDay: typeof p.firstTestDay === "string" ? p.firstTestDay : null,
  };
}

function sanitizeHistoryEntry(src: TestResult): TestResult {
  const h = src as unknown as Record<string, unknown>;
  const MAX_SAMPLES = 7200; // 2h at 1Hz
  const charsSrc: Record<string, unknown> = isPlainObject(h.chars) ? h.chars : {};
  const samples = Array.isArray(h.samples)
    ? h.samples
        .filter(
          (s): s is TestResult["samples"][number] =>
            isPlainObject(s) &&
            typeof (s as Partial<TestResult["samples"][number]>).second === "number" &&
            typeof (s as Partial<TestResult["samples"][number]>).wpm === "number"
        )
        .slice(0, MAX_SAMPLES)
        .map((s) => ({
          second: Math.round(clampNum(s.second, 0, MAX_SAMPLES, 0)),
          wpm: clampNum(s.wpm, 0, 500, 0),
          raw: clampNum(s.raw, 0, 700, 0),
          errors: Math.round(clampNum(s.errors, 0, 1e6, 0)),
        }))
    : [];
  return {
    id: String(h.id).slice(0, 64),
    timestamp: clampNum(h.timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
    mode: oneOf(h.mode, TEST_MODES, "words" as Settings["mode"]),
    modeLabel: typeof h.modeLabel === "string" && h.modeLabel ? h.modeLabel.slice(0, 60) : "unknown",
    wpm: clampNum(h.wpm, 0, 500, 0),
    rawWpm: clampNum(h.rawWpm, 0, 700, 0),
    accuracy: clampNum(h.accuracy, 0, 100, 0),
    consistency: clampNum(h.consistency, 0, 100, 0),
    duration: clampNum(h.duration, 0, 36000, 0),
    chars: {
      correct: Math.round(clampNum(charsSrc.correct, 0, 1e7, 0)),
      incorrect: Math.round(clampNum(charsSrc.incorrect, 0, 1e7, 0)),
      extra: Math.round(clampNum(charsSrc.extra, 0, 1e7, 0)),
      missed: Math.round(clampNum(charsSrc.missed, 0, 1e7, 0)),
    },
    samples,
    focusKeys: Array.isArray(h.focusKeys)
      ? h.focusKeys.filter((k): k is string => typeof k === "string").slice(0, 8)
      : [],
    isPersonalBest: boolOr(h.isPersonalBest, false),
  };
}

function sanitizePersonalBests(raw: unknown): StatsData["personalBests"] {
  const personalBests: StatsData["personalBests"] = {};
  if (!isPlainObject(raw)) return personalBests;
  for (const [k, v] of Object.entries(raw)) {
    if (isPlainObject(v) && typeof v.wpm === "number") {
      personalBests[k] = {
        // clamp like history entries — `{"wpm":1e999}` parses as Infinity
        // and would poison every future isPB comparison for that mode
        wpm: clampNum(v.wpm, 0, 500, 0),
        accuracy: clampNum(v.accuracy, 0, 100, 0),
        timestamp: clampNum(v.timestamp, 0, Number.MAX_SAFE_INTEGER, 0),
      };
    }
  }
  return personalBests;
}

/**
 * Activity ledger: only "yyyy-mm-dd" keys, every number clamped (a
 * hand-edited timeS of 1e300 would break the heatmap's color scale),
 * capped to the most recent MAX_ACTIVITY_DAYS days.
 */
function sanitizeDailyActivity(raw: unknown): StatsData["dailyActivity"] {
  const dailyActivity: StatsData["dailyActivity"] = {};
  if (!isPlainObject(raw)) return dailyActivity;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isPlainObject(v)) continue;
    dailyActivity[k] = {
      tests: Math.round(clampNum(v.tests, 0, 5000, 0)),
      timeS: Math.round(clampNum(v.timeS, 0, 86400, 0)),
      bestWpm:
        typeof v.bestWpm === "number" && Number.isFinite(v.bestWpm)
          ? clampNum(v.bestWpm, 0, 500, 0)
          : null,
    };
  }
  const dayKeys = Object.keys(dailyActivity).sort();
  for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - MAX_ACTIVITY_DAYS))) {
    delete dailyActivity[k];
  }
  return dailyActivity;
}

export function createEmptyStats(): StatsData {
  return {
    history: [],
    personalBests: {},
    dailyActivity: {},
    streakDays: 0,
    lastTestDay: "",
    firstTestDay: null,
  };
}
