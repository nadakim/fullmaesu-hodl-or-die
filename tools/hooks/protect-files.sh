#!/bin/sh
# PreToolUse(Edit|Write): 바이너리·생성물 직접 수정 차단.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  */docs/assets/fonts/*|*/docs/assets/sfx/*.ogg|*/sim/results/*)
    echo "차단: $f 는 바이너리/생성물이라 직접 수정하지 않습니다 (폰트 교체·시뮬 재실행으로 갱신)." >&2
    exit 2 ;;
esac
exit 0
