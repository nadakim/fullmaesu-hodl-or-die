#!/usr/bin/env node
/* 밸런스 시뮬레이터 — Playwright로 docs/demo를 열고, 페이지 안에서 엔진 함수를 직접 불러 한 판을 끝까지 자동 진행한다.
   UI는 쓰지 않는다 (onGameEvent를 빈 함수로 덮어씀). 엔진 난수는 setSeed(시드)로 고정 → 같은 시드 = 같은 판.

   node tools/sim/sim.cjs [--n 400] [--seed 1] [--tip A|B|random] [--strategies nothing,stocksOnly,...]
                          [--file docs/demo] [--md out.md] [--json out.json]
                          [--targets 10800,12000,...]   (ROUND_TARGETS를 파일 수정 없이 바꿔서 실험)

   변경 전/후 비교: git show HEAD:docs/demo > /tmp/before && node tools/sim/sim.cjs --file /tmp/before --md before.md */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function loadPlaywright(){
  try { return require('playwright'); } catch(e) {}
  const globalRoot = execSync('npm root -g').toString().trim();   // 전역 설치본 (저장소에는 npm 의존성을 두지 않는다)
  return require(path.join(globalRoot, 'playwright'));
}

const STRATEGIES = ['nothing', 'stocksOnly', 'allCards', 'yolo', 'shopper'];
const TIP_MODES = ['A', 'B', 'random'];

function parseArgs(argv){
  const o = { n: 400, seed: 1, tip: 'random', strategies: STRATEGIES, file: path.join(__dirname, '../../docs/demo'), md: '', json: '', targets: null };
  for(let i = 0; i < argv.length; i += 2){
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if(k === 'n' || k === 'seed') o[k] = parseInt(v, 10);
    else if(k === 'strategies') o.strategies = v.split(',');
    else if(k === 'targets') o.targets = v.split(',').map(Number);
    else if(k in o) o[k] = v;
    else throw new Error('알 수 없는 옵션: ' + argv[i]);
  }
  o.strategies.forEach(s => { if(STRATEGIES.indexOf(s) < 0) throw new Error('알 수 없는 전략: ' + s); });
  if(TIP_MODES.indexOf(o.tip) < 0) throw new Error('--tip 은 A | B | random');
  return o;
}

