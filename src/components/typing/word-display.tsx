"use client";

import { memo, useLayoutEffect, useRef, useState, useEffect } from "react";
import type { CaretStyle } from "@/lib/typing/types";

interface WordDisplayProps {
  words: string[];
  /** final committed attempt per finished word, index-aligned with `words` */
  typedWords: string[];
  /** in-progress attempt for the word at `wordIndex` */
  input: string;
  wordIndex: number;
  status: "idle" | "running" | "done";
  caretStyle: CaretStyle;
  focusSignal: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

interface CaretPos {
  left: number;
  top: number;
  height: number;
  width: number;
}

interface StreamWordProps {
  word: string;
  typed: string;
  isCurrent: boolean;
  /** the cursor has moved past this word (submitted or skipped) */
  isPast: boolean;
}

const StreamWord = memo(function StreamWord({
  word,
  typed,
  isCurrent,
  isPast,
}: StreamWordProps) {
  const chars: React.ReactNode[] = [];
  const maxLen = Math.max(word.length, typed.length);
  for (let ci = 0; ci < maxLen; ci++) {
    const targetChar = ci < word.length ? word[ci] : null;
    const typedChar = ci < typed.length ? typed[ci] : null;
    let cls = "text-dim";
    if (typedChar !== null) {
      if (targetChar === null) cls = "text-err/60";
      else if (typedChar === targetChar) cls = "text-foreground";
      else cls = "text-err";
    } else if (targetChar !== null && isPast) {
      // skipped char (word submitted early) — muted, reads as blurred past
      // rather than lighting up like a wrong key
      cls = "text-missed";
    }
    chars.push(
      <span key={ci} data-ci={ci} className={cls}>
        {targetChar ?? typedChar}
      </span>
    );
  }
  return (
    <span
      data-wi
      className={`mr-[0.6ch] inline-block leading-[1.1] border-b-2 pb-[2px] ${
        isCurrent ? "border-hue/50" : "border-transparent"
      }`}
    >
      {chars}
    </span>
  );
});

/** count of words sharing the first visual line, via one top read per word */
function measureFirstLineCount(stream: NodeListOf<HTMLElement>): number {
  const top0 = stream[0]?.getBoundingClientRect().top ?? 0;
  let count = 0;
  for (const w of stream) {
    if (w.getBoundingClientRect().top - top0 < 10) count++;
    else break;
  }
  return count;
}

export const WordDisplay = memo(function WordDisplay({
  words,
  typedWords,
  input,
  wordIndex,
  status,
  caretStyle,
  focusSignal,
  onKeyDown,
}: WordDisplayProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState<CaretPos>({ left: 0, top: 0, height: 30, width: 3 });
  const [lineH, setLineH] = useState(57.6);
  const [isFocused, setIsFocused] = useState(true);
  // first rendered word. Only ever advances by WHOLE LINES (see measure
  // effect) — advancing word-by-word re-wraps the entire stream every
  // keystroke, which makes the top line visibly reshuffle mid-test.
  const [winStart, setWinStart] = useState(0);
  const [prevWords, setPrevWords] = useState(words);
  // when true, the stream's transform transition and the caret's left/top
  // transition are suspended for ONE commit. Geometric compensations (window
  // retire, restart rewind) must land instantly — if they animate, the
  // stream reflows immediately while the transform/caret glide behind, and
  // the whole visible block jumps a full line for ~150ms.
  const [snapUi, setSnapUi] = useState(false);
  // guard: the retire walk reads every rendered word's rect — run it at most
  // once per (word list, line) the caret enters, not on every keystroke
  const retireWalkRef = useRef<{ words: string[]; line: number }>({ words, line: -1 });

  // adjust-during-render (react.dev "storing information from previous
  // renders"): a fresh word list (new test / restart) rewinds the window.
  if (prevWords !== words) {
    setPrevWords(words);
    setWinStart(0);
    // restart: scrollY derived from the stale caret would otherwise animate
    // the stream from the old scroll position back to the top — snap instead.
    setSnapUi(true);
  }
  // backspace can walk the cursor above the window (ctrl+backspace pops
  // words) — rewind so the active word stays rendered. Re-wrapping is
  // acceptable in this rare correction path.
  if (wordIndex < winStart) {
    setWinStart(wordIndex);
  }

  // render a window of words around the current position for performance
  // (wide screens fit more words per line, so keep a generous window).
  // min() guards transient frames where wordIndex rewinds before the
  // window reset lands, so the active word is always rendered.
  const from = Math.min(winStart, wordIndex);
  const to = Math.min(words.length, Math.max(wordIndex + 45, 45));
  const visible = words.slice(from, to);

  // measure caret position after every render that affects it
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const target = inner.querySelectorAll<HTMLElement>("[data-wi]")[Math.max(0, wordIndex - from)];
    if (!target) return;
    const chars = target.querySelectorAll<HTMLElement>("[data-ci]");
    const el = chars[Math.min(input.length, Math.max(chars.length - 1, 0))];
    if (!el) return;

    // Measure in the INNER stream's coordinate space. The stream is
    // translated by scrollY, so measuring against the outer viewport would
    // feed the current scroll offset back into the scroll computation
    // (caret → activeLine → scrollY → caret) and make the view oscillate
    // whenever the active word sits on a scrolled-in line. Inner-relative
    // coordinates are invariant to the transform, so the active line is
    // always the true absolute line of the word in the stream.
    const innerRect = inner.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const isPastEnd = input.length >= chars.length;

    const left = isPastEnd
      ? elRect.right - innerRect.left + 1
      : elRect.left - innerRect.left - 1;
    const top = elRect.top - innerRect.top;
    const height = elRect.height;

    // Lazy whole-line window advance: once the active word reaches the 4th
    // rendered line, retire the first rendered line entirely. Retiring whole
    // lines never changes how later words wrap (they all shift up one line
    // intact), and compensating caret.top by one line keeps scrollY, caret
    // and pixels identical across the swap — the retire is invisible.
    // (Requires lineH to be measured, which always happens on line 0.)
    const measuredLine = lineH > 0 ? Math.round(top / lineH) : 0;
    const walkedThisLine =
      retireWalkRef.current.words === words && retireWalkRef.current.line === measuredLine;
    if (measuredLine >= 3 && !walkedThisLine) {
      retireWalkRef.current = { words, line: measuredLine };
      const firstLineCount = measureFirstLineCount(
        inner.querySelectorAll<HTMLElement>("[data-wi]")
      );
      if (firstLineCount > 0 && from + firstLineCount <= wordIndex) {
        setWinStart((prev) => Math.max(prev, from + firstLineCount));
        setCaret({
          left,
          top: top - lineH,
          height,
          width: Math.max(elRect.width * 0.55, 4),
        });
        // the retire shifts the stream one line the instant the removed words
        // leave the DOM; the caret compensation must not glide behind it
        setSnapUi(true);
        return;
      }
    }

    setCaret((prev) =>
      Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5
        ? prev
        : { left, top, height, width: Math.max(elRect.width * 0.55, 4) }
    );

    // measure line height from the first stacked pair of words
    const wordEls = inner.querySelectorAll<HTMLElement>("[data-wi]");
    if (wordEls.length >= 2) {
      const t0 = wordEls[0].getBoundingClientRect().top;
      for (let i = 1; i < wordEls.length; i++) {
        const t = wordEls[i].getBoundingClientRect().top;
        if (t - t0 > 10) {
          setLineH(t - t0);
          break;
        }
      }
    }
  }, [wordIndex, input, words, status, from, lineH]);

