/**
 * Activity heatmap data-layer checks: ledger + history merge, window
 * clipping, recordResult ledger bump/prune, sanitize hardening, summary
 * run math, export/import round-trip. Run: bun scripts/activity-check.ts
 */
import type { StatsData, TestResult } from "../src/lib/typing/types";
import { isoDayLocal, recordResult, exportData, importData } from "../src/lib/typing/storage";
import { createEmptyStats, sanitizeStats } from "../src/lib/typing/sanitize";
import { activitySummary, buildActivityDays, formatDuration } from "../src/lib/typing/activity";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const DAY = 86400000;
function midnight(offsetDays: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // noon — immune to DST edge math
  return new Date(d.getTime() - offsetDays * DAY);
}
function dayKey(offsetDays: number): string {
  return isoDayLocal(midnight(offsetDays));
}
function tsAt(offsetDays: number): number {
  return midnight(offsetDays).getTime();
}

let seq = 0;
function makeResult(wpm: number, duration: number, offsetDays = 0): TestResult {
  seq++;
  return {
    id: `t${seq}`,
    timestamp: tsAt(offsetDays),
    mode: "time",
    modeLabel: "time 30",
    wpm,
    rawWpm: wpm + 10,
    accuracy: 96,
    consistency: 88,
    duration,
    chars: { correct: 100, incorrect: 2, extra: 0, missed: 0 },
    samples: [],
    focusKeys: [],
    isPersonalBest: false,
  };
}

console.log("=== buildActivityDays ===");
{
  // 1. history-only backfill (legacy profile with no ledger)
  const stats = createEmptyStats();
  stats.history = [makeResult(80, 30, 0), makeResult(90, 60, 0), makeResult(70, 30, 1), makeResult(60, 25, 10)];
  const days = buildActivityDays(stats);
  const today = days.get(dayKey(0));
  check("history-only: today merged to one day", today?.tests === 2, JSON.stringify(today));
  check("history-only: timeS summed", today?.timeS === 90, JSON.stringify(today));
  check("history-only: bestWpm is max", today?.bestWpm === 90, JSON.stringify(today));
  check("history-only: yesterday present", days.get(dayKey(1))?.tests === 1);
  check("history-only: 10d-ago present", days.get(dayKey(10))?.tests === 1);

  // 2. ledger is source of truth; merge takes per-field max (no double count)
  const mixed = createEmptyStats();
  mixed.history = [makeResult(70, 40, 0), makeResult(65, 40, 2)];
  mixed.dailyActivity[dayKey(0)] = { tests: 5, timeS: 300, bestWpm: 90 };
  mixed.dailyActivity[dayKey(5)] = { tests: 1, timeS: 30, bestWpm: null };
  const m = buildActivityDays(mixed);
  const d0 = m.get(dayKey(0))!;
  check("merge: tests = max (5, not 7)", d0.tests === 5, JSON.stringify(d0));
  check("merge: timeS = max (300, not 340)", d0.timeS === 300, JSON.stringify(d0));
  check("merge: bestWpm = max (90 vs history 70)", d0.bestWpm === 90, JSON.stringify(d0));
  check("merge: ledger-only day kept", m.get(dayKey(5))?.tests === 1);
  check("merge: history-only day kept", m.get(dayKey(2))?.tests === 1);

  // 3. window clipping
  const win = createEmptyStats();
  win.history = [makeResult(80, 30, 395), makeResult(80, 30, 420)];
  const w = buildActivityDays(win, 400);
  check("window: 395d-ago inside", w.has(dayKey(395)));
  check("window: 420d-ago outside", !w.has(dayKey(420)));
}

console.log("\n=== recordResult ledger ===");
{
  let stats: StatsData = createEmptyStats();
  stats = recordResult(stats, makeResult(80, 30));
  let t = stats.dailyActivity[dayKey(0)];
  check("bump: first test", t?.tests === 1 && t?.timeS === 30 && t?.bestWpm === 80, JSON.stringify(t));

  stats = recordResult(stats, makeResult(90, 60));
  stats = recordResult(stats, makeResult(70, 45));
  t = stats.dailyActivity[dayKey(0)];
  check("bump: accumulates + keeps best wpm", t?.tests === 3 && t?.timeS === 135 && t?.bestWpm === 90, JSON.stringify(t));

  stats.dailyActivity["2001-01-01"] = { tests: 9, timeS: 999, bestWpm: 42 };
  stats = recordResult(stats, makeResult(75, 20));
  check("prune: ancient day dropped on write", stats.dailyActivity["2001-01-01"] === undefined);
  check("prune: today still intact", stats.dailyActivity[dayKey(0)]?.tests === 4);
}

