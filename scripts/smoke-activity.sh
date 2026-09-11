#!/bin/bash
# Smoke test for the activity heatmap: seed a synthetic 9-month profile
# (ledger + history-only backfill days), open the stats panel, verify the
# grid renders with colored cells, month labels, summary line and legend.
set -e
cd /home/z/my-project
TMP=/tmp/smoke-activity.raw

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

echo "=== 1. seed synthetic 280-day profile ==="
agent-browser eval "(() => {
  const DAY = 86400000;
  const now = Date.now();
  const ledger = {};
  const history = [];
  for (let i = 0; i < 280; i++) {
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (r <= 0.22) continue; // ~22% rest days
    const d = new Date(now - i * DAY);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const tests = 1 + (Math.floor(r * 1000) % 12);
    ledger[key] = { tests, timeS: tests * (15 + (Math.floor(r * 777) % 30)), bestWpm: 60 + (Math.floor(r * 999) % 45) };
  }
  // 40 recent history rows for the table
  for (let i = 0; i < 40; i++) {
    const d = new Date(now - (i % 14) * DAY);
    history.push({ id: 'h' + i, timestamp: d.getTime(), mode: 'time', modeLabel: 'time 30', wpm: 55 + (i % 30), rawWpm: 60 + (i % 30), accuracy: 90 + (i % 10), consistency: 70 + (i % 25), duration: 30, chars: { correct: 120, incorrect: 4, extra: 1, missed: 0 }, samples: [], focusKeys: [], isPersonalBest: i === 3 });
  }
  // history-only days (no ledger) — exercise the merge backfill
  for (const off of [300, 301, 302, 310]) {
    history.push({ id: 'old' + off, timestamp: now - off * DAY, mode: 'words', modeLabel: 'words 25', wpm: 50 + off % 10, rawWpm: 58, accuracy: 95, consistency: 80, duration: 45, chars: { correct: 90, incorrect: 2, extra: 0, missed: 0 }, samples: [], focusKeys: [], isPersonalBest: false });
  }
  const stats = { history, personalBests: { 'time 30': { wpm: 84, accuracy: 98, timestamp: now } }, dailyActivity: ledger, streakDays: 6, lastTestDay: ledger[Object.keys(ledger)[0]] ? Object.keys(ledger)[0] : '', firstTestDay: Object.keys(ledger).sort()[0] };
  localStorage.setItem('cadence.stats.v1', JSON.stringify(stats));
  return 'seeded:' + Object.keys(ledger).length + '-ledger-days/' + history.length + '-history-rows';
})()" > $TMP 2>/dev/null
echo "seed: $(decode)"

echo "=== 2. reload + open stats panel ==="
agent-browser open "http://localhost:3000" >/dev/null
sleep 2
agent-browser eval "(() => { const b = document.querySelector('button[aria-label=\"open stats\"]'); if (!b) return 'button-not-found'; b.click(); return 'opened'; })()" > $TMP 2>/dev/null
echo "panel: $(decode)"
sleep 1

echo "=== 3. heatmap renders ==="
agent-browser eval "(() => {
  const svg = document.querySelector('svg[aria-label=\"typing activity over the last year\"]');
  if (!svg) return 'svg-missing';
  const rects = Array.from(svg.querySelectorAll('rect'));
  const colored = rects.filter(r => (r.getAttribute('fill') || '') !== '#1c1e23');
  const texts = Array.from(svg.querySelectorAll('text')).map(t => t.textContent);
  const titles = Array.from(svg.querySelectorAll('rect title')).map(t => t.textContent || '');
  return JSON.stringify({ cells: rects.length, coloredN: colored.length, monthLabels: texts.filter(t => /^[A-Z][a-z]{2}$/.test(t)).length, dowLabels: texts.filter(t => ['mon','wed','fri'].includes(t)).length, tooltipWithTests: titles.filter(t => t.includes(' test')).length });
})()" > $TMP 2>/dev/null
DECODED=$(decode)
echo "grid: $DECODED"
echo "$DECODED" | python3 -c "
import json, sys
v = json.loads(sys.stdin.read())
assert v['cells'] > 320, 'too few cells: %s' % v['cells']
assert v['coloredN'] > 150, 'too few colored cells: %s' % v['coloredN']
assert v['monthLabels'] >= 12, 'month labels: %s' % v['monthLabels']
assert v['dowLabels'] == 3, 'dow labels: %s' % v['dowLabels']
assert v['tooltipWithTests'] > 100, 'tooltips: %s' % v['tooltipWithTests']
print('GRID-OK')
"

echo "=== 4. summary line + legend ==="
agent-browser eval "(() => {
  const svg = document.querySelector('svg[aria-label=\"typing activity over the last year\"]');
  const box = svg && svg.closest('div').parentElement;
  const txt = box ? box.textContent : '';
  return JSON.stringify({
    hasActiveDays: /active days?/.test(txt),
    hasTyped: /typed/.test(txt),
    hasRuns: /longest run/.test(txt) && /current/.test(txt),
    hasLegend: txt.includes('less') && txt.includes('more'),
    hasTests: /tests/.test(txt)
  });
})()" > $TMP 2>/dev/null
DECODED=$(decode)
echo "summary: $DECODED"
echo "$DECODED" | python3 -c "
import json, sys
v = json.loads(sys.stdin.read())
assert all([v['hasActiveDays'], v['hasTyped'], v['hasRuns'], v['hasLegend'], v['hasTests']]), v
print('SUMMARY-OK')
"

echo "=== 5. today cell highlighted ==="
agent-browser eval "(() => {
  const svg = document.querySelector('svg[aria-label=\"typing activity over the last year\"]');
  const marked = Array.from(svg.querySelectorAll('rect')).filter(r => (r.getAttribute('stroke') || '') !== 'none' && r.getAttribute('stroke'));
  return JSON.stringify({ todayMarked: marked.length });
})()" > $TMP 2>/dev/null
echo "today: $(decode)"

echo "=== 6. desktop screenshot ==="
agent-browser screenshot /home/z/my-project/scripts/activity-heat-desktop.png >/dev/null
echo "saved scripts/activity-heat-desktop.png"

echo "=== 7. mobile 390px — horizontal scroll fallback ==="
agent-browser set viewport 390 844 >/dev/null
sleep 1
agent-browser eval "(() => {
  const wrap = document.querySelector('svg[aria-label=\"typing activity over the last year\"]');
  if (!wrap) return 'svg-missing';
  const scroller = wrap.closest('div.overflow-x-auto');
  return JSON.stringify({ scrollable: !!scroller, svgW: wrap.getAttribute('width') });
})()" > $TMP 2>/dev/null
echo "mobile: $(decode)"
agent-browser screenshot /home/z/my-project/scripts/activity-heat-mobile.png >/dev/null
echo "saved scripts/activity-heat-mobile.png"

echo "=== 8. reset profile ==="
agent-browser eval "(() => { localStorage.clear(); return 'cleared'; })()" > $TMP 2>/dev/null
echo "reset: $(decode)"
echo "SMOKE DONE"
