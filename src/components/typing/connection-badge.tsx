"use client";

import { useSyncExternalStore } from "react";
import { Wifi, WifiOff, RadioTower, LoaderCircle } from "lucide-react";
import { getPackState, subscribePackState, type PackState } from "@/lib/typing/online-pack";

/**
 * Header chip for the full-potential layer:
 *   local core          — offline, no packs (the engine is fully functional)
 *   syncing packs…      — online, fetching word/quote packs
 *   full potential +N   — packs merged (live or cached), N extra words active
 *   pack sync failed    — online but the CDN was unreachable; core unaffected
 */
export function ConnectionBadge() {
  const state = useSyncExternalStore(subscribePackState, getPackState, getPackState);
  const info = describe(state);

  return (
    <span
      data-testid="connection-badge"
      className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs md:inline-flex ${info.cls}`}
      title={info.title}
      aria-label={`connection: ${info.label}`}
    >
      <info.icon className={`h-3.5 w-3.5 ${state.status === "loading" ? "animate-spin" : ""}`} />
      {info.label}
    </span>
  );
}

function describe(s: PackState): { icon: typeof Wifi; label: string; cls: string; title: string } {
  const base = "bg-elevated";
  switch (s.status) {
    case "ready": {
      if (s.isCachedOnly) {
        return {
          icon: WifiOff,
          label: `full potential · ${s.extraWords.toLocaleString()} words cached`,
          cls: `text-hue border-hue/30 ${base}`,
          title: "Offline, but your cached word packs are active. Everything stays local.",
        };
      }
      return {
        icon: RadioTower,
        label: `full potential · +${s.extraWords.toLocaleString()} words`,
        cls: `text-hue border-hue/30 ${base}`,
        title: "Online — extended word & quote packs are active (cached locally for offline use).",
      };
    }
    case "loading":
      return {
        icon: LoaderCircle,
        label: "syncing packs…",
        cls: `text-dim border-hue/20 ${base}`,
        title: "Fetching the extended word/quote packs…",
      };
    case "error":
      return {
        icon: Wifi,
        label: "pack sync failed",
        cls: `text-warn border-border ${base}`,
        title: "Couldn't download the extra word packs. The local core is unaffected — try again later.",
      };
    case "off":
      return {
        icon: WifiOff,
        label: "local core",
        cls: `text-dim border-border ${base}`,
        title: "Online packs disabled — running on the built-in dictionary.",
      };
    default:
      return s.online
        ? { icon: Wifi, label: "local core", cls: `text-dim border-border ${base}`, title: "Online — the engine runs 100% locally." }
        : { icon: WifiOff, label: "local core", cls: `text-dim border-border ${base}`, title: "Offline — the engine runs 100% locally." };
  }
}
