"use client";

import { memo } from "react";

interface ConsoleFooterProps {
  strictMode: boolean;
}

/** kbd legend + the breathing "100% local" dot; memoized — static during a test */
export const ConsoleFooter = memo(function ConsoleFooter({ strictMode }: ConsoleFooterProps) {
  return (
    <footer className="text-dim mt-auto flex flex-wrap items-center justify-between gap-2 px-5 pb-5 font-mono text-xs sm:px-8">
      <div className="flex items-center gap-4">
        <span>
          <kbd className="bg-elevated rounded border px-1.5 py-0.5">tab</kbd> restart test
        </span>
        <span>
          <kbd className="bg-elevated rounded border px-1.5 py-0.5">esc</kbd> menu
        </span>
        {strictMode && <span className="text-warn">strict mode — no backspace</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="dot-breathe bg-hue/20 inline-block h-1.5 w-1.5 rounded-full" />
        100% local · no account · no cloud
      </div>
    </footer>
  );
});
