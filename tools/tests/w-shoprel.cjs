const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
(async () => { const b = await chromium.launch(); const errs = [];
 for (const [W,H] of [[1615,900],[1366,768],[390,844]]) {
  const p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html'); await p.click('#startBtn'); await p.waitForTimeout(200);
  await p.evaluate(() => { window.tipChance = () => 0; run.cash += 5000; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } chooseReward('skip'); if(run.relicChoices.length) chooseRelicReward(run.relicChoices[0]); run.slush = 6000; cancelSettlementChain(); hideOverlay(); switchTab('shop'); renderAll(); renderShop(); });
  await p.waitForTimeout(300);
  await p.locator('#shopBox .relic-row').scrollIntoViewIfNeeded();
  const r = await p.evaluate(() => ({ phase: run.phase, n: run.shop.relics.length, tiles: document.querySelectorAll('#shopBox .relic-row .relic-tile').length, odds: document.querySelector('.relic-odds') && document.querySelector('.relic-odds').textContent }));
  const s0 = await p.evaluate(() => run.slush);
  await p.locator('[data-buy-relic]').nth(1).click(); await p.waitForTimeout(200);
  const bought = await p.evaluate(s0 => [run.relics.length, s0 - run.slush], s0);
  await p.locator('[data-reroll="relic"]').click(); await p.waitForTimeout(700);
  const rr = await p.evaluate(() => [run.shop.relics.length, document.querySelectorAll('#shopBox .relic-row .relic-tile').length]);
  await p.locator('#shopBox .relic-row').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${S}/w/shoprel-${W}.png` });
  console.log(W, JSON.stringify(r), 'buy', bought, 'reroll', rr); await p.close(); }
 console.log('errors', errs); await b.close(); })();
