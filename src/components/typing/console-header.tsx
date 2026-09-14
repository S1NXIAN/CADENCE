"use client";

import { memo } from "react";
import { BarChart3, Flame, Settings as SettingsIcon, Waves } from "lucide-react";
import { ConnectionBadge } from "@/components/typing/connection-badge";

interface ConsoleHeaderProps {
  streakDays: number;
  onOpenStats: () => void;
  onOpenSettings: () => void;
}

/** brand mark + status chips; memoized — re-renders only when the streak count changes */
export const ConsoleHeader = memo(function ConsoleHeader({
  streakDays,
  onOpenStats,
  onOpenSettings,
}: ConsoleHeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 pt-5 sm:px-8">
      <div className="flex items-center gap-3">
        <div className="bg-hue/15 border-hue/30 flex h-9 w-9 items-center justify-center rounded-lg border">
          <Waves className="text-hue h-5 w-5" />
        </div>
        <div>
          <div className="font-mono text-lg font-bold leading-tight tracking-tight">cadence</div>
          <div className="text-dim -mt-0.5 font-mono text-[11px] tracking-widest uppercase">
            typing coach · learns you
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ConnectionBadge />
        {streakDays > 0 && (
          <span
            className="text-sub bg-elevated hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs sm:inline-flex"
            aria-label={`${streakDays}-day streak`}
            title={`${streakDays}-day streak`}
          >
            <Flame className="text-warn h-3.5 w-3.5" aria-hidden />
            {streakDays}d
          </span>
        )}
        <button
          onClick={onOpenStats}
          className="text-dim hover:text-foreground hover:bg-elevated rounded-md p-2 transition-colors"
          aria-label="open stats"
          title="stats"
        >
          <BarChart3 className="h-5 w-5" />
        </button>
        <button
          onClick={onOpenSettings}
          className="text-dim hover:text-foreground hover:bg-elevated rounded-md p-2 transition-colors"
          aria-label="open settings"
          title="settings"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
});
