"use client";

import type { CoachInsight, TestResult } from "@/lib/typing/types";
import { ResultChart } from "./result-chart";
import { Flame, Target, TrendingUp, Gauge, Lightbulb, Award, Rocket } from "lucide-react";

const KIND_ICON: Record<CoachInsight["kind"], React.ReactNode> = {
  record: <Award className="h-4 w-4 text-hue" />,
  accuracy: <Target className="h-4 w-4 text-[var(--warn)]" />,
  focus: <TrendingUp className="h-4 w-4 text-hue" />,
  speed: <Rocket className="h-4 w-4 text-hue" />,
  trend: <Gauge className="h-4 w-4 text-hue" />,
  tip: <Lightbulb className="h-4 w-4 text-[var(--warn)]" />,
  streak: <Flame className="h-4 w-4 text-[var(--warn)]" />,
};

interface ResultsProps {
  result: TestResult;
  insights: CoachInsight[];
}

export function Results({ result, insights }: ResultsProps) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr] xl:gap-12">
        {/* big numbers */}
        <div className="flex flex-row justify-between gap-6 lg:flex-col lg:justify-start">
          <div>
            <div className="text-dim font-mono text-xs tracking-widest uppercase">wpm</div>
            <div className="text-hue font-mono text-6xl font-bold tabular-nums lg:text-7xl xl:text-8xl">
              {result.wpm}
            </div>
          </div>
          <div>
            <div className="text-dim font-mono text-xs tracking-widest uppercase">acc</div>
            <div className="font-mono text-4xl font-semibold tabular-nums lg:text-5xl xl:text-6xl">
              {result.accuracy}%
            </div>
          </div>
        </div>

        {/* chart + detail row */}
        <div>
          <ResultChart samples={result.samples} height={190} />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4 xl:mt-6 xl:gap-x-10 xl:text-base">
            <Detail label="test" value={result.modeLabel} />
            <Detail label="raw" value={String(result.rawWpm)} />
            <Detail label="consistency" value={`${result.consistency}%`} />
            <Detail label="time" value={`${result.duration}s`} />
            <Detail label="characters" value={`${result.chars.correct}/${result.chars.incorrect}/${result.chars.extra}/${result.chars.missed}`} />
            <Detail
              label="char legend"
              value="ok/err/extra/missed"
              muted
            />
          </div>
          {result.isPersonalBest && (
            <div className="text-hue mt-4 inline-flex items-center gap-2 rounded-md border border-hue/30 bg-hue/10 px-3 py-1.5 font-mono text-xs">
              <Award className="h-3.5 w-3.5" />
              new personal best · {result.modeLabel}
            </div>
          )}
        </div>
      </div>

      {/* coach insights */}
      {insights.length > 0 && (
        <div className="mt-10 xl:mt-12">
          <div className="text-dim mb-3 font-mono text-xs tracking-widest uppercase">
            coach notes
          </div>
          <ul className="space-y-2.5">
            {insights.map((ins, i) => (
              <li
                key={i}
                className="bg-surface flex items-start gap-3 rounded-lg border px-4 py-3 font-mono text-sm leading-relaxed xl:px-5 xl:text-[15px]"
                style={{ borderColor: "#23252b" }}
              >
                <span className="mt-0.5 shrink-0">{KIND_ICON[ins.kind]}</span>
                <span className="text-sub">{ins.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-dim text-xs tracking-wider uppercase">{label}</div>
      <div className={muted ? "text-faint text-xs" : "text-sub tabular-nums"}>{value}</div>
    </div>
  );
}
