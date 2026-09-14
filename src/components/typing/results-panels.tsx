"use client";

import type {
  AuditCompare,
  AuditErrors,
  AuditKeys,
  AuditRhythm,
  AuditSpeed,
  AuditWords,
} from "@/lib/typing/audit";
import {
  Activity,
  Crosshair,
  Gauge,
  Keyboard,
  Type as TypeIcon,
} from "lucide-react";

export function CompareStrip({ compare }: { compare: AuditCompare }) {
  const delta = (d: number | null) => {
    if (d === null || d === 0) return <span className="text-dim">±0</span>;
    const good = d > 0;
    return (
      <span className={good ? "text-hue" : "text-warn"}>
        {good ? "+" : ""}
        {d}
      </span>
    );
  };
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-xs">
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
    <span className="bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5">
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
    <div className="bg-surface rounded-lg border p-4 xl:p-5">
      <div className="text-dim mb-3.5 flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function SpeedPanel({ speed, duration }: { speed: AuditSpeed; duration: number }) {
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
          <div className="text-warn">
            faded to {Math.round((1 - speed.fade) * 100)}% of opening pace by the end
          </div>
        )}
        {speed.warmup >= 0.35 && (
          <div className="text-warn">
            cold open — the first seconds ran {Math.round(speed.warmup * 100)}% under sustained pace
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
  const color = tone === "warn" ? "var(--warn)" : tone === "hue" ? "var(--hue)" : "var(--dim)";
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[13px]">
        <span className="text-dim">{label}</span>
        <span className="text-sub tabular-nums">
          {value}
          <span className="text-faint ml-1 text-[11px]">wpm</span>
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function ErrorPanel({ errors }: { errors: AuditErrors }) {
  const total = errors.correct + errors.incorrect + errors.extra + errors.missed;
  // segments are %-of-every-character so the hairline bed stays visible as
  // the "ok" share — a lone extra char must not read as a full bar of doom
  const seg = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <Panel icon={<Crosshair className="text-warn h-3.5 w-3.5" />} title="error autopsy">
      {/* character fate bar: dark = ok, red = wrong, amber = extra, violet = missed */}
      <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div style={{ width: `${seg(errors.incorrect)}%`, background: "var(--error)" }} />
        <div style={{ width: `${seg(errors.extra)}%`, background: "var(--warn)" }} />
        <div style={{ width: `${seg(errors.missed)}%`, background: "var(--chart-6)" }} />
      </div>
      <div className="text-sub mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--faint)" }} />
          ok <span className="tabular-nums">{errors.correct}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--error)" }} />
          wrong <span className="tabular-nums">{errors.incorrect}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--warn)" }} />
          extra <span className="tabular-nums">{errors.extra}</span>
        </span>
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--chart-6)" }} />
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
            <span className="text-warn tabular-nums">
              {errors.worstWindow.count} err @ {errors.worstWindow.start}s
            </span>
          </div>
        )}
        {errors.bad === 0 && (
          <div className="text-faint">a spotless run — nothing to autopsy</div>
        )}
      </div>

      {errors.confusions.length > 0 && (
        <div className="mt-3">
          <div className="text-faint mb-1.5 font-mono text-[11px] tracking-wider uppercase">
            slips — meant → typed
          </div>
          <div className="flex flex-wrap gap-1.5">
            {errors.confusions.map((c) => (
              <span
                key={`${c.expected}>${c.typed}`}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
              >
                <span className="text-sub">{c.expected}</span>
                <span className="text-faint">→</span>
                <span className="text-err">{c.typed}</span>
                <span className="text-dim ml-1 tabular-nums">×{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function KeysPanel({ keys }: { keys: AuditKeys }) {
  return (
    <Panel icon={<Keyboard className="text-hue h-3.5 w-3.5" />} title="key report">
      {keys.focus.length > 0 && (
        <div className="mb-3.5">
          <div className="text-faint mb-1.5 font-mono text-[11px] tracking-wider uppercase">
            drill targets this test
          </div>
          <div className="space-y-1.5">
            {keys.focus.map((k) => (
              <div key={k.key} className="flex items-center justify-between gap-3 font-mono text-[13px]">
                <span className="flex items-center gap-2">
                  <kbd className="bg-elevated text-sub rounded border px-1.5 py-0.5 text-xs">
                    {k.key}
                  </kbd>
                  <span className="text-faint text-[11px]">{k.attempts}× </span>
                </span>
                <span className="tabular-nums">
                  {k.errors > 0 ? (
                    <span className="text-warn">
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
          <div className="text-faint mb-1.5 font-mono text-[11px] tracking-wider uppercase">
            slowest keys (vs {keys.baseline}ms baseline)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keys.slowest.map((k) => (
              <span
                key={k.key}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
              >
                <span className="text-sub">'{k.key}'</span>{" "}
                <span className="tabular-nums">{k.ms}ms</span>{" "}
                <span className="text-warn">+{k.over}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {keys.fastest.length > 0 && (
        <div className="mt-3">
          <div className="text-faint mb-1.5 font-mono text-[11px] tracking-wider uppercase">
            quickest keys
          </div>
          <div className="flex flex-wrap gap-1.5">
            {keys.fastest.map((k) => (
              <span
                key={k.key}
                className="bg-elevated rounded border px-1.5 py-0.5 font-mono text-[11px]"
              >
                <span className="text-sub">'{k.key}'</span>{" "}
                <span className="text-hue tabular-nums">{k.ms}ms</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {keys.focus.length === 0 && keys.slowest.length === 0 && keys.fastest.length === 0 && (
        <div className="text-faint font-mono text-[12px]">
          even pace across the board — no key stood out this run
        </div>
      )}
    </Panel>
  );
}

export function RhythmPanel({ rhythm, speed }: { rhythm: AuditRhythm; speed: AuditSpeed | null }) {
  return (
    <Panel icon={<Activity className="text-hue h-3.5 w-3.5" />} title="rhythm">
      <div className="flex items-baseline gap-2">
        <span className="text-foreground font-mono text-3xl font-semibold tabular-nums">
          {rhythm.consistency}
        </span>
        <span className="text-dim font-mono text-sm">%</span>
        <span className="text-faint ml-1 font-mono text-[11px]">consistency</span>
      </div>
      <div className="mt-2 h-1 rounded-full" style={{ background: "var(--border)" }}>
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
                <span className="text-warn tabular-nums">
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

export function WordsPanel({ words }: { words: AuditWords }) {
  return (
    <div className="bg-surface mt-3 rounded-lg border p-4 xl:p-5">
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
            >
              <span className="text-sub underline decoration-warn/60 decoration-wavy underline-offset-4">
                {w.word}
              </span>
              <span className="text-warn ml-1.5 tabular-nums">×{w.errors}</span>
              {w.missed > 0 && <span className="text-faint ml-1 text-[11px]">· {w.missed} missed</span>}
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

export function Detail({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "warn";
  /** native tooltip decoding a brand metric — keeps the label terse on screen */
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="text-dim text-xs tracking-wider uppercase">{label}</div>
      <div
        className={
          tone === "warn" ? "text-warn tabular-nums" : "text-sub tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}
