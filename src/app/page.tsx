"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WordDisplay } from "@/components/typing/word-display";
import { Results } from "@/components/typing/results";
import { StatsPanel } from "@/components/typing/stats-panel";
import { SettingsModal } from "@/components/typing/settings-modal";
import { CommandPalette, type PaletteAction } from "@/components/typing/command-palette";
import { useTypingSession } from "@/hooks/use-typing-session";
import { generateTest } from "@/lib/typing/generator";
import { emptyLearning, finalizeLearning, ingestEvents } from "@/lib/typing/profiles";
import { finalizeWordReviews, ingestWordOutcomes } from "@/lib/typing/word-scheduler";
import { generateInsights, nextTestPreview } from "@/lib/typing/insights";
import { buildTestAudit, type TestAudit } from "@/lib/typing/audit";
import { onPacksChanged } from "@/lib/typing/pool";
import {
  setPacksEnabled, handleOnline, handleOffline, packRefreshDue, refreshPacks,
} from "@/lib/typing/online-pack";
import { ConnectionBadge } from "@/components/typing/connection-badge";
import { useToast } from "@/hooks/use-toast";
import {
  exportData, emptyStats, importData, isOnboarded, loadLearning, loadSettings,
  loadStats, persistAll, recordResult, saveLearning, saveSettings, setOnboarded, storedLearningVersion, wipeAll,
} from "@/lib/typing/storage";
import type { CharEvent, CoachInsight, LearningData, Settings, StatsData, TestResult, WordOutcome } from "@/lib/typing/types";
import { ACCENT_COLORS, DEFAULT_SETTINGS } from "@/lib/typing/types";
import { Zap, Timer, AlignLeft, Quote, AtSign, Hash, BarChart3, Settings as SettingsIcon, Waves, Keyboard, Flame } from "lucide-react";

const MODE_ICONS = {
  adaptive: <Zap className="h-3.5 w-3.5" />,
  time: <Timer className="h-3.5 w-3.5" />,
  words: <AlignLeft className="h-3.5 w-3.5" />,
  quote: <Quote className="h-3.5 w-3.5" />,
};

