#!/usr/bin/env node
/* 빌드 카운터 대비책 실험 (docs/design/BOSS_WEEKS.md '빌드 카운터'): 표적 빌드가 대비책(유물 + 대비 행동)을 가지면 보스 낙폭을 얼마나 회복하나.
   보스마다 표적 전략 1개에 표적 유물을 강제 장착(--force-relics)하고, 대비책 유물을 더한 판(+ --boss-adapt 1)과 비교한다.
     node sim/boss-counter-check.js --plan DIR [--n 800] [--set '...']   → 실행할 runner 명령 목록 (병렬로 돌린다)
     node sim/boss-counter-check.js DIR [--md out.md]                    → 표
   낙폭 = 표적 판의 보스 주 생존 − 대조(보스 끔, 같은 설정) · 회복률 = 1 − 대비책 낙폭 ÷ 대비책 없는 낙폭 (기준: 50% 이상) */
const fs = require('fs');
const path = require('path');
const { targetSplit } = require('./boss-split.js');
const EXPERIMENTS = [   // 표적 전략 · 강제 표적 유물 · 대비책 유물 (BOSSES[].answers.relics 첫 번째)
  { boss: 'posCap',      strategy: 'antFlagBuild',  target: 'antFlag',  answer: 'levTower' },
  { boss: 'levCap',      strategy: 'levTowerBuild', target: 'levTower', answer: 'antFlag' },
  { boss: 'streakReset', strategy: 'oathHold',      target: 'oath',     answer: 'moonSavings' },
  { boss: 'seize',       strategy: 'cultFocus',     target: 'focus',    answer: 'capital' }
];
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : ''; };
const plan = opt('--plan'), n = opt('--n') || '800', set = opt('--set'), mdOut = opt('--md');
const file = (dir, e, v, onOff) => path.join(dir, `${e.boss}.${v}.${onOff}.json`);
if(plan){
  EXPERIMENTS.forEach(e => ['base', 'answer'].forEach(v => ['on', 'off'].forEach(onOff => {
    const relics = v === 'answer' ? `${e.target},${e.answer}` : e.target;
    const sets = [set, onOff === 'off' ? 'BOSS_WEEKS_ON=false' : ''].filter(Boolean).join(';');
    console.log(`node sim/runner.js --n ${n} --strategies ${e.strategy} --force-relics ${relics}${v === 'answer' ? ' --boss-adapt 1' : ''}${sets ? ` --set '${sets}'` : ''} --out ${file(plan, e, v, onOff)}`);
  })));
  process.exit(0);
}
const dir = args[0];
if(!dir) throw new Error('사용법: node sim/boss-counter-check.js DIR [--md out.md] | --plan DIR');
const E = require('./load-engine.js')();
const pct = x => x === null ? '-' : (100 * x).toFixed(0) + '%';
const sp = x => x === null ? '-' : ((x >= 0 ? '+' : '') + (100 * x).toFixed(0) + '%p');
const name = id => E.RELIC_BY_ID[id].icon + ' ' + E.RELIC_BY_ID[id].name;
const lines = ['| 보스 | 표적 전략 (강제 유물) | 대비책 | 대비책 없음: 판 · 생존 / 대조 · 낙폭 | 대비책 있음: 판 · 생존 / 대조 · 낙폭 | 회복률 | 판정 (50%↑) |', '|---|---|---|---|---|---|---|'];
EXPERIMENTS.forEach(e => {
  const load = (v, onOff) => { const f = file(dir, e, v, onOff); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
  const boss = E.BOSS_BY_ID[e.boss];
  const res = ['base', 'answer'].map(v => { const A = load(v, 'on'), B = load(v, 'off'); return A && B ? targetSplit(A, B, boss).target : null; });
  const cell = r => r ? `${r.n} · ${pct(r.surv)} / ${pct(r.base)} · ${sp(r.diff)}` : '-';
  const [b, a] = res;
  const rec = b && a && b.diff !== null && a.diff !== null && b.diff < -0.02 ? 1 - a.diff / b.diff : null;
  const verdict = rec === null ? (b && b.diff !== null && b.diff >= -0.02 ? '낙폭 없음 (측정 불가)' : '-') : rec >= 0.5 ? '✅ 회복' : '회복 부족';
  lines.push(`| ${boss.icon} ${boss.name} | ${e.strategy} (${name(e.target)}) | ${name(e.answer)}${e.boss === 'seize' ? ' + 1번 칸 배치' : ''} | ${cell(b)} | ${cell(a)} | ${rec === null ? '-' : (100 * rec).toFixed(0) + '%'} | ${verdict} |`);
});
const out = lines.join('\n') + '\n';
console.log(out);
if(mdOut) fs.writeFileSync(mdOut, out);
