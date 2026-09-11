#!/bin/bash
# Mini-probe: does Tab-restart SNAP or GLIDE when the stream is scrolled?
# Type 20 words (scroll engages at ty=-80), press Tab, sample ty every rAF.
set -e
URL="http://localhost:3000"
TMP="/home/z/my-project/scripts/.probe3.raw"
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
agent-browser open "$URL" >/dev/null
sleep 2.5

agent-browser eval "(() => {
  const inner = document.querySelector('[aria-label=\"typing test words\"]').firstElementChild;
  window.__probe = [];
  const loop = () => {
    const tr = getComputedStyle(inner).transform;
    const ty = tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m42 : 0;
    window.__probe.push([Math.round(performance.now()), +ty.toFixed(1)]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return 'on';
})()" > "$TMP"; decode

# type 20 words by reading the active word
for (( i=0; i<20; i++ )); do
  WORD=$(agent-browser eval "(() => {
    const inner = document.querySelector('[aria-label=\"typing test words\"]').firstElementChild;
    const act = inner.querySelector('span[class*=\"border-hue\"]');
    return act ? act.textContent : '';
  })()" > "$TMP" && decode | tr -d '"' || echo "")
  [ -z "$WORD" ] && { sleep 0.2; continue; }
  for (( j=0; j<${#WORD}; j++ )); do
    agent-browser press "${WORD:$j:1}" >/dev/null
    sleep 0.035
  done
  agent-browser press "Space" >/dev/null
  sleep 0.08
done
sleep 0.4

# mark + Tab restart
agent-browser eval "window.__mark = Math.round(performance.now()); 'marked'" > "$TMP"; decode
agent-browser press "Tab" >/dev/null
sleep 0.8

agent-browser eval "(() => { const d = JSON.stringify({mark: window.__mark, frames: window.__probe}); window.__probe=[]; return d; })()" > "$TMP"
decode > /home/z/my-project/scripts/probe3-samples.json

python3 - <<'EOF'
import json
d = json.load(open('/home/z/my-project/scripts/probe3-samples.json'))
mark, frames = d["mark"], d["frames"]
pre = [f for f in frames if f[0] < mark - 100]
post = [f for f in frames if f[0] >= mark]
ty_pre = pre[-1][1] if pre else None
print(f"ty before Tab: {ty_pre}")
seq = []
last = None
for t, ty in post[:120]:
    if last is None or abs(ty - last) > 0.5:
        seq.append((t - mark, ty)); last = ty
print("ty frames after Tab (ms_delta, ty):")
for dt, ty in seq[:20]:
    print(f"  +{dt}ms ty={ty}")
interp = sum(1 for dt, ty in seq if ty_pre is not None and abs(ty) > 0.5 and abs(ty - ty_pre) > 0.5 and dt > 5)
print(f"interpolated frames after Tab: {max(0, len(seq)-2)}")
EOF
