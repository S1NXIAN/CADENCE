import type { DayActivity, StatsData } from "./types";
import { isoDayLocal } from "./storage";

/**
 * Activity aggregation for the heatmap — pure functions over StatsData so
 * browser UI and bun check scripts exercise the exact same math.
 *
 * The per-day ledger (stats.dailyActivity) is the primary source because
 * stats.history is capped at 500 entries; history entries are merged in as
 * a backfill so profiles that predate the ledger (or backups imported from
 * an older export) still render their days. Where both sources know a day,
 * we take the per-field max — both count the same events, so max repairs
 * drift without ever double-counting.
 */

export interface ActivityDay extends DayActivity {
  date: string; // "yyyy-mm-dd" (local timezone)
}

export interface ActivitySummary {
  activeDays: number;
  totalTests: number;
  totalTimeS: number;
  longestRun: number; // longest consecutive active-day run inside the window
  currentRun: number; // active-day run ending today (or yesterday — today may still be empty)
  busiest: ActivityDay | null;
}

/** Merge ledger + history into per-day activity, limited to the last `windowDays` days. */
export function buildActivityDays(stats: StatsData, windowDays = 400): Map<string, ActivityDay> {
  const cutoffMs = Date.now() - windowDays * 86400000;
  const cutoffDay = isoDayLocal(new Date(cutoffMs));
  const fromHistory = new Map<string, DayActivity>();

  for (const h of stats.history) {
    if (!h.timestamp || h.timestamp < cutoffMs) continue;
    const day = isoDayLocal(new Date(h.timestamp));
    const prev = fromHistory.get(day) ?? { tests: 0, timeS: 0, bestWpm: null };
    fromHistory.set(day, {
      tests: prev.tests + 1,
      timeS: prev.timeS + Math.max(0, h.duration),
      bestWpm: prev.bestWpm === null ? h.wpm : Math.max(prev.bestWpm, h.wpm),
    });
  }

  const merged = new Map<string, ActivityDay>();
  const put = (date: string, v: DayActivity) => {
    const prev = merged.get(date);
    if (!prev) {
      merged.set(date, { date, tests: v.tests, timeS: Math.round(v.timeS), bestWpm: v.bestWpm });
      return;
    }
    merged.set(date, {
      date,
      tests: Math.max(prev.tests, v.tests),
      timeS: Math.round(Math.max(prev.timeS, v.timeS)),
      bestWpm: maxWpm(prev.bestWpm, v.bestWpm),
    });
  };

  for (const [date, v] of Object.entries(stats.dailyActivity)) {
    if (!v || typeof v !== "object") continue;
    put(date, v);
  }
  for (const [date, v] of fromHistory) put(date, v);

  for (const date of merged.keys()) {
    // compare on calendar-day keys, not ms — a "23:59 vs 00:01" ms cutoff
    // would flicker a whole day in/out around the boundary
    if (date < cutoffDay) merged.delete(date);
  }
  return merged;
}

/** Summary stats over the merged day map (runs are computed on real data, not the streak counter). */
export function activitySummary(days: Map<string, ActivityDay>): ActivitySummary {
  const dates = [...days.keys()].sort();
  const totalTests = days.size ? [...days.values()].reduce((a, d) => a + d.tests, 0) : 0;
  const totalTimeS = days.size ? [...days.values()].reduce((a, d) => a + d.timeS, 0) : 0;

  let busiest: ActivityDay | null = null;
  for (const d of days.values()) {
    if (
      d.tests > 0 &&
      (!busiest || d.tests > busiest.tests || (d.tests === busiest.tests && d.timeS > busiest.timeS))
    ) {
      busiest = d;
    }
  }

  // Consecutive-day runs via CALENDAR day numbers — exact 86400000ms
  // equality breaks across DST transitions (days are 25h/23h long there).
  let longestRun = 0;
  let run = 0;
  let prevNum: number | null = null;
  for (const date of dates) {
    const num = dayNum(date);
    if (prevNum !== null && num - prevNum === 1) run += 1;
    else run = 1;
    prevNum = num;
    if (run > longestRun) longestRun = run;
  }

  // currentRun: walk back day by day from today; an empty TODAY doesn't
  // break the run (the day isn't over) — an empty yesterday does.
  let currentRun = 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (!days.has(isoDayLocal(start))) start.setDate(start.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    if (!days.has(isoDayLocal(d))) break;
    currentRun += 1;
  }

  return {
    activeDays: days.size,
    totalTests,
    totalTimeS,
    longestRun,
    currentRun,
    busiest,
  };
}

/** Calendar day number for a "yyyy-mm-dd" key — noon-anchored so DST
 *  offsets (±1h wall time) can never flip which day the number lands on. */
function dayNum(dateKey: string): number {
  return Math.floor(new Date(dateKey + "T12:00:00").getTime() / 86400000);
}

function maxWpm(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Compact human duration: "45s", "6m 30s", "1h 12m". */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
