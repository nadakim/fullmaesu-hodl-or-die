#!/usr/bin/env node
/* N1 정산 비중 측정: 최종 금액을 주가(운)가 정하는가, 빌드(유물 조합)가 정하는가.
   node sim/settle-share.js [--n 500] [--fixed-n 300] [--set 'SETTLE_BASE_CAP=0.15;...'] [--engine file] [--md out.md] [--json out.json]
   a) 판 전체 손익 중 가격 손익(확정 + 미실현) vs 장 마감 정산 보너스(settledTotal) 비중 — 전략 12종 × n판 (runner.playGame 그대로)
   b) 운 의존도: 빌드를 고정(시작 때 유물 지급, 보상·암시장 건너뜀)하고 시드만 바꿨을 때 최종 순자산의 변동계수(CV)와 log10 표준편차
   c) 빌드 영향력: (a)의 판 중 끝났을 때 유물 0개 vs 곱하기(×) 유물 3개 이상 — 최고 순자산 중앙값 차이
   판정: 가격 손익 비중 > 50% 이거나, 시드 분산(log10 표준편차) > 빌드 영향력(log10 중앙값 차이)이면 "운 게임" */
const fs = require('fs');
const loadEngine = require('./load-engine.js');
const STRATEGIES = require('./strategies.js');
const { playGame } = require('./runner.js');

const args = process.argv.slice(2);
const opt = { n: 500, fixedN: 300, set: {}, engine: undefined, md: '', json: '' };
for(let i = 0; i < args.length; i += 2){
  const k = args[i].replace(/^--/, ''), v = args[i + 1];
  if(k === 'n') opt.n = +v; else if(k === 'fixed-n') opt.fixedN = +v;
  else if(k === 'engine') opt.engine = v; else if(k === 'md') opt.md = v; else if(k === 'json') opt.json = v;
  else if(k === 'set') v.split(';').filter(Boolean).forEach(kv => { const j = kv.indexOf('='); opt.set[kv.slice(0, j).trim()] = kv.slice(j + 1); });
  else throw new Error('알 수 없는 옵션: ' + args[i]);
}
const E = loadEngine(opt.engine, opt.set);
const START = E.START_CASH;
const MULT_RELICS = Object.keys(E.SETTLE_EFFECTS).filter(id => E.SETTLE_EFFECTS[id].kind === 'xmult' && !E.SETTLE_EFFECTS[id].onLoss);
const median = xs => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const std = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) * (x - m)))); };
const lg = x => Math.log10(Math.max(1, x));
const pct = x => (100 * x).toFixed(0) + '%';
const strategies = Object.keys(STRATEGIES).filter(k => STRATEGIES[k].premarket);

// ── a) + c): 전략별 보통 판 ──
const rowsA = [], allGames = [], allShares = [];
strategies.forEach(name => {
  let price = 0, bonus = 0;
  const shares = [], peaks = [];
  let wins = 0;
  for(let s = 1; s <= opt.n; s++){
    const g = playGame(E, STRATEGIES[name], s), r = E.run;
    const p = r.realized + r.positions.reduce((sum, x) => sum + E.posPnl(x), 0);   // 가격 손익 = 확정 + 미실현 (반대매매 투매 손실·거래세 포함)
    const b = r.settledTotal || 0;
    price += p; bonus += b;
    const pos = Math.max(0, p) + Math.max(0, b);
    if(pos > 0){ shares.push(Math.max(0, p) / pos); allShares.push(Math.max(0, p) / pos); }
    peaks.push(g.peakEquity); if(g.endCause === 'VICTORY') wins++;
    allGames.push({ name, peak: g.peakEquity, relics: g.relics, mult: g.relics.filter(id => MULT_RELICS.indexOf(id) >= 0).length });
  }
  rowsA.push({ name, price, bonus, share: price / Math.max(1e-9, Math.abs(price) + Math.abs(bonus)), medShare: median(shares), over50: shares.filter(x => x > 0.5).length / Math.max(1, shares.length), clear: wins / opt.n, peakMed: median(peaks), peakP90: peaks.slice().sort((x, y) => x - y)[Math.floor(peaks.length * 0.9)] });
  process.stderr.write(`  a) ${name}\n`);
});
const g0 = allGames.filter(g => g.relics.length === 0).map(g => g.peak), g3 = allGames.filter(g => g.mult >= 3).map(g => g.peak);
const buildGap = lg(median(g3)) - lg(median(g0));

