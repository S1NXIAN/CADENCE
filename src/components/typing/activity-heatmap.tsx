"use client";

import { useMemo } from "react";
import type { StatsData } from "@/lib/typing/types";
import { activitySummary, buildActivityDays, formatDuration, type ActivityDay } from "@/lib/typing/activity";

const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const WEEKS = 53;
const GUTTER_L = 34;
const PAD_T = 16;
const WIDTH = GUTTER_L + WEEKS * PITCH - GAP + 2;
const HEIGHT = PAD_T + 7 * PITCH - GAP + 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_LABELS: Record<number, string> = { 0: "mon", 2: "wed", 4: "fri" };

// Time invested per day drives intensity (fairer than test count — a 120s
// time-mode run counts as much as ten 15s sprints). Mixed over var(--hue)
// so the whole ramp re-colors itself when the accent setting changes.
const LEVEL_COLORS = [
  "#1c1e23", // no activity
  "color-mix(in srgb, var(--hue) 26%, #14161a)",
  "color-mix(in srgb, var(--hue) 48%, #14161a)",
  "color-mix(in srgb, var(--hue) 72%, #14161a)",
  "var(--hue)",
];

function levelFor(d: ActivityDay): number {
  if (d.tests <= 0 && d.timeS <= 0) return 0;
  if (d.timeS < 60) return 1;
  if (d.timeS < 240) return 2;
  if (d.timeS < 600) return 3;
  return 4;
}

function tooltipFor(d: ActivityDay | undefined, label: string): string {
  if (!d || (d.tests === 0 && d.timeS === 0)) return `${label} — no activity`;
  const wpm = d.bestWpm !== null ? ` · best ${Math.round(d.bestWpm)} wpm` : "";
  return `${label} — ${d.tests} test${d.tests === 1 ? "" : "s"} · ${formatDuration(d.timeS)}${wpm}`;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * GitHub-style contribution heatmap of typing activity over the last 53
 * weeks (Monday-first). Data comes from the per-day activity ledger with
 * history entries merged in as backfill, so days never silently go dark
 * once stats.history passes its 500-entry cap.
 */
export function ActivityHeatmap({ stats }: { stats: StatsData }) {
  const view = useMemo(() => {
    const days = buildActivityDays(stats, 400);
    const summary = activitySummary(days);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
    // Calendar arithmetic (setDate), never ms addition — +N*86400000 lands
    // at 23:00 the previous day across DST fall-back and shifts the grid.
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - dow);
    const firstMonday = new Date(lastMonday);
    firstMonday.setDate(lastMonday.getDate() - (WEEKS - 1) * 7);

    const cells: { x: number; y: number; fill: string; title: string; today: boolean }[] = [];
    const monthLabels: { x: number; text: string }[] = [];
    let lastMonth = -1;
    let lastLabelCol = -99;

    for (let w = 0; w < WEEKS; w++) {
      const monday = new Date(firstMonday);
      monday.setDate(firstMonday.getDate() + w * 7);
      const month = monday.getMonth();
      // skip if the label would overflow the right edge (GitHub behavior)
      const labelW = MONTHS[month].length * 6.4;
      if (month !== lastMonth && w - lastLabelCol >= 3 && GUTTER_L + w * PITCH + labelW <= WIDTH - 2) {
        monthLabels.push({ x: GUTTER_L + w * PITCH, text: MONTHS[month] });
        lastMonth = month;
        lastLabelCol = w;
      }
      for (let r = 0; r < 7; r++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + r);
        if (date.getTime() > today.getTime()) continue; // future — leave blank
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const d = days.get(key);
        cells.push({
          x: GUTTER_L + w * PITCH,
          y: PAD_T + r * PITCH,
          fill: LEVEL_COLORS[levelFor(d ?? { date: key, tests: 0, timeS: 0, bestWpm: null })],
          title: tooltipFor(d, dayLabel(date)),
          today: date.getTime() === today.getTime(),
        });
      }
    }

    return { cells, monthLabels, summary };
  }, [stats]);

  const { summary } = view;

  return (
    <div>
      <div className="slim-scroll overflow-x-auto pb-1">
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="typing activity over the last year" className="block">
          {view.monthLabels.map((m) => (
            <text key={`${m.x}-${m.text}`} x={m.x} y={11} fontSize="10" fill="#9aa0ae" fontFamily="var(--font-geist-mono), monospace">
              {m.text}
            </text>
          ))}
          {Object.entries(DOW_LABELS).map(([row, label]) => (
            <text
              key={label}
              x={GUTTER_L - 6}
              y={PAD_T + Number(row) * PITCH + CELL - 1}
              textAnchor="end"
              fontSize="10"
              fill="#5c6270"
              fontFamily="var(--font-geist-mono), monospace"
            >
              {label}
            </text>
          ))}
          {view.cells.map((c) => (
            <rect
              key={`${c.x}-${c.y}`}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              rx="2.5"
              fill={c.fill}
              stroke={c.today ? "var(--hue-dim)" : "none"}
              strokeWidth="1"
            >
              <title>{c.title}</title>
            </rect>
          ))}
        </svg>
      </div>

      <div className="text-dim mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <span>
          {summary.activeDays > 0 ? (
            <>
              <span className="text-foreground">{summary.activeDays}</span> active day
              {summary.activeDays === 1 ? "" : "s"} ·{" "}
              <span className="text-foreground">{formatDuration(summary.totalTimeS)}</span> typed ·{" "}
              <span className="text-foreground">{summary.totalTests}</span> tests · longest run{" "}
              <span className="text-foreground">{summary.longestRun}d</span> · current{" "}
              <span className="text-foreground">{summary.currentRun}d</span>
            </>
          ) : (
            <>complete your first test to start the heatmap</>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          less
          {LEVEL_COLORS.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          more
        </span>
      </div>
    </div>
  );
}
