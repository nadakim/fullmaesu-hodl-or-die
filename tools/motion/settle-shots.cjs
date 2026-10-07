// 정산·보상·암시장·덱 확인·게임오버 화면 5해상도 스크린샷 (UI 리디자인 규칙 8 — 전/후 비교용)
//   node tools/motion/settle-shots.cjs <폴더> [--url http://127.0.0.1:8765/demo.html] [--states result,reward,…]
// 같은 시드로 1주차를 끝내고(목표 달성 = result·reward·relic·shop / 미달 = over) 덱 확인(deck)을 연다.
// 연출이 끝난 최종 화면: 모션 시계·CSS 애니메이션을 끝까지 보낸 뒤 찍는다 (?motion=step이 있으면 motionStep, 없으면 실시간 대기 + finish)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), OUT = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0' + (args.includes('--step') ? '&motion=step' : '');
const RES = (opt('res') || '1920x1080,1280x720,1280x800,2560x1080,3840x2160').split(',').map(r => r.split('x').map(Number));
const STATES = (opt('states') || 'result,over,reward,relic,shop,deck').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1주차 결산까지: win이면 현금을 넉넉히(목표 달성), 아니면 크게 줄여(미달) 장을 끝까지 돌린다
const FINISH_WEEK = win => `
  window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
  openPosition('semi', 1500, 1, 1, true); openPosition('coin', 800, 2, -1, true);
  run.cash += ${win ? 2500 : -6000};
  for(let d = run.day; d <= DAYS_PER_ROUND && run.phase !== 'over' && run.phase !== 'shop'; d++){
    if(run.phase !== 'market') startMarket();
    while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); }
    if(stage){ stageSkip(); stageSkip(); stage.readyAt = 0; stageNext(); }
    if(run.phase === 'premarket' && run.day <= DAYS_PER_ROUND) continue;
  }
  Fx.skipQueue(); renderAll();`;
// 결산 화면까지는 실제 흐름 그대로: 결산 체인을 건너뛰고 '▶ 다음' → 결과 → [data-act] 버튼들
const WAIT_CHAIN = `await new Promise(r => { const t0 = performance.now(); (function w(){ if(chainHold || chainPlay || performance.now() - t0 > 6000) return r(); setTimeout(w, 50); })(); });
  if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); }`;
const ACT = a => `{ const b = document.querySelector('#overlayBox [data-act="${a}"]'); if(b) b.click(); }`;
const WAIT = ms => `await new Promise(r => typeof motionStep === 'function' ? (motionStep(${ms}), setTimeout(r, 50)) : setTimeout(r, ${ms}));`;
const TO = {
  result: `${FINISH_WEEK(true)} ${WAIT_CHAIN}`,
  over:   `${FINISH_WEEK(false)}`,
  reward: `${FINISH_WEEK(true)} ${WAIT_CHAIN} ${WAIT(4000)} ${ACT('toReward')}`,
  relic:  `${FINISH_WEEK(true)} ${WAIT_CHAIN} ${WAIT(4000)} ${ACT('toReward')} ${WAIT(1500)} ${ACT('skip')}`,
  shop:   `${FINISH_WEEK(true)} ${WAIT_CHAIN} ${WAIT(4000)} ${ACT('toReward')} ${WAIT(1500)} ${ACT('skip')} ${WAIT(1500)} ${ACT('skipRelic')}`,
  deck:   `window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false; renderAll(); showDeck('draw');`,
};
async function settle(p){
  if(URL.includes('motion=step')) await p.evaluate(() => motionStep(8000));
  else await sleep(4500);
  await p.evaluate(() => { Fx.skipQueue(); if(typeof skipPackAnim === 'function') skipPackAnim();
    document.querySelectorAll('.toast').forEach(e => e.remove());
    document.getAnimations().forEach(a => { try { const t = a.effect.getComputedTiming(); if(Number.isFinite(t.endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } } catch(e) {} }); });
  await sleep(300);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--disable-threaded-animation'] }); const errs = [];
  for(const [W, H] of RES) for(const st of STATES){
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(`${W}x${H} ${st}: ${e.message}`));
    await p.addInitScript(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.setItem('hodl.settings', JSON.stringify({ sound: false, bgm: false })); } catch(e) {}
      let s = 777; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; }; });
    await p.goto(URL); await p.keyboard.press('Shift'); await sleep(300);
    await p.click('#startBtn'); await sleep(900);
    await p.mouse.move(W - 2, 2);
    await p.evaluate(js => (0, eval)('(async () => {' + js + '})()'), TO[st]);
    await settle(p);
    await p.screenshot({ path: path.join(OUT, `${st}-${W}x${H}.png`) });
    await p.close();
  }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
