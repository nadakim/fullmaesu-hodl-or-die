const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch(); const errs = []; const res = [];
  for (const [W, H] of [[1615,900],[1366,768],[1920,1080],[2560,1440],[1280,1024],[390,844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(W + ' ' + e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift'); await sleep(300);
    const ok = (name, c, info) => res.push(`${W} ${c ? 'OK ' : 'FAIL'} ${name}${c ? '' : ' ' + JSON.stringify(info)}`);
    // 좌표 정확도: 요소 중심의 elementFromPoint가 자기 자신(또는 자식)인지
    const hit = sel => p.evaluate(sel => { const el = document.querySelector(sel); if(!el) return 'none'; el.scrollIntoView({block:'nearest',inline:'nearest'}); const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return !!t && (el === t || el.contains(t)); }, sel);
    await p.click('#startBtn'); await sleep(300);
    await p.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi','pump','stopLoss'].map(newCard); handSig=''; renderAll(); });
    ok('hand card hit', await hit('#handBox .card'));
    const c0 = await p.evaluate(() => run.cash);
    await p.locator('#handBox .card').first().click(); await sleep(250);
    ok('hand card click → 매수', await p.evaluate(c0 => run.cash < c0 && run.positions.length === 1, c0));
    // 종목 대상 카드 → 시세 행 클릭
    await p.locator('#handBox .card', { hasText: '리딩방 찌라시' }).click(); await sleep(150);
    ok('quote row hit', await hit('[data-q="meme"]'));
    const h0 = await p.evaluate(() => run.hand.length);
    await p.locator('[data-q="meme"]').click(); await sleep(250);
    ok('quote target click → 사용', await p.evaluate(h0 => run.hand.length === h0 - 1, h0));
    // 포지션 대상 카드 → 포지션 클릭
    await p.locator('#handBox .card', { hasText: '손절 예약' }).click(); await sleep(150);
    const pid = await p.evaluate(() => run.positions[0].id);
    ok('position hit', await hit(`.pos-item[data-id="${pid}"]`));
    await p.locator(`.pos-item[data-id="${pid}"]`).click(); await sleep(250);
    ok('position target click → 사용', await p.evaluate(() => run.hand.length === 0));
    // 포지션 매도 버튼
    ok('sell btn hit', await hit(`[data-sell="${pid}"]`));
    const n0 = await p.evaluate(() => run.positions.length);
    await p.locator(`[data-sell="${pid}"]`).click(); await sleep(250);
    ok('sell btn click → 매도', await p.evaluate(n0 => run.positions.length === n0 - 1, n0));
    // 결산 → 오버레이 버튼
    await p.evaluate(() => { run.cash += 5000; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
    await p.evaluate(async () => { for(let i = 0; i < 100 && !chainHold && !document.querySelector('[data-act="toReward"]'); i++) await new Promise(r => setTimeout(r, 100)); });
    await sleep(600);
    if (await p.locator('#chainNextBtn, .chain-next').count()) { await p.locator('#chainNextBtn, .chain-next').first().click(); await sleep(300); }
    ok('overlay toReward hit', await hit('[data-act="toReward"]'));
    await p.locator('[data-act="toReward"]').click(); await sleep(250);
    ok('reward card hit', await hit('[data-reward]'));
    await p.locator('[data-reward]').first().click(); await sleep(250);
    if (await p.locator('[data-relic-reward]').count()) { ok('relic reward hit', await hit('[data-relic-reward]')); await p.locator('[data-relic-reward]').first().click(); }
    await sleep(400);
    ok('shop phase', await p.evaluate(() => run.phase === 'shop'), await p.evaluate(() => run.phase));
    await p.evaluate(() => { run.slush += 5000; renderAll(); });
    ok('pack ? hit', await hit('[data-pack-info]'));
    await p.locator('[data-pack-info]').first().click(); await sleep(250);
    ok('pack popup open', await p.evaluate(() => overlayOpen));
    await p.keyboard.press('Escape'); await p.evaluate(() => { if(overlayOpen) hideOverlay(); }); await sleep(200);
    const btn = p.locator('[data-single]:not([disabled])').first();
    ok('single buy hit', await hit('[data-single]:not([disabled])'));
    const d0 = await p.evaluate(() => run.masterDeck.length);
    await btn.click(); await sleep(300);
    ok('single buy click', await p.evaluate(d0 => run.masterDeck.length === d0 + 1, d0));
    await p.close();
  }
  console.log(res.join('\n')); console.log('errors', errs); await b.close(); })();
