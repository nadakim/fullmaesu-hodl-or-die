#!/bin/sh
# UI 검증: 사이트 사본 서빙 → 스모크(smoke.cjs) + 지정한 회귀 테스트 → 결과 요약.
# 사용: tools/verify-ui.sh [테스트이름 ...|all]   예) tools/verify-ui.sh hud tilt   (smoke는 항상 실행)
# 스크린샷: $OUT/*.png (기본 /tmp/hodl-test)
set -u
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/hodl-test}; PORT=8765
rm -rf "$OUT/site"; mkdir -p "$OUT/site" "$OUT/w" "$OUT/v"
cp docs/demo "$OUT/site/demo.html" && cp docs/*.js "$OUT/site/" && cp -r docs/assets "$OUT/site/"
python3 -m http.server $PORT --bind 127.0.0.1 -d "$OUT/site" >/dev/null 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1

if [ "${1:-}" = "all" ]; then tests=$(ls tools/tests/*.cjs | xargs -n1 basename | sed 's/\.cjs$//')
else tests="smoke ${*:-}"; fi

fail=0
for t in $(echo $tests | tr ' ' '\n' | awk '!s[$0]++'); do
  f=tools/tests/$t.cjs; [ -f "$f" ] || { echo "== $t: 파일 없음"; fail=1; continue; }
  res=$(timeout 300 node "$f" "$OUT" 2>&1)
  bad=$(echo "$res" | grep -vE 'FAIL 0 /' | grep -E '^FAIL|FAIL [1-9][0-9]* /|errors \[[^]]|Error' | head -8)
  if [ -z "$bad" ]; then echo "PASS $t"; else echo "FAIL $t"; echo "$bad" | sed 's/^/    /'; fail=1; fi
done
echo "스크린샷: $OUT (*.png, w/*.png)"
exit $fail
