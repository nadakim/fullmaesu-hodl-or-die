// 연출 고조 (juice-escalation): 정산 무대 구간 돌파음·최고 갱신 암전·단위 돌파·크리티컬 777 · 급등 로켓 · 콤보 슬램 · JACKPOT 음악 ·
// 마감 임박 · 동전 폭포 · SURVIVED(간신히 생존) · 턱걸이 통과 · 흔들림 끔이면 번쩍임·암전 없이 소리만 · 튜너에 새 수치
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 효과음·도장·화면 번쩍임을 기록 (원래 동작은 그대로)
const spy = () => {
  window.__snd = []; window.__stamps = []; window.__screens = [];
  if(window.__spyOn) return; window.__spyOn = true;
  const orig = Sound.play; Sound.play = (n, o) => { window.__snd.push(n); return orig(n, o); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(nd => {
    if(!nd.classList) return;
    if(nd.classList.contains('fx-stamp')) window.__stamps.push(nd.textContent);
    if(nd.classList.contains('fx-screen')) window.__screens.push(nd.className);
  }))).observe(document.body, { childList: true });
};
const cnt = (arr, n) => arr.filter(x => x === n).length;
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(500);
    await p.evaluate(spy);

    // ── A. 정산 무대: 곱하기 유물 + 레버리지 → 구간 돌파 · 최고 갱신(이전 최고 1만) · 크리티컬 ×5 · 단위 돌파
    await p.evaluate(() => { clearToasts(); window.tipChance = () => 0; window.rollCrit = () => 5;
      ['antFlag', 'levTower'].forEach(id => gainRelic(id, 't'));
      openPosition('coin', 3000, 3, 1, true); openPosition('semi', 2000, 2, 1, true); openPosition('meme', 1000, 1, 1, true);
      stageBest = { run, payout: 1 }; unitSeen = { run, max: 0 }; __snd.length = 0; __stamps.length = 0; __screens.length = 0;
      startMarket(); run.allProtectedToday = true;   // 시장 난수로 반대매매가 끼지 않게 (오늘 전 포지션 면제)
      while(run.phase === 'market'){ ['coin', 'semi', 'meme'].forEach(id => { assets[id].price *= 1.004; }); tick(); } renderAll(); });
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 });
    const reelDone = await p.waitForFunction(() => { const e = document.querySelector('.stage-reel'); return e && !e.classList.contains('spin') ? e.textContent : false; }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);
    if(W === 1920) await p.screenshot({ path: `${S}/esc-crit-${W}.png` });
    await p.waitForFunction(() => stage && stage.hold, null, { timeout: 20000 }).catch(() => {});
    if(W === 1920) await p.screenshot({ path: `${S}/esc-stage-${W}.png` });
    const st = await p.evaluate(() => ({ snd: __snd.slice(), stamps: __stamps.slice(), screens: __screens.slice(), amt: $('sfAmtV').innerHTML }));
    ok(W + ' 구간 돌파음 tierBreak', st.snd.includes('tierBreak'), st.snd.filter(n => /tier|settle/.test(n)).slice(0, 8));
    ok(W + ' 크리티컬 릴 7 7 7: 틱 2번 + 잭팟 + CRITICAL 도장', !!reelDone && /7\s*7\s*7/.test(reelDone) && cnt(st.snd, 'reelStop') >= 2 && cnt(st.snd, 'reelStop') === 2 * cnt(st.snd, 'jackpot') && st.stamps.some(t => /CRITICAL ×5/.test(t)), { reelDone, stamps: st.stamps });
    ok(W + ' 이번 판 최고 갱신: 암전 + 쿵(bestBoom) 하루 한 번', cnt(st.screens, 'fx-screen blackout') === 1 && cnt(st.snd, 'bestBoom') === 1, st.screens);
    ok(W + ' 금액 단위 돌파: unitBreak + 첫 도달 도장', st.snd.includes('unitBreak') && st.stamps.some(t => /^첫 1(억|조|경)/.test(t)), st.stamps);
    await p.evaluate(() => { stage.readyAt = 0; stageNext(); });

    // ── B6·B7 콤보 슬램 · JACKPOT 음악
    const cs = await p.evaluate(() => { hideStreak(); const seen = []; const ob = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(nd => { if(nd.classList && nd.classList.contains('combo-slam')) seen.push(nd.textContent); }))); ob.observe(document.body, { childList: true });
      for(let i = 0; i < 12; i++) comboHit('t'); return new Promise(r => setTimeout(() => { ob.disconnect(); r({ seen, jp: !!Music.mood.jackpot }); }, 50)); });
    ok(W + ' 콤보 슬램: c3(×5)·c4(×8)·JACKPOT(×12) 단계마다 한 번씩', cs.seen.join() === 'COMBO ×5,COMBO ×8,JACKPOT ×12', cs.seen);
    ok(W + ' JACKPOT 음악 레이어 켜짐', cs.jp);
    ok(W + ' 콤보 끊기면 JACKPOT 레이어 꺼짐', await p.evaluate(() => { comboBreak(); return !Music.mood.jackpot; }));

    // ── C9 동전 폭포 (수익 매도)
    await p.evaluate(() => { hideOverlay(); run.positions.slice().forEach(x => closePosition(x, 0)); run.phase = 'premarket'; openPosition('semi', 3000, 1, 1, true); renderAll(); });
    await p.evaluate(() => { assets.semi.price *= 1.3; posSig = ''; renderAll(); __snd.length = 0; });
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#positionsBox .sell-btn'), p.locator('#positionsBox .sell-btn').first()).click();
    await sleep(120);
    if(W === 1920) await p.screenshot({ path: `${S}/esc-cashout-${W}.png` });
    await sleep(1500);
    const co = await p.evaluate(() => ({ dings: __snd.filter(n => n === 'coinIn').length }));
    ok(W + ' 동전 폭포: 도착마다 입금음 (최대 cashoutMaxDings)', co.dings > 0 && co.dings <= 12, co);

    // ── B8 마감 임박 · B5 급등 로켓
    const cl = await p.evaluate(() => { __snd.length = 0; openPosition('coin', 1000, 1, 1, true); startMarket(); while(run.tickInDay < TICKS_PER_DAY - 3) tick();
      const on = document.body.classList.contains('closing'); juiceClosing(); const after = document.body.classList.contains('closing');
      showChart('coin'); renderAll(); juiceRockets(); assets.coin.price *= 1.08; const parts0 = Fx.particleCount; juiceRockets();
      return { before: on, after, roll: __snd.includes('closeRoll'), red: getComputedStyle($('dayText')).color, rocket: Fx.particleCount > parts0 }; });
    ok(W + ' 마감 임박: 마지막 3틱 = closing + 드럼 롤 + 틱 표시 빨강', !cl.before && cl.after && cl.roll && cl.red === 'rgb(255, 26, 60)', cl);
    ok(W + ' 급등 로켓: 보유 종목 +5% → 불꽃', cl.rocket, cl);
    if(W === 1920) await p.screenshot({ path: `${S}/esc-closing-${W}.png` });

    // ── D10 SURVIVED: 위험 → 안전 (반대매매 없이), 같은 포지션 하루 1번, 위험 중 BGM 로우패스
    const sv = await p.evaluate(async () => {
      run.positions.slice().forEach(x => closePosition(x, 0)); __stamps.length = 0; __snd.length = 0; __screens.length = 0;
      startMarket(); window.__tick = tick; window.tick = () => {};   // 기다리는 동안 게임 루프가 장을 진행하지 않게
      const pos = openPosition('meme', 2000, 3, 1, true);
      let guard = 0; while(!marginWarn(pos) && guard++ < 400) assets.meme.price *= 0.995;
      const warn = marginWarn(pos), called = marginCalled(pos); renderAll();
      juiceSurvive();
      for(let w = 0; w < 30 && !Music.dangerHz; w++) await new Promise(r => setTimeout(r, 100));   // heartLoop 한 바퀴 (최대 3초)
      const muffle = Music.dangerHz, dbg = { overlayOpen, tab: currentTab, phase: run.phase, danger: posInDanger(pos) };
      assets.meme.price *= 1.25; renderAll(); juiceSurvive(); await new Promise(r => setTimeout(r, 30));
      const first = { stamps: __stamps.slice(), snd: __snd.includes('survived'), screen: __screens.slice(), muffleAfter: Music.dangerHz };
      guard = 0; while(!marginWarn(pos) && guard++ < 400) assets.meme.price *= 0.995; juiceSurvive(); assets.meme.price *= 1.25; juiceSurvive(); await new Promise(r => setTimeout(r, 300));
      window.tick = window.__tick;
      return { warn, called, muffle, dbg, first, again: __stamps.filter(t => t === '간신히 생존!').length };
    });
    ok(W + ' 위험 중 BGM 로우패스 (danger)', sv.warn && !sv.called && sv.muffle > 0, sv);
    ok(W + ' SURVIVED: 도장 + 차임 + 청록 번쩍 + 로우패스 해제', sv.first.stamps.includes('간신히 생존!') && sv.first.snd && sv.first.screen.some(c => /survive/.test(c)) && sv.first.muffleAfter === 0, sv.first);
    ok(W + ' SURVIVED: 같은 포지션은 하루 1번', sv.again === 1, sv.again);

    // ── D11 턱걸이 통과 (목표의 101%)
    await p.evaluate(() => { run.positions.slice().forEach(x => closePosition(x, 0)); run.cash = currentTarget() * 1.01 + run.overdraft; __stamps.length = 0; __snd.length = 0;
      run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } Fx.skipQueue(); });
    await p.waitForFunction(() => { if(chainPlay) skipSettlementChain(); return !!chainHold; }, null, { timeout: 8000 }).catch(() => {});   // 이번 주 체인은 건너뛰고 끝으로
    const sq = await p.waitForFunction(() => __stamps.includes('턱걸이 통과!') ? { snd: __snd.includes('sigh'), pct: run.lastWeek.pct } : false, null, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => null);
    ok(W + ' 턱걸이 통과: 도장 + 한숨 (목표 100~103%)', !!sq && sq.snd && sq.pct >= 1 && sq.pct <= 1.03, sq || await p.evaluate(() => ({ phase: run.phase, lw: run.lastWeek && run.lastWeek.pct, stamps: __stamps, ov: $('overlayBox').textContent.slice(0, 80), q: Fx.queueLength, hold: !!chainHold, play: !!chainPlay })));
    if(W === 1920) await p.screenshot({ path: `${S}/esc-squeak-${W}.png` });
    await p.close();
  }

  // ── 흔들림 끔: 번쩍임·암전 없이 소리만
  const q = await b.newPage({ viewport: { width: 1366, height: 768 } });
  q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic'); await q.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await q.keyboard.press('Shift');
  await q.click('#startBtn'); await sleep(400);
  await q.evaluate(spy);
  const nm = await q.evaluate(() => { settings.shake = false; applySettings(); __snd.length = 0; __screens.length = 0;
    stageBestHit(); survived({ id: -1 }); speedLines();
    return new Promise(r => setTimeout(() => r({ screens: __screens.slice(), speed: !!document.querySelector('.fx-speed'), snd: __snd.slice(), noMotion: document.body.classList.contains('no-motion') }), 200)); });
  ok('흔들림 끔: 암전·번쩍임·속도선 없음, 소리는 남음', nm.noMotion && nm.screens.length === 0 && !nm.speed && nm.snd.includes('bestBoom') && nm.snd.includes('survived'), nm);
  await q.close();

  // ── 튜너에 새 수치
  const t = await b.newPage();
  await t.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic&tuner=1'); await t.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await sleep(400);
  const keys = ['multHitStopMs.2', 'blackoutMs', 'unitPopScale', 'critFreezeMs', 'rocketPct', 'comboSlamMs', 'closeTicks', 'cashoutMaxDings', 'dangerMuffleHz.1', 'squeakMax', 'slowMoMs'];
  const miss = await t.evaluate(ks => ks.filter(k => !document.querySelector(`[data-tn="${k}"]`)), keys);
  ok('튜너에 새 수치', miss.length === 0, miss);
  await t.close();
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
