"use client";

import { memo } from "react";
import type { SessionStatus } from "@/hooks/use-typing-session";
import type { TestMode } from "@/lib/typing/types";

interface StageHudProps {
  mode: TestMode;
  status: SessionStatus;
  /** null outside time mode */
  timeLeft: number | null;
  wordIndex: number;
  wordCount: number;
  liveWpm: number;
  liveAcc: number;
  showLiveWpm: boolean;
}

/**
 * The instrument row above the word stream: timer / progress readout on the
 * left, live wpm+acc gauges, active mode label on the right. Isolated from
 * WordDisplay so the 10 Hz timer tick re-renders only this row — the stream
 * (and every word in it) keeps skipping renders via memo.
 */
export const StageHud = memo(function StageHud({
  mode,
  status,
  timeLeft,
  wordIndex,
  wordCount,
  liveWpm,
  liveAcc,
  showLiveWpm,
}: StageHudProps) {
  return (
    <div className="mb-4 flex h-8 items-end justify-between px-1 font-mono xl:mb-5 xl:h-10">
      <div className="flex items-baseline gap-7 xl:gap-9">
        {timeLeft !== null ? (
          <div className="text-hue text-3xl font-semibold tabular-nums xl:text-4xl" aria-label="seconds left">
            {timeLeft}
          </div>
        ) : (
          <div className="text-dim tabular-nums text-sm xl:text-base">
            {Math.min(wordIndex + 1, wordCount)} / {wordCount} words
          </div>
        )}
        {showLiveWpm && status === "running" && (
          <>
            <div className="text-sub tabular-nums text-lg xl:text-2xl" aria-live="off">
              {liveWpm} <span className="text-dim text-xs xl:text-sm">wpm</span>
            </div>
            <div className="text-sub tabular-nums text-lg xl:text-2xl" aria-live="off">
              {liveAcc}% <span className="text-dim text-xs xl:text-sm">acc</span>
            </div>
          </>
        )}
      </div>
      <div className="text-dim pb-1 text-xs tracking-wide uppercase xl:text-sm">
        {mode === "adaptive" ? "adaptive" : mode}
      </div>
    </div>
  );
});
