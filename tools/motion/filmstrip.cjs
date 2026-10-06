// 연출 필름스트립: 기존 연출을 시간별 프레임으로 찍는다 (모션 정리 전/후 픽셀 비교용).
//   node tools/motion/filmstrip.cjs <출력 폴더> [--scenes a,b] [--speed 1|2|4] [--motion 0~100] [--url http://127.0.0.1:8765/demo.html]
// 시간 고정:
//   - JS(setTimeout·rAF·performance.now·Date)는 Playwright 가짜 시계(page.clock) — STEP_MS씩 runFor로만 흐른다.
//   - CSS 애니메이션·트랜지션·WAAPI(el.animate)는 document.getAnimations()로 발견 즉시 pause → 매 스텝 currentTime = (가짜 시각 − 발견 시각).
//   - UI 연출 난수(Math.random)는 시드 고정 PRNG로 바꿔 둔다 (파티클·슬롯 숫자·밈 문구가 매번 같게). 엔진은 setSeed.
// 한계: 히트스톱의 CSS 일시정지(body.fx-hitstop → animation-play-state)는 pause()가 덮어써서 반영되지 않는다 (전/후 같은 조건).
//   [--shake 0|1] [--prm 1] — 모션 끔 상태 확인용
// 결과: <폴더>/<장면>/<장면>-t0000.png … + <폴더>/<장면>-strip.png (한 장 요약) + <폴더>/frames.json
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const OUT = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0';
const SPEED = +(opt('speed') || 1), MOTION = opt('motion') === null ? null : +opt('motion');
const SHAKE = opt('shake') === null ? null : opt('shake') === '1', PRM = opt('prm') === '1';   // --shake 0 = 설정 '화면 흔들림' 끔 · --prm 1 = 시스템 동작 줄이기(prefers-reduced-motion) 흉내
const STEP_MS = 10;
const SETTLE_MS = 60;
const T0 = Date.parse('2026-01-05T09:00:00Z');
const W = 1920, H = 1080;
if(!OUT){ console.error('usage: filmstrip.cjs <out> [--scenes a,b]'); process.exit(1); }

// 가짜 정산 기록 (엔진 값 아님 — 연출 재생만): ×2 → ×10 → ×100 → ×1,000 → ×10,000 (stagejuice 테스트와 같은 데이터)
const FAKE_STAGE = () => {
  const base = 1000; let m = 1;
  const steps = [{ label: '오늘 손익', kind: 'base', value: base, runningChips: base, runningMult: 1, source: 'base' }];
  [2, 5, 10, 10, 10].forEach((v, i) => { m *= v; steps.push({ label: '테스트 ' + i, kind: 'xmult', value: v, runningChips: base, runningMult: m, source: 'test' + i }); });
  const payout = base * m - base;
  return { round: run.round, day: 1, payout, settlement: [{ posId: 0, posName: '테스트 종목', assetId: 'test', dir: 1, lev: 1, base, steps, chips: base, mult: m, payout, sources: [] }] };
};
const FAKE_PLAIN = () => ({ round: run.round, day: 1, payout: 0, settlement: [
  { posId: 0, posName: '테스트 A', assetId: 'a', dir: 1, lev: 1, base: 320, steps: [{ label: '오늘 손익', kind: 'base', value: 320, runningChips: 320, runningMult: 1, source: 'base' }], chips: 320, mult: 1, payout: 0, sources: [] },
  { posId: 1, posName: '테스트 B', assetId: 'b', dir: -1, lev: 2, base: -110, steps: [{ label: '오늘 손익', kind: 'base', value: -110, runningChips: -110, runningMult: 1, source: 'base' }], chips: -110, mult: 1, payout: 0, sources: [] }] });
const FAKE_CHAIN = () => [
  { posId: 0, posName: '테스트 A', dir: 1, lev: 1, finalPnl: 3600, steps: [
    { label: '이번 주 손익', kind: 'base', value: 1000, runningTotal: 1000 },
    { label: '국밥 정신', kind: 'add', value: 200, runningTotal: 1200 },
    { label: '존버의 인장', kind: 'mult', value: 3, runningTotal: 3600 }] },
  { posId: 1, posName: '테스트 B', dir: -1, lev: 2, finalPnl: -400, steps: [{ label: '이번 주 손익', kind: 'base', value: -400, runningTotal: -400 }] },
  { posId: 2, posName: '테스트 C', dir: 1, lev: 3, finalPnl: 900, steps: [
    { label: '이번 주 손익', kind: 'base', value: 600, runningTotal: 600 },
    { label: '테마주 헌터', kind: 'mult', value: 1.5, runningTotal: 900 }] }];

