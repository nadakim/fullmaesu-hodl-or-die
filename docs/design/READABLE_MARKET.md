# 읽을 수 있는 시장 (Readable Market)

목표: 운 게임을 **"내 판단이 맞았다/틀렸다"**로 느껴지는 게임으로. 클로버핏처럼 확률과 기대값을 투명하게 보여주되,
**보여주는 모든 숫자는 엔진이 실제로 쓰는 값**이다. 결과와 무관한 장식용 신호는 없다.

코드: `docs/engine.js` (CONFIG 상단 "읽을 수 있는 시장" 블록 + ENGINE `pickWeighted`~`tipExpectedValue`), UI `docs/demo` (`signalHtml`·`newsLine`·`cardEvView`·`tipEvHtml`).
검증: `node sim/signal-check.js` (표시 확률 = 실측), `node sim/runner.js` (전략 `signalFollower`).

## 1. 종목 추세 (regime) — 시그널의 정답

| 상태 | 뜻 | 틱당 추가 드리프트 `REGIME_DRIFT` | 하루(12틱) | 기타 |
|---|---|---|---|---|
| UP | 매수세 | +0.004 | +4.9% | |
| FLAT | 보합 | 0 | 0% | |
| DOWN | 매도세 | −0.004 | −4.7% | |
| HOT | 과열 | +0.002 | +2.4% | 갭**하락** 확률 × `GAP_HOT_MULT` = 2.5 |

- 인버스가 아닌 종목(beta > 0)만 추세를 가진다 (`assets[id].regime`, `regimeDays`). 인버스는 지수를 반대로 따른다 (기존 그대로).
- 가격: `updateAssetPrices(…, live)`에서 `STOCK_DRIFT` 위에 더한다 (장중 틱만. 판 시작 전 과거 시세 생성엔 안 씀).
- 전이: 장 마감 `endOfDay` → `nextRegimes()`, 행렬 `REGIME_TRANSITION` (행 = 오늘 → 내일 확률).
  UP이 `REGIME_UP_LONG_DAYS`(2)일 이상 이어지면 `UP_LONG` 행 (과열 25%).

| 오늘 \ 내일 | UP | FLAT | DOWN | HOT |
|---|---|---|---|---|
| FLAT | 20% | 60% | 20% | – |
| UP (첫날) | 60% | 20% | 10% | 10% |
| UP_LONG (2일+) | 50% | 15% | 10% | 25% |
| DOWN | 20% | 20% | 60% | – |
| HOT | – | 15% | 35% | 50% |

- 평균 지속 = 1 / (1 − 유지 확률): FLAT·DOWN 2.5일, UP 약 2.2일, HOT 2일.
- **정상 상태 분포** (UP을 첫날/2일+로 나눈 5상태 체인, πT = π 반복 풀이):
  π(FLAT) 0.3125 · π(UP) 0.2750 (= 0.1250 + 0.1500) · π(DOWN) 0.3125 · π(HOT) 0.1000.
  가중평균 드리프트 = 0.004×0.275 − 0.004×0.3125 + 0.002×0.1 = **+0.00005/틱** (`STOCK_DRIFT` 0.001의 5%) → 종목 기대수익은 이전과 거의 같다.
  판 시작 추세는 이 분포로 뽑는다 (`REGIME_START`).
- HOT의 추가 갭하락은 고변동 종목(초전도체·밈코인, 갭 크기 상한 90%)에서 크고 반도체전자·국밥제약에선 거의 없다 → 🔥는 "오르지만 위험" 신호.

## 2. 시그널

- 장전 `startDay` → `rollSignals()`: 종목마다 `rand()` 한 번. `SIGNAL_ACCURACY`(0.65) 확률로 실제 추세, 아니면 나머지 셋 중 하나(균등). `run.signals[id] = {shown, acc, revealed}` — 그날 고정 (다시 그려도 안 바뀐다).
- 표시: 시세판 행마다 `📈 매수세 / ➖ 보합 / 📉 매도세 / 🔥 과열` + `적중률 NN%` (엔진 `sg.acc`를 그대로).
- **적중률의 뜻**: P(표시 = 실제). "📈를 봤을 때 실제 UP일 확률"(사후 확률)과는 다르다 — 사후 확률은 추세 분포에 따라 달라진다 (예: 🔥는 실제 HOT이 드물어서 표시 🔥 중 실제 HOT 비율은 65%보다 낮다). 시세판 툴팁에 규칙을 그대로 적었다.
- 채점: 장 마감 `resolveSignals()` (추세 전이 **전**) → `run.signalResults`, `emit('signalsResolved')`. 다음 날 시세판에 `어제 ✓/✗`.
- 카드
  - **보조지표 42개** (일반, 0): 카드 2장 + 공개되지 않은 오늘 시그널을 적중률 +`SIGNAL_INDICATOR_BONUS`(20%p, 최대 100%)로 다시 판독(`rand()` 다시).
  - **애널리스트 리포트** (희귀, 1, 대상: 종목) 신규: 그 종목의 오늘 실제 추세 100% 공개 (`revealed`). "목표주가 3배, 발행 다음 날 매도 의견."

