#!/usr/bin/env node
/* 시장 카드 한 장의 기대 수익 — 같은 시드로 "카드 + 기준 매매" vs "기준 매매만"을 비교한다.
   기준 매매: 신용 매수(2x) + 방향 맞는 종목 카드 1장 (롱 = 대장코인, 인버스 = 곱버스).
   첫날 장전(순자산 1억)에 사서 이틀(카드 쓴 날 + 다음 날) 들고 있은 뒤의 순자산을 비교한다. 찌라시는 끈다.

   node tools/sim/cardev.cjs [--n 4000] [--file docs/demo] */
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
  const opt = { n: 4000, file: path.join(__dirname, '../../docs/demo') };
  for(let i = 0; i < args.length; i += 2){
    const k = args[i].replace(/^--/, '');
    if(k === 'n') opt.n = parseInt(args[i + 1], 10); else if(k === 'file') opt.file = args[i + 1]; else throw new Error('알 수 없는 옵션: ' + args[i]);
  }
  const html = fs.readFileSync(opt.file, 'utf8');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url() === 'http://sim.local/demo.html'
    ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
  await page.goto('http://sim.local/demo.html');

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

main().catch(e => { console.error(e.message || e); process.exit(1); });
