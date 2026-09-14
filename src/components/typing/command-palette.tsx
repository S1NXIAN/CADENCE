"use client";

import { memo } from "react";
import type { Settings, TestMode } from "@/lib/typing/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Zap, Timer, AlignLeft, Quote, Hash, AtSign, Lock, Unlock, Gauge,
  Keyboard, Settings as SettingsIcon, BarChart3, Download, Upload, Volume2, VolumeX,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  run: (action: PaletteAction) => void;
}

export type PaletteAction =
  | { type: "mode"; mode: TestMode }
  | { type: "time"; seconds: number }
  | { type: "words"; count: number }
  | { type: "toggle"; key: "punctuation" | "numbers" | "strictMode" | "liveWpm" | "sound" }
  | { type: "intensity"; value: number }
  | { type: "restart" }
  | { type: "stats" }
  | { type: "settings" }
  | { type: "export" }
  | { type: "import" };

const MODES: { mode: TestMode; label: string; icon: React.ReactNode }[] = [
  { mode: "adaptive", label: "adaptive — curated for your weak keys", icon: <Zap className="text-hue" /> },
  { mode: "time", label: "time — fixed duration", icon: <Timer /> },
  { mode: "words", label: "words — fixed word count", icon: <AlignLeft /> },
  { mode: "quote", label: "quote — type a passage", icon: <Quote /> },
];

const TIMES = [15, 30, 60, 120];
const COUNTS = [10, 25, 50, 100];

/** memoized — while closed it skips rendering entirely on every parent render */
export const CommandPalette = memo(function CommandPalette({ open, onOpenChange, settings, run }: CommandPaletteProps) {
  const act = (a: PaletteAction) => {
    run(a);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="command menu" description="modes, training options, and app actions">
      <CommandInput placeholder="type a command or search…" />
      <CommandList className="slim-scroll">
        <CommandEmpty>no matching command</CommandEmpty>

        <CommandGroup heading="mode">
          {MODES.map((m) => (
            <CommandItem key={m.mode} onSelect={() => act({ type: "mode", mode: m.mode })}>
              {m.icon}
              <span>{m.label}</span>
              {settings.mode === m.mode && <span className="text-hue ml-auto font-mono text-xs">active</span>}
            </CommandItem>
          ))}
        </CommandGroup>

        {settings.mode === "time" && (
          <CommandGroup heading="duration">
            {TIMES.map((t) => (
              <CommandItem key={t} onSelect={() => act({ type: "time", seconds: t })}>
                <Timer />
                <span>{t} seconds</span>
                {settings.timeDuration === t && <span className="text-hue ml-auto font-mono text-xs">active</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(settings.mode === "words" || settings.mode === "adaptive") && (
          <CommandGroup heading="length">
            {COUNTS.map((c) => (
              <CommandItem key={c} onSelect={() => act({ type: "words", count: c })}>
                <AlignLeft />
                <span>{c} words</span>
                {settings.wordCount === c && <span className="text-hue ml-auto font-mono text-xs">active</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="training options">
          <CommandItem onSelect={() => act({ type: "toggle", key: "punctuation" })}>
            <AtSign />
            <span>punctuation {settings.punctuation ? "(on)" : "(off)"}</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "toggle", key: "numbers" })}>
            <Hash />
            <span>numbers {settings.numbers ? "(on)" : "(off)"}</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "toggle", key: "strictMode" })}>
            {settings.strictMode ? <Lock /> : <Unlock />}
            <span>strict mode — no backspace {settings.strictMode ? "(on)" : "(off)"}</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "intensity", value: Math.min(100, settings.adaptiveIntensity + 20) })}>
            <Gauge />
            <span>raise adaptive intensity → {Math.min(100, settings.adaptiveIntensity + 20)}%</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "intensity", value: Math.max(0, settings.adaptiveIntensity - 20) })}>
            <Gauge />
            <span>lower adaptive intensity → {Math.max(0, settings.adaptiveIntensity - 20)}%</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="app">
          <CommandItem onSelect={() => act({ type: "restart" })}>
            <Keyboard />
            <span>restart test</span>
            <kbd className="text-dim ml-auto font-mono text-xs">tab</kbd>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "stats" })}>
            <BarChart3 />
            <span>open stats &amp; key heatmap</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "settings" })}>
            <SettingsIcon />
            <span>open settings</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "toggle", key: "liveWpm" })}>
            <Gauge />
            <span>live wpm {settings.liveWpm ? "(on)" : "(off)"}</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "toggle", key: "sound" })}>
            {settings.sound ? <Volume2 /> : <VolumeX />}
            <span>keypress sound {settings.sound ? "(on)" : "(off)"}</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "export" })}>
            <Download />
            <span>export data backup</span>
          </CommandItem>
          <CommandItem onSelect={() => act({ type: "import" })}>
            <Upload />
            <span>import data backup</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
});
