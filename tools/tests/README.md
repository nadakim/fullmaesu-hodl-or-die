# 브라우저 회귀 테스트 (Playwright, 저장소 밖 의존성 없음)

전역 Playwright(`/opt/node22/lib/node_modules/playwright`, Chromium 사전 설치)를 node 스크립트로 직접 부른다 — npm 설치 없음.
테스트는 `http://127.0.0.1:8765/demo.html`을 연다. 먼저 사이트 사본을 띄운다:

```sh
OUT=/tmp/hodl-test; mkdir -p $OUT/site $OUT/w $OUT/v
cp docs/demo $OUT/site/demo.html && cp docs/*.js $OUT/site/ && cp -r docs/assets $OUT/site/
python3 -m http.server 8765 --bind 127.0.0.1 -d $OUT/site &
for t in tools/tests/*.cjs; do echo "== $t"; node $t $OUT 2>&1 | grep -E '^FAIL|FAIL [0-9]+ /|errors|Error' ; done
```

- 인자 = 스크린샷을 남길 폴더 (`w-*`는 그 아래 `w/`에 저장). `FAIL 0 / N` + `errors []`면 통과.
- 타이틀은 첫 입력(클릭·키)을 오디오 켜기에만 쓰고 메뉴 선택으로 쓰지 않는다 → 테스트는 페이지를 열거나 새로고침한 뒤 `keyboard.press('Shift')`를 먼저 누른다 (bgm.cjs만 첫 입력 전 무음을 재느라 예외).
- 타이틀 메뉴는 확정 뒤 0.2초(`TITLE_CONFIRM_MS`) 후 전환 → `#startBtn` 클릭 뒤 260ms 이상 기다린다. 진행 중인 판에서 [영끌 출격]은 두 번 눌러야 한다.

| 파일 | 보는 것 |
|---|---|
| smoke | CLAUDE.md 스모크 (출격 → 매수 → 장중 → 전량 매도 → 주간 결산 → 암시장 → 2주차) |
| rm | 읽을 수 있는 시장: 시그널·뉴스·카드 EV(툴팁) |
| tipres | 찌라시 결과 중앙 알림·효과음·찌라시 기록 |
| chainfx · juice | 연출 큐·갭 경보·반대매매·설정 반영·동작 줄이기 |
| chain · nextbtn | 결산 체인 연출·▶ 다음 |
| bgm | 배경음악 트랙·무드 |
| growth | 성장형 유물 |
| packinfo · infl · multirm · reroll · w-shoprel | 암시장 (팩 확률 팝업·물가·카드 제거·새로고침·유물 3칸) |
| w-clicks | 6개 창 크기 클릭 정확도 (손패·대상 지정·매도·오버레이·구매) |
| w-flow | TR룸 흐름: ≡ 메뉴·Esc·찌라시·타이틀 ↔ 이어하기·주간 흐름·장세 뱃지 |
| w-tflow · w-title | 타이틀: 키보드 메뉴·이어하기·확인·Electron 종료 구멍 / 5개 창 크기 스크린샷·겹침 |
| w-tr · w-verify · w-resize | TR룸 손패 3×3·포지션 6개 / 창 크기별 표 / 창 크기 바꾸기 |
