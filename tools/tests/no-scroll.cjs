// 스크롤 없는 게임: 데스크톱 모든 화면·상태 × 1920×1080 · 1280×800 · 1280×720에서 스크롤 가능한 요소(overflow auto/scroll이고 내용이 넘침)가 하나도 없는지 +
// 문서(창) 스크롤 없음 + CSS에 overflow:auto/scroll이 남아 있지 않은지(모바일 @media (max-width: 900px) 구역은 범위 밖).
// .screen.active{overflow-y:auto}는 사용자 지시로 이번 범위 밖(손대지 않음) — 대신 각 화면 내용이 칸에 맞아 실제로 스크롤이 생기지 않는지를 검사한다.
// 인자: node no-scroll.cjs [스크린샷 폴더] [--audit]  — --audit이면 넘치는 요소(overflow hidden으로 잘린 것 포함)를 전부 표로 찍고 실패로 치지 않는다
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const AUDIT = process.argv.includes('--audit');
const SHOTS = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [[1920, 1080], [1280, 800], [1280, 720]];

// ── CSS 정적 검사: overflow(-x|-y): auto|scroll (모바일 @media (max-width: 900px) 블록 안은 제외) ──
function cssScrollRules(){
  const src = fs.readFileSync(path.join(__dirname, '../../docs/demo'), 'utf8');
  const css = (src.match(/<style>([\s\S]*?)<\/style>/g) || []).join('\n');
  const out = [];
  let depth = 0, mobileDepth = -1;
  const lines = css.split('\n');
  lines.forEach((ln, i) => {
    if(/@media[^{]*max-width:\s*900px/.test(ln) && mobileDepth < 0) mobileDepth = depth;
    if(mobileDepth < 0 && /overflow(-[xy])?\s*:\s*(auto|scroll)/.test(ln) && !/no-scroll-ok/.test(ln) && !/^\s*\.screen\.active\{/.test(ln)) out.push((i + 1) + ': ' + ln.trim().slice(0, 120));
    for(const ch of ln){ if(ch === '{') depth++; else if(ch === '}'){ depth--; if(mobileDepth >= 0 && depth <= mobileDepth) mobileDepth = -1; } }
  });
  return out;
}

// ── 화면·상태 (각각 페이지에서 실행할 함수 + 대기) ──
const STATES = [
  { name: 'title', qs: '', run: null },
  { name: 'play-premarket', qs: 'scenario=all,hand', play: true },
  { name: 'play-market', qs: 'scenario=all', play: true, fn: () => { startMarket(); for(let i = 0; i < 5; i++){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); } },
  { name: 'play-map', qs: 'scenario=all', play: true, fn: () => { settings.quoteView = 'map'; applyQuoteView(); renderAll(); }, after: () => { settings.quoteView = 'list'; saveSettings(); } },
  { name: 'menu (일시정지)', qs: 'scenario=all', play: true, fn: () => openMenu() },
  { name: 'chart-zoom', qs: 'scenario=all', play: true, fn: () => openChartZoom() },
  { name: 'tip', qs: 'scenario=all', play: true, fn: () => { startMarket(); openTip(TIP_EVENTS.find(t => !t.special).id); renderAll(); showTipOverlay(); } },
  { name: 'tip-log', qs: 'scenario=nine', play: true, fn: () => { startMarket(); TIP_EVENTS.filter(t => !t.special).slice(0, 14).forEach(t => { if(run.phase !== 'market') return; openTip(t.id); if(run.pendingTip) resolveTip(0); }); Fx.skipQueue(); hideOverlay(); showTipLog(); }, wait: 1500, fn2: () => { Fx.skipQueue(); showTipLog(); } },
  { name: 'day-stage', qs: 'scenario=nine', play: true, fn: () => { window.rollCrit = () => 0; ['seal', 'theme', 'antFlag'].forEach(id => gainRelic(id, 't')); startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 1.004; }); tick(); } renderAll(); }, wait: 2500 },
  { name: 'round-chain', qs: 'scenario=nine', play: true, fn: () => { ['seal', 'theme'].forEach(id => gainRelic(id, 't')); run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 1.004; }); tick(); } renderAll(); }, wait: 3500 },
  { name: 'round-result', qs: 'scenario=nine', play: true, fn: () => { run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 1.004; }); tick(); } Fx.skipQueue(); if(chainPlay) skipSettlementChain(); }, wait: 1200, fn2: () => { if(chainHold){ chainHold.readyAt = 0; chainNext(); } } },
  { name: 'reward-card', qs: 'scenario=nine', play: true, fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); run.relicChoices = []; showReward(); } },
  { name: 'reward-upgrade', qs: 'scenario=nine', play: true, fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); showUpgradePick(); } },
  { name: 'reward-remove', qs: 'scenario=nine', play: true, fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); showRemove(); } },
  { name: 'reward-relic', qs: 'scenario=nine', play: true, fn: () => { run.phase = 'reward'; run.rewardStep = 'relic'; run.relicChoices = rollRelics(3); showRelicReward(); } },
  { name: 'relic-swap', qs: 'scenario=nine', play: true, fn: () => { RELICS.slice(0, RELIC_SLOTS).forEach(r => gainRelic(r.id, 't')); run.phase = 'reward'; run.rewardStep = 'relic'; run.relicChoices = rollRelics(3); showRelicSwap('reward', run.relicChoices[0]); } },
  { name: 'shop', qs: 'scenario=nine', play: true, fn: () => { RELICS.slice(0, 4).forEach(r => gainRelic(r.id, 't')); run.slush = 50000; openShop(); switchTab('shop'); renderAll(); } },
  { name: 'shop-pack-info', qs: 'scenario=nine', play: true, fn: () => { run.slush = 50000; openShop(); switchTab('shop'); renderAll(); showPackInfo('leader'); } },
  { name: 'shop-pack-open', qs: 'scenario=nine', play: true, fn: () => { run.slush = 50000; openShop(); switchTab('shop'); renderAll(); buyPack('leader'); }, wait: 4000 },
  { name: 'deck', qs: 'scenario=nine', play: true, fn: () => { const ids = CARDS.filter(c => c.type !== 'status' && !/\+$/.test(c.id)).map(c => c.id); run.drawPile = ids.slice(0, 30).map(newCard); run.discard = ids.slice(30, 45).map(newCard); run.exhausted = ids.slice(45, 52).map(newCard); showDeck(); } },
  { name: 'glossary', qs: '', play: true, fn: () => showGlossary() },
  { name: 'signal-guide', qs: '', play: true, fn: () => showSignalGuide() },
  { name: 'sector-levels', qs: '', play: true, fn: () => showSectorLevels() },
  { name: 'amount-picker', qs: '', play: true, fn: () => { run.hand = ['stk_semi'].map(newCard); handSig = ''; renderAll(); showAmountPicker(0); } },
  { name: 'game-over', qs: 'scenario=nine', play: true, fn: () => { run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 0.985; }); tick(); } Fx.skipQueue(); }, wait: 3000, fn2: () => { Fx.skipQueue(); } },
  { name: 'records', qs: '', fn: () => { const r = { counts: {}, history: [], totals: { runs: 0, bestWeeks: 0, bestPeak: 0, liq: 0 } }; Object.keys(ENDINGS).forEach((k, i) => { r.counts[k] = i + 1; }); for(let i = 0; i < 30; i++) r.history.push({ n: 30 - i, cause: Object.keys(ENDINGS)[i % Object.keys(ENDINGS).length], round: 1 + i % 8, day: 1 + i % 5, weeks: i % 8, eq: 12000 + i * 777, peak: 15000 + i * 999, liq: i % 3, relics: i % 6, deck: 15 + i, at: Date.now() - i * 864e5, boss: '', bosses: i % 3 }); r.totals = { runs: 30, bestWeeks: 7, bestPeak: 123456, liq: 20 }; localStorage.setItem('hodl.records', JSON.stringify(r)); buildRecords(); switchTab('records'); } },
  { name: 'settings', qs: '', fn: () => { buildSettings(); switchTab('settings'); } },
  { name: 'collection', qs: '', fn: () => { buildCollection(); switchTab('collection'); } }
];

