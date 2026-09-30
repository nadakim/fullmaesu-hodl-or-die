#!/usr/bin/env node
/* 헤드리스 밸런스 시뮬레이터 — docs/engine.js를 Node에서 그대로 돌린다 (브라우저·Playwright 없음).
   node sim/runner.js [--n 500] [--seed 1] [--strategies allIn3x,random] [--out sim/results/xxx.json]
                      [--targets 10500,11000,...]   (ROUND_TARGETS를 파일 수정 없이 바꿔서 실험, 길이 = MAX_ROUND)
                      [--set DAILY_INTEREST=0.003;SEAL=...]   (CONFIG 상수 한 줄을 바꿔서 실험, ';'로 여러 개)
                      [--force-relics antFlag,levTower]   (판 시작 때 장착 — 보스 카운터 '대비책 있음' 실험)
                      [--boss-adapt 1]   (빌드 카운터 보스 주에 대비책 행동: 한도 규제 → 가진 포지션 키우기, 레버리지 규제 → 분할, 압류 → 1번 칸에 정산 무관 유물)
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
const { relicSwap, arrangeRelics } = STRATEGIES;

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
  const o = { n: 500, seed: 1, strategies: Object.keys(STRATEGIES).filter(k => STRATEGIES[k].premarket), out: '', targets: null, set: {}, engine: undefined, forceRelics: [], bossAdapt: false };
  for(let i = 0; i < argv.length; i += 2){
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if(k === 'n' || k === 'seed') o[k] = parseInt(v, 10);
    else if(k === 'strategies') o.strategies = v.split(',');
    else if(k === 'out') o.out = v;
    else if(k === 'engine') o.engine = v;
    else if(k === 'set') v.split(';').forEach(kv => { const i = kv.indexOf('='); o.set[kv.slice(0, i).trim()] = kv.slice(i + 1); });
    else if(k === 'targets') o.targets = v.split(',').map(Number);
    else if(k === 'boss-adapt') o.bossAdapt = v === '1';
    else if(k === 'force-relics') o.forceRelics = v.split(',').filter(Boolean);   // 판 시작 때 장착할 유물 (보스 카운터 '대비책 있음' 실험용)
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

/* 곱하기 유물을 처음 얻은 주차: 이벤트 로그를 따라가며 roundStart로 주차를 센다. 결산 보상·암시장은 그 주(결산한 주) 번호 */
function firstXmultWeek(E){
  let round = 1, opened = false;
  for(const e of E.eventLog){
    if(e.type === 'roundStart') round = e.data.round;
    else if(e.type === 'marketOpen') opened = true;
    else if(e.type === 'relicGained'){ const fx = E.SETTLE_EFFECTS && E.SETTLE_EFFECTS[e.data.id]; if(fx && fx.kind === 'xmult') return opened ? round : 0; }
  }
  return null;
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
/* --boss-adapt: 빌드 카운터 보스 주의 대비책 행동 (엔진 rand() 안 씀, 기본 꺼짐 — 끄면 기존 봇 그대로).
   포지션 한도 규제 → 레버리지 ETF·물타기로 가진 포지션 키우기 · 레버리지 규제 → 가장 높은 레버리지 포지션 분할 (레버리지 탑 곱이 늘어난다) ·
   유물 압류 → 정산과 무관한 유물을 1번 칸으로 (없으면 그대로) */
const bossAdaptMod = (E, k) => { try { return E.bossMod(k, 0); } catch(e){ return 0; } };
function playOnPos(E, ids, pick){
  for(let guard = 0; guard < 20; guard++){
    const i = E.run.hand.findIndex(c => ids.indexOf(E.CARD_BY_ID[c.id].base || c.id) >= 0 && E.validTargetIds(E.run.hand.indexOf(c)).length);
    if(i < 0) return;
    const t = pick(E.validTargetIds(i).map(id => E.run.positions.find(p => p.id === id)));
    if(!t || !E.playCard(i, t.id)) return;
  }
}
function seizeArrange(E){
  const i = E.run.relics.findIndex(id => !E.SETTLE_EFFECTS[id]);
  if(i > 0 && E.canArrangeRelics()) E.moveRelic(i, 0);
}
function bossAdapt(E){
  if(!E.run.boss) return;
  if(bossAdaptMod(E, 'slot1Seized')) seizeArrange(E);
  if(bossAdaptMod(E, 'positionCap')) playOnPos(E, ['levEtf', 'avgDown'], ps => ps.sort((a, b) => E.exposure(b) - E.exposure(a))[0]);
  if(bossAdaptMod(E, 'levCap')) playOnPos(E, ['split'], ps => ps.sort((a, b) => b.lev - a.lev)[0]);
}
const SHOP_BUY_EVENTS = ['packOpened', 'singleBought', 'shopRemoved'];

/* 판 한 번. opts.forceRelics = 판 시작 때 장착할 유물 id (이미 있으면 그대로, rand() 없음) */
const SHOP_MEANINGFUL_RARITY = ['rare', 'legendary', 'mythic'];   // '의미 있는 구매' 낱장 기준 (희귀 이상)
function playGame(E, strat, seed, opts){
  const rng = mulberry32(seed ^ 0x9E3779B9);
  E.setSeed(seed);
  E.startNewRun();
  if(strat.onStart) strat.onStart(E);   // 실험용 (예: 유물 강제 지급). rand()를 부르지 않는다
  ((opts && opts.forceRelics) || []).forEach(id => { if(E.RELIC_BY_ID[id] && !E.hasRelic(id)) E.gainRelic(id, 'force', 0); });
  const weekStartEq = [Math.round(E.netEquity())];   // 주 시작 순자산 (1주차 = 시작 자금) — sim/metrics.js 성장 배수
  const run = () => E.run;
  let steps = 0;
  const shopLog = [];   // 주마다 암시장: { week, income(지난 암시장 이후 적립), entry(들어갈 때 잔액), spent, exit, buys, cheapest }
  let lastExit = E.run.slush;
  const weekRelics = [[]];   // weekRelics[k] = (k+1)주차 시작 때 가진 유물 (1주차는 없음) — sim/rule-breaker-check.js 생존 편향 보정
  while(run().phase !== 'over'){
    if(++steps > MAX_STEPS) throw new Error(`시드 ${seed}: ${MAX_STEPS}걸음 안에 끝나지 않음 (phase ${run().phase})`);
    const phase = run().phase;
    if(phase === 'premarket'){
      if(opts && opts.bossAdapt) bossAdapt(E);
      strat.premarket(E, rng);
      E.startMarket();
    } else if(phase === 'market'){
      if(run().pendingTip) E.resolveTip(strat.tip(E, rng));
      else {
        if(strat.market) strat.market(E, rng);   // 장중 훅 (선택): 틱 직전에 매도 등 — 없는 전략은 그대로
        E.tick();
      }
    } else if(phase === 'reward'){
      if(run().rewardStep === 'card'){
        const id = pickReward(strat, run().rewardChoices, strat.cardPick || [], rng, false);
        E.chooseReward(id ? 'take' : 'skip', id);
      } else {
        const choices = strat.relicFilter ? run().relicChoices.filter(x => strat.relicFilter(E, x)) : run().relicChoices;   // 전략이 거르는 유물 (충돌 조합·칸 제한)
        const first = (strat.relicFirst || []).find(id => choices.indexOf(id) >= 0);   // 성장 유물 우선 전략
        const id = first || pickReward(strat, choices, strat.relicPick || [], rng, true);
        const swap = id ? relicSwap(E, id, strat.relicFirst || strat.relicPick, strat.randomPicks ? rng : null) : undefined;   // 칸이 가득 찼으면 교체할 것 (null = 포기)
        if(swap === null) E.chooseRelicReward('');
        else E.chooseRelicReward(id, swap);
      }
    } else if(phase === 'shop'){
      const entry = run().slush, ev0 = E.eventLog.length, cheapest = cheapestOffer(E);
      strat.shop(E, rng);
      const buys = E.eventLog.slice(ev0).filter(e => SHOP_BUY_EVENTS.indexOf(e.type) >= 0 || (e.type === 'relicGained' && e.data.source === 'shop')).length;
      const removes = E.eventLog.slice(ev0).filter(e => e.type === 'shopRemoved').length;
      const rer = E.eventLog.slice(ev0).filter(e => e.type === 'shopRerolled');
      const meaningful = E.eventLog.slice(ev0).filter(e => (e.type === 'relicGained' && e.data.source === 'shop') || e.type === 'packOpened' || e.type === 'shopRemoved'
        || (e.type === 'singleBought' && SHOP_MEANINGFUL_RARITY.indexOf(E.CARD_BY_ID[e.data.cardId].rarity) >= 0)).length;   // 유물·희귀 이상 낱장·팩·카드 제거 (리롤 제외)
      shopLog.push({ meaningful, week: run().round, income: entry - lastExit, entry, spent: entry - run().slush, exit: run().slush, buys, removes, deck: run().masterDeck.length, cheapest,
                     rerolls: rer.length, rerollSpent: rer.reduce((s2, e) => s2 + e.data.cost, 0) });
      lastExit = run().slush;
      (strat.arrange || arrangeRelics)(E);   // 유물 칸 순서: 더하기 → 곱하기 (봇은 최선의 순서, 전략이 따로 정할 수 있다)
      E.leaveShop();
      weekRelics.push(run().relics.slice());   // 다음 주 시작 때 가진 유물
      if(run().phase !== 'over') weekStartEq.push(Math.round(E.netEquity()));
    } else throw new Error('알 수 없는 phase: ' + phase);
  }
  const r = run();
  return {
    seed, round: r.round, day: r.day, endReason: r.endReason, endCause: r.endCause,
    endEquity: Math.round(r.endEquity), peakEquity: Math.round(r.peakEquity), liquidations: r.liquidations,
    maxSettleMult: r.maxSettleMult || 1, settledTotal: Math.round(r.settledTotal || 0), maxSettlePayout: Math.round(r.maxSettlePayout || 0),   // 장 마감 정산 (없는 엔진이면 1·0)
    sectorMax: r.sectorLevel ? Math.max(...Object.keys(r.sectorLevel).map(k => r.sectorLevel[k])) : 1,   // (N3) 판 끝 최고 섹터 레벨 (없는 엔진이면 1)
    weeksCleared: r.weeksCleared, relics: r.relics.slice(), deckSize: r.masterDeck.length,
    weekRelics, weekStartEq,
    xmultWeek: firstXmultWeek(E),   // 곱하기(xmult) 유물을 처음 얻은 주차 (0 = 판 시작 전, null = 못 얻음) — sim/metrics.js 운 의존도
    relicsEver: [...new Set(E.eventLog.filter(e => e.type === 'relicGained').map(e => e.data.id))],   // 판 중 한 번이라도 가진 유물 (판매·교체 포함) — sim/rule-breaker-check.js
    growth: E.RELICS.filter(x => x.growth && r.relics.indexOf(x.id) >= 0).map(x => ({ id: x.id, stacks: r.relicState[x.id].stacks, best: r.relicState[x.id].best })),
    shop: shopLog,
    weekEq: weekEquities(E, r),   // 주마다 결산 순자산 (그 주 중간에 파산했으면 그 주는 없음)
    bossPlan: r.bossPlan || {}    // 보스 주간 (S9): 주차 → 보스 id (없는 엔진·보스 끔이면 {}) — sim/boss-check.js
  };
}

const GROWTH_IDS = ['moonSavings', 'tearJar', 'traumaSurvivor', 'tipCollector', 'diamondTree', 'compoundMonster'];
function summarize(games, maxRound, strat){
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
    shopByWeek[w] = { n: xs.length, income: av('income'), entry: av('entry'), spent: av('spent'), exit: av('exit'), buys: av('buys'), removes: av('removes'), deck: av('deck'), cheapest: av('cheapest'),
                      rerolls: av('rerolls'), rerollSpent: av('rerollSpent') };
  }
  // 유물: 전략의 선호 유물(relicPick 또는 relicFirst) 보유 수 · 1순위 보유율 · 성장형 보유율 · 암시장 지출 중 새로고침 비율
  const pref = (strat && (strat.relicFirst || strat.relicPick)) || [];
  const allShop = [].concat.apply([], games.map(g => g.shop || []));
  const spentAll = allShop.reduce((s2, x) => s2 + x.spent, 0), rerollAll = allShop.reduce((s2, x) => s2 + (x.rerollSpent || 0), 0);
  const relicStats = {
    prefOwned: pref.length ? games.reduce((s2, g) => s2 + g.relics.filter(id => pref.indexOf(id) >= 0).length, 0) / n : 0,
    prefTop: pref.length ? games.filter(g => g.relics.indexOf(pref[0]) >= 0).length / n : 0,
    growthOwned: games.reduce((s2, g) => s2 + g.relics.filter(id => GROWTH_IDS.indexOf(id) >= 0).length, 0) / n,
    rerollsPerShop: allShop.length ? allShop.reduce((s2, x) => s2 + (x.rerolls || 0), 0) / allShop.length : 0,
    rerollShare: spentAll > 0 ? rerollAll / spentAll : 0
  };
  return {
    n, shopByWeek, relicStats,
    clearRate: count(g => g.endCause === 'VICTORY') / n,
    bustRate: count(g => END_CAUSES.bust.indexOf(g.endCause) >= 0) / n,
    missRate: count(g => END_CAUSES.miss.indexOf(g.endCause) >= 0) / n,
    avgWeeksCleared: avg(g => g.weeksCleared),
    avgLiquidations: avg(g => g.liquidations),
    avgEndEquity: avg(g => g.endEquity),
    avgPeakEquity: avg(g => g.peakEquity),
    peakDist: dist(games.map(g => g.peakEquity)),            // 판당 최고 순자산 분포
    settleMultDist: dist(games.map(g => g.maxSettleMult)),   // 판당 하루 최대 정산 배수 분포
    avgSettledTotal: avg(g => g.settledTotal || 0),
    avgRelics: avg(g => g.relics.length),
    avgDeckSize: avg(g => g.deckSize),
    causes, deathsByWeek, passByWeek
  };
}

