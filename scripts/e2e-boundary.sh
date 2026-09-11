#!/bin/bash
# E2E (Task 11): space keystrokes must split the bigram chain at word
# boundaries. Types a known 10-word test in the real app, then checks
# localStorage learning data:
#   - the boundary bigram (last char of word N + first char of word N+1)
#     must NOT exist unless it also occurs inside a typed word
#   - space must not be a tracked key
#   - totalKeystrokes = chars + 9 spaces
#   - results screen shows 100% accuracy for a perfectly typed test
set -e
cd /home/z/my-project
TMP=/tmp/boundary.raw

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

echo "=== reset profile, switch to words 10 ==="
agent-browser eval "(() => { localStorage.clear(); location.reload(); return 'reset'; })()" > $TMP 2>/dev/null
echo "reset: $(decode)"
sleep 2.5
agent-browser eval "(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'words');
  if (b) { b.click(); return 'words'; }
  return 'no-btn';
})()" > $TMP 2>/dev/null
echo "mode: $(decode)"
sleep 0.5
agent-browser eval "(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '10');
  if (b) { b.click(); return '10'; }
  return 'no-btn';
})()" > $TMP 2>/dev/null
echo "count: $(decode)"
sleep 1

agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).slice(0,10).map(e=>e.textContent).join('|')" > $TMP 2>/dev/null
WORDS=$(decode | python3 -c "import sys,json; print(json.loads(sys.stdin.read()))")
echo "words: $WORDS"
python3 -c "
import json
words = '$WORDS'.split('|')
assert len(words) == 10, f'expected 10 words, got {len(words)}'
keys = []
for i, w in enumerate(words):
    for ch in w:
        keys.append(ch)
    if i < 9:
        keys.append(' ')
json.dump({'keys': keys, 'words': words}, open('/tmp/boundary_keys.json', 'w'))
print('keys:', len(keys), '(chars', sum(len(w) for w in words), '+ 9 spaces)')
"
agent-browser eval "window.__bkeys = $(python3 -c "import json; print(json.dumps(json.load(open('/tmp/boundary_keys.json'))['keys']))"); 'loaded'" > $TMP 2>/dev/null
echo "preload: $(decode)"

echo "=== type the full test ==="
agent-browser eval "(async () => {
  const inp = document.querySelector('input[aria-label=\"typing input\"]');
  if (!inp) return 'no-input';
  inp.focus();
  for (const ch of window.__bkeys || []) {
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
  }
  return 'typed ' + (window.__bkeys || []).length;
})()" > $TMP 2>/dev/null
echo "typing: $(decode)"
sleep 2

echo "=== verify learning model ==="
agent-browser eval "(() => {
  const l = localStorage.getItem('cadence.learning.v1');
  if (!l) return 'no-learning';
  const p = JSON.parse(l);
  return JSON.stringify({
    keystrokes: p.totalKeystrokes,
    keys: Object.keys(p.keyProfiles),
    bigrams: Object.keys(p.bigramProfiles),
    tests: p.totalTests,
  });
})()" > $TMP 2>/dev/null
decode > /tmp/boundary_learning.json
cat /tmp/boundary_learning.json

python3 << 'EOF'
import json
data = json.loads(open('/tmp/boundary_learning.json').read().strip())
# double-encoded guard
if isinstance(data, str): data = json.loads(data)
words = json.load(open('/tmp/boundary_keys.json'))['words']
bigrams = set(data['bigrams'])
keys = set(data['keys'])
chars = sum(len(w) for w in words)

failures = []
# 1. boundary bigrams must be absent unless they occur inside a typed word
intra = set()
for w in words:
    for i in range(len(w) - 1):
        intra.add(w[i:i+2])
boundary_ok = True
for i in range(len(words) - 1):
    pair = words[i][-1] + words[i+1][0]
    if pair in bigrams and pair not in intra:
        boundary_ok = False
        print(f'  FAKE bigram present: {pair!r} (boundary {words[i]!r}|{words[i+1]!r})')
if boundary_ok:
    print('PASS: no fake cross-word bigrams in FSRS learning data')
else:
    failures.append('boundary bigrams')

# 2. space not tracked
if ' ' in keys:
    failures.append('space tracked')
    print('FAIL: space is a tracked key')
else:
    print('PASS: space is not a tracked key')

# 3. keystroke count = chars + 9 spaces
expected = chars + 9
if data['keystrokes'] != expected:
    failures.append('keystroke count')
    print(f'FAIL: totalKeystrokes={data["keystrokes"]}, expected {expected}')
else:
    print(f'PASS: totalKeystrokes={expected} (chars {chars} + 9 spaces)')

# 4. test recorded
if data['tests'] != 1:
    failures.append('test count')
    print(f'FAIL: totalTests={data["tests"]}, expected 1')
else:
    print('PASS: exactly 1 test recorded')

assert not failures, f'FAILURES: {failures}'
EOF

echo "=== results screen accuracy ==="
agent-browser eval "(() => {
  const txt = document.body.innerText;
  const m = txt.match(/(\d+)%/);
  return JSON.stringify({ hasResults: txt.includes('consistency'), acc: m ? m[1] : '?' });
})()" > $TMP 2>/dev/null
echo "results: $(decode)"
decode | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
if isinstance(d, str): d = json.loads(d)
assert d['hasResults'] and d['acc'] == '100', f'results wrong: {d}'
print('PASS: results screen shows 100% accuracy for the perfect run')
"

echo "=== cleanup: leave a clean profile ==="
agent-browser eval "(() => { localStorage.clear(); return 'clean'; })()" > $TMP 2>/dev/null
echo "cleanup: $(decode)"
echo "E2E BOUNDARY COMPLETE"
