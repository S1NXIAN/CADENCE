/**
 * Motor priors — Bayesian shrinkage toward known motor-learning facts.
 *
 * A brand-new profile has no data, yet some keys are *known* to be harder for
 * human hands before a single keystroke is recorded: pinky keys miss more than
 * index keys, bottom-row reaches cost more than home-row, same-finger bigrams
 * ("ed", "ik") are the classic slowest transitions in typing research.
 *
 * Every key/bigram gets a prior error rate and latency from its QWERTY motor
 * class. Observed data is shrunk toward the prior with strength K (equivalent
 * to K phantom observations), so:
 *   - 1 bad attempt on a pinky key is actionable, 1 bad attempt on 'j' is noise
 *   - cold-start urgency exists before any personal data arrives
 *   - latency targets for grading exist from the very first test
 * This is the local-first equivalent of a cloud crowd-sourced prior.
 */

export type Finger = "lPinky" | "lRing" | "lMiddle" | "lIndex" | "rIndex" | "rMiddle" | "rRing" | "rPinky";
export type KeyRow = "number" | "top" | "home" | "bottom";

export interface KeyClass {
  finger: Finger;
  row: KeyRow;
  stretch: boolean; // index-finger reach columns (t/g/b, y/h/n) and outer columns
}

// QWERTY touch-typing finger assignment, column by column per row.
// number: 1 2 3 4 5 | 6 7 8 9 0
// top:    q w e r t | y u i o p
// home:   a s d f g | h j k l ;
// bottom: z x c v b | n m , . /
const ROW_DEFS: Array<{ row: KeyRow; chars: Array<[string, Finger, boolean]> }> = [
  {
    row: "number",
    chars: [
      ["1", "lPinky", false], ["2", "lRing", false], ["3", "lMiddle", false],
      ["4", "lIndex", false], ["5", "lIndex", true],
      ["6", "rIndex", true], ["7", "rIndex", false],
      ["8", "rMiddle", false], ["9", "rRing", false], ["0", "rPinky", false],
    ],
  },
  {
    row: "top",
    chars: [
      ["q", "lPinky", false], ["w", "lRing", false], ["e", "lMiddle", false],
      ["r", "lIndex", false], ["t", "lIndex", true],
      ["y", "rIndex", true], ["u", "rIndex", false],
      ["i", "rMiddle", false], ["o", "rRing", false], ["p", "rPinky", false],
    ],
  },
  {
    row: "home",
    chars: [
      ["a", "lPinky", false], ["s", "lRing", false], ["d", "lMiddle", false],
      ["f", "lIndex", false], ["g", "lIndex", true],
      ["h", "rIndex", true], ["j", "rIndex", false],
      ["k", "rMiddle", false], ["l", "rRing", false], [";", "rPinky", false],
    ],
  },
  {
    row: "bottom",
    chars: [
      ["z", "lPinky", false], ["x", "lRing", false], ["c", "lMiddle", false],
      ["v", "lIndex", false], ["b", "lIndex", true],
      ["n", "rIndex", true], ["m", "rIndex", false],
      [",", "rMiddle", false], [".", "rRing", false], ["/", "rPinky", false],
    ],
  },
  // strays that are tracked but not on the grid above
  { row: "home", chars: [["'", "rPinky", false]] },
  { row: "number", chars: [["-", "rPinky", false]] },
  { row: "top", chars: [["[", "rPinky", false], ["]", "rPinky", false]] },
];

const KEY_CLASS: Record<string, KeyClass> = {};
for (const { row, chars } of ROW_DEFS) {
  for (const [ch, finger, stretch] of chars) {
    KEY_CLASS[ch] = { finger, row, stretch };
  }
}

// ---------------------------------------------------------------------------
// Prior tables. Baselines are calibrated to a typical intermediate typist
// (~50-60 WPM): ~3.5% per-keystroke error rate, ~150ms home-row index interval.
// ---------------------------------------------------------------------------
export const PRIOR_BASE_ERR = 0.035;
export const PRIOR_BASE_LAT = 150;

// Relative error propensity by finger (motor-learning literature: ring and
// pinky fingers are markedly less accurate and less independent).
const FINGER_ERR: Record<Finger, number> = {
  lIndex: 1.0, rIndex: 1.0,
  lMiddle: 1.12, rMiddle: 1.12,
  lRing: 1.38, rRing: 1.38,
  lPinky: 1.62, rPinky: 1.62,
};

// Reaching off the home row costs accuracy.
const ROW_ERR: Record<KeyRow, number> = {
  home: 1.0, top: 1.16, bottom: 1.32, number: 1.62,
};

// Index-finger stretch columns (t/g/b, y/h/n) are slightly worse.
const STRETCH_ERR = 1.14;

const FINGER_LAT: Record<Finger, number> = {
  lIndex: 1.0, rIndex: 1.0,
  lMiddle: 1.05, rMiddle: 1.05,
  lRing: 1.13, rRing: 1.13,
  lPinky: 1.23, rPinky: 1.23,
};

const ROW_LAT: Record<KeyRow, number> = {
  home: 1.0, top: 1.07, bottom: 1.17, number: 1.33,
};

const STRETCH_LAT = 1.06;

export interface KeyPrior {
  err: number; // prior per-keystroke error rate 0..1
  lat: number; // prior inter-key latency ms
  freqW: number; // English letter-frequency weight of the key's impact
}

