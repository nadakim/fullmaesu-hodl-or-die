// N3 섹터 레벨: 리포트 카드 → 레벨 +1 (소멸) · 시세판 뱃지 · ≡ 메뉴 표 · 정산 맨 앞 섹터 단계 · 예상 정산 반영 · 리서치 팩 · 팩 팝업 가중 안내
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
    await p.goto((process.env.TEST_BASE || 'http://127.0.0.1:8765') + '/demo.html'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    await p.evaluate(() => { clearToasts(); run.hand = ['rpt_crypto', 'rpt_crypto+', 'stk_coin'].map(newCard); run.ap = 3; handSig = ''; renderAll(); });
    await sleep(150);
    // 리포트 두 장 → 암시장 Lv.3, 소멸
    await p.locator('#handBox .card', { hasText: '반감기' }).first().click(); await sleep(200);
    await p.locator('#handBox .card', { hasText: '반감기' }).first().click(); await sleep(250);
    const lv = await p.evaluate(() => [run.sectorLevel['암호화폐'], run.exhausted.filter(c => c.id.indexOf('rpt_') === 0).length, document.body.innerText.includes('Lv.3')]);
    ok(W + ' 리포트 2장 → 암호화폐 Lv.3 · 소멸 · 알림', lv[0] === 3 && lv[1] === 2 && lv[2], lv);
    const badge = await p.evaluate(() => { const r = document.querySelector('[data-q="coin"] .q-lv'), o = document.querySelector('[data-q="semi"] .q-lv'); return [!r.hidden, r.textContent, o.hidden]; });
    ok(W + ' 시세판 뱃지 (암호화폐만)', badge[0] && badge[1] === 'Lv3' && badge[2], badge);
    // (조정안 1·3) 결산 보상 마지막 칸 = 리포트 · 리포트 행동력 0
    const rw = await p.evaluate(() => { const c = rollRewardChoices(); return [c.length, CARD_BY_ID[c[c.length - 1]].type, CARD_BY_ID.rpt_blue.ap, cardCost(CARD_BY_ID.rpt_blue)]; });
    ok(W + ' 보상 마지막 칸 = 리포트 · 행동력 0', rw[0] === 3 && rw[1] === 'report' && rw[2] === 0 && rw[3] === 0, rw);
    // 매수 → 예상 정산 배수 > 1
    await p.evaluate(() => { openPosition('coin', 1000, 1, 1, true); renderAll(); });
    const pv = await p.evaluate(() => [previewSettlement().mult, $('multText').textContent]);
    ok(W + ' 예상 정산에 섹터 레벨 반영', pv[0] > 1.5, pv);
    // ≡ 메뉴 → 섹터 레벨 표
    await p.click('#menuBtn'); await sleep(120); await p.click('#menuSectors'); await sleep(200);
    const tbl = await p.evaluate(() => { const r = document.querySelector('.sector-table tr[data-sector="암호화폐"]'); return r ? [r.className, r.textContent.replace(/\s+/g, ' ').trim()] : null; });
    ok(W + ' 섹터 레벨 표: Lv.3 · 효과 · 최고 섹터 표시', !!tbl && /Lv\.3/.test(tbl[1]) && /칩 \+원금의 4%/.test(tbl[1]) && /top/.test(tbl[0]), tbl);
    await p.screenshot({ path: `${S}/sector-table-${W}.png` });
    await p.evaluate(() => hideOverlay());
    // 장 마감 정산: 수익 마감 → 섹터 단계가 맨 앞
    await p.evaluate(() => { window.tipChance = () => 0; window.rollCrit = () => 0; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); assets.coin.price *= 1.01; tick(); } renderAll(); });
    const st = await p.evaluate(() => { const r = run.lastDay.settlement.find(x => x.assetId === 'coin'); return r ? r.steps.map(s => [s.source, s.kind, s.label]) : null; });
    ok(W + ' 정산 단계: base → 섹터 칩 → 섹터 배수 (유물보다 먼저)', !!st && st[1][0] === 'sector' && st[1][1] === 'add' && st[2][1] === 'mult' && /📊 암호화폐 Lv\.3/.test(st[1][2]), st);
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelectorAll('#stageList .chain-chip').length >= 3, null, { timeout: 8000 }).catch(() => {});   // 고정 대기 대신 칩 3개(오늘 손익·섹터 칩·섹터 배수)가 나올 때까지
    const chips = await p.evaluate(() => [...document.querySelectorAll('#stageList .chain-chip')].map(c => [c.textContent, getComputedStyle(c).color]));
    ok(W + ' 정산 무대 칩: 섹터 칩 청록 · 섹터 배수 금색', chips.some(([t, c]) => /📊 암호화폐 Lv\.3/.test(t) && c === 'rgb(0, 229, 255)') && chips.some(([t, c]) => /📊 암호화폐 Lv\.3 \+/.test(t) && c === 'rgb(255, 215, 0)'), chips);
    if(W === 1920) await p.screenshot({ path: `${S}/sector-stage-${W}.png` });
    await p.evaluate(() => { if(stage){ stageSkip(); stageSkip(); stage.readyAt = 0; stageNext(); } });
    // 암시장: 리서치 팩 · 팩 팝업 가중 안내
    await p.evaluate(() => { run.day = DAYS_PER_ROUND; run.cash += 1e6; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } Fx.skipQueue(); });
    await p.waitForFunction(() => !!chainHold || !!chainPlay, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); } });
    await sleep(200);
    await p.evaluate(() => { hideOverlay(); if(run.phase === 'reward'){ chooseReward('skip'); if(run.rewardStep === 'relic') chooseRelicReward(''); } hideOverlay(); run.slush = 5000; renderAll(); });
    await sleep(300);
    ok(W + ' 암시장에 리서치 팩', await p.evaluate(() => currentTab === 'shop' && !!document.querySelector('[data-pack="research"]')));
    await p.click('[data-pack-info="research"]'); await sleep(250);
    const note = await p.evaluate(() => { const n = document.querySelector('.bias-note'); const c = document.querySelector('[data-pki-card="rpt_crypto"] .odds'), d = document.querySelector('[data-pki-card="rpt_bio"] .odds'); return [n && n.textContent, c && c.textContent, d && d.textContent]; });
    ok(W + ' 팩 팝업: 최고 섹터 +30% 안내 · 확률 반영(암호화폐 > 바이오)', !!note[0] && /암호화폐/.test(note[0]) && parseFloat(note[1]) > parseFloat(note[2]), note);
    if(W === 1920) await p.screenshot({ path: `${S}/sector-pack-${W}.png` });
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
