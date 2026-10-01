#!/bin/sh
# PostToolUse(Edit|Write): docs/engine.js를 고쳤을 때만 CLAUDE.md의 엔진 규칙을 빠르게 검사한다.
# 위반이면 exit 2 → 이유가 Claude에게 전달된다.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in */docs/engine.js) ;; *) exit 0 ;; esac
cd "$(dirname "$f")/.." || exit 0

err=$(node --check docs/engine.js 2>&1) || { echo "engine.js 문법 오류:
$err" >&2; exit 2; }

# DOM·타이머·저장소 접근 금지 (주석 줄 제외)
bad=$(grep -nE '\b(document|window|alert|innerHTML|setTimeout|setInterval|localStorage|requestAnimationFrame)\b' docs/engine.js | grep -vE '^[0-9]+:\s*(//|/?\*)' | head -5)
# Math.random은 rand() 안(시드 꺼진 경우)에서만 허용
rnd=$(grep -n 'Math\.random()' docs/engine.js | grep -vE 'rngSeeded|^[0-9]+:\s*(//|/?\*)' | head -5)
if [ -n "$bad$rnd" ]; then
  echo "engine.js 규칙 위반 (엔진은 DOM·타이머 금지, 무작위는 rand()만):
$bad
$rnd" >&2
  exit 2
fi

# 헤드리스 시뮬이 도는지 (DOM 코드가 섞이면 여기서 깨진다)
out=$(node sim/runner.js --n 10 --strategies random --out /tmp/engine-guard.json 2>&1) || { echo "sim/runner.js 실패:
$(echo "$out" | tail -15)" >&2; exit 2; }
exit 0
