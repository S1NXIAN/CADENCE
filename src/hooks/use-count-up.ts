"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Instrument-settling readout: eases from 0 up to `target` once per target
 * change (rAF, cubic ease-out). Under prefers-reduced-motion the settle
 * collapses to a single frame (duration 0). Only for result screens —
 * never the typing path.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(0);
  const [prevTarget, setPrevTarget] = useState(target);
  const frameRef = useRef(0);

  // adjust-during-render (react.dev "storing information from renders"):
  // a fresh result restarts the settle from zero
  if (prevTarget !== target) {
    setPrevTarget(target);
    setValue(0);
  }

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : durationMs;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - startedAt) / dur);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs]);

  return value;
}
