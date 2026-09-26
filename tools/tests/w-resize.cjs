const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2]; const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch(); const errs = []; const out = [];
  const ctx = await b.newContext({ viewport: { width: 1615, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  // 저장된 bgFx 남아 있어도 무시
  await p.addInitScript(() => { try { localStorage.setItem('hodl.settings', JSON.stringify({ bgFx: false, crt: 'weak', uiSize: 'auto' })); } catch(e){} });
  await p.goto('http://127.0.0.1:8765/demo.html'); await sleep(300);
  out.push(['bgFx 무시', await p.evaluate(() => [!('bgFx' in settings), settings.crt, !document.getElementById('bgChartContainer') && !document.getElementById('candleBg')])]);
  await p.click('#startBtn'); await sleep(300);
  await p.evaluate(() => { window.tipChance = () => 0; openPosition('coin', 1500, 2, 1, true); startMarket(); for (let i = 0; i < 6; i++) tick(); renderAll(); });
  // 드래그로 창 크기를 바꾸는 것처럼 여러 단계
  const steps = [[1500,880],[1400,860],[1280,1024],[1100,700],[950,700],[800,900],[390,844],[1366,768],[1920,1080],[2560,1440],[1615,900]];
  for (const [W, H] of steps) {
    await p.setViewportSize({ width: W, height: H }); await sleep(120);
    const r = await p.evaluate(() => { const cc = $('candlestickChart'), dpr = devicePixelRatio;
      const cab = document.querySelector('.cabinet').getBoundingClientRect();
      const sp = document.querySelector('.quote-row canvas');
      return { ui: uiScale, cols: getComputedStyle($('screen-play')).gridTemplateColumns.split(' ').length,
        chartOk: cc.width === Math.floor(cc.clientWidth * dpr) && cc.height === Math.floor(cc.clientHeight * dpr) && cc.clientWidth > 0,
        sparkOk: !sp.clientWidth || sp.width === Math.round(sp.clientWidth * dpr),
        fill: innerWidth <= 900 ? 'mobile' : (Math.round(cab.width) === innerWidth && Math.round(cab.height) === innerHeight),
        hScroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
    out.push([W + 'x' + H, r]);
  }
  await p.screenshot({ path: `${S}/w/after-resize-1615x900.png` });
  // DPR 2
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); const p2 = await c2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://127.0.0.1:8765/demo.html'); await p2.click('#startBtn'); await sleep(300);
  out.push(['DPR2', await p2.evaluate(() => { const cc = $('candlestickChart'); return [uiScale, cc.width, cc.clientWidth, devicePixelRatio]; })]);
  // 설정: 화면 크기 단계
  for (const [W, H] of [[1615,900],[1366,768],[1920,1080],[2560,1440],[1280,1024]]) {
    await p2.setViewportSize({ width: W, height: H }); await sleep(100);
    out.push(['uiSize ' + W + 'x' + H, await p2.evaluate(() => ['small','auto','large','xlarge'].map(m => { settings.uiSize = m; applySettings(); return m + '=' + uiScale; }).join(' '))]);
  }
  // 마키: 긴 뉴스 → marquee, 흔들림 끄면 wrap, 짧으면 둘 다 아님
  await p2.setViewportSize({ width: 1615, height: 900 }); await p2.evaluate(() => { settings.uiSize = 'auto'; applySettings(); switchTab('play'); });
  out.push(['marquee', await p2.evaluate(async () => {
    const f = () => $('newsBanner').className.replace('news-banner', '').trim() || 'static';
    $('newsText').textContent = '아주 긴 뉴스 '.repeat(20); await new Promise(r => setTimeout(r, 50)); const a = f();
    settings.shake = false; applySettings(); const bb = f(); const h = $('newsBanner').getBoundingClientRect().height;
    settings.shake = true; applySettings();
    $('newsText').textContent = '짧음'; await new Promise(r => setTimeout(r, 50)); const c = f();
    return [a, bb, Math.round(h), c]; })]);
  out.forEach(o => console.log(JSON.stringify(o)));
  console.log('errors', errs); await b.close(); })();
