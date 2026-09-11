"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharEvent, SecondSample, Settings, TestResult, WordOutcome } from "@/lib/typing/types";
import type { GeneratedTest } from "@/lib/typing/generator";

export type SessionStatus = "idle" | "running" | "done";
interface WordDiff {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

function diffWord(target: string, typed: string): WordDiff {
  let correct = 0;
  let incorrect = 0;
  const minLen = Math.min(target.length, typed.length);
  for (let i = 0; i < minLen; i++) {
    if (target[i] === typed[i]) correct++;
    else incorrect++;
  }
  const extra = Math.max(0, typed.length - target.length);
  const missed = Math.max(0, target.length - typed.length);
  return { correct, incorrect, extra, missed };
}

interface UseTypingSessionOpts {
  generate: () => GeneratedTest;
  settings: Settings;
  /**
   * called with the final result, the full keystroke event log, the target
   * word list, the final committed attempt per word, and per-word outcomes
   * (timing + wrong-keystroke count of each final attempt — the raw material
   * for the results-screen audit and the word-level memory scheduler; word
   * diffs can't be reconstructed from the event log alone because backspaces
   * are invisible in it).
   */
  onFinish: (
    result: TestResult,
    events: CharEvent[],
    targets: string[],
    typed: string[],
    wordOutcomes: WordOutcome[]
  ) => void;
  /** called on each accepted keystroke (for sound feedback) */
  onKeystroke?: (correct: boolean) => void;
}

export function useTypingSession(opts: UseTypingSessionOpts) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const [test, setTest] = useState<GeneratedTest>(() => opts.generate());
  const [typedWords, setTypedWords] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [result, setResult] = useState<TestResult | null>(null);
  const [elapsed, setElapsed] = useState(0); // ms
  const [liveWpm, setLiveWpm] = useState(0);
  const [liveAcc, setLiveAcc] = useState(100);

  // mutable session state kept in refs for keystroke handlers
  const typedWordsRef = useRef<string[]>([]);
  const inputRef = useRef("");
  const statusRef = useRef<SessionStatus>("idle");
  const startedAtRef = useRef<number | null>(null);
  const eventsRef = useRef<CharEvent[]>([]);
  const samplesRef = useRef<SecondSample[]>([]);
  const lastSampleSecondRef = useRef(0);
  const errorsThisSecondRef = useRef(0);
  const lastKeystrokeAtRef = useRef<number | null>(null);
  const charStatsRef = useRef({ correct: 0, incorrect: 0, extra: 0, missed: 0 });
  // per-word attempt tracking (word memory scheduler): start time of the
  // CURRENT attempt (null until its first keystroke), wrong keystrokes in the
  // current attempt (incl. later-corrected ones), committed outcomes — kept
  // index-aligned with typedWordsRef so pull-backs pop in lockstep
  const wordOutcomesRef = useRef<WordOutcome[]>([]);
  const wordStartRef = useRef<number | null>(null);
  const wordErrRef = useRef(0);

  const words = test.words;

  const resetSession = useCallback((newTest?: GeneratedTest) => {
    const t = newTest ?? optsRef.current.generate();
    setTest(t);
    typedWordsRef.current = [];
    inputRef.current = "";
    statusRef.current = "idle";
    startedAtRef.current = null;
    eventsRef.current = [];
    samplesRef.current = [];
    lastSampleSecondRef.current = 0;
    errorsThisSecondRef.current = 0;
    lastKeystrokeAtRef.current = null;
    charStatsRef.current = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    wordOutcomesRef.current = [];
    wordStartRef.current = null;
    wordErrRef.current = 0;
    setTypedWords([]);
    setInput("");
    setStatus("idle");
    setResult(null);
    setElapsed(0);
    setLiveWpm(0);
    setLiveAcc(100);
  }, []);

  const restart = useCallback(() => {
    resetSession();
  }, [resetSession]);

  // ---- metrics -----------------------------------------------------------

