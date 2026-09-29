/* 연출 고조(juice-escalation) 빈도 점검: 봇 한 판 동안 '가장 센 연출'이 몇 번 나오는지 센다.
   엔진 이벤트를 UI(docs/demo)와 같은 규칙으로 따라간다 — 암전(정산 무대에서 이번 판 최고 정산을 갱신하는 곱하기 단계, 하루 1번),
   첫 단위 돌파 도장(정산 무대 금액·주간 결산 체인이 이번 판 처음 닿은 단위, 억부터), JACKPOT(수익 콤보 12 도달), 콤보 슬램(c3 이상 단계 오름).
   UI 전용 연출이라 엔진 결과는 바꾸지 않는다 (읽기만).
   사용: node sim/juice-peaks.js [--n 200] [--strategies levTowerBuild,antFlagBuild,...]  */
const loadEngine = require('./load-engine.js');
const STRATEGIES = require('./strategies.js');
const { playGame } = require('./runner.js');

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +arg('n', 200), BEST_FACTOR = +arg('bestFactor', 5);   // 직전 최고의 이 배수를 넘어야 암전 (UI JUICE_CONFIG.bestBreakFactor와 같게)
const names = (arg('strategies', '') || Object.keys(STRATEGIES).filter(k => STRATEGIES[k] && STRATEGIES[k].premarket).join(',')).split(',').filter(Boolean);

// docs/demo JUICE_CONFIG와 같은 값 (바꾸면 같이)
const MAX_ROWS = 4, UNIT_FIRST_FROM = 1, COMBO_TIERS = [3, 5, 8, 12], COMBO_SLAM_FROM = 3, CHAIN_MAX_ROWS = 4, CHAIN_TOP_ROWS = 3;
const unitIdx = v => { v = Math.abs(v); return v < 10000 ? 0 : Math.floor(Math.log10(v) / 4 + 1e-12); };
const comboTier = n => n <= 0 ? 0 : 1 + COMBO_TIERS.filter(t => n >= t).length;

function countGame(E, strat, seed){
  const c = { blackout: 0, firstUnit: 0, jackpot: 0, slam: 0, stages: 0, days: 0 };
  let best = 0, unitMax = 0, combo = 0, tier = 0;
  const hit = () => { combo++; const t = comboTier(combo); if(t > tier && t >= 2){ if(t >= COMBO_SLAM_FROM) c.slam++; if(t >= 5) c.jackpot++; } tier = t; };
  const brk = () => { combo = 0; tier = 0; };
  const unit = (from, to) => { const a = unitIdx(from), b = unitIdx(to); if(b > a && to > 0 && b > unitMax && b >= UNIT_FIRST_FROM){ unitMax = b; c.firstUnit++; } };
  E.setEventListener((type, d) => {
    const run = E.run;
    switch(type){
      case 'comboChanged': if(d.up > 0) hit(); else if(d.down > 0) brk(); break;
      case 'sold': case 'soldAll': case 'orderFilled': if(d.pnl >= 0.5) hit(); else if(d.pnl <= -0.5) brk(); break;
      case 'marginCall': brk(); break;
      case 'gap': case 'gapOpen': { const held = run.positions.filter(p => p.assetId === d.stockId); if(held.length){ if(held.some(p => p.dir * d.pct < 0)) brk(); else hit(); } break; }
      case 'tipResolved': if(d.delta > 0) hit(); else if(d.delta < 0) brk(); break;
      case 'daySettled': {
        c.days++;
        if(d.payout >= 0.5) hit();
        const eligible = d.day < E.DAYS_PER_ROUND && d.settlement.some(r => r.steps.length > 1 && Math.abs(r.payout) >= 0.5);   // 결산 연출 켬 기준 · 전체 무대만 (보정 없는 날의 간이 무대는 암전·도장이 없다)
        if(!eligible) break;
        c.stages++;
        let rows = d.settlement.filter(r => Math.abs(r.payout) >= 0.5);
        if(rows.length > MAX_ROWS) rows = rows.slice().sort((a, b) => Math.abs(b.payout) - Math.abs(a.payout)).slice(0, MAX_ROWS);
        const prevBest = best;
        best = Math.max(best, Math.abs(d.payout));
        let paid = 0, done = false;
        rows.forEach(r => {
          r.steps.slice(1).forEach(st => {
            if(!done && st.kind !== 'add' && prevBest > 0 && paid + st.runningChips * st.runningMult - r.base > prevBest * BEST_FACTOR){ done = true; c.blackout++; }
          });
          const last = r.steps[r.steps.length - 1];
          unit(r.base, last.runningChips * last.runningMult);
          paid += r.payout;
        });
        break;
      }
      case 'roundClear': {   // 주간 결산 체인 카운트업 (보정 있는 행만 재생)
        let rows = d.settlementChain || [];
        if(rows.length > CHAIN_MAX_ROWS) rows = rows.slice().sort((a, b) => Math.abs(b.finalPnl) - Math.abs(a.finalPnl)).slice(0, CHAIN_TOP_ROWS);
        rows.filter(r => r.steps.length > 1).forEach(r => { let prev = 0; r.steps.forEach(st => { unit(prev, st.runningTotal); prev = st.runningTotal; }); });
        break;
      }
    }
  });
  const g = playGame(E, strat, seed);
  E.setEventListener(null);
  return Object.assign(c, { weeks: g.weeksCleared, win: g.endReason === 'VICTORY' || g.endCause === 'VICTORY' });
}

const E = loadEngine();
const rows = [];
names.forEach(name => {
  const strat = STRATEGIES[name];
  if(!strat) return;
  const gs = [];
  for(let s = 1; s <= N; s++) gs.push(countGame(E, strat, s));
  const avg = k => gs.reduce((a, g) => a + g[k], 0) / gs.length;
  const perStage = gs.reduce((a, g) => a + g.blackout, 0) / Math.max(1, gs.reduce((a, g) => a + g.stages, 0));
  rows.push({ name, days: avg('days'), stages: avg('stages'), blackout: avg('blackout'), perStage, firstUnit: avg('firstUnit'), jackpot: avg('jackpot'), slam: avg('slam'),
              maxBlackout: Math.max(...gs.map(g => g.blackout)), maxJackpot: Math.max(...gs.map(g => g.jackpot)) });
});
const f = (v, d = 2) => v.toFixed(d);
console.log(`| 전략 | 장 마감/판 | 정산 무대/판 | 암전/판 (최대) | 암전/무대 | 첫 단위 도장/판 | JACKPOT/판 (최대) | 콤보 슬램/판 |`);
console.log(`|---|---|---|---|---|---|---|---|`);
rows.forEach(r => console.log(`| ${r.name} | ${f(r.days, 1)} | ${f(r.stages, 1)} | ${f(r.blackout)} (${r.maxBlackout}) | ${(r.perStage * 100).toFixed(0)}% | ${f(r.firstUnit)} | ${f(r.jackpot)} (${r.maxJackpot}) | ${f(r.slam)} |`));
