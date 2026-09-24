# CLAUDE.md

## 프로젝트 개요

**풀매수 기원단: HODL or Die** — 주식 시장의 급등락을 카드 게임으로 재해석한 레트로 픽셀 2D 트레이딩 게임.

- 현재 단계: **웹 프로토타입** (핵심 게임 시스템 검증용)
- 다음 단계: **Unity + C#으로 이식** 예정 → 지금 작성하는 게임 로직은 그대로 C#으로 옮길 수 있어야 한다.
- 개발 기록: `DEVELOPMENT_LOG.md` / 기능 현황: `README.md`

## 파일 구조

- `docs/demo` — 프로토타입 본체 (단일 HTML 파일, **확장자 없음**). CSS·마크업·JS가 한 파일에 들어 있다.
- `.claude/skills/` — 프로젝트 범위 스킬 (ponytail 등)
- `.mcp.json` — Playwright MCP (headless chromium)

## 기술 스택

- 순수 **HTML / CSS / JavaScript + Canvas** (캔들 차트, 배경 그리드)
- **빌드 도구·번들러·프레임워크·npm 의존성 추가 금지** (React, Vite, TypeScript, Tailwind 등 X). 브라우저에서 파일 하나로 바로 열려야 한다.
- 외부 리소스는 Google Fonts(`Press Start 2P`, `VT323`)만 사용.

## 코드 규칙

### 게임 로직과 UI 분리 (C# 이식 대비)

게임 로직 — **상태, 매매, 가치 계산, 이벤트** — 은 DOM/Canvas 코드와 분리해 유지한다.

- 로직 함수는 DOM(`document`, `innerHTML`, `alert`), Canvas, `setTimeout`/`setInterval`에 직접 의존하지 않는다. 입력을 받아 상태를 바꾸거나 값을 반환하고, 화면 갱신은 호출 측(UI 레이어)이 `renderUI()`/`renderChart()`로 한다.
- `docs/demo`의 `<script>`는 세 구역으로 나뉜다. 이 경계를 유지한다:
  - **CONFIG**: 밸런스 상수 전부 (판 구조 `ROUND_TARGETS`·`TICKS_PER_DAY`, 반대매매 `MARGIN_CALL_RATIO`·`LIQUIDATION_PENALTY`, 덱 `DRAW_PER_DAY`·`AP_PER_DAY`·`RARITY_WEIGHTS`, 암시장 `SHOP_PACKS`·`SHOP_SINGLE_*`·`SHOP_REMOVE_*`, 유물 `RELICS`·`RELIC_*`, 찌라시 `TIP_EVENTS`·`TIP_*`, 카드 수치 `STOP_LOSS_PCT` 등), 종목 데이터 `STOCKS`, 시작 덱 `STARTER_DECK`. 수치 조정은 여기서만.
  - **ENGINE** (DOM 접근 금지): 상태 `run`(한 판 전체: 현금·포지션·더미·행동력·대기 매수 효과·오늘의 효과), `assets`(종목별 가격·스파크라인 `history`·캔들 `candles`), `marketPrice`/`marketState`/`candleData`(지수).
    - 포지션 (롱·숏 공용, `dir` = +1/−1): `exposure`, `posEquity`, `posPnl`, `marginRatio`, `openPosition`(같은 종목·방향·레버리지 포지션이 있으면 `addToPosition`으로 통합), `closePosition`, `sellPosition`, `sellAllPositions`, `checkOrders`(예약주문), `checkMarginCalls`
    - 카드: `CARDS`/`CARD_BY_ID`를 `defCard(id, name, type, ap, rarity, target, exhaust, desc, valid, play)`로 정의. 사용은 `checkPlay` → `playCard(handIdx, targetId)`, 대상 목록은 `validTargetIds`
    - 더미: `buildWeekPiles`, `drawCards`, `newCard`
    - 유물(패시브, `run.relics`): `hasRelic`, `gainRelic`, `rollRelics`. 효과는 계산 지점에 직접 개입한다 — 손익 `relicAdjustedPnl`(국밥 정신·존버의 인장, `posEquity`를 거쳐 청산·증거금률·순자산까지), `pumpUpChance`(리딩방 VIP), `checkMarginCalls` 패널티(한강 수온 알림), `interestRate`(캐피탈 VVIP), `maxAp`(떡상 기원 부적), `endOfRound`(부모님 카드). 새 유물도 이렇게 계산 함수 안에서 `hasRelic()`으로 분기한다.
    - 찌라시(장중 선택 이벤트): `tick` 끝에서 `maybeTriggerTip` → `openTip`(→ `run.pendingTip`, 이 동안 `tick`은 멈춤) → `resolveTip(choiceIdx)`가 확률 판정 후 `applyTipEffect`로 효과(cash·buy·shock·pump·market·sellStock·protect)를 적용하고 `run.tipLog`에 순자산 변화를 남긴다. 이벤트는 CONFIG `TIP_EVENTS`에 데이터로만 추가한다.
    - 흐름: `startNewRun` → `startDay`(장전) → `startMarket`(장중) → `tick` × N → `endOfDay` → … → `endOfRound` → `chooseReward`(카드 보상: 덱에 없는 카드만) → `chooseRelicReward`(유물 보상: 없는 것 2개 중 1개, 다 모았으면 생략) → `openShop`(암시장: `buyPack`·`buySingle`·`shopRemoveCard`) → `leaveShop` → `startNextRound`
  - **UI**: `onGameEvent`가 엔진 이벤트를 받아 토스트/연출/오버레이를 띄우고, `renderAll()`이 화면을 그린다. 대상 지정 상태(`selectedIdx`), 설명을 펼친 유물(`relicTipId`), 큰 차트에 보이는 대상(`chartTarget`: `'idx'` 또는 종목 id)은 UI에만 있다. 입력 핸들러는 엔진 함수 호출 → `renderAll()` 순서.
