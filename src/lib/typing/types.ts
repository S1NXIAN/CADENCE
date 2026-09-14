export type TestMode = "adaptive" | "time" | "words" | "quote";

export type CaretStyle = "line" | "block" | "underline";

export interface Settings {
  mode: TestMode;
  timeDuration: number; // seconds
  wordCount: number;
  hasPunctuation: boolean;
  hasNumbers: boolean;
  adaptiveIntensity: number; // 0..100 — how aggressively tests target weak keys
  isStrict: boolean; // no backspace — forces accuracy
  isLiveWpmOn: boolean;
  isSoundOn: boolean;
  caretStyle: CaretStyle;
  accent: "lime" | "amber" | "cyan" | "rose";
  isCoachOn: boolean;
  usesOnlinePacks: boolean; // when online: fetch + cache extra word/quote packs (full-potential layer)
}

/**
 * FSRS memory state for one tracked item (a key or a key transition).
 * Serializable subset of a ts-fsrs card — dates stored as epoch ms so the
 * persistence format never depends on Date JSON quirks.
 *   stability   — days until retrievability decays to 90% (S in FSRS)
 *   difficulty  — 1..10, how error-prone this item is for this typist (D in FSRS)
 *   reps/lapses — lifetime review and forgetting counts (confidence measure)
 *   state       — ts-fsrs State enum value (0 New, 1 Learning, 2 Review, 3 Relearning)
 */
export interface MemCard {
  s: number;
  d: number;
  reps: number;
  lapses: number;
  state: number;
  ls: number; // (re)learning step index — must persist or cards never graduate to Review
  last: number | null; // last review epoch ms
  due: number; // next scheduled review epoch ms
}

export interface CharEvent {
  t: number; // ms since session start
  expected: string | null; // target char (null = extra char typed)
  typed: string; // what was actually pressed
  isCorrect: boolean;
}

export interface SecondSample {
  second: number;
  wpm: number;
  raw: number;
  errors: number;
}

export interface TestResult {
  id: string;
  timestamp: number;
  mode: TestMode;
  modeLabel: string; // e.g. "time 30", "adaptive 25", "quote"
  wpm: number;
  rawWpm: number;
  accuracy: number; // 0..100
  consistency: number; // 0..100
  duration: number; // seconds actually spent
  chars: { correct: number; incorrect: number; extra: number; missed: number };
  samples: SecondSample[];
  focusKeys: string[]; // top weak keys the test targeted (adaptive)
  isPersonalBest: boolean;
}

export interface KeyProfile {
  attempts: number; // cumulative exposures (lifetime)
  errors: number; // cumulative errors on this key (lifetime, feeds prior shrinkage)
  errRate: number; // EWMA 0..1 (recency-weighted)
  latency: number | null; // EWMA ms between keystrokes for this key
  lastSeen: number; // timestamp
  mem: MemCard | null; // FSRS memory state (null = never reviewed)
}

export interface BigramProfile {
  attempts: number;
  errors: number;
  errRate: number;
  latency: number | null;
  lastSeen: number;
  mem: MemCard | null;
}

/**
 * One word's final committed attempt in a finished test, captured by the
 * session hook (word diffs + timing are only known there — backspaces are
 * invisible to the event log, and word boundaries aren't reconstructible
 * from it either because ctrl+backspace pops already-logged words).
 *   ms      — wall time of the FINAL attempt (first keystroke → space), null
 *             when the attempt produced no keystrokes
 *   errKeys — wrong keystrokes during the attempt, INCLUDING ones the user
 *             later backspaced away (a recovered slip still happened)
 *   isPartial — attempt truncated by the timer (time mode) or finished with
 *             junk; skipped by the scheduler entirely
 */
export interface WordOutcome {
  target: string; // displayed target (post punctuation/number transforms)
  typed: string; // final committed text
  ms: number | null;
  errKeys: number;
  isPartial?: boolean;
}

/**
 * Per-word learning profile: lifetime tally + FSRS memory state, exactly the
 * shape keys/bigrams use (memory.ts) so one scheduler drives all three layers.
 * The key is the NORMALIZED word (lowercased, generator punctuation stripped).
 */
