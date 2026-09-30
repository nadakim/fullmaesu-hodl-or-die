// 목표 성장률 (실험, TARGET_GROWTH_ON 기본 꺼짐): 기본 = 고정 목표·📈 없음 · ?growth=1 = 1~2주차 고정 그대로 → 3주차 목표 = 주 시작 순자산 × K(주 시작에 확정, 주 중 순자산이 바뀌어도 그대로) ·
// HUD 📈 + 툴팁 '주 시작 순자산 × K' · 결산 결과·보상·암시장 '다음 주 목표'가 엔진 nextTarget · 보스 목표 상향 조정과 max로 합침 (1920·1366·1280×800)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 이번 주를 목표의 mult배로 끝낸다
const clearWeek = (p, mult) => p.evaluate(m => { Fx.skipQueue(); window.tipChance = () => 0; settings.chainFx = false; run.boss = ''; run.cash += currentTarget() * m; run.day = DAYS_PER_ROUND; run.phase = 'premarket'; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); return run.phase; }, mult);
async function toResult(p){ for(let i = 0; i < 60 && !(await p.evaluate(() => !!chainHold)); i++) await sleep(100); await sleep(560); await p.locator('[data-act="chainNext"]').click(); await sleep(250); }
async function toShopAndLeave(p, shot){
  await p.locator('[data-act="toReward"]').click(); await sleep(200);
  const reward = await p.evaluate(() => $('overlayBox').textContent.includes('다음 주 목표 ' + nextTargetText()));
  await p.locator('[data-act="skip"]').click(); await sleep(200);
  await p.locator('[data-act="skipRelic"]').click(); await sleep(300);
  const shop = await p.evaluate(() => $('shopBox').textContent.includes(nextTargetText()) && nextTargetText().includes('📈'));
  if(shot) await p.screenshot({ path: shot });
  await p.evaluate(() => { leaveShop(); Fx.skipQueue(); hideOverlay(); switchTab('play'); renderAll(); });
  await sleep(300); await p.keyboard.press('Space'); await sleep(150);
  return { reward, shop };
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[1280,800]]) {
    // 기본: 고정 목표
    { const p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => errs.push(e.message));
      await p.goto('http://127.0.0.1:8765/demo.html'); await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} }); await p.keyboard.press('Shift');
      await p.click('#startBtn'); await sleep(460);
      await clearWeek(p, 20); await toResult(p);
      const d = await p.evaluate(() => ({ flag: TARGET_GROWTH_ON, on: run.targetGrowth, next: nextTarget(), fixed: ROUND_TARGETS[1], txt: nextTargetText().includes('📈') }));
      ok(W + ' 기본(꺼짐): 목표 성장 없음 · 다음 주 목표 = 고정 · 📈 없음', !d.flag && !d.on && d.next === d.fixed && !d.txt, d);
      await p.close(); }
    // ?growth=1
    const p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?growth=1'); await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    const w1 = await p.evaluate(() => ({ on: run.targetGrowth, t: currentTarget(), fixed: ROUND_TARGETS[0], grow: growthBinding(), txt: $('targetText').textContent }));
    ok(W + ' ?growth=1: 켜짐 · 1주차 목표 = 고정 (K 1.0) · 📈 없음', w1.on && w1.t === w1.fixed && !w1.grow && !w1.txt.includes('📈'), w1);
    await clearWeek(p, 20); await toResult(p);
    const r1 = await p.evaluate(() => ({ next: nextTarget(), fixed: ROUND_TARGETS[1], txt: nextTargetText().includes('📈') }));
    ok(W + ' 1주 결산: 2주차 K 1.0 → 다음 주 목표 = 고정 (순자산이 커도)', r1.next === r1.fixed && !r1.txt, r1);
    await toShopAndLeave(p);
    const w2 = await p.evaluate(() => ({ round: run.round, t: currentTarget(), fixed: ROUND_TARGETS[1], grow: growthBinding() }));
    ok(W + ' 2주차: 목표 = 고정', w2.round === 2 && w2.t === w2.fixed && !w2.grow, w2);
    // 2주차를 목표의 20배로 → 3주차 목표 = 주 시작 순자산 × 1.3
    await clearWeek(p, 20); await toResult(p);
    const r2 = await p.evaluate(() => ({ next: nextTarget(), want: Math.max(ROUND_TARGETS[2], netEquity() * TARGET_GROWTH_K[2]), shown: $('overlayBox').textContent.includes(nextTargetText()), tt: nextTargetText() }));
    ok(W + " 2주 결산 화면: '다음 주 목표' = 순자산 × 1.3 + 📈", Math.abs(r2.next - r2.want) < 1e-6 && r2.next > 15000 && r2.shown && r2.tt.includes('📈'), r2);
    if(W === 1920) await p.screenshot({ path: `${S}/targetgrowth-result-${W}.png` });
    const sr = await toShopAndLeave(p, W === 1920 ? `${S}/targetgrowth-shop-${W}.png` : '');
    ok(W + ' 보상·암시장에도 다음 주 목표(📈) 표시', sr.reward && sr.shop, sr);
    const w3 = await p.evaluate(() => ({ round: run.round, t: currentTarget(), want: run.weekStart.equity * TARGET_GROWTH_K[2], stored: run.week.growthTarget, grow: growthBinding(), txt: $('targetText').textContent, title: $('targetText').title }));
    ok(W + ' 3주차: 목표 = 주 시작 순자산 × 1.3 (run.week에 확정) · HUD 📈 + 툴팁', w3.round === 3 && Math.abs(w3.t - w3.want) < 1e-6 && w3.stored === w3.t && w3.grow && w3.txt.includes('📈') && /주 시작 순자산 .+ × 1\.3/.test(w3.title), w3);
    // 주 중 순자산이 바뀌어도 목표는 그대로
    const mid = await p.evaluate(() => { const t0 = currentTarget(); run.cash += 99999; openPosition('semi', 1000, 1, 1, true); run.phase = 'premarket'; startMarket(); for(let i = 0; i < 5; i++) tick(); const t1 = currentTarget(); run.cash -= 99999; return [t0, t1]; });
    ok(W + ' 주 중 순자산이 바뀌어도 목표 그대로', mid[0] === mid[1], mid);
    await p.evaluate(() => { while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } Fx.skipQueue(); hideOverlay(); renderAll(); });
    await sleep(200);
    await p.screenshot({ path: `${S}/targetgrowth-hud-${W}.png` });
    // 보스 목표 상향 조정과 max
    const boss = await p.evaluate(() => { const g = run.week.growthTarget; run.boss = 'multCap'; const t = currentTarget(); run.boss = ''; return { g, t, want: Math.max(g, run.weekStart.equity * 2, ROUND_TARGETS[2]) }; });
    ok(W + ' 보스 목표 상향 조정(×2)과 max로 합침', boss.t === boss.want && boss.t > boss.g, boss);
    await p.close();
  }
  // 설정 '목표 성장률 (실험)' 켜기 = ?growth=1과 같다 (아티팩트처럼 주소를 못 바꾸는 곳용)
  { const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.evaluate(() => { switchTab('settings'); buildSettings(); });
    await p.locator('[data-set="growth"][data-val="true"]').click();
    const saved = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('hodl.settings')).growth; } catch(e) { return null; } });
    await p.evaluate(() => { switchTab('title'); }); await p.click('#startBtn'); await sleep(460);
    const on = await p.evaluate(() => run.targetGrowth);
    ok("설정 '목표 성장률 (실험)' 켬 → 새 판에서 켜짐 (저장됨)", on === true && saved === true, { on, saved });
    await p.evaluate(() => { settings.growth = false; saveSettings(); });
    await p.close(); }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
