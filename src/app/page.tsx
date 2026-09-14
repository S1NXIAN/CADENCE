"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WordDisplay } from "@/components/typing/word-display";
import { Results } from "@/components/typing/results";
import { StatsPanel } from "@/components/typing/stats-panel";
import { SettingsModal } from "@/components/typing/settings-modal";
import { CommandPalette, type PaletteAction } from "@/components/typing/command-palette";
import { ConsoleHeader } from "@/components/typing/console-header";
import { ConsoleFooter } from "@/components/typing/console-footer";
import { ModeBar, SubOptions } from "@/components/typing/mode-bar";
import { StageHud } from "@/components/typing/stage-hud";
import { useTypingSession } from "@/hooks/use-typing-session";
import { usePackLifecycle } from "@/hooks/use-pack-lifecycle";
import { useGlobalKeys } from "@/hooks/use-global-keys";
import { generateTest } from "@/lib/typing/generator";
import { emptyLearning, finalizeLearning, ingestEvents } from "@/lib/typing/profiles";
import { finalizeWordReviews, ingestWordOutcomes } from "@/lib/typing/word-scheduler";
import { generateInsights, nextTestPreview } from "@/lib/typing/insights";
import { buildTestAudit, type TestAudit } from "@/lib/typing/audit";
import { downloadBackup } from "@/lib/typing/backup";
import { useToast } from "@/hooks/use-toast";
import {
  emptyStats, importData, isOnboarded, loadLearning, loadSettings,
  loadStats, persistAll, recordResult, saveLearning, saveSettings, setOnboarded, storedLearningVersion, wipeAll,
} from "@/lib/typing/storage";
import type { CharEvent, CoachInsight, LearningData, Settings, StatsData, TestMode, TestResult, WordOutcome } from "@/lib/typing/types";
import { ACCENT_COLORS, DEFAULT_SETTINGS } from "@/lib/typing/types";
import { Zap, Keyboard } from "lucide-react";

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
  const [hasOnboarded, setHasOnboarded] = useState(true);
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
    setHasOnboarded(isOnboarded());
    setReady(true);
  }, []);

  usePackLifecycle({ ready, enabled: settings.onlinePacks, sessionRef });

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

  // ---- overlay controls (stable identities so memoized children skip) -----
  const bumpFocus = useCallback(() => setFocusSignal((s) => s + 1), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openStats = useCallback(() => setStatsOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closePalette = useCallback((o: boolean) => {
    setPaletteOpen(o);
    if (!o) bumpFocus();
  }, [bumpFocus]);
  const closeSettings = useCallback((o: boolean) => {
    setSettingsOpen(o);
    if (!o) bumpFocus();
  }, [bumpFocus]);
  const closeStats = useCallback(() => {
    setStatsOpen(false);
    bumpFocus();
  }, [bumpFocus]);
  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setStatsOpen(false);
    setSettingsOpen(false);
    bumpFocus();
  }, [bumpFocus]);

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
    bumpFocus();
  }, [session.restart, bumpFocus]);

  // regenerate when test-shape settings change
  useEffect(() => {
    if (!ready) return;
    restartAll();
  }, [ready, settings.mode, settings.timeDuration, settings.wordCount, settings.punctuation, settings.numbers, restartAll]);

  useGlobalKeys({
    ready,
    isOverlayOpen: paletteOpen || statsOpen || settingsOpen,
    closeOverlays,
    openPalette,
    restart: restartAll,
    status: session.status,
    typeChar: session.typeChar,
    submitWord: session.submitWord,
    backspace: session.backspace,
  });

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
          openStats();
          break;
        case "settings":
          openSettings();
          break;
        case "export":
          downloadBackup(settingsRef.current, learningRef.current, stats);
          break;
        case "import":
          openStats();
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json"]')?.click();
          }, 150);
          break;
      }
    },
    [updateSettings, restartAll, openStats, openSettings, stats]
  );

  const handleExport = useCallback(() => {
    downloadBackup(settings, learning, stats);
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
  }, [restartAll, toast]);

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

  const handleSelectMode = useCallback((mode: TestMode) => updateSettings({ mode }), [updateSettings]);
  const handleSelectTime = useCallback((timeDuration: number) => updateSettings({ mode: "time", timeDuration }), [updateSettings]);
  const handleSelectWordCount = useCallback((wordCount: number) => updateSettings({ wordCount }), [updateSettings]);
  const handleTogglePunctuation = useCallback(() => updateSettings({ punctuation: !settingsRef.current.punctuation }), [updateSettings]);
  const handleToggleNumbers = useCallback(() => updateSettings({ numbers: !settingsRef.current.numbers }), [updateSettings]);

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

      <ConsoleHeader
        streakDays={stats.streakDays}
        onOpenStats={openStats}
        onOpenSettings={openSettings}
      />

      <ModeBar mode={settings.mode} onSelectMode={handleSelectMode} />

      <SubOptions
        mode={settings.mode}
        timeDuration={settings.timeDuration}
        wordCount={settings.wordCount}
        punctuation={settings.punctuation}
        numbers={settings.numbers}
        adaptiveIntensity={settings.adaptiveIntensity}
        onSelectTime={handleSelectTime}
        onSelectWordCount={handleSelectWordCount}
        onTogglePunctuation={handleTogglePunctuation}
        onToggleNumbers={handleToggleNumbers}
        onNextQuote={restartAll}
        onOpenIntensity={openSettings}
      />

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
              <StageHud
                mode={settings.mode}
                status={session.status}
                timeLeft={session.timeLeft}
                wordIndex={session.typedWords.length}
                wordCount={session.words.length}
                liveWpm={session.liveWpm}
                liveAcc={session.liveAcc}
                showLiveWpm={settings.liveWpm}
              />
              <WordDisplay
                words={session.words}
                typedWords={session.typedWords}
                input={session.input}
                wordIndex={session.typedWords.length}
                status={session.status}
                caretStyle={settings.caretStyle}
                focusSignal={focusSignal}
                onKeyDown={session.handleKeyDown}
              />
              {settings.showCoach && coachLine && (
                <div className="text-dim mt-6 flex items-start gap-2.5 px-1 font-mono text-[13px] leading-relaxed xl:mt-7 xl:text-sm">
                  <Zap className="text-hue mt-0.5 h-4 w-4 shrink-0" />
                  <span>{coachLine}</span>
                </div>
              )}
              {!hasOnboarded && (
                <div className="text-sub mt-4 flex items-center gap-2.5 px-1 font-mono text-[13px]">
                  <Keyboard className="h-4 w-4" />
                  <span>just start typing — the coach studies every keystroke and builds your next test</span>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <ConsoleFooter strictMode={settings.strictMode} />

      {/* overlays */}
      <CommandPalette open={paletteOpen} onOpenChange={closePalette} settings={settings} run={runAction} />
      <SettingsModal open={settingsOpen} onOpenChange={closeSettings} settings={settings} update={updateSettings} />
      <StatsPanel
        open={statsOpen}
        onClose={closeStats}
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
