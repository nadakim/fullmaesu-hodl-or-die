#!/usr/bin/env node
/* 보스 주간 점검 (S9-47): runner 결과 JSON으로 보스별 생존율을 잰다.
   node sim/boss-check.js <보스 켬 결과.json> [<보스 끔 결과.json>] [--md 표.md]
   - 보스 켬 결과: node sim/runner.js --n 500 --out sim/results/xxx.json
   - 보스 끔 결과(대조): node sim/runner.js --n 500 --set BOSS_WEEKS_ON=false --out sim/results/yyy.json
   생존율 = 그 보스 주에 들어간 판 중 그 주 결산을 통과한 비율. 대조 = 보스 없이 같은 주차에 들어간 판의 통과율.
   판정 기준 (MASTER_PLAN S9): 모든 전략 생존 90%↑ = 약함, 20%↓ = 강함 */
const fs = require('fs');
const args = process.argv.slice(2);
const mdIdx = args.indexOf('--md');
const mdOut = mdIdx >= 0 ? args.splice(mdIdx, 2)[1] : '';
const [withFile, withoutFile] = args;
if(!withFile) throw new Error('사용법: node sim/boss-check.js <보스 켬.json> [<보스 끔.json>] [--md out.md]');
const loadEngine = require('./load-engine.js');
const E = loadEngine();
const BOSS = {}; E.BOSSES.forEach(b => { BOSS[b.id] = b; });
const A = JSON.parse(fs.readFileSync(withFile, 'utf8'));
const B = withoutFile ? JSON.parse(fs.readFileSync(withoutFile, 'utf8')) : null;
const strategies = A.meta.strategies;
const MIN_N = 10;   // 이보다 적게 들어간 칸은 '-' (표본 부족)

// 보스별·전략별: 들어간 판 · 통과한 판 (그 주차에 도달 = weeksCleared ≥ 주차 − 1)
const cell = {}, week = {};
strategies.forEach(st => {
  A.games[st].forEach(g => {
    Object.keys(g.bossPlan || {}).forEach(w => {
      const id = g.bossPlan[w], wk = +w;
      if(g.weeksCleared < wk - 1) return;
      const k = id + '|' + st;
      cell[k] = cell[k] || { in: 0, pass: 0 };
      cell[k].in++;
      if(g.weeksCleared >= wk) cell[k].pass++;
      week[id] = week[id] || {};
      week[id][wk] = (week[id][wk] || 0) + 1;
    });
  });
});
// 대조: 보스 없이 w주에 들어간 판의 통과율 (전략별)
const baseRate = (st, w) => {
  if(!B || !B.games[st]) return null;
  const gs = B.games[st].filter(g => g.weeksCleared >= w - 1);
  return gs.length ? gs.filter(g => g.weeksCleared >= w).length / gs.length : null;
};
const pct = x => x === null || x === undefined ? '-' : (100 * x).toFixed(0) + '%';
const ids = E.BOSSES.map(b => b.id);
const rows = [];
ids.forEach(id => {
  const b = BOSS[id];
  let tin = 0, tpass = 0, baseSum = 0, baseW = 0;
  const per = {};
  strategies.forEach(st => {
    const c = cell[id + '|' + st];
    if(!c){ per[st] = null; return; }
    tin += c.in; tpass += c.pass;
    per[st] = c.in >= MIN_N ? c.pass / c.in : null;
    // 대조: 이 보스가 나온 주차 분포대로 가중
    Object.keys(week[id] || {}).forEach(w => {
      const r = baseRate(st, +w);
      if(r !== null){ const share = (A.games[st].filter(g => g.bossPlan && g.bossPlan[w] === id && g.weeksCleared >= +w - 1).length); baseSum += r * share; baseW += share; }
    });
  });
  const surv = tin ? tpass / tin : null, base = baseW ? baseSum / baseW : null;
  const vals = strategies.map(st => per[st]).filter(v => v !== null);
  const verdict = vals.length && vals.every(v => v >= 0.9) ? '약함 (전부 90%↑)' : vals.length && vals.every(v => v <= 0.2) ? '강함 (전부 20%↓)' : '';
  rows.push({ id, b, tin, surv, base, per, verdict });
});

const head = ['보스', '종류', '들어간 판', '생존', '대조(보스 없음)', '차이'].concat(strategies).concat(['판정']);
const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
rows.forEach(r => {
  lines.push('| ' + [r.b.icon + ' ' + r.b.name, r.b.final ? '최종' : r.b.counter ? '정산 카운터' : '일반', r.tin, pct(r.surv), pct(r.base),
    r.surv !== null && r.base !== null ? ((r.surv - r.base) * 100 >= 0 ? '+' : '') + ((r.surv - r.base) * 100).toFixed(0) + '%p' : '-']
    .concat(strategies.map(st => pct(r.per[st]))).concat([r.verdict]).join(' | ') + ' |');
});
// 전략별 가장 치명적인 보스 (생존율 최저, 표본 MIN_N 이상)
const worst = ['| 전략 | 가장 치명적인 보스 | 생존 | 가장 쉬운 보스 | 생존 |', '|---|---|---|---|---|'];
strategies.forEach(st => {
  const xs = rows.filter(r => r.per[st] !== null).map(r => [r, r.per[st]]).sort((a, b) => a[1] - b[1]);
  if(!xs.length){ worst.push(`| ${st} | - | - | - | - |`); return; }
  const lo = xs[0], hi = xs[xs.length - 1];
  worst.push(`| ${st} | ${lo[0].b.icon} ${lo[0].b.name} | ${pct(lo[1])} | ${hi[0].b.icon} ${hi[0].b.name} | ${pct(hi[1])} |`);
});
const out = `## 보스별 생존율 (${A.meta.n}판 × 전략 ${strategies.length}개, 표본 ${MIN_N}판 미만 = '-')\n\n${lines.join('\n')}\n\n## 전략별 가장 치명적인 보스\n\n${worst.join('\n')}\n`;
console.log(out);
if(mdOut) fs.writeFileSync(mdOut, out);
