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
| deckbuilding | S3: 종목 카드 금액 창(버튼·입력·Esc/Enter)·보상 카드 강화·암시장 리모델링/변환/복제·태그 아이콘 |
| multipliers | S4: 주식 분할·레버리지 ETF·몰빵 손패 사용·곱하기 유물 정산 단계·크리티컬 확률 공개(정산 칩·도감)·알림 |
| quickui | S5: 손패 이름만·추천 빛남·HUD 배속(0.5×·키 1~4)·차트 크게 보기(장 진행)·시그널 칩·설명서 (4개 창 크기) |
| daystage | S6: 장 마감 정산 무대 — 보정 없는 날 안 열림·유물 칩·크리티컬 릴·배수 불타기·빨리 감기/결과로·다음 날·작은 정산 2배속·연출 끔·주 마지막 날은 체인 |
| combo | S8 수익 콤보: 단계 c1~c5·JACKPOT·5음계·'최대 ×N'·매도/갭/반대매매/정산 연결·CHAIN 표시 없음 / `?tuner=1` 슬라이더·저장(조정 모드만)·콤보 테스트·값 복사·기본값·접기 |
| shopfx | S8 암시장: 입장 안개·채도·패드·BGM 로우패스·호버 띠잉/둥실·팩 흔들림→터짐→기둥·신화 암전/합창/회전·유물 철컥·나가면 로우패스 해제 |
| trroom | S8 TR룸: 장전 드로우(촥 5음계·희귀 반짝)·카드 연속 사용 음높이·장 시작 카운트다운(시장 정지·Space 스킵·'최소' 생략)·포지션 불꽃 1→3·신고가 번쩍·위험 맥동/가장자리/심장 박동 간격 |
| accum | S7-20 세력 매집: 아래꼬리 감지 → 찌라시 · 표시 확률 = 전이표 UP · 일반 추첨 제외 |
| relicslots | 유물 칸 6개·종류 배지·칸 순서대로 정산·◀▶/←→/끌기(장중 불가)·가득 찬 칸 교체/포기·암시장 판매 |
| bgm | 배경음악 트랙·무드 |
| growth | 성장형 유물 |
| packinfo · infl · multirm · reroll · w-shoprel | 암시장 (팩 확률 팝업·물가·카드 제거·새로고침·유물 3칸) |
| w-clicks | 6개 창 크기 클릭 정확도 (손패·대상 지정·매도·오버레이·구매) |
| w-flow | TR룸 흐름: ≡ 메뉴·Esc·찌라시·타이틀 ↔ 이어하기·주간 흐름·장세 뱃지 |
| w-tflow · w-title | 타이틀: 키보드 메뉴·이어하기·확인·Electron 종료 구멍 / 5개 창 크기 스크린샷·겹침 |
| w-tr · w-verify · w-resize | TR룸 손패 3×3·포지션 6개 / 창 크기별 표 / 창 크기 바꾸기 |
