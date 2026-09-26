const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  for (const [w, h] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(300);
    await page.evaluate(() => { window.tipChance = () => 0; startMarket(); renderAll(); });
    const cases = [['up', 0, [1, 0]], ['down', 0, [0, 1]], ['flat', 1, [1]]];
    for (const [kind, choice, chances] of cases) {
      await page.evaluate(([ch, k]) => { window.tipChances = () => ch; Sound.stats.played = {}; if(k !== 'flat') run.cash = 6000; openTip('mom'); renderAll(); }, [chances, kind]);
      await page.waitForTimeout(250);
      await page.locator(`#overlayBox [data-tip-choice="${choice}"]`).click();
      await page.waitForTimeout(kind === 'up' ? 1100 : 700);
      const st = await page.evaluate(() => { const el = document.querySelector('.gap-alert.tip-res');
        return el && { cls: el.className, tape: el.querySelector('.ga-tape').textContent, name: el.querySelector('.ga-name').textContent, amt: el.querySelector('.ga-pct').textContent,
          slush: (el.querySelector('.ga-slush') || {}).textContent || '', meme: el.querySelector('.ga-meme').textContent, busy: Fx.queueBusy, overlay: overlayOpen,
          sfx: Object.keys(Sound.stats.played), d: Math.round(run.tipLog[0].delta) }; });
      const tape = { up: '📈 찌라시 적중!', flat: '➖ 본전 치기', down: '📉 찌라시 설거지' }[kind];
      ok(st && st.cls.includes(kind) && st.tape === tape && st.busy && !st.overlay, `${w} ${kind}: 중앙 알림 (시장 정지, 오버레이 아직)`, st);
      if (kind === 'flat') ok(/💼 비자금 \+80만/.test(st.slush) && st.amt === '±0만' && st.cls.includes('t1'), `${w} flat: ±0만 + 비자금 줄 + tier1`);
      if (kind === 'up') ok(st.cls.includes('t3') && ['coinDrop','billFlip'].every(x => st.sfx.includes(x)), `${w} up: tier3 + coinDrop·billFlip`, st.sfx);
      if (kind === 'down') ok(st.cls.includes('t3') && st.sfx.includes('crashDown') && !st.sfx.includes('crowdScream'), `${w} down: tier3 + crashDown (비명 없음)`, st.sfx);
      if (kind === 'flat') ok(st.sfx.includes('flatShrug'), `${w} flat: flatShrug`, st.sfx);
      if (w === 390 || w === 1920) await page.screenshot({ path: `${S}/tipres-${kind}-${w}.png` });
      if (kind === 'down') { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
      else await page.waitForTimeout(2200);
      const after = await page.evaluate(() => [!!document.querySelector('.gap-alert.tip-res'), overlayOpen, $('overlayBox').textContent.includes('확인 — 장 계속'), Fx.queueBusy]);
      ok(!after[0] && after[1] && after[2] && !after[3], `${w} ${kind}: ${kind === 'down' ? '스페이스 스킵' : '끝난 뒤'} → 결과 요약 오버레이`, after);
      if (kind === 'up') { const sfx = await page.evaluate(() => Object.keys(Sound.stats.played)); ok(sfx.includes('cashRegister'), `${w} up tier3: cashRegister`, sfx); }
      await page.locator('#overlayBox [data-act="close"]').click(); await page.waitForTimeout(150);
    }
    // ≡ 메뉴 → 찌라시 기록 (탭 대신)
    await page.evaluate(() => { if(overlayOpen) hideOverlay(); showTipLog(); });
    const log = await page.evaluate(() => [overlayOpen, $('overlayBox').querySelectorAll('.tip-log li').length, run.tipLog.length]);
    ok(log[0] && log[1] === log[2] && log[2] > 0, `${w} 찌라시 기록 오버레이 = run.tipLog`, log);
    await page.locator('#overlayBox [data-act="close"]').click(); await page.waitForTimeout(100);
    const hw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(hw, `${w} 가로 넘침 없음`);
    await page.close();
  }
  // 사운드 끄기 → 전부 무음
  const page = await b.newPage(); page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift'); await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(200);
  const muted = await page.evaluate(() => { Sound.setEnabled(false); return ['coinDrop','billFlip','cashRegister','flatShrug','crashDown','crowdScream'].map(n => Sound.play(n)); });
  ok(muted.every(x => x === false), '사운드 끄기 → 새 효과음 전부 무음', muted);
  // 파일 덮어쓰기: 테스트용 wav를 SFX_FILES에 넣으면 합성음 대신 파일
  await page.close();
  ok(errs.length === 0, 'page/console errors 없음', errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
