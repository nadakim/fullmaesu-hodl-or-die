#!/usr/bin/env node
/* 헤드리스 밸런스 시뮬레이터 — docs/engine.js를 Node에서 그대로 돌린다 (브라우저·Playwright 없음).
   node sim/runner.js [--n 500] [--seed 1] [--strategies allIn3x,random] [--out sim/results/xxx.json]

   한 판: setSeed(시드) → startNewRun() → [장전: 전략이 카드 사용 → startMarket() → tick() 반복(찌라시는 전략이 resolveTip)
          → 결산 보상(chooseReward·chooseRelicReward) → 암시장(buy*·leaveShop)] × 주 → phase 'over'
   같은 시드 = 같은 판 (엔진 rand()). 전략 자체의 무작위는 시드에서 파생한 별도 난수라 게임 난수 흐름과 섞이지 않는다.

   ── 해석 기준 ──
   전략들은 같은 시드 목록(같은 시장·같은 손패 순서)으로 돈다. 어떤 전략의 클리어율이 다른 전략보다 비정상적으로 높다면,
   그 전략이 쓴 카드/유물이 과하게 강하다는 뜻이다 (전략의 cardPick·relicPick 목록을 먼저 의심할 것).
   반대로 random(대조군)보다 낮은 전략은 그 플레이 방식이 게임 안에서 손해라는 뜻이다. */
const fs = require('fs');
const path = require('path');
const loadEngine = require('./load-engine.js');
const STRATEGIES = require('./strategies.js');

// classifyEnd가 내는 엔딩 16종 (UI의 ENDINGS와 같은 키)
const END_CAUSES = {
  win:  ['VICTORY'],
  bust: ['YOLO_BUST', 'MARGIN_CALL', 'SHORT_SQUEEZE', 'DEBT_SPIRAL'],
  miss: ['SIDELINED', 'ROUND_TRIP', 'NEAR_MISS', 'LIQ_ADDICT', 'FSS_FINED', 'TIP_VICTIM', 'INTEREST_DRAIN',
         'HODL_FAIL', 'PANIC_SELL', 'TOO_SLOW', 'SLOW_BLEED']
};
const ALL_CAUSES = [].concat(END_CAUSES.win, END_CAUSES.bust, END_CAUSES.miss);
const MAX_STEPS = 200000;   // 무한 루프 방지 (한 판은 보통 수백 걸음)

function parseArgs(argv){
  const o = { n: 500, seed: 1, strategies: Object.keys(STRATEGIES), out: '' };
  for(let i = 0; i < argv.length; i += 2){
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if(k === 'n' || k === 'seed') o[k] = parseInt(v, 10);
    else if(k === 'strategies') o.strategies = v.split(',');
    else if(k === 'out') o.out = v;
    else throw new Error('알 수 없는 옵션: ' + argv[i]);
  }
  o.strategies.forEach(s => { if(!STRATEGIES[s]) throw new Error('알 수 없는 전략: ' + s); });
  return o;
}

