"use client";

import type { CoachInsight, CoachInsightKind, TestResult } from "@/lib/typing/types";
import type { AuditCompare, AuditErrors, AuditKeys, AuditRhythm, AuditSpeed, TestAudit, AuditWords } from "@/lib/typing/audit";
import { ResultChart } from "./result-chart";
import {
  Flame,
  Target,
  TrendingUp,
  Gauge,
  Lightbulb,
  Award,
  Rocket,
  Crosshair,
  Activity,
  Sprout,
  Keyboard,
  Type as TypeIcon,
} from "lucide-react";

const KIND_ICON: Record<CoachInsightKind, React.ReactNode> = {
  record: <Award className="text-hue h-4 w-4" />,
  accuracy: <Target className="h-4 w-4 text-[var(--warn)]" />,
  focus: <TrendingUp className="text-hue h-4 w-4" />,
  speed: <Rocket className="text-hue h-4 w-4" />,
  trend: <Gauge className="text-hue h-4 w-4" />,
  tip: <Lightbulb className="h-4 w-4 text-[var(--warn)]" />,
  streak: <Flame className="h-4 w-4 text-[var(--warn)]" />,
  error: <Crosshair className="h-4 w-4 text-[var(--warn)]" />,
  rhythm: <Activity className="text-hue h-4 w-4" />,
  recovery: <Sprout className="text-hue h-4 w-4" />,
};

const BORDER = "#23252b";

interface ResultsProps {
  result: TestResult;
  insights: CoachInsight[];
  audit?: TestAudit | null;
}