const range = (a, b, s) => { const xs = []; for(let t = a; t <= b; t += s) xs.push(t); return xs; };
// 장면: setup(페이지 준비, 시계 0 전) · trigger(시각 0에 실행) · frames(찍을 시각 ms)
const SCENES = {
  stage:      { frames: range(0, 7200, 400), trigger: `Fx.skipQueue(); playDayStage((${FAKE_STAGE})())` },
  plainstage: { frames: range(0, 1500, 100), trigger: `Fx.skipQueue(); playPlainStage((${FAKE_PLAIN})())` },
  chain:      { frames: range(0, 4800, 300), trigger: `Fx.skipQueue(); playSettlementChain((${FAKE_CHAIN})(), () => {})` },
  queue:      { frames: range(0, 4200, 150), setup: `openPosition('meme', 600, 3, 1, true); renderAll();`,
                trigger: `enqueueGap('meme', -0.18); const p = run.positions[0]; enqueueLiquidation({ pos: p, pnl: -500 }); enqueueGap('semi', 0.12);` },
  toast:      { frames: range(0, 2800, 200), trigger: `toast('테스트 알림 하나', 'good'); setTimeout(() => toast('두 번째 알림', 'bad'), 400);` },
  shake1:     { frames: range(0, 320, 40), trigger: `Fx.shake(1)` },
  shake2:     { frames: range(0, 480, 40), trigger: `Fx.shake(2)` },
  shake3:     { frames: range(0, 640, 40), trigger: `Fx.shake(3)` },
  glitch:     { frames: range(0, 440, 40), trigger: `Fx.glitch()` },
  shake2glitch: { frames: range(0, 480, 40), trigger: `Fx.shake(2); Fx.glitch()` },
  shake3glitch: { frames: range(0, 640, 40), trigger: `Fx.shake(3); Fx.glitch()` },
  // 오버레이 상자: 정산 무대를 열고 무대 시간을 멈춘 뒤(hold) 흔들림만
  ovshake:    { frames: range(0, 640, 40), setup: `Fx.skipQueue(); playDayStage((${FAKE_STAGE})()); stage.hold = true; cancelAnimationFrame(stage.raf);`, trigger: `Fx.shake(3)` },
  ovpreshake: { frames: range(0, 280, 20), setup: `Fx.skipQueue(); playDayStage((${FAKE_STAGE})()); stage.hold = true; cancelAnimationFrame(stage.raf);`, trigger: `preShake(1)` },
  ovrage:     { frames: range(0, 1800, 150), setup: `Fx.skipQueue(); playDayStage((${FAKE_STAGE})()); stage.hold = true; cancelAnimationFrame(stage.raf);`, trigger: `stageHeroSet(1000)` },
  ovcombo:    { frames: range(0, 640, 40), setup: `Fx.skipQueue(); playDayStage((${FAKE_STAGE})()); stage.hold = true; cancelAnimationFrame(stage.raf); stageHeroSet(1000);`, trigger: `preShake(1); Fx.shake(2)` },
  modal:      { frames: range(0, 400, 50), trigger: `showRoundResult(Object.assign({}, run.lastWeek || {}, { round: 1, eq: 12000, target: 11000, pct: 1.09, weekPnl: 2000, weekReturn: 0.2, boss: null, nextBoss: null, realized: 0, liquidations: 0, interest: 0, unrealized: 0, settled: 0, carried: 0, bailout: 0, slushEarned: 0 }))` }
};
const pick = (opt('scenes') || Object.keys(SCENES).join(',')).split(',');

