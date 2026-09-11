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

# the regression scenario is a 25-WORD test; persisted settings may point at
# quote/time mode (earlier smokes end there) — force words/25 deterministically
agent-browser eval "(() => {
  const btn = (t) => Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === t);
  const words = btn('words'); if (words) words.click();
  return 'words-mode';
})()" >/dev/null 2>&1 || true
sleep 0.4
agent-browser eval "(() => {
  const btn = (t) => Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === t);
  const c = btn('25'); if (c) c.click();
  return '25';
})()" >/dev/null 2>&1 || true
sleep 0.8

# decode helper: agent-browser eval prints the result JSON-encoded (sometimes twice)
decode() { python3 -c "
import json,sys
raw = open('$TMP').read().strip()
try:
    v = json.loads(raw)
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: pass
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
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: pass
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
    const els = Array.from(inner.querySelectorAll('[data-wi]'));
    const from = els.length ? +els[0].getAttribute('data-wi') : -1;
    const ref = inner.querySelector('[data-wi=\"' + (from + 8) + '\"]');
    const refTop = ref ? +ref.getBoundingClientRect().top.toFixed(1) : null;
    let cr = null, wr = null;
    if (caret) { const r = caret.getBoundingClientRect(); cr = {l:+r.left.toFixed(1), r:+r.right.toFixed(1), t:+r.top.toFixed(1), b:+r.bottom.toFixed(1)}; }
    if (w) { const r = w.getBoundingClientRect(); wr = {l:+r.left.toFixed(1), r:+r.right.toFixed(1), t:+r.top.toFixed(1), b:+r.bottom.toFixed(1)}; }
    return JSON.stringify({ty:+ty.toFixed(1), from, refTop, caret:cr, word:wr, done:false});
  })()" > "$TMP"
  decode
}

prev=""
oscillation=0
rewraps=0
caret_bad=0

for (( i=0; i<N; i++ )); do
  word="${ARR[$i]}"
  for (( j=0; j<${#word}; j++ )); do
    agent-browser press "${word:$j:1}" >/dev/null
    sleep 0.055
  done
  agent-browser press "Space" >/dev/null
  sleep 0.35  # let the 150ms scroll transition settle so samples are exact
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
    sleep 0.35
  fi

  S=$(sample "$((i+1))")
  INFO=$(python3 - "$S" "$prev" "$((i+1))" "$word" <<'EOF'
import json,sys
raw=sys.argv[1]; prev=json.loads(sys.argv[2]) if sys.argv[2] else None; n=sys.argv[3]; word=sys.argv[4]
try: d=json.loads(raw)
except Exception: print(f"PARSE_FAIL {raw[:80]}"); sys.exit()
if d.get("done"): print(f"word {n} ('{word}') -> results screen"); sys.exit()
ty=d["ty"]; frm=d["from"]; ref=d.get("refTop")
back = 1 if (prev and ty > prev["ty"]+1) else 0   # scroll-up = ty decreases; an INCREASE = view scrolled back down
rewrap = 0
if prev and prev.get("from") == frm and prev.get("refTop") is not None and ref is not None:
    # while the window start is unchanged, every word's STREAM-space top
    # must be constant (screen top may shift only by the scroll delta)
    # stream = screen - translateY, and ty is negative when scrolled
    st_now = round(ref - ty, 1)
    st_prev = round(prev["refTop"] - prev["ty"], 1)
    rewrap = 0 if abs(st_now - st_prev) < 1.5 else 1
c=d.get("caret"); w=d.get("word")
if c and w:
    okx = (c["l"] >= w["l"]-6) and (c["r"] <= w["r"]+8)
    oky = (c["t"] >= w["t"]-6) and (c["b"] <= w["b"]+6)
    cc = "OK" if (okx and oky) else f"BAD caret=({c['l']},{c['t']},{c['r']},{c['b']}) word=({w['l']},{w['t']},{w['r']},{w['b']})"
else:
    cc = "NORECT"
print(f"word {n} ('{word}') ty={ty} from={frm} rewrap={rewrap} caret={cc} backward={back}")
EOF
)
  echo "$INFO" | tee -a "$OUT"
  case "$INFO" in
    *"backward=1"*) oscillation=$((oscillation+1)) ;;
    *"rewrap=1"*) rewraps=$((rewraps+1)) ;;
    *BAD*|*NORECT*|*PARSE_FAIL*) [[ "$INFO" != *"results screen"* ]] && caret_bad=$((caret_bad+1)) ;;
  esac
  # stash this sample's scroll/window metrics for the next iteration
  prev=$(python3 - "$S" <<'EOF'
import json,sys
raw=sys.argv[1]
try:
    d=json.loads(raw)
    if d.get("done"): print(json.dumps(None)); sys.exit()
    print(json.dumps({"ty":d["ty"],"from":d["from"],"refTop":d.get("refTop")}))
except Exception: print(json.dumps(None))
EOF
)
  case $((i+1)) in 5|12|16|20|25) agent-browser screenshot "/home/z/my-project/scripts/scrollcheck-w$((i+1)).png" >/dev/null ;; esac
  sleep 0.08
done

echo "" | tee -a "$OUT"
echo "RESULT: backward_scroll_events=$oscillation rewrap_events=$rewraps caret_mispositioned=$caret_bad" | tee -a "$OUT"
if [ "$oscillation" -eq 0 ] && [ "$rewraps" -eq 0 ] && [ "$caret_bad" -eq 0 ]; then
  echo "PASS: no scroll oscillation, no mid-test re-wrap, caret tracked correctly"
else
  echo "FAIL: scroll/wrap/caret regression present"
  exit 1
fi
