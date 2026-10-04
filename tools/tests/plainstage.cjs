// 간이 정산 무대 (stage-every-day): 보유 포지션이 있으면 매일 장 마감 무대 — 보정이 없으면 간이 무대(칩 톡톡 → 배수 ×1 → 합계 카운트업 → "둥", ≈ 1초).
// 포지션 없음 → 무대 없음 · 유물 → 기존 무대 · 손실 날(빨간 숫자·흔들림 없음) · 연출 최소 → 한 줄 알림 · 힌트는 판마다 처음 3번 · SPACE 한 번 = 결과로 · Enter = 다음 날 · 금요일은 주간 체인
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const runDay = up => `(() => { window.tipChance = () => 0; window.rollCrit = () => 0; startMarket(); run.allProtectedToday = true;
  while(run.phase === 'market'){ for(const id of Object.keys(assets)) assets[id].price *= ${up}; tick(); } renderAll(); })()`;
const closeStage = p => p.evaluate(() => { if(stage){ if(!stage.hold) stageSkip(); stage.readyAt = 0; stageNext(); } hideOverlay(); clearToasts(); });
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?layout=classic'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    // 1) W1D1 · 종목 카드 1장 · 유물 없음 → 간이 무대
    await p.evaluate(() => { clearToasts(); run.relics = []; run.hand = ['stk_semi'].map(newCard); handSig = ''; renderAll(); });
    await p.locator('#handBox .card.gcard').first().click(); await sleep(200); await p.keyboard.press('Enter'); await sleep(300);
    const setup = await p.evaluate(() => [run.round, run.day, run.positions.length, run.relics.length]);
    ok(W + ' W1D1 종목 카드 1장 · 유물 없음', setup[0] === 1 && setup[1] === 1 && setup[2] === 1 && setup[3] === 0, setup);
    await p.evaluate(runDay(1.003));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 }).catch(() => {});
    const s1 = await p.evaluate(() => ({ plain: !!stage && stage.plain, formula: !!document.querySelector('#stageFormula.plain'), mult: $('sfMultV').textContent,
      hint: !!$('sfHint'), dur: stage && stage.end, fire: document.querySelectorAll('.stage-mult.f1,.stage-mult.f2,.stage-mult.f3,.stage-mult.f4,.stage-reel').length }));
    ok(W + ' 간이 무대 열림 · 배수 ×1 고정 · 힌트', s1.plain && s1.formula && s1.mult === '1.00' && s1.hint, s1);
    ok(W + ' 간이 무대 ≈ 1초 · 불타기·릴 없음', s1.dur >= 700 && s1.dur <= 1300 && s1.fire === 0, s1);
    await sleep(W === 1920 ? 250 : 0);
    await p.waitForFunction(() => stage && stage.hold, null, { timeout: 5000 }).catch(() => {});
    const s2 = await p.evaluate(() => { const pnl = run.lastDay.settlement.reduce((a, r) => a + r.base, 0);
      return { hold: stage && stage.hold, sum: $('stageSumV').textContent === fmtSigned(pnl), amt: $('sfAmtV').textContent === fmtSigned(pnl), chips: document.querySelectorAll('#stageList .chain-chip').length }; });
    ok(W + ' 결과: 합계 = 오늘 손익 · 칩 1개', s2.hold && s2.sum && s2.amt && s2.chips === 1, s2);
    await p.screenshot({ path: `${S}/plainstage-${W}.png` });
    await p.keyboard.press('Enter'); await sleep(450); await p.keyboard.press('Enter'); await sleep(200);
    ok(W + ' Enter → 다음 날', await p.evaluate(() => !stage && !overlayOpen && run.phase === 'premarket' && run.day === 2));
    // 2) SPACE 한 번 = 결과로
    await p.evaluate(runDay(1.002));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 }).catch(() => {});
    await p.keyboard.press('Space'); await sleep(100);
    ok(W + ' SPACE 한 번 → 결과로', await p.evaluate(() => !!stage && stage.hold && $('sfAmtV').textContent !== '?'));
    await closeStage(p);
    // 3) 손실 날: 빨간 숫자 · 흔들림 없음
    await p.evaluate(() => { __shake = 0; const o = Fx.shake; Fx.shake = (...a) => { __shake++; return o(...a); }; });
    await p.evaluate(runDay(0.985));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { __shake = 0; });   // 무대 동안만 센다 (장중 갭 흔들림 제외)
    await p.waitForFunction(() => stage && stage.hold, null, { timeout: 8000 }).catch(() => {});
    const s3 = await p.evaluate(() => ({ plain: stage && stage.plain, loss: !!document.querySelector('#stageFormula.loss'), neg: !!document.querySelector('#stageList .chain-chip.neg'),
      down: $('sfAmt').classList.contains('down'), shake: __shake, pre: $('overlayBox').classList.contains('pre-shake'), hint: !!$('sfHint') }));
    ok(W + ' 손실 날 간이 무대: 빨간 숫자 · 흔들림 없음', s3.plain && s3.loss && s3.neg && s3.down && s3.shake === 0 && !s3.pre, s3);
    ok(W + ' 힌트는 판마다 처음 3번까지 (3번째 = 보임)', s3.hint, s3);
    if(W === 1920) await p.screenshot({ path: `${S}/plainstage-loss-${W}.png` });
    await closeStage(p);
    await p.evaluate(runDay(1.001));
    await p.waitForFunction(() => stage && stage.hold, null, { timeout: 8000 }).catch(() => {});
    ok(W + ' 4번째 간이 무대 → 힌트 없음', await p.evaluate(() => !!stage && !$('sfHint')));
    await closeStage(p);
    // 4) 연출 최소 → 한 줄 알림
    await p.evaluate(() => { settings.fxSpeed = 'min'; run.day = 1; });   // 금요일(주간 체인)을 피해 평일로
    await p.evaluate(runDay(1.002)); await sleep(1200);
    const s4 = await p.evaluate(() => ({ stage: !!stage, ov: overlayOpen, toast: [...document.querySelectorAll('#toastLayer > *')].some(e => e.textContent.includes('오늘 손익')) }));
    ok(W + " 연출 '최소' → 무대 대신 한 줄 알림", !s4.stage && !s4.ov && s4.toast, s4);
    await p.evaluate(() => { settings.fxSpeed = 'normal'; clearToasts(); });
    // 5) 포지션 없음 → 무대 없음
    await p.evaluate(() => { sellAllPositions(); run.day = 1; renderAll(); });
    await p.evaluate(runDay(1.002)); await sleep(1200);
    ok(W + ' 포지션 없음 → 무대 없음', await p.evaluate(() => !stage && !overlayOpen && run.lastDay.settlement.length === 0));
    // 6) 유물이 붙은 날 → 기존 무대 그대로
    const full = await p.evaluate(() => { const d = { round: 1, day: 2, payout: 50, settlement: [{ posId: 1, posName: '테스트', assetId: 'semi', dir: 1, lev: 1, base: 100, payout: 50,
      steps: [{ label: '오늘 손익', kind: 'add', value: 100, runningChips: 100, runningMult: 1, source: 'base' }, { label: '유물', kind: 'mult', value: 0.5, runningChips: 100, runningMult: 1.5, source: 'antFlag' }], sources: [] }] };
      const e = stageEligible(d), f = stageFull(d); playDayStage(d);
      return { e, f, plain: stage.plain, formula: !document.querySelector('#stageFormula.plain'), pay: !!$('stagePay0') }; });
    ok(W + ' 유물 보정 → 기존 무대 (간이 아님)', full.e && full.f && !full.plain && full.formula && full.pay, full);
    await closeStage(p);
    // 7) 금요일 · 연출 끔 → 무대 없음 (주간 체인이 요약)
    const el = await p.evaluate(() => { const d = { round: 1, day: DAYS_PER_ROUND, payout: 0, settlement: [{ base: 10, payout: 0, steps: [{}] }] };
      const fri = stageEligible(d); d.day = 1; settings.chainFx = false; const off = stageEligible(d); settings.chainFx = true; return [fri, off, stageEligible(d)]; });
    ok(W + ' 금요일·결산 연출 끔 → 무대 없음, 평일 → 무대', !el[0] && !el[1] && el[2], el);
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
