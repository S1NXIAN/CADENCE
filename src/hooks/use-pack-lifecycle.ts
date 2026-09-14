"use client";

import { useEffect, useRef, type RefObject } from "react";
import { onPacksChanged } from "@/lib/typing/pool";
import {
  setPacksEnabled, handleOnline, handleOffline, packRefreshDue, refreshPacks,
} from "@/lib/typing/online-pack";

interface PackLifecycleOpts {
  ready: boolean;
  /** settings.onlinePacks — the "full potential" toggle */
  enabled: boolean;
  /** lets pack arrival restart an idle test; the ref avoids re-subscribing */
  sessionRef: RefObject<{ status: string; restart: () => void }>;
}

/**
 * Owns the full-potential layer's lifecycle, split into three single-purpose
 * effects so each trigger has exactly one fetch path:
 *   1. browser connectivity events (online/offline)
 *   2. hydrate + at most ONE weekly-gated refresh on enable/boot
 *   3. when packs land mid-session-idle, restart the idle test (debounced —
 *      pack arrival lands as several registerPack calls)
 */
export function usePackLifecycle({ ready, enabled, sessionRef }: PackLifecycleOpts) {
  // lets the online handler read the current toggle without resubscribing
  const enabledRef = useRef(enabled);

  useEffect(() => {
    if (!ready) return;
    const onOnline = () => handleOnline(enabledRef.current);
    const onOffline = () => handleOffline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    enabledRef.current = enabled;
    setPacksEnabled(enabled);
    if (enabled && navigator.onLine && packRefreshDue()) {
      void refreshPacks(true);
    }
  }, [ready, enabled]);

  useEffect(() => {
    if (!ready) return;
    let timer: number | null = null;
    const unsub = onPacksChanged(() => {
      if (sessionRef.current.status !== "idle") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (sessionRef.current.status === "idle") sessionRef.current.restart();
      }, 150);
    });
    return () => {
      unsub();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [ready, sessionRef]);
}
