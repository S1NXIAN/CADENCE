/**
 * Positional word diff — the single source of truth for comparing a target
 * word against what the typist committed. Used by the live session metrics,
 * the final result computation, the results-screen audit, and the word-level
 * memory scheduler, so every consumer agrees on what "wrong" means.
 */
export interface WordDiff {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

export function diffWord(target: string, typed: string): WordDiff {
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

/**
 * Fast imperfect check with early exit — same semantics as
 * `diffWord(a, b)` differing from the identity, without building the tally.
 */
export function isWordImperfect(target: string, typed: string): boolean {
  if (target === typed) return false;
  const minLen = Math.min(target.length, typed.length);
  for (let i = 0; i < minLen; i++) {
    if (target[i] !== typed[i]) return true;
  }
  return target.length !== typed.length;
}
