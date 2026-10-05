// 화면별 정보량(복잡도) 측정 — 코드는 수정하지 않고 화면을 열어 DOM만 센다.
//   node tools/tests/complexity.js [출력폴더=docs/ux/complexity] [--week1|--all]   (사이트 사본은 tools/tests/README.md 대로 :8765에)
// 화면마다 (보이는 글자 수, 숫자 개수, 버튼 수, 보이는 용어)를 센다. 해금 상태 2종: week1 = 새 플레이어(hodl.unlockWeek=1), all = 전부 해금(8).
//  - 글자 수: 보이는 텍스트 노드의 공백 제외 문자 수 (canvas·CRT 레이어·디버그 패널·숨김 요소 제외, 툴팁(title 속성)은 따로 센다)
//  - 숫자 개수: /\d[\d,.]*/ 덩어리 수 (예: '1억 2,000만' = 2개)
//  - 창(#overlay)이 떠 있으면 뒤 화면 글자도 DOM에 남아 있으므로 '창만' 수치(overlay*)를 따로 센다
//  - 버튼 수: button·[role=button]·클릭 가능한 data-* 요소(카드·시세 행·팩·유물 등) 중 보이는 것
// 결과: <출력폴더>/complexity-<모드>.json (화면별 수치 + 보이는 글자 전문 → 용어 인벤토리 근거), 스크린샷 <출력폴더>/<모드>/<화면>.png (1920×1080)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MODE = process.argv.includes('--all') ? 'all' : 'week1';
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '../../docs/ux/complexity');
const W = 1920, H = 1080;
const RUN_END = `while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 1.004; }); tick(); }`;

// ── 화면·상태 (no-scroll.cjs와 같은 재현법. 시나리오 없이 '자연스러운 시작 덱' 기준) ──
const STATES = [
  { name: 'title', run: false },
  { name: 'play-premarket', fn: () => {} },
  { name: 'play-market', fn: () => { startMarket(); for(let i = 0; i < 5; i++){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); } },
  { name: 'menu', fn: () => openMenu() },
  { name: 'chart-zoom', fn: () => openChartZoom() },
  { name: 'tip', fn: () => { startMarket(); openTip(TIP_EVENTS.find(t => !t.special).id); renderAll(); showTipOverlay(); } },
  { name: 'day-stage', wait: 2500, fn: ({ RUN_END }) => { run.hand = ['stk_semi'].map(newCard); handSig = ''; renderAll(); playCard(0, 'semi'); startMarket(); eval(RUN_END); renderAll(); } },
  { name: 'round-chain', wait: 3500, fn: ({ RUN_END }) => { run.hand = ['stk_semi'].map(newCard); handSig = ''; renderAll(); playCard(0, 'semi'); run.day = DAYS_PER_ROUND; startMarket(); eval(RUN_END); renderAll(); } },
  { name: 'round-result', wait: 1200, fn: ({ RUN_END }) => { run.day = DAYS_PER_ROUND; startMarket(); eval(RUN_END); Fx.skipQueue(); if(chainPlay) skipSettlementChain(); }, fn2: () => { if(chainHold){ chainHold.readyAt = 0; chainNext(); } } },
  { name: 'reward-card', fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); run.relicChoices = []; showReward(); } },
  { name: 'reward-upgrade', fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); showUpgradePick(); } },
  { name: 'reward-remove', fn: () => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = rollRewardChoices(); showRemove(); } },
  { name: 'reward-relic', fn: () => { run.phase = 'reward'; run.rewardStep = 'relic'; run.relicChoices = rollRelics(3); showRelicReward(); } },
  { name: 'shop', fn: () => { run.slush = 50000; openShop(); switchTab('shop'); renderAll(); } },
  { name: 'shop-pack-info', fn: () => { run.slush = 50000; openShop(); switchTab('shop'); renderAll(); showPackInfo('leader'); } },
  { name: 'deck', fn: () => showDeck() },
  { name: 'glossary', fn: () => showGlossary() },
  { name: 'signal-guide', fn: () => showSignalGuide() },
  { name: 'sector-levels', fn: () => showSectorLevels() },
  { name: 'amount-picker', fn: () => { run.hand = ['stk_semi'].map(newCard); handSig = ''; renderAll(); showAmountPicker(0); } },
  { name: 'game-over-miss', wait: 3000, fn: ({ RUN_END }) => { run.day = DAYS_PER_ROUND; startMarket(); eval(RUN_END.replace('1.004', '0.985')); Fx.skipQueue(); }, fn2: () => { Fx.skipQueue(); } },
  { name: 'game-over-liquidation', wait: 3000, fn: () => { run.hand = ['stk_semi', 'credit'].map(newCard); handSig = ''; renderAll(); try { run.cash = 1e6; openPosition('meme', 5000, 3, 1, true); assets.meme.price *= 0.3; checkMarginCalls(); endRun('MARGIN_CALL'); } catch(e) {} Fx.skipQueue(); } },
  { name: 'records', run: false, fn: () => { buildRecords(); switchTab('records'); } },
  { name: 'settings', run: false, fn: () => { buildSettings(); switchTab('settings'); } },
  { name: 'collection', run: false, fn: () => { buildCollection(); switchTab('collection'); } }
];

