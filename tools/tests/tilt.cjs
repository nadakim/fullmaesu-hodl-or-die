// 카드 기울기·호버(ui-tactile): 고를 수 있는 카드는 어디서나 기울고(.tilt · transform) 등급 색 링이 빛난다 —
// 손패 · 주간 보상 카드 · 보상 '카드 강화'/'카드 제거' 목록 · 유물 보상 · 암시장 낱장 · 카드 제거 · 팩(리서치 팩 포함) · 유물 진열. 보기만 하는 카드(덱 확인)는 움직이지 않는다
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(400);
    // 마우스를 카드 오른쪽 위로 옮겨 기울기 상태를 읽는다
    const hover = async (sel, shot) => {
      const c = p.locator(sel).first();
      if(!(await c.count())) return null;
      await c.scrollIntoViewIfNeeded(); await sleep(120);
      const bb = await c.boundingBox();
      await p.mouse.move(bb.x + 4, bb.y + 4); await p.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.2, { steps: 4 }); await sleep(250);
      const r = await p.evaluate(s => { const el = document.querySelector(s), cs = getComputedStyle(el);
        const layers = v => { let d = 0, n = v && v !== 'none' ? 1 : 0; for(const ch of v || ''){ if(ch === '(') d++; else if(ch === ')') d--; else if(ch === ',' && !d) n++; } return n; };   // 그림자 층 수 (괄호 안 쉼표 제외)
        return { tilt: el.classList.contains('tilt'), tr: cs.transform, glow: layers(cs.boxShadow) >= 4 }; }, sel);
      if(shot) await p.screenshot({ path: `${S}/tilt-${shot}-${W}.png` });
      await p.mouse.move(2, 2); await sleep(80);
      return r;
    };
    const tilted = r => !!r && r.tilt && /^matrix3d/.test(r.tr);
    // 손패
    await p.evaluate(() => { clearToasts(); window.tipChance = () => 0; run.hand = ['stk_semi', 'yolo', 'hodl'].map(newCard); run.ap = 3; handSig = ''; renderAll(); });
    await sleep(700);
    const h = await hover('#handBox .card.gcard');
    ok(W + ' 손패 카드 기울기', tilted(h), h);
    // 주간 결산 → 보상
    await p.evaluate(() => { run.day = DAYS_PER_ROUND; run.cash += 1e5; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } Fx.skipQueue(); });
    await p.waitForFunction(() => !!chainHold || !!chainPlay, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); } });
    await sleep(300); await p.locator('[data-act="toReward"]').click(); await sleep(600);
    const rw = await hover('#overlayBox .card[data-reward]', 'reward');
    ok(W + ' 보상 카드 기울기 · 발광', tilted(rw) && rw.glow, rw);
    await p.locator('[data-act="upgradeMode"]').click(); await sleep(400);
    const up = await hover('#overlayBox .card[data-upgrade]');
    ok(W + ' 보상 카드 강화 목록 기울기', tilted(up) && up.glow, up);
    await p.locator('[data-act="backReward"]').click(); await sleep(300);
    await p.locator('[data-act="removeMode"]').click(); await sleep(400);
    const rm = await hover('#overlayBox .card[data-remove]');
    ok(W + ' 보상 카드 제거 목록 기울기', tilted(rm), rm);
    await p.locator('[data-act="backReward"]').click(); await sleep(300);
    // 암시장
    await p.locator('[data-act="skip"]').click(); await sleep(400);
    const rr = await hover('#overlayBox .relic-tile[data-relic-reward]', 'relicReward');
    ok(W + ' 유물 보상 기울기 · 발광', !rr || (tilted(rr) && rr.glow), rr);
    await p.evaluate(() => { hideOverlay(); if(run.rewardStep === 'card') chooseReward('skip'); if(run.rewardStep === 'relic') chooseRelicReward(''); hideOverlay(); run.slush = 5000; renderAll(); });
    await sleep(1500);
    const sg = await hover('#shopBox .shop-singles .shop-item .card', 'shop');
    ok(W + ' 암시장 낱장 기울기 · 발광', tilted(sg) && sg.glow, sg);
    const sr = await hover('#shopBox .card[data-shop-remove]');
    ok(W + ' 암시장 카드 제거 기울기', tilted(sr), sr);
    const pk = await hover('#shopBox .pack[data-pack="research"]', 'pack');
    ok(W + ' 암시장 리서치 팩 기울기 · 발광', tilted(pk) && pk.glow, pk);
    const pk2 = await hover('#shopBox .pack[data-pack]');
    ok(W + ' 암시장 팩 기울기', tilted(pk2), pk2);
    const rl = await hover('#shopBox .relic-row:not(.own-relics) .relic-tile', 'relic');
    ok(W + ' 암시장 유물 진열 기울기 · 발광', tilted(rl) && rl.glow, rl);
    // 보기만 하는 카드: 덱 확인은 움직이지 않는다
    await p.evaluate(() => { leaveShop(); renderAll(); showDeck && showDeck(); });
    await sleep(400);
    const dk = await hover('#overlayBox .deck-list .card');
    ok(W + ' 덱 확인(보기 전용)은 기울지 않음', !dk || (!dk.tilt && dk.tr === 'none'), dk);
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
