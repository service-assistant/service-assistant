#!/usr/bin/env bash
# Runs make format in app/ or api/ based on the edited file path.

input=$(cat)

file_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

case "$file_path" in
  */app/*)
    cd "$(dirname "$0")/../../app" && make format ;;
  */api/*)
    cd "$(dirname "$0")/../../api" && make format ;;
esac
