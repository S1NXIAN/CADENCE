#!/bin/bash
# Probe: dump raw refTop/ty/stream-top around the line crossing to classify
# the word-12 rewrap=1 flag as real re-wrap vs transition-timing artifact.
set -e
WORDS=$(cat /tmp/words.txt)
IFS='|' read -ra ARR <<< "$WORDS"

probe() {
  agent-browser eval "(() => {
    const outer = document.querySelector('[aria-label=\"typing test words\"]');
    if (!outer) return 'gone';
    const inner = outer.firstElementChild;
    const tr = getComputedStyle(inner).transform;
    const ty = tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m42 : 0;
    const els = Array.from(inner.querySelectorAll('[data-wi]'));
    const from = +els[0].getAttribute('data-wi');
    const ref = inner.querySelector('[data-wi=\"' + (from + 8) + '\"]');
    const rt = ref ? ref.getBoundingClientRect().top : -1;
    const r0 = els[0].getBoundingClientRect().top;
    return 'from=' + from + ' ty=' + ty.toFixed(1) + ' ref=' + (from+8) + ' refTop=' + rt.toFixed(1) + ' streamTop=' + (rt - ty).toFixed(1) + ' line0Top=' + r0.toFixed(1);
  })()"
}

for (( i=0; i<${1:-14}; i++ )); do
  word="${ARR[$i]}"
  for (( j=0; j<${#word}; j++ )); do
    agent-browser press "${word:$j:1}" >/dev/null
    sleep 0.05
  done
  agent-browser press "Space" >/dev/null
  sleep 0.1
  echo "w$((i+2)) T+100ms: $(probe)"
  sleep 0.25
  echo "w$((i+2)) T+350ms: $(probe)"
done
