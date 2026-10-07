// (토스트는 개수 상한 TOAST_MAX로 밀려나는 게 원래 동작이라 끊김에서 뺀다)
// 장중 속도 1×·2×·4×에서 연출을 몰아 쏘고: 동시 진행 연출 최대 수(쌓임 정책 상한), 끊김(애니메이션 도중 요소 제거 — 쌓임 정책의 당겨 끝냄 제외),
// 남은 것(조용해진 뒤 연출 요소·클래스가 남아 있는지)을 잰다.   node tools/motion/stress.cjs [--url …] [--motion 0~100]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0';
const MOTION = opt('motion') === null ? 100 : +opt('motion');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const rows = [];
  for(const speed of [1, 2, 4]){
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.evaluate(() => localStorage.setItem('hodl.unlockWeek', '8'));
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(600);
    const r = await p.evaluate(async ({ speed, motion }) => {
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      settings.sound = false; settings.speed = speed; if('motion' in settings) settings.motion = motion; applySettings();
      window.tipChance = () => 0; setSeed(77); startRun(); Fx.skipQueue();
      ['meme', 'coin', 'semi', 'sc'].forEach((id, i) => openPosition(id, 800, 1 + (i % 3), 1, true));
      renderAll();
      // 끊김 감지: 끝이 있는 애니메이션이 아직 도는 요소를 떼면 기록 (쌓임 정책으로 당겨 끝낼 때·토스트 개수 상한은 따로)
      const cuts = {}, rm = Element.prototype.remove;
      Element.prototype.remove = function(){
        if(!(Fx.ffing) && !this.classList.contains('toast') && this.getAnimations && this.isConnected){
          const running = this.getAnimations().some(a => { const t = a.effect && a.effect.getComputedTiming(); return a.playState === 'running' && t && Number.isFinite(t.endTime) && t.progress !== null && t.progress < 1; });
          if(running){ const k = this.className.split(' ')[0] || this.tagName; cuts[k] = (cuts[k] || 0) + 1; }
        }
        return rm.call(this);
      };
      startMarket(); renderAll();
      let maxLive = 0, ticks = 0;
      const ids = ['meme', 'coin', 'semi', 'sc'], eq = netEquity();
      const burst = () => {   // 한 틱에 몰리는 연출 (실제 API)
        const id = ids[ticks % 4], row = document.querySelector(`#quoteBox [data-q="${id}"]`);
        onGameEvent('gap', { stockId: id, pct: ticks % 2 ? 0.3 : -0.25 });
        toast('스트레스 알림 ' + ticks, ticks % 2 ? 'good' : 'bad');
        Fx.chip('+₩' + ticks, row ? row.getBoundingClientRect() : null, 'good', 120);
        Fx.stamp('TEST ' + ticks, 'gold', 'sm');
        Fx.shake(1 + ticks % 3); if(ticks % 3 === 0) Fx.glitch();
        document.querySelectorAll('#quoteBox .quote-row').forEach((q, k) => { if(k % 3 === ticks % 3) Fx.flash(q, 'fx-hit'); });
        if(ticks % 4 === 0){ const pos = run.positions[0]; if(pos) enqueueLiquidation({ pos, pnl: -100 }); }
      };
      const t0 = performance.now(), iv = setInterval(() => { if(ticks < 14){ burst(); ticks++; } }, TICK_MS / speed);
      while(performance.now() - t0 < 14 * TICK_MS / speed + 300){ maxLive = Math.max(maxLive, Fx.liveCount || 0); await sleep(16); }
      clearInterval(iv);
      window.tick = () => {};   // 조용해짐을 재기 위해 시장을 멈춘다 (새 캔들이 신고가·로켓 같은 새 연출을 만들지 않게)
      // 조용해질 때까지 (큐·진행 중 연출 0, 최대 12초)
      const t1 = performance.now();
      while((Fx.queueLength || Fx.liveCount || 0) && performance.now() - t1 < 12000){ maxLive = Math.max(maxLive, Fx.liveCount || 0); await sleep(50); }
      await sleep(900);   // 흔들림 클래스 최소 창(700ms)·마지막 정리
      const left = {};
      ['.toast', '.fx-stamp', '.fx-chip', '.fx-scan', '.red-flash', '.fx-combo', '.popnum', '.fx-lost', '.gap-alert', '.fx-card-ghost', '.fx-hit', '.cabinet.shake-1', '.cabinet.shake-2', '.cabinet.shake-3', '.cabinet.fx-glitch', '.countdown']
        .forEach(sel => { const n = document.querySelectorAll(sel).length; if(n) left[sel] = n; });
      Element.prototype.remove = rm;
      return { maxLive, ff: Fx.ffCount || 0, cuts, left, live: Fx.liveCount, q: Fx.queueLength, scale: Fx.motionScale, ticks };
    }, { speed, motion: MOTION });
    rows.push({ speed, ...r, errs });
    console.log(JSON.stringify({ speed, ...r, errs }));
    await p.close();
  }
  await b.close();
})();
