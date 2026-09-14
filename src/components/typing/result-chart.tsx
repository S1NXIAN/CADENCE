"use client";

import { useMemo } from "react";
import type { SecondSample } from "@/lib/typing/types";

interface ResultChartProps {
  samples: SecondSample[];
  width?: number;
  height?: number;
  /** previous personal best for this mode — draws a dashed reference line */
  pbWpm?: number | null;
}

/** SVG chart of wpm / raw over time with error markers — MonkeyType style. */
export function ResultChart({ samples, width = 640, height = 200, pbWpm }: ResultChartProps) {
  const padL = 44;
  const padR = 34;
  const padT = 14;
  const padB = 26;

  const { wpmPath, rawPath, errPoints, yTicks, xTicks, maxY, pbY } = useMemo(() => {
    if (samples.length === 0) {
      return { wpmPath: "", rawPath: "", errPoints: [], yTicks: [], xTicks: [], maxY: 50, pbY: null };
    }
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const maxRaw = Math.max(...samples.map((s) => Math.max(s.raw, s.wpm)), 20);
    const maxY = Math.ceil((maxRaw * 1.15) / 20) * 20;
    const maxX = Math.max(samples[samples.length - 1].second, 5);

    const x = (s: number) => padL + (s / maxX) * innerW;
    const y = (v: number) => padT + innerH - (v / maxY) * innerH;

    const line = (pts: { second: number; v: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.second).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

    const wpmPath = line(samples.map((s) => ({ second: s.second, v: s.wpm })));
    const rawPath = line(samples.map((s) => ({ second: s.second, v: s.raw })));
    const errPoints = samples
      .filter((s) => s.errors > 0)
      .map((s) => ({ cx: x(s.second), cy: y(s.raw), count: s.errors }));

    const yTicks = [0.25, 0.5, 0.75, 1].map((f) => ({
      v: Math.round(maxY * f),
      y: y(maxY * f),
    }));

    const step = maxX > 60 ? 15 : maxX > 25 ? 10 : 5;
    const xTicks: { v: number; x: number }[] = [];
    for (let s = step; s <= maxX; s += step) xTicks.push({ v: s, x: x(s) });

    const pbY =
      pbWpm != null && pbWpm > 0 && pbWpm <= maxY && pbWpm >= 10 ? y(pbWpm) : null;

    return { wpmPath, rawPath, errPoints, yTicks, xTicks, maxY, pbY };
  }, [samples, width, height, pbWpm]);

  if (samples.length === 0) {
    return (
      <div className="text-dim flex h-40 items-center justify-center font-mono text-sm">
        not enough data for a chart
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="words per minute over time"
    >
      {/* grid */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" />
          <text x={padL - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--dim)" fontFamily="var(--font-geist-mono), monospace">
            {t.v}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t.v} x={t.x} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--dim)" fontFamily="var(--font-geist-mono), monospace">
          {t.v}s
        </text>
      ))}

      {/* raw line */}
      <path d={rawPath} fill="none" stroke="var(--dim)" strokeWidth="1.5" strokeDasharray="1 0" opacity="0.65" />
      {/* wpm line */}
      <path d={wpmPath} fill="none" stroke="var(--hue)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* personal-best reference line */}
      {pbY !== null && (
        <g>
          <line
            x1={padL}
            x2={width - padR + 20}
            y1={pbY}
            y2={pbY}
            stroke="var(--hue-dim)"
            strokeWidth="1"
            strokeDasharray="4 4"
          >
            <title>previous personal best</title>
          </line>
          <text
            x={width - padR + 24}
            y={pbY + 4}
            fontSize="11"
            fill="var(--sub)"
            fontFamily="var(--font-geist-mono), monospace"
          >
            pb
          </text>
        </g>
      )}

      {/* error markers */}
      {errPoints.map((p, i) => (
        <g key={i} stroke="var(--error)" strokeWidth="2" strokeLinecap="round">
          <line x1={p.cx - 4} y1={p.cy - 4} x2={p.cx + 4} y2={p.cy + 4} />
          <line x1={p.cx - 4} y1={p.cy + 4} x2={p.cx + 4} y2={p.cy - 4} />
        </g>
      ))}

      {/* legend */}
      <g fontFamily="var(--font-geist-mono), monospace" fontSize="11">
        <line x1={padL + 4} y1={padT - 3} x2={padL + 20} y2={padT - 3} stroke="var(--hue)" strokeWidth="2.5" />
        <text x={padL + 26} y={padT} fill="var(--sub)">wpm</text>
        <line x1={padL + 66} y1={padT - 3} x2={padL + 82} y2={padT - 3} stroke="var(--dim)" strokeWidth="1.5" />
        <text x={padL + 88} y={padT} fill="var(--sub)">raw</text>
        <g stroke="var(--error)" strokeWidth="2" strokeLinecap="round">
          <line x1={padL + 120} y1={padT - 6} x2={padL + 126} y2={padT} />
          <line x1={padL + 120} y1={padT} x2={padL + 126} y2={padT - 6} />
        </g>
        <text x={padL + 132} y={padT} fill="var(--sub)">errors</text>
      </g>
    </svg>
  );
}
