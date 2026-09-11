export type TestMode = "adaptive" | "time" | "words" | "quote";

export interface Settings {
  mode: TestMode;
  timeDuration: number; // seconds
  wordCount: number;
  punctuation: boolean;
  numbers: boolean;
  adaptiveIntensity: number; // 0..100 — how aggressively tests target weak keys
  strictMode: boolean; // no backspace — forces accuracy
  liveWpm: boolean;
  sound: boolean;
  caretStyle: "line" | "block" | "underline";
  accent: "lime" | "amber" | "cyan" | "rose";
  showCoach: boolean;
}

export interface CharEvent {
  t: number; // ms since session start
  expected: string | null; // target char (null = extra char typed)
  typed: string; // what was actually pressed
  correct: boolean;
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
  attempts: number; // decayed exposure count
  errRate: number; // EWMA 0..1
  latency: number | null; // EWMA ms between keystrokes for this key
  lastSeen: number; // timestamp
}

export interface BigramProfile {
  attempts: number;
  errRate: number;
  latency: number | null;
  lastSeen: number;
}

// confusion pair: expected -> typed
export interface ConfusionPair {
  expected: string;
  typed: string;
  count: number;
  lastSeen: number;
}

export interface LearningData {
  keyProfiles: Record<string, KeyProfile>;
  bigramProfiles: Record<string, BigramProfile>;
  confusions: ConfusionPair[];
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

export interface StatsData {
  history: TestResult[];
  personalBests: Record<string, PersonalBest>; // key: modeLabel
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

export interface CoachInsight {
  kind: "focus" | "accuracy" | "speed" | "trend" | "record" | "streak" | "tip";
  message: string;
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
  punctuation: false,
  numbers: false,
  adaptiveIntensity: 65,
  strictMode: false,
  liveWpm: true,
  sound: false,
  caretStyle: "line",
  accent: "lime",
  showCoach: true,
};