- 새 카드는 `defCard`로 추가하고, 효과 함수는 `run`·`assets`만 바꾼다. 수치는 CONFIG에 상수로.
- 엔진은 UI에 직접 손대지 않고 `emit(type, data)`로만 알린다. 새 규칙을 넣을 때도 같은 방식을 따른다.
- 엔진 안의 시간 흐름은 틱 카운트(`tickInDay`, `eventTicksLeft`)로 처리한다. `setTimeout`/`setInterval`은 UI 쪽 게임 루프(`window.onload`)에만 둔다.
- C#으로 옮기기 쉬운 형태를 선호: 명확한 필드를 가진 평범한 객체, 순수 함수, 숫자 상수는 이름 있는 상수로. JS 전용 트릭(동적 프로퍼티 추가, 암묵적 형변환, 프로토타입 조작)은 피한다.
- 금액 단위는 "만 원" 정수 기준(`₩ 10,000만`)을 유지한다.

### 픽셀 디자인 시스템 재사용

- 색상은 반드시 `:root`의 CSS 변수를 쓴다: `--bg`, `--panel`, `--panel2`, `--green`, `--green2`, `--green-dim`, `--red`, `--red2`, `--red-dim`, `--gold`, `--gold2`, `--purple`, `--cyan`, `--text`, `--muted`, `--line`, `--line2`. 새 hex 값을 하드코딩하지 않는다 (Canvas에서 부득이하면 같은 값을 사용).
- 테두리는 기존 픽셀 유틸리티 재사용: `.px-border`, `.px-border-gold`, `.px-border-green`, `.px-border-red`, `.px-corner-box`. `border-radius`·부드러운 그림자·그라데이션 대신 `box-shadow` 픽셀 테두리와 오프셋 그림자(`6px 6px 0 #000`).
- 폰트: 제목/라벨은 `Press Start 2P`, 본문/숫자는 `VT323`.
- `image-rendering: pixelated`, Canvas는 `imageSmoothingEnabled = false` 유지.
- 상승 = `--green`, 하락 = `--red` (한국식 반대 색 쓰지 않음 — 기존 컨벤션 유지).

