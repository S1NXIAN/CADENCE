"use client";

import type { CoachInsight, CoachInsightKind, TestResult } from "@/lib/typing/types";
import type { AuditCompare, TestAudit } from "@/lib/typing/audit";
import {
  CompareStrip,
  Detail,
  ErrorPanel,
  KeysPanel,
  RhythmPanel,
  SpeedPanel,
  WordsPanel,
} from "./results-panels";
import { ResultChart } from "./result-chart";
import { useCountUp } from "@/hooks/use-count-up";
import { Activity, Award, Crosshair, Flame, Gauge, Lightbulb, Rocket, Sprout, Target, TrendingUp } from "lucide-react";

const KIND_ICON: Record<CoachInsightKind, React.ReactNode> = {
  record: <Award className="text-hue h-4 w-4" />,
  accuracy: <Target className="text-warn h-4 w-4" />,
  focus: <TrendingUp className="text-hue h-4 w-4" />,
  speed: <Rocket className="text-hue h-4 w-4" />,
  trend: <Gauge className="text-hue h-4 w-4" />,
  tip: <Lightbulb className="text-warn h-4 w-4" />,
  streak: <Flame className="text-warn h-4 w-4" />,
  error: <Crosshair className="text-warn h-4 w-4" />,
  rhythm: <Activity className="text-hue h-4 w-4" />,
  recovery: <Sprout className="text-hue h-4 w-4" />,
};

interface ResultsProps {
  result: TestResult;
  insights: CoachInsight[];
  audit?: TestAudit | null;
}

/** the strip needs at least one real comparison point besides the run number */
function hasComparison(c: AuditCompare): boolean {
  return c.prevBestWpm !== null || c.last10Wpm !== null || (c.last10Acc !== null && c.accDelta !== null);
}

export function Results({ result, insights, audit }: ResultsProps) {
  const tax = result.rawWpm - result.wpm;
  // the two hero gauges settle from zero — digits hold width via tabular-nums
  const shownWpm = useCountUp(result.wpm);
  const shownAcc = useCountUp(result.accuracy);
  return (
    <div className="animate-in fade-in duration-300">
      {/* hero: big numbers + chart + detail row */}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr] xl:gap-12">
        <div className="stagger flex min-w-0 flex-row flex-wrap justify-between gap-x-6 gap-y-3 lg:flex-col lg:justify-start">
          <div>
            <div className="text-dim font-mono text-xs tracking-widest uppercase">wpm</div>
            <div className="text-hue font-mono text-6xl font-bold tabular-nums lg:text-7xl xl:text-8xl">
              {Math.round(shownWpm)}
            </div>
          </div>
          <div>
            <div className="text-dim font-mono text-xs tracking-widest uppercase">acc</div>
            <div className="font-mono text-4xl font-semibold tabular-nums lg:text-5xl xl:text-6xl">
              {Number.isInteger(result.accuracy) ? Math.round(shownAcc) : shownAcc.toFixed(1)}%
            </div>
          </div>
          {result.isPersonalBest && (
            <div className="text-hue inline-flex w-full items-center justify-center gap-2 self-start rounded-md border border-hue/30 bg-hue/10 px-3 py-1.5 font-mono text-xs sm:w-auto sm:justify-start">
              <Award className="h-3.5 w-3.5" />
              new personal best · {result.modeLabel}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="slim-scroll overflow-x-auto pb-1">
            <ResultChart samples={result.samples} height={190} pbWpm={audit?.compare.prevBestWpm ?? null} />
          </div>
          {/* six metrics in three columns — two even rows, no orphan cells */}
          <div className="stagger mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-3 xl:mt-6 xl:gap-x-10 xl:text-base">
            <Detail
              label="test"
              value={audit ? `${result.modeLabel}·#${audit.compare.testNo}` : result.modeLabel}
            />
            <Detail label="raw" value={String(result.rawWpm)} />
            <Detail
              label="error tax"
              value={`${tax} wpm`}
              hint="raw wpm minus net wpm — speed lost to errors"
              tone={tax >= 6 ? "warn" : undefined}
            />
            <Detail label="time" value={`${result.duration}s`} />
            {audit && <Detail label="keystrokes" value={String(audit.errors.keystrokes)} />}
            <Detail
              label="error rate"
              value={`${audit ? audit.errors.per100 : "—"}/100 keys`}
            />
          </div>
        </div>
      </div>

      {/* comparison strip — this test vs your record (only when there is
          something to compare; a lone "test #1" chip reads as debris) */}
      {audit && hasComparison(audit.compare) && <CompareStrip compare={audit.compare} />}

      {/* ---- test audit ---- */}
      {audit && (
        <section className="mt-10 xl:mt-12">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-dim font-mono text-xs tracking-widest uppercase">
              test audit
            </span>
            <span className="text-faint font-mono text-[11px]">
              everything the coach saw in this run
            </span>
          </div>

          <div className="stagger grid gap-3 sm:grid-cols-2">
            {audit.speed && <SpeedPanel speed={audit.speed} duration={result.duration} />}
            <ErrorPanel errors={audit.errors} />
            <KeysPanel keys={audit.keys} />
            <RhythmPanel rhythm={audit.rhythm} speed={audit.speed} />
          </div>

          <WordsPanel words={audit.words} />
        </section>
      )}

      {/* coach insights */}
      {insights.length > 0 && (
        <div className="mt-10 xl:mt-12">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="text-dim font-mono text-xs tracking-widest uppercase">
              coach notes
            </span>
            <span className="bg-hue/15 text-hue rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
              {insights.length}
            </span>
          </div>
          <ul className="stagger space-y-2.5">
            {insights.map((ins, i) => (
              <li
                key={i}
                className="bg-surface flex items-start gap-3 rounded-lg border px-4 py-3 xl:px-5"
              >
                <span className="mt-0.5 shrink-0">{KIND_ICON[ins.kind]}</span>
                <div className="min-w-0 flex-1 font-mono text-sm leading-relaxed xl:text-[15px]">
                  {ins.title && (
                    <div className="text-foreground font-semibold">{ins.title}</div>
                  )}
                  <div className="text-sub">{ins.message}</div>
                </div>
                {ins.metric && (
                  <span
                    className="bg-elevated text-dim mt-0.5 shrink-0 rounded-md border px-2 py-1 font-mono text-[11px] whitespace-nowrap"
                  >
                    {ins.metric}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

