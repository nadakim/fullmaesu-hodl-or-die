/* 규칙 파괴형 유물 점검 (docs/design/RULE_BREAKER_RELICS.md): 켬/끔 결과 JSON 두 개로
   유물별 채택률(판 중 한 번이라도 가짐, relicsEver) · 채택한 판의 클리어율 vs 같은 전략·시드의 끔 판 클리어율(짝 비교 → 선택 편향을 줄인다) ·
   채택한 판의 하루 최대 배수 · 폭주 시드(하루 배수 > MULT_LIMIT 또는 최고 순자산 > EQUITY_LIMIT)를 표로 낸다. 수치는 바꾸지 않는다 (조정안은 사람이).
   사용: node sim/rule-breaker-check.js <켬.json> <끔.json> [--md out.md] */
const fs = require('fs');
const args = process.argv.slice(2);
const [onFile, offFile] = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--md');
const mdOut = args.indexOf('--md') >= 0 ? args[args.indexOf('--md') + 1] : '';
if(!onFile || !offFile){ console.error('사용: node sim/rule-breaker-check.js <켬.json> <끔.json> [--md out.md]'); process.exit(1); }

const IDS = ['oath', 'scalper', 'water', 'contrarian', 'yoloLoan', 'focus', 'lastTrain', 'cashGang', 'cult', 'tipBro'];
const NAMES = { oath: '💎 존버 서약서', scalper: '⚡ 단타 중독', water: '🌊 물타기 장인', contrarian: '🐜 인간 역지표', yoloLoan: '🏦 영끌 대출',
                focus: '🧲 몰아주기', lastTrain: '🚂 막차 탑승', cashGang: '🕳️ 무소유 투자법', cult: '🙏 풀매수 교주', tipBro: '🎰 찌라시 확신범' };
const MULT_LIMIT = 1e12;     // 하루 정산 배수 상한 (설계 문서 기준 — 넘으면 '폭주 시드')
const EQUITY_LIMIT = 1e16;   // 최고 순자산 상한 (만원, = 1해 원)
const FLAG_UP = 0.20, FLAG_DOWN = -0.10;   // 채택 시 클리어율 변화가 이 범위를 벗어나면 표시

const on = JSON.parse(fs.readFileSync(onFile, 'utf8')), off = JSON.parse(fs.readFileSync(offFile, 'utf8'));
const win = g => g.endReason === 'VICTORY';
const offBy = {};
Object.keys(off.games).forEach(s => off.games[s].forEach(g => { offBy[s + '/' + g.seed] = g; }));
const all = [];
Object.keys(on.games).forEach(s => on.games[s].forEach(g => all.push({ s, g, o: offBy[s + '/' + g.seed] })));
const pct = v => (v * 100).toFixed(1) + '%';
const fmt = v => v >= 1e6 ? v.toExponential(2) : v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2);

const rows = IDS.map(id => {
  const had = all.filter(x => (x.g.relicsEver || x.g.relics).indexOf(id) >= 0);
  const paired = had.filter(x => x.o);
  const clearOn = had.length ? had.filter(x => win(x.g)).length / had.length : 0;
  const clearOff = paired.length ? paired.filter(x => win(x.o)).length / paired.length : 0;
  const d = clearOn - clearOff;
  const mults = had.map(x => x.g.maxSettleMult || 1).sort((a, b) => a - b);
  const bot = had.filter(x => x.s === 'ruleBreakerBuild');
  return { id, n: had.length, adopt: had.length / all.length, clearOn, clearOff, d, flag: d >= FLAG_UP ? '▲ +20%p↑' : d <= FLAG_DOWN ? '▼ −10%p↓' : '',
           p90: mults.length ? mults[Math.floor(mults.length * 0.9)] : 1, max: mults.length ? mults[mults.length - 1] : 1,
           botN: bot.length, botClear: bot.length ? bot.filter(x => win(x.g)).length / bot.length : 0 };
});
const runaway = all.filter(x => (x.g.maxSettleMult || 1) > MULT_LIMIT || x.g.peakEquity > EQUITY_LIMIT)
  .sort((a, b) => (b.g.maxSettleMult || 1) - (a.g.maxSettleMult || 1));

const out = [];
out.push(`| 유물 | 채택률 (판 ${all.length}) | 채택한 판 클리어 | 같은 판 끔 클리어 | 차이 | 표시 | 하루 최대 배수 (상위10% / 최대) | ruleBreakerBuild 채택 판 클리어 |`);
out.push('|---|---|---|---|---|---|---|---|');
rows.forEach(r => out.push(`| ${NAMES[r.id]} | ${pct(r.adopt)} (${r.n}) | ${pct(r.clearOn)} | ${pct(r.clearOff)} | ${r.d >= 0 ? '+' : ''}${(r.d * 100).toFixed(1)}%p | ${r.flag} | ×${fmt(r.p90)} / ×${fmt(r.max)} | ${r.botN ? pct(r.botClear) + ` (${r.botN})` : '—'} |`));
out.push('');
out.push(`폭주 시드 (하루 배수 > ×${MULT_LIMIT.toExponential(0)} 또는 최고 순자산 > ${EQUITY_LIMIT.toExponential(0)}만): ${runaway.length}판 / ${all.length}`);
if(runaway.length){
  out.push('');
  out.push('| 전략 | 시드 | 하루 최대 배수 | 최고 순자산(만) | 결과 | 규칙 파괴 유물 |');
  out.push('|---|---|---|---|---|---|');
  runaway.slice(0, 15).forEach(x => out.push(`| ${x.s} | ${x.g.seed} | ×${fmt(x.g.maxSettleMult)} | ${fmt(x.g.peakEquity)} | ${x.g.endReason} | ${(x.g.relicsEver || x.g.relics).filter(id => IDS.indexOf(id) >= 0).map(id => NAMES[id]).join(' ')} |`));
  if(runaway.length > 15) out.push(`| … | 외 ${runaway.length - 15}판 | | | | |`);
}
const text = out.join('\n');
console.log(text);
if(mdOut) fs.writeFileSync(mdOut, text + '\n');
