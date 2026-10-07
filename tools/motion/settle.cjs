// 정산·보상·암시장 모션(settle-motion) 필름스트립 + 스킵 = 끝까지 비교 + 암시장 스크롤 충돌 점검
//   node tools/motion/settle.cjs [--out shots] [--scenes a,b] [--url http://127.0.0.1:8765/demo.html] [--size 1920x1080] [--no-skip] [--no-scroll]
// ?motion=step으로 연다: 모션 시계(bmTween)는 window.motionStep(ms)으로만 흐르고, CSS·WAAPI 애니메이션도 같은 시계로 맞춘다.
// 장면마다 트리거 직후의 프레임을 찍어 한 장(격자)으로 붙인다 → <out>/motion-settle-<장면>.png
// 스킵 비교: 같은 장면을 (A) 끝까지 흘린 것 vs (B) 중간에 클릭(스킵)한 것 — 화면 요소 상태 요약과 픽셀이 같아야 한다 → <out>/motion-settle-skip.md
// 스크롤: 암시장에서 연출(구매 비행·잔액 카운트·새로고침)이 도는 중에 휠을 굴려도 연출이 끝까지 가고 결과가 같은지 → 같은 md
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('out') || 'shots';
const URL = (opt('url') || 'http://127.0.0.1:8765/demo.html') + '?crt=0&motion=step';
const [W, H] = (opt('size') || '1920x1080').split('x').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const range = (a, b, s) => { const xs = []; for(let t = a; t <= b; t += s) xs.push(t); return xs; };

// 1주차를 끝내 결산 체인까지 (win = 목표 달성)
const FINISH_WEEK = win => `
  window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); stageQueued = false; dealPending = false;
  openPosition('semi', 1500, 1, 1, true); openPosition('coin', 800, 2, -1, true);
  run.cash += ${win ? 2500 : -6000};
  for(let d = run.day; d <= DAYS_PER_ROUND && run.phase !== 'over' && run.phase !== 'shop'; d++){
    if(run.phase !== 'market') startMarket();
    while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); }
  }
  Fx.skipQueue(); renderAll();`;
const CHAIN = `await new Promise(r => { const t0 = performance.now(); (function w(){ if(chainHold || chainPlay || performance.now() - t0 > 6000) return r(); setTimeout(w, 50); })(); });
  if(chainPlay) skipSettlementChain();`;
const ACT = a => `document.querySelector('#overlayBox [data-act="${a}"]').click();`;
const FIN = `motionStep(8000); await new Promise(r => setTimeout(r, 60));`;
const TO_RESULT = `${FINISH_WEEK(true)} ${CHAIN} chainHold.readyAt = 0;`;              // 체인 결과에서 멈춤 (다음 = 결산 화면)
const TO_REWARD = `${TO_RESULT} chainNext(); ${FIN} ${ACT('toReward')} ${FIN}`;
const TO_SHOP = `${TO_REWARD} ${ACT('skip')} ${FIN} { const b = document.querySelector('#overlayBox [data-act="skipRelic"]'); if(b) b.click(); } ${FIN}
  Fx.skipQueue(); document.querySelectorAll('.toast').forEach(e => e.remove()); run.slush = Math.max(run.slush, 3000); renderShop(); ${FIN}`;
