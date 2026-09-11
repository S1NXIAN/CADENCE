#!/bin/bash
# E2E test: type the 10-word test with a deliberate error and a backspace fix
# words: long sun falcon last great now old door live member
set -e

type_chars() {
  local text="$1"
  for (( i=0; i<${#text}; i++ )); do
    c="${text:$i:1}"
    if [ "$c" = " " ]; then
      agent-browser press "Space" >/dev/null
    else
      agent-browser press "$c" >/dev/null
    fi
    sleep 0.06
  done
}

# word 1-2 correct + space; word 3 "falcon" mistyped as "falcXn" then corrected
type_chars "long sun "
type_chars "falc"
agent-browser press "x" >/dev/null   # deliberate wrong char
sleep 0.3
agent-browser press "Backspace" >/dev/null
type_chars "on last "
type_chars "great now "
type_chars "old door live member"
echo "--- done typing ---"
