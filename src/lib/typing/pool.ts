/**
 * Runtime vocabulary pools: the static dictionary (words.ts, always available)
 * plus optional content packs (online full-potential layer, cached locally).
 * Everything routes through here so the generator automatically picks up
 * pack words without caring where they came from.
 */
import { COMMON_WORDS, HARD_WORDS, QUOTES, type Quote } from "./words";

const MAX_PACK_WORDS = 12000;
const MAX_PACK_QUOTES = 600;

let packCommon: string[] = [];
let packHard: string[] = [];
let packQuotes: Quote[] = [];

let commonCache: string[] | null = null;
let adaptiveCache: string[] | null = null;
let quotesCache: Quote[] | null = null;

const listeners = new Set<() => void>();

function invalidate(): void {
  commonCache = null;
  adaptiveCache = null;
  quotesCache = null;
  for (const fn of listeners) fn();
}

function validWords(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const w of list) {
    if (typeof w === "string" && /^[a-z]{2,14}$/.test(w)) out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

function validQuotes(list: unknown, max: number): Quote[] {
  if (!Array.isArray(list)) return [];
  const out: Quote[] = [];
  for (const q of list) {
    if (typeof q !== "object" || q === null) continue;
    const text = String((q as Quote).text ?? "");
    const author = String((q as Quote).author ?? "unknown");
    if (text.length < 12 || text.length > 220) continue;
    if (!/^[ -~]+$/.test(text)) continue; // printable ASCII only
    out.push({ text, author });
    if (out.length >= max) break;
  }
  return out;
}

export interface PackContribution {
  common?: string[];
  hard?: string[];
  quotes?: Quote[];
}

/** Merge a content pack into the active pools (deduped, validated). */
export function registerPack(c: PackContribution): void {
  let changed = false;
  if (c.common) {
    const existing = new Set(getCommonPool());
    const add: string[] = [];
    for (const w of validWords(c.common, MAX_PACK_WORDS)) {
      if (!existing.has(w)) {
        existing.add(w);
        add.push(w);
      }
    }
    if (add.length) {
      packCommon = Array.from(new Set([...packCommon, ...add]));
      changed = true;
    }
  }
  if (c.hard) {
    const existing = new Set([...HARD_WORDS, ...packHard]);
    const add = validWords(c.hard, MAX_PACK_WORDS).filter((w) => !existing.has(w));
    if (add.length) {
      packHard = Array.from(new Set([...packHard, ...add]));
      changed = true;
    }
  }
  if (c.quotes) {
    const seen = new Set(getQuotes().map((q) => q.text.slice(0, 60)));
    const add = validQuotes(c.quotes, MAX_PACK_QUOTES).filter((q) => {
      const key = q.text.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (add.length) {
      packQuotes = [...packQuotes, ...add];
      changed = true;
    }
  }
  // no-op re-registrations (e.g. re-hydrating identical cached packs) must
  // not invalidate the pools — downstream that would needlessly regenerate
  // the idle test
  if (changed) invalidate();
}

/** Drop all pack content — back to the pure static dictionary. */
export function clearPacks(): void {
  const had = packCommon.length > 0 || packHard.length > 0 || packQuotes.length > 0;
  packCommon = [];
  packHard = [];
  packQuotes = [];
  if (had) invalidate();
}

/** Everyday words (static CORE+EXTENDED+GENERATED plus pack common words). */
export function getCommonPool(): string[] {
  if (!commonCache) {
    commonCache = packCommon.length
      ? Array.from(new Set([...COMMON_WORDS, ...packCommon]))
      : COMMON_WORDS;
  }
  return commonCache;
}

/** Full adaptive pool: common pool + hard words + pack hard words. */
export function getAdaptivePool(): string[] {
  if (!adaptiveCache) {
    adaptiveCache = Array.from(new Set([...getCommonPool(), ...HARD_WORDS, ...packHard]));
  }
  return adaptiveCache;
}

export function getQuotes(): Quote[] {
  if (!quotesCache) {
    quotesCache = packQuotes.length ? [...QUOTES, ...packQuotes] : QUOTES;
  }
  return quotesCache;
}

export function packSizes(): { common: number; hard: number; quotes: number } {
  return { common: packCommon.length, hard: packHard.length, quotes: packQuotes.length };
}

export function onPacksChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