const FAKE_PACK = rarity => `(() => { const id = CARDS.find(c => c.rarity === '${rarity}' && !c.upgraded && c.type !== 'status').id; showPackResult({ packId: SHOP_PACKS[0].id, cardId: id, deckSize: run.masterDeck.length }); juicePack({ packId: SHOP_PACKS[0].id, cardId: id }); })()`;
// 장면: setup(장면 직전까지) · trigger(시각 0) · frames(ms) · skipAt(스킵 클릭 시각 — 없으면 스킵 비교 생략) · clip(선택자, 없으면 전체)
const SCENES = {
  'modal-in':  { setup: `window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); renderAll(); ${FIN}`, trigger: `showSignalGuide()`, frames: range(0, 300, 50), skipAt: 100 },
  'modal-out': { setup: `window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); renderAll(); showSignalGuide(); ${FIN}`, trigger: `hideOverlay()`, frames: range(0, 200, 40), skipAt: 60 },
  'settle':    { setup: TO_RESULT, trigger: `chainNext()`, frames: range(0, 3900, 300), skipAt: 900 },
  'fail':      { setup: `${FINISH_WEEK(false)} await new Promise(r => setTimeout(r, 1500));`, trigger: `hideOverlay(); motionStep(500); showRunOver(run.endCause || 'SLOW_BLEED')`, frames: range(0, 1800, 150), skipAt: 300 },
  'reward':    { setup: `${TO_RESULT} chainNext(); ${FIN}`, trigger: ACT('toReward'), frames: range(0, 1000, 100), skipAt: 400 },
  'reward-pick': { setup: TO_REWARD, trigger: `document.querySelector('#overlayBox .card[data-reward]').click()`, frames: range(0, 480, 80), skipAt: 120 },
  'deck':      { setup: `window.tipChance = () => 0; setSeed(31); startRun(); Fx.skipQueue(); renderAll(); ${FIN}`, trigger: `showDeck('draw')`, frames: range(0, 900, 100), skipAt: 200 },
  'wipe':      { setup: TO_SHOP, trigger: `document.getElementById('shopLeaveBtn').click()`, frames: range(0, 420, 60), skipAt: 120 },
  'shop-buy':  { setup: `${TO_SHOP} revealPaged('#shopBox [data-single]'); ${FIN}`, trigger: `document.querySelector('#shopBox [data-single]:not(:disabled)').click()`, frames: range(0, 700, 100), skipAt: 200 },
  'shop-deny': { setup: `${TO_SHOP} run.slush = 1; renderShop(); revealPaged('#shopBox [data-single]'); ${FIN}`, trigger: `document.querySelector('#shopBox [data-single]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))`, frames: range(0, 300, 60) },
  'reroll':    { setup: `${TO_SHOP} revealPaged('#shopBox [data-single]'); ${FIN}`, trigger: `document.querySelector('#shopBox [data-reroll="single"]').click()`, frames: range(0, 750, 75), skipAt: 150 },
  'pack-common':    { setup: TO_SHOP, trigger: FAKE_PACK('common'), frames: range(0, 1500, 150), skipAt: 150 },
  'pack-legendary': { setup: TO_SHOP, trigger: FAKE_PACK('legendary'), frames: range(0, 1950, 150), skipAt: 150 },
};

