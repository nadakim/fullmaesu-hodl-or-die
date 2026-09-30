#!/usr/bin/env node
/* 목표 성장률 실험 점검 (docs/design/TARGET_GROWTH.md): 기준 결과(꺼짐)와 후보 결과들(TARGET_GROWTH_ON=true, K 다름)을 나란히.
   node sim/target-growth-check.js 기준.json 후보1.json [후보2.json …] [--names S1,S2,…] [--md out.md]
   표: 전략별 클리어·평균 생존 주 / 성장 목표가 걸린 주 비율(주 시작 순자산 × K > 고정 목표, 그 주에 들어간 판 기준) /
       꼬리 보존(하루 최대 배수·최고 순자산 상위 10%, 기준 대비 비율) / 제안 기준 판정 */
const fs = require('fs');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
const namesArg = opt('--names'), mdOut = opt('--md');
const [baseFile, ...candFiles] = args;
if(!baseFile || !candFiles.length) throw new Error('사용법: node sim/target-growth-check.js 기준.json 후보.json … [--names S1,…] [--md out.md]');
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const base = load(baseFile), cands = candFiles.map(load);
const names = namesArg ? namesArg.split(',') : candFiles.map((f, i) => 'C' + (i + 1));
const strategies = base.meta.strategies;
const K = r => JSON.parse((r.meta.overrides || {}).TARGET_GROWTH_K || '[1,1,1,1,1,1,1,1]');
const pct = x => (100 * x).toFixed(1) + '%';
const q = (xs, f) => { if(!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const clear = (r, st) => r.games[st].filter(g => g.endCause === 'VICTORY').length / r.games[st].length;
const surv = (r, st) => r.games[st].reduce((s, g) => s + g.weeksCleared, 0) / r.games[st].length;
const out = [];
// 1) 클리어 · 평균 생존 주
out.push('### 전략별 클리어 · 평균 생존 주 (기준 → 후보)\n');
out.push('| 전략 | 기준 | ' + names.join(' | ') + ' |');
out.push('|---|---|' + names.map(() => '---').join('|') + '|');
strategies.forEach(st => out.push(`| ${st} | ${pct(clear(base, st))} · ${surv(base, st).toFixed(2)} | ` + cands.map(c => `${pct(clear(c, st))} · ${surv(c, st).toFixed(2)}`).join(' | ') + ' |'));
// 2) 성장 목표가 걸린 주 비율 (주차별, 전략 합산)
out.push('\n### 성장 목표가 고정 목표보다 큰 주 비율 (그 주에 들어간 판 중, 전략 합산)\n');
const rounds = base.meta.targets.length;
out.push('| 후보 | K | ' + Array.from({ length: rounds - 2 }, (_, i) => `${i + 3}주`).join(' | ') + ' |');
out.push('|---|---|' + Array.from({ length: rounds - 2 }, () => '---').join('|') + '|');
cands.forEach((c, ci) => {
  const k = K(c), T = c.meta.targets, cells = [];
  for(let w = 3; w <= rounds; w++){
    let n = 0, bind = 0;
    strategies.forEach(st => c.games[st].forEach(g => { const eq = g.weekStartEq && g.weekStartEq[w - 1]; if(eq === undefined) return; n++; if(k[w - 1] > 1 && eq * k[w - 1] > T[w - 1]) bind++; }));
    cells.push(n ? `${pct(bind / n)} (${n})` : '-');
  }
  out.push(`| ${names[ci]} | ${k.join(' ')} | ${cells.join(' | ')} |`);
});
// 3) 꼬리 보존: 하루 최대 배수·최고 순자산 상위 10% (후보 ÷ 기준)
out.push('\n### 꼬리 보존 — 상위 10% (후보 ÷ 기준, 50% 이상 = 보존)\n');
out.push('| 전략 | 기준 하루 최대 배수 p90 · 최고 순자산 p90 | ' + names.join(' | ') + ' |');
out.push('|---|---|' + names.map(() => '---').join('|') + '|');
const p90 = (r, st, key) => q(r.games[st].map(g => g[key] || 0), 0.9);
const ratio = (a, b) => (b > 0 ? a / b : 1);
strategies.forEach(st => {
  const bm = p90(base, st, 'maxSettleMult'), bp = p90(base, st, 'peakEquity');
  out.push(`| ${st} | ×${bm.toPrecision(3)} · ${bp.toPrecision(3)} | ` + cands.map(c => {
    const rm = ratio(p90(c, st, 'maxSettleMult'), bm), rp = ratio(p90(c, st, 'peakEquity'), bp);
    return `${pct(rm)} · ${pct(rp)}${rm >= 0.5 && rp >= 0.5 ? '' : ' ⚠'}`;
  }).join(' | ') + ' |');
});
// 4) 제안 기준: 곱하기 빌드 30~40% · 중간 빌드 5~15% · nothing ≤ 2%
const MULT = ['levTowerBuild', 'antFlagBuild'], MID = ['random', 'deckThinner', 'allIn3x', 'manipSpam', 'growthFirst'];
out.push('\n### 제안 기준 (곱하기 빌드 30~40% · 중간 빌드 5~15% · nothing ≤ 2% · 꼬리 보존 50%↑)\n');
out.push('| 후보 | 곱하기 빌드 (levTower · antFlag) | 중간 빌드 평균 (' + MID.join('·') + ') | nothing | 꼬리 보존 (곱하기 빌드 p90 배수·순자산) | 판정 |');
out.push('|---|---|---|---|---|---|');
[['기준', base]].concat(cands.map((c, i) => [names[i], c])).forEach(([nm, r]) => {
  const m = MULT.map(st => clear(r, st)), mid = MID.reduce((s, st) => s + clear(r, st), 0) / MID.length, no = clear(r, 'nothing');
  const tail = MULT.map(st => Math.min(ratio(p90(r, st, 'maxSettleMult'), p90(base, st, 'maxSettleMult')), ratio(p90(r, st, 'peakEquity'), p90(base, st, 'peakEquity'))));
  const okM = m.every(x => x >= 0.3 && x <= 0.4), okMid = mid >= 0.05 && mid <= 0.15, okNo = no <= 0.02, okTail = tail.every(x => x >= 0.5);
  out.push(`| ${nm} | ${m.map(pct).join(' · ')}${okM ? ' ✅' : ''} | ${pct(mid)}${okMid ? ' ✅' : ''} | ${pct(no)}${okNo ? ' ✅' : ''} | ${tail.map(pct).join(' · ')}${okTail ? ' ✅' : ''} | ${[okM, okMid, okNo, okTail].filter(Boolean).length}/4 |`);
});
const text = out.join('\n') + '\n';
console.log(text);
if(mdOut) fs.writeFileSync(mdOut, text);