// English letter frequencies (percent) — a weak 'e' hurts global speed far
// more than a weak 'q', so urgency weights common letters up mildly.
const LETTER_FREQ: Record<string, number> = {
  e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0,
  d: 4.3, l: 4.0, c: 2.8, u: 2.8, m: 2.4, w: 2.4, f: 2.2, g: 2.0, y: 2.0,
  p: 1.9, b: 1.5, v: 1.0, k: 0.77, j: 0.15, x: 0.15, q: 0.095, z: 0.074,
};

function freqWeight(ch: string): number {
  const f = LETTER_FREQ[ch];
  if (!f) return 0.8; // digits/punctuation: neutral-low
  return Math.max(0.65, Math.min(1.25, 0.65 + (f / 12.7) * 0.6));
}

export function keyPrior(ch: string): KeyPrior {
  const cls = KEY_CLASS[ch];
  const err = cls
    ? PRIOR_BASE_ERR * FINGER_ERR[cls.finger] * ROW_ERR[cls.row] * (cls.stretch ? STRETCH_ERR : 1)
    : PRIOR_BASE_ERR * 1.3; // unmapped char: mildly pessimistic default
  const lat = cls
    ? PRIOR_BASE_LAT * FINGER_LAT[cls.finger] * ROW_LAT[cls.row] * (cls.stretch ? STRETCH_LAT : 1)
    : PRIOR_BASE_LAT * 1.15;
  return { err, lat, freqW: freqWeight(ch) };
}

// ---------------------------------------------------------------------------
// Bigram (transition) priors.
// ---------------------------------------------------------------------------
export type BigramClass = "sameFinger" | "sameHandAdjacent" | "sameHandFar" | "alternate";

const ROW_ORDER: Record<KeyRow, number> = { number: 0, top: 1, home: 2, bottom: 3 };

export interface BigramPrior {
  cls: BigramClass;
  rowSkip: number; // 0..3 — distance between rows (e.g. q->z skips 2 rows)
  err: number; // normalized prior error rate for this transition
  lat: number; // normalized prior latency ms
}

// Raw multipliers for each transition class.
const CLASS_ERR: Record<BigramClass, number> = {
  sameFinger: 2.35, // same finger, different key: the classic motor bottleneck
  sameHandAdjacent: 1.32,
  sameHandFar: 1.12,
  alternate: 0.92, // hand alternation is the easy case
};
const CLASS_LAT: Record<BigramClass, number> = {
  sameFinger: 1.42,
  sameHandAdjacent: 1.16,
  sameHandFar: 1.06,
  alternate: 0.94,
};
const ROW_SKIP_ERR = 1.22; // applied on top when the transition skips >= 2 rows
const ROW_SKIP_LAT = 1.1;

// Rough distribution of English bigrams across classes — used to normalize so
// that the AVERAGE common transition has prior ≈ base (relative scale).
const CLASS_SHARE = { alternate: 0.56, sameHandAdjacent: 0.2, sameHandFar: 0.12, sameFinger: 0.12 };
const NORM_ERR =
  CLASS_SHARE.alternate * CLASS_ERR.alternate +
  CLASS_SHARE.sameHandAdjacent * CLASS_ERR.sameHandAdjacent +
  CLASS_SHARE.sameHandFar * CLASS_ERR.sameHandFar +
  CLASS_SHARE.sameFinger * CLASS_ERR.sameFinger; // ≈ 1.20
const NORM_LAT =
  CLASS_SHARE.alternate * CLASS_LAT.alternate +
  CLASS_SHARE.sameHandAdjacent * CLASS_LAT.sameHandAdjacent +
  CLASS_SHARE.sameHandFar * CLASS_LAT.sameHandFar +
  CLASS_SHARE.sameFinger * CLASS_LAT.sameFinger; // ≈ 1.06

export function classifyBigram(a: string, b: string): BigramPrior {
  const ca = KEY_CLASS[a];
  const cb = KEY_CLASS[b];
  if (!ca || !cb) {
    return {
      cls: "alternate",
      rowSkip: 0,
      err: PRIOR_BASE_ERR * 1.1,
      lat: PRIOR_BASE_LAT * 1.05,
    };
  }

  let cls: BigramClass;
  if (ca.finger === cb.finger) {
    cls = "sameFinger";
  } else if (ca.finger[0] !== cb.finger[0]) {
    cls = "alternate"; // different hands
  } else {
    const order: Finger[] = ["lPinky", "lRing", "lMiddle", "lIndex", "rIndex", "rMiddle", "rRing", "rPinky"];
    const dist = Math.abs(order.indexOf(ca.finger) - order.indexOf(cb.finger));
    cls = dist === 1 ? "sameHandAdjacent" : "sameHandFar";
  }

  const rowSkip = Math.abs(ROW_ORDER[ca.row] - ROW_ORDER[cb.row]);
  let err = CLASS_ERR[cls];
  let lat = CLASS_LAT[cls];
  if (rowSkip >= 2) {
    err *= ROW_SKIP_ERR;
    lat *= ROW_SKIP_LAT;
  }
  return {
    cls,
    rowSkip,
    err: (PRIOR_BASE_ERR * err) / NORM_ERR,
    lat: (PRIOR_BASE_LAT * lat) / NORM_LAT,
  };
}
