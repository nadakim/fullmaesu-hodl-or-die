// juice-stage: 정산 무대 주인공 배수(.stage-hero) · 티어별 불꽃 · Fx.shake가 정산 상자도 흔듦 · 스킵 · 동작 줄이기/흔들림 끔
// 스크린샷: stagejuice-<폭>-x2/x10/x100/x1000.png (주인공 배수가 ×2·×10·×100·×1,000일 때 무대를 멈춰 찍는다)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TARGETS = [['×2', 'x2', 0], ['×10', 'x10', 1], ['×100', 'x100', 2], ['×1,000', 'x1000', 3]];
async function open(b, W, H, extra) {
  const p = await b.newPage({ viewport: { width: W, height: H }, ...(extra || {}) });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html');
  await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
  await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(460);
  await p.evaluate(() => { window.tipChance = () => 0; });
  return p;
}
const errs = [];
// 가짜 정산 기록 (엔진 값 아님 — 연출만 확인): ×2 → ×10 → ×100 → ×1,000 → ×10,000
const FAKE = () => {
  const base = 1000; let m = 1;
  const steps = [{ label: '오늘 손익', kind: 'base', value: base, runningChips: base, runningMult: 1, source: 'base' }];
  [2, 5, 10, 10, 10].forEach((v, i) => { m *= v; steps.push({ label: '테스트 ' + i, kind: 'xmult', value: v, runningChips: base, runningMult: m, source: 'test' + i }); });
  const payout = base * m - base;
  return { round: run.round, day: 1, payout, settlement: [{ posId: 0, posName: '테스트 종목', assetId: 'test', dir: 1, lev: 1, base, steps, chips: base, mult: m, payout, sources: [] }] };
};
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[1920, 1080], [1366, 768]]) {
    const p = await open(b, W, H);
    await p.evaluate(`(() => { window.__shakeSeen = new Set(); new MutationObserver(() => { const bx = document.getElementById('overlayBox'); [1, 2, 3].forEach(n => { if(bx.classList.contains('ov-shake-' + n)) window.__shakeSeen.add(n); }); }).observe(document.getElementById('overlayBox'), { attributes: true, attributeFilter: ['class'] }); window.__fake = ${FAKE.toString()}; })()`);
    await p.evaluate(() => { window.__snd = []; const o = Sound.play; Sound.play = (n, op) => { window.__snd.push(n); return o.call(Sound, n, op); }; });
    await p.evaluate(() => { Fx.skipQueue(); playDayStage(window.__fake()); });
    ok(W + ' 무대 열림 · 주인공 요소 · stage-live', await p.evaluate(() => !!stage && !!$('stageHero') && $('overlayBox').classList.contains('stage-live') && $('stageHeroV').textContent === '×1'));
    ok(W + ' 불꽃 막대 7개', await p.evaluate(() => document.querySelectorAll('#stageHero .sh-flame i').length === 7));
    const seenTier = [];
    for (const [txt, tag, tier] of TARGETS) {
      await p.evaluate(() => { stage.speed = 1; });
      await p.waitForFunction(t => $('stageHeroV') && $('stageHeroV').textContent === t, txt, { timeout: 15000, polling: 'raf' });
      await p.evaluate(() => { stage.speed = 0; });   // 이 시점에서 무대 시간을 멈춘다 (CSS 애니메이션은 계속)
      await sleep(260);
      const info = await p.evaluate(() => { const h = $('stageHero'), n = $('stageHeroV'), fl = h.querySelector('.sh-flame'), cs = getComputedStyle(n), r = $('overlayBox').getBoundingClientRect();
        return { cls: h.className, fs: parseFloat(cs.fontSize), u: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1, fh: fl.getBoundingClientRect().height, sx: $('overlayBox').scrollWidth - $('overlayBox').clientWidth, mult: $('stageMult0').textContent, box: [r.left, r.right] }; });
      const ex = await p.evaluate(() => { const ov = $('overlay'), bx = $('overlayBox'), cs = getComputedStyle(bx, '::before'), bs = getComputedStyle(ov, '::before');
        return { rage: bx.classList.contains('stage-rage') && !ov.classList.contains('stage-rage'), anim: cs.animationName, dur: parseFloat(cs.animationDuration) * (cs.animationDuration.endsWith('ms') ? 0.001 : 1), bAnim: bs.animationName,
          steam: [...document.querySelectorAll('#stageHero .sh-steam i')].filter(e => getComputedStyle(e).display !== 'none').length }; });
      ok(`${W} ${txt}: 폭주 배경 = 티어 3 이상만`, ex.rage === (tier >= 3), ex);
      if(tier >= 3){ ok(`${W} ${txt}: 정산 상자 배경만 순환 (뒤 화면은 그대로) · 초당 3회 이하 (한 바퀴 ≥ 1.33초)`, ex.anim === 'ovRage' && ex.bAnim === 'none' && ex.dur >= 1.33, [ex.anim, ex.bAnim, ex.dur]); }
      ok(`${W} ${txt}: 증기 덩어리 수 (티어 2 이상, 4/8/12)`, ex.steam === [0, 0, 4, 8, 12][tier] , ex.steam);
      seenTier.push(info);
      ok(`${W} ${txt}: 티어 ${tier} 클래스`, tier === 0 ? !/t[1-4]/.test(info.cls) : info.cls.includes('t' + tier), info.cls);
      ok(`${W} ${txt}: 주인공 글자 크기 = 40 × --ui`, Math.abs(info.fs - 40 * info.u) < 1.5, [info.fs, info.u]);
      ok(`${W} ${txt}: 가로 스크롤 없음`, info.sx <= 1, info.sx);
      await p.screenshot({ path: `${S}/stagejuice-${W}-${tag}.png` });
    }
    const fh = seenTier.map(i => i.fh);
    ok(W + ' 불꽃 높이가 티어마다 커진다', fh[0] < 1 && fh[1] > fh[0] && fh[2] > fh[1] && fh[3] > fh[2], fh.map(v => +v.toFixed(1)));
    ok(W + ' 증기 효과음 steam 재생', (await p.evaluate(() => window.__snd)).includes('steam'));
    const shook = await p.evaluate(() => [...window.__shakeSeen]);
    ok(W + ' Fx.shake가 정산 상자(.overlay-box)도 흔들었다', shook.length > 0, shook);
    // 스킵: 결과로 → 주인공 = 최종 배수 · 티어 4
    await p.evaluate(() => { stage.speed = 1; });
    await p.mouse.click(5, 5); await sleep(60); await p.mouse.click(5, 5); await sleep(150);
    const fin = await p.evaluate(() => [$('stageHeroV').textContent, $('stageHero').className, stage.hold]);
    ok(W + ' 결과로 스킵 → 주인공 ×10,000 · t4', fin[0] === '×10,000' && fin[1].includes('t4') && fin[2], fin);
    await p.evaluate(() => { stage.readyAt = 0; stageNext(); }); await sleep(100);
    ok(W + ' 닫으면 stage-live·ov-shake 정리', await p.evaluate(() => !/stage-live|ov-shake/.test($('overlayBox').className)));
    // 정산 중이 아닐 때 Fx.shake는 상자를 흔들지 않는다
    await p.evaluate(() => { showOverlay('<div id="plainBox">x</div>'); Fx.shake(3); });
    ok(W + ' 정산 아닐 때 상자 안 흔들림', await p.evaluate(() => !/ov-shake/.test($('overlayBox').className)));
    await p.close();
  }
  // 동작 줄이기: 팝·일렁임·상자 흔들림 없음, 불꽃은 정지한 채 보인다
  {
    const p = await open(b, 1366, 768, { reducedMotion: 'reduce' });
    await p.evaluate(`window.__fake = ${FAKE.toString()}`);
    await p.evaluate(() => { Fx.skipQueue(); playDayStage(window.__fake()); });
    await p.waitForFunction(() => $('stageHeroV') && $('stageHeroV').textContent === '×1,000', null, { timeout: 15000, polling: 'raf' });
    await p.evaluate(() => { stage.speed = 0; Fx.shake(3); });
    await sleep(120);
    const r = await p.evaluate(() => ({ an: [getComputedStyle($('stageHeroV')).animationName, getComputedStyle(document.querySelector('#stageHero .sh-flame i')).animationName, getComputedStyle($('overlayBox')).animationName], fh: document.querySelector('#stageHero .sh-flame').getBoundingClientRect().height }));
    ok('동작 줄이기: 팝·일렁임·상자 흔들림 애니메이션 없음', r.an.every(a => a === 'none'), r.an);
    ok('동작 줄이기: 불꽃은 정지한 모양으로 남는다', r.fh > 10, r.fh);
    const rm = await p.evaluate(() => { stage.speed = 8; return null; });
    await p.waitForFunction(() => $('stageHeroV').textContent === '×10,000', null, { timeout: 15000, polling: 'raf' });
    await p.evaluate(() => { stage.speed = 0; });
    const r2 = await p.evaluate(() => [getComputedStyle($('overlayBox'), '::before').animationName, getComputedStyle($('overlayBox'), '::before').animationName, [...document.querySelectorAll('#stageHero .sh-steam i')].every(e => getComputedStyle(e).display === 'none')]);
    ok('동작 줄이기: 폭주 배경 정지 · 증기 없음', r2[0] === 'none' && r2[1] === 'none' && r2[2], r2);
    await p.close();
  }
  // 설정 '화면 흔들림' 끔: Fx.shake 자체가 무시된다 → 상자도 안 흔들림
  {
    const p = await open(b, 1366, 768);
    await p.evaluate(`window.__fake = ${FAKE.toString()}`);
    await p.evaluate(() => { settings.shake = false; Fx.setOptions({ motion: false, hitStop: false }); document.body.classList.add('no-motion'); Fx.skipQueue(); playDayStage(window.__fake()); });
    await p.waitForFunction(() => $('stageHeroV') && $('stageHeroV').textContent === '×100', null, { timeout: 15000, polling: 'raf' });
    await p.evaluate(() => { stage.speed = 0; Fx.shake(3); });
    await sleep(120);
    ok('흔들림 끔: 상자 흔들림·팝 없음', await p.evaluate(() => !/ov-shake/.test($('overlayBox').className) && getComputedStyle($('stageHeroV')).animationName === 'none'));
    await p.close();
  }
  // 튜너: 수치가 JUICE_CONFIG에 있고 ?tuner=1 패널에 슬라이더로 뜬다
  {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?tuner=1'); await p.keyboard.press('Shift');
    const keys = ['heroPopBase', 'heroPopPerDecade', 'heroPopMax', 'heroPopMs', 'heroFlameH.4', 'heroFlameMs', 'boxShakeMul'];
    const have = await p.evaluate(ks => ks.map(k => !!document.querySelector(`#tunerPanel [data-tn="${k}"]`)), keys);
    ok('튜너 패널에 새 수치 슬라이더 7개', have.every(Boolean), have);
    ok('튜너 \'정산 무대 테스트\' 버튼', await p.evaluate(() => !!document.querySelector('#tunerPanel [data-tn-act="stage"]')));
    await p.close();
  }
  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
