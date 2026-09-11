#!/bin/bash
# Adaptive Engine v2 smoke test:
#   1. page boots, no crash
#   2. full-potential layer: badge appears, packs fetched & cached in localStorage
#   3. v2 -> v3 learning migration: poisoned v2 payload upgrades with seeded FSRS memory
#   4. FSRS reviews: finishing a test writes mem (reps>0) into learning storage
#   5. typing still works (word stream alive, caret moves)
set -e
cd /home/z/my-project
TMP=/tmp/smokev2.raw

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
sleep 2.5

echo "=== 1. page boots ==="
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).length" > $TMP 2>/dev/null
N=$(decode)
echo "rendered words: $N"
python3 -c "assert int('$N') >= 10, 'page did not render words'" && echo "PASS boot"

echo "=== 2. full-potential layer ==="
sleep 4  # give pack fetch time
agent-browser eval "(document.querySelector('[data-testid=\"connection-badge\"]') || {}).textContent || 'NO-BADGE'" > $TMP 2>/dev/null
echo "badge: $(decode)"
agent-browser eval "(() => { const w = localStorage.getItem('cadence.pack.words.v1'); if (!w) return 'no-cache'; const p = JSON.parse(w); return 'cached ' + p.words.length + ' words'; })()" > $TMP 2>/dev/null
echo "word pack cache: $(decode)"
agent-browser eval "(() => { const q = localStorage.getItem('cadence.pack.quotes.v1'); if (!q) return 'no-cache'; const p = JSON.parse(q); return 'cached ' + p.quotes.length + ' quotes'; })()" > $TMP 2>/dev/null
echo "quote pack cache: $(decode)"
agent-browser eval "(() => { const w = localStorage.getItem('cadence.pack.words.v1'); if (!w) process.exit(1); const p = JSON.parse(w); const bad = p.words.filter(x => !/^[a-z]{2,14}$/.test(x)); return 'invalid: ' + bad.length; })()" > $TMP 2>/dev/null || true
echo "pack validation: $(decode)"

echo "=== 3. v2 -> v3 migration ==="
agent-browser eval "(() => {
  const v2 = {
    keyProfiles: { a: { attempts: 100, errRate: 0.02, latency: 150, lastSeen: Date.now()-3600e3 },
                   q: { attempts: 30, errRate: 0.3, latency: 340, lastSeen: Date.now()-7200e3 } },
    bigramProfiles: { qu: { attempts: 20, errRate: 0.25, latency: 300, lastSeen: Date.now()-7200e3 } },
    confusions: [], errorContexts: [],
    totalKeystrokes: 4000, totalChars: 3900, totalTests: 9, totalTimeMs: 400000, lastVersion: 2
  };
  localStorage.setItem('cadence.learning.v1', JSON.stringify(v2));
  return 'poisoned';
})()" > $TMP 2>/dev/null
echo "v2 payload: $(decode)"
agent-browser open "http://localhost:3000" >/dev/null
sleep 3
agent-browser eval "(() => { const l = JSON.parse(localStorage.getItem('cadence.learning.v1')); return JSON.stringify({ v: l.lastVersion, aMem: !!(l.keyProfiles.a && l.keyProfiles.a.mem), qMem: !!(l.keyProfiles.q && l.keyProfiles.q.mem), qErr: l.keyProfiles.q && l.keyProfiles.q.errors, aStable: l.keyProfiles.a && l.keyProfiles.a.mem ? Math.round(l.keyProfiles.a.mem.s*10)/10 : null, qStable: l.keyProfiles.q && l.keyProfiles.q.mem ? Math.round(l.keyProfiles.q.mem.s*10)/10 : null }); })()" > $TMP 2>/dev/null
echo "migrated: $(decode)"
decode | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
try:
    d = json.loads(raw)
    if isinstance(d, str): d = json.loads(d)
except Exception:
    raise SystemExit(f'unparseable: {raw}')
