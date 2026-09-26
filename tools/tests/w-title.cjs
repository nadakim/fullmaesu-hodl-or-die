const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2], sizes = (process.argv[3] || '1615x900,1366x768,1920x1080,1280x800,390x844').split(',').map(x => x.split('x').map(Number));
(async () => { const b = await chromium.launch(); const errs = [];
  for (const [W, H] of sizes) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(W + ' ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(W + ' ' + m.text()));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(500); await p.screenshot({ path: `${S}/w/title-intro-${W}x${H}.png` });
    await p.waitForTimeout(1300);
    await p.keyboard.press('Shift'); await p.waitForTimeout(200);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(250);
    await p.screenshot({ path: `${S}/w/title-${W}x${H}.png`, fullPage: W < 900 });
    const m = await p.evaluate(() => { const L = $('titleLogo').getBoundingClientRect(), M = $('titleMenu').getBoundingClientRect(), C = document.querySelector('.t-corner').getBoundingClientRect(), T = document.querySelector('.ticker-wrap').getBoundingClientRect();
      const ov = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      return { logoW: Math.round(L.width / innerWidth * 100) + '%', koPx: getComputedStyle($('titleKo')).fontSize, enPx: getComputedStyle($('titleEn')).fontSize,
        overlap: { logoMenu: ov(L, M), menuCorner: ov(M, C), menuTicker: ov(M, T), logoCorner: ov(L, C) }, hScroll: document.documentElement.scrollWidth > innerWidth + 1, press: $('titlePress').hidden, sel: document.querySelector('.t-item.sel') && document.querySelector('.t-item.sel').textContent }; });
    console.log(W, H, JSON.stringify(m));
    await p.close();
  }
  console.log('errors', errs); await b.close(); })();
