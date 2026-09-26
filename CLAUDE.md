# CLAUDE.md

## 프로젝트 개요

**풀매수 기원단: HODL or Die** — 주식 시장의 급등락을 카드 게임으로 재해석한 레트로 픽셀 2D 트레이딩 게임.

- 현재 단계: **웹 프로토타입** (핵심 게임 시스템 검증용)
- 다음 단계: **Unity + C#으로 이식** 예정 → 지금 작성하는 게임 로직은 그대로 C#으로 옮길 수 있어야 한다.
- 개발 기록: `DEVELOPMENT_LOG.md` / 기능 현황: `README.md`

## 공통 규칙 (모든 작업에 적용)

- 게임 로직(ENGINE)은 DOM을 건드리지 않는다. UI에는 `emit()`으로 이벤트만 알린다. 나중에 다른 엔진으로 옮기기 위한 원칙이다.
- 밸런스 수치는 전부 파일 상단 CONFIG 상수로 둔다. 코드 중간에 숫자를 박지 않는다.
- 엔진의 무작위는 전부 `rand()`를 쓴다 (`Math.random` 직접 호출 금지 — UI 연출은 예외). `setSeed(n)`이면 같은 시드 = 같은 판.
- 금지 소재: 한강·다리·투신·수온 등 자살을 연상시키는 표현, 실존 기업명·실존 티커(삼성전자, NVDA, TSLA 등). 게임 오버·블랙코미디는 재정적 파산 소재(반대매매, 깡통계좌, 영끌 실패 등)로만 쓴다.
- UI를 바꾸면 Playwright로 1920×1080, 1366×768 스크린샷을 찍어 확인한다.
- 밸런스를 바꾸면 `tools/sim` 시뮬레이터를 변경 전/후로 돌리고 표로 비교해서 보고한다. 기준점은 `docs/balance-baseline.md`.
  - 실행: `node tools/sim/sim.cjs [--n 400] [--tip A|B|random] [--strategies nothing,stocksOnly,allCards,yolo,shopper,marketCards,bearInverse,bearShort] [--file docs/demo] [--md out.md]`
  - 카드 한 장의 기대 수익: `node tools/sim/cardev.cjs [--file docs/demo]` (시장 카드, 원래 쓰는 상황) · `--all` (신화·상태 제외 전 카드, 공통 상황) — 같은 시드로 카드 사용/미사용 비교, 순자산 대비 %
  - 변경 전: `mkdir -p /tmp/before && git show HEAD:docs/demo > /tmp/before/demo && git show HEAD:docs/engine.js > /tmp/before/engine.js && node tools/sim/sim.cjs --file /tmp/before/demo`
  - 헤드리스 전략 시뮬레이터 (브라우저 없이 Node에서 엔진 직접 실행, 전략 8종 × 500판 — 시그널 추종 `signalFollower` 포함): `node sim/runner.js [--n 500] [--strategies allIn3x,...] [--targets ...] [--set NAME=값;...] [--engine 변경전/engine.js]` → `sim/results/*.json`. 대조군 `random`·`nothing`(카드 0장)보다 잘 짠 빌드가 높아야 하고, `nothing`은 0%에 가까워야 한다. 자세한 건 `sim/README.md`
  - 목표치 실험: `--targets 11020,11320,...` (파일 수정 없이 ROUND_TARGETS 교체). `--json`의 `weekEq`는 판마다 주간 결산 순자산 목록

## 파일 구조

- `docs/demo` — 프로토타입 본체 (HTML, **확장자 없음**). CSS·마크업·UI JS. 엔진은 `<script src="engine.js">`로 불러온다.
- `docs/engine.js` — CONFIG + ENGINE (DOM 없음). 브라우저와 Node(`sim/load-engine.js`, vm) 양쪽에서 같은 파일을 쓴다.
- `docs/audio.js` — 효과음 (UI 전용). Web Audio API 합성 칩튠, 음원 파일 없음. `Sound.play(이름, {pitch, volume})`, 사전 `Sound.SFX`, 파일 상단에 이름 → 이벤트 표.
- `docs/music.js` — 배경음악 (UI 전용). 곡은 코드가 아니라 데이터 `SONGS`(파일 맨 위, 트래커 형식 `{bpm, stepsPerBeat, patterns, order}`, 칸 = 'C4'·'-'·'.'·드럼 K/S/H/O). 패미컴 4채널 + market 적응형 레이어, look-ahead 스케줄러. `Music.setTrack`·`setMood`·`stinger`·`duck`. `Sound.mixBus`(같은 컴프레서)로 섞는다.
- `docs/fx.js` — 타격감 연출 (UI 전용). `Fx.hitStop`·`shake(1~3)`·`glitch`·`stamp`·`punch`·`cardFly`·파티클(`coinsTo`·`shatter`·`sparks`·`burst`·`streak`, 캔버스 한 장)·`chip`, **연출 큐** `Fx.enqueue({kind, tier, blocking, duration, play, stop, skip})` — 한 틱에 몰린 이벤트를 발생 순서대로 하나씩(두 번째부터 CHAIN ×n, 효과음 반음씩), blocking 항목이 있으면 `Fx.queueBusy` → 게임 루프가 tick을 미룬다, 클릭·Space·Enter = `Fx.skipQueue`.
- `sim/` — 헤드리스 전략 시뮬레이터 (`runner.js`·`strategies.js`·`load-engine.js`, 결과 `results/`)
- `.claude/skills/` — 프로젝트 범위 스킬 (ponytail 등)
- `.mcp.json` — Playwright MCP (headless chromium)
- `tools/sim/sim.cjs` — 밸런스 시뮬레이터 (봇 6종 × N판, 결과 표). 기준점: `docs/balance-baseline.md`
- `tools/sim/cardev.cjs` — 시장 카드 한 장의 기대 수익 측정
- `tools/sim/bearbet.cjs` — 하락 베팅 한 번(인버스 ETF vs 공매도·레버리지)의 평균·분산·반대매매 확률 비교

