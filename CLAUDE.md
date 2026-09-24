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
  - **CONFIG**: 밸런스 상수 (`START_CASH`, `TICKS_PER_DAY`, `ROUND_TARGETS`, `MAINTENANCE_RATIO`, `DAILY_INTEREST` 등). 수치 조정은 여기서만.
  - **ENGINE** (DOM 접근 금지): 상태 `run`(한 판 전체), `assets`(종목별 가격), `marketPrice`/`marketState`/`candleData`(지수) · 데이터 `CARD_DATABASE`, `MARKET_EVENTS` · 매매 `buyPosition`, `sellPosition`, `sellAllPositions`, `closePosition` · 가치 계산 `positionValue`, `collateralRatio`, `netEquity`, `updateAssetPrices`, `generateNextCandle` · 진행/이벤트 `tick`, `checkMarginCalls`, `updateMarketEvent`, `endOfDay`, `endOfRound`, `checkBankruptcy`.
  - **UI**: `onGameEvent`가 엔진 이벤트를 받아 토스트/연출을 띄우고, `renderAll()`이 화면을 그린다. 입력 핸들러는 엔진 함수 호출 → `renderAll()` 순서.
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

## 수정 후 검증 (필수)

코드를 수정했으면 **Playwright로 실제 동작을 확인**한다. 문법이 맞는지만 보고 끝내지 않는다.

1. `docs/demo`는 확장자가 없어 그대로 서빙하면 HTML로 인식되지 않는다. 임시 폴더에 `demo.html`로 복사해 로컬 서버로 띄운다:
   ```sh
   mkdir -p /tmp/site && cp docs/demo /tmp/site/demo.html
   python3 -m http.server 8765 --bind 127.0.0.1 -d /tmp/site
   ```
2. Playwright MCP(`.mcp.json`) 또는 Playwright 스크립트로 `http://127.0.0.1:8765/demo.html`을 연다.
3. 최소 스모크 시나리오:
   - `▶ 영끌 출격` 클릭 → `#screen-play`가 활성화되는지
   - (레버리지 1x 상태에서) `#handBox .card` 하나 클릭 → 현금이 카드 비용만큼 줄고 `#positionsBox`에 포지션이 생기는지
   - `◆ 전량 매도` 클릭 → 포지션이 0개(`NO POSITION`)가 되고 현금/확정손익이 갱신되는지
   - 페이지 에러(`pageerror`)가 없는지
4. 변경한 기능 자체도 직접 조작해 확인하고, 필요하면 스크린샷으로 레이아웃을 본다.

참고:
- 게임 루프가 800ms마다 돌며 손패·포지션을 다시 그릴 수 있으므로, 요소 핸들을 오래 들고 있지 말고 locator로 매번 새로 찾는다.
- 반대매매·주말 결산·게임오버처럼 기다리기 어려운 상황은 `page.evaluate`로 상태를 만들어 확인한다 (예: `assets.semi.price *= 0.9; checkMarginCalls(); renderAll();`, `run.day = DAYS_PER_ROUND; endOfDay(); renderAll();`).
- 시장은 TR룸 탭에 있을 때만 움직인다 (`currentTab === 'play'`).
