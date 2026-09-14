"use client";

import { useEffect } from "react";
import type { SessionStatus } from "@/hooks/use-typing-session";

interface GlobalKeysOpts {
  ready: boolean;
  /** any overlay (palette / stats / settings) is open */
  isOverlayOpen: boolean;
  closeOverlays: () => void;
  openPalette: () => void;
  restart: () => void;
  status: SessionStatus;
  typeChar: (ch: string) => void;
  submitWord: () => void;
  backspace: (ctrl: boolean) => void;
}

/**
 * Global capture-phase keyboard layer: Esc owns the palette/overlays, Tab
 * restarts, and typing keys redirect into the session when the hidden input
 * lost focus (e.g. after clicking a button). Capture phase so it runs before
 * any Radix/dialog key handling.
 */
export function useGlobalKeys({
  ready,
  isOverlayOpen,
  closeOverlays,
  openPalette,
  restart,
  status,
  typeChar,
  submitWord,
  backspace,
}: GlobalKeysOpts) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // capture-phase ownership: prevent Radix dialogs from double-handling
        e.preventDefault();
        e.stopPropagation();
        if (isOverlayOpen) {
          closeOverlays();
        } else if (ready) {
          openPalette();
        }
        return;
      }
      if (isOverlayOpen || !ready) return;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        restart();
        return;
      }
      // focus redirect: if the hidden typing input lost focus (e.g. a button
      // was clicked), any typing keypress re-enters the session directly
      if (status === "done") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const activeIsInput = tag === "INPUT" || tag === "TEXTAREA";
      if (!activeIsInput && (e.key.length === 1 || e.key === "Backspace")) {
        const inp = document.querySelector<HTMLInputElement>('input[aria-label="typing input"]');
        inp?.focus();
        e.preventDefault();
        e.stopPropagation();
        if (e.key === " ") submitWord();
        else if (e.key === "Backspace") backspace(e.ctrlKey || e.metaKey);
        else typeChar(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOverlayOpen, ready, closeOverlays, openPalette, restart, status, typeChar, submitWord, backspace]);
}
