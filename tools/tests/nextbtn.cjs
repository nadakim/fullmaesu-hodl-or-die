const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
async function setupWeek(page, opt){
  return page.evaluate(opt => {
    window.tipChance = () => 0;
    if(opt.seed) setSeed(opt.seed);
    startRun();
    (opt.relics || []).forEach(id => gainRelic(id, 'test'));
    run.cash += opt.extraCash || 0;
    (opt.buys || []).forEach(b => {
      const p = openPosition(b.id, b.amt, b.lev || 1, b.dir || 1, true);
      p.daysHeld = b.days || 0;
      if(b.diamond) p.diamond = true;
    });
    run.day = opt.day || DAYS_PER_ROUND;
    startMarket();
    Object.keys(opt.move || {}).forEach(id => { assets[id].price *= opt.move[id]; });
    const before = { cash: run.cash, realized: run.realized, liq: run.liquidations };
    endOfDay();   // 5일째 장 마감 → 주간 결산 (엔진 그대로)
    renderAll();
    const w = run.lastWeek;
    return { phase: run.phase, before, w: { eq: w.eq, unrealized: w.unrealized, diamondBonus: w.diamondBonus, target: w.target },
             chain: w.settlementChain.map(c => ({ name: c.posName, steps: c.steps.map(s => s.label + ':' + s.kind + ':' + s.value.toFixed(3)), finalPnl: c.finalPnl })),
             netEq: netEquity(), cash: run.cash, realized: run.realized };
  }, opt);
}
const WEEK = { seed: 7, relics: ['seal', 'theme'], extraCash: 3000, buys: [{ id: 'meme', amt: 600, days: 4 }, { id: 'semi', amt: 1000, days: 4 }], move: { meme: 1.25, semi: 1.06 } };
const state = page => page.evaluate(() => ({ chainList: !!document.getElementById('chainList'), next: !!document.querySelector('[data-act="chainNext"]'),
  result: /목표 달성/.test(document.getElementById('overlayBox').textContent) && !document.getElementById('chainList'), playing: !!chainPlay, hold: !!chainHold,
  stamps: document.querySelectorAll('#chainList .chain-stamp').length, sum: (document.querySelector('.chain-sum:not(.pending)') || {}).textContent || '' }));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(200);
    // 1) 끝까지 재생 → 멈춤 → 버튼
    await setupWeek(page, WEEK);
    await sleep(600);
    ok((await state(page)).playing, W + ' 체인 재생 중');
    let st; for(let i = 0; i < 60; i++){ await sleep(150); st = await state(page); if(st.hold) break; }
    await sleep(2500);
    st = await state(page);
    ok(st.hold && st.chainList && st.next && !st.result && st.stamps === 2 && st.sum, W + ' 재생 끝 → 자동으로 안 넘어가고 최종 결과(도장·합계)에서 멈춤 + ▶ 다음', st);
    const box = await page.locator('[data-act="chainNext"]').boundingBox();
    ok(box && box.y >= 0 && box.y + box.height <= H && box.x >= 0 && box.x + box.width <= W, W + ' ▶ 다음 버튼이 화면 안', box);
    if (W !== 1366) await page.screenshot({ path: S + '/next-' + W + '.png' });
    await page.keyboard.press('Space'); await sleep(100);
    ok((await state(page)).hold, W + ' 결과 화면에서 스페이스 → 넘어가지 않음');
    await page.locator('[data-act="chainNext"]').click(); await sleep(200);
    st = await state(page);
    ok(st.result && !st.hold, W + ' ▶ 다음 클릭 → showRoundResult', st);
    // 2) 재생 중 스킵 → 결과에서 멈춤, 0.5초 가드, 엔터로 진행
    await setupWeek(page, WEEK);
    await sleep(700);
    await page.keyboard.press('Space'); await sleep(80);
    st = await state(page);
    ok(!st.playing && st.hold && st.chainList && !st.result && st.stamps === 2 && st.sum, W + ' 재생 중 스페이스 → 최종 결과로 점프해서 멈춤', st);
    await page.keyboard.press('Enter'); await sleep(60);
    ok((await state(page)).hold, W + ' 결과가 뜬 뒤 0.5초 안 엔터 → 무시');
    await page.locator('[data-act="chainNext"]').click(); await sleep(60);
    ok((await state(page)).hold, W + ' 0.5초 안 버튼 클릭 → 무시');
    await sleep(500);
    await page.keyboard.press('Enter'); await sleep(200);
    ok((await state(page)).result, W + ' 0.5초 뒤 엔터 → showRoundResult');
    // 3) 재생 중 클릭 스킵
    await setupWeek(page, WEEK);
    await sleep(700);
    await page.mouse.click(W / 2, 30); await sleep(80);
    st = await state(page);
    ok(st.hold && !st.result, W + ' 재생 중 클릭 → 결과에서 멈춤', st);
    // 4) 결산 연출 끔 → 요약 + 버튼
    await page.evaluate(() => { settings.chainFx = false; });
    await setupWeek(page, WEEK);
    await sleep(300);
    st = await state(page);
    const title = await page.evaluate(() => document.querySelector('#overlayBox .ov-title').textContent);
    ok(st.hold && st.next && !st.result && title === '결산 요약' && /정산 합계/.test(st.sum), W + " 결산 연출 끔 → '결산 요약' + ▶ 다음", [st, title]);
    if (W === 390) await page.screenshot({ path: S + '/next-summary-390.png' });
    await sleep(500); await page.locator('[data-act="chainNext"]').click(); await sleep(200);
    ok((await state(page)).result, W + ' 요약에서 ▶ 다음 → showRoundResult');
    // 5) 보정 없는 결산 (유물 없음) → 요약 + 버튼
    await page.evaluate(() => { settings.chainFx = true; });
    await setupWeek(page, { seed: 3, extraCash: 3000, buys: [{ id: 'semi', amt: 1000 }], move: { semi: 1.02 } });
    await sleep(300);
    st = await state(page);
    ok(st.hold && st.next && !st.result, W + ' 유물·보너스 없는 결산 → 요약 + ▶ 다음', st);
    await sleep(500); await page.keyboard.press('Enter'); await sleep(200);
    ok((await state(page)).result, W + ' 엔터 → showRoundResult');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' 가로 넘침 없음');
    await page.close();
  }
  ok(errs.length === 0, 'page errors 없음', errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
