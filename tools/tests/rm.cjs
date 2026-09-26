const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.evaluate(() => setSeed(7));
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(300);
    await page.evaluate(() => { window.tipChance = () => 0; });
    // 시세판 시그널
    const q = await page.evaluate(() => STOCKS.map(s => document.querySelector(`[data-q="${s.id}"] .q-sig`).textContent));
    ok(q.slice(0,5).every(t => /적중 65%/.test(t)) && /지수 연동/.test(q[5]), w + ' 시세판 시그널 아이콘 + 적중 65% (인버스는 없음)', q);
    const shownOk = await page.evaluate(() => STOCKS.filter(hasRegime).every(s => document.querySelector(`[data-q="${s.id}"] .q-sig`).textContent.indexOf(SIGNAL_ICON[run.signals[s.id].shown]) >= 0 && document.querySelector(`[data-q="${s.id}"] .q-sig`).title.indexOf(SIGNAL_LABEL[run.signals[s.id].shown]) >= 0));
    ok(shownOk, w + ' 표시 시그널 = 엔진 run.signals');
    // 뉴스 배너
    const news = await page.evaluate(() => [$('newsText').textContent, run.newsToday]);
    ok(news[0].startsWith('📰 오늘 개장:') && /(확정|루머 60%)/.test(news[0]), w + ' 장전 뉴스 배너', news);
    // 카드 EV: 포지션 → 비둘기·리딩방·작전 세력
    await page.evaluate(() => { run.hand = ['stk_semi','dove','pump','manip','indicators','analyst'].map(newCard); handSig=''; renderAll(); });
    await page.locator('#handBox .card').first().click(); await page.waitForTimeout(200);
    // 격자 카드: EV는 툴팁 (cardEvView = 툴팁이 쓰는 값)
    const ev = await page.evaluate(() => [...document.querySelectorAll('#handBox .card')].map(c => { const v = cardEvView(CARD_BY_ID[c.dataset.cid]); return v ? [c.querySelector('.g-name').textContent, v.text, v.cls, v.title] : null; }).filter(Boolean));
    ok(ev.length === 3 && ev.some(e => /비둘기/.test(e[0]) && /^EV [+−±]₩/.test(e[1])) && ev.some(e => /리딩방/.test(e[0]) && e[1] === 'EV +3.2%') && ev.some(e => /작전/.test(e[0]) && e[1] === 'EV +5.6%'), w + ' 카드 EV (비둘기 ₩, 리딩방 +3.2%, 작전 +5.6%)', ev.map(e => e.slice(0,2)));
    await page.locator('#handBox .card', { hasText: '리딩방' }).hover(); await page.waitForTimeout(450);
    const ctip = await page.evaluate(() => { const t = document.querySelector(".card-tip"); const r = t.getBoundingClientRect(); return [t.hidden, t.textContent, r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight]; });
    ok(!ctip[0] && /EV \+3\.2%/.test(ctip[1]) && /반도체전자 \+₩/.test(ctip[1]), w + " 리딩방 툴팁: EV + 보유 종목 EV", ctip[1].slice(0, 120));
    ok(ctip[2] || w === 390, w + ' 툴팁이 화면 안');
    await page.mouse.move(1, 1);
    if (w === 1920) await page.screenshot({ path: S + '/rm-hand-1920.png' });
    if (w === 1366) await page.screenshot({ path: S + '/rm-hand-1366.png' });
    if (w === 390) { await page.locator('#handBox').scrollIntoViewIfNeeded(); await page.screenshot({ path: S + '/rm-hand-390.png' }); }
    // 보조지표: 85%로 다시 판독
    const acc = await page.evaluate(() => { const i = run.hand.findIndex(c => c.id === 'indicators'); playCard(i); renderAll(); return [STOCKS.filter(hasRegime).map(s => run.signals[s.id].acc), document.querySelector('[data-q="semi"] .q-sig').textContent]; });
    ok(acc[0].every(a => Math.abs(a - 0.85) < 1e-9) && /적중 85%/.test(acc[1]), w + ' 보조지표 → 85%', acc);
    // 애널리스트: 실제 추세 100%
    const an = await page.evaluate(() => { run.ap = 3; const i = run.hand.findIndex(c => c.id === 'analyst'); playCard(i, 'coin'); renderAll(); return [run.signals.coin.shown === assets.coin.regime, document.querySelector('[data-q="coin"] .q-sig').textContent]; });
    ok(an[0] && /확정 100%/.test(an[1]), w + ' 애널리스트 리포트 → 실제 추세 공개', an);
    // 개장: 뉴스 판정 공개
    await page.click('#openBtn'); await page.waitForTimeout(300);
    const nr = await page.evaluate(() => [$('newsText').textContent, run.newsActive, NEWS_BY_ID[run.newsToday].reliability]);
    ok(nr[0].startsWith(nr[1] ? '📰 사실로 확인' : '📰 루머로 판명') || nr[0].startsWith('⚡'), w + ' 개장 뉴스 판정 공개', nr);
    // 장 마감: 내일 예고 + 어제 ✓/✗
    await page.evaluate(() => { while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
    await page.waitForTimeout(100);
    const de = await page.evaluate(() => [STOCKS.filter(hasRegime).map(s => [document.querySelector(`[data-q="${s.id}"] .q-sig`).title, run.signalResults[s.id].hit]), run.newsToday, run.phase]);
    ok(de[0].every(([t, hit]) => /어제: .* 표시 → 실제 /.test(t) && t.trim().endsWith(hit ? '✓' : '✗')), w + ' 다음 날 시그널 툴팁 어제 ✓/✗ = 엔진 채점', de[0].map(x => [x[0].slice(-24), x[1]]));
    // 찌라시 EV
    await page.evaluate(() => { run.phase === 'premarket' && startMarket(); openTip('mom'); renderAll(); });
    await page.waitForTimeout(300);
    const tip = await page.evaluate(() => [...document.querySelectorAll('[data-tip-choice]')].map(c => [c.querySelector('.ch-meta').textContent, (c.querySelector('.ch-ev') || {}).textContent, (c.querySelector('.ch-ev') || {}).className]));
    const expA = await page.evaluate(() => Math.round(tipExpectedValue(0).ev));
    ok(tip.length === 2 && /EV 순자산/.test(tip[0][1]) && tip[0][1].indexOf(Math.abs(expA).toLocaleString()) >= 0 && /비자금 \+/.test(tip[1][1]), w + ' 찌라시 A/B EV', [tip, expA]);
    if (w === 1920) await page.screenshot({ path: S + '/rm-tip-1920.png' });
    if (w === 390) await page.screenshot({ path: S + '/rm-tip-390.png' });
    await page.evaluate(() => { resolveTip(1); hideOverlay(); renderAll(); });
    const hw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(hw, w + ' 가로 넘침 없음');
    if (w !== 390) { await page.evaluate(() => { tick(); renderAll(); }); await page.screenshot({ path: S + `/rm-quotes-${w}.png` }); }
    await page.close();
  }
  ok(errs.length === 0, 'page errors 없음', errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
