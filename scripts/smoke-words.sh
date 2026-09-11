#!/bin/bash
# Smoke test for the word-memory scheduler end to end:
# type a 10-word adaptive test with one deliberately failed word, then verify
#   - learning.wordProfiles built up in localStorage (attempts/errors/mem)
#   - the failed word got an FSRS review (mem.reps >= 1, due within 10 min)
#   - stats panel "words" tab renders worst/queued/fastest chips
set -e
cd /home/z/my-project
TMP=/tmp/smoke-words.raw

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

echo "=== 1. fresh profile, adaptive 10 words ==="
agent-browser eval "(() => {
  localStorage.clear();
  localStorage.setItem('cadence.settings.v1', JSON.stringify({ mode: 'adaptive', timeDuration: 30, wordCount: 10, punctuation: false, numbers: false, adaptiveIntensity: 65, strictMode: false, liveWpm: true, sound: false, caretStyle: 'line', accent: 'lime', showCoach: true, onlinePacks: false }));
  return 'cleared';
})()" > $TMP 2>/dev/null
echo "seed: $(decode)"
agent-browser open "http://localhost:3000" >/dev/null
sleep 2

echo "=== 2. read target words from the stream ==="
agent-browser eval "(() => {
  const spans = [...document.querySelectorAll('span[data-wi]')];
  const words = spans.map(s => s.textContent.trim());
  return JSON.stringify({ n: words.length, words });
})()" > $TMP 2>/dev/null
decode > /tmp/smoke-words.list
python3 -c "
import json
d = json.loads(open('/tmp/smoke-words.list').read().strip())
if isinstance(d, str): d = json.loads(d)
print('targets:', ' '.join(d['words'][:10]))
open('/tmp/smoke-words.json','w').write(json.dumps(d['words']))
"
WORDS=$(python3 -c "import json; print(' '.join(json.load(open('/tmp/smoke-words.json'))[:10]))")
FAILWORD=$(echo $WORDS | cut -d' ' -f4)
echo "fail target: '$FAILWORD'"

echo "=== 3. type: words 1-3 clean, word 4 failed ('x' + space), words 5-10 clean ==="
i=0
for w in $WORDS; do
  i=$((i+1))
  if [ $i -eq 4 ]; then
    agent-browser press "x" >/dev/null
    agent-browser press "Space" >/dev/null
    continue
  fi
  for ch in $(echo "$w" | fold -w1); do agent-browser press "$ch" >/dev/null; done
  agent-browser press "Space" >/dev/null
done
sleep 2

echo "=== 4. learning.wordProfiles in localStorage ==="
agent-browser eval "(() => {
  const raw = localStorage.getItem('cadence.learning.v1');
  if (!raw) return 'no-learning';
  const l = JSON.parse(raw);
  const wp = l.wordProfiles || {};
  const entries = Object.entries(wp).map(([k, v]) => ({ k, a: v.attempts, e: v.errors, reps: v.mem ? v.mem.reps : 0, dueIn: v.mem ? v.mem.due - Date.now() : null }));
  const failed = entries.filter(x => x.e >= 1);
  const clean = entries.filter(x => x.e === 0);
  return JSON.stringify({ version: l.lastVersion, tracked: entries.length, failed, cleanCount: clean.length, sampleClean: clean[0] || null });
})()" > $TMP 2>/dev/null
echo "profiles: $(decode)"

echo "=== 5. failed word got an FSRS review ==="
agent-browser eval "(() => {
  const l = JSON.parse(localStorage.getItem('cadence.learning.v1'));
  const wp = l.wordProfiles || {};
  const failed = Object.entries(wp).filter(([k, v]) => v.errors >= 1).map(([k, v]) => ({ k, reps: v.mem ? v.mem.reps : 0, dueIn: v.mem ? v.mem.due - Date.now() : null }));
  return JSON.stringify(failed);
})()" > $TMP 2>/dev/null
echo "failed-words: $(decode)"

