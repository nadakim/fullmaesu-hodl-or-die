#!/usr/bin/env node
/* 읽을 수 있는 시장 실측 — 표시한 확률이 실제 확률과 같은지 확인한다 (표시 확률 = 실제 확률).
   node sim/signal-check.js [--n 300] [--strategy random]
   1) 시그널 적중률: 장 마감 'signalsResolved'를 정확도(acc)별로 모아 적중 비율 → SIGNAL_ACCURACY(0.65)·+20%p(0.85)·공개(1.0)와 비교
   2) 루머 뉴스: 개장 'newsResolved'에서 루머가 사실이 된 비율 → NEWS_RUMOR_CHANCE
   3) 시그널의 값: 표시 시그널별 그날 종목 등락률 평균 (장전 가격 → 장 마감 가격) — 시그널이 실제로 돈이 되는 정보인지 */
const loadEngine = require('./load-engine.js');
const STRATEGIES = require('./strategies.js');
const { playGame } = require('./runner.js');

const args = process.argv.slice(2);
const opt = { n: 300, strategy: 'random' };
for(let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const n = parseInt(opt.n, 10);

const E = loadEngine();
const acc = {}, rumor = { hit: 0, all: 0 }, confirmed = { hit: 0, all: 0 }, bySignal = {}, byActual = {};
const listener = (() => {
  let open = {}, shown = {};
  return (type, d) => {
    if(type === 'dayStart'){ open = {}; shown = {}; E.STOCKS.forEach(s => { open[s.id] = E.assets[s.id].price; }); }
    if(type === 'marketOpen'){ Object.keys(E.run.signals).forEach(id => { shown[id] = E.run.signals[id].shown; }); }
    if(type === 'newsResolved'){ const b = E.NEWS_BY_ID[d.id].reliability === 'rumor' ? rumor : confirmed; b.all++; if(d.active) b.hit++; }
    if(type === 'signalsResolved'){
      Object.keys(d.results).forEach(id => {
        const r = d.results[id], k = r.acc.toFixed(2);
        acc[k] = acc[k] || { hit: 0, all: 0 };
        acc[k].all++; if(r.hit) acc[k].hit++;
        if(open[id] && shown[id]){
          const ret = E.assets[id].price / open[id] - 1;
          (bySignal[shown[id]] = bySignal[shown[id]] || []).push(ret);
          (byActual[r.actual] = byActual[r.actual] || []).push(ret);
        }
      });
    }
  };
})();
E.setEventListener(listener);
for(let seed = 1; seed <= n; seed++) playGame(E, STRATEGIES[opt.strategy], seed);

const pct = x => (100 * x).toFixed(1) + '%';
console.log(`\n== 시그널 적중률 (${opt.strategy} ${n}판) ==`);
console.table(Object.fromEntries(Object.keys(acc).sort().map(k => [`표시 ${pct(+k)}`, { '표본': acc[k].all, '실측 적중률': pct(acc[k].hit / acc[k].all) }])));
console.log('== 뉴스 판정 ==');
console.table({ ['루머 (표시 ' + pct(E.NEWS_RUMOR_CHANCE) + ')']: { '표본': rumor.all, '사실 비율': pct(rumor.hit / rumor.all) },
                '확정 (표시 100%)': { '표본': confirmed.all, '사실 비율': pct(confirmed.hit / confirmed.all) } });
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log('== 그날 종목 등락률 (장전 → 장 마감, 인버스 제외. 평균은 밈코인·초전도체 고변동이 끌어올린다 → 중앙값도 본다) ==');
console.table(Object.fromEntries(E.REGIMES.map(r => [r, {
  '표시 기준 평균': bySignal[r] ? pct(mean(bySignal[r])) : '-', '표시 기준 중앙값': bySignal[r] ? pct(median(bySignal[r])) : '-', '표본(표시)': bySignal[r] ? bySignal[r].length : 0,
  '실제 기준 평균': byActual[r] ? pct(mean(byActual[r])) : '-', '실제 기준 중앙값': byActual[r] ? pct(median(byActual[r])) : '-', '표본(실제)': byActual[r] ? byActual[r].length : 0 }])));
