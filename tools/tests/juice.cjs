const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, info) => results.push([cond ? 'PASS' : 'FAIL', name, info === undefined ? '' : (typeof info === 'string' ? info : JSON.stringify(info))]);
// Sound.play 호출을 기록 (원래 함수는 그대로 부른다)
const spy = () => { window.__sfx = []; if(window.__spyOn) return; window.__spyOn = true; const orig = Sound.play; Sound.play = (n, o) => { window.__sfx.push([n, o && o.pitch ? +o.pitch.toFixed(4) : 1, performance.now()]); return orig(n, o); }; };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const newPage = async (vp, opts) => {
    const ctx = await b.newContext({ viewport: vp, reducedMotion: (opts && opts.reduced) ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
    await page.reload(); await page.keyboard.press('Shift');
    return page;
  };

  // ── A. 오디오: 잠금 해제, 모든 효과음, 설정 즉시 반영
  let page = await newPage({ width: 1920, height: 1080 });
  await page.evaluate(spy);
  await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(300);
  const a = await page.evaluate(async () => {
    const names = Object.keys(Sound.SFX), failed = [];
    for(const n of names){ if(!Sound.play(n, { rarity: 'mythic', lev: 3 })) failed.push(n); await new Promise(r => setTimeout(r, 35)); }
    return { state: Sound.context && Sound.context.state, names: names.length, failed, sound: settings.sound, vol: settings.sfxVol, tick: settings.tickSound, hs: settings.hitStop };
  });
  ok('첫 클릭으로 AudioContext running', a.state === 'running', a.state);
  ok('기본값: 사운드 켜기 · 볼륨 50 · 틱 끄기 · 히트스톱 켜기', a.sound === true && a.vol === 50 && a.tick === false && a.hs === true, a);
  ok(`효과음 ${a.names}개 전부 재생`, a.failed.length === 0, a.failed.join(','));
  const v = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 300));
    const out = { voicesBefore: Sound.activeVoices };
    // 동시 발음 8개 제한
    ['marginCall','bankrupt','victory','weekClear','relicGain','tipBust','dayEnd','marketOpen','gapDown','gapUp','packFlip'].forEach(n => Sound.play(n, { rarity: 'rare' }));
    out.voicesCapped = Sound.activeVoices; out.stolen = Sound.stats.stolen;
    // 30ms 안의 중복은 1번
    const m0 = Sound.stats.merged, p0 = Sound.stats.played.sellWin || 0;
    for(let i = 0; i < 5; i++) Sound.play('sellWin');
    out.mergedAdded = Sound.stats.merged - m0; out.sellWinAdded = (Sound.stats.played.sellWin || 0) - p0;
    return out;
  });
  ok('동시 발음 최대 8개', v.voicesCapped <= 8 && v.stolen > 0, v);
  ok('같은 소리 5번(30ms 안) → 1번 + 4번 합침', v.sellWinAdded === 1 && v.mergedAdded === 4, v);
  // 설정 → 사운드 끄기 즉시
  await page.evaluate(() => { hideOverlay(); switchTab('title'); });
  await page.click('#settingsBtn'); await sleep(400);
  const sRows = await page.evaluate(() => ['sound','sfxVol','tickSound','hitStop','shake'].map(k => !!document.querySelector(`[data-row="${k}"]`)));
  ok('설정 화면에 사운드·볼륨·틱·히트스톱·흔들림 행', sRows.every(Boolean), sRows);
  await page.evaluate(() => Sound.play('victory'));
  await page.locator('[data-row="sound"] button', { hasText: '끄기' }).click(); await sleep(50);
  const off = await page.evaluate(() => ({ voices: Sound.activeVoices, play: Sound.play('buy'), saved: JSON.parse(localStorage.getItem('hodl.settings')).sound,
                                           volDisabled: document.querySelector('[data-row="sfxVol"] button').disabled }));
  ok('사운드 끄기 → 울리던 소리 즉시 끊김 · 이후 재생 안 됨 · 저장 · 볼륨 행 비활성', off.voices === 0 && off.play === false && off.saved === false && off.volDisabled, off);
  await page.locator('[data-row="sound"] button', { hasText: '켜기' }).click();
  await page.locator('[data-row="sfxVol"] button', { hasText: '100' }).click(); await sleep(50);
  const vol = await page.evaluate(() => ({ play: Sound.play('buy'), saved: JSON.parse(localStorage.getItem('hodl.settings')).sfxVol }));
  ok('다시 켜기 · 볼륨 100 즉시 반영', vol.play === true && vol.saved === 100, vol);
  // 흔들림 끄기 → 흔들림·글리치·히트스톱 모두 꺼짐 (파티클은 유지)
  await page.locator('[data-row="shake"] button', { hasText: '끄기' }).click(); await sleep(50);
  const so = await page.evaluate(() => { const hs = Fx.hitStop(100); Fx.shake(3); Fx.glitch(); Fx.burst(100, 100, 5, ['--gold']);
    const cab = document.querySelector('.cabinet');
    return { motion: Fx.motion, hitStop: hs, shakeCls: cab.className, parts: Fx.particleCount, hsRowDisabled: document.querySelector('[data-row="hitStop"] button').disabled }; });
  ok('흔들림 끄기 → 흔들림·글리치·히트스톱 꺼짐, 파티클은 유지, 히트스톱 행 비활성', !so.motion && so.hitStop === 0 && !/shake|glitch/.test(so.shakeCls) && so.parts > 0 && so.hsRowDisabled, so);
  await page.locator('[data-row="shake"] button', { hasText: '켜기' }).click();
  await page.locator('[data-row="sfxVol"] button', { hasText: '50' }).click();
  await sleep(1500);
  ok('파티클이 다 사라지면 rAF 정지', await page.evaluate(() => !Fx.running && Fx.particleCount === 0));
  await page.screenshot({ path: S + '/j-settings-1920.png' });

  // ── B. 반대매매: 가장 무거운 연출
  await page.evaluate(() => { switchTab('title'); });
  await page.click('#startBtn'); await sleep(80); await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260));   // 진행 중인 판 → 한 번 더 눌러 확인 await sleep(200);
  await page.evaluate(spy);
  await page.evaluate(() => { window.tipChance = () => 0; setSeed(21); startRun(); run.hand = ['stk_meme', 'credit'].map(newCard); handSig = ''; renderAll(); });
  await page.locator('#handBox .card').nth(1).click(); await sleep(100);   // 신용 2x
  await page.locator('#handBox .card').first().click(); await sleep(500);  // 밈코인 → 카드가 포지션으로 날아간다
  const buySfx = await page.evaluate(() => __sfx.map(x => x[0]));
  ok('카드 사용 → cardPlay · 2x 매수 buy', buySfx.includes('cardPlay') && buySfx.includes('buy'), buySfx);
  await page.evaluate(() => { startMarket(); renderAll(); });
  const liq = await page.evaluate(async () => {
    __sfx.length = 0;
    assets.meme.price *= 0.55; checkMarginCalls(); renderAll();
    await new Promise(r => setTimeout(r, 15));   // 연출 큐가 다음 박자에 재생을 시작
    const at0 = { hitstop: document.body.classList.contains('fx-hitstop'), frozen: Fx.frozenFor(), parts: Fx.particleCount,
                  flash: !!document.querySelector('.red-flash') };
    await new Promise(r => setTimeout(r, 420));   // 도장은 연출 길이의 20% 지점
    const cab = document.querySelector('.cabinet');
    return { at0, after: { cls: cab.className, stamp: (document.querySelector('.fx-stamp') || {}).textContent, scan: !!document.querySelector('.fx-scan'),
             hitstop: document.body.classList.contains('fx-hitstop') }, sfx: __sfx.map(x => x[0]), liq: run.liquidations };
  });
  await page.screenshot({ path: S + '/j-margincall-1920.png' });
  ok('반대매매 발생', liq.liq === 1, liq.liq);
  ok('반대매매 순간: 히트스톱(80~120ms) · 빨간 번쩍임 · 파편 파티클', liq.at0.hitstop && liq.at0.frozen >= 60 && liq.at0.frozen <= 120 && liq.at0.flash && liq.at0.parts >= 30, liq.at0);
  ok('히트스톱 뒤: 강한 흔들림 + 글리치 + 스캔라인 + 반대매매 도장', /shake-3/.test(liq.after.cls) && /fx-glitch/.test(liq.after.cls) && liq.after.scan && liq.after.stamp === '반대매매' && !liq.after.hitstop, liq.after);
  ok('반대매매 소리 marginCall', liq.sfx.includes('marginCall'), liq.sfx);

  // ── C. 히트스톱이 있어도 엔진 결과는 같다: 같은 시드로 (1) 실제 게임 루프 + 연출 (2) 연출 없이 tick 반복
  //    반대매매·보유 종목 갭이 실제로 일어나는 시드를 골라서 비교한다 (히트스톱이 여러 번 끼도록)
  const setupRun = seed => { window.tipChance = () => 0; setSeed(seed); startRun();
    run.hand = ['credit', 'stk_meme', 'credit', 'stk_sc', 'stk_coin'].map(newCard); run.ap = 5; handSig = ''; renderAll();
    playCardFx(0, null); playCardFx(0, null); playCardFx(0, null); playCardFx(0, null); playCardFx(0, null); };
  await page.addInitScript(() => {});
  const pickSeed = await page.evaluate(src => { const setupRun = eval(src);
    for(let seed = 1; seed < 400; seed++){ setupRun(seed); const s0 = eventLog.length; startMarket(); while(run.phase === 'market') tick();
      const ev = eventLog.slice(s0).map(e => e.type); if(ev.includes('marginCall') && ev.includes('gap')) return seed; }
    return -1; }, '(' + setupRun.toString() + ')');
  const replay = async (useLoop) => page.evaluate(async ([useLoop, seed, src]) => {
    const setupRun = eval(src);
    setupRun(seed);
    const s0 = eventLog.length;
    window.__hsCount = 0;
    if(useLoop){ settings.speed = 4; startMarket(); renderAll(); while(run.phase === 'market') await new Promise(r => setTimeout(r, 40)); }
    else { startMarket(); while(run.phase === 'market') tick(); }
    return { cash: run.cash, realized: run.realized, liq: run.liquidations, int: run.interestPaid, eq: netEquity(), phase: run.phase, day: run.day,
             events: eventLog.slice(s0).map(e => e.type).join(','), hs: window.__hsCount };
  }, [useLoop, pickSeed, '(' + setupRun.toString() + ')']);
  await page.evaluate(() => { const o = Fx.hitStop; Fx.hitStop = ms => { const r = o(ms); if(r > 0) window.__hsCount++; return r; }; });
  const rLoop = await replay(true);
  const rFast = await replay(false);
  console.log('C seed', pickSeed, 'loop', JSON.stringify(rLoop).slice(0, 300));
  ok('실제 루프(히트스톱 ' + rLoop.hs + '회) vs 연출 없는 tick 반복: 현금·확정손익·반대매매·이자·이벤트 순서 동일',
     pickSeed > 0 && rLoop.hs > 0 && JSON.stringify({ ...rLoop, hs: 0 }) === JSON.stringify({ ...rFast, hs: 0 }), { seed: pickSeed, hs: rLoop.hs, liq: [rLoop.liq, rFast.liq], events: rLoop.events.split(',').length });
  await page.evaluate(() => { settings.speed = 1; });

  // ── D. 전량 매도 5포지션 + 한 틱 예약주문 5건: 소리가 한 번으로 합쳐진다
  const sell = await page.evaluate(async () => {
    window.tipChance = () => 0; setSeed(31); startRun(); run.cash += 8000;
    ['semi','coin','sc','gukbap','meme'].forEach(id => openPosition(id, 800, 1, 1, true));
    startMarket(); ['semi','coin','sc','gukbap','meme'].forEach(id => { assets[id].price *= 1.1; }); renderAll();
    const m0 = Sound.stats.merged; __sfx.length = 0;
    sellAllPositions(); renderAll();
    const a = { sfx: __sfx.map(x => x[0]).filter(n => n.startsWith('sell')), parts: Fx.particleCount, positions: run.positions.length };
    await new Promise(r => setTimeout(r, 200));
    ['semi','coin','sc','gukbap','meme'].forEach(id => { const p = openPosition(id, 800, 1, 1, true); p.stopLoss = true; });
    ['semi','coin','sc','gukbap','meme'].forEach(id => { assets[id].price *= 0.8; });
    const m1 = Sound.stats.merged, p1 = Sound.stats.played.sellLoss || 0;
    checkOrders(); renderAll();
    a.orderFilledMerged = Sound.stats.merged - m1; a.sellLossVoices = (Sound.stats.played.sellLoss || 0) - p1; a.left = run.positions.length;
    return a;
  });
  ok('전량 매도: 포지션 5개 청산, 매도 소리 1개 + 동전 파티클', sell.positions === 0 && sell.sfx.length === 1 && sell.parts > 0, sell);
  ok('한 틱에 손절 5건: sellLoss 1음 + 4번 합침', sell.left === 0 && sell.sellLossVoices === 1 && sell.orderFilledMerged >= 4, sell);

  // ── E. 결산 체인: 피치가 반음씩 오르고, 곱연산은 +2, 두 번째 포지션은 시작이 +2
  const chain = await page.evaluate(async () => {
    window.tipChance = () => 0; setSeed(7); startRun();
    ['seal','theme','gukbap'].forEach(id => gainRelic(id, 't')); run.cash += 3000;
    [['meme',600,4,false],['semi',1000,4,true]].forEach(([id,a,d,dia]) => { const p = openPosition(id,a,1,1,true); p.daysHeld = d; p.diamond = dia; });
    run.day = DAYS_PER_ROUND; startMarket(); assets.meme.price *= 1.25; assets.semi.price *= 1.06;
    __sfx.length = 0; endOfDay(); renderAll();
    while(chainPlay) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 560)); chainNext(); await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 300));
    return { sfx: __sfx.filter(x => x[0] !== 'uiClick' && x[0] !== 'countTick').map(x => [x[0], Math.round(12 * Math.log2(x[1]))]),
             ticks: __sfx.filter(x => x[0] === 'countTick').length, result: !!document.querySelector('.result-hero'), stinger: Music.instances.some(i => i.name === 'weekClear') };
  });
  console.log('chain sfx (이름, 반음):', JSON.stringify(chain.sfx));
  const steps = chain.sfx.filter(x => x[0] === 'chainStep').map(x => x[1]);
  // 밈코인: base 0, ×1.20(+1+2=3), ×1.15(+2+2=4) / 반도체: base 2, ×1.20(2+1+2=5), +다이아(2+2=4)
  ok('체인 스텝 피치 (반음): 밈코인 0→3→4, 반도체 2→5→4 (곱연산 +2, 두 번째 포지션 +2 시작)', JSON.stringify(steps) === JSON.stringify([0, 3, 4, 2, 5, 4]), steps);
  ok('카운트업 블립 반복 + 도장 2번 + 끝나면 weekClear(BGM 켜짐이면 스팅어) → 결산 화면', chain.ticks >= 32 && chain.sfx.filter(x => /^stamp/.test(x[0])).length === 2 && (chain.sfx.some(x => x[0] === 'weekClear') || chain.stinger) && chain.result, { ticks: chain.ticks });

  // 스킵: 남은 소리 끊고 도장 1번만 (weekClear 없음)
  const skip = await page.evaluate(async () => {
    window.tipChance = () => 0; setSeed(8); startRun(); ['seal','theme'].forEach(id => gainRelic(id, 't')); run.cash += 3000;
    const p = openPosition('meme', 600, 1, 1, true); p.daysHeld = 4;
    run.day = DAYS_PER_ROUND; startMarket(); assets.meme.price *= 1.2; endOfDay(); renderAll();
    await new Promise(r => setTimeout(r, 700));
    __sfx.length = 0;
    const before = Sound.activeVoices;
    skipSettlementChain();
    const after = { voices: Sound.activeVoices, sfx: __sfx.map(x => x[0]) };
    await new Promise(r => setTimeout(r, 1200));
    return { before, after, later: __sfx.map(x => x[0]) };
  });
  ok('스킵: 소리 끊고 stampWin 1번만, weekClear 없음', skip.after.sfx.join() === 'stampWin' && skip.after.voices === 1 && !skip.later.includes('weekClear'), skip);
  await page.close();

  // ── F. 체인·팩 스크린샷 (1920 · 1366)
  for(const [W, H] of [[1920, 1080], [1366, 768]]){
    const p2 = await newPage({ width: W, height: H });
    await p2.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(200);
    await p2.evaluate(() => { window.tipChance = () => 0; setSeed(7); startRun(); ['seal','theme','gukbap'].forEach(id => gainRelic(id,'t')); run.cash += 3000;
      [['meme',600,4,false],['semi',1000,4,true],['gukbap',800,1,false]].forEach(([id,a,d,dia]) => { const p = openPosition(id,a,1,1,true); p.daysHeld = d; p.diamond = dia; });
      run.day = DAYS_PER_ROUND; startMarket(); assets.meme.price *= 1.25; assets.semi.price *= 1.06; assets.gukbap.price *= 0.9; endOfDay(); renderAll(); });
    await sleep(2000);   // 첫 행 도장 직후
    await p2.screenshot({ path: `${S}/j-chain-${W}.png` });
    await p2.keyboard.press('Space'); await sleep(200);
    await p2.evaluate(() => { run.phase = 'shop'; run.slush = 5000; openShop(); });
    await sleep(200);
    await p2.evaluate(() => { const orig = rollPack; buyPack('ruin'); });
    await sleep(620);
    await p2.screenshot({ path: `${S}/j-pack-${W}.png` });
    const pk = await p2.evaluate(() => ({ parts: Fx.particleCount }));
    ok(W + ' 팩 개봉 파티클', pk.parts > 0, pk);
    // 갭 (보유 종목)
    await p2.keyboard.press('Escape');
    await p2.evaluate(() => { hideOverlay(); switchTab('play'); window.tipChance = () => 0; startRun(); openPosition('sc', 800, 1, 1, true); startMarket(); renderAll();
      onGameEvent('gap', { stockId: 'sc', pct: 0.5 }); });
    await sleep(40);
    const gp = await p2.evaluate(() => ({ frozen: Fx.frozenFor() > 0, parts: Fx.particleCount }));   // 롱 + 상승 갭 = 중 단계
    await sleep(120);
    await p2.screenshot({ path: `${S}/j-gap-${W}.png` });
    const gp2 = await p2.evaluate(() => document.querySelector('.cabinet').className);
    ok(W + ' 보유 종목 유리한 갭(중 단계): 히트스톱 → 약한 흔들림 + 스파크', gp.frozen && gp.parts > 0 && /shake-1/.test(gp2), { gp, gp2 });
    await p2.close();
  }

  // ── G. 동작 줄이기(reduced-motion) 환경: 흔들림·글리치 기본 꺼짐, 파티클·소리는 유지
  const p3 = await newPage({ width: 1366, height: 768 }, { reduced: true });
  await p3.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(200);
  await p3.evaluate(spy);
  const rm = await p3.evaluate(async () => {
    window.tipChance = () => 0; startRun(); openPosition('meme', 600, 2, 1, true); startMarket(); renderAll();
    assets.meme.price *= 0.55; checkMarginCalls(); renderAll();
    await new Promise(r => setTimeout(r, 450));
    return { shake: settings.shake, cls: document.querySelector('.cabinet').className, flash: !!document.querySelector('.red-flash'),
             parts: Fx.particleCount, stamp: !!document.querySelector('.fx-stamp'), sfx: __sfx.map(x => x[0]), liq: run.liquidations };
  });
  ok('reduced-motion: 흔들림 기본 끔 → 흔들림·글리치·번쩍임 없음, 파편·도장·소리는 있음',
     rm.liq === 1 && rm.shake === false && !/shake|glitch/.test(rm.cls) && !rm.flash && rm.parts > 0 && rm.stamp && rm.sfx.includes('marginCall'), rm);
  await p3.close();

  results.forEach(r => console.log(r.join('  ')));
  console.log('FAIL', results.filter(r => r[0] === 'FAIL').length, '/', results.length, 'errors', errs);
  await b.close();
})();
