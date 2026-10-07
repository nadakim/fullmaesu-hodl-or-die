// 전투 화면 모션(battle-motion) 필름스트립 + 모션 강도별 최종 화면 비교
//   node tools/motion/battle.cjs [--out shots] [--scenes a,b] [--url http://127.0.0.1:8765/demo.html] [--no-intensity] [--size 1280x800]
// ?motion=step으로 연다: 전투 화면 모션의 JS 시간(bmTween)은 모션 시계로만 흐르고(window.motionStep(ms)),
// CSS 애니메이션·트랜지션·WAAPI는 발견 즉시 멈춘 뒤 같은 시계로 currentTime을 맞춘다 (docs/demo 'battle-motion').
// 장면마다 트리거 직후 0·100·200·300·400ms 프레임을 찍어 한 장으로 붙인다 → <out>/motion-battle-<장면>.png
// 강도 비교: 모션 강도 0%·70%·100%에서 같은 조작 순서를 끝까지 돌린 화면(체크포인트마다)을 픽셀 비교 → <out>/motion-battle-intensity.md
// 시장은 게임 루프가 아니라 스크립트가 tick()을 직접 부른다 (window.tick을 막아 둠). UI 난수(Math.random)는 시드 고정.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('out') || 'shots';
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0&motion=step';
const FRAMES = [0, 100, 200, 300, 400];
const [W, H] = (opt('size') || '1920x1080').split('x').map(Number);   // --size 1280x800 = 스팀 덱
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 공통 준비: 장전, 손패 5장, (pos 수만큼) 포지션. 화면 위 알림·연출 큐는 비운다
const SETUP = (pos, phase, lev1) => `
  setSeed(31); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
  document.querySelectorAll('.toast,.fx-chip,.bm-float,.bm-row-ghost,.fx-card-ghost').forEach(e => e.remove());
  const P = [['semi', 1500, 3, 1], ['meme', 600, 2, 1], ['coin', 900, 2, -1], ['bio', 700, 1, 1], ['game', 500, 1, 1]];
  P.slice(0, ${pos}).forEach(x => openPosition(x[0], x[1], ${lev1 ? 1 : 'x[2]'}, x[3], true));
  run.hand = ['stk_semi', 'credit', 'stk_coin', 'stopLoss', 'stk_meme'].map(newCard); handSig = ''; posSig = '';
  ${phase === 'market' ? "startMarket(); Fx.skipQueue(); for(let i = 0; i < 3; i++) realTick();" : ''}
  renderAll(); motionStep(3000); document.querySelectorAll('.toast').forEach(e => e.remove());`;
const R = sel => `(document.querySelector('${sel}') || document.body).getBoundingClientRect()`;
// 장면: setup(문자열 JS) · trigger(시각 0에 실행) · clip(찍을 영역: 요소 선택자 목록 → 합친 사각형) · mouse(트리거 전 마우스 조작)
const SCENES = {
  'hover-card':  { setup: SETUP(0), clip: ['#handBox', '#pileDeck', '#pileDiscard'], mouse: 'hoverCard' },
  'press-btn':   { setup: SETUP(0), clip: ['#openBtn'], mouse: 'pressOpen' },
  'press-card':  { setup: SETUP(0), clip: ['#handBox'], mouse: 'pressCard' },
  'deny-card':   { setup: SETUP(1, 'market'), clip: ['#handBox', '#bmNote'], trigger: `document.querySelector('#handBox .card.disabled').click()` },
  'deny-btn':    { setup: SETUP(1, 'market'), clip: ['#openBtn', '#bmNote', '#handBox'], mouse: 'pressOpenDisabled' },
  'count-pop':   { setup: SETUP(1), clip: ['.balance-main', '#holdPanel'], trigger: `assets.semi.price *= 1.25; renderAll()` },
  'count-cash':  { setup: SETUP(0), clip: ['#infoCol'], trigger: `playCardFx(0, null, { amount: 2000 })` },
  'pnl-float':   { setup: SETUP(3, 'market'), clip: ['#holdPanel'], trigger: `realTick(); renderAll()` },
  'pnl-float-sum': { setup: SETUP(5, 'market'), clip: ['#holdPanel'], trigger: `realTick(); renderAll()` },
  'draw':        { setup: SETUP(0), clip: ['#handBox', '#pileDeck', '#pileDiscard'], trigger: `handSig = ''; dealPending = true; renderHand()` },
  'play':        { setup: SETUP(0), clip: ['body'], trigger: `playCardFx(0, null, { amount: 1000 })` },
  'discard':     { setup: SETUP(0), clip: ['#handBox', '#pileDeck', '#pileDiscard'], trigger: `run.discard.push(...run.hand.splice(2)); renderAll()` },
  'candle':      { setup: SETUP(1, 'market'), clip: ['#chartPair'], trigger: `realTick(); renderAll()` },
  'quote-blink': { setup: SETUP(1, 'market'), clip: ['#stockList'],
                   trigger: `realTick(); STOCKS.slice(0, 9).forEach((s, i) => { if(!bossHalt(s.id)) assets[s.id].price *= 1 + (i % 2 ? -1 : 1) * 0.015 * (i + 1); }); renderAll()` },
  'row-in':      { setup: SETUP(2), clip: ['#holdPanel'], trigger: `openPosition('bio', 700, 1, 1, true); renderAll()` },
  'row-out':     { setup: SETUP(3), clip: ['#holdPanel'], trigger: `sellPosition(run.positions[1].id); renderAll()` },
  'row-flash':   { setup: SETUP(2), clip: ['#holdPanel'], trigger: `assets.semi.price *= 1.06; renderAll()` },
};

