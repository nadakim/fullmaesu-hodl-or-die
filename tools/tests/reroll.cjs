const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, name, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const box = (page, k) => page.evaluate(k => { const b = document.querySelector(`[data-reroll="${k}"]`); return { txt: b.textContent.replace(/\s+/g, ' ').trim(), dis: b.disabled, next: b.parentElement.querySelector('.reroll-next').textContent }; }, k);
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await page.waitForTimeout(200);
    await page.evaluate(() => { run.slush = 3000; openShop(); renderShop(); Sound.stats.played = {}; });
    await page.waitForTimeout(200);
    let s = await box(page, 'single'), r = await box(page, 'relic');
    ok(/🔄 새로고침 💼 100만/.test(s.txt) && s.next === '다음 150 → 230' && /💼 250만/.test(r.txt) && r.next === '다음 380 → 560', W + ' 버튼 가격·다음 두 단계 (낱장 100, 유물 250)', [s, r]);
    // 1개 사고 낱장 새로고침
    const pre = await page.evaluate(() => { buySingle(0); renderShop(); return { singles: run.shop.singles.slice(), bought: run.shop.singles[0], slush: run.slush }; });
    await page.locator('[data-reroll="single"]').click();
    await page.waitForTimeout(60);
    const outN = await page.evaluate(() => document.querySelectorAll('#shopBox .shop-singles .rr-out').length);
    await page.waitForTimeout(250);
    const post = await page.evaluate(() => ({ singles: run.shop.singles.slice(), bought: run.shop.singlesBought.slice(), slush: run.slush, flips: document.querySelectorAll('#shopBox .shop-singles .flip-card').length,
      firstLabel: document.querySelector('[data-single="0"]').textContent.trim(), n: run.shop.rerolls.single, sfx: Object.keys(Sound.stats.played),
      punched: !!document.getElementById('rrCost-single').getAnimations().length }));
    ok(outN === pre.singles.length - 1, W + ' 안 산 칸만 뒤집혀 사라짐', outN);
    ok(pre.slush - post.slush === 100 && post.n === 1 && post.singles[0] === pre.bought && post.bought.join() === '0' && /구매 완료/.test(post.firstLabel) && post.flips === post.singles.length - 1, W + ' 새로고침: 100 차감, 산 칸 유지 "구매 완료", 새 칸 flip-card', post);
    ok(post.sfx.includes('shopShuffle') && post.punched, W + ' 셔플 효과음 + 가격 숫자 펀치', post.sfx);
    s = await box(page, 'single');
    ok(/💼 150만/.test(s.txt) && s.next === '다음 230 → 340', W + ' 다음 단계 가격 갱신 (150 · 다음 230 → 340)', s);
    if (W !== 1366) { await page.waitForTimeout(100); await page.screenshot({ path: `${S}/reroll-${W}.png` }); }
    // 유물 새로고침
    const r0 = await page.evaluate(() => ({ relics: run.shop.relics.slice(), slush: run.slush }));
    await page.locator('[data-reroll="relic"]').click(); await page.waitForTimeout(300);
    const r1 = await page.evaluate(() => ({ relics: run.shop.relics.slice(), slush: run.slush, anim: document.querySelectorAll('#shopBox .relic-row .rr-in').length }));
    ok(r0.slush - r1.slush === 250 && r1.relics.length === 3 && r1.relics.every(id => r0.relics.indexOf(id) < 0) && new Set(r1.relics).size === 3 && r1.anim === 3, W + ' 유물 새로고침: 250 차감, 3칸 모두 다른 유물, 뒤집히며 등장', [r0, r1]);
    // 비자금 부족 → 비활성
    await page.evaluate(() => { run.slush = 100; renderShop(); });
    s = await box(page, 'single'); r = await box(page, 'relic');
    ok(s.dis && r.dis, W + ' 비자금 부족 → 둘 다 비활성');
    // 새로 뽑을 유물 없음 → 비활성
    await page.evaluate(() => { run.slush = 99999; RELICS.forEach(x => { if(run.shop.relics.indexOf(x.id) < 0 && !hasRelic(x.id)) gainRelic(x.id, 'test'); }); renderShop(); });
    r = await box(page, 'relic');
    ok(r.dis, W + ' 새로 들여올 유물 없음 → 비활성');
    // 다음 주: 횟수 초기화 + 주차 기본가 상승
    await page.evaluate(() => { run.round = 4; openShop(); renderShop(); });
    s = await box(page, 'single');
    ok(/💼 150만/.test(s.txt) && s.next === '다음 220 → 330', W + ' 다음 주(4주차): 0회로 초기화, 기본가 150', s);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' 가로 넘침 없음');
    await page.close();
  }
  ok(errs.length === 0, 'page/console errors 없음', errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
