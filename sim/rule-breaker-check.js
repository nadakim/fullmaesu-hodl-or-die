/* 규칙 파괴형 유물 점검 (docs/design/RULE_BREAKER_RELICS.md): 켬/끔 결과 JSON 두 개로
   유물별 채택률(판 중 한 번이라도 가짐, relicsEver) · 채택한 판의 클리어율 vs 같은 전략·시드의 끔 판 클리어율(짝 비교 → 선택 편향을 줄인다) ·
   채택한 판의 하루 최대 배수 · 폭주 시드(하루 배수 > MULT_LIMIT 또는 최고 순자산 > EQUITY_LIMIT)를 표로 낸다. 수치는 바꾸지 않는다 (조정안은 사람이).
   생존 편향 보정: '3주차 시작 때 가진 판만'(weekRelics[2]) 다시 센 클리어율 — 짝 비교도 같은 판 집합으로.
   아키타입 봇 표: 전략별 클리어·생존 주·핵심 유물 첫 보유 주차·보유 주 수·하루 최대 배수 (켬/끔).
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
  const w3 = all.filter(x => x.g.weekRelics && x.g.weekRelics[2] && x.g.weekRelics[2].indexOf(id) >= 0);   // 3주차 시작 때 가진 판 (2주를 넘긴 판끼리 비교)
  const w3p = w3.filter(x => x.o && x.o.weeksCleared >= 2);   // 짝: 끔 판도 2주를 넘긴 것만
  const w3On = w3.length ? w3.filter(x => win(x.g)).length / w3.length : 0, w3Off = w3p.length ? w3p.filter(x => win(x.o)).length / w3p.length : 0;
  return { id, n: had.length, adopt: had.length / all.length, clearOn, clearOff, d, flag: d >= FLAG_UP ? '▲ +20%p↑' : d <= FLAG_DOWN ? '▼ −10%p↓' : '',
           p90: mults.length ? mults[Math.floor(mults.length * 0.9)] : 1, max: mults.length ? mults[mults.length - 1] : 1,
           botN: bot.length, botClear: bot.length ? bot.filter(x => win(x.g)).length / bot.length : 0,
           w3N: w3.length, w3On, w3Off, w3d: w3On - w3Off, w3flag: !w3.length ? '' : w3On - w3Off >= FLAG_UP ? '▲' : w3On - w3Off <= FLAG_DOWN ? '▼' : '' };
});
const runaway = all.filter(x => (x.g.maxSettleMult || 1) > MULT_LIMIT || x.g.peakEquity > EQUITY_LIMIT)
  .sort((a, b) => (b.g.maxSettleMult || 1) - (a.g.maxSettleMult || 1));

const out = [];
const sgn = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%p';
out.push(`| 유물 | 채택률 (판 ${all.length}) | 채택한 판 클리어 | 같은 판 끔 | 차이 | 표시 | **3주차 시작 보유 판** 클리어 | 같은 판 끔 (2주 넘긴) | 보정 차이 | 표시 | 하루 최대 배수 (상위10% / 최대) |`);
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach(r => out.push(`| ${NAMES[r.id]} | ${pct(r.adopt)} (${r.n}) | ${pct(r.clearOn)} | ${pct(r.clearOff)} | ${sgn(r.d)} | ${r.flag} | ${r.w3N ? pct(r.w3On) + ` (${r.w3N})` : '—'} | ${r.w3N ? pct(r.w3Off) : '—'} | ${r.w3N ? sgn(r.w3d) : '—'} | ${r.w3flag} | ×${fmt(r.p90)} / ×${fmt(r.max)} |`));
// 아키타입 봇 (핵심 유물 = 봇이 노리는 규칙 파괴 유물)
const CORE = { oathHold: ['oath', 'water'], yoloLoanLev: ['yoloLoan'], cultFocus: ['cult', 'focus', 'lastTrain'], cashGangMin: ['cashGang'], scalperBot: ['scalper'], ruleBreakerBuild: IDS };
const botRow = (games, core, useCore) => {
  const n = games.length; if(!n) return null;
  const clear = games.filter(win).length / n, weeks = games.reduce((a, g) => a + g.weeksCleared, 0) / n;
  const firstWk = games.map(g => (g.weekRelics || []).findIndex(rs => rs.some(id => core.indexOf(id) >= 0))).filter(k => k >= 0);
  const heldWks = games.map(g => (g.weekRelics || []).filter(rs => rs.some(id => core.indexOf(id) >= 0)).length);
  const m = games.map(g => g.maxSettleMult || 1).sort((a, b) => a - b);
  return { clear, weeks, got: useCore ? firstWk.length / n : null, first: firstWk.length ? firstWk.reduce((a, k) => a + k + 1, 0) / firstWk.length : 0,
           held: heldWks.reduce((a, k) => a + k, 0) / n, p90: m[Math.floor(n * 0.9)], max: m[n - 1] };
};
out.push('');
out.push('### 아키타입 봇 (끔 → 켬)');
out.push('');
out.push('| 봇 | 클리어 끔 → 켬 | 평균 생존 주 | 핵심 유물 가진 판 | 첫 보유 주차 | 보유 주 수 (판 평균) | 하루 최대 배수 켬 (상위10% / 최대) |');
out.push('|---|---|---|---|---|---|---|');
Object.keys(CORE).forEach(s => {
  if(!on.games[s]) return;
  const a = botRow(off.games[s] || [], CORE[s], false), b = botRow(on.games[s], CORE[s], true);
  out.push(`| ${s} | ${a ? pct(a.clear) : '—'} → **${pct(b.clear)}** | ${a ? a.weeks.toFixed(2) : '—'} → ${b.weeks.toFixed(2)} | ${pct(b.got)} | ${b.first ? b.first.toFixed(1) + '주' : '—'} | ${b.held.toFixed(2)} | ×${fmt(b.p90)} / ×${fmt(b.max)} |`);
});
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
