const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const st = page => page.evaluate(() => ({ title: [...document.querySelectorAll('#shopBox .section-label')].map(e => e.textContent).find(t => /카드 제거/.test(t)),
  ladder: document.querySelector('.rm-ladder').textContent, btn: $('shopRemoveBtn').textContent.trim(), dis: $('shopRemoveBtn').disabled,
  slush: run.slush, deck: run.masterDeck.length, removed: run.shop.removed }));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(200);
    await page.evaluate(() => { run.slush = 3000; openShop(); renderShop(); });
    await page.waitForTimeout(200);
    let s = await st(page);
    ok(/이번 주 0회 제거 · 다음 제거 💼 400만/.test(s.title) && /400 → 640 → 1,020/.test(s.ladder), W + ' 제목·다음 두 단계 가격 (1주차 400 → 640 → 1,020)', [s.title, s.ladder.slice(0, 40)]);
    const prices = [];
    for (let k = 0; k < 3; k++) {
      await page.locator('[data-shop-remove="0"]').click(); await page.waitForTimeout(80);
      const before = await st(page);
      await page.locator('#shopRemoveBtn').click(); await page.waitForTimeout(120);
      const after = await st(page);
      prices.push(before.slush - after.slush);
      if (k === 0) {
        const fx = await page.evaluate(() => ({ cls: $('rmNext').className, txt: $('rmNext').textContent }));
        ok(/rm-up/.test(fx.cls) && /640만/.test(fx.txt), W + ' 제거 직후 다음 가격 640으로 갱신 + 빨간 번쩍임', fx);
        if (W !== 1366) await page.screenshot({ path: `${S}/multirm-${W}.png` });
      }
    }
    s = await st(page);
    ok(prices.join() === '400,640,1020' && s.removed === 3 && /3회 제거 · 다음 제거 💼 1,640만/.test(s.title) && /1,640 → 2,620 → 4,190/.test(s.ladder), W + ' 같은 주 3번 제거: 400 → 640 → 1,020 차감, 다음 1,640', [prices, s.title]);
    await page.locator('[data-shop-remove="0"]').click(); await page.waitForTimeout(80);
    s = await st(page);
    ok(s.dis && /비자금 부족 \(💼 1,640만\)/.test(s.btn), W + ' 비자금 부족 → 비활성 + 이유', s.btn);
    // 다음 주: 초기화 + 기본가 +200
    await page.evaluate(() => { run.shop.removed = 0; run.round = 2; openShop(); run.slush = 99999; renderShop(); });
    s = await st(page);
    ok(/0회 제거 · 다음 제거 💼 600만/.test(s.title) && /600 → 960 → 1,540/.test(s.ladder), W + ' 다음 주: 0회로 초기화, 기본가 600', [s.title, s.ladder.slice(0, 30)]);
    // 덱 최소 장수
    await page.evaluate(() => { run.masterDeck = run.masterDeck.slice(0, MIN_DECK_SIZE); shopPickIdx = -1; renderShop(); });
    s = await st(page);
    ok(s.dis && /덱이 5장 — 더 줄일 수 없음/.test(s.btn), W + ' 덱 MIN_DECK_SIZE → 비활성 + 이유', s.btn);
    // 낱장 한도 없음
    const singles = await page.evaluate(() => { run.masterDeck = STARTER_DECK.slice(); openShop(); run.slush = 99999; renderShop();
      let n = 0; run.shop.singles.forEach((id, i) => { if(buySingle(i)) n++; }); renderShop();
      return { n, total: run.shop.singles.length, label: [...document.querySelectorAll('#shopBox .section-label')].map(e => e.textContent).find(t => /낱장/.test(t)) }; });
    ok(singles.n === singles.total && singles.n >= 3 && /구매 한도 없음/.test(singles.label), W + ' 낱장 한도 없음: 진열 전부 구매', singles);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' 가로 넘침 없음');
    await page.close();
  }
  ok(errs.length === 0, 'page errors 없음', errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