console.log("\n=== sanitizeStats ledger hardening ===");
{
  const junk = {
    ...createEmptyStats(),
    dailyActivity: {
      "not-a-date": { tests: 5, timeS: 60, bestWpm: 80 }, // bad key
      [dayKey(4)]: "nope", // bad value
      [dayKey(1)]: { tests: 1e999, timeS: 1e300, bestWpm: "80" }, // Infinity/string poison
      [dayKey(2)]: { tests: -4, timeS: -10, bestWpm: null }, // negatives
    },
  } as unknown as Record<string, unknown>;
  const s = sanitizeStats(junk);
  check("junk key dropped", s.dailyActivity["not-a-date"] === undefined);
  check("junk value dropped", s.dailyActivity[dayKey(4)] === undefined);
  const d1 = s.dailyActivity[dayKey(2)]!;
  check("negatives clamped to 0", d1.tests === 0 && d1.timeS === 0 && d1.bestWpm === null, JSON.stringify(d1));

  // Infinity survives JSON round-trip as null in JS objects — feed it raw:
  const inf = { ...createEmptyStats(), dailyActivity: {} } as StatsData;
  (inf.dailyActivity as Record<string, unknown>)[dayKey(3)] = { tests: Number.POSITIVE_INFINITY, timeS: 1e301, bestWpm: 90 };
  const s2 = sanitizeStats(inf);
  const d3 = s2.dailyActivity[dayKey(3)]!;
  // clampNum convention: non-finite degrades to the FALLBACK (0 = dark
  // day), never the cap — a corrupt write must not paint the hottest day
  check("Infinity tests degrade to 0, finite huge clamped", d3.tests === 0 && d3.timeS === 86400, JSON.stringify(d3));
  check("string bestWpm -> null", d3.bestWpm === 90);

  // cap: 450 valid days -> keep 400 most recent (lexicographic = chronological)
  const many: Record<string, { tests: number; timeS: number; bestWpm: number | null }> = {};
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let i = 0; i < 450; i++) {
    const key = isoDayLocal(new Date(base.getTime() - i * DAY));
    many[key] = { tests: 1, timeS: 30, bestWpm: 80 };
  }
  const s3 = sanitizeStats({ ...createEmptyStats(), dailyActivity: many } as unknown as Record<string, unknown>);
  const n = Object.keys(s3.dailyActivity).length;
  check("cap: 450 days -> 400", n === 400, String(n));
  const kept = Object.keys(s3.dailyActivity).sort();
  check("cap: kept the most recent", kept[0] === isoDayLocal(new Date(base.getTime() - 399 * DAY)), kept[0]);
}

console.log("\n=== activitySummary ===");
{
  // 3-day consecutive run: ledger seeded per-day (recordResult only ever
  // bumps TODAY — the day spread comes from result timestamps via history)
  const stats: StatsData = createEmptyStats();
  for (const off of [0, 1, 2]) {
    stats.dailyActivity[dayKey(off)] = { tests: 1, timeS: 30, bestWpm: 80 };
  }
  stats.history = [makeResult(80, 30, 0), makeResult(80, 30, 1), makeResult(80, 30, 2)];
  const days3 = buildActivityDays(stats);
  let sum = activitySummary(days3);
  check("merge: history max never double-counts ledger", sum.totalTests === 3, JSON.stringify(sum));
  check("runs: longest 3", sum.longestRun === 3, JSON.stringify({ l: sum.longestRun, c: sum.currentRun }));
  check("runs: current 3", sum.currentRun === 3);
  check("totals: 3 tests / 90s", sum.totalTests === 3 && sum.totalTimeS === 90, JSON.stringify(sum));
  check("activeDays 3", sum.activeDays === 3);
  check("busiest: any of the three, tests=1", sum.busiest !== null && sum.busiest.tests === 1);

  // today empty -> current run survives via yesterday
  const minusToday = new Map(days3);
  minusToday.delete(dayKey(0));
  sum = activitySummary(minusToday);
  check("runs: empty today keeps run 2", sum.currentRun === 2, JSON.stringify(sum));

  // gap breaks the run (fresh map, original untouched): has day0 + day2
  const gapped = new Map(days3);
  gapped.delete(dayKey(1));
  sum = activitySummary(gapped);
  check("runs: gap -> longest 1", sum.longestRun === 1, JSON.stringify({ l: sum.longestRun }));
  check("runs: gap -> current 1 (today active, yesterday empty)", sum.currentRun === 1, JSON.stringify({ c: sum.currentRun }));

  // busiest tie-break by timeS
  const tieMap = buildActivityDays(createEmptyStats());
  tieMap.set(dayKey(0), { date: dayKey(0), tests: 2, timeS: 60, bestWpm: 80 });
  tieMap.set(dayKey(1), { date: dayKey(1), tests: 2, timeS: 120, bestWpm: 80 });
  sum = activitySummary(tieMap);
  check("busiest: tie -> more time wins", sum.busiest?.date === dayKey(1), JSON.stringify(sum.busiest));

  // empty map
  sum = activitySummary(new Map());
  check("empty: zeroed summary", sum.activeDays === 0 && sum.longestRun === 0 && sum.currentRun === 0 && sum.busiest === null);
}

console.log("\n=== formatDuration ===");
{
  check("45s", formatDuration(45) === "45s");
  check("6m 30s", formatDuration(390) === "6m 30s");
  check("1h 12m", formatDuration(4320) === "1h 12m");
  check("negative -> 0s", formatDuration(-5) === "0s");
}

console.log("\n=== export/import round-trip ===");
{
  let stats: StatsData = createEmptyStats();
  stats = recordResult(stats, makeResult(84, 42));
  const payload = exportData(
    { mode: "time", timeDuration: 30, wordCount: 25, hasPunctuation: false, hasNumbers: false, adaptiveIntensity: 65, isStrict: false, isLiveWpmOn: true, isSoundOn: false, caretStyle: "line", accent: "lime", isCoachOn: true, usesOnlinePacks: true },
    {
      keyProfiles: {}, bigramProfiles: {}, wordProfiles: {}, confusions: [], errorContexts: [],
      totalKeystrokes: 0, totalChars: 0, totalTests: 0, totalTimeMs: 0, lastVersion: 4,
    },
    stats
  );
  const back = importData(payload);
  check("import ok", back !== null);
  const t = back?.stats.dailyActivity[dayKey(0)];
  check("ledger survives backup round-trip", t?.tests === 1 && t?.timeS === 42 && t?.bestWpm === 84, JSON.stringify(t));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
