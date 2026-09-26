const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2], sizes = (process.argv[3] || '1615x900').split(',').map(x => x.split('x').map(Number));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch(); const errs = [];
  for (const [W, H] of sizes) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(W + ' ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(W + ' ' + m.text()));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift'); await p.evaluate(() => document.fonts.ready);
    await p.click('#startBtn'); await sleep(300);
    const setup = n => p.evaluate(n => { window.tipChance = () => 0; clearToasts && clearToasts();
      run.hand = ['stk_semi','dove','pump','indicators','credit','stopLoss','hodl','yolo','cutLoss','ipo'].slice(0, n).map(newCard); handSig=''; run.ap = 9;
      if(!run.positions.length){ openPosition('coin', 1500, 2, 1, true); openPosition('meme', 800, 3, 1, true); openPosition('semi', 1000, 1, 1, true); openPosition('sc', 600, 2, -1, true); openPosition('gukbap', 500, 1, 1, true); openPosition('inv', 400, 1, 1, true);
        run.positions[0].stopLoss = true; run.positions[0].takeProfit = true; run.positions[1].protectedToday = true; run.positions[2].diamond = true; }
      posSig = ''; renderAll(); }, n);
    const m = () => p.evaluate(() => { const hb = $('handBox'), pb = $('positionsBox');
      const cards = [...hb.querySelectorAll('.card')], slots = hb.querySelectorAll('.g-slot').length;
      const vis = el => { const r = el.getBoundingClientRect(), hr = hb.getBoundingClientRect(); return r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1 && r.bottom <= innerHeight; };
      const rows = [...pb.querySelectorAll('.pos-item')];
      const ell = [...document.querySelectorAll('#screen-play *')].filter(e => e.checkVisibility() && e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow.includes('hidden')).map(e => (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 14));
      return { ui: uiScale, cols: getComputedStyle(hb).gridTemplateColumns.split(' ').length, cards: cards.length, slots, allVisible: cards.every(vis), handScroll: hb.scrollHeight > hb.clientHeight + 1,
        cardWH: cards[0] ? [Math.round(cards[0].getBoundingClientRect().width), Math.round(cards[0].getBoundingClientRect().height)] : null,
        pos: rows.length, posRowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0, posScroll: pb.scrollHeight > pb.clientHeight + 1, posBoxH: Math.round(pb.clientHeight), clipped: [...new Set(ell.map(x => x.split(":")[0]))], clipN: ell.length, nonDesc: ell.filter(x => !x.startsWith("g-line")).slice(0, 8) }; });
    await setup(9); await p.mouse.move(1, 1); await sleep(300);
    console.log(W, H, 'hand9', JSON.stringify(await m()));
    await p.screenshot({ path: `${S}/w/tr9-${W}x${H}.png` });
    await setup(10); await sleep(300);
    console.log(W, H, 'hand10', JSON.stringify(await m()));
    await p.screenshot({ path: `${S}/w/tr10-${W}x${H}.png` });
    await p.close();
  }
  console.log('errors', errs); await b.close(); })();