## 기술 스택

- 순수 **HTML / CSS / JavaScript + Canvas** (캔들 차트, 배경 그리드)
- **빌드 도구·번들러·프레임워크·npm 의존성 추가 금지** (React, Vite, TypeScript, Tailwind 등 X). 브라우저에서 파일 하나로 바로 열려야 한다.
- 외부 리소스를 쓰지 않는다 (스팀 오프라인 빌드 대비). 폰트는 전부 `docs/assets/fonts/`의 로컬 파일 — Press Start 2P·VT323(TTF), 한글 Galmuri7·9·11·14(woff2, npm `galmuri` 2.40.3 = GitHub quiple/galmuri의 dist). 라이선스는 전부 SIL OFL 1.1, 같은 폴더의 `*-OFL.txt`. 페이지는 `docs/demo` + `docs/engine.js` + `docs/audio.js` + `docs/music.js` + `docs/fx.js` + `docs/assets/`를 함께 배포해야 한다. 외부 오디오·연출 라이브러리(Howler.js·Tone.js 등) 금지 — Web Audio API와 Canvas만.

## 코드 규칙

### 게임 로직과 UI 분리 (C# 이식 대비)

게임 로직 — **상태, 매매, 가치 계산, 이벤트** — 은 DOM/Canvas 코드와 분리해 유지한다.

