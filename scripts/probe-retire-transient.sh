#!/bin/bash
# Probe: detect TRANSIENT transform interpolation during window retires.
# The settled-state e2e (e2e-scroll-fix.sh) sleeps 350ms before sampling, so it
# can never see a 150ms animation. This probe installs a requestAnimationFrame
# sampler that records translateY + caret/active-word tops every frame while
# the test is typed, then reports:
#   - every translateY change event and HOW MANY interpolated frames it had
#     (retire compensations must be single-frame; only the first real scroll
#      0 -> -lineH is allowed to animate)
#   - max vertical deviation between caret top and active-word top
set -e
URL="http://localhost:3000"
OUT="/home/z/my-project/scripts/retire-probe-log.txt"
TMP="/home/z/my-project/scripts/.probe.raw"
: > "$OUT"

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

# read the word list
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
[ -n "$WORDS" ] || { echo "could not read words"; exit 1; }
IFS='|' read -ra ARR <<< "$WORDS"
N=${#ARR[@]}
echo "TOTAL=$N (typing first 24)" | tee -a "$OUT"

# install the rAF sampler
agent-browser eval "(() => {
  const inner = document.querySelector('[aria-label=\"typing test words\"]').firstElementChild;
  window.__probe = [];
  const loop = () => {
    const tr = getComputedStyle(inner).transform;
    const ty = tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m42 : 0;
    const caret = inner.querySelector('.bg-hue');
    let cw = null, wt = null, ct = null;
    if (caret) { ct = +caret.getBoundingClientRect().top.toFixed(1); }
    const act = inner.querySelector('span[class*=\"border-hue\"]');
    if (act) { wt = +act.getBoundingClientRect().top.toFixed(1); }
    if (ct !== null && wt !== null) cw = +(ct - wt).toFixed(1);
    window.__probe.push([Math.round(performance.now()), +ty.toFixed(1), ct, wt, cw]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return 'sampler-on';
})()" > "$TMP"; decode

COUNT=24
for (( i=0; i<COUNT && i<N; i++ )); do
  word="${ARR[$i]}"
  for (( j=0; j<${#word}; j++ )); do
    agent-browser press "${word:$j:1}" >/dev/null
    sleep 0.045
  done
  agent-browser press "Space" >/dev/null
  sleep 0.12
done

# stop sampler + pull data
agent-browser eval "(() => { const d = JSON.stringify(window.__probe); window.__probe = []; return d; })()" > "$TMP"
decode > /home/z/my-project/scripts/probe-samples.json

python3 - <<'EOF'
import json

samples = json.load(open('/home/z/my-project/scripts/probe-samples.json'))
print(f"frames captured: {len(samples)}")

# --- translateY change events ---
changes = []  # (frame_idx, from, to, interpolated_frames)
prev_ty = None
start_i = 0
for i, s in enumerate(samples):
    ty = s[1]
    if prev_ty is None:
        prev_ty = ty; start_i = 0; continue
    if abs(ty - prev_ty) > 0.5:
        changes.append((start_i, prev_ty, ty))
        start_i = i
        prev_ty = ty

# for each segment start, count how many DISTINCT intermediate values before settling
print("\n-- translateY change events --")
animated = 0
events = 0
for k, (i0, a, b) in enumerate(changes):
    end = changes[k+1][0] if k+1 < len(changes) else len(samples)
    seg = samples[i0:end]
    # collect distinct ty values in this segment
    distinct = []
    for s in seg:
        if not distinct or abs(s[1] - distinct[-1]) > 0.5:
            distinct.append(s[1])
    n_interp = len(distinct) - 1
    events += 1
    kind = "SCROLL" if (abs(a) < 1 and b < -1) or (abs(a) < 1) else "RETIRE?"
    if n_interp > 1:
        animated += 1
        flag = "ANIMATED"
    else:
        flag = "instant"
    print(f"  ty {a} -> {b}  frames={len(seg)} distinct={len(distinct)} {flag}")

# caret vs active word deviation (exclude idle start and the first 0.5s)
devs = [s[4] for s in samples if s[4] is not None]
max_dev = max(abs(d) for d in devs) if devs else 0
big = [(s[0], s[4]) for s in samples if s[4] is not None and abs(s[4]) > 12]
print(f"\nmax |caret.top - word.top| = {max_dev}px")
print(f"frames with deviation > 12px: {len(big)}")
for t, d in big[:12]:
    print(f"  t={t} dev={d}")

print(f"\nSUMMARY: ty_events={events} animated_events={animated} max_caret_dev={max_dev}")
EOF

echo "" | tee -a "$OUT"
echo "done (raw samples: scripts/probe-samples.json)" | tee -a "$OUT"
