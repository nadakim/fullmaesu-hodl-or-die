const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(300);
    const vis = await page.evaluate(() => typeof window.__debug === 'object' && !document.body.innerText.includes('giveRelic') && !document.querySelector('[onclick*=giveRelic],[data-debug]'));
    ok(vis, `${w} __debug는 콘솔 전용 (화면에 없음)`);
    await page.evaluate(() => { window.tipChance = () => 0; __debug.giveRelic('moonSavings'); Sound.stats.played = {}; });
    await page.waitForTimeout(700);
    ok(await page.evaluate(() => !document.querySelector('[data-relic="moonSavings"] .rl-stk')), `${w} 0스택 → 배지 숨김`);
    // 실제 콤보로 성장: 포지션 + 상승 콤보 3
    await page.evaluate(() => { run.hand = ['stk_semi'].map(newCard); playCard(0);
      const p = run.positions[0]; run.combo = { up: 2, down: 0 }; run.comboPnl = { [p.id]: posPnl(p) - 100 }; updateCombo(); renderAll(); });
    await page.waitForTimeout(300);
    const g1 = await page.evaluate(() => [relicStacks('moonSavings'), document.querySelector('[data-relic="moonSavings"] .rl-stk')?.textContent, $('fxStreak').textContent, Object.keys(Sound.stats.played)]);
    ok(g1[0] === 1 && g1[1] === '1' && /상승 콤보 ×3/.test(g1[2]) && g1[3].includes('relicTick'), `${w} 상승 콤보 3 → +1스택, 배지 1, 콤보 표시(엔진 값), relicTick`, g1);
    // 1초 안 +3 합치기
    await page.waitForTimeout(600);
    await page.evaluate(() => { Fx.skipQueue(); __debug.grow('moonSavings', 1); __debug.grow('moonSavings', 1); __debug.grow('moonSavings', 1); });
    await page.waitForTimeout(80);
    const merged = await page.evaluate(() => [...document.querySelectorAll('.fx-chip')].map(e => e.textContent));
    ok(merged.includes('+3'), `${w} 1초 안 소발동 3번 → "+3" 하나로`, merged);
    await page.waitForTimeout(600);
    // LV.5 대발동
    await page.evaluate(() => { Sound.stats.played = {}; __debug.grow('moonSavings', 1); });
    await page.waitForTimeout(1750);
    const big = await page.evaluate(() => [!!document.querySelector('.fx-relic-big'), (document.querySelector('.fx-stamp') || {}).textContent, Fx.queueBusy, Object.keys(Sound.stats.played), document.querySelector('[data-relic="moonSavings"]').className]);
    ok(big[0] && /떡상 적금 LV\.5!/.test(big[1]) && big[2] && big[3].includes('relicLevelUp') && /g2/.test(big[4]), `${w} 5스택 → LV.5 대발동 (중앙 확대·도장·relicLevelUp·초록 발광)`, big);
    if (w !== 1366) await page.screenshot({ path: `${S}/grow-lv5-${w}.png` });
    await page.waitForTimeout(1400);
    // 툴팁
    await page.locator('[data-relic="moonSavings"]').click(); await page.waitForTimeout(100);
    const tip = await page.evaluate(() => $('relicTip').textContent);
    ok(/현재 5스택/.test(tip) && /평가이익 \+5%/.test(tip) && /초기화: 하락 콤보 10/.test(tip) && /최고 5스택/.test(tip), `${w} 툴팁: 스택·효과·초기화·최고`, tip.slice(0, 160));
    await page.locator('[data-relic="moonSavings"]').click();
    // 하락 콤보 10 → 초기화
    await page.evaluate(() => { Sound.stats.played = {}; const p = run.positions[0]; run.combo = { up: 0, down: 9 }; run.comboPnl = { [p.id]: posPnl(p) + 100 }; updateCombo(); renderAll(); });
    await page.waitForTimeout(800);
    const sh = await page.evaluate(() => [relicStacks('moonSavings'), document.querySelectorAll('.fx-lost').length, (document.querySelector('.fx-stamp') || {}).textContent, Object.keys(Sound.stats.played), $('fxStreak').textContent, !document.querySelector('[data-relic="moonSavings"] .rl-stk')]);
    ok(sh[0] === 0 && sh[1] > 0 && /5스택 증발/.test(sh[2]) && sh[3].includes('relicShatter') && /하락 콤보 ×10/.test(sh[4]) && sh[5], `${w} 하락 콤보 10 → 0스택, 산산조각·숫자 낙하·"5스택 증발…"·relicShatter`, sh);
    if (w !== 1366) await page.screenshot({ path: `${S}/grow-reset-${w}.png` });
    await page.waitForTimeout(1200);
    // 스킵
    await page.evaluate(() => { __debug.grow('moonSavings', 10); });
    await page.waitForTimeout(150); await page.keyboard.press('Space'); await page.waitForTimeout(80);
    ok(await page.evaluate(() => !Fx.queueBusy && !document.querySelector('.fx-relic-big')), `${w} 스페이스 스킵 → 큐 비움`);
    // 무지개 (25+)
    await page.evaluate(() => { __debug.grow('moonSavings', 20); Fx.skipQueue(); renderAll(); });
    ok(await page.evaluate(() => /g4/.test(document.querySelector('[data-relic="moonSavings"]').className)), `${w} 25스택+ 무지개`);
    if (w === 1920) { await page.evaluate(() => ['tearJar','diamondTree','compoundMonster'].forEach(id => __debug.giveRelic(id))); await page.evaluate(() => { __debug.grow('tearJar', 123); __debug.grow('diamondTree', 12); Fx.skipQueue(); renderAll(); }); await page.screenshot({ path: `${S}/grow-bar-1920.png`, clip: { x: 880, y: 140, width: 560, height: 70 } }); }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${w} 가로 넘침 없음`);
    await page.close();
  }
  ok(errs.length === 0, 'page/console errors 없음', errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
