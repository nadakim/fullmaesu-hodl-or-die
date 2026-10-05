const { chromium } = require('/opt/node22/lib/node_modules/playwright');
// 유물 칸 (S2): 6칸 · 가득 차면 교체/포기 · 순서 바꾸기(◀▶·←→·끌기, 장중 불가) · 암시장 판매 · 정산 순서 (더하기 앞 > 곱하기 앞)
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for(const [W, H] of [[1920, 1080], [1366, 768]]){
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(W + ': ' + e.message));
    await page.goto('http://127.0.0.1:8765/demo.html?layout=classic'); await page.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await sleep(460);
    // 1) 6칸 표시 + 빈 칸
    const r1 = await page.evaluate(() => { window.tipChance = () => 0; ['seal', 'dopamine'].forEach(id => gainRelic(id, 't')); relicSig = ''; renderAll();
      return { slots: document.querySelectorAll('#relicBar .relic-slot').length, relics: document.querySelectorAll('#relicBar [data-relic]').length, label: document.querySelector('#relicBar .relic-label').textContent,
               kinds: [...document.querySelectorAll('#relicBar .rl-kind')].map(x => x.textContent) }; });
    ok(r1.slots === 4 && r1.relics === 2 && /2\/6/.test(r1.label), W + ' 유물 2개 + 빈 칸 4', r1);
    ok(r1.kinds.join() === '×,+', W + ' 종류 배지 (인장 × · 도파민 +)', r1.kinds);
    // 2) 정산 순서: 적금(+)이 인장(×)보다 앞이면 배수가 크다
    const r2 = await page.evaluate(() => { run.combo.up = 3;
      const p = openPosition('semi', 1000, 1, 1, true); p.daysHeld = 4;
      const a = settleSteps(p, 100).mult;   // [seal, dopamine] = 1 × 1.2 + 3 = 4.2
      moveRelic(1, 0);
      const b2 = settleSteps(p, 100).mult;  // [dopamine, seal] = (1 + 3) × 1.2 = 4.8
      return { a, b: b2, order: run.relics.join() }; });
    ok(Math.abs(r2.a - 4.2) < 1e-9 && Math.abs(r2.b - 4.8) < 1e-9 && r2.order === 'dopamine,seal', W + ' 칸 순서대로 정산 (+ 앞 4.8 > × 앞 4.2)', r2);
    // 3) ◀▶ 버튼 · ←→ 키 · 장중 불가
    await page.evaluate(() => { relicSig = ''; renderAll(); });
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#relicBar [data-relic="seal"]'), page.locator('#relicBar [data-relic="seal"]')).click(); await sleep(100);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#relicTip [data-relic-move="-1"]'), page.locator('#relicTip [data-relic-move="-1"]')).click(); await sleep(100);
    const r3 = await page.evaluate(() => run.relics.join());
    await page.keyboard.press('ArrowRight'); await sleep(100);
    const r3b = await page.evaluate(() => run.relics.join());
    ok(r3 === 'seal,dopamine' && r3b === 'dopamine,seal', W + ' ◀ 버튼 · → 키로 칸 이동', [r3, r3b]);
    const r3c = await page.evaluate(() => { startMarket(); const m = moveRelic(0, 1); return { m, order: run.relics.join(), drag: !!document.querySelector('#relicBar [draggable="true"]') }; });
    await page.evaluate(() => { relicSig = ''; renderAll(); });
    const drag = await page.evaluate(() => !!document.querySelector('#relicBar [draggable="true"]'));
    ok(!r3c.m && r3c.order === 'dopamine,seal' && !drag, W + ' 장중에는 순서 변경 불가 (끌기도 꺼짐)', r3c);
    // 4) 클릭으로 옮기기 (장전): 유물을 눌러 고르고 ◀ 앞으로 두 번 (끌기는 없앴다 — 클릭 전용)
    await page.evaluate(() => { startRun(); ['seal', 'theme', 'dopamine'].forEach(id => gainRelic(id, 't')); relicSig = ''; renderAll(); });
    await page.click('#relicBar [data-relic="dopamine"]'); await sleep(150);
    await page.click('#relicTip [data-relic-move="-1"]'); await sleep(150);
    await page.click('#relicTip [data-relic-move="-1"]'); await sleep(150);
    ok(await page.evaluate(() => run.relics.join()) === 'dopamine,seal,theme' && !(await page.evaluate(() => !!document.querySelector('#relicBar [draggable="true"]'))), W + ' 클릭 → ◀ 앞으로 두 번 = 1번 칸 (끌기 없음)', await page.evaluate(() => run.relics.join()));
    if(W === 1920) await page.screenshot({ path: S + '/relicslots-bar.png' });
    // 5) 가득 찬 칸: 보상 → 교체 오버레이 → 교체
    const r5 = await page.evaluate(() => { ['capital', 'payday', 'lawyer'].forEach(id => gainRelic(id, 't'));
      const full = relicSlotsFull(), extra = gainRelic('vip', 't');
      run.cash += 5000; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); }
      return { full, extra, phase: run.phase }; });
    ok(r5.full && !r5.extra && r5.phase === 'reward', W + ' 6칸이면 gainRelic 실패', r5);
    for(let i = 0; i < 40 && !(await page.evaluate(() => !!chainHold)); i++) await sleep(100);
    await sleep(560); await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="chainNext"]'), page.locator('[data-act="chainNext"]')).click(); await sleep(200);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="toReward"]'), page.locator('[data-act="toReward"]')).click(); await sleep(150);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="skip"]'), page.locator('[data-act="skip"]')).click(); await sleep(200);
    const rewardId = await page.evaluate(() => run.relicChoices[0]);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-relic-reward]'), page.locator('[data-relic-reward]').first()).click(); await sleep(200);
    ok(await page.locator('[data-swap-pick]').count() === 6, W + ' 가득 찬 칸 → 교체할 유물 6개 표시');
    if(W === 1920) await page.screenshot({ path: S + '/relicslots-swap.png' });
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-swap-pick="capital"]'), page.locator('[data-swap-pick="capital"]')).click(); await sleep(200);
    const r5b = await page.evaluate(() => ({ relics: run.relics.slice(), phase: run.phase }));
    ok(r5b.relics.length === 6 && r5b.relics.indexOf('capital') < 0 && r5b.relics[3] === rewardId && r5b.phase === 'shop', W + ' 교체: 캐피탈 칸(4번)에 새 유물', r5b);
    // 6) 암시장: 보유 유물 ◀▶ · 판매(두 번) · 가득 찬 칸 구매 → 교체
    await sleep(300);
    const before = await page.evaluate(() => ({ slush: run.slush, price: relicSellPrice('payday') }));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-own-sell="payday"]'), page.locator('[data-own-sell="payday"]')).click(); await sleep(100);
    const armed = await page.evaluate(() => hasRelic('payday'));
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-own-sell="payday"]'), page.locator('[data-own-sell="payday"]')).click(); await sleep(150);
    const after = await page.evaluate(() => ({ slush: run.slush, has: hasRelic('payday'), n: run.relics.length }));
    ok(armed && !after.has && after.n === 5 && after.slush === before.slush + before.price && before.price > 0, W + ' 판매: 두 번 눌러야 · 비자금 +판매가', [before, after]);
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-own-move="1"][data-own-relic="dopamine"]'), page.locator('[data-own-move="1"][data-own-relic="dopamine"]')).click(); await sleep(150);
    ok(await page.evaluate(() => run.relics[1] === 'dopamine'), W + ' 암시장 ▶ 버튼으로 칸 이동');
    const r6 = await page.evaluate(() => {   // 칸 채우기: 보유·진열에 없는 유물 (보상으로 vip가 나왔을 수도 있어 고정 id를 쓰지 않는다)
      const fill = RELICS.map(r => r.id).find(x => !hasRelic(x) && run.shop.relics.indexOf(x) < 0); gainRelic(fill, 't'); run.slush = 99999; const id = run.shop.relics.find(x => !hasRelic(x)); renderShop(); return id; });
    ok(await page.evaluate(() => relicSlotsFull()), W + ' 암시장: 6칸 가득');
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, `[data-buy-relic="${r6}"]`), page.locator(`[data-buy-relic="${r6}"]`)).click(); await sleep(200);
    ok(await page.locator('[data-swap-pick]').count() === 6, W + ' 가득 찬 칸에서 구매 → 교체 오버레이');
    await (await page.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="swapGiveUp"]'), page.locator('[data-act="swapGiveUp"]')).click(); await sleep(150);
    ok(await page.evaluate(id => !hasRelic(id) && run.slush === 99999, r6), W + ' 사지 않기 → 비자금 그대로');
    if(W === 1920){ await page.evaluate(() => renderShop()); await page.screenshot({ path: S + '/relicslots-shop.png', fullPage: false }); }
    await page.close();
  }
  console.log('FAIL', fail, '/', pass + fail, 'errors', errs);
  await b.close();
})();