### 레이아웃 (가로 데스크톱 / 세로 모바일)

- **901px 이상**: `.cabinet`은 16:10 고정(`--cab-ratio-w/h`), 폭 = `min(--cab-max-w, --cab-max-h × 16/10)`. 화면이 16:10보다 넓으면 좌우, 좁으면 위아래로 배경이 보인다(letterbox). 페이지는 스크롤되지 않고 화면별로 게임 영역 안에서만 스크롤.
- TR룸은 그리드 3구역: `.play-top`(HUD 바) / `.play-left`(뉴스·지수 차트·종목 시세) / `.play-right`(행동력·손패·장 시작·포지션·전량 매도). 새 UI는 이 셋 중 하나에 넣는다.
- **900px 이하**: 데스크톱 CSS(`@media (min-width: 901px)`)가 꺼지고 기존 세로 스택(최대 520px).
- 레이아웃을 건드렸으면 1920×1080, 1366×768, 모바일 폭(예: 390×844)에서 스크린샷으로 카드 잘림·겹침을 확인한다.

## 수정 후 검증 (필수)

코드를 수정했으면 **Playwright로 실제 동작을 확인**한다. 문법이 맞는지만 보고 끝내지 않는다.

1. `docs/demo`는 확장자가 없어 그대로 서빙하면 HTML로 인식되지 않는다. 임시 폴더에 `demo.html`로 복사해 로컬 서버로 띄운다:
   ```sh
   mkdir -p /tmp/site && cp docs/demo /tmp/site/demo.html
   python3 -m http.server 8765 --bind 127.0.0.1 -d /tmp/site
   ```
2. Playwright MCP(`.mcp.json`) 또는 Playwright 스크립트로 `http://127.0.0.1:8765/demo.html`을 연다.
3. 최소 스모크 시나리오:
   - `▶ 영끌 출격` 클릭 → `#screen-play`가 활성화되고 장전(`run.phase === 'premarket'`)인지
   - 손패의 종목 카드(대기 매수 효과 없음) 클릭 → 현금이 카드 비용만큼 줄고 `#positionsBox`에 포지션이 생기는지
   - `▶ 장 시작`(`#openBtn`) 클릭 → 장중으로 넘어가 캔들이 진행되는지
   - `◆ 전량 매도` 클릭 → 포지션이 0개(`NO POSITION`)가 되고 현금/확정손익이 갱신되는지
   - 페이지 에러(`pageerror`)가 없는지
4. 변경한 기능 자체도 직접 조작해 확인하고, 필요하면 스크린샷으로 레이아웃을 본다.

참고:
- 게임 루프가 800ms마다 돌며 손패·포지션을 다시 그릴 수 있으므로, 요소 핸들을 오래 들고 있지 말고 locator로 매번 새로 찾는다.
- 손패는 무작위이므로 `run.hand = ['stk_semi', 'credit'].map(newCard); handSig = ''; renderAll();`처럼 고정해서 시나리오를 재현한다.
- 반대매매·장 마감·주간 결산처럼 기다리기 어려운 상황은 `page.evaluate`로 상태를 만들어 확인한다 (예: `assets.meme.price *= 0.7; checkMarginCalls();`, `run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll();`).
- 시장은 TR룸 탭에서, 장중(`run.phase === 'market'`)이고 찌라시·오버레이가 없을 때만 움직인다.
- 찌라시가 오면 선택 전까지 `tick()`이 멈추므로, 장을 끝까지 돌리는 반복문은 위 예시처럼 `resolveTip`으로 처리한다. 실시간으로 장을 돌려 보는 테스트에서 찌라시가 끼면 안 되면 `window.tipChance = () => 0;`으로 끈다.
