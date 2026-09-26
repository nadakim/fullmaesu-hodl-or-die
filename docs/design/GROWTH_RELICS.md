# 성장형 유물 (Growth Relics)

클로버핏식 누적 성장: 판이 진행될수록 스택이 쌓여 효과가 커지고, 조건에 걸리면 초기화돼 긴장감이 생긴다.
코드: `docs/engine.js` CONFIG "성장형 유물" 블록 + `RELICS` 끝 6종(`growth` 필드) + ENGINE `relicStacks`·`growRelic`·`resetRelic`·`shrinkRelic`·`noteManualSell`·`updateCombo`.
UI: `docs/demo` `enqueueRelicGrow`·`enqueueRelicBig`·`enqueueRelicShatter`·`growthTipHtml`. 점검: `node sim/growth-check.js`.

## 상태
- `run.relicState[id] = { stacks, best }` — `gainRelic`에서 만든다. `growth: 'count'`는 스택 개수, `'money'`(저금통)는 적립금(만원).
- 알림: 스택이 늘면 `emit('relicGrew', {id, stacks, delta})`, 줄면 `emit('relicReset', {id, lost, stacks, reason})`. 큰 지급은 `relicTriggered {big: true}`.

## 콤보 (엔진으로 옮김)
- `run.combo = {up, down}`, `tick`에서 반대매매 판정 뒤 `updateCombo()`: 직전 틱에도 있던 포지션들의 평가손익(`posPnl`) 합이
  오르면 up+1·down=0, 내리면 down+1·up=0, 포지션이 없거나 변화 0이면 유지 → `emit('comboChanged', {up, down})`. `rand()` 없음.
- 화면의 "상승/하락 콤보 ×n"은 이 값을 표시만 한다 (UI에서 세지 않는다).

## 6종

| id | 이름 | 등급 | 성장 | 효과 | 초기화 |
|---|---|---|---|---|---|
| moonSavings 📈 | 떡상 적금 | rare | 상승 콤보가 3·6·9…가 될 때마다 +1 (`MOON_COMBO_STEP` 3) | 스택당 모든 포지션 평가이익 +1% (`MOON_PNL_PER_STACK`) | 하락 콤보가 10(`MOON_RESET_DOWN`)이 되는 순간 0 |
| tearJar 🐷 | 개미의 눈물 저금통 | uncommon | 손실 청산마다 손실액 × 10% 적립 (`TEARJAR_RATE`, `closePosition`) | 상승 콤보가 5(`TEARJAR_PAYOUT_COMBO`)가 되면 전액 현금 지급 후 비움 | 반대매매 → 적립금 × 0.5 (`TEARJAR_MARGIN_KEEP`, 반대매매 손실 적립 뒤 적용) |
| traumaSurvivor 🩹 | 반대매매 생존자 | legendary | 반대매매마다 +1 (트라우마 카드는 그대로) | 스택당 레버리지(lev>1)·숏 포지션 평가이익 +3% (`TRAUMA_PNL_PER_STACK`) | 없음 |
| tipCollector 📂 | 찌라시 수집가 | rare | 찌라시 A를 고를 때마다 +1 (판정 뒤, 결과 무관) | 스택당 A 대박 확률 +2%p, 최대 +20%p (`TIPCOL_*`). 개미 커뮤니티와 합산, 상한 95% (`TIP_JACKPOT_CAP`) | B를 고르면 0 |
| diamondTree 🌳 | 존버 나무 | uncommon | 장 마감(이자 계산 뒤)마다 3일(`DTREE_DAYS`) 이상 보유 포지션 수만큼 + | 스택당 매일 이자 −1%, 최대 −60% (`DTREE_*`) | 그런 포지션을 직접 팔면(매도 버튼·전량 매도·탈출·손절/익절 카드) 한 번에 스택 절반 |
| compoundMonster 👹 | 복리 괴물 | mythic | 결산에서 목표 × 1.10 이상이면 +1 (`COMPOUND_EXCESS`) | 주 첫날(`startDay` day 1) 현금 += 순자산 × 1% × 스택 | 통과했지만 +10% 미만이면 −1 |

- 평가이익 보정(떡상 적금·반대매매 생존자)은 `relicAdjustedPnl`에서 기존 곱(존버의 인장·테마주 헌터) 뒤에 **%p를 합산해 한 번만** 곱한다
  (`out *= 1 + moonPct + traumaPct`) — 곱의 곱으로 폭주하지 않게. 평가손실엔 적용하지 않는다.
- 결산 체인 `buildSettlementSteps`에 유물별 `add` 단계("📈 떡상 적금 ×12스택 +12%")로 나오고, 마지막 값은 `relicAdjustedPnl`과 부동소수까지 같다 (3,564건 확인).
- 보상·암시장 풀에 그대로 포함 (`RELIC_RARITY_WEIGHTS`).

## 연출 (UI)
- 유물 바: 스택 배지(0이면 숨김), 발광 1~4 기본 · 5~9 초록 · 10~24 금색 · 25+ 무지개 (저금통은 금액 배지, 발광 없음). 툴팁에 현재 스택·효과·초기화·이번 판 최고.
- 소발동(tier 1, 시장 안 멈춤): 아이콘 1.5배 + "+N" + `relicTick`(10스택마다 한 옥타브 위, 최대 3옥타브). 같은 유물은 1초 안이면 하나로 합친다.
- 대발동(tier 3): 스택 5·10·25·50 도달, 저금통 지급, 복리 괴물·월급날·부모님 카드 지급 — 아이콘이 중앙으로 3.8배 → 회전 → "LV.10!" 도장 → 파티클 → 제자리. `relicLevelUp`(등급별 끝음).
- 초기화(tier 3): 중앙에서 금이 가며 산산조각 + 잃은 숫자 낙하 + "N스택 증발…" + `relicShatter`. 잃은 양이 클수록 크게.
- 개발자 콘솔: `__debug.giveRelic('moonSavings')`, `__debug.grow('moonSavings', 5)` (화면에 버튼 없음).
