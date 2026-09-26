# 암시장 경제 (Shop Economy)

## 화폐: 비자금 (`run.slush`)
- 순자산과 별개, 암시장 전용. 적립: 주간 결산 통과 시 `slushEarned` = `SLUSH_WEEKLY_BASE`(500) + 목표 초과분 × `SLUSH_EXCESS_RATE`(0.25), 찌라시 B 선택 `TIP_SLUSH_SAFE`(80).

## 가격 공식 (`docs/engine.js`)
```
shopPrice(basePrice, category) = round(basePrice × (1 + SHOP_INFLATION[category] × (run.round − 1)) / 10) × 10
SHOP_INFLATION = { pack: 0.12, single: 0.12, relic: 0.10, remove: 0.0, reroll: 0.0 }
```
- 암시장은 주간 결산 뒤(다음 주 시작 전)에 열리므로 `run.round` = 방금 통과한 주. 1주차 결산 뒤 = 기본가, 7주차(마지막 암시장) = 팩·낱장 ×1.72, 유물 ×1.60.
- 가격은 전부 헬퍼로만 읽는다: `packPrice(pk)`, `singlePrice(id)`, `relicPrice(id)`, `shopRemoveCost()` (제거는 기존 `SHOP_REMOVE_BASE` + `SHOP_REMOVE_PER_WEEK` × (주차 − 1), 인플레이션 0). 기본가 상수(`SHOP_PACKS[].price`·`SHOP_SINGLE_PRICE`·`RELIC_PRICE`)를 직접 읽는 곳은 이 헬퍼뿐이다.
- 이번 주 인상률 `shopInflation(category)` — 화면의 "(▲36%)"와 상단 "물가 상승률: 1주차 대비 +36%"가 이 값을 그대로 쓴다.

| 항목 | 기본가 | 4주차 | 7주차 |
|---|---|---|---|
| 잡코인 팩 | 250 | 340 | 430 |
| 주도주 팩 | 500 | 680 | 860 |
| 파산각 팩 | 666 | 910 | 1150 |
| 낱장 일반/고급/희귀/전설/신화 | 300/500/750/1100/1800 | 410/680/1020/1500/2450 | 520/860/1290/1890/3100 |
| 유물 일반/고급/희귀/전설/신화 | 900/1300/1700/2200/3000 | 1170/1690/2210/2860/3900 | 1440/2080/2720/3520/4800 |

## 점검 (`node sim/runner.js` → "주차별 암시장 비자금" 표)
판마다 `shop[]` = { week, income, entry, spent, exit, buys, cheapest }. 2026-09-26 도입 시점 결과는 CHANGELOG·작업 보고 참고:
7주차 평균 입장 잔액으로 가장 싼 항목(430)을 12~190개 살 수 있다 → 붕괴 없음. 구매 수는 거의 그대로 — 지금 암시장은 돈이 아니라 공급(낱장 주 1장·유물 진열 1개)이 병목이다.
