#!/usr/bin/env node
/* 헤드리스 밸런스 시뮬레이터 — docs/engine.js를 Node에서 그대로 돌린다 (브라우저·Playwright 없음).
   node sim/runner.js [--n 500] [--seed 1] [--strategies allIn3x,random] [--out sim/results/xxx.json]
                      [--targets 10500,11000,...]   (ROUND_TARGETS를 파일 수정 없이 바꿔서 실험, 길이 = MAX_ROUND)
                      [--set DAILY_INTEREST=0.003;SEAL=...]   (CONFIG 상수 한 줄을 바꿔서 실험, ';'로 여러 개)
                      [--engine /tmp/before/engine.js]   (다른 엔진 파일 — 변경 전/후 비교: git show HEAD:docs/engine.js > /tmp/before/engine.js)

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
  const o = { n: 500, seed: 1, strategies: Object.keys(STRATEGIES).filter(k => STRATEGIES[k].premarket), out: '', targets: null, set: {}, engine: undefined };
  for(let i = 0; i < argv.length; i += 2){
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if(k === 'n' || k === 'seed') o[k] = parseInt(v, 10);
    else if(k === 'strategies') o.strategies = v.split(',');
    else if(k === 'out') o.out = v;
    else if(k === 'engine') o.engine = v;
    else if(k === 'set') v.split(';').forEach(kv => { const i = kv.indexOf('='); o.set[kv.slice(0, i).trim()] = kv.slice(i + 1); });
    else if(k === 'targets') o.targets = v.split(',').map(Number);
    else throw new Error('알 수 없는 옵션: ' + argv[i]);
  }
  o.strategies.forEach(s => { if(!STRATEGIES[s] || !STRATEGIES[s].premarket) throw new Error('알 수 없는 전략: ' + s); });
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

function weekEquities(E, r){
  const eq = E.eventLog.filter(e => e.type === 'roundClear').map(e => Math.round(e.data.eq));
  if(r.lastWeek && r.lastWeek.round > eq.length) eq.push(Math.round(r.lastWeek.eq));   // 미달·승리한 마지막 결산
  return eq;
}

/* 지금 암시장 진열 중 가장 싼 구매 항목 가격 (팩·낱장·유물, 제거 제외). 가격 함수가 있으면 그걸 쓴다 (변경 전 엔진과도 호환) */
const engineHas = (E, name) => { try { return typeof E[name] === 'function'; } catch(e){ return false; } };
function cheapestOffer(E){
  const r = E.run, sh = r.shop, prices = [], newPrices = engineHas(E, 'packPrice');
  E.SHOP_PACKS.forEach(pk => { if(E.packPool(pk).length) prices.push(newPrices ? E.packPrice(pk) : pk.price); });
  sh.singles.forEach((id, i) => { if(sh.singlesBought.indexOf(i) < 0 && !E.inDeck(id)) prices.push(E.singlePrice(id)); });
  sh.relics.forEach(id => { if(!E.hasRelic(id)) prices.push(newPrices ? E.relicPrice(id) : E.RELIC_PRICE[E.RELIC_BY_ID[id].rarity]); });
  return prices.length ? Math.min.apply(null, prices) : 0;
}
const SHOP_BUY_EVENTS = ['packOpened', 'singleBought', 'shopRemoved'];

function playGame(E, strat, seed){
  const rng = mulberry32(seed ^ 0x9E3779B9);
  E.setSeed(seed);
  E.startNewRun();
  if(strat.onStart) strat.onStart(E);   // 실험용 (예: 유물 강제 지급). rand()를 부르지 않는다
  const run = () => E.run;
  let steps = 0;
  const shopLog = [];   // 주마다 암시장: { week, income(지난 암시장 이후 적립), entry(들어갈 때 잔액), spent, exit, buys, cheapest }
  let lastExit = E.run.slush;
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
        const first = (strat.relicFirst || []).find(id => run().relicChoices.indexOf(id) >= 0);   // 성장 유물 우선 전략
        E.chooseRelicReward(first || pickReward(strat, run().relicChoices, strat.relicPick || [], rng, true));
      }
    } else if(phase === 'shop'){
      const entry = run().slush, ev0 = E.eventLog.length, cheapest = cheapestOffer(E);
      strat.shop(E, rng);
      const buys = E.eventLog.slice(ev0).filter(e => SHOP_BUY_EVENTS.indexOf(e.type) >= 0 || (e.type === 'relicGained' && e.data.source === 'shop')).length;
      shopLog.push({ week: run().round, income: entry - lastExit, entry, spent: entry - run().slush, exit: run().slush, buys, cheapest });
      lastExit = run().slush;
      E.leaveShop();
    } else throw new Error('알 수 없는 phase: ' + phase);
  }
  const r = run();
  return {
    seed, round: r.round, day: r.day, endReason: r.endReason, endCause: r.endCause,
    endEquity: Math.round(r.endEquity), peakEquity: Math.round(r.peakEquity), liquidations: r.liquidations,
    weeksCleared: r.weeksCleared, relics: r.relics.slice(), deckSize: r.masterDeck.length,
    growth: E.RELICS.filter(x => x.growth && r.relics.indexOf(x.id) >= 0).map(x => ({ id: x.id, stacks: r.relicState[x.id].stacks, best: r.relicState[x.id].best })),
    shop: shopLog,
    weekEq: weekEquities(E, r)   // 주마다 결산 순자산 (그 주 중간에 파산했으면 그 주는 없음)
  };
}

