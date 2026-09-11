#!/bin/bash
# E2E test 2: adaptive 10-word test
# words: professional complexity sugar office nobody what consider both brown street
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
    sleep 0.05
  done
}

type_chars "professional complexity sugar office "
type_chars "nobody what consider both "
type_chars "brown street"
echo "--- done typing adaptive test ---"
