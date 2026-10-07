// 전투 화면 스크린샷 5종 해상도 (UI 리디자인 규칙 8): node tools/motion/battle-shots.cjs <폴더> [--url …]
// 같은 시드·같은 손패·포지션 3개로 장중 몇 틱 진행 → 애니메이션을 모두 멈춘 뒤 찍는다 (전/후 비교용)
// --settle: 찍기 전에 시장(tick)을 멈추고 1.5초 기다린다 — 전투 화면 모션의 JS 연출까지 끝난 최종 화면 (전/후를 같은 조건으로)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), OUT = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0';
const RES = [[1920, 1080], [1280, 720], [1280, 800], [2560, 1080], [3840, 2160]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const errs = [];
  for(const [W, H] of RES){
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(W + 'x' + H + ': ' + e.message));
    await p.addInitScript(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.goto(URL); await p.keyboard.press('Shift'); await sleep(300);
    await p.click('#startBtn'); await sleep(900);
    await p.evaluate(() => {
      window.tipChance = () => 0; settings.sound = false; applySettings();
      setSeed(31); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
      openPosition('semi', 1500, 1, 1, true); openPosition('meme', 600, 3, 1, true); openPosition('coin', 900, 2, -1, true);
      run.hand = ['stk_semi', 'credit', 'stk_coin', 'stopLoss', 'stk_meme'].map(newCard); handSig = ''; posSig = '';
      startMarket(); for(let i = 0; i < 6; i++) tick(); Fx.skipQueue(); renderAll();
    });
    await sleep(1500);
    if(args.includes('--settle')){ await p.evaluate(() => { window.tick = () => {}; }); await sleep(1500); }   // 시장을 멈추고 진행 중인 JS 연출(카운트·부유 텍스트)까지 끝난 화면
    await p.mouse.move(W - 2, Math.round(H / 2));
    await p.evaluate(() => { Fx.skipQueue(); document.getAnimations().forEach(a => { try { const t = a.effect.getComputedTiming(); if(Number.isFinite(t.endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } } catch(e) {} }); });
    await sleep(200);
    await p.screenshot({ path: path.join(OUT, `battle-${W}x${H}.png`) });
    await p.close();
  }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