function summarize(games, maxRound){
  const n = games.length;
  const count = f => games.filter(f).length;
  const avg = f => games.reduce((s, g) => s + f(g), 0) / n;
  const causes = {};
  ALL_CAUSES.forEach(c => { causes[c] = 0; });
  games.forEach(g => { causes[g.endCause] = (causes[g.endCause] || 0) + 1; });
  const passByWeek = {};   // w주 결산을 통과한 비율
  for(let w = 1; w <= maxRound; w++) passByWeek[w] = count(g => g.weeksCleared >= w) / n;
  const deathsByWeek = {};   // 몇 주차 결산·장중에 끝났는지 (승리 제외)
  for(let w = 1; w <= maxRound; w++) deathsByWeek[w] = 0;
  games.filter(g => g.endReason !== 'VICTORY').forEach(g => { deathsByWeek[g.round]++; });
  const shopByWeek = {};   // w주 암시장에 들른 판들의 평균
  for(let w = 1; w < maxRound; w++){
    const xs = games.map(g => (g.shop || []).find(x => x.week === w)).filter(Boolean);
    const av = k => xs.length ? xs.reduce((s2, x) => s2 + x[k], 0) / xs.length : 0;
    shopByWeek[w] = { n: xs.length, income: av('income'), entry: av('entry'), spent: av('spent'), exit: av('exit'), buys: av('buys'), cheapest: av('cheapest') };
  }
  return {
    n, shopByWeek,
    clearRate: count(g => g.endCause === 'VICTORY') / n,
    bustRate: count(g => END_CAUSES.bust.indexOf(g.endCause) >= 0) / n,
    missRate: count(g => END_CAUSES.miss.indexOf(g.endCause) >= 0) / n,
    avgWeeksCleared: avg(g => g.weeksCleared),
    avgLiquidations: avg(g => g.liquidations),
    avgEndEquity: avg(g => g.endEquity),
    avgPeakEquity: avg(g => g.peakEquity),
    avgRelics: avg(g => g.relics.length),
    avgDeckSize: avg(g => g.deckSize),
    causes, deathsByWeek, passByWeek
  };
}

const pct = x => (100 * x).toFixed(1) + '%';

function main(){
  const opt = parseArgs(process.argv.slice(2));
  const E = loadEngine(opt.engine, opt.set);
  if(opt.targets){
    if(opt.targets.length !== E.ROUND_TARGETS.length) throw new Error(`--targets는 ${E.ROUND_TARGETS.length}개`);
    opt.targets.forEach((t, i) => { E.ROUND_TARGETS[i] = t; });   // const 배열이라 내용만 바꾼다
  }
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

  console.log('== 주차별 결산 통과율 (w주까지 살아남은 비율) ==');
  console.table(Object.fromEntries(Object.keys(results[opt.strategies[0]].passByWeek).map(w =>
    [w + '주', Object.fromEntries(opt.strategies.map(s => [s, pct(results[s].passByWeek[w])]))])));

  console.log('== 주차별 암시장 비자금 (그 주 암시장에 들른 판 평균: 적립 · 들어갈 때 잔액 · 지출 · 나갈 때 잔액 · 구매 수 · 가장 싼 항목) ==');
  opt.strategies.forEach(s => {
    console.log('  ' + s);
    console.table(Object.fromEntries(Object.keys(results[s].shopByWeek).map(w => { const x = results[s].shopByWeek[w];
      return [w + '주', { '판': x.n, '적립': Math.round(x.income), '입장 잔액': Math.round(x.entry), '지출': Math.round(x.spent), '퇴장 잔액': Math.round(x.exit), '구매': x.buys.toFixed(2), '최저가': Math.round(x.cheapest) }]; })));
  });

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
    meta: { n: opt.n, seed: opt.seed, engine: opt.engine || 'docs/engine.js', overrides: opt.set, strategies: opt.strategies, maxRound, targets: E.ROUND_TARGETS, date: new Date().toISOString(),
            note: '클리어율이 다른 전략보다 비정상적으로 높은 전략 = 그 전략이 쓴 카드/유물이 과하게 강하다는 신호' },
    summary: results, games
  }, null, 1));
  console.log(`\n저장: ${path.relative(process.cwd(), out)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

if(require.main === module) main();
module.exports = { playGame, summarize, END_CAUSES };
