"use client";

import { memo } from "react";
import { AlignLeft, AtSign, Hash, Quote, Timer, Zap } from "lucide-react";
import type { TestMode } from "@/lib/typing/types";

const MODE_ICONS: Record<TestMode, React.ReactNode> = {
  adaptive: <Zap className="h-3.5 w-3.5" />,
  time: <Timer className="h-3.5 w-3.5" />,
  words: <AlignLeft className="h-3.5 w-3.5" />,
  quote: <Quote className="h-3.5 w-3.5" />,
};

const MODES: readonly TestMode[] = ["adaptive", "time", "words", "quote"];
const TIME_DURATIONS = [15, 30, 60, 120];
const WORD_COUNTS = [10, 25, 50, 100];

interface ModeBarProps {
  mode: TestMode;
  onSelectMode: (mode: TestMode) => void;
}

/** the four test-mode pills; memoized — stable across keystrokes and timer ticks */
export const ModeBar = memo(function ModeBar({ mode, onSelectMode }: ModeBarProps) {
  return (
    <nav className="mt-5 flex justify-center px-4" aria-label="test modes">
      <div className="flex flex-wrap items-center justify-center gap-1">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => onSelectMode(m)}
            className={`rounded-md px-3.5 py-1.5 font-mono text-sm transition-colors ${
              mode === m
                ? "bg-hue/15 text-hue font-semibold"
                : "text-dim hover:bg-elevated hover:text-foreground"
            }`}
          >
            <span className="mr-1.5 inline-flex items-center gap-1.5">
              {MODE_ICONS[m]}
              {m}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
});

interface SubOptionsProps {
  mode: TestMode;
  timeDuration: number;
  wordCount: number;
  punctuation: boolean;
  numbers: boolean;
  adaptiveIntensity: number;
  onSelectTime: (seconds: number) => void;
  onSelectWordCount: (count: number) => void;
  onTogglePunctuation: () => void;
  onToggleNumbers: () => void;
  onNextQuote: () => void;
  onOpenIntensity: () => void;
}

/** text toggles under the mode pills; memoized — re-renders only on real option changes */
export const SubOptions = memo(function SubOptions({
  mode,
  timeDuration,
  wordCount,
  punctuation,
  numbers,
  adaptiveIntensity,
  onSelectTime,
  onSelectWordCount,
  onTogglePunctuation,
  onToggleNumbers,
  onNextQuote,
  onOpenIntensity,
}: SubOptionsProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 font-mono text-xs">
      {mode === "time" &&
        TIME_DURATIONS.map((t) => (
          <button
            key={t}
            onClick={() => onSelectTime(t)}
            className={`transition-colors ${timeDuration === t ? "text-hue" : "text-faint hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      {(mode === "words" || mode === "adaptive") &&
        WORD_COUNTS.map((c) => (
          <button
            key={c}
            onClick={() => onSelectWordCount(c)}
            className={`transition-colors ${wordCount === c ? "text-hue" : "text-faint hover:text-foreground"}`}
          >
            {c}
          </button>
        ))}
      {mode === "quote" && (
        <button onClick={onNextQuote} className="text-faint transition-colors hover:text-foreground">
          next quote
        </button>
      )}
      <button
        onClick={onTogglePunctuation}
        className={`inline-flex items-center gap-1 transition-colors ${punctuation ? "text-hue" : "text-faint hover:text-foreground"}`}
      >
        <AtSign className="h-3 w-3" /> punctuation
      </button>
      <button
        onClick={onToggleNumbers}
        className={`inline-flex items-center gap-1 transition-colors ${numbers ? "text-hue" : "text-faint hover:text-foreground"}`}
      >
        <Hash className="h-3 w-3" /> numbers
      </button>
      {mode === "adaptive" && (
        <button
          onClick={onOpenIntensity}
          className="text-faint inline-flex items-center gap-1 transition-colors hover:text-foreground"
          title="adaptive intensity — click to adjust (or use the command menu)"
        >
          focus {adaptiveIntensity}%
        </button>
      )}
    </div>
  );
});