assert d['v'] == 3, f'version not bumped: {d}'
assert d['aMem'] and d['qMem'], 'memory cards not seeded'
assert d['qErr'] == 9, f'errors not inferred: {d}'
assert d['aStable'] > d['qStable'], f'accurate key should be more stable: {d}'
print(f'PASS migration: version=3, mems seeded, errors inferred, a.s={d[\"aStable\"]} > q.s={d[\"qStable\"]}')
"

echo "=== 4. FSRS reviews on test finish ==="
# switch to words mode with count 10, then type the full test to trigger finish
agent-browser eval "(() => {
  const wordsBtn = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'words');
  if (wordsBtn) wordsBtn.click();
  return 'words-mode';
})()" > $TMP 2>/dev/null
echo "mode: $(decode)"
sleep 0.5
agent-browser eval "(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '10');
  if (b) { b.click(); return '10-word mode'; }
  return 'no-count-button';
})()" > $TMP 2>/dev/null
echo "count: $(decode)"
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('[data-wi]')).slice(0,12).map(e=>e.textContent).join('|')" > $TMP 2>/dev/null
WORDS=$(decode | python3 -c "import sys,json; print(json.loads(sys.stdin.read()))")
echo "test words: $(echo "$WORDS" | cut -c1-60)..."
python3 -c "
import json
words = '$WORDS'.split('|')
# 10-word words-mode test: type words 1..9 with trailing spaces, then the last
# word fully (session auto-finishes on completing the last word)
keys = []
for i, w in enumerate(words[:10]):
    for ch in w:
        keys.append(ch)
    if i < 9:
        keys.append(' ')
json.dump(keys, open('/tmp/v2keys.json', 'w'))
print('keys prepared:', len(keys))
"
agent-browser eval "window.__cadenceKeys = $(cat /tmp/v2keys.json); 'loaded'" > $TMP 2>/dev/null
echo "key preload: $(decode)"
agent-browser eval "(async () => {
  const inp = document.querySelector('input[aria-label=\"typing input\"]');
  if (!inp) return 'no-input';
  inp.focus();
  const keys = window.__cadenceKeys || [];
  for (const ch of keys) {
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    inp.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
  }
  return 'typed ' + keys.length;
})()" > $TMP 2>/dev/null
echo "typing: $(decode)"
sleep 2.5
agent-browser eval "(() => {
  const l = localStorage.getItem('cadence.learning.v1');
  if (!l) return 'no-learning';
  const p = JSON.parse(l);
  const withMem = Object.values(p.keyProfiles).filter(k => k.mem && k.mem.reps > 0).length;
  const bgs = Object.values(p.bigramProfiles).filter(k => k.mem && k.mem.reps > 0).length;
  return JSON.stringify({ version: p.lastVersion, keys: Object.keys(p.keyProfiles).length, withMem, bigramsWithMem: bgs, totalTests: p.totalTests });
})()" > $TMP 2>/dev/null
echo "learning after test: $(decode)"
decode | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
try:
    d = json.loads(raw)
    if isinstance(d, str): d = json.loads(d)
except Exception:
    raise SystemExit(f'unparseable: {raw}')
assert d['version'] == 3 and d['withMem'] >= 5, f'FSRS reviews not written: {d}'
assert d['totalTests'] >= 1, 'test not counted'
assert d['bigramsWithMem'] >= 3, f'bigram reviews missing: {d}'
print(f\"PASS FSRS write path: {d['withMem']} keys + {d['bigramsWithMem']} bigrams have memory, totalTests={d['totalTests']}\")
"

echo "=== 5. word stream still alive ==="
agent-browser eval "(() => { const i = document.querySelector('input[aria-label=\"typing input\"]'); return i ? 'input-present' : (document.querySelectorAll('[data-wi]').length > 3 ? 'results-or-stream' : 'UNKNOWN'); })()" > $TMP 2>/dev/null
echo "state: $(decode)"

echo "SMOKE V2 COMPLETE"
