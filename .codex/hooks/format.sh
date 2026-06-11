#!/usr/bin/env bash
# Runs make format in client/ or server/ based on the edited file path.

input=$(cat)

file_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

case "$file_path" in
  */client/*)
    cd "$(dirname "$0")/../../client" && make format ;;
  */server/*)
    cd "$(dirname "$0")/../../server" && make format ;;
esac