// ── b) 고정 빌드: 시드만 바꾼다 ──
const BUILDS = { '유물 없음': [], '곱하기 3 (깃발·섹터·레버리지 탑)': ['antFlag', 'sectorSet', 'levTower'] };
const POLICIES = ['random', 'allIn3x', 'antFlagBuild', 'levTowerBuild'];
function fixedGame(strat, relics, seed){
  let t = seed ^ 0x9E3779B9;
  const rng = () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  E.setSeed(seed); E.startNewRun();
  relics.forEach(id => E.gainRelic(id, 'fixed'));
  for(let steps = 0; steps < 200000 && E.run.phase !== 'over'; steps++){
    const ph = E.run.phase;
    if(ph === 'premarket'){ strat.premarket(E, rng); E.startMarket(); }
    else if(ph === 'market'){ if(E.run.pendingTip) E.resolveTip(strat.tip(E, rng)); else E.tick(); }
    else if(ph === 'reward'){ if(E.run.rewardStep === 'card') E.chooseReward('skip'); else E.chooseRelicReward(''); }   // 빌드 고정: 보상 건너뜀
    else if(ph === 'shop') E.leaveShop();                                                                          // 암시장도 건너뜀
  }
  return { end: Math.max(0, E.run.endEquity), peak: E.run.peakEquity, weeks: E.run.weeksCleared };
}
const rowsB = [];
POLICIES.forEach(pol => Object.keys(BUILDS).forEach(b => {
  const gs = [];
  for(let s = 1; s <= opt.fixedN; s++) gs.push(fixedGame(STRATEGIES[pol], BUILDS[b], s));
  const peaks = gs.map(g => g.peak), logs = peaks.map(lg);
  rowsB.push({ pol, build: b, med: median(peaks), cv: std(peaks) / Math.max(1e-9, mean(peaks)), logStd: std(logs), weeks: mean(gs.map(g => g.weeks)), logMed: lg(median(peaks)) });
  process.stderr.write(`  b) ${pol} · ${b}\n`);
}));

// ── 표 ──
const fmt = x => Math.round(x).toLocaleString();
let md = `## a) 손익 출처 (전략별 ${opt.n}판, 판 전체 합계 · 판별 중앙값)\n\n| 전략 | 가격 손익 합 | 정산 보너스 합 | 가격 비중(합계) | 가격 비중(판 중앙값) | 가격 > 50%인 판 | 클리어 | 최고 순자산 중앙 | 상위 10% |\n|---|---|---|---|---|---|---|---|---|\n`;
rowsA.forEach(r => { md += `| ${r.name} | ${fmt(r.price)} | ${fmt(r.bonus)} | ${pct(r.share)} | ${pct(r.medShare)} | ${pct(r.over50)} | ${(100 * r.clear).toFixed(1)}% | ${fmt(r.peakMed)} | ${fmt(r.peakP90)} |\n`; });
const totP = rowsA.reduce((s, r) => s + Math.max(0, r.price), 0), totB = rowsA.reduce((s, r) => s + Math.max(0, r.bonus), 0);
const priceShare = median(allShares);
md += `\n합계는 곱하기 판 몇 개(조~경 단위)가 좌우하므로 판정은 **판별 가격 비중의 전체 중앙값 ${pct(priceShare)}**(수익 판 ${allShares.length}개)로 한다. 참고로 합계 기준은 가격 ${pct(totP / (totP + totB))} · 정산 ${pct(totB / (totP + totB))}.\n`;
md += `\n## b) 운 의존도 — 빌드 고정, 시드만 ${opt.fixedN}개 (최고 순자산 기준)\n\n| 정책 | 빌드 | 중앙값 | 변동계수(CV) | log10 표준편차 | 평균 생존 주 |\n|---|---|---|---|---|---|\n`;
rowsB.forEach(r => { md += `| ${r.pol} | ${r.build} | ${fmt(r.med)} | ${r.cv.toFixed(2)} | ${r.logStd.toFixed(2)} | ${r.weeks.toFixed(2)} |\n`; });
md += `\n빌드 효과(같은 정책, 곱하기 3 − 유물 없음, log10 중앙값 차이): ` + POLICIES.map(p => { const a = rowsB.find(r => r.pol === p && r.build === '유물 없음'), b = rowsB.find(r => r.pol === p && r.build !== '유물 없음'); return `${p} ${(b.logMed - a.logMed).toFixed(2)}`; }).join(' · ') + '\n';
md += `\n## c) 빌드 영향력 — 보통 판에서 끝났을 때 유물 수\n\n| 구분 | 판 수 | 최고 순자산 중앙값 |\n|---|---|---|\n| 유물 0개 | ${g0.length} | ${fmt(median(g0))} |\n| 곱하기 유물 3개+ | ${g3.length} | ${fmt(median(g3))} |\n\n차이(log10): **${buildGap.toFixed(2)}** (= ×${Math.pow(10, buildGap).toFixed(1)})\n`;
const seedSpread = median(rowsB.map(r => r.logStd));
const luck = priceShare > 0.5 || seedSpread > buildGap;
md += `\n## 판정\n\n- 가격 손익 비중(판 중앙값) ${pct(priceShare)} (기준 50%)\n- 시드 분산(고정 빌드 log10 표준편차 중앙) ${seedSpread.toFixed(2)} vs 빌드 영향력 ${buildGap.toFixed(2)}\n- → **${luck ? '운 게임 상태' : '빌드가 결과를 만든다'}**\n`;
console.log(md);
if(opt.md) fs.writeFileSync(opt.md, md);
if(opt.json) fs.writeFileSync(opt.json, JSON.stringify({ set: opt.set, rowsA, rowsB, g0: median(g0), g3: median(g3), buildGap, seedSpread, priceShare }, null, 1));
