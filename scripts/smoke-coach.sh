#!/bin/bash
# Smoke test for coach notes v2: finish a words test with injected mistakes,
# verify the coach notes render with headline + metric chip structure.
set -e
cd /home/z/my-project
TMP=/tmp/smoke-coach.raw

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

echo "=== 1. switch to words 10 mode ==="
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().toLowerCase() === 'words'); if (b) { b.click(); return 'clicked'; } return 'button-not-found'; })()" > $TMP 2>/dev/null
echo "mode button: $(decode)"
sleep 1
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '10'); if (b) { b.click(); return 'clicked'; } return 'button-not-found'; })()" > $TMP 2>/dev/null
echo "count 10: $(decode)"
sleep 1

echo "=== 2. read the 10 target words ==="
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join('|')" > $TMP 2>/dev/null
WORDS=$(decode | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).replace('|',' '))")
echo "targets: $WORDS"

echo "=== 3. type them with 3 deliberate mistakes ==="
python3 - "$WORDS" <<'EOF' > /tmp/keys.txt
import sys
words = sys.argv[1].split()
keys = []
n = 0
for w in words:
    for ch in w:
        if n in (3, 14, 27):
            keys.append("k")  # deliberate wrong char
        else:
            keys.append(ch)
        n += 1
    keys.append("Space")
print("\n".join(keys))
EOF
HEADLESS_AGENT=1
while IFS= read -r key; do
  agent-browser press "$key" >/dev/null
done < /tmp/keys.txt
sleep 1.5

echo "=== 4. results screen + coach notes ==="
agent-browser eval "(() => { const items = Array.from(document.querySelectorAll('ul li')); return JSON.stringify(items.map(li => li.textContent)); })()" > $TMP 2>/dev/null
# decode returns a JSON string whose content is a JSON array
decode | python3 -c "
import sys, json
raw = sys.stdin.read()
try:
    arr = json.loads(raw)
    if isinstance(arr, str): arr = json.loads(arr)
except Exception:
    arr = []
notes = [x for x in arr if x and len(x) > 30]
assert len(notes) >= 2, f'expected >=2 coach notes, got {len(notes)}: {arr}'
print(f'coach notes rendered: {len(notes)}')
for n in notes:
    print(' -', n[:150])
"

echo "=== 5. screenshot ==="
agent-browser screenshot /home/z/my-project/scripts/coach-smoke.png >/dev/null
echo "SMOKE DONE"