const INIT = `(() => {
  let s = 0x2F6E2B1;   // mulberry32 — UI 연출 난수 고정 (트리거 직전에 다시 심는다: 그 전의 실시간 구간 호출 수와 무관하게)
  window.__reseed = () => { s = 0x2F6E2B1; };
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {}
  const born = new Map();
  window.__freeze = async () => {   // 발견 즉시 멈추고(pause는 보류 상태라 ready를 기다린다), 가짜 시각 기준으로 currentTime을 맞춘다
    const now = performance.now(), fresh = [];
    for(const a of document.getAnimations()){
      if(!born.has(a)){ born.set(a, now); a.pause(); fresh.push(a); }
      else if(a.playState === 'running') a.pause();
    }
    if(fresh.length) await Promise.all(fresh.map(a => a.ready.catch(() => {})));
    for(const a of document.getAnimations()){
      if(!born.has(a)) continue;
      const want = now - born.get(a);
      if(a.currentTime !== want) a.currentTime = want;
    }
  };
})();`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 합성 스레드 애니메이션을 끄고 메인 스레드에서만 그린다 — 멈춘 애니메이션의 currentTime이 스크린샷에 바로 반영되게
  const b = await chromium.launch({ args: ['--disable-threaded-animation', '--disable-threaded-scrolling'] });
  const index = {};
  const errs = [], unstable = [];
  for(const name of pick){
    const sc = SCENES[name];
    if(!sc){ console.error('unknown scene', name); continue; }
    const page = await b.newPage({ viewport: { width: W, height: H }, reducedMotion: PRM ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    await page.clock.install({ time: T0 });
    await page.clock.pauseAt(T0 + 1000);   // 페이지를 열기 전부터 시간은 runFor로만 흐른다 (실시간 흐름 없음 → 가짜 rAF 16ms 격자 위상도 판마다 같다)
    await page.addInitScript(INIT);
    await page.goto(URL);
    await page.evaluate(() => document.fonts.ready);
    // performance.now 원점(탐색 시작)은 판마다 몇 ms씩 다르다 → 가짜 Date에 묶고, rAF 시각도 같은 값으로 (무대 가상 시간이 판마다 같게)
    await page.evaluate(() => {
      const base = Date.now();
      performance.now = () => Date.now() - base;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
    });
    await page.keyboard.press('Shift');
    await page.clock.runFor(2000);
    await page.click('#startBtn');
    await page.clock.runFor(1500);
    await page.evaluate(({ speed, motion, shake }) => {
      if(shake !== null) settings.shake = shake;
      window.tipChance = () => 0;
      settings.speed = speed;
      settings.sound = false;   // 소리·BGM 끔: 화면엔 영향 없고, 오디오 시계(실시간)에 묶인 Math.random 호출을 없앤다
      if(motion !== null && 'motion' in settings) settings.motion = motion;
      applySettings();
      setSeed(4242); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
      run.hand = ['stk_semi', 'credit', 'stk_coin', 'stopLoss', 'stk_meme'].filter(id => CARD_BY_ID[id]).map(newCard); handSig = ''; renderAll();
    }, { speed: SPEED, motion: MOTION, shake: SHAKE });
    await page.mouse.move(W - 1, Math.round(H / 2));   // 호버 상태가 프레임마다 섞이지 않게 마우스를 오른쪽 테두리로
    await page.clock.runFor(3000);   // 드로우·초기 연출 정리
    if(sc.setup) await page.evaluate(sc.setup);
    await page.clock.runFor(1000);
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '*{caret-color:transparent !important;}'; document.head.appendChild(st); });
    await page.evaluate(async () => { await window.__freeze(); window.__reseed(); });
    await page.evaluate(sc.trigger);
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    let t = 0;
    const files = [];
    for(const ft of sc.frames){
      while(t < ft){ await page.clock.runFor(STEP_MS); t += STEP_MS; await page.evaluate(() => window.__freeze()); }
      await page.evaluate(() => window.__freeze());
      if(process.env.FS_DEBUG) console.log(name, ft, await page.evaluate(() => JSON.stringify({ vt: stage ? stage.vt.toFixed(2) + '/' + stage.idx : null, dn: Date.now() % 100000, cab: document.querySelector('.cabinet').className, pn: performance.now(), fz: Math.round(Fx.frozenFor()), q: Fx.queueLength })));
      const f = path.join(dir, `${name}-t${String(ft).padStart(4, '0')}.png`);
      await page.evaluate(() => { document.getAnimations().forEach(a => a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming()); return document.body.getBoundingClientRect().width; });
      await new Promise(r => setTimeout(r, SETTLE_MS));   // 실시간으로 잠깐: 멈춘 애니메이션의 새 currentTime이 합성 스레드까지 반영되게 (가짜 시계는 멈춰 있다)
      // 같은 프레임을 두 번 연속 똑같이 찍힐 때까지 다시 찍는다 (합성 스레드에 지난 프레임이 남아 있는 경우를 거른다)
      let shot = await page.screenshot(), tries = 0;
      for(;;){ const again = await page.screenshot(); if(again.equals(shot) || ++tries >= 6) { shot = again; break; } shot = again; }
      if(tries) unstable.push(name + '@' + ft + (tries >= 6 ? '!' : ''));
      fs.writeFileSync(f, shot);
      files.push({ t: ft, file: path.relative(OUT, f) });
    }
    index[name] = files;
    await page.close();
    // 한 장 요약 (프레임을 5열 격자로 축소)
    const sp = await b.newPage({ viewport: { width: 5 * 384 + 60, height: 300 } });
    const imgs = files.map(x => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, x.file)).toString('base64'));
    await sp.setContent(`<body style="margin:0;background:#111;color:#ddd;font:14px monospace;padding:10px">
      <div>${name}${SPEED !== 1 ? ' · speed ' + SPEED : ''}${MOTION !== null ? ' · motion ' + MOTION : ''}${SHAKE !== null ? ' · shake ' + (SHAKE ? 1 : 0) : ''}${PRM ? ' · reduced-motion' : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(5,384px);gap:10px">${files.map((x, i) => `<figure style="margin:0"><img src="${imgs[i]}" width="384" height="216" style="display:block"><figcaption>${x.t}ms</figcaption></figure>`).join('')}</div></body>`);
    await sp.waitForTimeout(100);
    await sp.screenshot({ path: path.join(OUT, `${name}-strip.png`), fullPage: true });
    await sp.close();
    console.log(name, files.length, 'frames');
  }
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ speed: SPEED, motion: MOTION, shake: SHAKE, prm: PRM, step: STEP_MS, viewport: [W, H], scenes: index }, null, 1));
  console.log('retaken', JSON.stringify(unstable));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