async function openPage(b, motion){
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(m => {
    try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.setItem('hodl.settings', JSON.stringify({ sound: false, bgm: false, motion: m })); } catch(e) {}
    let s = 12345; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
  }, motion);
  await p.goto(URL); await p.keyboard.press('Shift'); await sleep(300);
  await p.click('#startBtn'); await sleep(1200);
  await p.evaluate(() => {
    window.realTick = tick; window.tick = () => {};   // 게임 루프는 멈추고 스크립트만 tick
    window.tipChance = () => 0; Fx.skipQueue();
  });
  p.errs = errs;
  return p;
}
const clipOf = (p, sels) => p.evaluate(sels => {
  const rs = sels.map(s => document.querySelector(s)).filter(e => e && e.getClientRects().length).map(e => e.getBoundingClientRect());
  const pad = 12, x0 = Math.max(0, Math.min(...rs.map(r => r.left)) - pad), y0 = Math.max(0, Math.min(...rs.map(r => r.top)) - pad);
  const x1 = Math.min(innerWidth, Math.max(...rs.map(r => r.right)) + pad), y1 = Math.min(innerHeight, Math.max(...rs.map(r => r.bottom)) + pad);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}, sels);
async function mouseAction(p, kind){
  const vis = async sel => {   // 부채꼴에서 겹치지 않은 쪽(왼쪽 위)
    const b = await p.locator(sel).first().boundingBox(); return { x: b.x + Math.min(30, b.width / 4), y: b.y + Math.min(60, b.height / 4) };
  };
  if(kind === 'hoverCard'){ const c = await vis('#handBox .card[data-idx="0"]'); await p.mouse.move(c.x, c.y); }
  if(kind === 'pressOpen' || kind === 'pressOpenDisabled'){ const b = await p.locator('#openBtn').boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.evaluate(() => motionStep(500)); await p.mouse.down(); }
  if(kind === 'pressCard'){ const c = await vis('#handBox .card[data-idx="0"]'); await p.mouse.move(c.x, c.y); await p.evaluate(() => motionStep(500)); await p.mouse.down(); }
}
// 프레임 붙이기: 같은 페이지에서 canvas로 (외부 도구 없이)
async function compose(b, name, shots, clip){
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  const scale = Math.min(1, 900 / clip.width), fw = Math.round(clip.width * scale), fh = Math.round(clip.height * scale);
  const data = await p.evaluate(async ({ imgs, fw, fh, name, times }) => {
    const gap = 8, top = 34, c = document.createElement('canvas');
    c.width = imgs.length * (fw + gap) + gap; c.height = fh + top + gap;
    const x = c.getContext('2d'); x.fillStyle = '#0b0f1e'; x.fillRect(0, 0, c.width, c.height);
    x.font = '20px monospace'; x.fillStyle = '#e6ecff'; x.fillText(name, gap, 22);
    for(let i = 0; i < imgs.length; i++){
      const im = new Image(); im.src = 'data:image/png;base64,' + imgs[i]; await im.decode();
      x.imageSmoothingEnabled = true; x.drawImage(im, gap + i * (fw + gap), top, fw, fh);
      x.fillStyle = '#ffd700'; x.fillText(times[i] + 'ms', gap + i * (fw + gap) + fw - 80, 22);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs: shots.map(s => s.toString('base64')), fw, fh, name, times: FRAMES });
  fs.writeFileSync(path.join(OUT, `motion-battle-${name}.png`), Buffer.from(data, 'base64'));
  await p.close();
}

async function filmstrips(b, only){
  const names = Object.keys(SCENES).filter(n => !only || only.includes(n)), errs = [];
  for(const name of names){
    const sc = SCENES[name], p = await openPage(b, 100);
    await p.mouse.move(W - 2, 2);
    await p.evaluate(sc.setup);
    const clip = await clipOf(p, sc.clip.filter(s => s !== '#bmNote'));
    if(sc.mouse) await mouseAction(p, sc.mouse);
    await p.evaluate(t => { if(t) (0, eval)(t); motionStep(0); }, sc.trigger || '');
    const noteClip = sc.clip.includes('#bmNote') ? await clipOf(p, sc.clip) : null;
    const shots = [];
    for(let i = 0; i < FRAMES.length; i++){
      if(i) await p.evaluate(ms => motionStep(ms), FRAMES[i] - FRAMES[i - 1]);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      shots.push(await p.screenshot({ clip: noteClip || clip }));
    }
    if(sc.mouse === 'pressOpen' || sc.mouse === 'pressCard' || sc.mouse === 'pressOpenDisabled'){ await p.mouse.move(W - 2, 2); await p.mouse.up(); }
    await compose(b, name, shots, noteClip || clip);
    errs.push(...p.errs.map(e => name + ': ' + e));
    console.log('strip', name);
    await p.close();
  }
  return errs;
}

// 강도 비교: 같은 조작을 0%·70%·100%로 → 체크포인트마다 모션 시계를 충분히 흘린 뒤(3초) 찍어 비교
const STEPS = [
  ['buy', `playCardFx(0, null, { amount: 1500 })`],
  ['buy2', `const i = run.hand.findIndex(c => CARD_BY_ID[c.id].stock); if(i >= 0) playCardFx(i, null, { amount: 800 })`],
  ['open', `startMarket(); Fx.skipQueue()`],
  ['ticks', `for(let i = 0; i < 4; i++){ realTick(); renderAll(); }`],
  ['deny', `const c = document.querySelector('#handBox .card.disabled'); if(c) c.click()`],
  ['bigmove', `assets.semi.price *= 1.2; renderAll()`],
  ['sell', `if(run.positions.length) sellPosition(run.positions[0].id); renderAll()`],
  ['ticks2', `for(let i = 0; i < 3; i++){ realTick(); renderAll(); }`],
];
async function intensity(b){
  const res = {}, errs = [];
  for(const m of [0, 70, 100]){
    const p = await openPage(b, m);
    await p.mouse.move(W - 2, 2);
    await p.evaluate(SETUP(1, '', true));   // 1배 — 반대매매 위험 맥동(기존 연출, 실시간 심장 박동)이 끼지 않게
    res[m] = [];
    for(const [name, js] of STEPS){
      await p.evaluate(js => { (0, eval)(js); motionStep(0); }, js);
      await p.evaluate(() => motionStep(3000));
      await sleep(3500);   // 모션 시계 밖(Fx 토스트·파티클 캔버스·카드 비행 뒷정리 — 실시간)도 끝나게
      // 뉴스 전광판은 기존 규칙상 모션 끔이면 줄바꿈·켜면 흐름(M1 이전부터) — 비교에서 빼려고 짧은 한 줄로 고정
      await p.evaluate(() => { Fx.skipQueue(); document.querySelectorAll('.toast,.fx-chip').forEach(e => e.remove()); $('newsText').textContent = '뉴스 (비교용 고정)'; fitNews(); motionStep(3000);
        // 게임 루프가 멈춰 있으니 마지막 상태로 한 번 다시 그리고(캔버스 크기), 무한 반복 연출(위험 맥동·숨쉬기 등 — 모션 강도에 따라 속도가 달라 위상이 다르다)은 0에 고정
        renderAll(); document.getAnimations().forEach(a => { try { if(!Number.isFinite(a.effect.getComputedTiming().endTime)){ a.pause(); a.currentTime = 0; } } catch(e) {} }); });
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const png = await p.screenshot();
      fs.writeFileSync(path.join(OUT, 'battle-motion', 'intensity', `m${m}-${name}.png`), png);
      // 상태 요약: 전투 화면 요소마다 클래스·글자·계산된 위치/크기/투명도 (픽셀이 아니라 '최종 상태'가 같은지)
      const digest = await p.evaluate(() => [...document.querySelectorAll('#screen-play *, body > .bm-float, body > .bm-row-ghost, body > .fx-card-ghost, #bmNote')].map(e => {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect(), own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
        return [e.id || e.tagName, e.className && e.className.baseVal === undefined ? e.className : '', own, e.hidden, cs.display, cs.visibility, cs.opacity, cs.transform, cs.translate, cs.scale,
          Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join('|');
      }));
      res[m].push({ name, png, digest, motion: await p.evaluate(() => [bmK(), isMotionReduced()]) });
    }
    errs.push(...p.errs.map(e => 'm' + m + ': ' + e));
    await p.close();
  }
  // 픽셀 비교 (브라우저 canvas로)
  const cmp = await b.newPage();
  const rows = [];
  for(let i = 0; i < STEPS.length; i++){
    const r = await cmp.evaluate(async ({ a, b2, c }) => {
      const load = async s => { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
      const [A, B, C] = await Promise.all([load(a), load(b2), load(c)]);
      const diff = (X, Y) => { let n = 0; for(let k = 0; k < X.length; k += 4) if(X[k] !== Y[k] || X[k + 1] !== Y[k + 1] || X[k + 2] !== Y[k + 2]) n++; return n; };
      return [diff(A, C), diff(B, C)];
    }, { a: res[0][i].png.toString('base64'), b2: res[70][i].png.toString('base64'), c: res[100][i].png.toString('base64') });
    const dd = (X, Y) => X.length !== Y.length ? 'len ' + X.length + '≠' + Y.length : X.filter((x, k) => x !== Y[k]).length;
    const ex = (X, Y) => X.map((x, k) => x !== Y[k] ? x + '  ⟂  ' + Y[k] : null).filter(Boolean).slice(0, 3);
    if(args.includes('--verbose')) console.log(STEPS[i][0], ex(res[0][i].digest, res[100][i].digest), ex(res[70][i].digest, res[100][i].digest));
    rows.push([STEPS[i][0], r[0], r[1], dd(res[0][i].digest, res[100][i].digest), dd(res[70][i].digest, res[100][i].digest)]);
  }
  await cmp.close();
  const md = ['# 전투 화면 모션 — 모션 강도별 최종 화면 비교', '',
    `조작 순서마다 모션 시계를 3초 흘린 뒤 1920×1080 전체를 찍어 100%와 픽셀 비교 (다른 픽셀 수). 0%는 모션 끔(isMotionReduced → body.no-motion, bmK 0) = ${JSON.stringify(res[0][0].motion)}.`, '',
    '상태 = 전투 화면 요소마다 [id/태그·클래스·글자·hidden·display·visibility·opacity·transform·translate·scale·위치·크기]가 다른 요소 수 (body의 no-motion 클래스는 제외).', '',
    '| 체크포인트 | 픽셀 0% vs 100% | 픽셀 70% vs 100% | 상태 0% vs 100% | 상태 70% vs 100% |', '|---|---:|---:|---:|---:|', ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`)];
  fs.writeFileSync(path.join(OUT, 'motion-battle-intensity.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  return errs;
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'battle-motion', 'intensity'), { recursive: true });
  const b = await chromium.launch({ args: ['--disable-threaded-animation'] });
  const only = opt('scenes') ? opt('scenes').split(',') : null;
  const errs = await filmstrips(b, only);
  if(!args.includes('--no-intensity')) errs.push(...await intensity(b));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
