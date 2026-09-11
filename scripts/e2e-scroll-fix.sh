#!/bin/bash
# E2E regression test for the word-stream scroll oscillation bug.
# Reproduces the user scenario: full 25-word test at 1366x768 (user's screen).
# After every submitted word we sample:
#   - computed translateY of the inner word stream  (must be monotonic non-decreasing)
#   - caret rect vs active word rect                (caret must hug the active word)
set -e

URL="http://localhost:3000"
OUT="/home/z/my-project/scripts/scroll-log.txt"
TMP="/home/z/my-project/scripts/.sample.raw"
: > "$OUT"

agent-browser set viewport 1366 768 >/dev/null
agent-browser open "$URL" >/dev/null
sleep 2.5

# decode helper: agent-browser eval prints the result JSON-encoded (often twice)
decode() { python3 -c "
import json,sys
raw = open('$TMP').read().strip()
try:
    v = json.loads(raw)
    if isinstance(v, str): v = json.loads(v)
    print(json.dumps(v))
except Exception:
    print(raw)
"; }

# grab the whole test word list (retry until it parses)
WORDS=""
for attempt in 1 2 3; do
  agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join('|')" > /tmp/w.raw 2>/dev/null || true
  WORDS=$(python3 -c "
import json,re
raw = open('/tmp/w.raw').read().strip()
try:
    v = json.loads(raw)
    if isinstance(v, str): v = json.loads(v)
    print(v)
except Exception:
    m = re.search(r'\"([A-Za-z|]+)\"', raw)
    print(m.group(1) if m else '')
")
  [ -n "$WORDS" ] && break
  sleep 1
done
[ -n "$WORDS" ] || { echo "could not read words"; exit 1; }
echo "WORDS: $WORDS" | tee -a "$OUT"
IFS='|' read -ra ARR <<< "$WORDS"
N=${#ARR[@]}
echo "TOTAL=$N" | tee -a "$OUT"

sample() {
  agent-browser eval "(() => {
    const outer = document.querySelector('[aria-label=\"typing test words\"]');
    if (!outer) return JSON.stringify({done:true});
    const inner = outer.firstElementChild;
    const tr = getComputedStyle(inner).transform;
    let ty = 0;
    if (tr && tr !== 'none') ty = new DOMMatrixReadOnly(tr).m42;
    const caret = inner.querySelector('.bg-hue');
    const w = document.querySelector('[data-wi=\"$1\"]');
    let cr = null, wr = null;
    if (caret) { const r = caret.getBoundingClientRect(); cr = {l:+r.left.toFixed(1), r:+r.right.toFixed(1), t:+r.top.toFixed(1), b:+r.bottom.toFixed(1)}; }
    if (w) { const r = w.getBoundingClientRect(); wr = {l:+r.left.toFixed(1), r:+r.right.toFixed(1), t:+r.top.toFixed(1), b:+r.bottom.toFixed(1)}; }
    return JSON.stringify({ty:+ty.toFixed(1), caret:cr, word:wr, done:false});
  })()" > "$TMP"
  decode
}

prev_ty=0
oscillation=0
caret_bad=0

for (( i=0; i<N; i++ )); do
  word="${ARR[$i]}"
  for (( j=0; j<${#word}; j++ )); do
    agent-browser press "${word:$j:1}" >/dev/null
    sleep 0.055
  done
  agent-browser press "Space" >/dev/null
  sleep 0.12
  # if a dropped key stalled progress, retry the space once
  agent-browser eval "(()=>{const els=document.querySelectorAll('[data-wi]'); let n=0; for (const e of els){ if(e.className.includes('border-hue')) n++; } const d=document.querySelector('.text-dim.tabular-nums'); return d?d.textContent:'?';})()" > /tmp/c.raw 2>/dev/null
  CNT=$(python3 -c "
import json
raw=open('/tmp/c.raw').read().strip()
v=json.loads(raw)
if isinstance(v,str): v=json.loads(v)
print(v.split(' / ')[0])
" 2>/dev/null || echo "?")
  if [ "$CNT" != "$((i+1))" ] && [ "$i" -lt $((N-1)) ]; then
    agent-browser press "Space" >/dev/null
    sleep 0.12
  fi

  S=$(sample "$((i+1))")
  INFO=$(python3 - "$S" "$prev_ty" "$((i+1))" "$word" <<'EOF'
import json,sys
raw=sys.argv[1]; prev=float(sys.argv[2]); n=sys.argv[3]; word=sys.argv[4]
try: d=json.loads(raw)
except Exception: print(f"PARSE_FAIL {raw[:80]}"); sys.exit()
if d.get("done"): print(f"word {n} ('{word}') -> results screen"); sys.exit()
ty=d["ty"]; back = 1 if ty > prev+1 else 0  # scroll-up = ty decreases; an INCREASE = view scrolled back down
c=d.get("caret"); w=d.get("word")
if c and w:
    okx = (c["l"] >= w["l"]-6) and (c["r"] <= w["r"]+8)
    oky = (c["t"] >= w["t"]-6) and (c["b"] <= w["b"]+6)
    cc = "OK" if (okx and oky) else f"BAD caret=({c['l']},{c['t']},{c['r']},{c['b']}) word=({w['l']},{w['t']},{w['r']},{w['b']})"
else:
    cc = "NORECT"
print(f"word {n} ('{word}') ty={ty} caret={cc} backward={back}")
EOF
)
  echo "$INFO" | tee -a "$OUT"
  case "$INFO" in
    *"backward=1"*) oscillation=$((oscillation+1)) ;;
    *BAD*|*NORECT*|*PARSE_FAIL*) [[ "$INFO" != *"results screen"* ]] && caret_bad=$((caret_bad+1)) ;;
  esac
  [[ "$INFO" == *"ty="* ]] && prev_ty=$(echo "$INFO" | sed -E 's/.*ty=(-?[0-9.]+).*/\1/')
  case $((i+1)) in 5|12|16|20|25) agent-browser screenshot "/home/z/my-project/scripts/scrollcheck-w$((i+1)).png" >/dev/null ;; esac
  sleep 0.08
done

echo "" | tee -a "$OUT"
echo "RESULT: backward_scroll_events=$oscillation caret_mispositioned=$caret_bad" | tee -a "$OUT"
if [ "$oscillation" -eq 0 ] && [ "$caret_bad" -eq 0 ]; then
  echo "PASS: no scroll oscillation, caret tracked correctly"
else
  echo "FAIL: scroll/caret regression present"
  exit 1
fi
