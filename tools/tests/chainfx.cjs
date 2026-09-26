const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const ok = (n, c, i) => R.push([c ? 'PASS' : 'FAIL', n, i === undefined ? '' : (typeof i === 'string' ? i : JSON.stringify(i))]);
// 시드를 바꿔 가며 실제 tick()으로 원하는 틱을 찾는다 (UI 연출은 그대로 쌓이게 두고, 찾으면 그 틱에서 멈춤)
const FIND = `(want) => {
  const orig = onGameEvent;
  for(let seed = 1; seed < 3000; seed++){
    Fx.skipQueue(); window.tipChance = () => 0; setSeed(seed); startRun(); run.cash += 20000;
    ['meme', 'sc'].forEach(id => openPosition(id, 1500, 3, 1, true));
    startMarket(); renderAll(); Fx.skipQueue();
    while(run.phase === 'market'){
      const before = eventLog.length;
      tick();
      const ev = eventLog.slice(before).map(e => e.type);
      if(ev.includes('gap') && (want === 'gap+liq' ? ev.indexOf('marginCall') > ev.indexOf('gap') : true)){
        const g = eventLog.slice(before).find(e => e.type === 'gap').data;
        const heldAdverse = run.positions.concat([]).some(p => p.assetId === g.stockId && p.dir * g.pct < 0) || ev.includes('marginCall');
        if(want !== 'strong' || heldAdverse){ renderAll(); return { seed, ev, gap: g, q: Fx.queueLength }; }
      }
      if(ev.includes('gap') || ev.includes('marginCall')) Fx.skipQueue();
      if(run.phase === 'over') break;
    }
  }
  return null;
}`;
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  for(const [W, H] of [[1920, 1080], [1366, 768], [390, 844]]){
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(W + ': ' + e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
    await page.reload(); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(200);
    await page.evaluate(() => { window.__sfx = []; const o = Sound.play; Sound.play = (n, op) => { __sfx.push([n, op && op.pitch ? Math.round(12 * Math.log2(op.pitch)) : 0, Math.round(performance.now())]); return o(n, op); }; });

    // 1) 강 단계 갭 (3x 밈·초전도체 보유 + 불리한 갭)
    const st = await page.evaluate(`(${FIND})('strong')`);
    await sleep(600);
    const a1 = await page.evaluate(() => { const el = document.querySelector('.gap-alert'); return el && { cls: el.className, name: el.querySelector('.ga-name').textContent,
      meme: el.querySelector('.ga-meme').textContent, warn: !!el.querySelector('.ga-warn'), tape: el.querySelector('.ga-tape').textContent,
      busy: Fx.queueBusy, blocker: document.querySelector('.fx-blocker').classList.contains('on'),
      blink: !!document.querySelector('.fx-blink-up, .fx-blink-down'), box: (r => [r.left, r.right, r.width])(el.querySelector('.ga-box').getBoundingClientRect()) }; });
    await sleep(350);
    await page.screenshot({ path: `${S}/gap-strong-${W}.png` });
    const tick0 = await page.evaluate(() => run.tickInDay);
    ok(W + ' 강 갭 경보 (t3 · 테이프 · 밈 · 시장 정지 · 차단막 · 행 깜빡임)', st && a1 && /t3/.test(a1.cls) && a1.busy && a1.blocker && a1.blink && /GAP/.test(a1.tape), { seed: st && st.seed, ev: st && st.ev, a1 });
    ok(W + ' 경보가 화면 안 (가로 넘침 없음)', a1 && a1.box[0] >= 0 && a1.box[1] <= W, a1 && a1.box);
    // 스킵 (스페이스) → 큐 비움 · 시장 재개
    await page.keyboard.press('Space'); await sleep(100);
    const sk = await page.evaluate(() => ({ q: Fx.queueLength, busy: Fx.queueBusy, alert: !!document.querySelector('.gap-alert'), blink: !!document.querySelector('.fx-blink-up, .fx-blink-down') }));
    await sleep(2000);
    const tick1 = await page.evaluate(() => run.phase === 'market' ? run.tickInDay : 99);
    ok(W + ' 스페이스 스킵 → 큐 즉시 비움, 경보·깜빡임 제거, 시장 재개', sk.q === 0 && !sk.busy && !sk.alert && !sk.blink && tick1 > tick0, { sk, tick0, tick1 });

    if(W === 1920){
      // 2) 갭 → 반대매매 같은 틱: CHAIN ×2
      const gl = await page.evaluate(`(${FIND})('gap+liq')`);
      await sleep(80);
      const kinds = await page.evaluate(() => Fx.pending().map(i => i.kind));
      let chainTxt = '', t0 = Date.now();
      while(Date.now() - t0 < 5000){ chainTxt = await page.evaluate(() => { const c = document.querySelector('.fx-chainctr'); return c.classList.contains('on') ? c.textContent : ''; }); if(chainTxt) break; await sleep(50); }
      await sleep(250);
      await page.screenshot({ path: `${S}/gap-chain2-${W}.png` });
      const stampTxt = await page.evaluate(() => (document.querySelector('.fx-stamp') || {}).textContent);
      ok('갭 → 반대매매 같은 틱: 큐에 순서대로, CHAIN ×2', gl && chainTxt === 'CHAIN ×2', { seed: gl && gl.seed, ev: gl && gl.ev, pending: kinds, chainTxt, stampTxt });
      await sleep(1600);
      const trauma = await page.evaluate(() => [...document.querySelectorAll('.fx-chip')].map(e => e.textContent));
      await page.keyboard.press('Space'); await sleep(200);
      const liqSfx = await page.evaluate(() => __sfx.filter(x => x[0] === 'marginCall' || x[0] === 'gapAlarm' || x[0] === 'gapDown' || x[0] === 'gapUp').slice(-4));
      ok('반대매매 소리는 체인 피치 +1반음 (갭 다음)', liqSfx.some(x => x[0] === 'marginCall' && x[1] >= 1), liqSfx);

      // 3) 유물 조명: 장 마감에 캐피탈·존버의 인장·테마주 헌터 → 하나씩 순서대로
      const rel = await page.evaluate(async () => {
        Fx.skipQueue(); window.tipChance = () => 0; setSeed(3); startRun(); ['capital', 'seal', 'theme'].forEach(id => gainRelic(id, 't')); run.cash += 5000;
        const p = openPosition('meme', 600, 2, 1, true); p.daysHeld = 4;
        startMarket(); assets.meme.price *= 1.3; renderAll();
        const flashes = []; const of = Fx.flash; Fx.flash = (el, cls) => { if(cls === 'fx-relic-on') flashes.push([el.dataset.relic, Math.round(performance.now())]); return of(el, cls); };
        await new Promise(r => setTimeout(r, 900)); Fx.skipQueue();
        flashes.length = 0;
        endOfDay(); renderAll();
        const q = Fx.pending().map(i => i.payload.id).filter(Boolean);
        while(Fx.queueLength) await new Promise(r => setTimeout(r, 50));
        Fx.flash = of;
        return { q, flashes };
      });
      const gaps = rel.flashes.slice(1).map((f, i) => f[1] - rel.flashes[i][1]);
      ok('유물 3개가 장 마감에 하나씩 차례로 조명 (간격 ≥ 0.4초)', rel.flashes.length === 3 && gaps.every(g => g >= 400), rel);
      await page.evaluate(() => { Fx.skipQueue(); });

      // 4) 약 경보 묶기 (미보유 갭 두 건 같은 틱) + 시장 안 멈춤
      const weak = await page.evaluate(() => { Fx.skipQueue(); startRun(); startMarket(); renderAll(); Fx.skipQueue();
        onGameEvent('gap', { stockId: 'meme', pct: 0.6 }); onGameEvent('gap', { stockId: 'coin', pct: -0.4 });
        return { n: Fx.queueLength, busy: Fx.queueBusy }; });
      await sleep(250);
      const weakName = await page.evaluate(() => (document.querySelector('.gap-alert.t1 .ga-name') || {}).textContent);
      ok('미보유 갭 2건 → 약 경보 하나로 묶임, 시장 안 멈춤', weak.n === 1 && !weak.busy && /밈코인/.test(weakName) && /대장코인/.test(weakName), { weak, weakName });
      await sleep(1000);

      // 5) 연쇄 속도 '최소': 약 경보로 통일 · 간격 0.1초
      const mn = await page.evaluate(async () => { settings.fxSpeed = 'min'; applySettings(); Fx.skipQueue(); startRun(); openPosition('meme', 600, 3, 1, true); startMarket(); renderAll(); Fx.skipQueue();
        const t0 = performance.now(); onGameEvent('gap', { stockId: 'meme', pct: -0.5 }); const tier = Fx.pending().length ? null : 0; await new Promise(r => setTimeout(r, 30));
        const cls = (document.querySelector('.gap-alert') || {}).className; const busy = Fx.queueBusy;
        ['capital', 'seal'].forEach(id => onGameEvent('relicTriggered', { id, amount: 10 }));
        while(Fx.queueLength) await new Promise(r => setTimeout(r, 20));
        const ms = Math.round(performance.now() - t0); settings.fxSpeed = 'normal'; applySettings(); return { cls, busy, ms }; });
      ok("속도 '최소': 강 갭도 약 경보(시장 안 멈춤), 경보+유물 2개가 1.6초 안에 끝", /t1/.test(mn.cls) && !mn.busy && mn.ms < 1600, mn);

      // 6) 장중 콤보 ×5 → 끊김
      const sk5 = await page.evaluate(() => { Fx.skipQueue(); startRun(); openPosition('semi', 1000, 1, 1, true); startMarket(); renderAll(); updateCombo();
        const out = []; for(let k = 0; k < 6; k++){ assets.semi.price *= 1.01; updateCombo(); out.push($('fxStreak').textContent); }
        const before = $('fxStreak').className; assets.semi.price *= 0.97; updateCombo(); const broke = $('fxStreak').className;
        for(let k = 0; k < 4; k++){ assets.semi.price *= 0.99; updateCombo(); }
        return { out, before, broke, down: $('fxStreak').textContent, vig: $('fxVignette').style.opacity }; });
      ok('상승 콤보 ×5 (금색) → 끊기면 부서짐 → 하락 콤보 ×5 + 가장자리 어두워짐', /×6/.test(sk5.out[5]) && /u2/.test(sk5.before) && /broken/.test(sk5.broke) && /하락 콤보 ×5/.test(sk5.down) && +sk5.vig > 0, sk5);
      await page.screenshot({ path: `${S}/streak-${W}.png` });

      // 7) 풀매수: 종목마다 buy 효과음이 순서대로 반음씩
      const fb = await page.evaluate(async () => { Fx.skipQueue(); startRun(); run.cash += 9000; run.hand = ['fullBuy', 'stk_semi', 'stk_coin', 'stk_sc'].map(newCard); run.ap = 3; handSig = ''; renderAll();
        __sfx.length = 0; playCardFx(0, null); await new Promise(r => setTimeout(r, 500)); return __sfx.filter(x => x[0] === 'buy').map(x => [x[1], x[2]]); });
      ok('풀매수 3종목 → buy 효과음 3번, 반음씩 상승 · 순차', fb.length === 3 && fb[1][0] === 1 && fb[2][0] === 2 && fb[2][1] - fb[0][1] >= 180, fb);

      // 8) 카드 연쇄: 2장째 잔상, 3장째 COMBO
      const cc = await page.evaluate(async () => { Fx.skipQueue(); startRun(); run.cash += 9000; run.hand = ['stk_semi', 'stk_gukbap', 'stk_coin'].map(newCard); run.ap = 3; handSig = ''; renderAll();
        const res = []; for(let k = 0; k < 3; k++){ playCardFx(0, null); await new Promise(r => setTimeout(r, 70)); res.push(document.querySelectorAll('.fx-afterimage').length); }
        return { after: res, combo: [...document.querySelectorAll('.fx-chip')].map(e => e.textContent) }; });
      ok('카드 연쇄: 1장째 잔상 0, 2장째부터 잔상, 3장째 COMBO ×3', cc.after[0] === 0 && cc.after[1] > 0 && cc.combo.includes('COMBO ×3'), cc);

      // 9) 마일스톤: 2배 달성 (tier 3)
      const ms2 = await page.evaluate(async () => { Fx.skipQueue(); startRun(); renderAll(); run.cash += START_CASH; renderAll(); await new Promise(r => setTimeout(r, 20));
        const kinds = Fx.pending().map(i => i.kind); const stamps = []; const t0 = performance.now();
        while(Fx.queueLength && performance.now() - t0 < 4000){ const s = (document.querySelector('.fx-stamp') || {}).textContent; if(s && !stamps.includes(s)) stamps.push(s); await new Promise(r => setTimeout(r, 40)); }
        return { kinds, stamps }; });
      ok('순자산 2배 → 목표 돌파(tier 3) → 2배 달성(tier 3) 순서대로 도장', ms2.stamps.join() === '목표 돌파!,2배 달성', ms2);
      await page.evaluate(() => Fx.skipQueue());
    }
    await page.close();
  }
  R.forEach(r => console.log(r.join('  ')));
  console.log('FAIL', R.filter(r => r[0] === 'FAIL').length, '/', R.length, 'errors', errs);
  await b.close();
})();