- 로직 함수는 DOM(`document`, `innerHTML`, `alert`), Canvas, `setTimeout`/`setInterval`에 직접 의존하지 않는다. 입력을 받아 상태를 바꾸거나 값을 반환하고, 화면 갱신은 호출 측(UI 레이어)이 `renderUI()`/`renderChart()`로 한다.
- 스크립트는 세 구역으로 나뉜다 — CONFIG·ENGINE은 `docs/engine.js`, UI는 `docs/demo`의 `<script>`. 이 경계를 유지한다 (엔진에 DOM 코드를 넣으면 Node 시뮬레이터가 깨진다):
  - **CONFIG**: 밸런스 상수 전부 (판 구조 `ROUND_TARGETS`·`TICKS_PER_DAY`, 시장 `STOCK_DRIFT`·`INVERSE_DECAY`·`STOCK_MOVE_MULT`(장세별 종목 움직임 배수)·`INDEX_TICK_CENTER`·`IDX_SENS`·`EVENT_*`, 시장 카드 `MARKET_CARD_ODDS`·`REVERSION_*`·`PUMP_*`, 금감원 게이지 `FSS_*`, 이자 `DAILY_INTEREST`(신용·마통)·`SHORT_BORROW_RATE`(대차), 반대매매 `MARGIN_CALL_RATIO`·`LIQUIDATION_PENALTY`·`MISU_CASH_FLOOR`, 갭 `GAP_*`, 덱 `DRAW_PER_DAY`·`AP_PER_DAY`, 등급 `RARITIES`·`REWARD_RARITY_BY_WEEK`·`MYTHIC_DECK_LIMIT`, 비자금 `SLUSH_*`·`TIP_SLUSH_SAFE`, 암시장 `SHOP_PACKS`·`SHOP_SINGLE_*`·`SHOP_REMOVE_*`·`SHOP_INFLATION`(가격은 전부 `shopPrice`를 거치는 `packPrice`·`singlePrice`·`relicPrice`·`removeCost(n)`(카드 제거: 횟수 제한 없이 같은 주 n번째마다 ×`SHOP_REMOVE_ESCALATION`, `shopRemoveCost()` = 다음 제거)로만 읽는다. 낱장 주당 한도 없음. 진열 새로고침 `rerollShop(kind)`(낱장·유물, 비용 `rerollCost(kind, n)` — `SHOP_REROLL_*`), `docs/design/SHOP_ECONOMY.md`), 유물 `RELICS`·`RELIC_*`(결산 보상 `RELIC_RARITY_WEIGHTS`, 암시장 진열 `RELIC_SHOP_COUNT`칸 × `RELIC_SHOP_RARITY_WEIGHTS` — 칸마다 등급 먼저 → 등급 안 균등, 화면 표시 확률은 순수 함수 `relicShopOdds()`, `RELIC_PRICE`), 찌라시 `TIP_EVENTS`·`TIP_*`, 카드 수치 `STOP_LOSS_PCT` 등), 종목 데이터 `STOCKS`, 시작 덱 `STARTER_DECK`. 수치 조정은 여기서만.
  - **ENGINE** (DOM 접근 금지): 상태 `run`(한 판 전체: 현금·포지션·더미·행동력·대기 매수 효과·오늘의 효과), `assets`(종목별 가격·스파크라인 `history`·캔들 `candles`), `marketPrice`/`marketState`/`candleData`(지수).
    - 포지션 (롱·숏 공용, `dir` = +1/−1): `exposure`, `posEquity`, `posPnl`, `marginRatio`, `openPosition`(같은 종목·방향·레버리지 포지션이 있으면 `addToPosition`으로 통합), `closePosition`, `sellPosition`, `sellAllPositions`, `checkOrders`(예약주문), `checkMarginCalls`
    - 카드: `CARDS`/`CARD_BY_ID`를 `defCard(id, name, type, ap, rarity, target, exhaust, desc, valid, play)`로 정의. 사용은 `checkPlay` → `playCard(handIdx, targetId)`, 대상 목록은 `validTargetIds`. 행동력은 항상 `cardCost(card)`로 (주간 효과·유물 반영, 손패 표시도 같은 값)
    - 등급 5단계 common·uncommon·rare·legendary·mythic: 보상·낱장·유물은 `rollRarity`(등급 먼저) → 등급 안 균등. 후보 제한은 `cardAllowed`(덱에 없는 카드 + 신화는 덱 전체 `MYTHIC_DECK_LIMIT`장). 팩은 `packPool`(확률 0% 등급 제외)·`packRarityOdds`
    - 주간 효과 `run.week`(개미 군단·상투 감별사·가치투자의 신, `startNextRound`에서 초기화), 오늘 효과 `lossGuardToday`·`circuitToday`·`sellDiscountUsed`(`startDay`에서 초기화). 작전 세력 갭은 `gapToday` → 장 마감 `gapNext` → 다음 개장 `shockStock`
    - 더미: `buildWeekPiles`, `drawCards`, `newCard`
    - 유물(패시브, `run.relics`): `hasRelic`, `gainRelic`, `rollRelics`. 효과는 계산 지점에 직접 개입한다 — 손익 `relicAdjustedPnl`(국밥 정신·존버의 인장, `posEquity`를 거쳐 청산·증거금률·순자산까지), `pumpUpChance`(리딩방 VIP), `checkMarginCalls` 패널티(증권사 담당자 핫라인), `interestRate`(캐피탈 VVIP), `maxAp`(떡상 기원 부적), `endOfRound`(부모님 카드), `decayFss`(전관 변호사), `relicAdjustedPnl`(테마주 헌터), `marginCallRatio`(콜드월렛), `dailyInterest`(공매도 전문가 — 신용 `interestRate` + 대차 `shortBorrowRate`, 캐피탈 VVIP는 둘 다 할인), `inverseMasterDraw`(인버스 장인), `tipChances`(개미 커뮤니티), `cardCost`(단타의 신), `raiseFss`(금감원 인맥), `startDay`(월급날), `run.dayRoll`+`rollMarketCard`(타임머신 — 판정 난수를 장전에 굴려 둔다). 새 유물도 이렇게 계산 함수 안에서 `hasRelic()`으로 분기한다.
    - 갭(`rollGaps`, `tick`에서 종목 가격 갱신 직후 → 예약주문·반대매매보다 먼저): 종목마다 틱당 확률 `gapChance` = `gapRisk`(volatility + |beta|×`GAP_BETA_WEIGHT`) × `GAP_CHANCE_PER_RISK` × `GAP_STATE_MULT[marketState]`로 ±크기만큼 한 번에 튄다. 이번 틱 캔들에 합쳐 `candle.gap = ±1`로 기록하고 `emit('gap')`. 반대매매는 갭 이후 가격으로 체결되므로 포지션 순자산이 음수(미수)일 수 있고, 그 뒤 현금이 `MISU_CASH_FLOOR` 미만이면 `run.misuDefault` → `checkBankruptcy`가 파산 처리(엔딩 원인은 기존 `classifyEnd` 그대로).
    - 시장 카드(비둘기·매파·CEO 트윗): 장전엔 `run.marketCard`만 기록 → `startMarket`에서 `rollMarketCard`가 `MARKET_CARD_ODDS`로 장세 판정(`run.forcedState`, NORMAL = 무시됨). 카드로 만든 강세·약세장이면 `endOfDay`가 다음 날 되돌림(`run.revertDir`·`revertTicksLeft`)을 예약하고, `tick`이 `pushNewCandle(extraDrift)`로 반영.
    - 금감원 감시 게이지(`run.fss`): `playCard`에서 `FSS_CARDS`를 쓰면 `raiseFss` → 가득 차면 `sanctionFss`(과징금 또는 `run.buyBanNext` → 다음 날 `buyBanToday`, `checkPlay`가 `'banned'`). 줄이는 법: `decayFss` — 장 마감 `FSS_DAILY_DECAY`, 새 주 `FSS_WEEKLY_DECAY` (전관 변호사 유물이면 `RELIC_LAWYER_DECAY_MULT`배), 카드 '자진 신고' `FSS_CONFESS_CUT`. HUD `#fssBox`.
    - 찌라시(장중 선택 이벤트): `tick` 끝에서 `maybeTriggerTip` → `openTip`(→ `run.pendingTip`, 이 동안 `tick`은 멈춤) → `resolveTip(choiceIdx)`가 확률 판정 후 `applyTipEffect`로 효과(cash·buy·shock·pump·market·sellStock·protect)를 적용하고 `run.tipLog`에 순자산 변화를 남긴다. 이벤트는 CONFIG `TIP_EVENTS`에 데이터로만 추가한다.
    - 흐름: `startNewRun` → `startDay`(장전) → `startMarket`(장중) → `tick` × N → `endOfDay` → … → `endOfRound` → `chooseReward`(카드 보상: 덱에 없는 카드만) → `chooseRelicReward`(유물 보상: 없는 것 2개 중 1개, 다 모았으면 생략) → `openShop`(암시장: `buyPack`·`buySingle`·`shopRemoveCard`·`buyRelic` — 값은 전부 비자금 `run.slush`로 낸다(순자산 제외, 계좌 현금과 별개). 적립은 `endOfRound` 통과 시 `slushEarned` = `SLUSH_WEEKLY_BASE` + 목표 초과분 × `SLUSH_EXCESS_RATE`, 찌라시 효과 `slush`(안전한 B 선택 보상). 팩 풀 `packPool`과 낱장 진열도 덱에 없는 카드만, `inDeck`) → `leaveShop` → `startNextRound`
    - 결산·종료: `startNextRound`가 `markWeekStart`로 주 시작 기준값(`run.weekStart`)을 남기고, `endOfRound`가 `weekSummary`로 이번 주 요약 `run.lastWeek`(순자산·목표·달성률·주간 수익·확정손익·반대매매·이자·이월 포지션)를 만든다. 판이 끝나면 `endRun(reason)`이 `classifyEnd`로 원인 `run.endCause`를 정한다: VICTORY / 파산 = YOLO_BUST·MARGIN_CALL·SHORT_SQUEEZE·DEBT_SPIRAL / 목표 미달 = SIDELINED(매수 0회 + 현금 위주)·ROUND_TRIP(주중 목표 돌파 후 미달)·NEAR_MISS(주간 수익 플러스 + 목표 90%·필요 상승분 50% 이상)·LIQ_ADDICT·FSS_FINED·TIP_VICTIM·INTEREST_DRAIN·HODL_FAIL·PANIC_SELL(손실 원인이 부족분의 `END_CAUSE_SHARE` 이상)·TOO_SLOW(수익 플러스)·SLOW_BLEED. 판정 기준은 CONFIG `END_*`, 순서는 `classifyEnd` 위 주석. 주간 값은 누적 카운터(`run.buys`·`finesPaid`·`tipNet`, `interestPaid`·`realized`)를 `run.weekStart`와 빼서 구한다 — 매수 카드는 `noteBuy(p)`로 세고(찌라시 매수는 `p.viaTip`), 최고 순자산은 `notePeak`가 `run.peakEquity`·`run.weekPeak`를 함께 갱신.
    - 읽을 수 있는 시장(`docs/design/READABLE_MARKET.md`): 종목 숨은 추세 `assets[id].regime`(UP·FLAT·DOWN·HOT, 인버스 없음) → `updateAssetPrices(…, live)`가 `REGIME_DRIFT`를 더하고, HOT은 `gapOdds`에서 갭하락 ×`GAP_HOT_MULT`. 장 마감 `resolveSignals`(채점) → `nextRegimes`(`REGIME_TRANSITION`) → `pickNews`(`run.newsTomorrow`). 장전 `rollSignals` → `run.signals`(`SIGNAL_ACCURACY`, 그날 고정), 개장 때 루머 판정 `run.newsActive`(`NEWS_RUMOR_CHANCE`), 효과 `newsEffectFor`. 기대값은 순수 함수 `expectedValue(card, target)`·`tipExpectedValue(choiceIdx)`(rand·상태 변경 금지). **UI에 보이는 확률은 엔진이 판정에 쓰는 값을 그대로 읽는다** (찌라시 `tipChances`, 리딩방 `cardDesc`). 뉴스는 CONFIG `NEWS_EVENTS`에 데이터로만 추가. 적중률 실측 `node sim/signal-check.js`.
    - 성장형 유물(`docs/design/GROWTH_RELICS.md`, RELICS의 `growth` 필드): 상태 `run.relicState[id] = {stacks, best}`, `relicStacks`·`growRelic`(→ `emit('relicGrew')`)·`resetRelic`/`shrinkRelic`(→ `emit('relicReset')`). 콤보는 엔진 `updateCombo`(`run.combo`, `emit('comboChanged')`) — UI는 표시만. 평가이익 보정은 `relicAdjustedPnl`에서 %p 합산 후 한 번 곱한다. 수치 `MOON_*`·`TEARJAR_*`·`TRAUMA_*`·`TIPCOL_*`·`TIP_JACKPOT_CAP`·`DTREE_*`·`COMPOUND_*`. 개발자 콘솔 `__debug.giveRelic(id)`·`__debug.grow(id, n)`. 폭주 점검 `node sim/growth-check.js`.
    - 결산 체인(연출용 기록, 값은 바꾸지 않음): `buildSettlementSteps(p)`가 `relicAdjustedPnl`과 **같은 조건·순서·연산**으로 유물 보정을 `{label, kind: base·mult·add, value, runningTotal, source}` 단계로 다시 적고, `endOfRound`가 이미 계산한 다이아몬드 보너스(`diamondPaid`)를 `add` 단계로 붙여 `run.lastWeek.settlementChain = [{posId, posName, dir, lev, steps, finalPnl}]`를 채운다. `relicAdjustedPnl`에 유물을 추가·수정하면 `buildSettlementSteps`도 같이 고친다 (마지막 runningTotal === `relicAdjustedPnl(p, rawPnl(p))`).
  - 이벤트: `emit(type, data)`는 이번 판 로그 `eventLog`(`startNewRun`에서 비움)에 쌓고 리스너(`setEventListener`)에 알린다. UI는 `setEventListener((t, d) => onGameEvent(t, d))`.
  - **UI**: `onGameEvent`가 엔진 이벤트를 받아 토스트/연출/오버레이를 띄우고, `renderAll()`이 화면을 그린다. 대상 지정 상태(`selectedIdx`), 설명을 펼친 유물(`relicTipId`), 도감 등급 필터(`collectionRarity`), 큰 차트에 보이는 대상(`chartTarget`: `'idx'` 또는 종목 id)은 UI에만 있다. 입력 핸들러는 엔진 함수 호출 → `renderAll()` 순서.
  - 결산 체인 연출 `playSettlementChain(chain, onDone)`: `roundClear`(와 졸업 `runOver` VICTORY)에서 결산 화면 전에 포지션별 유물 칩 ×배수 → 카운트업 → 떡상!/물림 스탬프를 재생 (`CHAIN_*` 상수). 보정 없는 포지션은 숫자만, 보정이 하나도 없으면 생략, 포지션 `CHAIN_MAX_ROWS`개 초과면 손익 절댓값 상위 `CHAIN_TOP_ROWS`개 + 요약 한 줄. 클릭·SPACE = `skipSettlementChain`(최종 결과로 점프). 재생이 끝나거나 스킵하면 자동으로 넘어가지 않고 최종 결과에서 멈춰 `chainHold` → '▶ 다음'(`data-act="chainNext"`)·엔터만 `chainNext`로 결산 화면(`onDone`)으로 간다 (결과가 뜬 뒤 `CHAIN_NEXT_GUARD_MS` 0.5초는 입력 무시, 스페이스는 넘기지 않음). 연출 끔·보정 없음이어도 같은 틀의 '결산 요약' + '▶ 다음'을 거친다. 파산·목표 미달엔 재생하지 않는다.
  - 결산 결과 화면 `showRoundResult`(`roundClear` → `data-act="toReward"`로 보상 단계) / 게임오버 화면 `showRunOver`(`runOver`). 게임오버 문구는 UI의 `ENDINGS[endCause]` 테이블에만 둔다 (`group`: bust·miss·win, `hint`: 파산 기록의 미해금 조건). 파산 기록(타이틀 > `#recordsBtn` → `#screen-records`, `buildRecords`): `showRunOver`가 `recordRun`으로 localStorage `hodl.records`(엔딩별 횟수 `counts` + 최근 `RECORDS_HISTORY`판 `history`)에 저장하고, 처음 본 엔딩이면 '새 엔딩 해금' 배지. 저장이 막히면 세션 메모리로 대신한다. 기록에는 판마다 날짜·생존 주·엔딩·최종/최고 순자산·반대매매·유물 수·덱 크기, 전체 누적 `totals`(판 수 = '개미 N회차' `hodl.antRuns`·최고 생존·최고 순자산·총 반대매매)를 둔다.
  - 환경 설정(타이틀 > `#settingsBtn` → `#screen-settings`, `buildSettings`): UI 전용 `settings`(장중 속도 `speed` 1·2·4 = 게임 루프 간격 `TICK_MS / speed`, 흔들림·번쩍임 `shake` → `flashLiquidation`, CRT `crt` off·weak·strong → `body[data-crt]`, 결산 연출 `chainFx` → `playSettlementChain`, 배경음악 `bgm`·`bgmVol`(기본 40) → `Music.setEnabled(sound && bgm)`·`setVolume`, 트랙은 `updateMusic`(`renderAll`·`switchTab`에서 화면·`run.phase`·장세·증거금률·금감원 게이지를 읽어 `Music.setTrack`·`setMood`), 사운드 `sound`·효과음 볼륨 `sfxVol` 0~100(기본 50) → `Sound.setEnabled`·`setVolume`, 장중 틱 소리 `tickSound`(기본 끔), 히트스톱 `hitStop` → `Fx.setOptions`, 화면 크기 `uiSize` small·auto·large·xlarge(자동 배율 −0.25·0·+0.25·+0.5) → `layoutUi`, 글자 크기 `fontSize` normal·large → `html[data-font]`. `prefers-reduced-motion`이면 `shake` 기본값이 끔). localStorage `hodl.settings`, 읽기·쓰기 전부 try/catch — 허용된 값이 아니면 기본값. 기록 초기화는 화면 안에서 두 번 눌러 확인(`confirm()` 쓰지 않음). 엔진 규칙(확률·결과)은 설정의 영향을 받지 않는다. **문구는 재정적 파산 소재(반대매매·깡통계좌·존버 실패·영끌 실패 등)로만** 쓰고, 한강·투신 등 자해를 연상시키는 표현은 쓰지 않는다 (등급 심사·평판 리스크).