export default function Page() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [learning, setLearning] = useState<LearningData>(() => emptyLearning());
  const [stats, setStats] = useState<StatsData>(() => emptyStats());
  const [resultForDisplay, setResultForDisplay] = useState<TestResult | null>(null);
  const [insights, setInsights] = useState<CoachInsight[]>([]);
  const [audit, setAudit] = useState<TestAudit | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [onboarded, setOnboardedState] = useState(true);
  const { toast } = useToast();

  const settingsRef = useRef(settings);
  const learningRef = useRef(learning);
  useEffect(() => {
    settingsRef.current = settings;
    learningRef.current = learning;
  }, [settings, learning]);

  const sessionRef = useRef<{ status: string; restart: () => void }>({ status: "idle", restart: () => {} });

  // ---- load local data on mount ------------------------------------------
  useEffect(() => {
    setSettings(loadSettings());
    const loadedLearning = loadLearning();
    setLearning(loadedLearning);
    // durable schema migration: if stored learning was an older version
    // (e.g. v2 EWMA -> v3 FSRS memory), write the upgraded payload back once
    if (storedLearningVersion() < loadedLearning.lastVersion) {
      saveLearning(loadedLearning);
    }
    setStats(loadStats());
    setOnboardedState(isOnboarded());
    setReady(true);
  }, []);

  // ---- full-potential layer (WiFi/online detection, cached content packs) --
  // Effect 1 owns ONLY the browser connectivity events; Effect 2 owns pack
  // lifecycle (hydrate + at most ONE weekly-gated refresh). Splitting them
  // this way guarantees a single fetch path per trigger — earlier both
  // effects could (and did) kick off overlapping fetches on boot.
  useEffect(() => {
    if (!ready) return;
    const onOnline = () => handleOnline(settingsRef.current.onlinePacks);
    const onOffline = () => handleOffline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [ready]);

  // apply pack lifecycle whenever readiness or the toggle changes (including boot)
  useEffect(() => {
    if (!ready) return;
    setPacksEnabled(settings.onlinePacks);
    if (settings.onlinePacks && navigator.onLine && packRefreshDue()) {
      void refreshPacks(true);
    }
  }, [ready, settings.onlinePacks]);

  // when packs finish loading mid-session-idle, refresh the current test so
  // the expanded vocabulary is immediately live (never mid-test). Debounced:
  // pack arrival lands as several registerPack calls (words, quotes, live
  // refresh) and each would otherwise regenerate the idle test separately.
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
  }, [ready]);

  // ---- accent theming -----------------------------------------------------
  useEffect(() => {
    if (typeof document === "undefined") return;
    const hue = ACCENT_COLORS[settings.accent]?.hue ?? ACCENT_COLORS.lime.hue;
    const root = document.documentElement;
    root.style.setProperty("--hue", hue);
    root.style.setProperty("--hue-dim", `${hue}99`);
    // mirror the accent into the shadcn primary/ring roles so slider, switch,
    // tooltip and focus rings follow the one living hue (One Phosphor Rule)
    root.style.setProperty("--primary", hue);
    root.style.setProperty("--ring", `${hue}66`);
  }, [settings.accent, ready]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const playClick = useCallback((correct: boolean) => {
    if (!settingsRef.current.sound) return;
    try {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current ??= new AudioCtor();
      const ctx = audioCtxRef.current;
      // autoplay policy can suspend the context (tab backgrounded, before
      // first gesture) — revive it inside the keystroke gesture or the click
      // would stay silent forever
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = correct ? 660 : 250;
      osc.type = "square";
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      /* audio unavailable */
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // persist settings whenever they change
  useEffect(() => {
    if (!ready) return;
    saveSettings(settings);
  }, [settings, ready]);

  // ---- test completion ----------------------------------------------------
  const handleFinish = useCallback(
    (result: TestResult, events: CharEvent[], targets: string[], typed: string[], wordOutcomes: WordOutcome[]) => {
      setOnboarded();

      // update learning model (keystroke-level) + FSRS memory reviews
      const updatedLearning = cloneLearning(learningRef.current);
      const tally = ingestEvents(updatedLearning, events, result.duration * 1000);
      finalizeLearning(updatedLearning, tally);
      // word-level memory: lifetime tallies folded in, then FSRS word reviews
      const wordTally = ingestWordOutcomes(updatedLearning, wordOutcomes);
      finalizeWordReviews(updatedLearning, wordTally);
      setLearning(updatedLearning);

      // personal best + record
      const prevBest = stats.personalBests[result.modeLabel] ?? null;
      const isPB = !prevBest || result.wpm > prevBest.wpm;
      const stamped: TestResult = { ...result, isPersonalBest: isPB };

      // structured audit for the results screen — computed BEFORE recordResult
      // so the comparison strip measures against the pre-test record, and fed
      // the same prevBest the coach uses for its PB delta math
      setAudit(buildTestAudit(stamped, events, targets, typed, stats, updatedLearning, prevBest));

      const updatedStats = recordResult(stats, stamped);
      setStats(updatedStats);

      persistAll(settingsRef.current, updatedLearning, updatedStats);
      setResultForDisplay(stamped);
      // POST-record stats: the streak/history notes reflect the test that just
      // finished (pre-record stats showed the stale streak on a new day);
      // prevBest keeps the "new PB +X" delta computable. The raw keystroke log
      // goes in too — the coach reads THIS test's actual slips, pauses and
      // clusters instead of judging from aggregates alone.
      setInsights(generateInsights(stamped, events, updatedStats, updatedLearning, settingsRef.current, prevBest));
    },
    [stats]
  );

  const session = useTypingSession({
    generate: useCallback(() => generateTest(settingsRef.current, learningRef.current), []),
    settings,
    onFinish: handleFinish,
    onKeystroke: playClick,
  });

  useEffect(() => {
    sessionRef.current = { status: session.status, restart: session.restart };
  }, [session.status, session.restart]);

  const restartAll = useCallback(() => {
    session.restart();
    setResultForDisplay(null);
    setInsights([]);
    setAudit(null);
    setFocusSignal((s) => s + 1);
  }, [session.restart]);

  // regenerate when test-shape settings change
  useEffect(() => {
    if (!ready) return;
    restartAll();
  }, [ready, settings.mode, settings.timeDuration, settings.wordCount, settings.punctuation, settings.numbers, restartAll]);

  // ---- global keyboard: Tab restart, Esc palette ---------------------------
  const { typeChar, submitWord, backspace } = session;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const overlayOpen = paletteOpen || statsOpen || settingsOpen;
      if (e.key === "Escape") {
        // capture-phase ownership: prevent Radix dialogs from double-handling
        e.preventDefault();
        e.stopPropagation();
        if (overlayOpen) {
          setPaletteOpen(false);
          setStatsOpen(false);
          setSettingsOpen(false);
          setFocusSignal((s) => s + 1);
        } else if (ready) {
          setPaletteOpen(true);
        }
        return;
      }
      if (overlayOpen || !ready) return;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        restartAll();
        return;
      }
      // focus redirect: if the hidden typing input lost focus (e.g. a button
      // was clicked), any typing keypress re-enters the session directly
      if (session.status === "done") return;
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
    // capture phase: this handler runs before any Radix/dialog key handling
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paletteOpen, statsOpen, settingsOpen, ready, restartAll, session.status, typeChar, submitWord, backspace]);

  // ---- palette actions ------------------------------------------------------
  const runAction = useCallback(
    (a: PaletteAction) => {
      switch (a.type) {
        case "mode":
          updateSettings({ mode: a.mode });
          break;
        case "time":
          updateSettings({ mode: "time", timeDuration: a.seconds });
          break;
        case "words":
          updateSettings({ wordCount: a.count });
          break;
        case "toggle":
          updateSettings({ [a.key]: !settingsRef.current[a.key] } as Partial<Settings>);
          break;
        case "intensity":
          updateSettings({ adaptiveIntensity: a.value });
          break;
        case "restart":
          restartAll();
          break;
        case "stats":
          setStatsOpen(true);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "export":
          doExport(settingsRef.current, learningRef.current, stats);
          break;
        case "import":
          setStatsOpen(true);
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json"]')?.click();
          }, 150);
          break;
      }
    },
    [updateSettings, restartAll, stats]
  );

  const handleExport = useCallback(() => {
    doExport(settings, learning, stats);
  }, [settings, learning, stats]);

  const handleImport = useCallback((json: string) => {
    const parsed = importData(json);
    if (!parsed) {
      toast({
        title: "import failed",
        description: "That file isn't a cadence backup — export a fresh one from cadence, then import it here.",
        variant: "destructive",
      });
      return;
    }
    setSettings(parsed.settings);
    setLearning(parsed.learning);
    setStats(parsed.stats);
    persistAll(parsed.settings, parsed.learning, parsed.stats);
    setStatsOpen(false);
    restartAll();
    toast({
      title: "backup imported",
      description: "settings, learning profile, and stats restored",
    });
  }, [restartAll]);

  const handleReset = useCallback(() => {
    wipeAll();
    setSettings(DEFAULT_SETTINGS);
    setLearning(emptyLearning());
    setStats(emptyStats());
    setStatsOpen(false);
    setResultForDisplay(null);
    setInsights([]);
    setAudit(null);
    restartAll();
  }, [restartAll]);

  const done = session.status === "done" && resultForDisplay;
  // the preview only changes when the learning model or mode changes — memoized
  // because page re-renders ~10x/s while running (timer ticks + live metrics)
  // and the preview walks every key/bigram/word profile on each call
  const coachLine = useMemo(
    () => (done || !settings.showCoach ? "" : nextTestPreview(learning, settings.mode)),
    [done, settings.showCoach, learning, settings.mode]
  );

  if (!ready) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-dim animate-pulse font-mono text-sm">loading cadence…</div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      {/* progress hairline */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[2px]">
        <div
          className="bg-hue h-full origin-left transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${session.progress})`, opacity: session.status === "running" ? 0.8 : 0 }}
        />
      </div>

      {/* header */}
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
          {stats.streakDays > 0 && (
            <span
              className="text-sub bg-elevated hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs sm:inline-flex"
              aria-label={`${stats.streakDays}-day streak`}
              title={`${stats.streakDays}-day streak`}
            >
              <Flame className="text-warn h-3.5 w-3.5" aria-hidden />
              {stats.streakDays}d
            </span>
          )}
          <button
            onClick={() => setStatsOpen(true)}
            className="text-dim hover:text-foreground hover:bg-elevated rounded-md p-2 transition-colors"
            aria-label="open stats"
            title="stats"
          >
            <BarChart3 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-dim hover:text-foreground hover:bg-elevated rounded-md p-2 transition-colors"
            aria-label="open settings"
            title="settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* mode bar */}
      <nav className="mt-5 flex justify-center px-4" aria-label="test modes">
        <div className="flex flex-wrap items-center justify-center gap-1">
          {(["adaptive", "time", "words", "quote"] as const).map((m) => (
            <button
              key={m}
              onClick={() => updateSettings({ mode: m })}
              className={`rounded-md px-3.5 py-1.5 font-mono text-sm transition-colors ${
                settings.mode === m
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

      {/* sub-options */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 font-mono text-xs">
        {settings.mode === "time" &&
          [15, 30, 60, 120].map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({ timeDuration: t })}
              className={`transition-colors ${settings.timeDuration === t ? "text-hue" : "text-faint hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        {(settings.mode === "words" || settings.mode === "adaptive") &&
          [10, 25, 50, 100].map((c) => (
            <button
              key={c}
              onClick={() => updateSettings({ wordCount: c })}
              className={`transition-colors ${settings.wordCount === c ? "text-hue" : "text-faint hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
        {settings.mode === "quote" && (
          <button onClick={restartAll} className="text-faint transition-colors hover:text-foreground">
            next quote
          </button>
        )}
        <button
          onClick={() => updateSettings({ punctuation: !settings.punctuation })}
          className={`inline-flex items-center gap-1 transition-colors ${settings.punctuation ? "text-hue" : "text-faint hover:text-foreground"}`}
        >
          <AtSign className="h-3 w-3" /> punctuation
        </button>
        <button
          onClick={() => updateSettings({ numbers: !settings.numbers })}
          className={`inline-flex items-center gap-1 transition-colors ${settings.numbers ? "text-hue" : "text-faint hover:text-foreground"}`}
        >
          <Hash className="h-3 w-3" /> numbers
        </button>
        {settings.mode === "adaptive" && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-faint inline-flex items-center gap-1 transition-colors hover:text-foreground"
            title="adaptive intensity — click to adjust (or use the command menu)"
          >
            focus {settings.adaptiveIntensity}%
          </button>
        )}
      </div>

      {/* main stage */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-8 xl:py-8">
        <div className="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
          {done ? (
            <Results
              result={resultForDisplay}
              insights={settings.showCoach ? insights : []}
              audit={audit}
            />
          ) : (
            <>
              <WordDisplay
                words={session.words}
                typedFor={session.typedFor}
                wordIndex={session.typedWords.length}
                input={session.input}
                status={session.status}
                settings={settings}
                timeLeft={session.timeLeft}
                liveWpm={session.liveWpm}
                liveAcc={session.liveAcc}
                onKeyDown={session.handleKeyDown}
                focusSignal={focusSignal}
              />
              {settings.showCoach && coachLine && (
                <div className="text-dim mt-6 flex items-start gap-2.5 px-1 font-mono text-[13px] leading-relaxed xl:mt-7 xl:text-sm">
                  <Zap className="text-hue mt-0.5 h-4 w-4 shrink-0" />
                  <span>{coachLine}</span>
                </div>
              )}
              {!onboarded && (
                <div className="text-sub mt-4 flex items-center gap-2.5 px-1 font-mono text-[13px]">
                  <Keyboard className="h-4 w-4" />
                  <span>just start typing — the coach studies every keystroke and builds your next test</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* footer */}
      <footer className="text-dim mt-auto flex flex-wrap items-center justify-between gap-2 px-5 pb-5 font-mono text-xs sm:px-8">
        <div className="flex items-center gap-4">
          <span>
            <kbd className="bg-elevated rounded border px-1.5 py-0.5">tab</kbd> restart test
          </span>
          <span>
            <kbd className="bg-elevated rounded border px-1.5 py-0.5">esc</kbd> menu
          </span>
          {settings.strictMode && <span className="text-warn">strict mode — no backspace</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="dot-breathe bg-hue/20 inline-block h-1.5 w-1.5 rounded-full" />
          100% local · no account · no cloud
        </div>
      </footer>

      {/* overlays */}
      <CommandPalette open={paletteOpen} onOpenChange={(o) => { setPaletteOpen(o); if (!o) setFocusSignal((s) => s + 1); }} settings={settings} run={runAction} />
      <SettingsModal open={settingsOpen} onOpenChange={(o) => { setSettingsOpen(o); if (!o) setFocusSignal((s) => s + 1); }} settings={settings} update={updateSettings} />
      <StatsPanel
        open={statsOpen}
        onClose={() => { setStatsOpen(false); setFocusSignal((s) => s + 1); }}
        stats={stats}
        learning={learning}
        onExport={handleExport}
        onImport={handleImport}
        onReset={handleReset}
      />
    </div>
  );
}

function cloneLearning(l: LearningData): LearningData {
  // structuredClone is faster and less GC-hostile than the JSON round-trip;
  // the JSON fallback keeps very old browsers alive
  if (typeof structuredClone === "function") return structuredClone(l);
  return JSON.parse(JSON.stringify(l)) as LearningData;
}

function doExport(settings: Settings, learning: LearningData, stats: StatsData) {
  const json = exportData(settings, learning, stats);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
