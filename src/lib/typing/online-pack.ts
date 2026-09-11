/**
 * Full-potential layer — WiFi/online detection with offline-first behavior.
 *
 * Cadence's engine is 100% local and works forever offline. When the browser
 * reports a network connection (navigator.onLine + online/offline events),
 * the app "unleashes full potential": it pulls optional content packs on
 * demand — a 10k English frequency word list and a large quote collection —
 * validates, dedupes and caches them in localStorage. Once cached, the packs
 * keep working offline forever. No account, no sync, nothing user-specific
 * ever leaves the device; the network only ever delivers vocabulary.
 */
import { registerPack, clearPacks, packSizes } from "./pool";

const WORDS_PACK_URL =
  "https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english-no-swears.txt";
const QUOTES_PACK_URL = "https://cdn.jsdelivr.net/gh/dwyl/quotes@master/quotes.json";

const CACHE_WORDS = "cadence.pack.words.v2";
const CACHE_QUOTES = "cadence.pack.quotes.v1";
const REFRESH_MS = 7 * 86400000; // re-fetch weekly when online

export type PackStatus =
  | "off" // user disabled online packs
  | "local" // no packs, not connected (pure local core)
  | "loading" // fetching packs now
  | "ready" // packs active (live or cached)
  | "error"; // online but the fetch failed (CDN unreachable) — core unaffected

export interface PackState {
  status: PackStatus;
  online: boolean; // last known navigator.onLine
  extraWords: number; // pack words merged into the active pool
  extraQuotes: number;
  lastSync: number | null; // epoch ms of last successful fetch
  cachedOnly: boolean; // packs active from cache while offline
}

let state: PackState = {
  status: "local",
  online: false,
  extraWords: 0,
  extraQuotes: 0,
  lastSync: null,
  cachedOnly: false,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<PackState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

export function getPackState(): PackState {
  return state;
}

export function subscribePackState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// localStorage cache (survives offline; packs stay usable without network)
// ---------------------------------------------------------------------------

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // quota exceeded — packs just won't persist
  }
}

interface WordsCache {
  t: number;
  words: string[];
}
interface QuotesCache {
  t: number;
  quotes: Array<{ text: string; author: string }>;
}

function readWordsCache(): WordsCache | null {
  const raw = safeGet(CACHE_WORDS);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as WordsCache;
    if (typeof p.t === "number" && Array.isArray(p.words)) return p;
  } catch {
    /* corrupt cache — refetch */
  }
  return null;
}

