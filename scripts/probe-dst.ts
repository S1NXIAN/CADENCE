/**
 * DST probe for the activity heatmap day math. Run under a DST timezone:
 *   TZ=America/New_York bun scripts/probe-dst.ts
 * Verifies grid cell arithmetic and run math around BOTH US transitions
 * (spring forward 2025-03-09, fall back 2025-11-02).
 */
import { activitySummary, type ActivityDay } from "../src/lib/typing/activity";

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

console.log("TZ:", Intl.DateTimeFormat().resolvedOptions().timeZone);

console.log("\n=== grid column math (replica of activity-heatmap.tsx) ===");
{
  const WEEKS = 53;
  const today = new Date(2025, 10, 15); // Sat Nov 15 2025 — grid spans both transitions
  today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - dow);
  const firstMonday = new Date(lastMonday);
  firstMonday.setDate(lastMonday.getDate() - (WEEKS - 1) * 7);

  let offMidnight = 0;
  let wrongKey = 0;
  // compute grid first Monday by calendar: it must itself be a Monday at midnight
  // simpler: firstMonday should itself be a Monday at midnight
  check("firstMonday is midnight", firstMonday.getHours() === 0, String(firstMonday));
  check("firstMonday is a Monday", firstMonday.getDay() === 1, String(firstMonday));

  for (let w = 0; w < WEEKS; w++) {
    const monday = new Date(firstMonday);
    monday.setDate(firstMonday.getDate() + w * 7);
    if (monday.getHours() !== 0) offMidnight++;
    // day-key must advance exactly 7 calendar days per column from the first
    const expect = new Date(firstMonday);
    expect.setDate(firstMonday.getDate() + w * 7);
    if (isoDay(monday) !== isoDay(expect)) wrongKey++;
    // every column must be a Monday BY KEY, not just by wall clock
    const [y, m, d] = isoDay(monday).split("-").map(Number);
    const keyDate = new Date(y, m - 1, d, 12);
    if (keyDate.getDay() !== 1) wrongKey++;
  }
  check("all 53 columns land at midnight", offMidnight === 0, `${offMidnight} off-midnight`);
  check("all 53 column keys are consecutive Mondays", wrongKey === 0, `${wrongKey} wrong`);

  // fall-back spot check: the week containing Sun Nov 2 2025
  // columns: Nov 3 is a Monday; the PREVIOUS column starts Oct 27
  let found = false;
  for (let w = 0; w < WEEKS; w++) {
    const monday = new Date(firstMonday);
    monday.setDate(firstMonday.getDate() + w * 7);
    if (isoDay(monday) === "2025-10-27") {
      found = true;
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      check("row 6 of transition week is Sun Nov 2 (not Nov 1/3)", isoDay(sunday) === "2025-11-02", isoDay(sunday));
    }
  }
  check("transition week present in grid", found);
}

console.log("\n=== activitySummary runs across transitions (real fn, NY tz) ===");
{
  // Sat Nov 1 + Sun Nov 2 + Mon Nov 3 2025: Sun->Mon is a 25h day
  const map = new Map<string, ActivityDay>();
  for (const k of ["2025-11-01", "2025-11-02", "2025-11-03"]) {
    map.set(k, { date: k, tests: 1, timeS: 30, bestWpm: 80 });
  }
  let sum = activitySummary(map);
  check("longestRun 3 across fall-back (was 2 with ms math)", sum.longestRun === 3, JSON.stringify({ l: sum.longestRun }));

  // spring forward: Sat Mar 8 + Sun Mar 9 + Mon Mar 10 2025 (23h day)
  const map2 = new Map<string, ActivityDay>();
  for (const k of ["2025-03-08", "2025-03-09", "2025-03-10"]) {
    map2.set(k, { date: k, tests: 1, timeS: 30, bestWpm: 80 });
  }
  sum = activitySummary(map2);
  check("longestRun 3 across spring-forward", sum.longestRun === 3, JSON.stringify({ l: sum.longestRun }));

  // non-adjacent month boundary still works
  const map3 = new Map<string, ActivityDay>();
  for (const k of ["2025-01-31", "2025-02-01"]) {
    map3.set(k, { date: k, tests: 1, timeS: 30, bestWpm: 80 });
  }
  sum = activitySummary(map3);
  check("month-boundary adjacency", sum.longestRun === 2, JSON.stringify({ l: sum.longestRun }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