async function openPage(b){
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.setItem('hodl.settings', JSON.stringify({ sound: false, bgm: false })); } catch(e) {}
    let s = 4242; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
  });
  await p.goto(URL); await p.keyboard.press('Shift'); await sleep(300);
  await p.click('#startBtn'); await sleep(900);
  await p.mouse.move(W - 2, 2);
  p.errs = errs;
  return p;
}
const run = (p, js) => p.evaluate(js => (0, eval)('(async () => {' + js + '})()'), js);
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// 최종 상태 요약: 보이는 화면 요소마다 클래스·글자·표시·위치·변환 (파티클 캔버스·알림 제외)
const DIGEST = () => [...document.querySelectorAll('.screen.active *, #overlay, #overlay *, body > .fx-card-ghost, body > .sm-wipe')].filter(e => !e.closest('.toast,.fx-canvas')).map(e => {
  const cs = getComputedStyle(e), r = e.getBoundingClientRect(), own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
  return [e.id || e.tagName, typeof e.className === 'string' ? e.className.trim().split(/\s+/).join(' ') : '', own, cs.display, cs.visibility, cs.opacity, cs.transform, cs.translate, cs.scale, cs.rotate,
    Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join('|');
});
const CLEAN = () => { Fx.skipQueue(); document.querySelectorAll('.toast,.fx-chip').forEach(e => e.remove()); const c = document.querySelector('.fx-canvas'); if(c) c.style.visibility = 'hidden';
  document.getAnimations().forEach(a => { try { if(!Number.isFinite(a.effect.getComputedTiming().endTime)){ a.pause(); a.currentTime = 0; } } catch(e) {} }); };

const DRAIN = async p => {   // 모션 시계 밖(실시간 타이머)에서 늦게 시작한 연출(다음 날 드로우 등)까지: 비어 있는 상태가 세 번 이어질 때까지 흘린다
  for(let quiet = 0, k = 0; quiet < 3 && k < 40; k++){
    await p.evaluate(() => motionStep(3000)); await sleep(250);
    quiet = await p.evaluate(() => bmTweens.length === 0 && smLive.size === 0) ? quiet + 1 : 0;
  }
};
async function compose(b, name, shots, times){
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  const cols = Math.min(6, shots.length), fw = Math.round(W / 3.2), fh = Math.round(H / 3.2);
  const data = await p.evaluate(async ({ imgs, fw, fh, name, times, cols }) => {
    const gap = 8, top = 30, rows = Math.ceil(imgs.length / cols), c = document.createElement('canvas');
    c.width = cols * (fw + gap) + gap; c.height = top + rows * (fh + gap + 22);
    const x = c.getContext('2d'); x.fillStyle = '#0b0f1e'; x.fillRect(0, 0, c.width, c.height);
    x.font = '18px monospace'; x.fillStyle = '#e6ecff'; x.fillText(name, gap, 20);
    for(let i = 0; i < imgs.length; i++){
      const im = new Image(); im.src = 'data:image/png;base64,' + imgs[i]; await im.decode();
      const cx = gap + (i % cols) * (fw + gap), cy = top + Math.floor(i / cols) * (fh + gap + 22);
      x.fillStyle = '#ffd700'; x.fillText(times[i] + 'ms', cx, cy + 16);
      x.drawImage(im, cx, cy + 22, fw, fh);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs: shots.map(s => s.toString('base64')), fw, fh, name, times, cols });
  fs.writeFileSync(path.join(OUT, `motion-settle-${name}.png`), Buffer.from(data, 'base64'));
  await p.close();
}
async function filmstrip(b, name){
  const sc = SCENES[name], p = await openPage(b);
  await run(p, sc.setup);
  await run(p, `${sc.trigger}; motionStep(0);`);
  const shots = [];
  for(let i = 0; i < sc.frames.length; i++){
    if(i) await p.evaluate(ms => motionStep(ms), sc.frames[i] - sc.frames[i - 1]);
    await frame(p);
    shots.push(await p.screenshot());
  }
  await compose(b, name, shots, sc.frames);
  const errs = p.errs.slice();
  await p.close();
  return errs;
}
// 스킵 비교: A = 끝까지, B = skipAt에서 클릭(빈 곳 = body) 후 끝까지
async function skipCheck(b, name){
  const sc = SCENES[name], out = {};
  for(const mode of ['full', 'skip']){
    const p = await openPage(b);
    await run(p, sc.setup);
    await run(p, `${sc.trigger}; motionStep(0);`);
    if(mode === 'skip'){
      await p.evaluate(ms => motionStep(ms), sc.skipAt);
      out.live = await p.evaluate(() => ({ live: smLive.size, block: smBlocking(), btn: !document.getElementById('fxSkipBtn').hidden }));
      await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      out.after = await p.evaluate(() => smLive.size);
    }
    await p.evaluate(CLEAN); await DRAIN(p);   // 큐를 비우면 다음 날 드로우 같은 연출이 시작될 수 있으니 → 비운 뒤 다시 흘린다
    await p.evaluate(CLEAN); await frame(p);
    out[mode] = { digest: await p.evaluate(DIGEST), png: await p.screenshot(), errs: p.errs.slice() };
    await p.close();
  }
  const A = out.full.digest, B = out.skip.digest;
  const diff = A.length !== B.length ? -1 : A.filter((x, i) => x !== B[i]).length;
  const ex = A.length === B.length ? A.map((x, i) => x !== B[i] ? x + '  ⟂  ' + B[i] : null).filter(Boolean).slice(0, 2) : [];
  const px = await pixelDiff(b, out.full.png, out.skip.png);
  if(args.includes('--dump')){ fs.writeFileSync(path.join(OUT, `skip-${name}-full.png`), out.full.png); fs.writeFileSync(path.join(OUT, `skip-${name}-skip.png`), out.skip.png); }
  return { name, liveAtSkip: out.live, liveAfter: out.after, stateDiff: diff, px, ex, errs: out.full.errs.concat(out.skip.errs) };
}
async function pixelDiff(b, x, y){
  const p = await b.newPage();
  const n = await p.evaluate(async ({ a, c }) => {
    const load = async s => { const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const [A, B] = await Promise.all([load(a), load(c)]); let n = 0;
    for(let k = 0; k < A.length; k += 4) if(A[k] !== B[k] || A[k + 1] !== B[k + 1] || A[k + 2] !== B[k + 2]) n++;
    return n;
  }, { a: x.toString('base64'), c: y.toString('base64') });
  await p.close();
  return n;
}
// 암시장 스크롤: 연출 도중 휠 → 스크롤 위치 변화·연출이 끝나는지·최종 상태가 휠 없는 것과 같은지
async function scrollCheck(b){
  const res = [];
  for(const [label, trig] of [['구매 비행·잔액 카운트', SCENES['shop-buy'].trigger], ['새로고침 슬라이드', SCENES.reroll.trigger]]){
    const out = {};
    for(const mode of ['still', 'wheel']){
      const p = await openPage(b);
      await run(p, `${TO_SHOP} revealPaged('#shopBox [data-single]'); ${FIN}`);
      const scr = await p.evaluate(() => { const s = document.getElementById('screen-shop'), cs = getComputedStyle(s);
        return { overflowY: cs.overflowY, scrollable: s.scrollHeight > s.clientHeight + 1, pages: (document.querySelector('#screen-shop .pg-bar .pg-n') || {}).textContent || '1/1' }; });
      await run(p, `${trig}; motionStep(0);`);
      let moved = null;
      if(mode === 'wheel'){
        await p.mouse.move(W / 2, H / 2);
        const before = await p.evaluate(() => [document.getElementById('screen-shop').scrollTop, document.scrollingElement.scrollTop]);
        for(let k = 0; k < 4; k++){ await p.mouse.wheel(0, 400); await p.evaluate(() => motionStep(60)); }
        moved = { before, after: await p.evaluate(() => [document.getElementById('screen-shop').scrollTop, document.scrollingElement.scrollTop]), liveDuring: await p.evaluate(() => smLive.size) };
      }
      await p.mouse.move(W - 2, 2);   // 휠 때문에 화면 가운데에 둔 마우스를 치운다 (호버 기울기는 비교에서 뺀다)
      await p.evaluate(CLEAN); await DRAIN(p);
      await p.evaluate(CLEAN); await frame(p);
      out[mode] = { scr, moved, live: await p.evaluate(() => smLive.size), ghosts: await p.evaluate(() => document.querySelectorAll('body > .fx-card-ghost').length),
        digest: await p.evaluate(DIGEST), errs: p.errs.slice() };
      await p.close();
    }
    const A = out.still.digest, B = out.wheel.digest;
    if(A.length === B.length) console.log(label, A.map((x, i) => x !== B[i] ? x + '  ⟂  ' + B[i] : null).filter(Boolean).slice(0, 3));
    res.push({ label, scr: out.still.scr, wheel: out.wheel.moved, liveEnd: [out.still.live, out.wheel.live], ghosts: [out.still.ghosts, out.wheel.ghosts],
      stateDiff: A.length !== B.length ? -1 : A.filter((x, i) => x !== B[i]).length, errs: out.still.errs.concat(out.wheel.errs) });
  }
  return res;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--disable-threaded-animation'] });
  const names = opt('scenes') ? opt('scenes').split(',') : Object.keys(SCENES);
  const errs = [];
  for(const n of names){ errs.push(...(await filmstrip(b, n)).map(e => n + ': ' + e)); console.log('strip', n); }
  const md = ['# 정산·보상·암시장 모션 — 스킵 = 끝까지 · 암시장 스크롤', '', `?motion=step · ${W}×${H} · ?crt=0. A = 끝까지 흘림, B = 중간(skipAt)에 빈 곳 클릭(스킵) 뒤 끝까지. 상태 = 화면 요소마다 [클래스·글자·표시·투명도·변환·위치·크기]가 다른 요소 수 (파티클 캔버스·알림 제외), 픽셀 = 다른 픽셀 수.`, ''];
  if(!args.includes('--no-skip')){
    md.push('| 장면 | 스킵 시점 진행 중(막는 연출·스킵 버튼) | 스킵 뒤 남은 연출 | 상태 차이 | 픽셀 차이 |', '|---|---|---:|---:|---:|');
    for(const n of names){
      if(SCENES[n].skipAt === undefined) continue;
      const r = await skipCheck(b, n);
      errs.push(...r.errs.map(e => n + ' skip: ' + e));
      md.push(`| ${n} | ${r.liveAtSkip ? `${r.liveAtSkip.live}개 (${r.liveAtSkip.block ? '막음' : '안 막음'}${r.liveAtSkip.btn ? '·▶' : ''})` : '-'} | ${r.liveAfter} | ${r.stateDiff} | ${r.px} |`);
      if(r.ex.length) console.log(n, r.ex);
      console.log('skip', n, r.stateDiff, r.px);
    }
  }
  if(!args.includes('--no-scroll')){
    const sc = await scrollCheck(b);
    md.push('', '## 암시장: 연출 도중 휠 스크롤', '', '| 연출 | 화면 overflow-y · 스크롤 가능 · 쪽 | 휠 전→후 scrollTop (화면, 문서) · 그때 진행 중 연출 | 끝난 뒤 남은 연출 (휠 없음/있음) | 남은 유령 카드 | 최종 상태 차이 (휠 없음 vs 있음) |', '|---|---|---|---|---|---:|');
    sc.forEach(r => { errs.push(...r.errs); md.push(`| ${r.label} | ${r.scr.overflowY} · ${r.scr.scrollable ? '예' : '아니오'} · ${r.scr.pages} | ${JSON.stringify(r.wheel.before)} → ${JSON.stringify(r.wheel.after)} · ${r.wheel.liveDuring}개 | ${r.liveEnd.join(' / ')} | ${r.ghosts.join(' / ')} | ${r.stateDiff} |`); });
  }
  fs.writeFileSync(path.join(OUT, 'motion-settle-skip.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
