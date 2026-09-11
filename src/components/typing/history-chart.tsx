"use client";

import { useMemo } from "react";
import type { TestResult } from "@/lib/typing/types";

interface HistoryChartProps {
  history: TestResult[];
  height?: number;
}

/** WPM progression across recent tests, dots colored by accuracy. */
export function HistoryChart({ history, height = 190 }: HistoryChartProps) {
  const data = useMemo(() => {
    // chronological order, last 100
    return [...history].slice(0, 100).reverse();
  }, [history]);

  const { path, dots, yTicks, maxY, width } = useMemo(() => {
    const width = 720;
    const padL = 44;
    const padR = 14;
    const padT = 14;
    const padB = 24;
    if (data.length === 0) return { path: "", dots: [], yTicks: [], maxY: 60, width };

    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const maxY = Math.max(Math.ceil((Math.max(...data.map((d) => d.wpm)) * 1.15) / 20) * 20, 40);
    const x = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = (v: number) => padT + innerH - (v / maxY) * innerH;

    const path = data
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.wpm).toFixed(1)}`)
      .join(" ");
    const dots = data.map((d, i) => ({
      x: x(i),
      y: y(d.wpm),
      color: d.accuracy >= 97 ? "#a3e635" : d.accuracy >= 94 ? "#fbbf24" : "#f87171",
      title: `${d.modeLabel} — ${d.wpm} wpm, ${d.accuracy}%`,
    }));
    const yTicks = [0.5, 1].map((f) => ({ v: Math.round(maxY * f), y: y(maxY * f) }));
    return { path, dots, yTicks, maxY, width };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="text-dim flex h-40 items-center justify-center font-mono text-sm">
        complete tests to see your progression
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="wpm history">
      {yTicks.map((t) => (
        <g key={t.v}>
          <line x1={44} x2={width - 14} y1={t.y} y2={t.y} stroke="#23252b" />
          <text x={36} y={t.y + 4} textAnchor="end" fontSize="11" fill="#5c6270" fontFamily="var(--font-geist-mono), monospace">
            {t.v}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--hue)" strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="3.5" fill={d.color}>
          <title>{d.title}</title>
        </circle>
      ))}
      <g fontFamily="var(--font-geist-mono), monospace" fontSize="11" fill="#9aa0ae">
        <circle cx={width - 210} cy={padTop()} r="3.5" fill="#a3e635" />
        <text x={width - 200} y={padTop() + 4}>&ge;97% acc</text>
        <circle cx={width - 130} cy={padTop()} r="3.5" fill="#fbbf24" />
        <text x={width - 120} y={padTop() + 4}>&ge;94%</text>
        <circle cx={width - 62} cy={padTop()} r="3.5" fill="#f87171" />
        <text x={width - 52} y={padTop() + 4}>&lt;94%</text>
      </g>
    </svg>
  );
}

function padTop(): number {
  return 10;
}
