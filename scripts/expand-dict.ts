/**
 * Dictionary expansion generator: applies standard English orthography to the
 * curated families in expand-dict-data.ts and emits
 * src/lib/typing/words-generated.ts (committed, audited by dict-audit.ts).
 *
 * Rules implemented:
 *   plurals:  -s / -es (s,x,z,ch,sh) / -ies (consonant+y); specials explicit
 *   verbs:    -s / -ing / -ed with drop-e (not ee/ie), explicit CVC doubling,
 *             consonant+y -> ies/ied, ie -> y-ing; irregulars explicit
 *   degrees:  -er/-est with y->ier, e->r/st, explicit doubling
 *   adverbs:  -le -> -y, -ic -> -ally, -ll -> -lly, consonant+y -> -ily,
 *             exceptions explicit (true->truly, whole->wholly, full->fully)
 *   derived:  explicit map only (ness/ment/tion/er/or/ian...)
 *
 * Run: bun scripts/expand-dict.ts
 */
import { writeFileSync } from "node:fs";
import { CORE_WORDS, EXTENDED_WORDS, HARD_WORDS } from "../src/lib/typing/words";
import {
  NEW_BASES, REGULAR_VERBS, DOUBLING_VERBS, IRREGULAR_VERBS,
  PLURAL_NOUNS, PLURAL_MAP, GRADABLE_ADJECTIVES, DOUBLING_ADJECTIVES,
  ADVERB_BASES, DERIVED,
} from "./expand-dict-data";

// NOTE: the "existing" set deliberately excludes COMMON_WORDS — words.ts now
// folds GENERATED_WORDS into COMMON_WORDS, so using it here would make the
// generator see its own output as pre-existing and emit nothing.
const existing = new Set<string>([...CORE_WORDS, ...EXTENDED_WORDS, ...HARD_WORDS]);
const emitted = new Set<string>();

function emit(word: string, source: string): void {
  const w = word.toLowerCase();
  if (!/^[a-z]{2,14}$/.test(w)) {
    console.log(`SKIP (invalid) ${JSON.stringify(word)} [${source}]`);
    return;
  }
  if (existing.has(w) || emitted.has(w)) return;
  emitted.add(w);
}

function isVowel(ch: string): boolean {
  return "aeiou".includes(ch);
}

function isConsonant(ch: string): boolean {
  return /[a-z]/.test(ch) && !isVowel(ch);
}

// -s form (verbs 3rd person / plural share rules)
function sForm(base: string): string {
  if (/(s|x|z|ch|sh)$/.test(base)) return base + "es";
  if (/[bcdfgjklmnpqrstvwxyz]y$/.test(base)) return base.slice(0, -1) + "ies";
  return base + "s";
}

// true when base should double final consonant for -ing/-ed/-er
function shouldDouble(base: string, allowed: boolean): boolean {
  if (!allowed || base.length < 3) return false;
  const c1 = base[base.length - 1];
  const v2 = base[base.length - 2];
  const c3 = base[base.length - 3];
  if (!isConsonant(c1) || !isVowel(v2) || "wxy".includes(c1)) return false;
  if (isConsonant(c3)) return true;
  // "qu" digraph: the u is consonantal (quit->quitting, squat->squatting)
  return c3 === "u" && base.length >= 4 && base[base.length - 4] === "q";
}

function ingEd(base: string, double: boolean): { ing: string; ed: string } {
  if (/ie$/.test(base)) {
    return { ing: base.slice(0, -2) + "ying", ed: base + "d" };
  }
  if (/ee$/.test(base)) {
    return { ing: base + "ing", ed: base + "d" };
  }
  if (/e$/.test(base)) {
    return { ing: base.slice(0, -1) + "ing", ed: base + "d" };
  }
  if (/[bcdfgjklmnpqrstvwxz]y$/.test(base)) {
    return { ing: base + "ing", ed: base.slice(0, -1) + "ied" };
  }
  const stem = base;
  if (shouldDouble(base, double)) {
    return { ing: stem + base.slice(-1) + "ing", ed: stem + base.slice(-1) + "ed" };
  }
  return { ing: stem + "ing", ed: stem + "ed" };
}

function degrees(base: string, double: boolean): [string, string] {
  if (/[bcdfgjklmnpqrstvwxyz]y$/.test(base)) {
    return [base.slice(0, -1) + "ier", base.slice(0, -1) + "iest"];
  }
  if (/e$/.test(base)) return [base + "r", base + "st"];
  if (shouldDouble(base, double)) {
    return [base + base.slice(-1) + "er", base + base.slice(-1) + "est"];
  }
  return [base + "er", base + "est"];
}

const ADVERB_EXCEPT: Record<string, string> = {
  true: "truly",
  due: "duly",
  whole: "wholly",
  full: "fully",
  public: "publicly",
  arguable: "arguably",
};

