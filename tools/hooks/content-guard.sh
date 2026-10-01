#!/bin/sh
# PostToolUse(Edit|Write): 게임 소스(docs/*.js, docs/demo)에 CLAUDE.md '금지 소재'가 들어갔는지 검사한다.
# - 자살을 연상시키는 표현 / 실존 기업명·티커. 위반이면 exit 2 → 이유가 Claude에게 전달된다.
# 설계 문서(*.md)·CLAUDE.md는 규칙 설명에 이 단어가 나오므로 검사하지 않는다.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  */docs/demo|*/docs/engine.js|*/docs/audio.js|*/docs/music.js|*/docs/fx.js) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

bad=$(grep -nE '한강|투신|수온|자살|극단적 ?선택|삼성전자|엔비디아|테슬라|하이닉스|NVDA|TSLA' "$f" | head -5)
if [ -n "$bad" ]; then
  echo "금지 소재 발견 ($f) — 자해 연상 표현·실존 기업명/티커는 쓰지 않는다 (재정적 파산 소재만):
$bad" >&2
  exit 2
fi
exit 0