export function Results({ result, insights, audit }: ResultsProps) {
  const tax = result.rawWpm - result.wpm;
  return (
    <div className="animate-in fade-in duration-300">
      {/* hero: big numbers + chart + detail row */}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr] xl:gap-12">
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
          {result.isPersonalBest && (
            <div className="text-hue inline-flex items-center gap-2 rounded-md border border-hue/30 bg-hue/10 px-3 py-1.5 font-mono text-xs">
              <Award className="h-3.5 w-3.5" />
              new personal best · {result.modeLabel}
            </div>
          )}
        </div>

        <div>
          <ResultChart samples={result.samples} height={190} pbWpm={audit?.compare.prevBestWpm ?? null} />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4 xl:mt-6 xl:gap-x-10 xl:text-base">
            <Detail label="test" value={result.modeLabel} />
            <Detail label="raw" value={String(result.rawWpm)} />
            <Detail
              label="error tax"
              value={`${tax} wpm`}
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

      {/* comparison strip — this test vs your record */}
      {audit && <CompareStrip compare={audit.compare} />}

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

          <div className="grid gap-3 sm:grid-cols-2">
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
            <span className="bg-hue/15 text-hue rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">
              {insights.length}
            </span>
          </div>
          <ul className="space-y-2.5">
            {insights.map((ins, i) => (
              <li
                key={i}
                className="bg-surface flex items-start gap-3 rounded-lg border px-4 py-3 xl:px-5"
                style={{ borderColor: BORDER }}
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
                    style={{ borderColor: BORDER }}
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

// ---------------------------------------------------------------------------
// Comparison strip
// ---------------------------------------------------------------------------

function CompareStrip({ compare }: { compare: AuditCompare }) {
  const delta = (d: number | null) => {
    if (d === null || d === 0) return <span className="text-dim">±0</span>;
    const good = d > 0;
    return (
      <span className={good ? "text-hue" : "text-[var(--warn)]"}>
        {good ? "+" : ""}
        {d}
      </span>
    );
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-xs">
      <Chip>
        test <span className="text-sub">#{compare.testNo}</span>
      </Chip>
      {compare.prevBestWpm !== null && (
        <Chip>
          prev best <span className="text-sub tabular-nums">{compare.prevBestWpm}</span> wpm
          <span className="ml-1.5">{delta(compare.pbDelta)}</span>
        </Chip>
      )}
      {compare.last10Wpm !== null && (
        <Chip>
          last 10 avg <span className="text-sub tabular-nums">{compare.last10Wpm}</span> wpm
          <span className="ml-1.5">{delta(compare.wpmDelta)}</span>
        </Chip>
      )}
      {compare.last10Acc !== null && compare.accDelta !== null && Math.abs(compare.accDelta) >= 0.5 && (
        <Chip>
          acc <span className="text-sub tabular-nums">{compare.last10Acc}%</span> avg
          <span className="ml-1.5">{delta(compare.accDelta)}</span>
        </Chip>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5"
      style={{ borderColor: BORDER }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Audit panels
// ---------------------------------------------------------------------------

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-lg border p-4 xl:p-5" style={{ borderColor: BORDER }}>
      <div className="text-dim mb-3.5 flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SpeedPanel({ speed, duration }: { speed: AuditSpeed; duration: number }) {
  const peak = Math.max(speed.peak, 1);
  return (
    <Panel icon={<Gauge className="text-hue h-3.5 w-3.5" />} title="speed anatomy">
      <div className="space-y-2.5">
        <SpeedRow label={`peak @ ${speed.peakSecond}s`} value={speed.peak} peak={peak} tone="hue" />
        <SpeedRow label="sustained pace" value={speed.sustained} peak={peak} />
        {duration >= 15 && <SpeedRow label="closing pace" value={speed.close} peak={peak} />}
        <SpeedRow label="opening 3s" value={speed.open} peak={peak} tone={speed.warmup >= 0.35 ? "warn" : undefined} />
      </div>
      <div className="text-faint mt-3 space-y-1 font-mono text-[11px] leading-relaxed">
        {speed.fade >= 0.15 && (
          <div className="text-[var(--warn)]">
            faded to {Math.round((1 - speed.fade) * 100)}% of opening pace by the end
          </div>
        )}
        {speed.warmup >= 0.35 && (
          <div className="text-[var(--warn)]">
            cold open — first seconds ran {Math.round(speed.warmup * 100)}% under cruise
          </div>
        )}
        {speed.fade < 0.15 && speed.warmup < 0.35 && (
          <div>steady from start to finish — no fade, no cold open</div>
        )}
      </div>
    </Panel>
  );
}

function SpeedRow({
  label,
  value,
  peak,
  tone,
}: {
  label: string;
  value: number;
  peak: number;
  tone?: "hue" | "warn";
}) {
  const pct = Math.max(3, Math.min(100, (value / peak) * 100));
  const color = tone === "warn" ? "var(--warn)" : tone === "hue" ? "var(--hue)" : "#5c6270";
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[13px]">
        <span className="text-dim">{label}</span>
        <span className="text-sub tabular-nums">
          {value}
          <span className="text-faint ml-1 text-[10px]">wpm</span>
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full" style={{ background: BORDER }}>
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ErrorPanel({ errors }: { errors: AuditErrors }) {
  const total = errors.correct + errors.incorrect + errors.extra + errors.missed;
  const seg = (v: number) => (total > 0 ? v : 0);
  return (
    <Panel icon={<Crosshair className="h-3.5 w-3.5 text-[var(--warn)]" />} title="error autopsy">
      {/* character fate bar: dark = ok, red = wrong, amber = extra, violet = missed */}
      <div className="flex h-2 overflow-hidden rounded-full" style={{ background: BORDER }}>
        <div style={{ flexGrow: seg(errors.incorrect), background: "#f87171" }} />
        <div style={{ flexGrow: seg(errors.extra), background: "var(--warn)" }} />
        <div style={{ flexGrow: seg(errors.missed), background: "#a78bfa" }} />
      </div>
      <div className="text-sub mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "#3d414b" }} />
          ok <span className="tabular-nums">{errors.correct}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "#f87171" }} />
          wrong <span className="tabular-nums">{errors.incorrect}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--warn)" }} />
          extra <span className="tabular-nums">{errors.extra}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "#a78bfa" }} />
          missed <span className="tabular-nums">{errors.missed}</span>
        </span>
      </div>

      <div className="mt-3 space-y-2 font-mono text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-dim">bad keystrokes</span>
          <span className="text-sub tabular-nums">
            {errors.bad}
            <span className="text-faint ml-1.5 text-[11px]">{errors.per100}/100 keys</span>
          </span>
        </div>
        {errors.worstWindow && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-dim">worst stretch</span>
            <span className="text-[var(--warn)] tabular-nums">
              {errors.worstWindow.count} err @ {errors.worstWindow.start}s
            </span>
          </div>
        )}
      </div>

      {errors.confusions.length > 0 && (
        <div className="mt-3">
          <div className="text-faint mb-1.5 font-mono text-[10px] tracking-wider uppercase">
            slips — meant → typed
          </div>
          <div className="flex flex-wrap gap-1.5">
            {errors.confusions.map((c) => (
              <span
                key={`${c.expected}>${c.typed}`}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
                style={{ borderColor: BORDER }}
              >
                <span className="text-sub">{c.expected}</span>
                <span className="text-faint">→</span>
                <span className="text-[var(--warn)]">{c.typed}</span>
                <span className="text-dim ml-1 tabular-nums">×{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function KeysPanel({ keys }: { keys: AuditKeys }) {
  return (
    <Panel icon={<Keyboard className="text-hue h-3.5 w-3.5" />} title="key report">
      {keys.focus.length > 0 && (
        <div className="mb-3.5">
          <div className="text-faint mb-1.5 font-mono text-[10px] tracking-wider uppercase">
            drill targets this test
          </div>
          <div className="space-y-1.5">
            {keys.focus.map((k) => (
              <div key={k.key} className="flex items-center justify-between gap-3 font-mono text-[13px]">
                <span className="flex items-center gap-2">
                  <kbd
                    className="bg-elevated text-sub rounded border px-1.5 py-0.5 text-xs"
                    style={{ borderColor: BORDER }}
                  >
                    {k.key}
                  </kbd>
                  <span className="text-faint text-[11px]">{k.attempts}× </span>
                </span>
                <span className="tabular-nums">
                  {k.errors > 0 ? (
                    <span className="text-[var(--warn)]">
                      {k.errors} slip{k.errors > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-hue">clean</span>
                  )}
                  {k.ms !== null && <span className="text-faint ml-2 text-[11px]">{k.ms}ms</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {keys.slowest.length > 0 && (
        <div>
          <div className="text-faint mb-1.5 font-mono text-[10px] tracking-wider uppercase">
            slowest keys (vs {keys.baseline}ms baseline)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keys.slowest.map((k) => (
              <span
                key={k.key}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
                style={{ borderColor: BORDER }}
              >
                <span className="text-sub">'{k.key}'</span>{" "}
                <span className="tabular-nums">{k.ms}ms</span>{" "}
                <span className="text-[var(--warn)]">+{k.over}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {keys.fastest.length > 0 && (
        <div className="mt-3">
          <div className="text-faint mb-1.5 font-mono text-[10px] tracking-wider uppercase">
            quickest keys
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keys.fastest.map((k) => (
              <span
                key={k.key}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
                style={{ borderColor: BORDER }}
              >
                <span className="text-sub">'{k.key}'</span>{" "}
                <span className="text-hue tabular-nums">{k.ms}ms</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {keys.focus.length === 0 && keys.slowest.length === 0 && (
        <div className="text-faint font-mono text-[12px]">
          even pace across the board — no key stood out this run
        </div>
      )}
    </Panel>
  );
}

function RhythmPanel({ rhythm, speed }: { rhythm: AuditRhythm; speed: AuditSpeed | null }) {
  return (
    <Panel icon={<Activity className="text-hue h-3.5 w-3.5" />} title="rhythm">
      <div className="flex items-baseline gap-2">
        <span className="text-foreground font-mono text-3xl font-semibold tabular-nums">
          {rhythm.consistency}
        </span>
        <span className="text-dim font-mono text-sm">%</span>
        <span className="text-faint ml-1 font-mono text-[11px]">consistency</span>
      </div>
      <div className="mt-2 h-1 rounded-full" style={{ background: BORDER }}>
        <div
          className="h-1 rounded-full"
          style={{
            width: `${Math.max(2, rhythm.consistency)}%`,
            background: rhythm.consistency >= 80 ? "var(--hue)" : "var(--warn)",
          }}
        />
      </div>

      <div className="text-sub mt-3 space-y-1.5 font-mono text-[12px] leading-relaxed">
        {rhythm.hesitations > 0 ? (
          <div>
            <span className="text-dim tabular-nums">{rhythm.hesitations}</span> pause
            {rhythm.hesitations > 1 ? "s" : ""} ≥0.9s
            {rhythm.longestFreezeMs !== null && (
              <>
                {" "}
                — longest{" "}
                <span className="text-[var(--warn)] tabular-nums">
                  {(rhythm.longestFreezeMs / 1000).toFixed(1)}s
                </span>
                {rhythm.freezeBefore && (
                  <>
                    {" "}before <span className="text-sub">'{rhythm.freezeBefore}'</span>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="text-faint">no long freezes — eyes kept up with the fingers</div>
        )}
        {speed && rhythm.spread !== null && (
          <div>
            <span className="text-dim">burst spread</span>{" "}
            <span className="tabular-nums">{rhythm.spread}</span>
            <span className="text-faint"> wpm (peak {speed.peak} / low {speed.low})</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function WordsPanel({ words }: { words: AuditWords }) {
  return (
    <div
      className="bg-surface mt-3 rounded-lg border p-4 xl:p-5"
      style={{ borderColor: BORDER }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-dim flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
          <TypeIcon className="text-hue h-3.5 w-3.5" />
          <span>word check</span>
        </div>
        <span className="font-mono text-[11px] tabular-nums">
          <span className="text-hue">{words.clean}</span>
          <span className="text-faint">/{words.attempted} words clean</span>
        </span>
      </div>
      {words.hardest.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {words.hardest.map((w, i) => (
            <span
              key={`${w.word}-${i}`}
              className="bg-elevated rounded border px-2 py-1 font-mono text-[12px]"
              style={{ borderColor: BORDER }}
            >
              <span className="text-sub underline decoration-warn/60 decoration-wavy underline-offset-4">
                {w.word}
              </span>
              <span className="text-[var(--warn)] ml-1.5 tabular-nums">×{w.errors}</span>
              {w.missed > 0 && <span className="text-faint ml-1 text-[10px]">{w.missed} dropped</span>}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-faint font-mono text-[12px]">
          every attempted word landed perfectly — nothing to flag
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "warn";
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-dim text-xs tracking-wider uppercase">{label}</div>
      <div
        className={
          tone === "warn"
            ? "text-[var(--warn)] tabular-nums"
            : muted
              ? "text-faint text-xs"
              : "text-sub tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}
