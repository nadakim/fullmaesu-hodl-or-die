#!/usr/bin/env node
/* 하락 베팅 한 번의 성격 비교 — 인버스 ETF vs 공매도(고베타·레버리지).
   원금 1,000만짜리 베팅 하나를 [매파 발언 쓴 날 / 평소] × [1일 / 5일 보유]로 같은 시드 N번 돌려
   평균 수익·표준편차·이긴 비율·+20% 이상·반대매매 확률·최악을 원금 대비로 보여준다. 현금은 넉넉히 줘서 미수 파산은 제외.

   node tools/sim/bearbet.cjs [docs/demo] [N=2000] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function loadPlaywright(){
  try { return require('playwright'); } catch(e) {}
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = loadPlaywright();
(async () => {
  const file = process.argv[2] || path.join(__dirname, '../../docs/demo'), n = +(process.argv[3] || 2000);
  const html = fs.readFileSync(file, 'utf8');
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.route('**/*', r => r.request().url() === 'http://sim.local/demo.html' ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
  await page.goto('http://sim.local/demo.html');
  const out = await page.evaluate(n => {
    onGameEvent = () => {}; tipChance = () => 0;
    const CASES = [
      { name: '곱버스 1x (인버스 ETF)', stock: 'inv2', lev: 1, dir: 1 },
      { name: '지수 인버스 1x', stock: 'inv', lev: 1, dir: 1 },
      { name: '공매도 반도체 1x', stock: 'semi', lev: 1, dir: -1 },
      { name: '공매도 대장코인 1x', stock: 'coin', lev: 1, dir: -1 },
      { name: '공매도 초전도체 1x', stock: 'sc', lev: 1, dir: -1 },
      { name: '공매도 초전도체 2x', stock: 'sc', lev: 2, dir: -1 },
      { name: '공매도 밈코인 2x', stock: 'meme', lev: 2, dir: -1 },
    ];
    const P = 1000;
    const res = [];
    for(const hawk of [true, false]) for(const days of [1, 5]) for(const c of CASES){
      const r = [];
      let liq = 0;
      for(let k = 0; k < n; k++){
        setSeed(90000 + k); startNewRun(); run.cash = 1e6;   // 현금 넉넉 → 미수 파산 제외, 포지션 손익만 본다
        if(hawk){ run.hand = [newCard('hawk')]; playCard(0); }
        const eq0 = netEquity(), liq0 = run.liquidations;
        openPosition(c.stock, P, c.lev, c.dir, true);
        for(let d = 0; d < days && run.phase === 'premarket'; d++){ startMarket(); const day = run.day, rd = run.round; while(run.phase === 'market' && run.day === day && run.round === rd){ if(run.pendingTip) resolveTip(1); tick(); } }
        r.push((netEquity() - eq0) / P);
        if(run.liquidations > liq0) liq++;
      }
      const m = r.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / n);
      res.push({ hawk, days, name: c.name, mean: m, sd, win: r.filter(x => x > 0).length / n, big: r.filter(x => x >= 0.2).length / n, liq: liq / n, worst: Math.min(...r) });
    }
    setSeed(null);
    return res;
  }, n);
  await browser.close();
  let last = '';
  for(const x of out){
    const h = `${x.hawk ? '매파 발언 쓴 날' : '평소(매파 없음)'} · ${x.days}일 보유`;
    if(h !== last){ console.log(`\n${h}\n| 베팅 (원금 1,000만) | 평균 수익 | 표준편차 | 이긴 비율 | +20% 이상 | 반대매매 | 최악 |\n|---|---:|---:|---:|---:|---:|---:|`); last = h; }
    const p = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    console.log(`| ${x.name} | ${p(x.mean)} | ${(x.sd * 100).toFixed(1)}% | ${(x.win * 100).toFixed(0)}% | ${(x.big * 100).toFixed(0)}% | ${(x.liq * 100).toFixed(0)}% | ${p(x.worst)} |`);
  }
})();
