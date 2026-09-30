/* 밸런스 측정 지표 (docs/design/BALANCE_METRICS.md): sim/runner.js 결과 JSON 하나 → 마크다운 표.
   node sim/metrics.js 결과.json [--md out.md] [--strategies a,b,...]
   1) 운 의존도 luckTable     — 곱하기(xmult) 유물을 처음 얻은 주차별 클리어율 (게임 기록 xmultWeek)
   2) 주간 여유 marginTable   — 주 결산 순자산 ÷ 그 주 고정 목표(ROUND_TARGETS) 중앙값·p90 · growthTable 주 시작 → 결산 성장 배수
   3) 상점 shopTable          — 주차별 입장 비자금·구매·의미 있는 구매(유물·희귀 이상 낱장·팩·카드 제거, 리롤 제외)·퇴장 잔액·이월 비율
   4) 천장 ceilingTable       — 상위 10% 판의 최고 순자산 ÷ 최종 목표
   함수는 compare.js·boss-check.js에서도 쓴다 (require('./metrics.js')). 표본이 MIN_N판 미만인 칸은 '-'. */
const fs = require('fs');

const MIN_N = 5;                 // 칸 표본 하한
const LUCK_GAP = 0.30;           // 이른 획득(1~2주) 클리어 − 못 얻음 클리어가 이 이상이고
const LUCK_NEVER_MAX = 0.05;     // 못 얻은 판 클리어가 이 이하면 → "드랍 운으로 승패가 갈림"
const WEEKS = 8;