- 새 카드는 `defCard`로 추가하고, 효과 함수는 `run`·`assets`만 바꾼다. 수치는 CONFIG에 상수로.
- 엔진은 UI에 직접 손대지 않고 `emit(type, data)`로만 알린다. 새 규칙을 넣을 때도 같은 방식을 따른다.
- 연쇄 연출(demo `enqueueGap`·`enqueueLiquidation`·`enqueueRelic`·`juiceMilestones`·`juiceStreak`): tier 1~4 = `FX_TIER`(히트스톱·흔들림·파티클), 갭 경보 강도는 약(미보유, 시장 안 멈춤)·중(보유+유리)·강(보유+불리), 밈 문구는 `GAP_MEMES`에만 추가 (금지 소재 규칙 그대로). 유물 연출은 엔진 `emit('relicTriggered', {id, amount})` — 엔진에 넣어도 되는 건 이미 계산된 값을 담는 emit 추가뿐(`rand()`·상태 변경 금지). 결산 체인·게임오버 화면은 `whenFxIdle`로 큐가 끝난 뒤. 찌라시 결과는 `enqueueTipResult`(같은 갭 경보 틀, 순자산 변화로 상승·횡보·하락 = `TIP_RESULT_FLAT_PCT`, 5% 이상 tier 3, 밈 `TIP_RESULT_MEMES`) → 끝나거나 스킵하면 `showTipResultOverlay`. 효과음 파일 덮어쓰기: `docs/assets/sfx/<SFX 이름>.ogg` + `assets/sfx/files.js`의 `SFX_FILES` 목록 (README 참고, 라이선스 CC0 권장). 설정 `fxSpeed` 보통·빠름·최소(간격 0.1초, 갭 경보 전부 약).
- 소리·타격감은 엔진에 한 줄도 넣지 않는다. `onGameEvent`와 UI 연출 함수에서만 `Sound.play`·`Fx.*`를 부른다 (새 효과음은 `audio.js` 사전 + 상단 표에 추가). 세기는 `Fx.intensity(금액, 순자산)`(순자산의 `FX_MONEY_FULL` = 1)로 정하고 '강'은 대략 10번 중 1번. 히트스톱은 게임 루프가 `Fx.frozenFor()`만큼 다음 tick을 미루는 것뿐 — tick 순서·횟수·결과는 그대로여야 한다 (`sim/runner.js` 전후 결과 JSON 동일로 확인). 설정 '화면 흔들림'을 끄면 흔들림·글리치·히트스톱이 모두 꺼지고, 파티클·소리는 남는다.
- 엔진 안의 시간 흐름은 틱 카운트(`tickInDay`, `eventTicksLeft`)로 처리한다. `setTimeout`/`setInterval`은 UI 쪽 게임 루프(`window.onload`)에만 둔다.
- C#으로 옮기기 쉬운 형태를 선호: 명확한 필드를 가진 평범한 객체, 순수 함수, 숫자 상수는 이름 있는 상수로. JS 전용 트릭(동적 프로퍼티 추가, 암묵적 형변환, 프로토타입 조작)은 피한다.
- 금액 단위는 "만 원" 정수 기준(`₩ 10,000만`)을 유지한다.

