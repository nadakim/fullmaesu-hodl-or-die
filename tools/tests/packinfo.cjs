const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(200);
    await page.evaluate(() => { run.masterDeck.push('yolo', 'antArmy'); run.slush = 600; openShop(); renderShop(); });   // 신화 1장 보유 → 나머지 신화는 한도 제외
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector('.pk-detail') && document.querySelectorAll('[data-pack-info]').length === 3), W + ' 기존 <details> 제거 · ? 버튼 3개');
    for (const id of ['junk', 'leader', 'ruin']) {
      const before = await page.evaluate(() => ({ slush: run.slush, deck: run.masterDeck.length }));
      await page.locator(`[data-pack-info="${id}"]`).click(); await page.waitForTimeout(200);
      const r = await page.evaluate(id => {
        const pk = SHOP_PACK_BY_ID[id], cOdds = packCardOdds(pk), rOdds = packRarityOdds(pk);
        const shown = [...document.querySelectorAll('#overlayBox [data-pki-card]')].map(e => [e.dataset.pkiCard, e.querySelector('.odds').textContent]);
        const bars = [...document.querySelectorAll('#overlayBox .pki-bar')].map(e => e.querySelector('.pct').textContent);
        const outs = [...document.querySelectorAll('#overlayBox [data-pki-out]')].map(e => [e.dataset.pkiOut, e.querySelector('.odds').textContent]);
        return {
          open: overlayOpen, name: document.querySelector('.pki-name').textContent,
          sumCards: cOdds.reduce((s, o) => s + o.chance, 0), sumRar: rOdds.reduce((s, o) => s + o.chance, 0),
          cardsMatch: shown.length === cOdds.length && cOdds.every(o => shown.some(x => x[0] === o.cardId && x[1] === fmtChance(o.chance))),
          barsMatch: RARITIES.every((rr, i) => bars[i] === fmtChance((rOdds.find(o => o.rarity === rr) || { chance: 0 }).chance)),
          outs, outsOk: outs.every(([cid, t]) => packPool(pk).indexOf(cid) < 0 && (inDeck(cid) ? t === '보유 중(제외)' : t === '신화 한도(제외)')),
          ownedInPoolCands: (pk.pool.length ? pk.pool : CARDS.map(c => c.id)).filter(cid => inDeck(cid) && CARD_BY_ID[cid].type !== 'status' && pk.weights[CARD_BY_ID[cid].rarity] > 0),
          totalLine: [...document.querySelectorAll('.pki-sec')].map(e => e.textContent).find(t => /확률 합/.test(t)),
          buy: (() => { const bb = document.querySelector('[data-pack-buy]'); return { disabled: bb.disabled, text: bb.textContent }; })(),
          slush: run.slush, deck: run.masterDeck.length };
      }, id);
      ok(r.open && Math.abs(r.sumCards - 1) < 1e-9 && Math.abs(r.sumRar - 1) < 1e-9 && /확률 합 100%/.test(r.totalLine), `${W} ${id}: 팝업 · 카드·등급 확률 합 100%`, [r.name, r.sumCards, r.totalLine]);
      ok(r.cardsMatch && r.barsMatch, `${W} ${id}: 표시 확률 = packCardOdds·packRarityOdds`);
      ok(r.outsOk && r.ownedInPoolCands.every(c => r.outs.some(o => o[0] === c)) && r.outs.length > 0, `${W} ${id}: 보유 카드 흐리게 "보유 중(제외)"`, r.outs.slice(0, 6));
      ok(r.slush === before.slush && r.deck === before.deck, `${W} ${id}: ? 클릭으로 구매 안 됨`);
      const pk = await page.evaluate(id => SHOP_PACK_BY_ID[id].price, id);
      ok(r.buy.disabled === (before.slush < pk), `${W} ${id}: 구매 버튼 ${before.slush < pk ? '비활성(비자금 부족)' : '활성'}`, r.buy);
      if (id === 'ruin' || W === 390) { const bb = await page.locator('[data-act="close"]').boundingBox(); ok(bb && bb.y + bb.height <= H + 1, `${W} ${id}: 닫기 버튼이 화면 안(스크롤 하단 고정)`, bb); }
      if (W !== 1366 && id === 'leader') await page.screenshot({ path: `${S}/packinfo-${W}.png` });
      if (W === 390 && id === 'leader') { await page.evaluate(() => { $('overlayBox').scrollTop = 99999; }); await page.waitForTimeout(100); await page.screenshot({ path: `${S}/packinfo-390-bottom.png` }); }
      await page.locator('[data-act="close"]').click(); await page.waitForTimeout(150);
      ok(await page.evaluate(() => !overlayOpen), `${W} ${id}: 닫기`);
    }
    // 팝업에서 구매
    await page.locator('[data-pack-info="junk"]').click(); await page.waitForTimeout(150);
    const b0 = await page.evaluate(() => ({ slush: run.slush, deck: run.masterDeck.length }));
    await page.locator('[data-pack-buy="junk"]').click(); await page.waitForTimeout(300);
    const b1 = await page.evaluate(() => ({ slush: run.slush, deck: run.masterDeck.length, flip: !!document.querySelector('.flip-card') }));
    ok(b1.slush === b0.slush - 250 && b1.deck === b0.deck + 1 && b1.flip, `${W} 팝업 '구매' → 팩 개봉 화면`, [b0, b1]);
    await page.locator('#overlayBox [data-act="close"]').click(); await page.waitForTimeout(150);
    // 팩 본체 클릭은 여전히 구매
    await page.evaluate(() => { run.slush += 250; renderShop(); });
    const c0 = await page.evaluate(() => run.masterDeck.length);
    await page.locator('[data-pack="junk"]').click(); await page.waitForTimeout(250);
    ok(await page.evaluate(c0 => run.masterDeck.length === c0 + 1, c0), `${W} 팩 본체 클릭 → 기존대로 구매`);
    await page.locator('#overlayBox [data-act="close"]').click(); await page.waitForTimeout(100);
    if (W !== 390) await page.screenshot({ path: `${S}/packrow-${W}.png`, clip: { x: 0, y: 0, width: W, height: Math.min(H, 700) } });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' 가로 넘침 없음');
    await page.close();
  }
  ok(errs.length === 0, 'page/console errors 없음', errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
