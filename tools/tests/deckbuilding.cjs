// S3 덱빌딩: 종목 매수 금액 선택창 · 보상 카드 강화 · 암시장 리모델링/변환/복제 · 태그 아이콘
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic'); await page.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await sleep(460);
    // 1) 금액 선택: 25% 버튼 → 숫자 입력 → Esc 취소 → 다시 열어 Enter
    await page.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi', 'credit+'].map(newCard); handSig = ''; renderAll(); });
    ok(W + ' 강화 카드 표시 (.up) · 태그 아이콘', await page.evaluate(() => !!document.querySelector('#handBox .card.up') && !!document.querySelector('#handBox .c-tags')));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#handBox .card'), page.locator('#handBox .card').first()).click(); await sleep(150);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-amt-q="0.25"]'), page.locator('[data-amt-q="0.25"]')).click(); await sleep(80);
    const q = await page.evaluate(() => [amtCtx.amount, Math.round(stockMaxAmount() * 0.25), +$('amtRange').value, $('amtInfo').textContent.includes('정산 배수')]);
    ok(W + ' 25% 버튼 → 슬라이더·입력 동기화 · 미리보기', q[0] === q[1] && q[2] === q[0] && q[3], q);
    await page.fill('#amtNum', '30'); await sleep(50);
    ok(W + ' 최소 금액 아래 입력 → 최소로', await page.evaluate(() => amtCtx.amount === STOCK_BUY_MIN));
    await page.keyboard.press('Escape'); await sleep(100);
    ok(W + ' Esc 취소 → 매수 없음', await page.evaluate(() => !overlayOpen && run.positions.length === 0 && run.hand.length === 2));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#handBox .card'), page.locator('#handBox .card').first()).click(); await sleep(150);
    await page.fill('#amtNum', '2500'); await sleep(50);
    const c0 = await page.evaluate(() => run.cash);
    await page.keyboard.press('Enter'); await sleep(250);
    const buy = await page.evaluate(c0 => [c0 - run.cash, run.positions.length && run.positions[0].principal], c0);
    ok(W + ' Enter → 입력 금액으로 매수', buy[0] === 2500 && buy[1] === 2500, buy);
    // 2) 보상: 카드 강화
    await page.evaluate(() => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = ['dove']; run.relicChoices = []; run.masterDeck = ['stk_semi', 'credit', 'hodl', 'credit+', 'dove', 'hawk', 'stopLoss']; showReward(); });
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="upgradeMode"]'), page.locator('[data-act="upgradeMode"]')).click(); await sleep(120);
    const cnt = await page.evaluate(() => document.querySelectorAll('[data-upgrade]').length);
    ok(W + ' 강화 후보 = 강화 안 된 카드만', cnt === 6, cnt);
    await page.keyboard.press('Escape'); await sleep(100);
    ok(W + ' Esc → 보상 화면으로', await page.evaluate(() => !!document.querySelector('[data-act="upgradeMode"]')));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="upgradeMode"]'), page.locator('[data-act="upgradeMode"]')).click(); await sleep(120);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-upgrade="1"]'), page.locator('[data-upgrade="1"]')).click(); await sleep(250);
    const up = await page.evaluate(() => [run.masterDeck[1], run.phase]);
    ok(W + ' 강화 → credit+ · 암시장으로', up[0] === 'credit+' && up[1] === 'shop', up);
    // 3) 암시장 덱 조작
    await page.evaluate(() => { run.slush = 5000; switchTab('shop'); renderShop(); });
    ok(W + ' 덱 조작 버튼 (고르기 전엔 비활성)', await page.evaluate(() => document.querySelectorAll('[data-service]:disabled').length === 3));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-shop-remove="2"]'), page.locator('[data-shop-remove="2"]')).click(); await sleep(80);   // hodl
    const s0 = await page.evaluate(() => [run.slush, shopServiceCost('upgrade')]);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-service="upgrade"]'), page.locator('[data-service="upgrade"]')).click(); await sleep(150);
    const s1 = await page.evaluate(() => [run.masterDeck[2], run.slush, shopServiceCost('upgrade')]);
    ok(W + ' 리모델링 → hodl+ · 비자금 차감 · 다음 가격 상승', s1[0] === 'hodl+' && s1[1] === s0[0] - s0[1] && s1[2] > s0[1], [s0, s1]);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-shop-remove="4"]'), page.locator('[data-shop-remove="4"]')).click(); await sleep(80);   // dove
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-service="transform"]'), page.locator('[data-service="transform"]')).click(); await sleep(150);
    const tf = await page.evaluate(() => [run.masterDeck[4], CARD_BY_ID[run.masterDeck[4]].rarity === CARD_BY_ID.dove.rarity]);
    ok(W + ' 변환 → 같은 등급 다른 카드', tf[0] !== 'dove' && tf[1], tf);
    const n0 = await page.evaluate(() => run.masterDeck.length);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-shop-remove="0"]'), page.locator('[data-shop-remove="0"]')).click(); await sleep(80);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-service="duplicate"]'), page.locator('[data-service="duplicate"]')).click(); await sleep(150);
    ok(W + ' 복제 → 덱 +1', await page.evaluate(n0 => run.masterDeck.length === n0 + 1 && run.masterDeck[n0] === 'stk_semi', n0));
    await page.screenshot({ path: `${S}/deckbuilding-shop-${W}.png`, fullPage: true });
    await page.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