## 3. 다음 날 뉴스

- 장 마감 `endOfDay`에서 `pickNews()` → `run.newsTomorrow` (오늘 뉴스와 같은 것 제외 = 연속 금지). 판 시작 때도 하나 뽑는다.
- 다음 `startDay`: `run.newsToday`로 옮김. 개장 `startMarket`: 확정은 항상, 루머는 `NEWS_RUMOR_CHANCE`(0.6)로 판정 → `run.newsActive`, `emit('newsResolved')`. 불발이면 그날 효과 없음.
- 효과 (`newsEffectFor`, 사실일 때 그날 장중 틱 전부):
  `volMult` = 종목 고유 변동(와 캔들 꼬리) 배수 · `drift` = 틱당 로그수익률 추가 · `gapMult` = 갭 확률 배수(상승·하락 둘 다).
  `market` 대상은 전 종목, drift는 beta 부호를 따른다 (지금 데이터엔 market drift 없음). 지수 캔들 자체는 바꾸지 않는다.
- 표시: 장 마감 직후 배너 `📰 내일: …`, 장전 `📰 오늘 개장: …`, 개장 후 `📰 사실로 확인 / 루머로 판명`. 효과 수치(하루 환산 %)와 신뢰도(`확정` / `루머 60%`)를 함께. 손패 위 칩에도 같은 내용.
- 데이터 `NEWS_EVENTS` 15개 (`{ id, text, target, effect:{volMult, drift, gapMult}, reliability }`). 새 뉴스는 여기에만 추가.

## 4. 기대값 (EV)

순수 함수 (`rand()` 없음, 상태 안 바꿈), 단위 만원.

| 대상 | 식 | 표시 |
|---|---|---|
| 리딩방 찌라시 | p × 11% − (1 − p) × 15%, p = `pumpUpChance()` (VIP 80%) → 기본 +3.2%, VIP +5.8% | 카드 `EV +3.2%`, 툴팁에 보유 종목별 ₩ |
| 작전 세력 | 1.2 × 0.88 − 1 = +5.6% (오늘 +20% 확정, 내일 개장 −12% 갭, 이틀 보유) | 카드 `EV +5.6%` |
| 비둘기·매파·CEO 트윗 | Σ 장세 확률 × 보유 포지션 영향 − 지금 대기 중인 카드(없으면 평상시)의 같은 값 | 카드 `EV ±₩N만` |
| 찌라시 선택지 A/B | Σ 결과 확률(`tipChances`, 개미 커뮤니티 반영) × 순자산 변화 (현금 × `tipScale`, 매수 후 충격, 작전 드리프트 남은 틱, 장세 변화) | `EV 순자산 ±₩N만 · 비자금 +N` |

- 장세 영향 = 보유 포지션마다 dir × 노출액 × (exp(beta × `IDX_SENS` × `STOCK_MOVE_MULT` × 지수 기대수익) − 1), 지수 기대수익 = 틱 × (`INDEX_STATE` 드리프트 + (0.5 − `INDEX_TICK_CENTER`) × 40 × 변동 배수) / 지수.
  1차 근사다: 갭·다음 날 되돌림·유물 손익 보정(국밥 정신 등)·장중 랜덤 이벤트는 넣지 않았다 (툴팁에 명시).
- 음수 EV도 숨기지 않고 빨간색 (`.c-ev.neg`, `.ch-ev.neg`).
- 확률 표시 정정: 찌라시 선택지 확률은 이제 `tipChances`(개미 커뮤니티 반영), 리딩방 카드 설명은 `cardDesc`(리딩방 VIP 반영) — 이전엔 유물이 있어도 기본 확률을 보여줬다.

## 5. 검증 결과 (시드 1~, `sim/signal-check.js` random 300판)

| 표시 | 실측 |
|---|---|
| 시그널 적중률 65% | 65.0% (18,184개) |
| 보조지표 후 85% | 84.8% (8,313개) |
| 애널리스트 100% | 100.0% |
| 루머 60% | 60.1% (2,859개) |
| 확정 100% | 100.0% |

실제 추세별 그날 등락률 중앙값: UP +6.9% · FLAT +2.2% · DOWN −2.8% · HOT +4.2% (지수 상승 편향 포함).

## CONFIG 값 요약

`REGIMES` · `REGIME_DRIFT` {UP 0.004, FLAT 0, DOWN −0.004, HOT 0.002} · `GAP_HOT_MULT` 2.5 · `REGIME_UP_LONG_DAYS` 2 · `REGIME_TRANSITION` · `REGIME_START` ·
`SIGNAL_ACCURACY` 0.65 · `SIGNAL_INDICATOR_BONUS` 0.20 · `NEWS_RUMOR_CHANCE` 0.6 · `NEWS_EVENTS` · `INDEX_STATE` · `INDEX_TICK_RANGE` 40
