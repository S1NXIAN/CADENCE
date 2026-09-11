#!/bin/bash
# E2E: complete a 25-word adaptive test with 3 deliberate mid-word errors,
# then dump the learning model to verify error-context tracking:
#   - bigramProfiles[prev->expected].errRate > 0 for error transitions
#   - errorContexts trigrams (2 keys before mistake + fumbled key)
set -e

AB="agent-browser"

type_char() { $AB press "$1" >/dev/null; sleep 0.03; }

type_word_correct() {
  local w="$1"
  for (( i=0; i<${#w}; i++ )); do type_char "${w:$i:1}"; done
}

# type word but mistype the char at position $2 (0-indexed) with wrong char 'k'
type_word_err_at() {
  local w="$1" pos="$2"
  for (( i=0; i<${#w}; i++ )); do
    if [ "$i" -eq "$pos" ]; then type_char "k"; else type_char "${w:$i:1}"; fi
  done
}

$AB press Tab >/dev/null; sleep 0.6
WORDS=$($AB eval "Array.from(document.querySelectorAll('[data-wi]')).map(e=>e.textContent).join(' ')")
WORDS="${WORDS//\"/}"
echo "stream words: $WORDS" | head -c 300; echo ""

# error plan: mistype position 1 of the 3rd word, pos 2 of the 8th, pos 1 of the 13th
read -ra ARR <<< "$WORDS"
N=0
for idx in "${!ARR[@]}"; do
  w="${ARR[$idx]}"
  errpos=-1
  if [ "$idx" -eq 2 ]; then errpos=1; fi
  if [ "$idx" -eq 7 ]; then errpos=2; fi
  if [ "$idx" -eq 12 ]; then errpos=1; fi
  if [ "$errpos" -ge 0 ]; then
    echo "deliberate error: word[$idx]='$w' at pos $errpos (correct char: '${w:$errpos:1}')"
    type_word_err_at "$w" "$errpos"
  else
    type_word_correct "$w"
  fi
  type_char " "
  N=$((idx+1))
  if [ "$N" -ge 25 ]; then break; fi
done

sleep 1.2
echo "--- test finished, dumping learning model ---"
$AB eval "(() => { const L = JSON.parse(localStorage.getItem('cadence.learning.v1') || '{}');
  const errBgs = Object.entries(L.bigramProfiles || {}).filter(([k,v]) => v.errRate > 0.001)
    .sort((a,b) => b[1].errRate - a[1].errRate).slice(0,8)
    .map(([k,v]) => k + ':' + (v.errRate*100).toFixed(1) + '%/' + Math.round(v.attempts) + 'att');
  return JSON.stringify({
    bigramsWithErr: errBgs,
    errorContexts: (L.errorContexts || []).slice(0,8).map(c => c.trigram + ' x' + c.count),
    totalTests: L.totalTests,
  }, null, 1); })()"
