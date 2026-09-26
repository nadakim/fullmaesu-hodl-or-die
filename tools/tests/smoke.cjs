const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[1920,1080],[1366,768],[390,844]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
  await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(300);
  const log = [];
  log.push(await page.evaluate(() => [document.querySelector('#screen-play').classList.contains('active'), run.phase, typeof engineLoaded]));
  await page.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi','credit'].map(newCard); handSig=''; renderAll(); });
  const cash0 = await page.evaluate(() => run.cash);
  await page.locator('#handBox .card').first().click(); await page.waitForTimeout(200);
  log.push(['buy', cash0, await page.evaluate(() => run.cash), await page.locator('#positionsBox').innerText().then(t=>t.slice(0,40))]);
  await page.click('#openBtn'); await page.waitForTimeout(2600);
  log.push(['market', await page.evaluate(() => [run.phase, run.tickInDay, eventLog.length])]);
  await page.click('#sellAllBtn'); await page.waitForTimeout(200);
  log.push(['sold', await page.evaluate(() => [run.positions.length, Math.round(run.cash), Math.round(run.realized)]), (await page.locator('#positionsBox').innerText()).includes('NO POSITION')]);
  if (w === 1920) {
    // 한 주를 끝까지: 결산 → 보상 → 유물 → 암시장 → 다음 주
    await page.evaluate(() => { run.cash += 5000; run.day = DAYS_PER_ROUND; while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
    log.push(['week end', await page.evaluate(() => run.phase)]);
    await page.evaluate(async () => { for(let i = 0; i < 100 && !chainHold; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 560)); chainNext(); }); await page.waitForTimeout(150);
    await page.locator('[data-act="toReward"]').click(); await page.waitForTimeout(200);
    await page.locator('[data-reward]').first().click(); await page.waitForTimeout(200);
    if (await page.locator('[data-relic-reward]').count()) await page.locator('[data-relic-reward]').first().click();
    await page.waitForTimeout(300);
    log.push(['shop', await page.evaluate(() => [run.phase, run.masterDeck.length, run.relics.length, run.slush])]);
    await page.screenshot({ path: S + '/shop.png' });
    await page.locator('#shopLeaveBtn').click(); await page.waitForTimeout(300);
    log.push(['week2', await page.evaluate(() => [run.phase, run.round, run.hand.length])]);
  }
  await page.screenshot({ path: `${S}/play-${w}.png` });
  console.log(w, JSON.stringify(log));
  await page.close();
  }
  console.log('errors', errs); await b.close();
})();
