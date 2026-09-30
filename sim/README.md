# 헤드리스 전략 시뮬레이터

`docs/engine.js`(CONFIG + ENGINE)를 Node에서 그대로 돌린다. 브라우저·Playwright·npm 의존성 없음.

```sh
node sim/runner.js                                   # 전략 8종 × 500판 (약 45초)
node sim/signal-check.js [--n 300] [--strategy random]   # 시그널 적중률·루머 판정 실측 (표시 확률 = 실제 확률)
node sim/growth-check.js [--n 300]                       # 성장형 유물 1개 강제 지급 vs 미지급 클리어율·스택 (폭주 점검)
node sim/boss-check.js 켬.json 끔.json [--md out.md]      # 보스별 생존율 vs 보스 없는 대조군 · 전략별 가장 치명적인 보스 (끔 = --set BOSS_WEEKS_ON=false)
node sim/runner.js --n 2000 --seed 1 --strategies allIn3x,random --out sim/results/x.json
node sim/runner.js --targets 10200,10800,11500,12300,13200,14300,15600,17100   # 목표 곡선 실험
node sim/runner.js --set 'GAP_CHANCE_PER_RISK=0.02;RELIC_PAYDAY_BASE=60'        # CONFIG 상수 실험 (파일 수정 없음)
node sim/runner.js --engine /tmp/before/engine.js                                # 변경 전 엔진 (git show HEAD:docs/engine.js)
node sim/compare.js sim/results/전.json sim/results/후.json                        # 전후 비교 마크다운 표 (클리어·파산·생존 주·반대매매·최고 순자산 분포·정산 배수)
```

- `load-engine.js` — `docs/engine.js`를 `vm` 컨텍스트에 불러와 `E.run`, `E.playCard(...)`처럼 쓰게 한다.
- `strategies.js` — 전략 6종: `allIn3x` · `inverseHedge` · `shortSeller` · `manipSpam` · `gukbapDefense` · `signalFollower`(시그널·뉴스 추종, 찌라시는 기대값 높은 쪽) · `growthFirst`(random + 성장형 유물 최우선) · `sectorAllIn`(N3 — 암호화폐 리포트 우선·신용으로 대장코인만·리서치 팩, 게임 기록 `sectorMax` = 판 끝 최고 섹터 레벨) · 대조군 `random`(무작위)·`nothing`(카드 0장). 장전 카드 사용, 찌라시 A/B, 보상·유물 우선순위, 암시장.
  - 규칙 파괴형 유물(RULE_BREAKER_RELICS.md): `ruleBreakerBuild`(10종 전부 우선 — 비교용) · 아키타입 `oathHold`(존버 서약서·물타기, 안 판다) · `yoloLoanLev`(영끌 대출·레버리지 탑, 위험 포지션 장중 선매도) · `cultFocus`(교주·몰아주기·막차, 칸 순서 순열 탐색 `bestArrange`) · `cashGangMin`(무소유 + 정예 2칸) · `scalperBot`(단타 중독, 장중 매도 정산).
  - 빌드 카운터 보스(보류 — `BOSS_COUNTERS_ON` 기본 꺼짐, 켜서 잴 때는 `--set BOSS_COUNTERS_ON=true`): `boss-check.js`가 표적/비표적 표를 붙인다(`sim/boss-split.js`) · 대비책 실험 `node sim/boss-counter-check.js --plan DIR [--n 800] [--set ...]`으로 명령 목록 → 실행 → `node sim/boss-counter-check.js DIR` · 러너 `--boss-adapt 1`(카운터 주 대비 행동). `docs/design/BOSS_WEEKS.md` '빌드 카운터'.
  - 밸런스 지표 `node sim/metrics.js 결과.json` (운 의존도·주간 여유·성장·상점·천장, `docs/design/BALANCE_METRICS.md`) · 러너 `--force-relics id,id` (판 시작 장착) · `compare.js`/`boss-check.js --metrics`. 게임 기록 `xmultWeek`·`weekStartEq`·`shop[].meaningful`.
  - 전략 훅 (선택, 없으면 전과 같은 결과): `market(E, rng)` 장중 틱 직전(매도 등) · `relicFilter(E, id)` 유물 보상 후보 거르기 · `arrange(E)` 암시장 뒤 칸 정렬(기본 `arrangeRelics`). 게임 기록 `relicsEver`(한 번이라도 가진 유물)·`weekRelics[k]`(k+1주차 시작 때 유물).
- `runner.js` — 한 판 = `setSeed` → `startNewRun` → (장전 → `startMarket` → `tick` 반복 → 결산 → 보상 → 암시장) × 주. 결과: 클리어·파산·목표미달 비율, 엔딩 16종 빈도, 주차별 통과율·탈락, 판마다 주간 결산 순자산 `weekEq`, 평균 반대매매·순자산, 장 마감 정산 지표(판당 최고 순자산 분포 중앙값·상위 10%·최대, 하루 최대 정산 배수 `maxSettleMult`, 판당 정산 보너스 `settledTotal`) → 콘솔 표 + `results/*.json`.
- `juice-peaks.js` — 연출 고조 빈도: 봇 판마다 엔진 이벤트를 UI 규칙대로 따라가 '가장 센 연출'(최고 정산 갱신 암전·첫 단위 도장·JACKPOT·콤보 슬램)을 센다. `--bestFactor N` = 암전 문턱 조정안 실험 (JUICE_BIBLE.md).
- `compare.js` — 결과 JSON 두 개를 판 목록(games)에서 다시 계산해 전후 비교 마크다운 표로 (PR 보고용, 옛 결과 파일도 됨).
- 같은 시드 = 같은 판. 전략들은 같은 시드 목록으로 돌아서 비교할 수 있다. 판마다 `E.eventLog`에 엔진 이벤트가 쌓인다 (리플레이·디버깅용).

## 해석 기준

**어떤 전략의 클리어율이 다른 전략보다 비정상적으로 높으면, 그 전략이 쓴 카드/유물이 너무 강하다는 뜻이다.** 먼저 그 전략의 `cardPick`·`relicPick` 목록을 의심한다.
반대로 `random`(대조군)보다 낮은 전략은 그 플레이 방식이 게임 안에서 손해라는 뜻이다. 러너는 클리어율이 0%, 90% 이상, 중앙값의 3배 이상인 전략에 ⚠를 붙인다.

기존 `tools/sim/sim.cjs`(봇 8종, Playwright)와 같은 엔진이다 — 같은 시드·같은 정책이면 결과가 한 판 단위로 일치한다.
