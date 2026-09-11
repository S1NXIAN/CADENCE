#!/bin/bash
# E2E smoke for the results-screen audit overhaul.
# Runs a 10-word test with deliberate errors, then verifies every new
# audit section renders: compare strip, speed anatomy, error autopsy,
# key report, rhythm, word check — plus the coach notes still present.
set -e

URL="http://localhost:3000"
SHOT="/home/z/my-project/scripts/audit-results.png"
TMP="/home/z/my-project/scripts/.audit-smoke.raw"

agent-browser set viewport 1440 900 >/dev/null
agent-browser open "$URL" >/dev/null
sleep 2.5

# force words/10 deterministically (persisted settings may point elsewhere)
agent-browser eval "(() => {
  const btn = (t) => Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === t);
  const w = btn('words'); if (w) w.click();
  return 'ok';
})()" >/dev/null 2>&1 || true
sleep 0.4
agent-browser eval "(() => {
  const btn = (t) => Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === t);
  const c = btn('10'); if (c) c.click();
  return 'ok';
})()" >/dev/null 2>&1 || true
sleep 0.8

# read the test words
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join('|')" > "$TMP" 2>/dev/null || true
WORDS=$(python3 -c "
import json,re
raw = open('$TMP').read().strip()
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
[ -n "$WORDS" ] || { echo "FAIL: could not read words"; exit 1; }
IFS='|' read -ra ARR <<< "$WORDS"
N=${#ARR[@]}
echo "typing $N words: $WORDS"

# type all words; inject a wrong leading char into words 2 and 5
# (generates confusion pairs + flagged words for the audit panels)
for (( i=0; i<N; i++ )); do
  word="${ARR[$i]}"
  if [ "$i" -eq 1 ] || [ "$i" -eq 4 ]; then
    agent-browser press "x" >/dev/null; sleep 0.05
  fi
  for (( j=0; j<${#word}; j++ )); do
    agent-browser press "${word:$j:1}" >/dev/null
    sleep 0.045
  done
  agent-browser press "Space" >/dev/null
  sleep 0.2
done
sleep 1.2

# verify sections
agent-browser eval "document.body.innerText" > "$TMP" 2>/dev/null
python3 -c "
import json
raw = open('$TMP').read().strip()
try:
    v = json.loads(raw)
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: pass
    text = str(v)
except Exception:
    text = raw
sections = ['test audit','speed anatomy','error autopsy','key report','rhythm','word check','coach notes']
low = text.lower()
missing = [s for s in sections if s not in low]
extras = {
  'compare chips': ('prev best' in low or 'test #' in low),
  'confusion slips': ('meant → typed' in low),
  'clean words ratio': ('words clean' in low),
  'consistency': ('consistency' in low),
}
print('missing sections:', missing if missing else 'NONE')
for k, ok in extras.items():
    print(f'{k}: {\"ok\" if ok else \"MISSING\"}')
if missing or not all(extras.values()):
    raise SystemExit(1)
print('SMOKE PASS')
"
agent-browser screenshot "$SHOT" >/dev/null
echo "screenshot: $SHOT"
