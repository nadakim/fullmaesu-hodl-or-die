#!/usr/bin/env node
/* 시장 카드 한 장의 기대 수익 — 같은 시드로 "카드 + 기준 매매" vs "기준 매매만"을 비교한다.
   기준 매매: 신용 매수(2x) + 방향 맞는 종목 카드 1장 (롱 = 대장코인, 인버스 = 곱버스).
   첫날 장전(순자산 1억)에 사서 이틀(카드 쓴 날 + 다음 날) 들고 있은 뒤의 순자산을 비교한다. 찌라시는 끈다.

   node tools/sim/cardev.cjs [--n 4000] [--file docs/demo]

   --all: 상태·신화를 뺀 모든 카드. 반도체 1x ₩1,000만 + 대장코인 2x ₩1,500만을 들고 하루 장을 돌린 뒤(손익이 벌어진 상태),
          2일차 장전에 [카드 → 반도체 카드] vs [반도체 카드]를 같은 시드로 비교, 이틀 뒤 순자산 차이.
          카드를 못 쓰는 상황(대상 없음 등)은 '사용 가능'에서 빠진다. 드로우·방어처럼 간접 효과는 이 측정에 잘 안 잡힌다.
   node tools/sim/cardev.cjs --all [--n 1500] [--file docs/demo] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright(){
  try { return require('playwright'); } catch(e) {}
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const CASES = [
  { card: 'dove',     stock: 'coin' },
  { card: 'hawk',     stock: 'inv2' },
  { card: 'ceoTweet', stock: 'coin' },
  { card: 'pump',     stock: 'coin' }
];

async function main(){
  const args = process.argv.slice(2);
  const opt = { n: 0, file: path.join(__dirname, '../../docs/demo'), all: false };
  for(let i = 0; i < args.length; i++){
    const k = args[i].replace(/^--/, '');
    if(k === 'all') opt.all = true;
    else if(k === 'n') opt.n = parseInt(args[++i], 10);
    else if(k === 'file') opt.file = args[++i];
    else throw new Error('알 수 없는 옵션: ' + args[i]);
  }
  if(!opt.n) opt.n = opt.all ? 1500 : 4000;
  const html = fs.readFileSync(opt.file, 'utf8');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url() === 'http://sim.local/demo.html'
    ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
  await page.goto('http://sim.local/demo.html');

  if(opt.all){ await allCards(page, opt, errors, browser); return; }
  const rows = await page.evaluate(([cases, n]) => {
    onGameEvent = () => {};
    tipChance = () => 0;
    function trial(c, seed, withCard){
      setSeed(seed);
      startNewRun();
      run.hand = (withCard ? [c.card] : []).concat(['credit', 'stk_' + c.stock]).map(newCard);
      if(withCard && !playCard(0, CARD_BY_ID[c.card].target === 'asset' ? c.stock : undefined)) throw new Error(c.card + ' 사용 실패');
      if(!playCard(0) || !playCard(0)) throw new Error('기준 매매 실패');
      const eq0 = netEquity(), exp0 = run.positions.reduce((s, p) => s + exposure(p), 0);
      for(let d = 0; d < 2 && run.phase === 'premarket'; d++){
        startMarket();
        const day = run.day;
        while(run.phase === 'market' && run.day === day) tick();
      }
      return { gain: netEquity() - eq0, eq0, exp0 };
    }
    const out = [];
    for(const c of cases){
      let sumA = 0, sumB = 0, win = 0, eq0 = 0, exp0 = 0;
      for(let k = 0; k < n; k++){
        const a = trial(c, 50000 + k, true), b = trial(c, 50000 + k, false);
        sumA += a.gain; sumB += b.gain; if(a.gain > b.gain) win++;
        eq0 = b.eq0; exp0 = b.exp0;
      }
      out.push({ card: CARD_BY_ID[c.card].name, stock: STOCK_BY_ID[c.stock].name, ev: (sumA - sumB) / n, eq0, exp0, win: win / n });
    }
    setSeed(null);
    return out;
  }, [CASES, opt.n]);
  await browser.close();
  if(errors.length) throw new Error('페이지 에러: ' + errors.join(' | '));

  console.log(`- 대상: \`${path.relative(process.cwd(), opt.file) || opt.file}\` · 카드당 ${opt.n}쌍 · 이틀 보유 · 찌라시 끔\n`);
  console.log('| 카드 | 기준 매매 (신용 2x) | 기대 수익 (순자산 대비) | 기대 수익 (노출액 대비) | 카드 쓴 쪽이 이긴 비율 |');
  console.log('|---|---|---:|---:|---:|');
  for(const r of rows){
    const sign = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    console.log(`| ${r.card} | ${r.stock} ₩${Math.round(r.exp0).toLocaleString('en-US')}만 노출 | ${sign(100 * r.ev / r.eq0)} | ${sign(100 * r.ev / r.exp0)} | ${(100 * r.win).toFixed(0)}% |`);
  }
}

async function allCards(page, opt, errors, browser){
  const rows = await page.evaluate(n => {
    onGameEvent = () => {};
    tipChance = () => 0;
    const run2days = () => {
      for(let d = 0; d < 2 && run.phase === 'premarket'; d++){
        startMarket();
        const day = run.day, round = run.round;
        while(run.phase === 'market' && run.day === day && run.round === round) tick();
      }
    };
    function trial(cardId, seed, withCard){
      setSeed(seed);
      startNewRun();
      openPosition('semi', 1000, 1, 1, true);
      openPosition('coin', 1500, 2, 1, true);
      startMarket();
      while(run.phase === 'market' && run.day === 1) tick();
      if(run.phase !== 'premarket') return null;
      run.hand = (withCard ? [cardId] : []).concat(['stk_semi']).map(newCard);
      run.ap = maxAp();
      let used = false;
      if(withCard){
        const card = CARD_BY_ID[cardId];
        let t;
        if(card.target){ const ids = validTargetIds(0); if(ids.length) t = ids[0]; }
        if((!card.target || t !== undefined) && checkPlay(0, t) === null) used = playCard(0, t);
      }
      const si = run.hand.findIndex(c => c.id === 'stk_semi');
      if(si >= 0 && checkPlay(si) === null) playCard(si);
      run2days();
      return { eq: netEquity(), used };
    }
    const ids = CARDS.filter(c => c.type !== 'status' && c.rarity !== 'mythic').map(c => c.id);
    const out = [];
    for(const id of ids){
      let sum = 0, usedN = 0, base = 0;
      for(let k = 0; k < n; k++){
        const a = trial(id, 70000 + k, true), b = trial(id, 70000 + k, false);
        if(!a || !b) continue;
        base += b.eq;
        if(a.used){ usedN++; sum += a.eq - b.eq; }
      }
      out.push({ id, name: CARD_BY_ID[id].name, type: CARD_BY_ID[id].type, rarity: CARD_BY_ID[id].rarity, usable: usedN / n, ev: usedN ? sum / usedN : 0, base: base / n });
    }
    setSeed(null);
    return out;
  }, opt.n);
  await browser.close();
  if(errors.length) throw new Error('페이지 에러: ' + errors.join(' | '));
  const RL = { common:'일반', uncommon:'고급', rare:'희귀', legendary:'전설', mythic:'신화' };
  console.log(`- 대상: \`${path.relative(process.cwd(), opt.file) || opt.file}\` · 카드당 ${opt.n}쌍 · 신화·상태 제외 · 기준 = 카드 없이 반도체만 산 경우\n`);
  console.log('| 카드 | 종류 | 등급 | 사용 가능 | 기대 수익 (순자산 대비) | −1~+3% |');
  console.log('|---|---|---|---:|---:|:---:|');
  rows.sort((a, b) => b.ev / b.base - a.ev / a.base).forEach(r => {
    const pctv = 100 * r.ev / r.base;
    console.log(`| ${r.name} | ${r.type} | ${RL[r.rarity]} | ${(100 * r.usable).toFixed(0)}% | ${(pctv >= 0 ? '+' : '') + pctv.toFixed(2)}% | ${r.usable === 0 ? '—' : pctv >= -1 && pctv <= 3 ? '✅' : '❌'} |`);
  });
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
