// S4 곱하기: 배수 카드 손패 사용(주식 분할·레버리지 ETF·몰빵)·곱하기 유물 정산·크리티컬 확률 공개·새 이벤트 알림
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await sleep(460);
    const pid = await page.evaluate(() => { window.tipChance = () => 0; ['antFlag', 'levTower'].forEach(id => gainRelic(id, 't'));
      const p = openPosition('semi', 1000, 2, 1, true); openPosition('coin', 500, 1, 1, true);
      run.hand = ['split', 'levEtf', 'allIn'].map(newCard); run.ap = 5; handSig = ''; relicSig = ''; renderAll(); return p.id; });
    // 주식 분할 → 대상 포지션 클릭
    await page.locator('#handBox .card', { hasText: '주식 분할' }).click(); await sleep(120);
    await page.locator(`#positionsBox .pos-item[data-id="${pid}"]`).first().click(); await sleep(200);
    ok(W + ' 주식 분할 → 포지션 3개', await page.evaluate(() => run.positions.length === 3));
    await page.locator('#handBox .card', { hasText: '레버리지 ETF' }).click(); await sleep(120);
    await page.locator(`#positionsBox .pos-item[data-id="${pid}"]`).first().click(); await sleep(200);
    const lev = await page.evaluate(id => run.positions.find(p => p.id === id).lev, pid);
    ok(W + ' 레버리지 ETF → 2x → 4x', lev === 4, lev);
    const tip = await page.evaluate(() => $('multPreview').getAttribute('aria-label'));
    ok(W + ' 정산 칩 툴팁: 크리티컬 확률 공개', /크리티컬: 수익 포지션 정산마다 5%/.test(tip), tip.split('\n').pop());
    // 정산: 레버리지 탑(4·1·2 = ×8) × 깃발(1.5³)
    const st = await page.evaluate(id => { const p = run.positions.find(p => p.id === id); return settleSteps(p, 100, 0).steps.map(s => [s.source, +s.value.toFixed(3)]); }, pid);
    ok(W + ' 곱하기 유물 정산 단계', JSON.stringify(st) === JSON.stringify([['base', 100], ['antFlag', 3.375], ['levTower', 8]]), st);
    // 몰빵 → 나머지 정리 + 알림
    await page.locator('#handBox .card', { hasText: '몰빵' }).click(); await sleep(120);
    await page.locator(`#positionsBox .pos-item[data-id="${pid}"]`).first().click(); await sleep(250);
    const ai = await page.evaluate(id => [run.positions.length, JSON.stringify(run.positions[0].todayX), document.querySelector('#toastBox, .toast-box, #toasts') ? document.body.innerText.includes('몰빵') : true], pid);
    ok(W + ' 몰빵 → 1개만 남고 오늘 정산 ×3', ai[0] === 1 && /×3/.test(ai[1]) && ai[2], ai);
    // 크리티컬 알림 (이벤트만 흉내)
    await page.evaluate(() => onGameEvent('settleCrit', { posId: 1, name: '반도체전자', mult: 3 })); await sleep(150);
    ok(W + ' 크리티컬 알림', await page.evaluate(() => document.body.innerText.includes('크리티컬 정산')));
    // 도감: 크리티컬 확률
    await page.evaluate(() => switchTab('collection')); await sleep(200);
    ok(W + ' 도감에 크리티컬 확률 · 새 카드', await page.evaluate(() => $('collectionBox').textContent.includes('크리티컬') && $('collectionBox').textContent.includes('타임 루프')));
    await page.screenshot({ path: `${S}/multipliers-collection-${W}.png` });
    await page.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