const measure = () => {
  const SKIP = '#crtLayer,.tuner,[hidden],script,style,canvas,.fx-blocker';
  const vis = e => { const cs = getComputedStyle(e); if(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const ovOpen = !!document.querySelector('#overlay.show'), root = document.body;
  const texts = [], ovTexts = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while((n = w.nextNode())){
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if(!t) continue;
    const p = n.parentElement;
    if(!p || p.closest(SKIP) || !vis(p)) continue;
    let ok = true; for(let e = p; e && e !== document.body; e = e.parentElement) if(!vis(e)){ ok = false; break; }
    if(ok){ texts.push(t); if(p.closest('#overlayBox')) ovTexts.push(t); }
  }
  const body = texts.join(' ');
  const clickSel = 'button,[role=button],[data-act],[data-q],[data-reward],[data-upgrade],[data-remove],[data-single],[data-buy-relic],[data-relic-reward],[data-swap-pick],[data-deck-card],[data-pack-buy],[data-pack-info],#handBox .card';
  const btns = new Set();
  document.querySelectorAll(clickSel).forEach(e => { if(!e.closest(SKIP) && vis(e) && !e.disabled) btns.add(e); });
  // 중첩 제거(안쪽 버튼이 이미 센 바깥 요소 안에 있으면 바깥만)
  const list = [...btns].filter(e => ![...btns].some(o => o !== e && o.contains(e)));
  const tips = [...document.querySelectorAll('[title]')].filter(e => e.title && vis(e) && !e.closest(SKIP)).length;
  const nums = (body.match(/\d[\d,.]*/g) || []).length;
  const big = [...document.querySelectorAll('body *')].filter(e => vis(e) && !e.closest(SKIP) && e.children.length === 0 && /\d/.test(e.textContent) && parseFloat(getComputedStyle(e).fontSize) >= 24 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1) * 0.99).length;
  const ovNums = (ovTexts.join(' ').match(/\d[\d,.]*/g) || []).length;
  return { overlay: ovOpen, overlayChars: ovTexts.join('').replace(/\s/g, '').length, overlayNums: ovNums, overlayButtons: ovOpen ? list.filter(e => e.closest('#overlayBox')).length : 0, chars: body.replace(/\s/g, '').length, hangul: (body.match(/[가-힣]/g) || []).length, nums, buttons: list.length, tooltips: tips, bigNumbers: big, text: texts };
};

(async () => {
  fs.mkdirSync(path.join(OUT, MODE), { recursive: true });
  const b = await chromium.launch(), rows = [];
  for(const st of STATES){
    const p = await b.newPage({ viewport: { width: W, height: H } }), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?crt=0');
    await p.evaluate(u => { try { localStorage.setItem('hodl.unlockWeek', u); localStorage.removeItem('hodl.settings'); localStorage.removeItem('hodl.records'); } catch(e) {} }, MODE === 'all' ? '8' : '1');
    await p.reload();
    await p.keyboard.press('Shift'); await sleep(300);
    if(st.run !== false){ await p.click('#startBtn'); await sleep(1400); await p.evaluate(() => { window.tipChance = () => 0; Fx.skipQueue(); }); }
    let err = '';
    if(st.fn){ try { await p.evaluate(`(${st.fn.toString()})({ RUN_END: ${JSON.stringify(RUN_END)} })`); } catch(e) { err = e.message.split('\n')[0]; } }
    await sleep(st.wait || 800);
    if(st.fn2){ try { await p.evaluate(st.fn2); } catch(e) { err += ' / ' + e.message.split('\n')[0]; } await sleep(800); }
    await p.evaluate(() => { document.querySelectorAll('.fx-skip,.toast').forEach(e => e.remove()); });
    const m = await p.evaluate(measure);
    await p.screenshot({ path: path.join(OUT, MODE, st.name + '.png') });
    rows.push({ screen: st.name, ...m, err, errs });
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, `complexity-${MODE}.json`), JSON.stringify(rows, null, 1));
  const top = k => rows.slice().sort((a, c) => c[k] - a[k]).slice(0, 5).map(r => `${r.screen}(${r[k]})`).join(', ');
  console.log(`\n[${MODE}] 화면 | 글자 | 숫자 | 버튼 | 큰 숫자 | 툴팁 | (창이 떠 있으면) 창만: 글자/숫자/버튼`);
  rows.forEach(r => console.log(`${r.screen} | ${r.chars} | ${r.nums} | ${r.buttons} | ${r.bigNumbers} | ${r.tooltips}${r.overlay ? ` | 창만 ${r.overlayChars}/${r.overlayNums}/${r.overlayButtons}` : ''}${r.err ? ' | 재현 실패: ' + r.err : ''}`));
  console.log(`\n상위 5 글자: ${top('chars')}\n상위 5 숫자: ${top('nums')}\n상위 5 버튼: ${top('buttons')}`);
})();