  // active line → vertical scroll of the word stream
  const activeLine = Math.round(caret.top / lineH);
  const scrollY = Math.max(0, activeLine - 1) * lineH;

  const focusInput = () => inputRef.current?.focus();

  useEffect(() => {
    focusInput();
  }, []);

  // refocus when an overlay closes (parent bumps focusSignal)
  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  // re-enable transitions one PAINTED frame after a snap commit (double rAF).
  // Geometry is already at rest when this runs, so re-adding the transition
  // animates nothing — later real scrolls glide as usual.
  useEffect(() => {
    if (!snapUi) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSnapUi(false));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [snapUi]);

  const caretStyleProps =
    caretStyle === "block"
      ? { width: caret.width, height: caret.height, top: caret.top }
      : caretStyle === "underline"
        ? { width: caret.width, height: 3, top: caret.top + caret.height - 3 }
        : { width: 2.5, height: caret.height, top: caret.top };

  return (
    <div
      className="relative select-none"
      onMouseDown={(e) => {
        e.preventDefault();
        focusInput();
      }}
    >
      {/* hidden input captures typing */}
      <input
        ref={inputRef}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        tabIndex={-1}
        aria-label="typing input"
        className="absolute left-0 top-0 h-1 w-1 opacity-0"
        style={{ caretColor: "transparent" }}
        onKeyDown={onKeyDown}
        onBlur={() => setIsFocused(false)}
        onFocus={() => setIsFocused(true)}
      />

      {/* word stream */}
      <div
        ref={outerRef}
        className={`word-line relative overflow-hidden transition-opacity duration-200 ${
          isFocused ? "opacity-100" : "opacity-35"
        }`}
        style={{ height: "calc(var(--word-line-h) * var(--word-lines, 3))" }}
        aria-label="typing test words"
        role="textbox"
        aria-readonly
      >
        <div
          ref={innerRef}
          className={`relative px-1 font-mono ${
            snapUi ? "" : "transition-transform duration-150 ease-out"
          }`}
          style={{
            transform: `translateY(-${scrollY}px)`,
            fontSize: "var(--word-size)",
            lineHeight: "var(--word-line-h)",
          }}
        >
          {/* caret */}
          {status !== "done" && isFocused && (
            <div
              className={`bg-hue pointer-events-none absolute z-10 ${
                status === "idle" ? "caret-blink" : ""
              }`}
              style={{
                left: `${caret.left}px`,
                top: `${caretStyleProps.top}px`,
                width: `${caretStyleProps.width}px`,
                height: `${caretStyleProps.height}px`,
                transition: snapUi ? "none" : "left 90ms linear, top 120ms ease-out",
                borderRadius: caretStyle === "block" ? 2 : 1,
              }}
            />
          )}
          {visible.map((word, vi) => {
            const wi = from + vi;
            const typed = wi < typedWords.length ? typedWords[wi] ?? "" : wi === wordIndex ? input : "";
            return (
              <StreamWord
                key={wi}
                word={word}
                typed={typed}
                isCurrent={wi === wordIndex}
                isPast={wi < wordIndex}
              />
            );
          })}
        </div>
      </div>

      {/* focus hint */}
      {!isFocused && (
        <div className="text-dim absolute inset-x-0 top-1/2 text-center font-mono text-sm">
          click anywhere or press any key to continue
        </div>
      )}
    </div>
  );
});