echo "=== 6. stats panel -> words tab ==="
agent-browser eval "(() => { const b = document.querySelector('button[aria-label=\"open stats\"]'); if (!b) return 'button-not-found'; b.click(); return 'opened'; })()" > $TMP 2>/dev/null
echo "panel: $(decode)"
sleep 1
# Radix Tabs ignores bare .click() — needs the full pointer sequence
agent-browser eval "(() => {
  const tabs = [...document.querySelectorAll('[role=\"tab\"]')];
  const t = tabs.find(x => x.textContent.trim().toLowerCase() === 'words');
  if (!t) return 'words-tab-missing';
  const opts = { bubbles: true, cancelable: true, view: window };
  t.dispatchEvent(new PointerEvent('pointerdown', opts));
  t.dispatchEvent(new MouseEvent('mousedown', opts));
  t.dispatchEvent(new PointerEvent('pointerup', opts));
  t.dispatchEvent(new MouseEvent('mouseup', opts));
  t.dispatchEvent(new MouseEvent('click', opts));
  return 'words-tab-opened';
})()" > $TMP 2>/dev/null
echo "tab: $(decode)"
sleep 1
# after ONE live test, worst/fastest lists are legitimately empty (< 3 attempts);
# the failed word must already sit in the review queue (chronic heat)
agent-browser eval "(() => {
  const body = document.body.textContent;
  return JSON.stringify({ queuedForReview: body.includes('queued for review'), intro: body.includes('words in memory'), emptyState: body.includes('no words tracked yet') });
})()" > $TMP 2>/dev/null
echo "words-tab-live: $(decode)"

agent-browser press "Escape" >/dev/null; sleep 1

echo "=== 6b. seeded 3-test profile lights all sections ==="
agent-browser eval "(() => {
  const MIN = 60000, now = Date.now();
  const learning = { keyProfiles: {}, bigramProfiles: {}, confusions: [], errorContexts: [], totalKeystrokes: 3000, totalChars: 2800, totalTests: 3, totalTimeMs: 240000, lastVersion: 4,
    wordProfiles: {
      weave: { attempts: 8, errors: 5, bestWpm: null, lastSeen: now - 3 * MIN, mem: { s: 0.5, d: 8.2, reps: 3, lapses: 2, state: 1, ls: 0, last: now - 3 * MIN, due: now + 5 * MIN } },
      shelter: { attempts: 6, errors: 0, bestWpm: 96, lastSeen: now - 10 * MIN, mem: { s: 6.2, d: 3.1, reps: 2, lapses: 0, state: 2, ls: 0, last: now - 10 * MIN, due: now + 4310 * MIN } },
      rhythm: { attempts: 4, errors: 1, bestWpm: 62, lastSeen: now - 6 * MIN, mem: { s: 0.9, d: 5.5, reps: 2, lapses: 0, state: 2, ls: 0, last: now - 6 * MIN, due: now + 2 * MIN } },
    }};
  localStorage.setItem('cadence.learning.v1', JSON.stringify(learning));
  return 'seeded-3-test-profile';
})()" > $TMP 2>/dev/null
echo "seed: $(decode)"
agent-browser open "http://localhost:3000" >/dev/null; sleep 2
agent-browser eval "(() => { document.querySelector('button[aria-label=\"open stats\"]').click(); return 'ok'; })()" >/dev/null 2>&1; sleep 1
agent-browser eval "(() => {
  const t = [...document.querySelectorAll('[role=\"tab\"]')].find(x => x.textContent.trim().toLowerCase() === 'words');
  const opts = { bubbles: true, cancelable: true, view: window };
  ['pointerdown','mousedown','pointerup','mouseup','click'].forEach((ty, i) => t.dispatchEvent(i < 3 ? (ty.startsWith('pointer') ? new PointerEvent(ty, opts) : new MouseEvent(ty, opts)) : new MouseEvent(ty, opts)));
  return 'opened';
})()" > $TMP 2>/dev/null
sleep 1
agent-browser eval "(() => {
  const body = document.body.textContent;
  return JSON.stringify({ intro3: body.includes('3 words in memory'), worst: body.includes('worst words'), queued: body.includes('queued for review'), fastest: body.includes('fastest words'), weaveChip: body.includes('weave'), shelterChip: body.includes('shelter'), rhythmChip: body.includes('rhythm') });
})()" > $TMP 2>/dev/null
echo "words-tab-seeded: $(decode)"
agent-browser screenshot /home/z/my-project/scripts/words-tab.png >/dev/null 2>&1
agent-browser eval "(() => { localStorage.clear(); return 'cleaned'; })()" > $TMP 2>/dev/null

echo "=== 7. restart survives (scheduling didn't corrupt the loop) ==="
agent-browser open "http://localhost:3000" >/dev/null
sleep 2
agent-browser press "Escape" >/dev/null
sleep 1
agent-browser eval "(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()" > $TMP 2>/dev/null
sleep 1
agent-browser press "Escape" >/dev/null
sleep 1
agent-browser press "Tab" >/dev/null
sleep 1
agent-browser eval "(() => {
  const spans = document.querySelectorAll('span[data-wi]');
  return JSON.stringify({ stream: spans.length > 3 ? 'rendering' : 'broken', n: spans.length });
})()" > $TMP 2>/dev/null
echo "restart: $(decode)"

echo "=== 8. cleanup ==="
agent-browser eval "(() => { localStorage.clear(); return 'cleaned'; })()" > $TMP 2>/dev/null
echo "cleanup: $(decode)"
