import type {
  CharEvent,
  LearningData,
  PersonalBest,
  StatsData,
  TestResult,
} from "./types";
import { calculateMedianLatency } from "./profiles";
import { diffWord } from "./diff";

/**
 * Test audit — the structured forensic layer behind the results screen.
 *
 * Everything here is computed from data the app already records for the
 * finished test (keystroke event log, per-second samples, final word diffs)
 * plus the lifetime learning model. The coach prose (insights.ts) and the
 * results panels (results.tsx) both consume THIS analysis, so the numbers on
 * screen and the sentences underneath them can never disagree.
 */

export const HESITATION_MS = 900;
const LAT_MAX = 2000; // pauses longer than this are thinking, not typing
const TRACK_RE = /[a-z0-9';.,!?-]/i;

// ---------------------------------------------------------------------------
// Per-test keystroke forensics
// ---------------------------------------------------------------------------

export interface EventAnalysis {
  keystrokes: number;
  errors: number; // every non-correct keystroke (wrong, extra, dropped)
  missed: number; // expected chars that never landed (synthetic "" events)
  extra: number; // chars typed past the end of a word
  confusions: Map<string, number>; // "e>r" -> count, this test
  focusSlips: Map<string, number>; // focus key -> error count, this test
  latencies: Map<string, number[]>; // pressed key -> ms samples, this test
  hesitations: Array<{ ch: string; ms: number }>; // pauses >= HESITATION_MS
  perKey: Map<string, { attempts: number; errors: number }>; // expected key -> exposure this test
}

export function analyzeEvents(events: CharEvent[], focusKeys: string[]): EventAnalysis {
  const a: EventAnalysis = {
    keystrokes: events.length,
    errors: 0,
    missed: 0,
    extra: 0,
    confusions: new Map(),
    focusSlips: new Map(),
    latencies: new Map(),
    hesitations: [],
    perKey: new Map(),
  };
  const focus = new Set(focusKeys);
  let prevT: number | null = null;
  let prevCorrect = false;

  const bumpPerKey = (k: string, err: boolean) => {
    const cur = a.perKey.get(k) ?? { attempts: 0, errors: 0 };
    cur.attempts += 1;
    if (err) cur.errors += 1;
    a.perKey.set(k, cur);
    if (focus.has(k)) a.focusSlips.set(k, cur.errors);
  };

  for (const ev of events) {
    const typedTracked = ev.typed.length === 1 && TRACK_RE.test(ev.typed);

    // expected-key exposure (spaces tracked separately — not a key)
    if (ev.expected && ev.expected !== " ") {
      bumpPerKey(ev.expected.toLowerCase(), !ev.isCorrect);
    }

    // inter-key latency on clean presses (mirrors profiles.ingestEvents rules)
    if (ev.isCorrect && typedTracked && prevT !== null && prevCorrect) {
      const d = ev.t - prevT;
      if (d > 20 && d < LAT_MAX) {
        const k = ev.typed.toLowerCase();
        const arr = a.latencies.get(k);
        if (arr) arr.push(d);
        else a.latencies.set(k, [d]);
      }
      if (d >= HESITATION_MS) a.hesitations.push({ ch: ev.typed, ms: d });
    }

    if (!ev.isCorrect) {
      a.errors += 1;
      if (ev.typed === "" && ev.expected) {
        // dropped letter — blame the expected key, including focus keys
        a.missed += 1;
      }
    } else if (ev.expected === null) {
      a.extra += 1;
    }

    // confusion pair (same eligibility rules as profiles.ingestEvents)
    if (
      ev.expected &&
      ev.typed.length === 1 &&
      ev.expected.toLowerCase() !== ev.typed.toLowerCase() &&
      TRACK_RE.test(ev.expected) &&
      TRACK_RE.test(ev.typed)
    ) {
      const key = `${ev.expected.toLowerCase()}>${ev.typed.toLowerCase()}`;
      a.confusions.set(key, (a.confusions.get(key) ?? 0) + 1);
    }

    prevT = ev.t;
    prevCorrect = ev.isCorrect;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Speed-curve forensics (from per-second cumulative samples)
// ---------------------------------------------------------------------------

export interface CurveAnalysis {
  firstMean: number; // mean instantaneous wpm, first 35% of active seconds
  lastMean: number; // same, last 35%
  first3: number; // mean of the first 3 active seconds (cold-open signal)
  overallMean: number;
  sustained: number; // median instantaneous wpm of active seconds
  fade: number; // (first - last) / first, >= 0 — stamina signal
  warmup: number; // (overall - first3) / overall — cold-open signal
  peak: number;
  peakSecond: number;
  low: number; // slowest active second
  errTotal: number;
  worstSec: number;
  worstSecErrs: number;
  worstWindowStart: number; // worst 3-second error window
  worstWindowErrs: number;
}

export function analyzeCurve(result: TestResult): CurveAnalysis | null {
  const s = result.samples;
  if (s.length < 4) return null;

  // cumulative raw → per-second instantaneous wpm:
  // chars(k) = raw(k)*k/12 (cumulative), inst(k) = raw(k)*k - raw(k-1)*(k-1)
  const instAll: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const cum = s[i].raw * s[i].second;
    const prev = i > 0 ? s[i - 1].raw * s[i - 1].second : 0;
    instAll.push(Math.max(0, cum - prev));
  }
  const act: number[] = [];
  const actSec: number[] = [];
  for (let i = 0; i < instAll.length; i++) {
    if (instAll[i] > 0) {
      act.push(instAll[i]);
      actSec.push(s[i].second);
    }
  }
  if (act.length < 4) return null;

  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  const overallMean = mean(act);
  const sorted = [...act].sort((a, b) => a - b);
  const sustained = sorted[Math.floor(sorted.length / 2)];
  const edge = Math.max(2, Math.floor(act.length * 0.35));
  const firstMean = mean(act.slice(0, edge));
  const lastMean = mean(act.slice(act.length - edge));
  const first3 = act.length >= 3 ? mean(act.slice(0, 3)) : firstMean;
  const fade = firstMean > 20 ? Math.max(0, (firstMean - lastMean) / firstMean) : 0;
  const warmup = overallMean > 20 ? Math.max(0, (overallMean - first3) / overallMean) : 0;

  let peak = 0;
  let peakSecond = 0;
  let low = Infinity;
  for (let i = 0; i < act.length; i++) {
    if (act[i] > peak) {
      peak = act[i];
      peakSecond = actSec[i];
    }
    if (act[i] < low) low = act[i];
  }

  let errTotal = 0;
  let worstSec = 0;
  let worstSecErrs = 0;
  for (const x of s) {
    errTotal += x.errors;
    if (x.errors > worstSecErrs) {
      worstSecErrs = x.errors;
      worstSec = x.second;
    }
  }
  let worstWindowStart = 0;
  let worstWindowErrs = 0;
  for (let i = 0; i < s.length; i++) {
    let sum = 0;
    for (let j = i; j < Math.min(s.length, i + 3); j++) sum += s[j].errors;
    if (sum > worstWindowErrs) {
      worstWindowErrs = sum;
      worstWindowStart = s[i].second;
    }
  }

  return {
    firstMean,
    lastMean,
    first3,
    overallMean,
    sustained,
    fade,
    warmup,
    peak,
    peakSecond,
    low,
    errTotal,
    worstSec,
    worstSecErrs,
    worstWindowStart,
    worstWindowErrs,
  };
}

// ---------------------------------------------------------------------------
// Structured audit report
// ---------------------------------------------------------------------------

export interface AuditSpeed {
  peak: number;
  peakSecond: number;
  low: number;
  open: number; // first-3s mean (cold open)
  close: number; // last-35% mean
  sustained: number; // median active second
  fade: number; // 0..1
  warmup: number; // 0..1
}

export interface AuditErrors {
  keystrokes: number;
  bad: number; // wrong + extra + dropped keystrokes
  per100: number; // bad per 100 keystrokes, 1 decimal
  incorrect: number;
  extra: number;
  missed: number;
  correct: number;
  confusions: Array<{ expected: string; typed: string; count: number }>;
  errorSeconds: Array<{ second: number; count: number }>; // seconds with errors, worst first
  worstWindow: { start: number; count: number } | null;
}

export interface AuditRhythm {
  consistency: number;
  hesitations: number;
  longestFreezeMs: number | null;
  freezeBefore: string | null;
  spread: number | null; // peak - low, wpm
}

export interface AuditKeyReport {
  key: string;
  attempts: number;
  errors: number;
  ms: number | null; // median latency this test
}

export interface AuditKeys {
  baseline: number; // personal median latency (ms)
  focus: AuditKeyReport[]; // adaptive drill targets — did they hold?
  slowest: Array<{ key: string; ms: number; over: number }>; // over = % above baseline
  fastest: Array<{ key: string; ms: number }>;
}

export interface AuditWords {
  attempted: number;
  clean: number;
  hardest: Array<{ word: string; errors: number; missed: number; extra: number }>;
}

export interface AuditCompare {
  testNo: number; // this test's number, lifetime
  prevBestWpm: number | null;
  prevBestAcc: number | null;
  pbDelta: number | null; // wpm vs previous best (before this test)
  last10Wpm: number | null;
  last10Acc: number | null;
  wpmDelta: number | null; // vs last-10 same-mode average
  accDelta: number | null;
}

export interface TestAudit {
  speed: AuditSpeed | null;
  errors: AuditErrors;
  rhythm: AuditRhythm;
  keys: AuditKeys;
  words: AuditWords;
  compare: AuditCompare;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Build the full structured audit for a finished test.
 *
 * `targets` is the word list the test presented; `typed` is the final
 * committed attempt per word (both captured at finish time — the event log
 * alone can't reconstruct word boundaries through backspaces).
 * `stats` must be the PRE-record stats (history without this test) so the
 * comparisons measure against the world as it was before this run.
 */
export function buildTestAudit(
  result: TestResult,
  events: CharEvent[],
  targets: string[],
  typed: string[],
  stats: StatsData,
  learning: LearningData,
  prevBest?: PersonalBest | null
): TestAudit {
  const ev = analyzeEvents(events, result.focusKeys);
  const curve = analyzeCurve(result);

  // ---- speed anatomy -------------------------------------------------------
  const speed: AuditSpeed | null = curve
    ? {
        peak: Math.round(curve.peak),
        peakSecond: curve.peakSecond,
        low: Math.round(curve.low),
        open: Math.round(curve.first3),
        close: Math.round(curve.lastMean),
        sustained: Math.round(curve.sustained),
        fade: curve.fade,
        warmup: curve.warmup,
      }
    : null;

  // ---- error autopsy -------------------------------------------------------
  const confusions = [...ev.confusions.entries()]
    .map(([k, count]) => {
      const [expected, typedCh] = k.split(">");
      return { expected, typed: typedCh, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const errBySec = new Map<number, number>();
  for (const s of result.samples) {
    if (s.errors > 0) errBySec.set(s.second, (errBySec.get(s.second) ?? 0) + s.errors);
  }
  const errorSeconds = [...errBySec.entries()]
    .map(([second, count]) => ({ second, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const errors: AuditErrors = {
    keystrokes: ev.keystrokes,
    bad: ev.errors,
    per100: ev.keystrokes > 0 ? Math.round((ev.errors / ev.keystrokes) * 1000) / 10 : 0,
    incorrect: result.chars.incorrect,
    extra: result.chars.extra,
    missed: result.chars.missed,
    correct: result.chars.correct,
    confusions,
    errorSeconds,
    worstWindow:
      curve && curve.worstWindowErrs >= 2
        ? { start: curve.worstWindowStart, count: curve.worstWindowErrs }
        : null,
  };

  // ---- rhythm --------------------------------------------------------------
  const longest = ev.hesitations.reduce<{ ch: string; ms: number } | null>(
    (acc, h) => (!acc || h.ms > acc.ms ? h : acc),
    null
  );
  const rhythm: AuditRhythm = {
    consistency: result.consistency,
    hesitations: ev.hesitations.length,
    longestFreezeMs: longest ? Math.round(longest.ms) : null,
    freezeBefore: longest ? longest.ch : null,
    spread: curve ? Math.round(curve.peak - curve.low) : null,
  };

  // ---- key report ----------------------------------------------------------
  const baseline = calculateMedianLatency(learning) || 150;
  const focus: AuditKeyReport[] = result.focusKeys.map((k) => {
    const pk = ev.perKey.get(k) ?? { attempts: 0, errors: 0 };
    const lat = ev.latencies.get(k);
    return { key: k, attempts: pk.attempts, errors: pk.errors, ms: lat && lat.length >= 2 ? Math.round(median(lat)) : null };
  });

  const rankedLatency = [...ev.latencies.entries()]
    .filter(([, arr]) => arr.length >= 3)
    .map(([key, arr]) => ({ key, ms: Math.round(median(arr)) }));
  const slowest = rankedLatency
    .filter((k) => k.ms > baseline * 1.25)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .map((k) => ({ key: k.key, ms: k.ms, over: Math.round(((k.ms - baseline) / baseline) * 100) }));
  const fastest = rankedLatency.length >= 4
    ? [...rankedLatency].sort((a, b) => a.ms - b.ms).slice(0, 2)
    : [];
  const keys: AuditKeys = { baseline: Math.round(baseline), focus, slowest, fastest };

  // ---- word-level diff -----------------------------------------------------
  const hardest: AuditWords["hardest"] = [];
  let clean = 0;
  const attempted = Math.min(targets.length, typed.length);
  for (let i = 0; i < attempted; i++) {
    const d = diffWord(targets[i] ?? "", typed[i] ?? "");
    if (d.incorrect + d.extra + d.missed === 0) {
      clean += 1;
      continue;
    }
    hardest.push({
      word: targets[i] ?? "",
      errors: d.incorrect + d.missed + d.extra,
      missed: d.missed,
      extra: d.extra,
    });
  }
  hardest.sort((a, b) => b.errors - a.errors);
  const words: AuditWords = { attempted, clean, hardest: hardest.slice(0, 8) };

  // ---- comparisons vs the record -------------------------------------------
  const prev =
    prevBest !== undefined ? prevBest : stats.personalBests[result.modeLabel] ?? null;
  const same = stats.history.filter((h) => h.modeLabel === result.modeLabel && h.id !== result.id);
  const last10 = same.slice(0, 10);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const l10Wpm = avg(last10.map((h) => h.wpm));
  const l10Acc = avg(last10.map((h) => h.accuracy));
  const compare: AuditCompare = {
    // lifetime test number — stats.history is capped (MAX_HISTORY=500), so
    // history.length+1 would stall at 501 for heavy users; the learning
    // counter (already incremented for this test by finalizeLearning) is
    // the uncapped truth. max() keeps the two consistent if they ever drift.
    testNo: Math.max(stats.history.length + 1, learning.totalTests),
    prevBestWpm: prev ? prev.wpm : null,
    prevBestAcc: prev ? prev.accuracy : null,
    pbDelta: prev ? result.wpm - prev.wpm : null,
    last10Wpm: l10Wpm !== null ? Math.round(l10Wpm) : null,
    last10Acc: l10Acc !== null ? Math.round(l10Acc * 10) / 10 : null,
    wpmDelta: l10Wpm !== null ? Math.round(result.wpm - l10Wpm) : null,
    accDelta: l10Acc !== null ? Math.round((result.accuracy - l10Acc) * 10) / 10 : null,
  };

  return { speed, errors, rhythm, keys, words, compare };
}