### 픽셀 디자인 시스템 재사용

- 색상은 반드시 `:root`의 CSS 변수를 쓴다: `--bg`, `--panel`, `--panel2`, `--green`, `--green2`, `--green-dim`, `--red`, `--red2`, `--red-dim`, `--gold`, `--gold2`, `--purple`, `--cyan`, `--text`, `--text2`(보조 본문), `--muted`, `--line`, `--line2`. 새 hex 값을 하드코딩하지 않는다 (Canvas에서 부득이하면 같은 값을 사용). 글자색은 배경 대비 4.5:1 이상 — `--muted` #8a96c4(bg 7.07:1), `--line`·`--line2`는 테두리 전용이고 글자에 쓰지 않는다. 보조 글자를 opacity로 흐리게 하지 말고 색으로 (비활성 상태만 예외).
- 카드 테두리: 안쪽 `--cc` = 종류 색, 바깥 `--rc` = 등급 색(일반 `--muted`·고급 `--green2`·희귀 `--blue`·전설 `--purple`·신화 `--gold`). 라벨 `.c-rar.<등급>`.
- 테두리는 기존 픽셀 유틸리티 재사용: `.px-border`, `.px-border-gold`, `.px-border-green`, `.px-border-red`, `.px-corner-box`. `border-radius`·부드러운 그림자·그라데이션 대신 `box-shadow` 픽셀 테두리와 오프셋 그림자(`6px 6px 0 #000`).
- 길이는 전부 `calc(N * var(--u))` — `--u` = `--ui` × 1px(화면 배율, 레이아웃 참고). CSS에 맨 px를 새로 쓰지 않는다 (@media 경계값·@font-face만 예외). JS가 화면에 붙이는 요소는 `getBoundingClientRect` 좌표(화면 px) 그대로, 크기는 `uiScale`을 곱한다.
- 폰트 (글자 크기 체계, docs/demo `<style>` 맨 위): 크기는 변수로만 쓴다 — 아래 px는 배율 1 기준 (`--fs-*` = N × `--u`).
  - 한글 위주 텍스트(긴 라벨·설명)는 Galmuri만: `font-family:var(--gf-sm),monospace;font-size:var(--fs-sm)`. 크기 `--fs-xs`10 · `sm`12 · `md`15 · `m16`16 · `lg`20 · `xl`24 · `xxl`30 (Galmuri 원래 크기 또는 2배, 최소 10px), 얼굴 `--gf-*`가 짝.
  - `Press Start 2P`는 8·16·24px만, 제목·큰 숫자·버튼·짧은 영문 태그에만: `font-family:'Press Start 2P',var(--gp-p1),monospace;font-size:var(--fs-p1)` (p1 8 · p2 16 · p3 24, `--gp-*` = 한글 대체 얼굴 GP8·GP16·GP24).
  - `VT323`(숫자·본문)은 최소 16px: `'VT323',var(--gv-v1)` + `--fs-v1`16 · `v2`20 · `v3`24 · `v4`30 (`--gv-*` = GV16… 한글 약 75%/67%).
  - '글자 크기: 크게' 설정은 `html[data-font="large"]`에서 이 변수들을 한 단계씩 올린다 (Press Start 2P 글자 자체는 그대로, 한글 대체 얼굴만 L 버전). 새 크기가 필요하면 변수·@font-face·large 재정의를 같이 추가한다. Canvas `ctx.font`도 같은 얼굴(`"Press Start 2P","GP8"`).
  - 손패는 3열 × 3행 격자(`#handBox.hand`, 10장 = `HAND_MAX`면 `.g4` 4열), 카드는 칸을 꽉 채우는 격자용 카드 `handCardHtml`(`.card.gcard`: 행동력·종류 띠·등급 점 / 이름 / 종목이면 가격·현재가, 아니면 설명 한 줄 / 대상·소멸) + 빈 칸 `.g-slot`. 전체 설명·수치·기대값은 툴팁. 그 밖(보상·암시장·도감·덱)의 카드는 `cardHtml` 기준 124×180(× `--u`). 설명이 넘치면 `clampCards`가 첫 문장만 남기고(`.c-desc.clamped`, 카드 `data-clamp="1"`, 발밑 ⓘ) 전문은 툴팁 `.card-tip`(마우스 올리기·길게 누르기)으로. 문구를 CSS로 줄이지 말고, 잘리는 카드는 문구로 해결한다.
  - `overflow:hidden` + 좁은 line-height 안의 한글은 윗줄이 잘린다 (Galmuri가 VT323보다 키가 크다). 이런 곳은 line-height 1.1 이상·padding-top을 준다.