const win = g => g.endReason === 'VICTORY' || g.endCause === 'VICTORY';
const pct = v => (v * 100).toFixed(1) + '%';
const q = (xs, f) => { if(!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const fx = v => !isFinite(v) ? '-' : v >= 1e6 ? v.toExponential(2) : v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2);
const targetsOf = res => (res.meta && res.meta.targets) || [];
const namesOf = (res, only) => (only && only.length ? only : (res.meta && res.meta.strategies) || Object.keys(res.games)).filter(s => res.games[s]);

/* 1) 운 의존도: 획득 주차 칸 = 시작(0) · 1~8주 · 못 얻음 */
function luckTable(res, only){
  const out = ['| 전략 | 판 | 시작부터 | ' + Array.from({ length: WEEKS }, (_, i) => `${i + 1}주`).join(' | ') + ' | 못 얻음 | 판정 |',
               '|---|---|---|' + '---|'.repeat(WEEKS) + '---|---|'];
  namesOf(res, only).forEach(s => {
    const gs = res.games[s];
    if(!gs.length || !('xmultWeek' in gs[0])) return;
    const cell = f => { const xs = gs.filter(f); return xs.length < MIN_N ? { t: '-', v: null } : { t: `${pct(xs.filter(win).length / xs.length)} (${xs.length})`, v: xs.filter(win).length / xs.length }; };
    const start = cell(g => g.xmultWeek === 0), weeks = Array.from({ length: WEEKS }, (_, i) => cell(g => g.xmultWeek === i + 1)), never = cell(g => g.xmultWeek === null);
    const early = cell(g => g.xmultWeek !== null && g.xmultWeek <= 2);
    const luck = early.v !== null && never.v !== null && early.v - never.v >= LUCK_GAP && never.v <= LUCK_NEVER_MAX;
    out.push(`| ${s} | ${gs.length} | ${start.t} | ${weeks.map(c => c.t).join(' | ')} | ${never.t} | ${luck ? '⚠ 드랍 운으로 승패가 갈림' : ''} |`);
  });
  return out.join('\n');
}

/* 2) 주간 여유 배수: 주 결산 순자산 ÷ 그 주 고정 목표 (그 주 결산에 도달한 판만) */
function marginTable(res, only){
  const T = targetsOf(res);
  const out = ['| 전략 | ' + Array.from({ length: WEEKS }, (_, i) => `${i + 1}주 중앙 / p90`).join(' | ') + ' |', '|---|' + '---|'.repeat(WEEKS)];
  namesOf(res, only).forEach(s => {
    const cols = Array.from({ length: WEEKS }, (_, w) => {
      const xs = res.games[s].filter(g => g.weekEq && g.weekEq.length > w).map(g => g.weekEq[w] / T[w]);
      return xs.length < MIN_N ? '-' : `×${fx(q(xs, 0.5))} / ×${fx(q(xs, 0.9))}`;
    });
    out.push(`| ${s} | ${cols.join(' | ')} |`);
  });
  return out.join('\n');
}
/* 주 시작 → 주 결산 순자산 성장 배수 (weekEq[w] ÷ weekStartEq[w]) */
function growthTable(res, only){
  const out = ['| 전략 | ' + Array.from({ length: WEEKS }, (_, i) => `${i + 1}주 중앙 / p90`).join(' | ') + ' | 필요 배수 (목표 ÷ 전주 목표) |', '|---|' + '---|'.repeat(WEEKS) + '---|'];
  const T = targetsOf(res);
  const need = T.map((t, i) => (i ? t / T[i - 1] : t / 10000));
  namesOf(res, only).forEach(s => {
    const cols = Array.from({ length: WEEKS }, (_, w) => {
      const xs = res.games[s].filter(g => g.weekEq && g.weekStartEq && g.weekEq.length > w && g.weekStartEq[w] > 0).map(g => g.weekEq[w] / g.weekStartEq[w]);
      return xs.length < MIN_N ? '-' : `×${fx(q(xs, 0.5))} / ×${fx(q(xs, 0.9))}`;
    });
    out.push(`| ${s} | ${cols.join(' | ')} | ${need.map(v => '×' + fx(v)).join(' ')} |`);
  });
  return out.join('\n');
}

/* 3) 상점: 주차별 (전략 합산 또는 지정 전략) */
function shopTable(res, only){
  const rows = {};
  namesOf(res, only).forEach(s => res.games[s].forEach(g => (g.shop || []).forEach(x => { (rows[x.week] = rows[x.week] || []).push(x); })));
  const out = ['| 주차 | 입장 판 | 입장 비자금 중앙 / 평균 | 구매 수 | 의미 있는 구매 | 리롤 | 퇴장 잔액 평균 | 이월 비율 (잔액 ÷ 입장) | 의미 있는 구매 0회 판 |', '|---|---|---|---|---|---|---|---|---|'];
  Object.keys(rows).map(Number).sort((a, b) => a - b).forEach(w => {
    const xs = rows[w], n = xs.length, avg = f => xs.reduce((a, x) => a + f(x), 0) / n;
    const hasM = 'meaningful' in xs[0];
    out.push(`| ${w} | ${n} | ${fx(q(xs.map(x => x.entry), 0.5))} / ${fx(avg(x => x.entry))} | ${avg(x => x.buys).toFixed(2)} | ${hasM ? avg(x => x.meaningful).toFixed(2) : '-'} | ${avg(x => x.rerolls || 0).toFixed(2)} | ${fx(avg(x => x.exit))} | ${pct(avg(x => (x.entry > 0 ? x.exit / x.entry : 0)))} | ${hasM ? pct(xs.filter(x => !x.meaningful).length / n) : '-'} |`);
  });
  return out.join('\n');
}

/* 4) 천장: 상위 10% 판의 최고 순자산 ÷ 최종 목표 */
function ceilingTable(res, only){
  const T = targetsOf(res), last = T[T.length - 1];
  const out = ['| 전략 | 클리어 | 최고 순자산 중앙 ÷ 최종 목표 | 상위 10% ÷ 최종 목표 | 최대 ÷ 최종 목표 |', '|---|---|---|---|---|'];
  namesOf(res, only).forEach(s => {
    const gs = res.games[s], p = gs.map(g => g.peakEquity / last);
    out.push(`| ${s} | ${pct(gs.filter(win).length / gs.length)} | ×${fx(q(p, 0.5))} | ×${fx(q(p, 0.9))} | ×${fx(q(p, 1))} |`);
  });
  return out.join('\n');
}

function report(res, only){
  return ['### 1) 운 의존도 — 곱하기 유물 첫 획득 주차별 클리어율 (칸 = 클리어율 (판 수), 표본 ' + MIN_N + '판 미만 \'-\')', '', luckTable(res, only), '',
          `판정: 1~2주에 얻은 판 클리어 − 못 얻은 판 클리어 ≥ ${LUCK_GAP * 100}%p 이고 못 얻은 판 클리어 ≤ ${LUCK_NEVER_MAX * 100}%면 '드랍 운으로 승패가 갈림'.`, '',
          '### 2) 주간 여유 배수 — 주 결산 순자산 ÷ 그 주 고정 목표', '', marginTable(res, only), '',
          '### 2b) 주 성장 배수 — 주 시작 → 주 결산 순자산', '', growthTable(res, only), '',
          '### 3) 상점 — 주차별 (전략 합산)', '', shopTable(res, only), '',
          '### 4) 천장 — 최고 순자산 ÷ 최종 목표', '', ceilingTable(res, only)].join('\n');
}

module.exports = { luckTable, marginTable, growthTable, shopTable, ceilingTable, report, MIN_N };

if(require.main === module){
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
  const md = opt('md'), only = (opt('strategies') || '').split(',').filter(Boolean);
  if(!args[0]){ console.error('사용: node sim/metrics.js 결과.json [--md out.md] [--strategies a,b]'); process.exit(1); }
  const text = report(JSON.parse(fs.readFileSync(args[0], 'utf8')), only);
  console.log(text);
  if(md) fs.writeFileSync(md, text + '\n');
}
