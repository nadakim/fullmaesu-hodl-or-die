# 헤드리스 전략 시뮬레이터

`docs/engine.js`(CONFIG + ENGINE)를 Node에서 그대로 돌린다. 브라우저·Playwright·npm 의존성 없음.

```sh
node sim/runner.js                                   # 전략 6종 × 500판 (약 25초)
node sim/runner.js --n 2000 --seed 1 --strategies allIn3x,random --out sim/results/x.json
```

- `load-engine.js` — `docs/engine.js`를 `vm` 컨텍스트에 불러와 `E.run`, `E.playCard(...)`처럼 쓰게 한다.
- `strategies.js` — 전략 6종: `allIn3x` · `inverseHedge` · `shortSeller` · `manipSpam` · `gukbapDefense` · `random`(대조군). 장전 카드 사용, 찌라시 A/B, 보상·유물 우선순위, 암시장.
- `runner.js` — 한 판 = `setSeed` → `startNewRun` → (장전 → `startMarket` → `tick` 반복 → 결산 → 보상 → 암시장) × 주. 결과: 클리어·파산·목표미달 비율, 엔딩 16종 빈도, 주차별 탈락, 평균 반대매매·순자산 → 콘솔 표 + `results/*.json`.
- 같은 시드 = 같은 판. 전략들은 같은 시드 목록으로 돌아서 비교할 수 있다. 판마다 `E.eventLog`에 엔진 이벤트가 쌓인다 (리플레이·디버깅용).

## 해석 기준

**어떤 전략의 클리어율이 다른 전략보다 비정상적으로 높으면, 그 전략이 쓴 카드/유물이 너무 강하다는 뜻이다.** 먼저 그 전략의 `cardPick`·`relicPick` 목록을 의심한다.
반대로 `random`(대조군)보다 낮은 전략은 그 플레이 방식이 게임 안에서 손해라는 뜻이다. 러너는 클리어율이 0%, 90% 이상, 중앙값의 3배 이상인 전략에 ⚠를 붙인다.

기존 `tools/sim/sim.cjs`(봇 8종, Playwright)와 같은 엔진이다 — 같은 시드·같은 정책이면 결과가 한 판 단위로 일치한다.