  const computeLiveMetrics = useCallback(() => {
    const targetWords = test.words;
    const typed = typedWordsRef.current;
    const currentInput = inputRef.current;
    const idx = typed.length;

    let correctChars = 0;
    let totalChars = 0;
    for (let i = 0; i < typed.length; i++) {
      const d = diffWord(targetWords[i] ?? "", typed[i]);
      correctChars += d.correct; // missed chars don't count toward live wpm
      totalChars += d.correct + d.incorrect + d.extra;
    }
    // current word partial
    const curTarget = targetWords[idx] ?? "";
    for (let i = 0; i < currentInput.length; i++) {
      if (currentInput[i] === curTarget[i]) correctChars++;
      totalChars++;
    }

    const now = startedAtRef.current ? performance.now() : 0;
    const elapsedMs = startedAtRef.current ? now - startedAtRef.current : 0;
    const minutes = Math.max(elapsedMs, 500) / 60000;

    const events = eventsRef.current;
    const totalKeystrokes = events.length;
    const correctKeystrokes = events.filter((e) => e.correct).length;

    const wpm = correctChars > 0 ? Math.round(correctChars / 5 / minutes) : 0;
    const acc = totalKeystrokes > 0 ? (correctKeystrokes / totalKeystrokes) * 100 : 100;
    return { wpm, acc, elapsedMs, correctChars, totalChars, totalKeystrokes, correctKeystrokes };
  }, [test.words]);

