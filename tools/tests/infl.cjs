const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(200);
    // 1주차: 인상률 표시 없음
    await page.evaluate(() => { run.slush = 5000; openShop(); renderShop(); });
    await page.waitForTimeout(200);
    const w1 = await page.evaluate(() => ({ tags: document.querySelectorAll('#shopBox .infl').length, bar: $('shopBox').querySelector('.shop-bar').textContent, pk: document.querySelector('[data-pack="leader"] .pk-price').textContent }));
    ok(w1.tags === 1 && /\+0%/.test(w1.bar) && /500만$/.test(w1.pk.trim()), W + ' 1주차: 가격 옆 인상률 없음 (상단 바 +0%)', w1);
    // 4주차 암시장 (round 4): 팩·낱장 +36%, 유물 +30%
    await page.evaluate(() => { run.round = 4; run.shop.relics = ['capital']; renderShop(); });
    const w4 = await page.evaluate(() => ({
      bar: $('shopBox').querySelector('.shop-bar').textContent.replace(/\s+/g, ' '),
      packs: SHOP_PACKS.map(pk => [document.querySelector(`[data-pack="${pk.id}"] .pk-price`).textContent.trim(), packPrice(pk)]),
      single: document.querySelector('[data-single="0"]').textContent.trim(), singleP: singlePrice(run.shop.singles[0]),
      relic: document.querySelector('[data-buy-relic="capital"]').textContent.trim(), relicP: relicPrice('capital') }));
    ok(/1주차 대비 \+36%/.test(w4.bar) && /유물 \+30%/.test(w4.bar), W + ' 상단 바 "물가 상승률: 1주차 대비 +36%"', w4.bar.slice(-60));
    ok(w4.packs.every(([t, p]) => t.startsWith('💼 ' + p.toLocaleString() + '만') && t.endsWith('(▲36%)')) && w4.packs[1][1] === 680, W + ' 팩 가격 = packPrice (주도주 500→680) + ▲36%', w4.packs);
    ok(w4.single.indexOf(w4.singleP.toLocaleString() + '만') >= 0 && /▲36%/.test(w4.single) && /▲30%/.test(w4.relic) && w4.relic.indexOf(w4.relicP.toLocaleString()) >= 0 && w4.relicP === 1170, W + ' 낱장 ▲36% · 유물 ▲30% (캐피탈 900→1170)', [w4.single, w4.relic]);
    await page.locator('[data-pack-info="leader"]').click(); await page.waitForTimeout(150);
    const pop = await page.evaluate(() => [document.querySelector('.pki-price').textContent, document.querySelector('[data-pack-buy]').textContent]);
    ok(/680만 \(▲36%\)/.test(pop[0]) && /구매 💼 680만/.test(pop[1]), W + ' 팩 팝업 가격 = 인상가', pop);
    await page.locator('[data-act="close"]').click(); await page.waitForTimeout(100);
    // 실제 차감
    const spent = await page.evaluate(() => { const s0 = run.slush; buyPack('leader'); const a = s0 - run.slush; hideOverlay();
      const s1 = run.slush; buyRelic('capital'); const r = s1 - run.slush; const s2 = run.slush; buySingle(0); const si = s2 - run.slush;
      return { pack: a, relic: r, single: si, singleP: singlePrice(run.shop.singles[0]) }; });
    ok(spent.pack === 680 && spent.relic === 1170 && spent.single === spent.singleP, W + ' 구매 차감 = 인상가', spent);
    if (W !== 390) { await page.evaluate(() => { hideOverlay(); run.slush = 5000; run.shop.singlesBought = []; renderShop(); }); await page.screenshot({ path: `${S}/infl-${W}.png`, clip: { x: 0, y: 0, width: W, height: Math.min(H, 720) } }); }
    else { await page.evaluate(() => { hideOverlay(); renderShop(); }); await page.screenshot({ path: `${S}/infl-390.png` }); }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' 가로 넘침 없음');
    await page.close();
  }
  ok(errs.length === 0, 'page errors 없음', errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
