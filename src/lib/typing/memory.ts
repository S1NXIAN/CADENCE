/**
 * FSRS-5 memory scheduler (via ts-fsrs) — replaces the old EWMA-decay
 * heuristic for "when should this key be re-drilled?".
 *
 * Every tracked key/bigram carries a MemCard (stability S, difficulty D,
 * review history). After each test, the item's aggregate performance is
 * mapped to one FSRS grade (again/hard/good/easy) and the card is advanced.
 * Urgency for curation comes from retrievability R(t,S) — the probability
 * the fingers still "remember" the item — rather than a hand-tuned decay.
 *
 * Parameters are FSRS-5 defaults tuned for a *motor* skill rather than
 * flashcards: retention target slightly higher, intervals capped so items
 * come back for verification within a reasonable practice horizon, and a
 * small motor floor so even massed same-session practice consolidates a
 * little (pure FSRS gives zero growth at t≈0 — correct for facts, too
 * pessimistic for muscle memory).
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, S_MIN, State, type Card, type Grade } from "ts-fsrs";
import type { MemCard } from "./types";

export type GradeName = "again" | "hard" | "good" | "easy";

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.92, // keep skills tighter than flashcard facts
    maximum_interval: 240, // nothing hides for more than ~8 months
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ["1m", "8m"] as const, // re-drill fumbles within the session
    relearning_steps: ["5m"] as const,
  })
);

const GRADE_MAP: Record<GradeName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** A fresh, never-reviewed card. */
export function newMemCard(now = Date.now()): MemCard {
  return { s: 0, d: 0, reps: 0, lapses: 0, state: State.New, ls: 0, last: null, due: now };
}

function toCard(m: MemCard): Card {
  const isNew = m.reps === 0 || m.state === State.New;
  const c = createEmptyCard(m.last ?? Date.now());
  c.due = new Date(m.due);
  // ts-fsrs validates memory state: New cards must carry s=0,d=0 exactly;
  // reviewed cards need s >= S_MIN and d in [1,10]
  c.stability = isNew ? 0 : Math.max(S_MIN, m.s);
  c.difficulty = isNew ? 0 : Math.max(1, Math.min(10, m.d));
  c.reps = m.reps;
  c.lapses = m.lapses;
  c.state = m.state as State;
  c.learning_steps = m.ls;
  c.last_review = m.last !== null ? new Date(m.last) : undefined;
  return c;
}

function fromCard(c: Card, now: number): MemCard {
  return {
    s: Math.min(240, Math.max(0, c.stability)),
    d: Math.max(1, Math.min(10, c.difficulty)),
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as number,
    ls: c.learning_steps,
    last: now,
    due: c.due.getTime(),
  };
}

/**
 * Advance an item's memory state with one review. Never throws — a scheduling
 * hiccup must not break finishing a test.
 */
export function reviewMem(mem: MemCard, grade: GradeName, now = Date.now()): MemCard {
  let next: Card;
  try {
    next = scheduler.next(toCard(mem), new Date(now), GRADE_MAP[grade]).card;
  } catch {
    return { ...mem, last: now };
  }
  let s = next.stability;
  // Motor floor: massed practice does consolidate (power law of practice).
  // Pure FSRS yields ~zero growth at t≈0; floor each success slightly so
  // consecutive tests still make slow progress on an item.
  if (grade === "easy") s = Math.max(s, mem.s * 1.12);
  else if (grade === "good") s = Math.max(s, mem.s * 1.06);
  else if (grade === "hard") s = Math.max(s, mem.s * 1.01);
  return fromCard({ ...next, stability: s }, now);
}

/**
 * Retrievability R(t,S) ∈ 0..1 — probability the skill is still "available".
 * 0 for never-reviewed items.
 */
export function memRetrievability(mem: MemCard, now = Date.now()): number {
  if (mem.reps === 0 || mem.state === State.New) return 0;
  try {
    const r = scheduler.get_retrievability(toCard(mem), new Date(now), false);
    return typeof r === "number" ? Math.max(0, Math.min(1, r)) : 0;
  } catch {
    return 0;
  }
}

/**
 * Seed a MemCard from legacy (pre-FSRS) aggregated stats when migrating a
 * stored profile: errRate/attempts estimate difficulty, stability and reps.
 */
export function seedMemFromHistory(errRate: number, attempts: number, lastSeen: number): MemCard {
  const now = Date.now();
  const n = Math.max(0, attempts);
  const er = Math.max(0, Math.min(1, errRate));
  const lapses = Math.min(Math.round(n * er), Math.round(n));
  const d = Math.max(1, Math.min(10, 2.5 + er * 7.5));
  const s = Math.max(0.15, Math.min(45, 0.25 + (1 - er) * Math.log2(1 + n) * 0.9));
  const reps = Math.min(15, Math.max(1, Math.round(Math.log2(1 + n))));
  const last = lastSeen > 0 ? lastSeen : now - 86400000;
  return { s, d, reps, lapses, state: State.Review, ls: 0, last, due: last };
}

/** Defensive revive of a persisted MemCard (untrusted JSON). */
export function sanitizeMem(raw: unknown, fallbackErrRate: number, fallbackAttempts: number, lastSeen: number): MemCard | null {
  if (typeof raw !== "object" || raw === null) {
    if (fallbackAttempts > 0) return seedMemFromHistory(fallbackErrRate, fallbackAttempts, lastSeen);
    return null;
  }
  const v = raw as Record<string, unknown>;
  const num = (x: unknown, min: number, max: number, fb: number) => {
    const n = typeof x === "number" && Number.isFinite(x) ? x : NaN;
    return Number.isNaN(n) ? fb : Math.min(max, Math.max(min, n));
  };
  const reps = Math.round(num(v.reps, 0, 1e6, 0));
  if (reps === 0) {
    // a card with zero reviews carries no information — reseed or drop
    if (fallbackAttempts > 0) return seedMemFromHistory(fallbackErrRate, fallbackAttempts, lastSeen);
    return null;
  }
  const last = v.last === null ? null : num(v.last, 0, Number.MAX_SAFE_INTEGER, Date.now() - 86400000);
  return {
    s: num(v.s, 0, 240, 0.2),
    d: num(v.d, 1, 10, 5),
    reps,
    lapses: Math.round(num(v.lapses, 0, 1e6, 0)),
    state: Math.round(num(v.state, 0, 3, 2)),
    ls: Math.round(num(v.ls, 0, 10, 0)),
    last,
    due: num(v.due, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}