export interface WordProfile {
  attempts: number; // lifetime committed attempts of this word
  errors: number; // attempts whose final diff was imperfect
  bestWpm: number | null; // best wpm on a PERFECT attempt (fastest-words list)
  lastSeen: number; // timestamp of last attempt
  mem: MemCard | null; // FSRS scheduling state (null = never reviewed)
}

// confusion pair: expected -> typed
export interface ConfusionPair {
  expected: string;
  typed: string;
  count: number;
  lastSeen: number;
}

// trigram error context: the 2 keys typed immediately BEFORE a mistake + the
// expected key that was fumbled. Captures "key combination" failures that
// per-key stats can't see (e.g. errors on 'e' specifically after 'th').
export interface ErrorContext {
  trigram: string; // prev2 + prev1 + expected, lowercase
  count: number;
  lastSeen: number;
}

export interface LearningData {
  keyProfiles: Record<string, KeyProfile>;
  bigramProfiles: Record<string, BigramProfile>;
  wordProfiles: Record<string, WordProfile>; // normalized word -> profile
  confusions: ConfusionPair[];
  errorContexts: ErrorContext[];
  totalKeystrokes: number;
  totalChars: number;
  totalTests: number;
  totalTimeMs: number;
  lastVersion: number;
}

export interface PersonalBest {
  wpm: number;
  accuracy: number;
  timestamp: number;
}

/**
 * One day's practice volume for the activity heatmap. Kept as a compact
 * ledger (date string -> DayActivity) because stats.history is capped at
 * MAX_HISTORY=500 entries — heavy users would see older days silently go
 * dark on a history-derived heatmap. ~90 bytes/day, pruned to 400 days.
 */
export interface DayActivity {
  tests: number;
  timeS: number; // seconds actually spent typing that day
  bestWpm: number | null; // best wpm recorded that day
}

export interface StatsData {
  history: TestResult[];
  personalBests: Record<string, PersonalBest>; // key: modeLabel
  dailyActivity: Record<string, DayActivity>; // "yyyy-mm-dd" (local) -> volume
  streakDays: number;
  lastTestDay: string; // yyyy-mm-dd
  firstTestDay: string | null;
}

export interface WeakKey {
  key: string;
  weakness: number; // 0..1+ composite
  errRate: number;
  latency: number | null;
  attempts: number;
}

/**
 * A coach note. `kind` drives the icon and tone; `title` is the short bold
 * headline (the observation), `message` the explanation/coaching, and
 * `metric` an optional compact stat chip shown on the right
 * (e.g. "78 → 61 wpm", "'e'→'r' ×7").
 */
export type CoachInsightKind =
  | "focus"
  | "accuracy"
  | "speed"
  | "trend"
  | "record"
  | "streak"
  | "tip"
  | "error" // this-test error diagnosis (clusters, dropped letters, slips)
  | "rhythm" // consistency / stamina / warmup / hesitation
  | "recovery"; // progress: keys leaving the watch list

export interface CoachInsight {
  kind: CoachInsightKind;
  title?: string; // short bold headline — the observed fact
  message: string; // coaching body
  metric?: string; // compact stat chip
}

export const ACCENT_COLORS: Record<Settings["accent"], { hue: string; name: string }> = {
  lime: { hue: "#a3e635", name: "Lime" },
  amber: { hue: "#fbbf24", name: "Amber" },
  cyan: { hue: "#2dd4bf", name: "Cyan" },
  rose: { hue: "#fb7185", name: "Rose" },
};

export const DEFAULT_SETTINGS: Settings = {
  mode: "adaptive",
  timeDuration: 30,
  wordCount: 25,
  hasPunctuation: false,
  hasNumbers: false,
  adaptiveIntensity: 65,
  isStrict: false,
  isLiveWpmOn: true,
  isSoundOn: false,
  caretStyle: "line",
  accent: "lime",
  isCoachOn: true,
  usesOnlinePacks: true,
};
