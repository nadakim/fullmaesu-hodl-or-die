#!/usr/bin/env node
/* 성장형 유물 폭주 점검 — node sim/growth-check.js [--n 300]
   1) 유물 하나를 판 시작에 강제 지급한 random 전략 vs 지급 안 한 random (같은 시드) → 클리어율 차이, 최종·최대 스택
      +25%p 이상이면 과한 것으로 표시 (수치는 바꾸지 않는다)
   2) growthFirst(성장형 유물 최우선 선택) 자연 획득 판의 유물별 평균 최종 스택·최대 스택 */
const loadEngine = require('./load-engine.js');
const S = require('./strategies.js');
const { playGame } = require('./runner.js');
const args = process.argv.slice(2);
const n = args[0] === '--n' ? parseInt(args[1], 10) : 300;
const E = loadEngine();
const seeds = Array.from({ length: n }, (_, i) => i + 1);
const pct = x => (100 * x).toFixed(1) + '%';
const clear = gs => gs.filter(g => g.endCause === 'VICTORY').length / gs.length;
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const base = seeds.map(s => playGame(E, S.random, s));
const rows = {};
S.GROWTH_RELICS.forEach(id => {
  const strat = Object.assign({}, S.random, { onStart: En => En.gainRelic(id, 'test') });
  const gs = seeds.map(s => playGame(E, strat, s));
  const st = gs.map(g => (g.growth.find(x => x.id === id) || { stacks: 0, best: 0 }));
  const d = clear(gs) - clear(base);
  rows[id] = { '지급 없음': pct(clear(base)), '1주차 지급': pct(clear(gs)), '차이': (d >= 0 ? '+' : '') + (100 * d).toFixed(1) + 'p' + (d >= 0.25 ? ' ⚠ 과함' : ''),
               '평균 생존 주': avg(gs.map(g => g.weeksCleared)).toFixed(2), '평균 최종 스택': avg(st.map(x => x.stacks)).toFixed(1),
               '평균 최고 스택': avg(st.map(x => x.best)).toFixed(1), '최대 스택': Math.max(...st.map(x => x.best)).toFixed(0) };
});
console.log(`\n== 성장형 유물 1개를 1주차에 강제 지급 (random 전략, ${n}판, 같은 시드) ==  ※ 저금통 스택 = 적립금(만원)`);
console.table(rows);

const gf = seeds.map(s => playGame(E, S.growthFirst, s));
const nat = {};
S.GROWTH_RELICS.forEach(id => {
  const own = gf.filter(g => g.growth.some(x => x.id === id)), st = own.map(g => g.growth.find(x => x.id === id));
  nat[id] = { '획득 판': own.length, '획득 판 클리어': own.length ? pct(clear(own)) : '-', '평균 최종 스택': avg(st.map(x => x.stacks)).toFixed(1),
              '평균 최고 스택': avg(st.map(x => x.best)).toFixed(1), '최대 스택': st.length ? Math.max(...st.map(x => x.best)).toFixed(0) : '-' };
});
console.log(`== growthFirst ${n}판: 자연 획득 (클리어 ${pct(clear(gf))}, random ${pct(clear(base))}) ==  ※ 획득 판 클리어는 오래 산 판일수록 유물을 더 얻는 편향이 있다`);
console.table(nat);
