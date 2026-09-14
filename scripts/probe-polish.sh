#!/bin/bash
# Task 34 polish probe — live verification of the token/pulse/micro-type pass
# Run: bash scripts/probe-polish.sh
set -u
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ok: $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
check() { # $1 name, $2 actual, $3 expected-substr
  if echo "$2" | tr -d '"' | grep -qi "$3"; then ok "$1"; else bad "$1 — got: $(echo "$2" | tr -d '"' | head -c 200)"; fi
}

cd /home/z/my-project

echo "1. open app"
agent-browser open http://localhost:3000 >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1

echo "2. zero page errors"
E=$(agent-browser errors 2>/dev/null | head -5)
if [ -z "$E" ]; then ok "no page errors"; else bad "page errors: $E"; fi

echo "3. footer dot breathes (animation applied)"
DOT=$(agent-browser eval "getComputedStyle(document.querySelector('.dot-breathe')).animationName" 2>/dev/null)
check "dot-breathe animation-name" "$DOT" "dot-breathe"
DUR=$(agent-browser eval "getComputedStyle(document.querySelector('.dot-breathe')).animationDuration" 2>/dev/null)
check "dot-breathe 2.8s" "$DUR" "2.8s"

echo "4. mode: words / 10 (shortest run)"
agent-browser find role button click --name "words" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser find role button click --name "10" >/dev/null 2>&1
agent-browser wait 500 >/dev/null 2>&1
LEN=$(agent-browser eval "document.body.innerText.includes('1 / 10 words') ? 'ok' : 'no'" 2>/dev/null)
check "words-10 active" "$LEN" "ok"

echo "5. paced throwaway run (>2s session so per-second samples exist)"
for i in $(seq 1 10); do
  agent-browser press a >/dev/null 2>&1
  sleep 0.15
  agent-browser press Space >/dev/null 2>&1
  sleep 0.35
done
# poll up to 5s for results
RES=""
for i in $(seq 1 10); do
  RES=$(agent-browser eval "document.body.innerText.toLowerCase().includes('test audit') ? 'results' : 'running'" 2>/dev/null)
  [ "$(echo "$RES" | tr -d '"')" = "results" ] && break
  agent-browser wait 500 >/dev/null 2>&1
done
check "results screen reached (audit rendered)" "$RES" "results"

echo "6. tokenized chart strokes resolve to exact token colors"
# IIFE per eval: the page JS context persists between evals — top-level const
# redeclaration throws, so every eval gets its own function scope
GRID=$(agent-browser eval "(() => { const g1=[...document.querySelectorAll('main svg line')].find(l=>l.getAttribute('stroke')==='var(--border)'); return g1 ? getComputedStyle(g1).stroke : 'missing' })()" 2>/dev/null)
check "grid var(--border) -> rgb(35, 37, 43)" "$GRID" "rgb(35, 37, 43)"
DIML=$(agent-browser eval "(() => { const g2=[...document.querySelectorAll('main svg line')].find(l=>l.getAttribute('stroke')==='var(--dim)'); return g2 ? getComputedStyle(g2).stroke : 'missing' })()" 2>/dev/null)
check "legend var(--dim) -> rgb(92, 98, 112)" "$DIML" "rgb(92, 98, 112)"
ERRL=$(agent-browser eval "(() => { const g3=[...document.querySelectorAll('main svg g, main svg line, main svg path')].find(l=>l.getAttribute('stroke')==='var(--error)'); return g3 ? getComputedStyle(g3).stroke : 'missing' })()" 2>/dev/null)
check "error marker var(--error) -> rgb(248, 113, 113)" "$ERRL" "rgb(248, 113, 113)"
HUE=$(agent-browser eval "(() => { const g4=[...document.querySelectorAll('main svg path')].find(l=>l.getAttribute('stroke')==='var(--hue)'); return g4 ? getComputedStyle(g4).stroke : 'missing' })()" 2>/dev/null)
check "wpm line var(--hue) -> rgb(163, 230, 53)" "$HUE" "rgb(163, 230, 53)"

echo "7. results micro-type floor: no rendered HTML text under 11px"
SMALL=$(agent-browser eval "
  [...document.querySelectorAll('main span, main div, footer span')]
    .filter(el => el.childElementCount === 0 && el.textContent.trim())
    .map(el => parseFloat(getComputedStyle(el).fontSize))
    .filter(s => s < 11 && s > 0).length" 2>/dev/null | tr -d '"')
if [ "$SMALL" = "0" ]; then ok "no HTML text below 11px"; else bad "found $SMALL elements below 11px"; fi

echo "8. screenshot for the record"
agent-browser screenshot /home/z/my-project/download/polish-results.png >/dev/null 2>&1 && ok "screenshot saved"

echo "9. console errors after run"
C=$(agent-browser console 2>/dev/null | grep -i "error" | head -3)
if [ -z "$C" ]; then ok "no console errors"; else bad "console errors: $C"; fi

echo "10. cleanup: storage + tab"
agent-browser storage local clear >/dev/null 2>&1 && ok "storage cleared"
agent-browser tab close >/dev/null 2>&1
agent-browser close >/dev/null 2>&1

echo ""
echo "PROBE RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
