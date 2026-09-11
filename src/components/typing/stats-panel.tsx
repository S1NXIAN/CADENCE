"use client";

import { useMemo, useRef } from "react";
import type { LearningData, StatsData } from "@/lib/typing/types";
import { computeWeakKeys, topConfusions, weakBigrams } from "@/lib/typing/profiles";
import { KeyHeatmap } from "./key-heatmap";
import { HistoryChart } from "./history-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Download, Upload, Trash2, Keyboard, Flame, Clock, Gauge, Target } from "lucide-react";

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  stats: StatsData;
  learning: LearningData;
  onExport: () => void;
  onImport: (json: string) => void;
  onReset: () => void;
}

export function StatsPanel({
  open,
  onClose,
  stats,
  learning,
  onExport,
  onImport,
  onReset,
}: StatsPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    const totalTests = stats.history.length;
    const totalTime = stats.history.reduce((a, b) => a + b.duration, 0);
    const recent = stats.history.slice(0, 10);
    const avg10 = recent.length ? Math.round(recent.reduce((a, b) => a + b.wpm, 0) / recent.length) : 0;
    const best = totalTests ? Math.max(...stats.history.map((h) => h.wpm)) : 0;
    const avgAcc = totalTests ? Math.round(stats.history.reduce((a, b) => a + b.accuracy, 0) / totalTests) : 0;
    return { totalTests, totalTime, avg10, best, avgAcc };
  }, [stats.history]);

  const weak = useMemo(() => computeWeakKeys(learning).slice(0, 8), [learning]);
  const bgs = useMemo(() => weakBigrams(learning, 6), [learning]);
  const confusions = useMemo(() => topConfusions(learning, 5), [learning]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8">
      <div className="bg-surface slim-scroll my-auto w-full max-w-4xl rounded-2xl border p-6 shadow-2xl sm:p-8" style={{ borderColor: "#23252b" }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-mono text-xl font-semibold">your progress</h2>
            <p className="text-dim mt-1 font-mono text-xs">
              {learning.totalKeystrokes.toLocaleString()} keystrokes studied · everything stored locally
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-dim hover:text-foreground rounded-lg p-2 transition-colors"
            aria-label="close stats"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Gauge className="h-4 w-4" />} label="avg wpm (last 10)" value={summary.avg10 ? String(summary.avg10) : "—"} />
          <StatCard icon={<Flame className="h-4 w-4" />} label="best wpm" value={summary.best ? String(summary.best) : "—"} />
          <StatCard icon={<Target className="h-4 w-4" />} label="avg accuracy" value={summary.totalTests ? `${summary.avgAcc}%` : "—"} />
          <StatCard icon={<Clock className="h-4 w-4" />} label="practice streak" value={`${stats.streakDays}d`} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-elevated mb-5">
            <TabsTrigger value="overview">overview</TabsTrigger>
            <TabsTrigger value="keys">keys</TabsTrigger>
            <TabsTrigger value="history">history</TabsTrigger>
            <TabsTrigger value="data">data</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div>
              <SectionTitle>wpm progression</SectionTitle>
              <HistoryChart history={stats.history} />
            </div>
            {weak.length > 0 && (
              <div>
                <SectionTitle>what the coach is watching</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {weak.map((w) => (
                    <span
                      key={w.key}
                      className="bg-elevated inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm"
                      style={{ borderColor: "#23252b" }}
                    >
                      <Keyboard className="text-hue h-3.5 w-3.5" />
                      {w.key}
                      <span className="text-dim text-xs">
                        {(w.errRate * 100).toFixed(1)}% err
                        {w.latency !== null ? ` · ${Math.round(w.latency)}ms` : ""}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="keys" className="space-y-6">
            <KeyHeatmap learning={learning} />
            {bgs.length > 0 && (
              <div>
                <SectionTitle>trickiest letter pairs</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {bgs.map((b) => (
                    <span key={b.bigram} className="bg-elevated inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm" style={{ borderColor: "#23252b" }}>
                      {b.bigram}
                      <span className="text-dim text-xs">{(b.errRate * 100).toFixed(1)}% err</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {confusions.length > 0 && (
              <div>
                <SectionTitle>finger confusions (you pressed → meant)</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {confusions.map((c) => (
                    <span key={`${c.expected}-${c.typed}`} className="bg-elevated inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-sm" style={{ borderColor: "#23252b" }}>
                      <span className="text-err">{c.typed}</span>
                      <span className="text-dim">→</span>
                      <span className="text-hue">{c.expected}</span>
                      <span className="text-dim text-xs">×{c.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {stats.history.length === 0 ? (
              <div className="text-dim py-8 text-center font-mono text-sm">no tests yet</div>
            ) : (
              <div className="slim-scroll max-h-[380px] overflow-y-auto rounded-lg border" style={{ borderColor: "#23252b" }}>
                <table className="w-full font-mono text-sm">
                  <thead className="bg-elevated sticky top-0">
                    <tr className="text-dim text-left text-xs tracking-wider uppercase">
                      <th className="px-4 py-2.5">wpm</th>
                      <th className="px-4 py-2.5">raw</th>
                      <th className="px-4 py-2.5">acc</th>
                      <th className="px-4 py-2.5">cons</th>
                      <th className="px-4 py-2.5">mode</th>
                      <th className="px-4 py-2.5">when</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.history.slice(0, 100).map((h) => (
                      <tr key={h.id} className="border-t" style={{ borderColor: "#1c1e23" }}>
                        <td className={`px-4 py-2 tabular-nums ${h.isPersonalBest ? "text-hue font-semibold" : ""}`}>
                          {h.wpm}{h.isPersonalBest ? " ★" : ""}
                        </td>
                        <td className="text-sub px-4 py-2 tabular-nums">{h.rawWpm}</td>
                        <td className={`px-4 py-2 tabular-nums ${h.accuracy < 94 ? "text-err" : ""}`}>{h.accuracy}%</td>
                        <td className="text-sub px-4 py-2 tabular-nums">{h.consistency}%</td>
                        <td className="text-sub px-4 py-2">{h.modeLabel}</td>
                        <td className="text-dim px-4 py-2 text-xs">{timeAgo(h.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <p className="text-sub font-mono text-sm leading-relaxed">
              Cadence is fully local — your learning profile lives in this browser only. Export a
              JSON backup to move it to another machine, or import one to restore.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors hover:bg-elevated"
                style={{ borderColor: "#23252b" }}
              >
                <Download className="h-4 w-4" /> export backup
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors hover:bg-elevated"
                style={{ borderColor: "#23252b" }}
              >
                <Upload className="h-4 w-4" /> import backup
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => onImport(String(reader.result));
                  reader.readAsText(f);
                  e.target.value = "";
                }}
              />
              <ResetButton onReset={onReset} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-elevated rounded-xl border p-4" style={{ borderColor: "#23252b" }}>
      <div className="text-dim flex items-center gap-2 font-mono text-[11px] tracking-wider uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-dim mb-3 font-mono text-xs tracking-widest uppercase">{children}</div>;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const armed = useRef(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  return (
    <button
      onClick={() => {
        if (armed.current) {
          onReset();
        } else {
          armed.current = true;
          if (labelRef.current) labelRef.current.textContent = "click again to confirm";
          window.setTimeout(() => {
            armed.current = false;
            if (labelRef.current) labelRef.current.textContent = "reset all data";
          }, 3000);
        }
      }}
      className="text-err inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors hover:bg-elevated"
      style={{ borderColor: "#3a2525" }}
    >
      <Trash2 className="h-4 w-4" />
      <span ref={labelRef}>reset all data</span>
    </button>
  );
}
