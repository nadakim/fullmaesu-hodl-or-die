# 반대매매 기준: 담보유지비율 (S7-14)

> MASTER_PLAN S7 (14). 2026-09-27 구현. 처음에는 `MAINTENANCE_MARGIN_ON = false`로 꺼 둔 채 머지했다. 같은 날 **사용자가 롱 140%·숏 130%로 확정해 켰다** (아래 '켠 뒤 시뮬').

## 왜

사용자 원안은 "2배는 증거금 50% 이하, 3배는 33% 이하"였다. 그런데 매수 직후 증거금률이 정확히 그 값이라서, 그대로 쓰면 사자마자 반대매매가 된다. 그래서 한국 신용거래의 **담보유지비율** 방식을 쓴다. 원안의 취지인 "레버리지가 높을수록 반대매매가 빨리 온다"는 이 방식으로 충족된다.

## 규칙 (플래그를 켰을 때)

| 방향 | 담보비율 | 반대매매 |
|---|---|---|
| 롱(신용) | 포지션 평가액 ÷ 빌린 돈 | `MAINTENANCE_RATIO` 140% 미만 |
| 숏(대차) | (원금 + 공매도 대금) ÷ 갚을 주식 평가액 | `SHORT_MAINTENANCE_RATIO` 130% 미만 |

- 1x 롱은 빌린 돈이 없으므로 반대매매가 없다 (지금과 같음).
- 🧊 콜드월렛: 대장코인·밈코인의 유지비율이 −15%p 낮아진다 (`RELIC_COLD_WALLET_MAINT_CUT`, 140% → 125%).
- 위험 표시: 담보비율 ÷ 유지비율(`marginHealth`)이 `MAINT_WARN_HEALTH` 1.15 미만이면 켠다.
- 포지션 막대: `marginHealth`를 0~2 구간으로 보여 준다. 반대매매 선은 가운데(50%) 지점이다.

반대매매가 나는 하락폭 (`/tmp` 실측, 가격만 움직였을 때):

| 포지션 | 기존 (증거금률 25%) | 담보유지비율 |
|---|---|---|
| 롱 2x | −33.4% | **−30.2%** |
| 롱 3x | −11.2% | **−6.8%** |
| 숏 1x | +60.2% | +54.0% |
| 숏 2x | +20.2% | +15.4% |

## 코드

- 엔진: `collateralRatio(p)`, `maintRatio(p)`, `marginHealth(p)`, `marginCalled(p)`, `marginWarn(p)`, `coldWalletSaved(p)`.
- `checkMarginCalls`와 UI(위험 표시·막대·툴팁 `marginText`·포지션 칸 안내 `#marginRuleText`)가 모두 이 함수들을 읽는다.
- 플래그가 꺼져 있으면 기존 증거금률 방식과 **결과 JSON이 완전히 같다** (`sim/runner.js`로 확인).

## 시뮬 (`sim/runner.js` 전략당 500판, 끔 → 켬)

`--set MAINTENANCE_MARGIN_ON=true`로 켜서 돌렸다. 결과 파일: `sim/results/baseline-before-s7-maintenance.json` → `after-s7-maintenance-on.json`.

| 전략 | 클리어 | 파산 | 반대매매/판 |
|---|---|---|---|
| levTowerBuild | 30.6% → 31.2% | 6.4% → 5.8% | 1.61 → 1.85 |
| allIn3x | 4.4% → 4.4% | 18.0% → 17.0% | 1.41 → 1.50 |
| shortSeller | 1.8% → 1.8% | 3.6% → 2.2% | 0.79 → 0.83 |
| manipSpam | 3.6% → 3.4% | 2.4% → 2.0% | 0.79 → 0.84 |
| random | 4.6% → 4.2% | 1.8% → 1.6% | 0.76 → 0.85 |
| growthFirst | 0.8% → 0.2% | 2.8% → 2.0% | 0.78 → 0.87 |
| deckThinner | 5.4% → 5.0% | 3.2% → 2.6% | 1.07 → 1.12 |
| antFlagBuild · inverseHedge · gukbapDefense · signalFollower · nothing | 변화 없음 (레버리지를 거의 안 씀) | | |

- 레버리지를 쓰는 전략은 반대매매가 판당 +0.05~0.24회 늘었다. 3x가 훨씬 빨리 털린다.
- 파산은 오히려 줄었다. 일찍 털려서 미수(빚)가 되기 전에 정리되기 때문이다.
- 클리어율 변화는 −0.6~+0.6%p로 작다.

## 켠 뒤 시뮬 (사용자 확정 140%·130%, 종목 13개·세력 매집 반영된 main 기준)

`sim/results/baseline-before-s7-maintenance-on.json` → `after-s7-maintenance-on-final.json`, 전략당 500판.

| 전략 | 클리어 | 파산 | 반대매매/판 |
|---|---|---|---|
| levTowerBuild | 34.2% → 34.8% | 7.0% → 6.8% | 1.73 → 1.90 |
| allIn3x | 3.8% → 3.6% | 17.4% → 17.4% | 1.41 → 1.51 |
| shortSeller | 2.4% → 2.6% | 3.0% → 3.0% | 0.86 → 0.90 |
| manipSpam | 8.4% → 7.6% | 3.2% → 2.8% | 0.97 → 0.98 |
| random | 8.0% → 6.8% | 3.2% → 2.4% | 0.99 → 1.11 |
| growthFirst | 3.0% → 2.2% | 2.2% → 1.8% | 0.94 → 1.04 |
| deckThinner | 7.4% → 7.4% | 3.0% → 3.8% | 1.13 → 1.28 |
| antFlagBuild · inverseHedge · gukbapDefense · signalFollower · nothing | 변화 없음 | | |
