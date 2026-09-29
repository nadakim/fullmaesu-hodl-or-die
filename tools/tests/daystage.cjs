// S6 장 마감 정산 무대: 보정 있는 날 = 기존 무대 (없는 날은 간이 무대 → plainstage.cjs) · 유물 단계 차례 재생 · 배수 불타기 · 크리티컬 릴 · 빨리 감기/결과로 · 다음 날 · 설정 끔 · 주 마지막 날은 체인
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 장 하루를 끝낸다 (가격을 조금씩 올려 수익 마감)
const runDay = up => `(() => { window.tipChance = () => 0; startMarket(); while(run.phase === 'market'){ for(const id of ['semi','coin','gukbap']) assets[id].price *= ${up}; tick(); } renderAll(); })()`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    // 1) 보정 없는 날 → 무대 없음 (알림만)
    await p.evaluate(() => { clearToasts(); window.rollCrit = () => 0; openPosition('semi', 1000, 1, 1, true); });
    await p.evaluate(runDay(1.002));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 }).catch(() => {});
    ok(W + ' 보정 없는 날 → 간이 무대 (stage-every-day)', await p.evaluate(() => !!stage && stage.plain && !!document.querySelector('#stageFormula.plain')));
    await p.evaluate(() => { if(stage){ stageSkip(); stage.readyAt = 0; stageNext(); } });
    // 2) 곱하기 유물 + 크리티컬 → 무대
    await p.evaluate(() => { ['antFlag', 'levTower'].forEach(id => gainRelic(id, 't')); openPosition('coin', 800, 2, 1, true);
      window.rollCrit = () => 3; });   // 크리티컬 릴 확인용 (엔진 rollCrit를 이 테스트에서만 고정)
    await p.evaluate(runDay(1.02));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 });
    const s1 = await p.evaluate(() => [overlayOpen, run.phase, $('overlayBox').textContent.includes('장 마감 정산'), stage.rows.length]);
    ok(W + ' 보너스 있는 날 → 다음 날 장전에 무대', s1[0] && s1[1] === 'premarket' && s1[2] && s1[3] >= 1, s1);
    await sleep(2600);
    const s2 = await p.evaluate(() => [document.querySelectorAll('#stageList .chain-chip').length, !!document.querySelector('#stageList .stage-reel')]);
    ok(W + ' 유물 칩 차례 재생 · 크리티컬 릴', s2[0] >= 3 && s2[1], s2);
    await p.screenshot({ path: `${S}/daystage-${W}.png` });
    // 3) 클릭 한 번 = 빨리 감기, 두 번 = 결과로 → 합계 = 엔진 값
    await p.mouse.click(5, 5); await sleep(60);
    ok(W + ' 한 번 클릭 → 빨리 감기', await p.evaluate(() => stage && stage.speed >= JUICE_CONFIG.ffSpeed));
    await p.mouse.click(5, 5); await sleep(150);
    const s3 = await p.evaluate(() => [stage && stage.hold, $('stageSumV').textContent === fmtSigned(run.lastDay.payout), [...document.querySelectorAll('[id^=stagePayV]')].every(e => e.textContent.length > 0), !!document.querySelector('[data-act="stageNext"]')]);
    ok(W + ' 두 번 클릭 → 결과 (합계 = 엔진 정산금) + ▶ 다음 날', s3.every(Boolean), s3);
    const fire = await p.evaluate(() => [...document.querySelectorAll('.stage-mult')].map(e => [e.textContent, e.className]));
    ok(W + ' 배수 불타기: 누적 ×10 이상이면 f1 이상', fire.every(([t, c]) => parseFloat(t.slice(1).replace(/,/g, '')) < 10 || /f[1-4]/.test(c)) && fire.some(([, c]) => /f[1-4]/.test(c)), fire);
    await p.mouse.click(5, 5); await sleep(80);
    ok(W + ' 결과 화면: 빈 곳 클릭으론 안 닫힘', await p.evaluate(() => !!stage && overlayOpen));
    await sleep(450); await p.keyboard.press('Enter'); await sleep(150);
    ok(W + ' Enter → 다음 날 (오버레이 닫힘)', await p.evaluate(() => !stage && !overlayOpen && run.phase === 'premarket'));
    // 4) 작은 정산 → 자동 2배속 (이번 판 최고 대비)
    await p.evaluate(() => { stageBest = { run, payout: 1e12 }; });   // 이번 판 최고 정산이 아주 크면 오늘 것은 '작은 정산'
    await p.evaluate(runDay(1.02));   // 장중 무작위 하락이 있어도 확실히 수익 마감
    const small = await p.waitForFunction(() => stage, null, { timeout: 8000 }).then(() => p.evaluate(() => stage.speed)).catch(() => 'no stage');
    ok(W + ' 작은 정산 → 자동 ' + '2배속', small === 2, small);
    await p.evaluate(() => { if(stage){ stageSkip(); stageSkip(); stage.readyAt = 0; stageNext(); } });
    // 5) 설정 '결산 연출' 끔 → 무대 없이 알림
    await p.evaluate(() => { settings.chainFx = false; });
    await p.evaluate(runDay(1.004)); await sleep(1600);
    ok(W + ' 결산 연출 끔 → 무대 없음', await p.evaluate(() => !stage && !overlayOpen));
    await p.evaluate(() => { settings.chainFx = true; });
    // 6) 주 마지막 날 → 무대 대신 주간 체인
    await p.evaluate(() => { run.day = DAYS_PER_ROUND; run.cash += ROUND_TARGETS[0]; });
    await p.evaluate(runDay(1.004));
    await p.waitForFunction(() => !!chainPlay || !!chainHold, null, { timeout: 8000 }).catch(() => {});   // 앞선 연출(큐)이 끝난 뒤 체인
    ok(W + ' 주 마지막 날 → 무대 없이 결산 체인', await p.evaluate(() => !stage && (!!chainPlay || !!chainHold)), await p.evaluate(() => [run.phase, !!stage, Fx.queueLength]));
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
