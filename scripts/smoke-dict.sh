#!/bin/bash
# Smoke test for the expanded dictionary: page boots, words/adaptive modes
# render valid lowercase words, typing works. Reuses e2e-scroll-fix.sh patterns.
set -e
cd /home/z/my-project
TMP=/tmp/smoke.raw

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

agent-browser set viewport 1366 768 >/dev/null
agent-browser open "http://localhost:3000" >/dev/null
sleep 2

echo "=== 1. default test renders ==="
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join('|')" > $TMP 2>/dev/null
WORDS=$(decode | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).replace('|',' '))")
echo "first words: $(echo "$WORDS" | cut -c1-80)..."
echo "$WORDS" | python3 -c "
import sys
ws = sys.stdin.read().split()
bad = [w for w in ws if not (w and all(c.islower() for c in w))]
assert len(ws) >= 10, f'only {len(ws)} words rendered'
print(f'rendered {len(ws)} words, charset check: {\"FAIL \" + str(bad) if bad else \"PASS (all lowercase a-z)\"}')
"

echo "=== 2. switch to adaptive mode and verify ==="
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toLowerCase().includes('adaptive')); if (b) { b.click(); return 'clicked'; } return 'button-not-found'; })()" > $TMP 2>/dev/null
echo "mode button: $(decode)"
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join('|')" > $TMP 2>/dev/null
decode | python3 -c "
import sys, json
raw = json.loads(sys.stdin.read())
ws = raw.replace('|', ' ').split()
bad = [w for w in ws if w and not all(c.islower() or c in ',.\"\'!?;' for c in w)]
print(f'adaptive rendered {len(ws)} words, sample: {\" \".join(ws[:8])}')
print('charset:', 'FAIL ' + str(bad) if bad else 'PASS')
"

echo "=== 3. type two words, app stays alive ==="
for ch in $(echo "hello" | fold -w1); do agent-browser press "$ch" >/dev/null; done
agent-browser press Space >/dev/null
for ch in $(echo "quick" | fold -w1); do agent-browser press "$ch" >/dev/null; done
agent-browser press Space >/dev/null
agent-browser eval "(() => { const el = document.querySelector('[data-wi]'); return el ? 'stream-alive' : 'stream-gone'; })()" > $TMP 2>/dev/null
echo "after typing: $(decode)"

echo "=== 4. quote mode renders ==="
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toLowerCase().includes('quote')); if (b) { b.click(); return 'clicked'; } return 'button-not-found'; })()" > $TMP 2>/dev/null
echo "quote button: $(decode)"
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).slice(0,10).join(' ')" > $TMP 2>/dev/null
echo "quote sample: $(decode)"

agent-browser screenshot /home/z/my-project/scripts/dict-smoke.png >/dev/null
echo "SMOKE DONE"