function mulberry32(seed){
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickReward(strat, choices, priority, rng, fallbackFirst){
  if(strat.randomPicks) return rng() < 0.8 && choices.length ? choices[Math.floor(rng() * choices.length)] : '';
  const hit = priority.find(id => choices.indexOf(id) >= 0);
  return hit || (fallbackFirst && choices.length ? choices[0] : '');
}

function playGame(E, strat, seed){
  const rng = mulberry32(seed ^ 0x9E3779B9);
  E.setSeed(seed);
  E.startNewRun();
  const run = () => E.run;
  let steps = 0;
  while(run().phase !== 'over'){
    if(++steps > MAX_STEPS) throw new Error(`시드 ${seed}: ${MAX_STEPS}걸음 안에 끝나지 않음 (phase ${run().phase})`);
    const phase = run().phase;
    if(phase === 'premarket'){
      strat.premarket(E, rng);
      E.startMarket();
    } else if(phase === 'market'){
      if(run().pendingTip) E.resolveTip(strat.tip(E, rng));
      else E.tick();
    } else if(phase === 'reward'){
      if(run().rewardStep === 'card'){
        const id = pickReward(strat, run().rewardChoices, strat.cardPick || [], rng, false);
        E.chooseReward(id ? 'take' : 'skip', id);
      } else {
        E.chooseRelicReward(pickReward(strat, run().relicChoices, strat.relicPick || [], rng, true));
      }
    } else if(phase === 'shop'){
      strat.shop(E, rng);
      E.leaveShop();
    } else throw new Error('알 수 없는 phase: ' + phase);
  }
  const r = run();
  return {
    seed, round: r.round, day: r.day, endReason: r.endReason, endCause: r.endCause,
    endEquity: Math.round(r.endEquity), peakEquity: Math.round(r.peakEquity), liquidations: r.liquidations,
    weeksCleared: r.weeksCleared, relics: r.relics.slice(), deckSize: r.masterDeck.length
  };
}

function summarize(games, maxRound){
  const n = games.length;
  const count = f => games.filter(f).length;
  const avg = f => games.reduce((s, g) => s + f(g), 0) / n;
  const causes = {};
  ALL_CAUSES.forEach(c => { causes[c] = 0; });
  games.forEach(g => { causes[g.endCause] = (causes[g.endCause] || 0) + 1; });
  const deathsByWeek = {};   // 몇 주차 결산·장중에 끝났는지 (승리 제외)
  for(let w = 1; w <= maxRound; w++) deathsByWeek[w] = 0;
  games.filter(g => g.endReason !== 'VICTORY').forEach(g => { deathsByWeek[g.round]++; });
  return {
    n,
    clearRate: count(g => g.endCause === 'VICTORY') / n,
    bustRate: count(g => END_CAUSES.bust.indexOf(g.endCause) >= 0) / n,
    missRate: count(g => END_CAUSES.miss.indexOf(g.endCause) >= 0) / n,
    avgWeeksCleared: avg(g => g.weeksCleared),
    avgLiquidations: avg(g => g.liquidations),
    avgEndEquity: avg(g => g.endEquity),
    avgPeakEquity: avg(g => g.peakEquity),
    avgRelics: avg(g => g.relics.length),
    avgDeckSize: avg(g => g.deckSize),
    causes, deathsByWeek
  };
}

const pct = x => (100 * x).toFixed(1) + '%';

function main(){
  const opt = parseArgs(process.argv.slice(2));
  const E = loadEngine();
  const maxRound = E.MAX_ROUND;
  const seeds = Array.from({ length: opt.n }, (_, i) => opt.seed + i);
  const results = {}, games = {};
  const t0 = Date.now();
  for(const name of opt.strategies){
    games[name] = seeds.map(s => playGame(E, STRATEGIES[name], s));
    results[name] = summarize(games[name], maxRound);
    process.stderr.write(`  ${name}: ${opt.n}판 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  }

  console.log(`\n== 전략별 요약 (전략당 ${opt.n}판, 시드 ${opt.seed}~${opt.seed + opt.n - 1}, ${maxRound}주 클리어 = VICTORY) ==`);
  console.table(Object.fromEntries(opt.strategies.map(s => { const r = results[s]; return [s, {
    '클리어': pct(r.clearRate), '파산': pct(r.bustRate), '목표미달': pct(r.missRate),
    '평균 생존 주': r.avgWeeksCleared.toFixed(2), '반대매매/판': r.avgLiquidations.toFixed(2),
    '최종 순자산': Math.round(r.avgEndEquity), '최고 순자산': Math.round(r.avgPeakEquity),
    '유물': r.avgRelics.toFixed(1), '덱': r.avgDeckSize.toFixed(1) }]; })));

  console.log('== 엔딩(endCause)별 발생 수 ==');
  console.table(Object.fromEntries(ALL_CAUSES.map(c => [c, Object.fromEntries(opt.strategies.map(s => [s, results[s].causes[c]]))])));

  console.log('== 주차별 탈락 수 (그 주에 파산하거나 결산 미달) ==');
  console.table(Object.fromEntries(Object.keys(results[opt.strategies[0]].deathsByWeek).map(w =>
    [w + '주', Object.fromEntries(opt.strategies.map(s => [s, results[s].deathsByWeek[w]]))])));

  // 해석 기준 (위 파일 머리 주석과 같은 내용)
  const rates = opt.strategies.map(s => results[s].clearRate);
  const median = rates.slice().sort((a, b) => a - b)[Math.floor(rates.length / 2)];
  console.log('해석: 같은 시드로 돈 전략 중 클리어율이 비정상적으로 높은 전략이 있다면, 그 전략이 쓴 카드/유물이 과하게 강하다는 뜻.');
  opt.strategies.forEach(s => {
    const r = results[s].clearRate;
    if(r === 0) console.log(`  ⚠ ${s}: 클리어 0% — 이 플레이 방식으로는 ${maxRound}주를 버틸 수 없다`);
    else if(r >= 0.9) console.log(`  ⚠ ${s}: 클리어 ${pct(r)} (90%+) — 쓴 카드/유물이 과하게 강한지 확인`);
    else if(median > 0 && r >= median * 3) console.log(`  ⚠ ${s}: 클리어 ${pct(r)} — 중앙값(${pct(median)})의 3배 이상`);
  });

  const out = opt.out || path.join(__dirname, 'results', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    meta: { n: opt.n, seed: opt.seed, strategies: opt.strategies, maxRound, targets: E.ROUND_TARGETS, date: new Date().toISOString(),
            note: '클리어율이 다른 전략보다 비정상적으로 높은 전략 = 그 전략이 쓴 카드/유물이 과하게 강하다는 신호' },
    summary: results, games
  }, null, 1));
  console.log(`\n저장: ${path.relative(process.cwd(), out)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

if(require.main === module) main();
module.exports = { playGame, summarize, END_CAUSES };
