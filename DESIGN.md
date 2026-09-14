---
name: Cadence
description: The typing coach that learns you — a keyboard-first, fully local adaptive typing test
colors:
  phosphor: "#a3e635"
  phosphor-dim: "#a3e63599"
  tube-black: "#0c0d0f"
  chassis: "#131417"
  console: "#17181c"
  gunmetal: "#1a1c21"
  hairline: "#23252b"
  outline: "#26282f"
  ghost: "#3d414b"
  shadow-steel: "#5c6270"
  panel-grey: "#9aa0ae"
  steel: "#8b90a0"
  dim-signal: "#c8ccd6"
  signal-white: "#e8eaf0"
  on-phosphor: "#10130a"
  alarm-red: "#f87171"
  amber-beacon: "#fbbf24"
  afterglow-mauve: "#93676f"
  violet-trace: "#a78bfa"
  burnt-edge: "#3a2525"
  telemetry-cyan: "#2dd4bf"
  signal-rose: "#fb7185"
typography:
  display:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "clamp(3.75rem, 8vw, 6rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  metric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "clamp(1.125rem, 2vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.2
  wordstream:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "clamp(1.55rem, 2.2vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 2.2
  title:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  logo-mark:
    backgroundColor: "rgba(163, 230, 53, 0.15)"
    textColor: "{colors.phosphor}"
    rounded: "{rounded.lg}"
    size: "36px"
  mode-pill-active:
    backgroundColor: "rgba(163, 230, 53, 0.15)"
    textColor: "{colors.phosphor}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  data-chip:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.panel-grey}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  audit-panel:
    backgroundColor: "{colors.chassis}"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  kbd-cap:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.shadow-steel}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.shadow-steel}"
    rounded: "{rounded.md}"
    padding: "8px"
  overlay-surface:
    backgroundColor: "{colors.chassis}"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.2xl}"
    padding: "24px 32px"
---

# Design System: Cadence

## Overview

**Creative North Star: "The Terminal Trainer"**

Cadence looks like a piece of training equipment, not a game. A phosphor
instrument on warm charcoal — one glowing accent color against near-black,
every reading tabular, every surface a hairline away from the void. It is
technical, relentless, and machine-precise: the interface is a coach with a
keystroke log, watching how you type and answering with data. The machine
has moods only through that one phosphor hue; everything else is steel,
shadow, and discipline. The lowercase-everything wordmark and the
uppercase micro-labels read like an operator's console: quiet, competent,
always on.

Density is deliberate — compact chips and 11px labels pack a lot of
forensic data on screen, but the word stream itself breathes at ~2.2× line
height with generous measure. Color is never decoration: red happened,
amber should worry you, mauve was skipped, phosphor is alive. Depth is
expressed by tonal layering and 1px borders, not shadows. Motion is felt,
not watched: a blinking caret, a 150ms stream glide, a slowly breathing
"local" dot.

**Key Characteristics:**

- One active phosphor accent (user-selectable, default lime) on a warm charcoal neutral ramp
- Geist Mono is the identity face; tabular numerals on every reading
- Flat console: hairline borders + tonal steps, no resting shadows
- 11px uppercase letter-spaced labels carry the section hierarchy
- The word stream is the hero: viewport-scaled, caret-driven, forensically colored

## Colors

A near-black instrument housing with a single phosphor accent; the palette
character is "glow on charcoal" — everything is steel until data gives it
a color.

### Primary