function adverb(base: string): string {
  if (ADVERB_EXCEPT[base]) return ADVERB_EXCEPT[base];
  if (/[bcdfgjklmnpqrstvwxyz]y$/.test(base)) return base.slice(0, -1) + "ily";
  if (/le$/.test(base)) return base.slice(0, -1) + "y";
  if (/ic$/.test(base)) return base + "ally";
  if (/ll$/.test(base)) return base + "y";
  return base + "ly";
}

// ---------------------------------------------------------------------------
// 1. new bases themselves
// ---------------------------------------------------------------------------
for (const w of NEW_BASES) emit(w.trim(), "NEW_BASES");

// ---------------------------------------------------------------------------
// 2. verbs: irregulars first (explicit), then regulars
// ---------------------------------------------------------------------------
for (const [base, forms] of Object.entries(IRREGULAR_VERBS)) {
  emit(base, "IRREGULAR_VERBS");
  emit(forms.ing ?? ingEd(base, false).ing, `irregular ${base}.ing`);
  if (forms.past) emit(forms.past, `irregular ${base}.past`);
  if (forms.pp) emit(forms.pp, `irregular ${base}.pp`);
  emit(forms.s ?? sForm(base), `irregular ${base}.s`);
}

const doubling = new Set(DOUBLING_VERBS);
for (const base of REGULAR_VERBS) {
  emit(base, "REGULAR_VERBS");
  const { ing, ed } = ingEd(base, doubling.has(base));
  emit(ing, `verb ${base}.ing`);
  emit(ed, `verb ${base}.ed`);
  emit(sForm(base), `verb ${base}.s`);
}

// ---------------------------------------------------------------------------
// 3. plurals: ensure the base exists, then apply rules / map
// ---------------------------------------------------------------------------
for (const [base, plural] of Object.entries(PLURAL_MAP)) {
  emit(base, "PLURAL_MAP");
  emit(plural, `plural ${base}`);
}
for (const base of PLURAL_NOUNS) {
  emit(base, "PLURAL_NOUNS");
  // irregular-plural bases skip the -s rule (heroes/mice/geese come from the map)
  if (!(base in PLURAL_MAP)) emit(sForm(base), `plural ${base}`);
}

// ---------------------------------------------------------------------------
// 4. comparatives / superlatives
// ---------------------------------------------------------------------------
const doublingAdj = new Set(DOUBLING_ADJECTIVES);
for (const base of GRADABLE_ADJECTIVES) {
  emit(base, "GRADABLE_ADJECTIVES");
  const [er, est] = degrees(base, doublingAdj.has(base));
  emit(er, `degree ${base}.er`);
  emit(est, `degree ${base}.est`);
}

// ---------------------------------------------------------------------------
// 5. adverbs
// ---------------------------------------------------------------------------
for (const base of ADVERB_BASES) {
  emit(base, "ADVERB_BASES");
  emit(adverb(base), `adverb ${base}`);
}

// ---------------------------------------------------------------------------
// 6. explicit derivations (emit both base and derived)
// ---------------------------------------------------------------------------
for (const [base, derived] of Object.entries(DERIVED)) {
  emit(base, "DERIVED.base");
  emit(derived, `derived ${base}`);
}

// ---------------------------------------------------------------------------
// emit file
// ---------------------------------------------------------------------------
const words = [...emitted].sort();
const lines: string[] = [];
for (let i = 0; i < words.length; i += 6) {
  lines.push("  " + words.slice(i, i + 6).map((w) => `"${w}"`).join(", ") + ",");
}

const out = `// GENERATED FILE — do not edit by hand. Regenerate with: bun scripts/expand-dict.ts
//
// Systematic morphological expansion of the core dictionary: regular verb
// forms (-s/-ing/-ed incl. curated irregulars), noun plurals, comparative/
// superlative degrees, -ly adverbs, and common derivations (-ness, -ment,
// -tion, agent nouns). Bases are curated in scripts/expand-dict-data.ts.
// These are all common English word forms — they add natural variety to the
// typing pool (and -ing/-ed/-er endings are frequent letter patterns worth
// practicing). The online full-potential pack adds a 10k frequency list on
// top of this at runtime.
export const GENERATED_WORDS: string[] = [
${lines.join("\n")}
];
`;

writeFileSync("src/lib/typing/words-generated.ts", out);

const dupes: string[] = [];
const seen = new Set<string>();
for (const w of words) {
  if (seen.has(w)) dupes.push(w);
  seen.add(w);
}

console.log(`emitted ${words.length} generated words -> src/lib/typing/words-generated.ts`);
console.log(`internal duplicates: ${dupes.length ? dupes.join(", ") : "none"}`);
console.log(`validation: all words match /^[a-z]{2,14}$/`);
