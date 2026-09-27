/* 두 결과 JSON(sim/runner.js --out) 비교 → 마크다운 표 (PR 보고용)
   node sim/compare.js 변경전.json 변경후.json
   판 목록(games)에서 다시 계산하므로 지표가 없던 옛 결과 파일도 비교된다. */
const fs = require('fs');
const [a, b] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
if(!a || !b){ console.error('사용법: node sim/compare.js before.json after.json'); process.exit(1); }

const BUST = ['YOLO_BUST', 'MARGIN_CALL', 'SHORT_SQUEEZE', 'DEBT_SPIRAL'];
const q = (xs, f) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
function stats(games){
  const n = games.length, count = f => games.filter(f).length / n, avg = f => games.reduce((s, g) => s + f(g), 0) / n;
  const peaks = games.map(g => g.peakEquity), mults = games.map(g => g.maxSettleMult || 1);
  const causes = {};
  games.forEach(g => { causes[g.endCause] = (causes[g.endCause] || 0) + 1; });
  return {
    clear: count(g => g.endCause === 'VICTORY'), bust: count(g => BUST.indexOf(g.endCause) >= 0),
    weeks: avg(g => g.weeksCleared), liq: avg(g => g.liquidations),
    peakMed: q(peaks, 0.5), peakP90: q(peaks, 0.9), peakMax: q(peaks, 1), multMax: q(mults, 1), multP90: q(mults, 0.9),
    settled: avg(g => g.settledTotal || 0), causes, n
  };
}
const pct = x => (100 * x).toFixed(1) + '%';
const d = (x, y, f) => `${f(x)} → ${f(y)}`;
const num = x => Math.round(x).toLocaleString();

const names = b.meta.strategies.filter(s => a.games[s]);
console.log('| 전략 | 클리어 | 파산 | 평균 생존 주 | 반대매매/판 | 최고 순자산 중앙 | 상위 10% | 최대 | 하루 최대 배수 (상위10%/최대) | 정산 보너스/판 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
names.forEach(s => {
  const x = stats(a.games[s]), y = stats(b.games[s]);
  console.log(`| ${s} | ${d(x.clear, y.clear, pct)} | ${d(x.bust, y.bust, pct)} | ${d(x.weeks, y.weeks, v => v.toFixed(2))} | ${d(x.liq, y.liq, v => v.toFixed(2))} | ${d(x.peakMed, y.peakMed, num)} | ${d(x.peakP90, y.peakP90, num)} | ${d(x.peakMax, y.peakMax, num)} | ×${y.multP90.toFixed(2)} / ×${y.multMax.toFixed(2)} | ${num(y.settled)} |`);
});

console.log('\n엔딩 원인 변화 (전략 합계, 변화가 있는 것만)');
const all = {};
names.forEach(s => ['a', 'b'].forEach(k => {
  const c = stats((k === 'a' ? a : b).games[s]).causes;
  Object.keys(c).forEach(e => { all[e] = all[e] || { a: 0, b: 0 }; all[e][k] += c[e]; });
}));
console.log('| 엔딩 | 변경 전 | 변경 후 |\n|---|---|---|');
Object.keys(all).sort((p, r) => all[r].b - all[p].b).forEach(e => { if(all[e].a !== all[e].b) console.log(`| ${e} | ${all[e].a} | ${all[e].b} |`); });
