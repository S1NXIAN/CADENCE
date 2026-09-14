"use client";

import { useMemo, useState } from "react";
import type { LearningData } from "@/lib/typing/types";
import { computeWeakKeys } from "@/lib/typing/profiles";

const ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

type HeatMode = "speed" | "errors";

/** QWERTY heatmap colored by per-key weakness (speed vs error rate). */
export function KeyHeatmap({ learning }: { learning: LearningData }) {
  const [mode, setMode] = useState<HeatMode>("speed");

  const { colorFor, titleFor, hasData } = useMemo(() => {
    const keys = computeWeakKeys(learning);
    const latencies = keys.map((k) => k.latency ?? 0).filter((v) => v > 0);
    latencies.sort((a, b) => a - b);
    const p25 = latencies.length ? latencies[Math.floor(latencies.length * 0.25)] : 150;
    const p75 = latencies.length ? latencies[Math.floor(latencies.length * 0.75)] : 250;
    const med = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 200;

    const colorFor = (key: string): string => {
      const k = keys.find((w) => w.key === key);
      if (!k || (mode === "speed" && k.latency === null)) return "#1c1e23";
      if (mode === "errors") {
        const e = Math.min(1, k.errRate / 0.12);
        if (e < 0.02) return "#1c1e23";
        return mix("#3f4a2c", "#c2410c", e);
      }
      const lat = k.latency ?? med;
      const t = Math.max(0, Math.min(1, (lat - p25) / Math.max(p75 - p25, 1)));
      return mix("#3f4a2c", "#c2410c", t);
    };

    const titleFor = (key: string): string => {
      const k = keys.find((w) => w.key === key);
      if (!k) return `'${key}' — no data yet`;
      const lat = k.latency !== null ? `${Math.round(k.latency)}ms avg` : "latency n/a";
      const err = `${(k.errRate * 100).toFixed(1)}% errors`;
      return `'${key}' — ${lat}, ${err}, ${Math.round(k.attempts)} samples`;
    };

    return { colorFor, titleFor, hasData: keys.length > 0 };
  }, [learning, mode]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg border p-1 font-mono text-xs">
        {(["speed", "errors"] as HeatMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              mode === m
                ? "border border-hue/30 bg-hue/15 font-semibold text-hue"
                : "border border-transparent text-dim hover:text-foreground"
            }`}
          >
            {m === "speed" ? "slower keys" : "error keys"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5" style={{ paddingLeft: ri * 14 }}>
            {row.map((key) => (
              <div
                key={key}
                title={titleFor(key)}
                className="flex h-11 w-11 cursor-default items-center justify-center rounded-md border font-mono text-sm font-medium transition-colors sm:h-12 sm:w-12"
                style={{
                  backgroundColor: colorFor(key),
                  color: colorFor(key) === "#1c1e23" ? "var(--dim)" : "var(--foreground)",
                }}
              >
                {key}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="text-dim mt-4 flex items-center justify-center gap-2 font-mono text-xs">
        <span>{mode === "speed" ? "faster" : "cleaner"}</span>
        <span
          className="h-2.5 w-40 rounded-full"
          style={{ background: `linear-gradient(90deg, #3f4a2c, #c2410c)` }}
        />
        <span>{mode === "speed" ? "slower" : "error-prone"}</span>
      </div>
      {!hasData && (
        <div className="text-dim mt-2 text-center font-mono text-xs">
          complete a few tests to build your heat profile
        </div>
      )}
    </div>
  );
}

function mix(from: string, to: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const a = parse(from);
  const b = parse(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