- `image-rendering: pixelated`, Canvas는 `imageSmoothingEnabled = false` 유지.
- 상승 = `--green`, 하락 = `--red` (한국식 반대 색 쓰지 않음 — 기존 컨벤션 유지).

### 레이아웃 (가로 데스크톱 / 세로 모바일)

- **901px 이상**: `.cabinet`이 창 전체(100vw × 100dvh)를 채운다 (고정 비율·레터박스·확대 없음, 배경 차트·격자 레이어 없음). 배율 `uiScale`(CSS `--ui`)은 `layoutUi()`가 창 높이 ÷ `UI_BASE_H`(600)를 0.25 단위로 반올림, 1~2.5 — 창 크기가 바뀌면(`resize`, rAF 한 번) 다시 정하고 `renderAll`로 캔버스·카드 잘림을 다시 그린다. '화면 크기'를 키울 때는 창이 `UI_MIN_UNITS_W × UI_MIN_UNITS_H` 칸보다 작아지지 않는 선까지만. Canvas 내부 해상도 = 화면 크기 × devicePixelRatio, 점·선 굵기 = `round(uiScale × dpr)`. fx 파티클 크기는 `Fx.setUiScale`.
- TR룸: 폭 ≥ 1200 이고 폭/높이 ≥ 1.45면 **3단** — 상단 HUD(전체 폭) / 왼쪽 시장(뉴스 전광판 + '📰 내일' 버튼(호버로 예고)·차트(남는 높이, 장세 뱃지 `#marketStateBadge` = 엔진 `marketState`)·시세 7행(아이콘 + 적중률, 섹터·β는 종목명 호버)) / 가운데 행동(유물·행동력·칩·손패·장 시작) / 오른쪽 포지션(2줄 행 — 종목·배지·손익·매도 / 평단→현재가·원금·보유일·태그 아이콘·증거금률 미니 막대, 노출액은 행 툴팁 — 목록 스크롤·전량 매도). `.play-right`를 `display:contents`로 풀어 자식들을 `#screen-play` 그리드 영역(relic·turn·chips·ht·hand·open / pt·pos·sell)에 놓는다. 그보다 좁으면 **2단** `.play-left` | `.play-right`(포지션 최소 35vh, 모자라면 이 칸만 스크롤, 장 시작·전량 매도는 sticky). 시세표는 자동 배율에서 7행이 스크롤 없이 보여야 한다 (차트가 먼저 줄어든다). 새 UI는 이 구역 중 하나에 넣는다.
- 뉴스 배너는 한 줄에 안 들어가면 `fitNews`가 전광판(`.marquee`)으로 흘리고, 흔들림 끔·동작 줄이기면 `.wrap`(줄바꿈). 유물 없음 안내는 `fitRelicEmpty`가 좁으면 '유물 없음'.
- 게임 이름·메타는 `docs/demo` `<head>`의 `GAME_TITLE {ko, en, sub}`·`GAME_META {version, author, links}`에서만 읽는다 (탭 제목·타이틀 로고·전광판). 이름을 하드코딩하지 않는다.
- 타이틀(`#screen-title`): 배경 `#titleChart`(엔진 `generateNextCandle`과 같은 식을 타이틀 전용 상태 `tchart` + `Math.random`으로, 그리기는 메인 차트와 공용 `drawCandles`) + CRT 노이즈 `#titleNoise`·스캔라인·청록 모서리, 왼쪽 위 로고(`buildTitleLogo` — Galmuri14·Press Start 2P 원래 크기의 정수배, 화면 폭 45~55%, 글자 상한가 `pop`·하한가 `limitdown`, 떡상 기원부적), 왼쪽 아래 [대괄호] 메뉴 `#titleMenu .t-item`(호버·↑↓ 공용 `.sel` + `uiMove`, Enter·클릭 = 번쩍 + `uiConfirm` → `TITLE_CONFIRM_MS` 뒤 원래 버튼 동작, 진행 중인 판에서 영끌 출격은 한 번 더 눌러 확인, [종료]는 `window.electronAPI.quit`이 있을 때만), 오른쪽 위 버전, 오른쪽 아래 ⚙·🌐(+ 링크). 등장 `enterTitle`: 첫 진입 `intro-full`(1.5초), 다시 들어오면 `intro-short`, 흔들림 끔·동작 줄이기면 `t-static`. 첫 입력(클릭·키)은 오디오를 켜고 연출만 끝낸다 — 메뉴 선택으로 쓰지 않는다 (Playwright 테스트는 페이지를 연 뒤 `keyboard.press('Shift')`).
- 화면 전환은 탭 없이 `switchTab()`을 게임 흐름·메뉴에서만 부른다: 타이틀 '영끌 출격'/'이어하기'(`#continueBtn`, 진행 중인 판) → TR룸, 결산 → 보상 → 암시장 자동, '다음 주 개장' → TR룸. TR룸 HUD 왼쪽 ≡ 메뉴(`#menuBtn` · `#menuPanel`: 타이틀로 · 찌라시 기록 `showTipLog` · 덱 확인 · 환경 설정(`settingsReturn`으로 돌아옴)), Esc = 대상 지정 취소가 먼저, 그다음 메뉴 열기/닫기. 미확인 찌라시 결과(`tipSeen`)는 메뉴 점 `#menuDot` (`renderNav`).
- **900px 이하**: 데스크톱 CSS(`@media (min-width: 901px)`)가 꺼지고 기존 세로 스택(최대 520px), `--ui` 1. 글자 최소 크기 규칙은 똑같다.
- 레이아웃을 건드렸으면 1615×900, 1366×768, 1920×1080, 2560×1440, 1280×1024(2단), 모바일 폭(예: 390×844)에서 스크린샷으로 카드 잘림·겹침·시세 7행을 확인한다.

## 수정 후 검증 (필수)

코드를 수정했으면 **Playwright로 실제 동작을 확인**한다. 문법이 맞는지만 보고 끝내지 않는다.

1. `docs/demo`는 확장자가 없어 그대로 서빙하면 HTML로 인식되지 않는다. 임시 폴더에 `demo.html`로 복사해 로컬 서버로 띄운다:
   ```sh
   mkdir -p /tmp/site && cp docs/demo /tmp/site/demo.html && cp docs/engine.js /tmp/site/ && cp -r docs/assets /tmp/site/
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
- 시장은 TR룸 화면(`currentTab === 'play'`)에서, 장중(`run.phase === 'market'`)이고 찌라시·오버레이가 없을 때만 움직인다.
- 찌라시가 오면 선택 전까지 `tick()`이 멈추므로, 장을 끝까지 돌리는 반복문은 위 예시처럼 `resolveTip`으로 처리한다. 실시간으로 장을 돌려 보는 테스트에서 찌라시가 끼면 안 되면 `window.tipChance = () => 0;`으로 끈다.