const scan = (p, all) => p.evaluate(all => {
  const out = [];
  const label = e => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') || e.tagName.toLowerCase();
  document.querySelectorAll('body *').forEach(e => {
    if(!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
    const cs = getComputedStyle(e);
    if(cs.display === 'contents' || e.closest('.tuner,[hidden]')) return;
    const sy = /auto|scroll/.test(cs.overflowY), sx = /auto|scroll/.test(cs.overflowX);
    const dy = e.scrollHeight - e.clientHeight, dx = e.scrollWidth - e.clientWidth;
    const scrollable = (sy && dy > 1) || (sx && dx > 1);
    if(scrollable || (all && (dy > 1 || dx > 1) && /hidden|clip/.test(cs.overflowY + cs.overflowX) && e.clientHeight > 20 && !/^(SPAN|B|I|SMALL|CANVAS)$/.test(e.tagName)))
      out.push({ el: label(e), overflow: cs.overflowX + '/' + cs.overflowY, dy: Math.max(0, dy), dx: Math.max(0, dx), scrollable });
  });
  const doc = { dy: document.documentElement.scrollHeight - innerHeight, dx: document.documentElement.scrollWidth - innerWidth };
  return { out, doc };
}, all);

(async () => {
  const rules = cssScrollRules();
  if(!AUDIT) ok('CSS에 overflow:auto/scroll 없음 (모바일 구역 제외)', rules.length === 0, rules);
  else console.log('CSS overflow:auto/scroll ' + rules.length + '곳\n  ' + rules.join('\n  '));
  const b = await chromium.launch();
  const rows = [];
  for (const [W, H] of SIZES) {
    for (const st of STATES) {
      const p = await b.newPage({ viewport: { width: W, height: H } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto('http://127.0.0.1:8765/demo.html' + (st.qs ? '?' + st.qs : ''));
      await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.removeItem('hodl.settings'); } catch(e) {} });
      await p.reload();
      await p.keyboard.press('Shift'); await sleep(300);
      if (st.play) { await p.click('#startBtn'); await sleep(1300); await p.evaluate(() => { window.tipChance = () => 0; }); }
      let err = '';
      if (st.fn) { try { await p.evaluate(st.fn); } catch(e) { err = e.message.split('\n')[0]; } }
      await sleep(st.wait || 700);
      if (st.fn2) { try { await p.evaluate(st.fn2); } catch(e) { err += ' / ' + e.message.split('\n')[0]; } await sleep(700); }
      const r = await scan(p, AUDIT);
      if (SHOTS && W === 1920) await p.screenshot({ path: `${SHOTS}/${st.name.replace(/[^\w-]/g, '_')}-${W}x${H}.png` });
      const scrollers = r.out.filter(o => o.scrollable);
      if (AUDIT) { r.out.forEach(o => rows.push([`${W}x${H}`, st.name, o.el, o.overflow, o.dy, o.dx, o.scrollable ? '스크롤' : '잘림'])); if (r.doc.dy > 0 || r.doc.dx > 0) rows.push([`${W}x${H}`, st.name, '(문서)', 'window', r.doc.dy, r.doc.dx, '창 스크롤']); if (err) rows.push([`${W}x${H}`, st.name, '(상태 재현 실패)', err, 0, 0, '']); }
      else ok(`${W}x${H} ${st.name}: 스크롤 요소 없음 · 창 스크롤 없음${err ? ' (재현: ' + err + ')' : ''}`, !err && scrollers.length === 0 && r.doc.dy <= 0 && r.doc.dx <= 0 && errs.length === 0, { scrollers, doc: r.doc, errs });
      if (st.after) await p.evaluate(st.after).catch(() => {});
      await p.close();
    }
  }
  if (AUDIT) { console.log('\n| 해상도 | 화면·상태 | 요소 | overflow | 넘친 세로px | 넘친 가로px | 종류 |\n|---|---|---|---|---|---|---|'); rows.forEach(r => console.log('| ' + r.join(' | ') + ' |')); }
  await b.close();
  if (!AUDIT) { console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`); process.exit(fail ? 1 : 0); }
})();
