// 모션 끔 상태의 '최종 화면' 비교용 스냅샷: 화면마다 상태를 만들고 실시간으로 잠깐 기다린 뒤,
// 끝이 있는 애니메이션은 finish()(최종 상태), 무한 반복은 0초에서 멈춰 찍는다 (전/후 같은 조건).
//   node tools/motion/screens.cjs <출력 폴더> [--url …] [--shake 0|1] [--prm 1] [--motion 0~100] [--speed 1|2|4]
// 결과: diff.cjs가 읽는 frames.json (장면마다 t=0 한 장)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), OUT = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0';
const SHAKE = opt('shake') === null ? null : opt('shake') === '1', PRM = opt('prm') === '1';
const MOTION = opt('motion') === null ? null : +opt('motion'), SPEED = +(opt('speed') || 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE_STAGE = `(() => { const base = 1000; let m = 1; const steps = [{ label: '오늘 손익', kind: 'base', value: base, runningChips: base, runningMult: 1, source: 'base' }];
  [2, 5, 10, 10, 10].forEach((v, i) => { m *= v; steps.push({ label: '테스트 ' + i, kind: 'xmult', value: v, runningChips: base, runningMult: m, source: 'test' + i }); });
  return { round: run.round, day: 1, payout: base * m - base, settlement: [{ posId: 0, posName: '테스트 종목', assetId: 'test', dir: 1, lev: 1, base, steps, chips: base, mult: m, payout: base * m - base, sources: [] }] }; })()`;
const FAKE_CHAIN = `[{ posId: 0, posName: '테스트 A', dir: 1, lev: 1, finalPnl: 3600, steps: [{ label: '이번 주 손익', kind: 'base', value: 1000, runningTotal: 1000 }, { label: '국밥 정신', kind: 'add', value: 200, runningTotal: 1200 }, { label: '존버의 인장', kind: 'mult', value: 3, runningTotal: 3600 }] },
  { posId: 1, posName: '테스트 B', dir: -1, lev: 2, finalPnl: -400, steps: [{ label: '이번 주 손익', kind: 'base', value: -400, runningTotal: -400 }] }]`;
// 화면: [이름, 준비 코드(문자열), 기다림 ms]
const SCREENS = [
  ['title', `switchTab('title')`, 2500],
  ['play-premarket', ``, 1500],
  ['play-danger', `openPosition('meme', 3000, 3, 1, true); openPosition('semi', 2000, 1, 1, true); assets.meme.price *= 0.78; posSig = ''; renderAll();`, 1500],
  ['play-boost', `gainRelic('antFlag', 't'); openPosition('coin', 1000, 1, 1, true); run.hand = ['stk_coin', 'stk_semi', 'credit', 'stk_meme', 'stopLoss'].map(newCard); handSig = ''; renderAll();`, 1500],
  ['combo-c5', `for(let i = 0; i < 13; i++) comboHit('test');`, 1200],
  ['stage-result', `Fx.skipQueue(); playDayStage(${FAKE_STAGE}); stageSkip(); stageSkip();`, 1200],
  ['chain-result', `Fx.skipQueue(); playSettlementChain(${FAKE_CHAIN}, () => {}); skipSettlementChain();`, 1200],
  ['reward', `Fx.skipQueue(); hideOverlay(); run.reward = rollRewardChoices ? rollRewardChoices() : run.reward; showReward(run.reward || {});`, 1200],
  ['shop', `Fx.skipQueue(); hideOverlay(); run.slush = 999; openShop(); switchTab('shop'); renderAll();`, 2500],
  ['pack-open', `Fx.skipQueue(); hideOverlay(); run.slush = 999; openShop(); switchTab('shop'); renderAll(); buyPack(SHOP_PACKS[0].id); renderAll();`, 3500],
  ['settings', `hideOverlay(); switchTab('settings'); buildSettings();`, 1200],
  ['records', `switchTab('records');`, 1200],
  ['collection', `switchTab('collection');`, 1200]
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--disable-threaded-animation', '--disable-threaded-scrolling'] });
  const index = {}, errs = [];
  for(const [name, setup, wait] of SCREENS){
    const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: PRM ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    await page.addInitScript(`(() => { let s = 0x2F6E2B1; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} })();`);
    await page.goto(URL);
    await page.evaluate(() => document.fonts.ready);
    await page.keyboard.press('Shift'); await sleep(300);
    await page.click('#startBtn'); await sleep(700);
    await page.mouse.move(1919, 540);
    await page.evaluate(({ speed, motion, shake }) => {
      window.tipChance = () => 0;
      if(shake !== null) settings.shake = shake;
      settings.speed = speed; settings.sound = false;
      if(motion !== null && 'motion' in settings) settings.motion = motion;
      applySettings();
      setSeed(4242); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
      run.hand = ['stk_semi', 'credit', 'stk_coin', 'stopLoss', 'stk_meme'].map(newCard); handSig = ''; renderAll();
    }, { speed: SPEED, motion: MOTION, shake: SHAKE });
    await sleep(1500);
    try { await page.evaluate(setup); } catch(e) { errs.push(name + ' setup: ' + e.message); }
    await sleep(wait);
    await page.evaluate(() => { for(const a of document.getAnimations()){ const t = a.effect && a.effect.getComputedTiming(); if(t && Number.isFinite(t.endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } } });
    await sleep(80);
    const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, name + '-t0000.png');
    await page.screenshot({ path: f });
    index[name] = [{ t: 0, file: path.relative(OUT, f) }];
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ shake: SHAKE, prm: PRM, motion: MOTION, speed: SPEED, scenes: index }, null, 1));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