- **Phosphor** (#a3e635): the one accent — live caret, current-word
  underline, active mode pill, WPM display, progress hairline, logo mark.
  Also the default of four user-switchable accent hues (amber #fbbf24,
  cyan #2dd4bf, rose #fb7185). Applied mostly as alpha washes: 15%
  background + 30% border + full text for "active" state; 60% blend
  (`#a3e63599`) for selection highlight and reference lines.
- **On-Phosphor Ink** (#10130a): text/icons sitting directly on phosphor
  fills (e.g. heatmap peak cells), keeping contrast near-black-on-lime.

### Secondary

- **Alarm Red** (#f87171): wrong keystrokes only — error glyphs in the
  stream, error bars, destructive actions (paired with **Burnt Edge**
  #3a2525 as its chip hairline so danger boxes don't glow).
- **Amber Beacon** (#fbbf24): coach warnings and caution metrics — extra
  chars, error tax, "cold open", strict-mode notice.
- **Afterglow Mauve** (#93676f): letters skipped past (space pressed
  early) — deliberately muted so it reads as "blurred past", never like a
  wrong key.
- **Violet Trace** (#a78bfa): missed *words* in results breakdowns only.

### Tertiary

- **Telemetry Cyan** (#2dd4bf) / **Signal Rose** (#fb7185): the remaining
  user-selectable accent hues and chart series; they never appear
  alongside phosphor — one accent per session.

### Neutral

- **Tube Black** (#0c0d0f): page background; the housing everything sits in.
- **Chassis** (#131417): panels, audit cards, dialog bodies (--surface).
- **Console** (#17181c): popover surface, one step above chassis.
- **Gunmetal** (#1a1c21): elevated wash — chips, kbd caps, hover fill,
  table headers.
- **Hairline** (#23252b): the 1px border color for nearly everything.
- **Outline** (#26282f): input strokes; **Scroll Steel** (#2a2d34 / hover
  #3a3e47) for the 6px custom scrollbar thumbs.
- Text ramp, lightest to darkest: **Signal White** (#e8eaf0) correct
  keystrokes and primary text · **Dim Signal** (#c8ccd6) secondary ·
  **Panel Grey** (#9aa0ae) body/coach copy · **Steel** (#8b90a0) muted ·
  **Shadow Steel** (#5c6270) labels and idle UI · **Ghost** (#3d414b)
  faint captions, untyped-adjacent hints.

### Named Rules

**The One Phosphor Rule.** Exactly one accent hue is alive per session,
chosen by the typist; state is expressed as phosphor washes (bg 15%,
border 30%, text 100%), never as a second color. The accent covers well
under 10% of any screen — its rarity is the point.

**The Color-Is-Data Rule.** Color encodes what happened (red wrong, amber
warned, mauve skipped, violet missed) or what is active (phosphor). If a
color isn't reporting a fact or state, it doesn't get on the screen.

## Typography

**Display Font:** Geist Mono (with ui-monospace fallback)
**Body Font:** Geist Mono — the same face; Geist Sans is loaded but only
surfaces in the command-palette dialog header (a known legacy leak, not a
second voice)
**Label/Mono Font:** Geist Mono, uppercase with 0.1em tracking for labels

**Character:** A single monospace voice, all lowercase, operator-console
steady — numbers align in columns, words measure honestly, and the type
never shouts except at display size, where the WPM numeral becomes the
instrument's main gauge.

### Hierarchy

- **Display** (700, 48→96px via text-6xl/7xl/8xl, line-height 1): the WPM
  numeral on results, tinted phosphor — the hero reading.
- **Metric** (600, 18→24px, tabular): live wpm/acc, the timer numeral
  (30→36px), consistency score — instrument gauge tier.
- **Wordstream** (400, 24.8→40px `--word-size` 1.55→2.5rem by breakpoint,
  line-height 2.2 via `--word-line-h` 3.6→5.5rem, 1.1 inside a word):
  the typing surface; scales with viewport, holds ~45–50 chars/line.
- **Title** (700, 18px, tracking -0.025em): the lowercase "cadence"
  wordmark. Sections don't use big headings — labels do that job.
- **Body** (400, 13–15px, leading relaxed ~1.625): coach notes, audit
  prose, panel copy.
- **Label** (400, 11px, +0.1em tracking, uppercase): "WPM", "TEST AUDIT",
  "COACH NOTES", panel titles, axis text — the sectioning voice.
- **Micro** (11px floor): chips, captions, footnotes. 12px for stat
  details. Nothing below 11px.

Numerals are always tabular — `tnum` is set on the body and every stat
repeats it — so live readings never jitter.

### Named Rules

**The Monospace Constitution.** If it is data, UI chrome, or a reading,
it is Geist Mono — lowercase, tabular where numeric. There is no display
serif waiting in the wings and no second text face to reach for.

**The Eleven-Pixel Floor.** No text below 11px anywhere (HTML, chart
axis, legends). One documented exception: dense heatmap axis labels at
10px, where the grid pitch physically cannot fit 11px.

## Layout

A single centered column on a full-viewport flex frame: header (top,
20/32px side padding) → centered mode pill row → text-only sub-option
toggles → the main stage (vertically centered, `flex-1`) → footer pinned
to the bottom edge (`mt-auto`), never floating. The stage container
widens with the viewport in lockstep with the word stream — max-width
768px → 1152px across lg→2xl — so the stream holds its ~45–50
characters-per-line measure while word size scales 1.55→2.5rem.

Density is compact and chip-based: panel grids use 12px gaps, audit cards
16–20px padding, overlays 24–32px. The spacing rhythm walks the 4px scale
(4/8/12/16/20/24/32/40). Responsive: mode pills wrap; the connection
badge appears at ≥768px, the streak chip at ≥640px; audit panels go
two-up at ≥640px; the results hero splits to a 280px + 1fr grid at
≥1024px; tall desktops (≥1280px wide and ≥820px high) earn a fourth
visible word line. A 2px progress hairline is fixed to the very top of
the viewport during a run.

## Elevation & Depth

Flat by discipline. Depth is tonal layering — tube-black housing, chassis
panels, gunmetal raised elements — separated by 1px hairlines
(#23252b). Nothing on the main screen casts a shadow at rest; hover
states deepen tone, they don't lift.

### Shadow Vocabulary

- **Overlay Lift** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)` —
  Tailwind `shadow-2xl`): reserved exclusively for a modal taking the
  stage (stats sheet), always over a black 70% scrim with backdrop blur.
  Shadows signal "this is now the whole room", never "this is special".

### Named Rules

**The Flat Console Rule.** Surfaces are flat at rest; depth is a tonal
step plus a hairline. The only shadow in the product belongs to an
overlay that has taken over the screen.

## Shapes

Corners follow an 8px master radius, stepped by role: 4px on kbd key
caps (they represent physical keys), 6px on chips, pills and icon
buttons, 8px on panels, capsules and the logo mark, 12px on stat tiles,
16px on full overlay surfaces. Progress bars, consistency bars and accent
swatches are fully rounded (pill/circle). Strokes are 1px hairlines
everywhere; the only 2px strokes are meaningful — the current word's
bottom-border underline and the progress hairline. Bar charts and fate
bars are 2–4px tall rounded tracks on hairline-colored beds. Icon
language: Lucide outline icons, 14–20px, matching stroke weight with the
mono text; the logotype icon (waves) sits in a phosphor-washed square.

## Components

### Mode Pills

The primary navigation — lowercase mono text with a small Lucide glyph.
- **Shape:** 6px radius, 14px × 6px padding.
- **Active:** phosphor wash (bg 15%, text phosphor, semibold).
- **Idle:** shadow-steel text; hover deepens tone to gunmetal +
  foreground text. Never outlined, never filled solid.

### Data Chips

The workhorse of the audit surfaces — confusion pairs, slow keys, worst
words, metric deltas.
- **Style:** gunmetal or chassis fill, 1px hairline border, 6px radius,
  11–12px mono; small variant 6px × 4px padding.
- **Danger variant:** same geometry, border burnt-edge (#3a2525), alarm-red
  text — the hairline stays dark so danger reads as ink, not glow.
- **Metric chip:** right-aligned in coach notes, elevated fill, dim text.

### Audit Panels

Card containers for the results forensics.
- **Corner Style:** 8px radius.
- **Background:** chassis on the tube-black page; stat tiles inside are
  gunmetal at 12px radius.
- **Shadow Strategy:** none — see The Flat Console Rule.
- **Border:** 1px hairline.
- **Internal Padding:** 16px, 20px on wide screens; 12px between siblings.
- **Header:** 11px uppercase letter-spaced label with a small phosphor
  (or amber) Lucide glyph.

### Kbd Caps

Footer key hints (`tab`, `esc`) and drill-target keys.
- **Style:** gunmetal fill, hairline border, 4px radius, 6px × 2px
  padding, 12px mono — deliberately the smallest radius in the system,
  so they read as physical keys.

### Text Toggles

Punctuation/numbers/duration options are bare mono text buttons, 12px:
ghost (#3d414b) when off, phosphor when on, brightening on hover. The
settings sheet uses the same idea at capsule scale — 8px-radius bordered
rows where active state is a phosphor wash (bg 10%, border 50%).

### Icon Buttons

Header controls (stats, settings): transparent, 8px padding, 6px radius,
shadow-steel icon; hover steps to gunmetal fill and foreground icon. The
only traditional buttons in the product; they recede on purpose.

### The Word Stream (signature)

Three (or four on tall screens) lines of viewport-scaled mono words on a
2.2× rhythm. Untyped words are shadow-steel; typed-correct characters
brighten to signal-white; errors go alarm-red (extras at 60%); skipped
letters fade to afterglow-mauve. The current word wears a 2px phosphor
underline at 50%; a 2.5px phosphor caret (line/block/underline styles)
glides between characters at 90–120ms and blinks (1.1s, stepped) when
idle. The whole stream dims to 35% opacity when focus is lost — an
honest "machine idle" state — and glides whole lines at 150ms when the
window advances.

### Console Chrome (header/footer)

Header: phosphor-washed logo square + lowercase wordmark + 11px
uppercase tagline "TYPING COACH · LEARNS YOU", status chips (connection
badge, streak flame) on the right. Footer: kbd caps for shortcuts on the
left; on the right a 6px phosphor dot breathing on a 2.8s cycle beside
"100% local · no account · no cloud". Overlays: 70% black scrim with
backdrop blur; stats sheet is chassis at 16px radius; command palette
keeps its stock cmdk shell.

## Do's and Don'ts

### Do:

- **Do** set `tnum` (tabular numerals) on anything that counts — live
  metrics, chips, table columns — so readings never shift as digits change.
- **Do** express active/selected state as a phosphor alpha stack: bg 10–15%,
  border 30–50%, text 100% (see mode pills, option capsules).
- **Do** keep section hierarchy in 11px uppercase, +0.1em tracked,
  shadow-steel labels — never introduce display-size section headings.
- **Do** animate to be felt, not watched: 150ms stream glides, 90–120ms
  caret, 2.8s ambient breathing; honor `prefers-reduced-motion`
  (the breathing dot stops, glides remain functional).
- **Do** keep the word stream at ~45–50 chars per line and let `--word-size`
  scale with the viewport (1.55→2.5rem) — the measure is the layout's
  invariant, not the pixel width.

### Don't:

- **Don't** introduce a second accent hue on a screen — one phosphor per
  session; chart series and alt accents never mix with the active one.
- **Don't** add resting shadows, gradients, or glow effects — depth is
  tonal layering + 1px hairlines; shadow is for overlay modals only.
- **Don't** set anything below 11px (heatmap axis labels at 10px are the
  single documented exception).
- **Don't** reach for Geist Sans or a second text voice for UI or data —
  mono is the constitution; the sans in the command-palette header is a
  known leak, not permission.
- **Don't** color skipped-past letters as errors — afterglow mauve means
  "blurred past"; alarm red means "you typed this wrong".
- **Don't** gamify: no confetti, leaderboards, badges-for-show, or arcade
  energy — this is the anti-reference (monkeytype-style playfulness);
  celebration lives in a phosphor "new personal best" chip and the coach's
  measured words.
