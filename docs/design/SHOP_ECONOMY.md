# 암시장 경제 (Shop Economy)

## 화폐: 비자금 (`run.slush`)
- 순자산과 별개, 암시장 전용. 적립: 주간 결산 통과 시 `slushEarned` = `SLUSH_WEEKLY_BASE`(500) + 목표 초과분 × `SLUSH_EXCESS_RATE`(0.25), 찌라시 B 선택 `TIP_SLUSH_SAFE`(80).

## 가격 공식 (`docs/engine.js`)
```
shopPrice(basePrice, category) = round(basePrice × (1 + SHOP_INFLATION[category] × (run.round − 1)) / 10) × 10
SHOP_INFLATION = { pack: 0.12, single: 0.12, relic: 0.10, remove: 0.0, reroll: 0.0 }
```
- 암시장은 주간 결산 뒤(다음 주 시작 전)에 열리므로 `run.round` = 방금 통과한 주. 1주차 결산 뒤 = 기본가, 7주차(마지막 암시장) = 팩·낱장 ×1.72, 유물 ×1.60.
- 가격은 전부 헬퍼로만 읽는다: `packPrice(pk)`, `singlePrice(id)`, `relicPrice(id)`, `removeCost(n)`·`shopRemoveCost()` (아래 카드 제거). 기본가 상수(`SHOP_PACKS[].price`·`SHOP_SINGLE_PRICE`·`RELIC_PRICE`)를 직접 읽는 곳은 이 헬퍼뿐이다.
- 이번 주 인상률 `shopInflation(category)` — 화면의 "(▲36%)"와 상단 "물가 상승률: 1주차 대비 +36%"가 이 값을 그대로 쓴다.

| 항목 | 기본가 | 4주차 | 7주차 |
|---|---|---|---|
| 잡코인 팩 | 250 | 340 | 430 |
| 주도주 팩 | 500 | 680 | 860 |
| 파산각 팩 | 666 | 910 | 1150 |
| 낱장 일반/고급/희귀/전설/신화 | 300/500/750/1100/1800 | 410/680/1020/1500/2450 | 520/860/1290/1890/3100 |
| 유물 일반/고급/희귀/전설/신화 | 900/1300/1700/2200/3000 | 1170/1690/2210/2860/3900 | 1440/2080/2720/3520/4800 |

## 카드 제거 (누진 비용, 횟수 제한 없음)
```
removeCost(n) = round10( (SHOP_REMOVE_BASE + SHOP_REMOVE_PER_WEEK × (round − 1)) × SHOP_REMOVE_ESCALATION ^ n )
SHOP_REMOVE_BASE = 400, SHOP_REMOVE_PER_WEEK = 200, SHOP_REMOVE_ESCALATION = 1.6
n = 이번 주에 이미 제거한 횟수 (run.shop.removed, openShop에서 0) · 다음 제거 = shopRemoveCost() = removeCost(run.shop.removed)
```
- 주 1회 제한(`SHOP_REMOVE_LIMIT`)은 없앴다 — 제한은 덱 최소 장수 `MIN_DECK_SIZE`(5)뿐. 비용 공식은 `removeCost` 한 곳.
- 이유: 횟수 제한 대신 누진 비용으로 덱 압축 속도를 조절하면, 비자금을 제거에 몰지 유물·낱장에 쓸지 고르는 긴장감이 생긴다.
- 1주차 400 → 640 → 1,020 → 1,640 → 2,620 · 4주차 1,000 → 1,600 → 2,560 · 7주차 1,600 → 2,560 → 4,100.
- 화면: 제목 "카드 제거 — 이번 주 N회 제거 · 다음 제거 💼 …", 다음 세 단계 가격, 제거 직후 다음 가격 숫자 펀치(빨강).

### ⚠ 얇은 덱 무한 루프 (미해결, 2026-09-26)
- 덱이 6~11장이면 0 행동력·소멸 없는 드로우 카드(보조지표 42개, 행동력을 돌려주는 테마 순환매)가 계속 손패로 돌아와 장전에 끝없이 쓸 수 있다.
- 배당주 마인드(0 행동력, 포지션당 +80만)와 함께면 무한 현금: 300번 사용 → +19,520만 (재현: 덱 [보조지표, 배당주 마인드, 반도체, 대장코인, 신용] + 포지션 2개).
- 주 1회 제한일 땐 판 끝까지 이 두께에 닿기 어려웠지만, 무제한 제거로 몇 주 만에 도달 가능. 극단 압축 봇은 7주차 평균 덱 9.2장, 500판 중 60판이 8장 이하로 끝났다.
- 시뮬레이터 random 계열 봇은 하루 `SIM_MAX_PLAYS_PER_DAY`(60)장에서 멈춘다 (안전장치, 보통 판엔 닿지 않음).

## 진열 새로고침 (리롤)
```
rerollCost(kind, n) = round10( SHOP_REROLL_BASE[kind] × (1 + SHOP_REROLL_WEEK_GROWTH × (round − 1)) × SHOP_REROLL_ESCALATION ^ n )
SHOP_REROLL_BASE = { single: 100, relic: 250 }, SHOP_REROLL_WEEK_GROWTH = 0.15, SHOP_REROLL_ESCALATION = 1.5
n = 이번 주 그 종류 새로고침 횟수 (run.shop.rerolls[kind], openShop에서 0) · 다음 비용 = shopRerollCost(kind)
```
- 엔진 `rerollShop(kind)` (무작위는 이 안에서만) → `emit('shopRerolled', {kind, cost, n})`. 판정 `rerollAvailable(kind)`는 순수 함수.
- 낱장: 안 산 칸만 `rollRewards`로 다시 뽑는다 (덱에 있는 카드·산 카드 제외, 신화 한도 그대로). 산 칸은 앞으로 모이고 '구매 완료' 유지.
- 유물: `rollRelics(RELIC_SHOP_COUNT, 지금 진열)` — 보유·지금 진열을 빼고 다시. 새로 들여올 유물이 없으면 비활성.
- 1주차 낱장 100 → 150 → 230 → 340, 유물 250 → 380 → 560 · 4주차 낱장 150, 유물 360 · 7주차 낱장 190, 유물 480.
- 화면: 섹션 제목 오른쪽 "🔄 새로고침 💼 …" + "다음 A → B", 뒤집혀 사라지고 새 진열이 뒤집히며 등장(flip-card), `shopShuffle` 효과음, 가격 숫자 펀치.
- 도입 결과(2026-09-26): 선호 유물을 노리는 봇이 암시장 지출의 50~81%를 새로고침에 쓰고, 선호 유물 보유 +0.04~0.43개/판, 1순위 보유율 최대 +10%p(manipSpam 25.8 → 35.8%), 클리어 +0~1.6%p. 쌓이기만 하던 비자금의 주요 소비처가 됐다.

## 낱장
- 주당 구매 한도(`SHOP_SINGLE_LIMIT`)를 없앴다. 진열(`SHOP_SINGLE_MIN`~`MAX`장)에 있고 덱에 없으면 비자금이 되는 만큼 산다.

## 점검 (`node sim/runner.js` → "주차별 암시장 비자금" 표)
판마다 `shop[]` = { week, income, entry, spent, exit, buys, cheapest }. 2026-09-26 도입 시점 결과는 CHANGELOG·작업 보고 참고:
7주차 평균 입장 잔액으로 가장 싼 항목(430)을 12~190개 살 수 있다 → 붕괴 없음. 구매 수는 거의 그대로 — 지금 암시장은 돈이 아니라 공급(낱장 주 1장·유물 진열 1개)이 병목이다.
