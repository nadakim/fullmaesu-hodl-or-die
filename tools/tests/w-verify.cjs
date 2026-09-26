const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2]; const sizes = (process.argv[3]||'1615x900,1366x768,1920x1080,2560x1440,1280x1024,390x844').split(',').map(s=>s.split('x').map(Number));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const measure = () => {
  const vw = innerWidth, vh = innerHeight, o = { ui: uiScale };
  const cab = document.querySelector('.cabinet').getBoundingClientRect();
  o.fill = Math.round(cab.width) === vw && Math.round(cab.height) === vh;
  o.hScroll = document.documentElement.scrollWidth > vw + 1;
  const ps = document.querySelector('#screen-play');
  if (ps.classList.contains('active')) {
    o.cols = getComputedStyle(ps).gridTemplateColumns.split(' ').length;
    const L = document.querySelector('.play-left').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.quote-row')];
    o.q7 = rows.length === 7 && rows.every(r => { const b = r.getBoundingClientRect(); return b.height > 0 && b.bottom <= L.bottom + 1 && b.bottom <= vh; }) && $('quoteBox').scrollHeight <= $('quoteBox').clientHeight + 1;
    o.posH = Math.round($('positionsBox').getBoundingClientRect().height);
    o.chartH = Math.round($('chartBox').getBoundingClientRect().height);
    o.cardH = Math.round((document.querySelector('#handBox .card') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height);
    const R = document.querySelector('.play-right');
    o.rightScroll = R.scrollHeight > R.clientHeight + 1;
    // 버튼이 화면 안에 보이나
    o.btns = ['openBtn', 'sellAllBtn'].map(id => { const b = $(id).getBoundingClientRect(); return b.bottom <= vh + 1 && b.height > 0; }).every(Boolean);
  }
  // 겹침/잘림: 텍스트 요소 중 부모 밖으로 튀어나간 것 (가로)
  const clipped = [], ell = new Set();
  document.querySelectorAll('.screen.active *').forEach(el => {
    if (!el.checkVisibility || !el.checkVisibility()) return;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) ell.add((el.className || el.tagName).toString().split(' ')[0]);
    if (el.classList.contains('clamped')) ell.add('c-desc.clamped');
    if (/hidden|clip/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && !/hand|chips|relic-bar|news-banner|ticker|quotes|positions|deck/.test(el.className) && el.children.length === 0 && el.textContent.trim())
      clipped.push((el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 12));
  });
  o.ellipsis = [...ell]; o.clipped = clipped.slice(0, 6);
  return o;
};
(async () => {
  const b = await chromium.launch(); const errs = []; const rows = [];
  for (const [W, H] of sizes) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(W + ' ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(W + ' ' + m.text()));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift'); await p.evaluate(() => document.fonts.ready); await sleep(300);
    const tag = `${W}x${H}`;
    const shot = async (name, full) => { await p.mouse.move(1, 1); await sleep(350); await p.screenshot({ path: `${S}/w/${name}-${tag}.png`, fullPage: !!full }); rows.push({ tag, name, ...(await p.evaluate(measure)) }); };
    await shot('title');
    await p.click('#startBtn'); await sleep(300);
    await p.evaluate(() => { window.tipChance = () => 0; setSeed && 0; run.hand = ['stk_semi','dove','pump','indicators','credit'].map(newCard); handSig='';
      openPosition('coin', 1500, 2, 1, true); openPosition('meme', 800, 3, 1, true); openPosition('semi', 1000, 1, 1, true); openPosition('sc', 600, 2, -1, true); renderAll(); });
    await shot('premarket', W <= 900);
    await p.evaluate(() => { run.hand = []; handSig=''; startMarket(); for (let i = 0; i < 5; i++) tick(); renderAll(); });
    await shot('market', W <= 900);
    await p.evaluate(() => { run.cash += 5000; run.day = DAYS_PER_ROUND; while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
    await p.evaluate(async () => { for(let i = 0; i < 100 && !chainHold && !document.querySelector('[data-act="toReward"]'); i++) await new Promise(r => setTimeout(r, 100)); });
    await sleep(700); await shot('settle-chain');
    await p.evaluate(() => { if (typeof chainNext === 'function' && chainHold) chainNext(); }); await sleep(400); await shot('settle-result');
    if (await p.locator('[data-act="toReward"]').count()) {
      await p.locator('[data-act="toReward"]').click(); await sleep(250);
      await p.locator('[data-reward]').first().click(); await sleep(250);
      if (await p.locator('[data-relic-reward]').count()) await p.locator('[data-relic-reward]').first().click();
      await sleep(400); await p.evaluate(() => { run.slush += 3000; renderAll(); }); await shot('shop');
    }
    await p.close();
  }
  console.log('| 창 | 화면 | --ui | 단 | 창 채움 | 시세 7행 | 포지션 칸 px | 차트 px | 카드 높이 | 오른쪽 스크롤 | 버튼 보임 | 가로스크롤 | 잘림(비 ellipsis) | ellipsis/clamp |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.tag} | ${r.name} | ${r.ui} | ${r.cols ?? '-'} | ${r.fill ? 'Y' : 'N'} | ${r.q7 === undefined ? '-' : r.q7 ? 'Y' : 'N'} | ${r.posH ?? '-'} | ${r.chartH ?? '-'} | ${r.cardH ?? '-'} | ${r.rightScroll === undefined ? '-' : r.rightScroll ? 'Y' : '-'} | ${r.btns === undefined ? '-' : r.btns ? 'Y' : 'N'} | ${r.hScroll ? 'Y' : '-'} | ${r.clipped.join('; ') || '-'} | ${r.ellipsis.join(', ') || '-'} |`);
  console.log('errors', errs); await b.close();
})();
