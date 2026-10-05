// 온보딩 단계 해금: 1주차는 롱·정산·유물·목표만 (잠긴 UI 숨김 · 잠긴 카드 사용/후보 차단) → 2주차 시그널·찌라시·뉴스 / 3주차 공매도·레버리지·암시장 확장 해금 + 소개 창 1번 ·
// 한 번 도달한 주차는 영구 (다음 판엔 처음부터 열림, 소개 다시 없음) · 이어하기로 반복 안 됨 · 설정 끔 = 알림만 · 플래그 끔(ONBOARDING_ON=false) = 전부 보임
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 이번 주를 통과시키고 보상·암시장을 건너뛰어 다음 주 TR룸으로
const nextWeek = async p => {
  await p.evaluate(() => { window.tipChance = () => 0; run.cash += 1e6; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } Fx.skipQueue(); });
  await p.waitForFunction(() => !!chainHold || !!chainPlay, null, { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => { if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); } });
  await p.waitForSelector('[data-act="toReward"]', { timeout: 8000 }).catch(() => {});   // 결산 결과가 뜬 뒤에 (연출 큐 → 결과 화면 순서를 기다린다)
  await p.evaluate(() => { hideOverlay(); if(run.rewardStep === 'card') chooseReward('skip'); if(run.rewardStep === 'relic') chooseRelicReward(''); hideOverlay(); leaveShop(); switchTab('play'); renderAll(); });
  for(let i = 0; i < 20; i++){ await sleep(150); await p.evaluate(() => { if(Fx.queueBusy) Fx.skipQueue(); }); }
};
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !!e.offsetParent; }, sel);
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?layout=classic'); await p.keyboard.press('Shift');
    await p.evaluate(() => { localStorage.removeItem('hodl.unlockWeek'); }); await p.reload(); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(900);
    // 1) 1주차: 잠긴 UI 숨김
    const w1 = await p.evaluate(() => ({ cls: document.body.className,
      deck: run.masterDeck.slice(), held: run.heldCards.slice(),
      sig: [...document.querySelectorAll('.q-sig')].some(e => e.offsetParent), inv: !!document.querySelector('.quote-row[data-q="inv"]').offsetParent,
      delist: !!document.querySelector('.quote-row[data-q="delist"]').offsetParent, news: !!document.querySelector('.news-row').offsetParent }));
    ok(W + ' 1주차: 시그널·인버스·작전주·뉴스 숨김', !w1.sig && !w1.inv && !w1.delist && !w1.news, w1);
    ok(W + ' 1주차: 시작 덱에 잠긴 카드 없음 (롱 종목 + 손절/익절)', w1.deck.length === 10 && w1.held.indexOf('short') >= 0 && w1.deck.indexOf('credit') < 0, w1.deck);
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#menuBtn'), p.locator('#menuBtn')).click(); await sleep(150);
    const menu = await p.evaluate(() => [...document.querySelectorAll('#menuPanel button')].filter(e => e.offsetParent).map(e => e.dataset.menu));
    ok(W + ' 1주차: 메뉴에 찌라시·시그널 설명서·섹터 없음', menu.indexOf('tips') < 0 && menu.indexOf('signalGuide') < 0 && menu.indexOf('sectors') < 0 && menu.indexOf('deck') >= 0, menu);
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#menuBtn'), p.locator('#menuBtn')).click(); await sleep(100);
    const blk = await p.evaluate(() => { run.hand = ['short', 'credit', 'stk_semi'].map(newCard); handSig = ''; renderAll(); return [checkPlay(0), checkPlay(1), checkPlay(2, undefined, { amount: 1000 })]; });
    ok(W + ' 1주차: 잠긴 카드 사용 차단 (엔진 sysLocked)', blk[0] === 'sysLocked' && blk[1] === 'sysLocked' && blk[2] === null, blk);
    const pools = await p.evaluate(() => [CARDS.filter(c => cardAllowed(c.id)).some(c => ['short', 'credit', 'dove', 'rpt_semi'].indexOf(c.base) >= 0 || c.type === 'report'), tipChance()]);
    ok(W + ' 1주차: 보상·팩 후보에 잠긴 카드 없음 · 찌라시 확률 0', !pools[0] && pools[1] === 0, pools);
    if(W === 1920) await p.screenshot({ path: `${S}/onboarding-w1-${W}.png` });
    // 2) 1주차 결산 → 암시장: 리서치 팩·카드 제거 없음 (다음 주 기준)
    await p.evaluate(() => { run.hand = []; handSig = ''; window.tipChance = () => 0; run.cash += 1e6; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market') tick(); Fx.skipQueue(); });
    await p.waitForFunction(() => !!chainHold || !!chainPlay, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); } });
    await sleep(200);
    await p.evaluate(() => { hideOverlay(); if(run.rewardStep === 'card') chooseReward('skip'); if(run.rewardStep === 'relic') chooseRelicReward(''); hideOverlay(); run.slush = 9999; renderAll(); });
    await sleep(900);
    const shop = await p.evaluate(() => ({ research: !!document.querySelector('[data-pack="research"]'), rm: !!document.querySelector('.shop-remove'), svc: !!document.querySelector('[data-service]'),
      buyRes: buyPack('research'), relics: run.shop.relics }));
    ok(W + ' 1주차 암시장: 리서치 팩·카드 제거·덱 조작 없음 (엔진도 거절)', !shop.research && !shop.rm && !shop.svc && shop.buyRes === false, shop);
    // 3) 2주차: 시그널·찌라시·뉴스 해금 + 소개 창 (3장)
    await p.evaluate(() => { leaveShop(); switchTab('play'); renderAll(); });
    for(let i = 0; i < 20; i++){ await sleep(150); await p.evaluate(() => { if(Fx.queueBusy) Fx.skipQueue(); }); }
    await p.waitForFunction(() => overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금'), null, { timeout: 8000 }).catch(() => {});
    const titles = [];
    for(let i = 0; i < 6; i++){
      const t = await p.evaluate(() => overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금') ? $('overlayBox').querySelector('.ov-title').textContent : '');
      if(!t) break;
      titles.push(t);
      if(i === 0 && W === 1920) await p.screenshot({ path: `${S}/onboarding-popup-${W}.png` });
      const lines = await p.evaluate(() => $('overlayBox').querySelectorAll('.unlock-lines p').length);
      if(lines > 3) titles.push('TOO_LONG');
      await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="unlockNext"]'), p.locator('[data-act="unlockNext"]')).click(); await sleep(350);
    }
    ok(W + ' 2주차: 해금 소개 3장 (시그널·찌라시·뉴스), 한 장 3줄 이내', titles.length === 3 && titles.join().includes('시그널') && titles.join().includes('찌라시') && titles.join().includes('뉴스'), titles);
    const w2 = await p.evaluate(() => ({ round: run.round, sig: [...document.querySelectorAll('.q-sig')].some(e => e.offsetParent), inv: !!document.querySelector('.quote-row[data-q="inv"]').offsetParent,
      deck: run.masterDeck.indexOf('indicators') >= 0, credit: run.masterDeck.indexOf('credit') >= 0, store: localStorage.getItem('hodl.unlockWeek'), tip: sysOpen('tips') }));
    ok(W + ' 2주차: 시그널 보임 · 보조지표 덱에 · 인버스·신용은 아직 잠김 · 찌라시 켜짐', w2.round === 2 && w2.sig && !w2.inv && w2.deck && !w2.credit && w2.tip, w2);
    ok(W + ' 도달 주차 저장 (hodl.unlockWeek = 2)', w2.store === '2', w2.store);
    // 4) 이어하기: 소개 반복 안 됨
    await p.evaluate(() => { switchTab('title'); }); await sleep(300);
    await p.evaluate(() => { switchTab('play'); renderAll(); }); await sleep(1200);
    ok(W + ' 이어하기 → 소개 다시 안 뜸', await p.evaluate(() => !(overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금'))));
    // 5) 3주차: 공매도·레버리지·암시장 확장 + 시작 카드 복귀
    await nextWeek(p);
    const t3 = [];
    for(let i = 0; i < 6; i++){
      await p.waitForFunction(() => overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금'), null, { timeout: 3000 }).catch(() => {});
      const t = await p.evaluate(() => overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금') ? $('overlayBox').querySelector('.ov-title').textContent : '');
      if(!t) break;
      t3.push(t); await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="unlockNext"]'), p.locator('[data-act="unlockNext"]')).click(); await sleep(300);
    }
    const w3 = await p.evaluate(() => ({ round: run.round, inv: !!document.querySelector('.quote-row[data-q="inv"]').offsetParent, deck: ['credit', 'short', 'hodl', 'marginTopup', 'stk_inv'].every(id => run.masterDeck.indexOf(id) >= 0),
      held: run.heldCards.length, fss: !!$('fssBox').offsetParent || document.body.classList.contains('lock-fss') }));
    ok(W + ' 3주차: 공매도·레버리지·암시장 확장 소개 + 빼 둔 시작 카드가 덱으로', t3.length === 3 && w3.round === 3 && w3.inv && w3.deck && w3.held === 0 && w3.fss, { t3, w3 });
    // 6) 새 판: 도달한 주차(3)까지 처음부터 열림 · 소개 없음 · 설정 끔
    await p.evaluate(() => { startRun(); }); await sleep(700);
    const n1 = await p.evaluate(() => ({ base: run.unlockBase, deck: run.masterDeck.length, cls: document.body.className, inv: !!document.querySelector('.quote-row[data-q="inv"]').offsetParent }));
    ok(W + ' 새 판: 도달한 3주차까지 처음부터 열림 (시작 덱 15장)', n1.base === 3 && n1.deck === 15 && n1.inv && !/lock-(short|signals|leverage)/.test(n1.cls), n1);
    await p.evaluate(() => { settings.unlockTips = false; run.round = 3; });
    await nextWeek(p); await sleep(600);
    const n4 = await p.evaluate(() => ({ round: run.round, pop: overlayOpen && $('overlayBox').textContent.includes('새 시스템 해금'), fss: document.body.classList.contains('lock-fss') }));
    ok(W + ' 설정 "해금 소개" 끔 → 4주차 해금은 창 없이 열림', n4.round === 4 && !n4.pop && !n4.fss, n4);
    await p.evaluate(() => { settings.unlockTips = true; localStorage.removeItem('hodl.unlockWeek'); });
    await ctx.close();
  }
  // 7) 플래그 끔 → 전부 보임 (엔진 파일의 ONBOARDING_ON만 바꿔서)
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route('**/engine.js', async route => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('const ONBOARDING_ON = true', 'const ONBOARDING_ON = false') }); });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?layout=classic'); await p.keyboard.press('Shift'); await p.evaluate(() => localStorage.removeItem('hodl.unlockWeek'));
  await p.click('#startBtn'); await sleep(900);
  const off = await p.evaluate(() => ({ flag: ONBOARDING_ON, cls: document.body.className, deck: run.masterDeck.length, sig: [...document.querySelectorAll('.q-sig')].some(e => e.offsetParent),
    rows: [...document.querySelectorAll('.quote-row')].filter(e => e.offsetParent).length, news: !!document.querySelector('.news-row').offsetParent, play: (run.hand = ['short'].map(newCard), checkPlay(0)) }));
  ok('플래그 끔 → 1주차부터 전부 보임 · 시작 덱 15장 · 공매도 사용 가능', !off.flag && !/lock-/.test(off.cls) && off.deck === 15 && off.sig && off.rows === 12 && off.news && off.play === null, off);
  await ctx.close();
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