  const finishTest = useCallback(() => {
    if (statusRef.current !== "running") return;
    statusRef.current = "done";

    // commit the in-progress word (time mode / auto-finish)
    if (inputRef.current.length > 0 && typedWordsRef.current.length < test.words.length) {
      const idx = typedWordsRef.current.length;
      const target = test.words[idx] ?? "";
      const nowT = startedAtRef.current ? performance.now() - startedAtRef.current : 0;
      wordOutcomesRef.current.push({
        target,
        typed: inputRef.current,
        ms: wordStartRef.current !== null ? Math.max(0, nowT - wordStartRef.current) : null,
        errKeys: wordErrRef.current,
        // exact-match auto-finish is a complete word; a timer cutoff (or a
        // strict-mode length finish with junk) is truncated — not a review
        partial: inputRef.current !== target,
      });
      typedWordsRef.current = [...typedWordsRef.current, inputRef.current];
      inputRef.current = "";
      wordStartRef.current = null;
      wordErrRef.current = 0;
    }

    const startedAt = startedAtRef.current ?? performance.now();
    const elapsedMs = Math.max(performance.now() - startedAt, 300);
    const minutes = elapsedMs / 60000;

    // final diffs over all committed words
    let correctChars = 0;
    let incorrectChars = 0;
    let extraChars = 0;
    let missedChars = 0;
    const finalTyped = [...typedWordsRef.current];
    for (let i = 0; i < test.words.length; i++) {
      const d = diffWord(test.words[i], finalTyped[i] ?? "");
      correctChars += d.correct;
      incorrectChars += d.incorrect;
      extraChars += d.extra;
      missedChars += d.missed;
    }

    const events = eventsRef.current;
    const totalKeystrokes = events.length;
    const correctKeystrokes = events.filter((e) => e.correct).length;

    const wpm = Math.round(correctChars / 5 / minutes);
    const rawWpm = Math.round((correctChars + incorrectChars + extraChars) / 5 / minutes);
    const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10 : 100;

    // consistency from per-second raw series
    const samples = samplesRef.current;
    let consistency = 0;
    if (samples.length >= 2) {
      const raws = samples.map((s) => s.raw).filter((r) => r > 0);
      if (raws.length >= 2) {
        const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
        const variance = raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
        consistency = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
      }
    }

    const res: TestResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      mode: test.mode,
      modeLabel: test.label,
      wpm,
      rawWpm,
      accuracy,
      consistency,
      duration: Math.round(elapsedMs / 100) / 10,
      chars: { correct: correctChars, incorrect: incorrectChars, extra: extraChars, missed: missedChars },
      samples: samples.map((s) => ({ ...s })),
      focusKeys: test.focusKeys,
      isPersonalBest: false,
    };

    setResult(res);
    setStatus("done");
    statusRef.current = "done";
    optsRef.current.onFinish(
      res,
      events.map((e) => ({ ...e })),
      test.words,
      finalTyped,
      wordOutcomesRef.current.map((o) => ({ ...o }))
    );
  }, [test]);

  // ---- ticking -----------------------------------------------------------

  useEffect(() => {
    if (status !== "running") return;
    const iv = window.setInterval(() => {
      if (!startedAtRef.current) return;
      const ms = performance.now() - startedAtRef.current;
      setElapsed(ms);

      // sample per second
      const m = computeLiveMetrics();
      setLiveWpm(m.wpm);
      setLiveAcc(Math.round(m.acc));
      const second = Math.floor(ms / 1000);
      if (second > lastSampleSecondRef.current) {
        // cumulative wpm/raw at each second — same approach MonkeyType uses
        for (let s = lastSampleSecondRef.current + 1; s <= second; s++) {
          const mins = Math.max(s, 1) / 60;
          samplesRef.current.push({
            second: s,
            wpm: Math.round(m.correctChars / 5 / mins),
            raw: Math.round(m.totalChars / 5 / mins),
            errors: s === second ? errorsThisSecondRef.current : 0,
          });
        }
        lastSampleSecondRef.current = second;
        errorsThisSecondRef.current = 0;
      }

      // time-mode auto finish
      if (test.timeLimit !== null && ms >= test.timeLimit * 1000) {
        finishTest();
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [status, test.timeLimit, computeLiveMetrics, finishTest]);

  // ---- input handling ----------------------------------------------------

  const startIfIdle = useCallback(() => {
    if (statusRef.current === "idle") {
      statusRef.current = "running";
      setStatus("running");
      startedAtRef.current = performance.now();
    }
  }, []);

  const typeChar = useCallback(
    (ch: string) => {
      if (statusRef.current === "done") return;
      const target = test.words[typedWordsRef.current.length] ?? "";
      const pos = inputRef.current.length;
      const expected = pos < target.length ? target[pos] : null;
      const correct = expected === ch;

      startIfIdle();
      const t = startedAtRef.current ? performance.now() - startedAtRef.current : 0;
      eventsRef.current.push({ t, expected, typed: ch, correct });
      if (wordStartRef.current === null) wordStartRef.current = t; // first keystroke of this attempt
      if (!correct) {
        errorsThisSecondRef.current += 1;
        wordErrRef.current += 1;
      }
      optsRef.current.onKeystroke?.(correct);

      inputRef.current = inputRef.current + ch;
      setInput(inputRef.current);

      // auto-finish on last word
      if (typedWordsRef.current.length === test.words.length - 1) {
        const next = inputRef.current;
        if (next === target) {
          finishTest();
        } else if (
          optsRef.current.settings.strictMode &&
          next.length >= target.length &&
          test.timeLimit === null
        ) {
          finishTest();
        }
      }
    },
    [test, startIfIdle, finishTest]
  );

  const submitWord = useCallback(() => {
    if (statusRef.current === "done") return;
    if (inputRef.current.length === 0) return; // ignore leading space
    startIfIdle();

    const idx = typedWordsRef.current.length;
    const target = test.words[idx] ?? "";
    const typed = inputRef.current;
    const nowT = startedAtRef.current ? performance.now() - startedAtRef.current : 0;

    // word attempt outcome for the memory scheduler: final attempt duration
    // (first keystroke -> space) + wrong keystrokes, incl. later-corrected ones
    wordOutcomesRef.current.push({
      target,
      typed,
      ms: wordStartRef.current !== null ? Math.max(0, nowT - wordStartRef.current) : null,
      errKeys: wordErrRef.current,
    });
    wordStartRef.current = null;
    wordErrRef.current = 0;

    // record missed chars as silent error events for the learning engine
    if (typed.length < target.length) {
      for (let i = typed.length; i < target.length; i++) {
        eventsRef.current.push({ t: nowT, expected: target[i], typed: "", correct: false });
      }
    }

    // the space keystroke itself enters the event log: it resets the bigram
    // chain at word boundaries (the last char of the previous word and the
    // first char of this one were NEVER adjacent — a space sits between them)
    // and counts as the keystroke it is for accuracy/sound
    eventsRef.current.push({ t: nowT, expected: " ", typed: " ", correct: true });
    optsRef.current.onKeystroke?.(true);

    typedWordsRef.current = [...typedWordsRef.current, typed];
    inputRef.current = "";
    setTypedWords(typedWordsRef.current);
    setInput("");

    if (typedWordsRef.current.length >= test.words.length) {
      finishTest();
    }
  }, [test, startIfIdle, finishTest]);

  const handleBackspace = useCallback(
    (ctrl: boolean) => {
      if (statusRef.current === "done" || optsRef.current.settings.strictMode) return;
      if (ctrl) {
        if (inputRef.current.length > 0) {
          inputRef.current = "";
          setInput("");
        } else if (typedWordsRef.current.length > 0) {
          // pull back previous word
          const prev = typedWordsRef.current[typedWordsRef.current.length - 1] ?? "";
          typedWordsRef.current = typedWordsRef.current.slice(0, -1);
          if (wordOutcomesRef.current.length > typedWordsRef.current.length) wordOutcomesRef.current.pop();
          inputRef.current = prev;
          // the re-opened word gets a FRESH attempt: new timing, new error count
          wordStartRef.current = null;
          wordErrRef.current = 0;
          setTypedWords(typedWordsRef.current);
          setInput(prev);
        }
        return;
      }
      if (inputRef.current.length > 0) {
        inputRef.current = inputRef.current.slice(0, -1);
        setInput(inputRef.current);
      } else if (typedWordsRef.current.length > 0) {
        const prev = typedWordsRef.current[typedWordsRef.current.length - 1] ?? "";
        // only allow going back if the previous word was not perfect
        const target = test.words[typedWordsRef.current.length - 1] ?? "";
        if (prev !== target) {
          typedWordsRef.current = typedWordsRef.current.slice(0, -1);
          if (wordOutcomesRef.current.length > typedWordsRef.current.length) wordOutcomesRef.current.pop();
          inputRef.current = prev;
          wordStartRef.current = null;
          wordErrRef.current = 0;
          setTypedWords(typedWordsRef.current);
          setInput(prev);
        }
      }
    },
    [test]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key === "Backspace") {
          e.preventDefault();
          handleBackspace(true);
        }
        return; // let other shortcuts (copy etc.) through
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace(false);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        submitWord();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        typeChar(e.key);
      }
    },
    [typeChar, submitWord, handleBackspace]
  );

  /** words with typed state for rendering: ["ap-ple", ...] — typed overlay per word */
  const typedFor = useCallback(
    (i: number): string => {
      if (i < typedWords.length) return typedWords[i] ?? "";
      if (i === typedWords.length) return input;
      return "";
    },
    [typedWords, input]
  );

  const timeLeft = useMemo(() => {
    if (test.timeLimit === null) return null;
    if (status === "idle") return test.timeLimit;
    return Math.max(0, Math.ceil(test.timeLimit - elapsed / 1000));
  }, [test.timeLimit, elapsed, status]);

  const progress = useMemo(() => {
    if (test.timeLimit === null) {
      return words.length ? (typedWords.length + (input.length > 0 ? 0.5 : 0)) / words.length : 0;
    }
    return test.timeLimit > 0 ? Math.min(1, elapsed / (test.timeLimit * 1000)) : 0;
  }, [test.timeLimit, typedWords.length, input.length, elapsed, words.length]);

  return {
    test,
    words,
    typedWords,
    input,
    status,
    result,
    elapsed,
    liveWpm,
    liveAcc,
    timeLeft,
    progress,
    handleKeyDown,
    backspace: handleBackspace,
    restart,
    typeChar,
    submitWord,
    computeLiveMetrics,
    finishTest,
    typedFor,
    focusKeys: test.focusKeys,
  };
}