const pct = x => (100 * x).toFixed(1) + '%';
/* 분포: 중앙값 · 상위 10% 경계 · 최대 */
function dist(xs){
  const a = xs.slice().sort((x, y) => x - y);
  const q = f => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  return { median: q(0.5), p90: q(0.9), max: a[a.length - 1] };
}

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
    games[name] = seeds.map(s => playGame(E, STRATEGIES[name], s, { forceRelics: opt.forceRelics, bossAdapt: opt.bossAdapt }));
    results[name] = summarize(games[name], maxRound, STRATEGIES[name]);
    process.stderr.write(`  ${name}: ${opt.n}판 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  }

  console.log(`\n== 전략별 요약 (전략당 ${opt.n}판, 시드 ${opt.seed}~${opt.seed + opt.n - 1}, ${maxRound}주 클리어 = VICTORY) ==`);
  console.table(Object.fromEntries(opt.strategies.map(s => { const r = results[s]; return [s, {
    '클리어': pct(r.clearRate), '파산': pct(r.bustRate), '목표미달': pct(r.missRate),
    '평균 생존 주': r.avgWeeksCleared.toFixed(2), '반대매매/판': r.avgLiquidations.toFixed(2),
    '최종 순자산': Math.round(r.avgEndEquity), '최고 순자산': Math.round(r.avgPeakEquity),
    '유물': r.avgRelics.toFixed(1), '덱': r.avgDeckSize.toFixed(1) }]; })));

  console.log('== 장 마감 정산 · 고점 (판당 최고 순자산 / 하루 최대 정산 배수: 중앙값 · 상위 10% · 최대) ==');
  console.table(Object.fromEntries(opt.strategies.map(s => { const r = results[s]; return [s, {
    '최고 순자산 중앙': Math.round(r.peakDist.median), '상위10%': Math.round(r.peakDist.p90), '최대': Math.round(r.peakDist.max),
    '상위10%÷중앙': (r.peakDist.p90 / r.peakDist.median).toFixed(2),
    '최대 배수 중앙': r.settleMultDist.median.toFixed(2), '배수 상위10%': r.settleMultDist.p90.toFixed(2), '배수 최대': r.settleMultDist.max.toFixed(2),
    '정산 보너스/판': Math.round(r.avgSettledTotal) }]; })));

  console.log('== 엔딩(endCause)별 발생 수 ==');
  console.table(Object.fromEntries(ALL_CAUSES.map(c => [c, Object.fromEntries(opt.strategies.map(s => [s, results[s].causes[c]]))])));

  console.log('== 주차별 결산 통과율 (w주까지 살아남은 비율) ==');
  console.table(Object.fromEntries(Object.keys(results[opt.strategies[0]].passByWeek).map(w =>
    [w + '주', Object.fromEntries(opt.strategies.map(s => [s, pct(results[s].passByWeek[w])]))])));

  console.log('== 주차별 암시장 비자금 (그 주 암시장에 들른 판 평균: 적립 · 들어갈 때 잔액 · 지출 · 나갈 때 잔액 · 구매 수 · 가장 싼 항목) ==');
  opt.strategies.forEach(s => {
    console.log('  ' + s);
    console.table(Object.fromEntries(Object.keys(results[s].shopByWeek).map(w => { const x = results[s].shopByWeek[w];
      return [w + '주', { '판': x.n, '적립': Math.round(x.income), '입장 잔액': Math.round(x.entry), '지출': Math.round(x.spent), '퇴장 잔액': Math.round(x.exit), '구매': x.buys.toFixed(2), '제거': (x.removes || 0).toFixed(2), '덱': (x.deck || 0).toFixed(1), '최저가': Math.round(x.cheapest) }]; })));
  });

  console.log('== 유물 · 새로고침 (선호 유물 = 전략의 relicPick/relicFirst, 1순위 = 목록 맨 앞) ==');
  console.table(Object.fromEntries(opt.strategies.map(s => { const r = results[s].relicStats; return [s, {
    '선호 유물 보유/판': r.prefOwned.toFixed(2), '1순위 보유율': pct(r.prefTop), '성장형 보유/판': r.growthOwned.toFixed(2),
    '새로고침/암시장': r.rerollsPerShop.toFixed(2), '지출 중 새로고침': pct(r.rerollShare) }]; })));

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
    meta: { n: opt.n, seed: opt.seed, forceRelics: opt.forceRelics, bossAdapt: opt.bossAdapt, engine: opt.engine || 'docs/engine.js', overrides: opt.set, strategies: opt.strategies, maxRound, targets: E.ROUND_TARGETS, date: new Date().toISOString(),
            note: '클리어율이 다른 전략보다 비정상적으로 높은 전략 = 그 전략이 쓴 카드/유물이 과하게 강하다는 신호' },
    summary: results, games
  }, null, 1));
  console.log(`\n저장: ${path.relative(process.cwd(), out)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

if(require.main === module) main();
module.exports = { playGame, summarize, END_CAUSES };
