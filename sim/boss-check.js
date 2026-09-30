#!/usr/bin/env node
/* 보스 주간 점검 (S9-47): runner 결과 JSON으로 보스별 생존율을 잰다.
   node sim/boss-check.js <보스 켬 결과.json> [<보스 끔 결과.json>] [--md 표.md] [--metrics]
   - 보스 켬 결과: node sim/runner.js --n 500 --out sim/results/xxx.json
   - 보스 끔 결과(대조): node sim/runner.js --n 500 --set BOSS_WEEKS_ON=false --out sim/results/yyy.json
   생존율 = 그 보스 주에 들어간 판 중 그 주 결산을 통과한 비율. 대조 = 보스 없이 같은 주차에 들어간 판의 통과율.
   판정 기준 (MASTER_PLAN S9): 모든 전략 생존 90%↑ = 약함, 20%↓ = 강함
   빌드 카운터(BOSSES[].build): 표적(보스 주 시작 때 targets 유물 보유) / 비표적으로 나눠 대조군 대비 차이 (sim/boss-split.js).
   기준: 표적 −25~−40%p, 비표적 ±5%p 이내 */
const fs = require('fs');
const args = process.argv.slice(2);
const metIdx = args.indexOf('--metrics'), withMetrics = metIdx >= 0;   // --metrics: 운 의존도·주간 여유 배수 표도 (sim/metrics.js)
if(withMetrics) args.splice(metIdx, 1);
const mdIdx = args.indexOf('--md');
const mdOut = mdIdx >= 0 ? args.splice(mdIdx, 2)[1] : '';
const [withFile, withoutFile] = args;
if(!withFile) throw new Error('사용법: node sim/boss-check.js <보스 켬.json> [<보스 끔.json>] [--md out.md]');
const loadEngine = require('./load-engine.js');
const A = JSON.parse(fs.readFileSync(withFile, 'utf8'));
const E = loadEngine(undefined, (A.meta && A.meta.overrides) || {});   // 켬 결과의 --set을 그대로 (예: BOSS_COUNTERS_ON=true면 빌드 카운터 목록도)
const BOSS = {}; E.BOSSES.forEach(b => { BOSS[b.id] = b; });
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
const kindLabel = b => b.final ? '최종' : b.build ? '빌드 카운터' : b.counter ? '정산 카운터' : '일반';
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
  lines.push('| ' + [r.b.icon + ' ' + r.b.name, kindLabel(r.b), r.tin, pct(r.surv), pct(r.base),
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
// 빌드 카운터 — 표적 / 비표적
const { targetSplit } = require('./boss-split.js');
const TARGET_BAND = [-0.40, -0.25], OTHER_BAND = 0.05;
const sp = x => x === null ? '-' : ((x * 100 >= 0 ? '+' : '') + (x * 100).toFixed(0) + '%p');
const nameOf = id => (E.RELIC_BY_ID[id] ? E.RELIC_BY_ID[id].icon + ' ' + E.RELIC_BY_ID[id].name : id);
const builds = E.BOSSES.filter(b => b.build);
const split = ['| 보스 | 표적 유물 | 표적 판 | 표적 생존 | 대조 | 차이 | 비표적 판 | 비표적 생존 | 대조 | 차이 | 판정 (표적 −25~−40%p · 비표적 ±5%p) |', '|---|---|---|---|---|---|---|---|---|---|---|'];
builds.forEach(b => {
  const r = targetSplit(A, B, b);
  const tOk = r.target.diff !== null && r.target.diff <= TARGET_BAND[1] && r.target.diff >= TARGET_BAND[0];
  const nOk = r.other.diff !== null && Math.abs(r.other.diff) <= OTHER_BAND;
  const tv = r.target.diff === null ? '표본 없음' : r.target.diff > TARGET_BAND[1] ? '표적 약함' : r.target.diff < TARGET_BAND[0] ? '표적 과함' : '표적 OK';
  const nv = r.other.diff === null ? '' : nOk ? '비표적 OK' : r.other.diff < 0 ? '비표적 과함' : '비표적 +';
  split.push(`| ${b.icon} ${b.name} | ${b.targets.map(nameOf).join('·')} | ${r.target.n} | ${pct(r.target.surv)} | ${pct(r.target.base)} | ${sp(r.target.diff)} | ${r.other.n} | ${pct(r.other.surv)} | ${pct(r.other.base)} | ${sp(r.other.diff)} | ${tOk && nOk ? '✅ ' : ''}${tv} · ${nv} |`);
});
// 빌드 카운터 4종 중 전략별 가장 치명적인 보스
const worstB = ['| 전략 | 가장 치명적인 카운터 | 생존 | 대조 | 차이 |', '|---|---|---|---|---|'];
strategies.forEach(st => {
  const xs = rows.filter(r => r.b.build && r.per[st] !== null).map(r => [r, r.per[st], targetSplit(A, B, r.b, [st])]).sort((a, b) => a[1] - b[1]);
  if(!xs.length){ worstB.push(`| ${st} | - | - | - | - |`); return; }
  const lo = xs[0], all = lo[2], sum = (all.target.n + all.other.n) || 1;
  const base = all.target.base === null && all.other.base === null ? null : ((all.target.base || 0) * all.target.n + (all.other.base || 0) * all.other.n) / sum;
  worstB.push(`| ${st} | ${lo[0].b.icon} ${lo[0].b.name} | ${pct(lo[1])} | ${pct(base)} | ${sp(base === null ? null : lo[1] - base)} |`);
});
const counterOut = builds.length ? `\n## 빌드 카운터 — 표적 / 비표적 (표적 = 보스 주 시작 때 표적 유물 보유, 대조 = 보스 끔·같은 전략·주차·표적 여부)\n\n${split.join('\n')}\n\n## 빌드 카운터 — 전략별 가장 치명적인 보스\n\n${worstB.join('\n')}\n` : '';
const out = `## 보스별 생존율 (${A.meta.n}판 × 전략 ${strategies.length}개, 표본 ${MIN_N}판 미만 = '-')\n\n${lines.join('\n')}\n\n## 전략별 가장 치명적인 보스\n\n${worst.join('\n')}\n${counterOut}`;
console.log(out);
if(mdOut) fs.writeFileSync(mdOut, out);

if(withMetrics){
  const M = require('./metrics.js');
  [['보스 켬', A], ['보스 끔', B]].forEach(([label, r]) => {
    if(!r) return;
    console.log(`\n### ${label} — 운 의존도\n\n${M.luckTable(r)}\n\n### ${label} — 주간 여유 배수\n\n${M.marginTable(r)}`);
  });
}