/* ── 페이지 안에서 실행되는 봇 (엔진 전역 함수만 호출) ── */
function installBots(){
  onGameEvent = () => {};   // 시뮬레이션 중엔 화면 연출 없음

  const mulberry = seed => () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let played = 0;
  // 조건에 맞는 손패 카드 중 지금 쓸 수 있는 첫 장을 쓴다 (대상 카드는 첫 번째 유효 대상)
  function playFirst(match){
    for(let i = 0; i < run.hand.length; i++){
      const card = CARD_BY_ID[run.hand[i].id];
      if(card.type === 'status' || !match(card)) continue;
      if(card.target){
        const ids = validTargetIds(i);
        if(ids.length && playCard(i, ids[0])){ played++; return true; }
      } else if(checkPlay(i) === null && playCard(i)){ played++; return true; }
    }
    return false;
  }
  const isStock = c => c.type === 'stock';
  const DAY_PLAY = {
    nothing:    () => false,
    stocksOnly: () => playFirst(isStock),                      // 대기 매수 효과를 안 쓰므로 항상 1x 롱
    allCards:   () => playFirst(() => true),
    yolo:       () => playFirst(c => c.id === 'yolo') || playFirst(c => c.id === 'credit') || playFirst(isStock),
    shopper:    () => playFirst(() => true)
  };
  const YOLO_PICKS = ['yolo', 'credit', 'fullBuy'];

  function pickCardReward(strategy){
    const ch = run.rewardChoices;
    if(!ch.length) return chooseReward('skip');
    const pref = strategy === 'yolo' ? ch.find(id => YOLO_PICKS.indexOf(id) >= 0) : '';
    return chooseReward('take', pref || ch[0]);
  }

  // 암시장: 살 수 있는 것 하나 (낱장 → 유물 → 팩 순서로 처음 되는 것)
  function shopOnce(){
    for(let i = 0; i < run.shop.singles.length; i++){
      const id = run.shop.singles[i];
      if(run.shop.singlesBought.indexOf(i) < 0 && !inDeck(id) && run.cash >= singlePrice(id)) return buySingle(i);
    }
    for(const id of run.shop.relics){
      if(!hasRelic(id) && run.cash >= RELIC_PRICE[RELIC_BY_ID[id].rarity]) return buyRelic(id);
    }
    for(const pk of SHOP_PACKS){
      if(packPool(pk).length && run.cash >= pk.price) return buyPack(pk.id);
    }
    return false;
  }

  window.__simGame = function(strategy, tipMode, seed){
    setSeed(seed);
    const botRand = mulberry((seed ^ 0x9E3779B9) >>> 0);   // 봇 선택용 난수는 엔진 난수와 분리
    startNewRun();
    let tips = 0, shopBuys = 0, guard = 0;
    played = 0;
    const weekEq = [];   // 주간 결산 순자산 (통과·탈락 모두)
    const noteWeek = () => { if(run.lastWeek && weekEq.length < run.lastWeek.round) weekEq.push(Math.round(run.lastWeek.eq)); };
    while(run.phase !== 'over'){
      noteWeek();
      if(++guard > 200000) throw new Error('무한 루프: seed ' + seed);
      if(run.phase === 'premarket'){
        while(run.phase === 'premarket' && DAY_PLAY[strategy]()){}
        startMarket();
      } else if(run.phase === 'market'){
        if(run.pendingTip){
          const n = TIP_BY_ID[run.pendingTip.eventId].choices.length;
          const idx = tipMode === 'A' ? 0 : tipMode === 'B' ? Math.min(1, n - 1) : Math.floor(botRand() * n);
          resolveTip(idx);
          tips++;
        } else tick();
      } else if(run.phase === 'reward'){
        if(run.rewardStep === 'card') pickCardReward(strategy);
        else chooseRelicReward(run.relicChoices[0] || '');
      } else if(run.phase === 'shop'){
        if(strategy === 'shopper' && shopOnce()) shopBuys++;
        leaveShop();
      }
    }
    noteWeek();
    setSeed(null);
    return { seed, weeksCleared: run.weeksCleared, endReason: run.endReason, endCause: run.endCause,
             liquidations: run.liquidations, endEquity: Math.round(run.endEquity), peakEquity: Math.round(run.peakEquity),
             round: run.round, day: run.day, cardsPlayed: played, tips, shopBuys, deck: run.masterDeck.length, relics: run.relics.length, weekEq };
  };
  window.__simTargets = t => { if(t){ if(t.length !== MAX_ROUND) throw new Error('--targets 는 ' + MAX_ROUND + '개'); t.forEach((v, i) => { ROUND_TARGETS[i] = v; }); } return ROUND_TARGETS.slice(); };
  window.__simBatch = (strategy, tipMode, seeds) => seeds.map(s => window.__simGame(strategy, tipMode, s));
  return { maxRound: MAX_ROUND, causes: Object.keys(ENDINGS) };
}

/* ── 집계 ── */
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const avg = (xs, f) => xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : 0;

function summarize(games, maxRound){
  const n = games.length;
  const causes = {};
  games.forEach(g => { causes[g.endCause] = (causes[g.endCause] || 0) + 1; });
  return {
    n,
    pass1: games.filter(g => g.weeksCleared >= 1).length,
    pass4: games.filter(g => g.weeksCleared >= 4).length,
    clear: games.filter(g => g.weeksCleared >= maxRound).length,
    bankrupt: games.filter(g => g.endReason === 'BANKRUPT').length,
    liqPerRun: avg(games, g => g.liquidations),
    weeks: avg(games, g => g.weeksCleared),
    endEquity: avg(games, g => g.endEquity),
    cards: avg(games, g => g.cardsPlayed),
    causes
  };
}

