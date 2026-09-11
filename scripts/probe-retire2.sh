#!/bin/bash
# Probe (time mode): exercise the whole-line window RETIRE path.
# Time mode has a 580-word stream, so typing 32 words at 1366x768 pushes the
# active word past rendered line 3 and triggers window retires.
# Success criteria:
#   - ty changes only by the single intended scroll (0 -> -lineH), instantly or
#     with the one designed 150ms glide; retires must NOT move ty at all
#   - word_top of the active word must be CONSTANT except during the one
#     designed scroll (no up/down jump = no retire bounce)
#   - caret deviation beyond the designed glides stays < 12px
set -e
URL="http://localhost:3000"
TMP="/home/z/my-project/scripts/.probe2.raw"

agent-browser set viewport 1366 768 >/dev/null
agent-browser open "$URL" >/dev/null
sleep 2.5

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

# switch to time mode via the nav button
agent-browser eval "(() => {
  const btns = Array.from(document.querySelectorAll('nav button'));
  const t = btns.find(b => b.textContent.trim().includes('time'));
  if (!t) return 'no-time-btn';
  t.click(); return 'clicked';
})()" > "$TMP"; decode
sleep 1.2

# install rAF sampler
agent-browser eval "(() => {
  const outer = document.querySelector('[aria-label=\"typing test words\"]');
  const inner = outer.firstElementChild;
  window.__probe = [];
  const loop = () => {
    const tr = getComputedStyle(inner).transform;
    const ty = tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m42 : 0;
    const caret = inner.querySelector('.bg-hue');
    let ct = null, wt = null, dev = null;
    if (caret) { ct = +caret.getBoundingClientRect().top.toFixed(1); }
    const act = inner.querySelector('span[class*=\"border-hue\"]');
    if (act) { wt = +act.getBoundingClientRect().top.toFixed(1); }
    if (ct !== null && wt !== null) dev = +(ct - wt).toFixed(1);
    const els = Array.from(inner.querySelectorAll('[data-wi]'));
    const from = els.length ? +els[0].getAttribute('data-wi') : -1;
    window.__probe.push([Math.round(performance.now()), +ty.toFixed(1), ct, wt, dev, from]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return 'sampler-on';
})()" > "$TMP"; decode

# type 32 words from the rendered stream (re-read periodically since window retires)
for (( i=0; i<32; i++ )); do
  WORD=$(agent-browser eval "(() => {
    const inner = document.querySelector('[aria-label=\"typing test words\"]').firstElementChild;
    const act = inner.querySelector('span[class*=\"border-hue\"]');
    return act ? act.textContent : '';
  })()" > "$TMP" && decode | python3 -c "import json,sys; print(json.loads(sys.stdin.read()) if True else '')" 2>/dev/null || echo "")
  WORD=$(echo "$WORD" | tr -d '"')
  if [ -z "$WORD" ]; then sleep 0.2; continue; fi
  for (( j=0; j<${#WORD}; j++ )); do
    agent-browser press "${WORD:$j:1}" >/dev/null
    sleep 0.04
  done
  agent-browser press "Space" >/dev/null
  sleep 0.1
done

agent-browser eval "(() => { const d = JSON.stringify(window.__probe); window.__probe = []; return d; })()" > "$TMP"
decode > /home/z/my-project/scripts/probe2-samples.json

python3 - <<'EOF'
import json
samples = json.load(open('/home/z/my-project/scripts/probe2-samples.json'))
print(f"frames captured: {len(samples)}")

# ty change events with interpolation counts
ty_events = []
prev = None
for i, s in enumerate(samples):
    ty = s[1]
    if prev is None or abs(ty - prev) > 0.5:
        ty_events.append([i, prev, ty, 1])
        prev = ty
    else:
        ty_events[-1][3] += 1  # extend duration of current value
# merge: a change followed quickly by continued drift = one animated event
print("\n-- ty transitions (value changes only) --")
seq = []
last_ty = None
for s in samples:
    if last_ty is None or abs(s[1] - last_ty) > 0.5:
        seq.append((s[0], last_ty, s[1]))
        last_ty = s[1]
# group frames within 200ms into one event
events = []
for t, a, b in seq:
    if events and t - events[-1][0] < 250:
        events[-1][2] = b
        events[-1][0] = t
        events[-1][3] += 1
    else:
        events.append([t, a, b, 1])
for t, a, b, n in events:
    print(f"  t={t} ty {a} -> {b}  ({n} sampled steps)")

# word_top stability: count distinct word_top values excluding the designed glide
wt_changes = []
prev = None
for s in samples:
    if s[3] is None: continue
    if prev is None or abs(s[3] - prev) > 1.5:
        wt_changes.append((s[0], prev, s[3]))
        prev = s[3]
print("\n-- active word screen-top changes --")
for t, a, b in wt_changes:
    print(f"  t={t} {a} -> {b}")

# from (window start) changes
from_changes = []
prev = None
for s in samples:
    if prev is None or s[5] != prev:
        from_changes.append((s[0], prev, s[5]))
        prev = s[5]
print("\n-- window start (from) changes = retires --")
for t, a, b in from_changes:
    print(f"  t={t} {a} -> {b}")

devs = [abs(s[4]) for s in samples if s[4] is not None]
print(f"\nmax |caret-word dev| = {max(devs)}px")
big = [(s[0], s[4]) for s in samples if s[4] is not None and abs(s[4]) > 12]
print(f"frames dev>12px: {len(big)}")
for t, d in big[:10]: print(f"  t={t} dev={d}")
EOF