function readQuotesCache(): QuotesCache | null {
  const raw = safeGet(CACHE_QUOTES);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as QuotesCache;
    if (typeof p.t === "number" && Array.isArray(p.quotes)) return p;
  } catch {
    /* corrupt cache — refetch */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pack fetch + validate
// ---------------------------------------------------------------------------

async function fetchWordPack(): Promise<string[]> {
  const res = await fetch(WORDS_PACK_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`word pack HTTP ${res.status}`);
  const text = await res.text();
  const words = text
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    // 3+ letters and at least one vowel: drops pure abbreviations (mhz, cr)
    // while keeping all real words; proper-ish lowercase nouns (nelson) stay —
    // genre-standard for frequency-ranked typing lists
    .filter((w) => /^[a-z]{3,14}$/.test(w) && /[aeiou]/.test(w));
  if (words.length < 1000) throw new Error("word pack too small");
  return words;
}

async function fetchQuotePack(): Promise<Array<{ text: string; author: string }>> {
  const res = await fetch(QUOTES_PACK_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`quote pack HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("quote pack malformed");
  const out: Array<{ text: string; author: string }> = [];
  for (const q of data) {
    if (typeof q !== "object" || q === null) continue;
    const raw = q as Record<string, unknown>;
    const text = typeof raw.text === "string" ? raw.text : typeof raw.quote === "string" ? raw.quote : "";
    const author = typeof raw.author === "string" && raw.author.trim() ? raw.author.trim() : "Unknown";
    if (text.length < 12 || text.length > 220) continue; // typing-test sized
    if (!/^[ -~]+$/.test(text)) continue; // printable ASCII only
    out.push({ text: text.replace(/\s+/g, " ").trim(), author });
    if (out.length >= 600) break;
  }
  if (out.length < 20) throw new Error("quote pack too small");
  return out;
}

// ---------------------------------------------------------------------------
// Public lifecycle
// ---------------------------------------------------------------------------

/**
 * Hydrate cached packs (works with zero network). Pure — never fetches.
 * The page owns the refresh decision (weekly-gated + online-event driven).
 */
function initPacks(enabled: boolean): void {
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;
  setState({ online });

  if (!enabled) {
    clearPacks();
    setState({ status: "off", extraWords: 0, extraQuotes: 0, cachedOnly: false });
    return;
  }

  const wc = readWordsCache();
  const qc = readQuotesCache();
  let restored = false;
  if (wc) {
    registerPack({ common: wc.words });
    restored = true;
  }
  if (qc) {
    registerPack({ quotes: qc.quotes });
    restored = true;
  }

  if (restored) {
    const sizes = packSizes();
    setState({
      status: "ready",
      cachedOnly: !online,
      extraWords: sizes.common,
      extraQuotes: sizes.quotes,
      lastSync: Math.max(wc?.t ?? 0, qc?.t ?? 0) || null,
    });
  }

  // NOTE: no fetch here. initPacks is pure hydration — the page owns the
  // refresh decision (weekly-gated + online-event driven) so boot can never
  // fire overlapping fetches from multiple effects.
}

/** Fetch both packs, validate, merge, cache. Concurrent calls share one fetch. */
let refreshInFlight: Promise<void> | null = null;
export function refreshPacks(enabled: boolean): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefreshPacks().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefreshPacks(): Promise<void> {
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;
  setState({ online });
  if (!online) {
    setState({ status: state.extraWords > 0 || state.extraQuotes > 0 ? "ready" : "local", cachedOnly: state.extraWords > 0 });
    return;
  }

  setState({ status: "loading" });

  const results = await Promise.allSettled([fetchWordPack(), fetchQuotePack()]);
  let anyNew = false;
  let lastSync = state.lastSync;

  const [wordsRes, quotesRes] = results;
  if (wordsRes.status === "fulfilled") {
    registerPack({ common: wordsRes.value });
    safeSet(CACHE_WORDS, JSON.stringify({ t: Date.now(), words: wordsRes.value } satisfies WordsCache));
    anyNew = true;
    lastSync = Date.now();
  }
  if (quotesRes.status === "fulfilled") {
    registerPack({ quotes: quotesRes.value });
    safeSet(CACHE_QUOTES, JSON.stringify({ t: Date.now(), quotes: quotesRes.value } satisfies QuotesCache));
    anyNew = true;
    lastSync = Date.now();
  }

  if (anyNew) {
    const sizes = packSizes();
    setState({
      status: "ready",
      cachedOnly: false,
      extraWords: sizes.common,
      extraQuotes: sizes.quotes,
      lastSync,
    });
  } else {
    // both fetches failed but we're "online" — CDN unreachable/blocked
    const hasPacks = state.extraWords > 0 || state.extraQuotes > 0;
    setState({ status: hasPacks ? "ready" : "error", cachedOnly: hasPacks });
  }
}

/** Called when the browser fires `online`. */
export function handleOnline(enabled: boolean): void {
  void refreshPacks(enabled);
}

/** Called when the browser fires `offline`. */
export function handleOffline(): void {
  const hasPacks = state.extraWords > 0 || state.extraQuotes > 0;
  setState({
    online: false,
    status: hasPacks ? "ready" : "local",
    cachedOnly: hasPacks,
  });
}

/** User toggled the onlinePacks setting. */
export function setPacksEnabled(enabled: boolean): void {
  if (!enabled) {
    clearPacks();
    setState({ status: "off", extraWords: 0, extraQuotes: 0, cachedOnly: false });
  } else {
    const online = typeof navigator !== "undefined" ? navigator.onLine : false;
    // hydrate from cache immediately; the page drives any refresh
    initPacks(true);
    if (!online) setState({ status: state.extraWords > 0 ? "ready" : "local", cachedOnly: state.extraWords > 0 });
  }
}

/** Is a background refresh due (weekly) — used by the page on load. */
export function packRefreshDue(): boolean {
  if (!state.lastSync) return true;
  return Date.now() - state.lastSync > REFRESH_MS;
}