function toMarkdown(meta, rows, causes){
  const L = [];
  L.push(`- 판 수: 전략당 ${meta.n}판 · 시드 ${meta.seed}~${meta.seed + meta.n - 1} · 찌라시 선택: ${meta.tip}`);
  L.push(`- 대상: \`${meta.file}\` (sha1 ${meta.sha})`);
  L.push(`- 주간 목표${meta.overridden ? ' (--targets 로 덮어씀)' : ''}: ${meta.targets.map(v => v.toLocaleString('en-US')).join(' → ')}`);
  L.push('');
  L.push('| 전략 | 1주 통과 | 4주 통과 | 8주 클리어 | 파산율 | 반대매매/판 | 평균 생존 주 | 평균 최종 순자산 | 카드 사용/판 |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  rows.forEach(({ name, s }) => L.push(`| ${name} | ${pct(s.pass1, s.n)} | ${pct(s.pass4, s.n)} | ${pct(s.clear, s.n)} | ${pct(s.bankrupt, s.n)} | ${s.liqPerRun.toFixed(2)} | ${s.weeks.toFixed(2)} | ₩ ${Math.round(s.endEquity).toLocaleString('en-US')}만 | ${s.cards.toFixed(1)} |`));
  L.push('');
  L.push('엔딩 분포');
  L.push('');
  L.push('| 전략 | ' + causes.join(' | ') + ' |');
  L.push('|---|' + causes.map(() => '---:').join('|') + '|');
  rows.forEach(({ name, s }) => L.push(`| ${name} | ` + causes.map(c => pct(s.causes[c] || 0, s.n)).join(' | ') + ' |'));
  return L.join('\n');
}

async function main(){
  const opt = parseArgs(process.argv.slice(2));
  const html = fs.readFileSync(opt.file, 'utf8');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 로컬 서버 없이 파일 내용을 그대로 서빙, 외부 요청(폰트)은 차단
  await page.route('**/*', r => r.request().url() === 'http://sim.local/demo.html'
    ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    : r.abort());
  await page.goto('http://sim.local/demo.html');
  const info = await page.evaluate(installBots);
  const targets = await page.evaluate(t => window.__simTargets(t), opt.targets);

  const seeds = Array.from({ length: opt.n }, (_, i) => opt.seed + i);
  const CHUNK = 50;
  const rows = [], raw = {};
  for(const name of opt.strategies){
    const games = [];
    for(let i = 0; i < seeds.length; i += CHUNK)
      games.push(...await page.evaluate(([st, tip, sd]) => window.__simBatch(st, tip, sd), [name, opt.tip, seeds.slice(i, i + CHUNK)]));
    raw[name] = games;
    rows.push({ name, s: summarize(games, info.maxRound) });
    process.stderr.write(`  ${name}: ${games.length}판 완료\n`);
  }
  // 재현성 확인: 첫 전략의 앞 10판을 다시 돌려 똑같은지
  const again = await page.evaluate(([st, tip, sd]) => window.__simBatch(st, tip, sd), [opt.strategies[0], opt.tip, seeds.slice(0, 10)]);
  const reproducible = JSON.stringify(again) === JSON.stringify(raw[opt.strategies[0]].slice(0, 10));
  await browser.close();
  if(errors.length) throw new Error('페이지 에러: ' + errors.join(' | '));
  if(!reproducible) throw new Error('같은 시드인데 결과가 다름 — 엔진에 rand()를 거치지 않는 난수가 있다');

  const sha = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
  const meta = { targets, overridden: !!opt.targets, n: opt.n, seed: opt.seed, tip: opt.tip, file: path.relative(process.cwd(), opt.file) || opt.file, sha };
  const md = toMarkdown(meta, rows, info.causes);
  console.log(md);
  if(opt.md) fs.writeFileSync(opt.md, md + '\n');
  if(opt.json) fs.writeFileSync(opt.json, JSON.stringify({ meta, summary: rows, games: raw }, null, 1));
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
