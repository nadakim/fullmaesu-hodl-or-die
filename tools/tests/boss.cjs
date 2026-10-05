// S9 보스 주간: 일정(2·4·6 일반 중복 없음 + 8 최종) · 결산/보상/암시장 예고 · 보스 주 시작 경보·HUD 배지 · 효과(공매도 금지·거래정지·목표 상향·더하기 봉인·세무조사·빅스텝·증거금 상향·찌라시·금감원·거래세·블랙 먼데이·버블) · 격파 보상 · 도감 보스 · 파산 기록 사인
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 이번 주를 목표 달성으로 끝낸다 (장 마감 → 결산)
const CLEAR_BODY = `window.tipChance = () => 0; run.cash += currentTarget() * 1.2; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll();`;
const CLEAR_WEEK = `(() => { ${CLEAR_BODY} return run.phase; })()`;
async function throughResult(p){   // 결산 요약 → 결과 화면 → 보상 화면
  for(let i = 0; i < 60 && !(await p.evaluate(() => !!chainHold)); i++) await sleep(100);
  await sleep(560); await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="chainNext"]'), p.locator('[data-act="chainNext"]')).click(); await sleep(200);
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?layout=classic'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    // 일정
    const plan = await p.evaluate(() => ({ plan: run.bossPlan, boss: run.boss, chip: $('bossChip').hidden,
      finals: BOSSES.filter(b => b.final).map(b => b.id), counters: BOSSES.filter(b => b.counter).map(b => b.id), builds: BOSSES.filter(b => b.build).length, flag: BOSS_COUNTERS_ON, n: BOSSES.length }));
    const regs = [plan.plan[2], plan.plan[4], plan.plan[6]];
    ok(W + ' 보스 13종 + 빌드 카운터(플래그 켬이면 4) (정산 카운터 3) · 일정 2·4·6 일반(중복 없음) + 8 최종 · 1주차 없음', plan.n === 13 + plan.builds && plan.builds === (plan.flag ? 4 : 0) && plan.counters.length === 3 && new Set(regs).size === 3 && regs.every(id => plan.finals.indexOf(id) < 0) && plan.finals.indexOf(plan.plan[8]) >= 0 && !plan.boss && plan.chip, plan);
    // 1주 결산 → 결과·보상·유물·암시장 예고
    await p.evaluate(CLEAR_WEEK); await throughResult(p);
    ok(W + ' 결산 결과에 다음 주 보스 예고', await p.evaluate(id => !!document.querySelector(`#overlayBox .boss-notice[data-boss="${id}"]`), plan.plan[2]));
    await p.screenshot({ path: `${S}/boss-result-${W}.png` });
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="toReward"]'), p.locator('[data-act="toReward"]')).click(); await sleep(200);
    ok(W + ' 카드 보상에 예고', await p.evaluate(id => !!document.querySelector(`#overlayBox .boss-notice[data-boss="${id}"]`), plan.plan[2]));
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="skip"]'), p.locator('[data-act="skip"]')).click(); await sleep(200);
    ok(W + ' 유물 보상에 예고', await p.evaluate(id => !!document.querySelector(`#overlayBox .boss-notice[data-boss="${id}"]`), plan.plan[2]));
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '[data-act="skipRelic"]'), p.locator('[data-act="skipRelic"]')).click(); await sleep(300);
    ok(W + ' 암시장에 예고', await p.evaluate(id => currentTab === 'shop' && !!document.querySelector(`#shopBox .boss-notice[data-boss="${id}"]`), plan.plan[2]));
    await p.screenshot({ path: `${S}/boss-shop-${W}.png` });
    // 2주 개장 → 보스 경보 + HUD 배지
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#shopLeaveBtn'), p.locator('#shopLeaveBtn')).click(); await sleep(400);
    const st = await p.evaluate(() => [run.round, run.boss, !!document.querySelector('.boss-alert'), Fx.queueBusy, !$('bossChip').hidden, $('bossChip').textContent]);
    ok(W + ' 보스 주 시작: 중앙 경보(시장 정지) + HUD 배지', st[0] === 2 && st[1] === plan.plan[2] && st[2] && st[3] && st[4] && st[5].includes(BOSS_NAME_PLACEHOLDER(st[1])), st);
    await p.screenshot({ path: `${S}/boss-alert-${W}.png` });
    await p.keyboard.press('Space'); await sleep(150);
    ok(W + ' Space → 경보 닫힘', await p.evaluate(() => !document.querySelector('.boss-alert') && !Fx.queueBusy));
    // 격파 → 비자금 +, 유물 선택지 +1, 격파 표시
    const beat = await p.evaluate(`(() => { Fx.skipQueue(); ${CLEAR_BODY} return { slushGain: run.lastWeek.slush, base: slushEarned(run.lastWeek.eq, run.lastWeek.target), relics: run.relicChoices.length, beaten: run.bossesBeaten.slice() }; })()`);
    ok(W + ' 보스 격파: 비자금 +BOSS_SLUSH_BONUS · 유물 선택지 3개 · 기록', beat.slushGain - beat.base === 300 && beat.relics === 3 && beat.beaten.length === 1, beat);
    await throughResult(p);
    ok(W + ' 결과 화면에 격파 표시', await p.evaluate(() => !!document.querySelector('#overlayBox .boss-beaten')));
    await p.evaluate(() => { hideOverlay(); });

    // ── 효과 (엔진 값으로) ──
    const fx = await p.evaluate(() => {
      const out = {};
      const setBoss = id => { run.bossPlan[run.round] = id; startBossWeek(); };
      Fx.skipQueue();
      run.phase = 'premarket'; run.ap = 9;
      // 공매도 금지
      setBoss('shortBan'); run.hand = ['short', 'stk_semi'].map(newCard);
      out.short = checkPlay(0, null); out.stockOk = checkPlay(1, null);
      // 거래정지
      setBoss('delistReview'); out.halt = run.haltStock;
      run.hand = ['stk_' + run.haltStock, 'stk_semi'].map(newCard);
      out.haltCard = checkPlay(0, null); out.otherCard = checkPlay(1, null);
      const hp = openPosition(run.haltStock, 1000, 1, 1, true), price0 = assets[run.haltStock].price;
      run.phase = 'premarket'; startMarket(); for(let i = 0; i < 5; i++) tick();
      out.frozen = assets[run.haltStock].price === price0; out.cantSell = !canSell(hp);
      renderAll();
      const row = quoteRowEl(run.haltStock);
      out.haltRow = row ? [row.classList.contains('halted'), row.querySelector('.q-chg').textContent.startsWith('停')] : null;
      run.positions = []; while(run.phase === 'market') tick();
      // 빅스텝
      setBoss('bigStep'); run.overdraft = 1000; out.interest3 = dailyInterest(); run.boss = ''; out.interest1 = dailyInterest(); run.overdraft = 0;
      // 증거금 상향
      const lp = openPosition('semi', 1000, 3, 1, true); out.maint0 = maintRatio(lp); setBoss('marginHike'); out.maint1 = maintRatio(lp); run.positions = [];
      // 금감원 단속
      run.fss = 0; setBoss('fssCrackdown'); raiseFss(10); out.fss = run.fss; run.fss = 0;
      // 찌라시 폭탄
      setBoss('tipBomb'); out.tipMult = bossMod('tipChanceMult', 1); /* tipChance는 이 테스트가 0으로 바꿔 둠 */ out.tipMax = bossMod('tipMaxPerDay', TIP_MAX_PER_DAY);
      // 거래세
      setBoss('tradeTax'); const tp = openPosition('semi', 1000, 1, 1, true); const cash0 = run.cash, eq0 = posEquity(tp), exp0 = exposure(tp);
      closePosition(tp, 0); out.tax = Math.round((eq0 - (run.cash - cash0)) * 100) / 100; out.taxWant = Math.round(exp0 * 0.01 * 100) / 100;
      // 개미 털기
      setBoss('antShakeout'); out.gapMult = bossGapMult(); rollSignals(); out.acc = run.signals.semi.acc;
      // 목표 상향 조정: 목표 = max(원래 목표, 주 시작 순자산 × 2)
      const ps = [openPosition('semi', 1000, 1, 1, true)];
      run.boss = ''; out.t0 = currentTarget(); run.weekStart.equity = ROUND_TARGETS[run.round - 1] * 10;
      setBoss('multCap'); out.t1 = currentTarget(); out.tWant = run.weekStart.equity * 2; run.boss = ''; out.t2 = currentTarget();
      // 더하기 봉인
      run.relics = []; gainRelic('dopamine', 't'); gainRelic('seal', 't'); run.combo.up = 5; ps[0].daysHeld = 9;
      run.boss = ''; out.addOn = settleSteps(ps[0], 100).steps.map(s => s.source).join();
      setBoss('addSeal'); out.addOff = settleSteps(ps[0], 100).steps.map(s => s.source).join();
      run.positions = []; run.relics = []; run.boss = '';
      return out;
    });
    ok(W + ' 공매도 금지: 공매도 카드 거절, 종목 카드는 됨', fx.short === 'boss' && fx.stockOk === null, fx);
    ok(W + ' 상장폐지 심사: 최고 베타 종목 거래정지 — 카드 거절 · 가격 고정 · 매도 불가 · 시세 停', fx.halt === 'meme' && fx.haltCard === 'boss' && fx.otherCard === null && fx.frozen && fx.cantSell && fx.haltRow && fx.haltRow[0] && fx.haltRow[1], fx);
    ok(W + ' 빅스텝 이자 ×3', Math.abs(fx.interest3 - fx.interest1 * 3) < 1e-6 && fx.interest1 > 0);
    ok(W + ' 증거금 상향 +20%p', Math.abs(fx.maint1 - fx.maint0 - 0.2) < 1e-9, [fx.maint0, fx.maint1]);
    ok(W + ' 금감원 특별 단속 ×2', fx.fss === 20, fx.fss);
    ok(W + ' 찌라시 폭탄 ×3 · 하루 4개', fx.tipMult === 3 && fx.tipMax === 4, [fx.tipMult, fx.tipMax]);
    ok(W + ' 거래세 1%', fx.tax === fx.taxWant && fx.tax > 0, [fx.tax, fx.taxWant]);
    ok(W + ' 개미 털기: 갭 ×2 · 시그널 50%', fx.gapMult === 2 && Math.abs(fx.acc - 0.5) < 1e-9, [fx.gapMult, fx.acc]);
    ok(W + ' 목표 상향 조정: 주 시작 순자산 ×2 (보스 없으면 원래 목표)', fx.t1 === fx.tWant && fx.t2 === fx.t0, [fx.t0, fx.t1, fx.t2]);
    ok(W + ' 더하기 봉인: 도파민(+) 사라지고 인장(×)은 남음', /dopamine/.test(fx.addOn) && !/dopamine/.test(fx.addOff) && /seal/.test(fx.addOff), [fx.addOn, fx.addOff]);


    // 세무조사: 주말 결산 통과 → 목표 초과분 50% 추징 + 결과 화면
    const au = await p.evaluate(`(() => { Fx.skipQueue(); hideOverlay(); run.phase = 'premarket'; run.bossPlan[run.round] = 'taxAudit'; startBossWeek(); run.positions = []; run.day = 1; startDay(); ${CLEAR_BODY}
      return { phase: run.phase, tax: run.lastWeek.auditTax, want: (run.lastWeek.eq - run.lastWeek.target) * 0.5 }; })()`);
    ok(W + ' 세무조사: 결산 통과 시 목표 초과분 50% 추징', au.phase === 'reward' && au.tax > 0 && Math.abs(au.tax - au.want) < 1e-6, au);
    await throughResult(p);
    ok(W + ' 결과 화면에 추징 표시', await p.evaluate(() => /세무조사 추징/.test($('overlayBox').textContent)));
    await p.evaluate(() => { hideOverlay(); chooseReward('skip'); chooseRelicReward(''); leaveShop(); Fx.skipQueue(); });
    // 최종 보스
    const fin = await p.evaluate(() => {
      const out = {};
      run.phase = 'premarket'; run.day = 1; run.positions = [];
      run.bossPlan[run.round] = 'blackMonday'; startBossWeek();
      const before = STOCKS.map(s => assets[s.id].price);
      startMarket(); out.state = marketState;
      out.moves = STOCKS.map((s, i) => [s.beta > 0, assets[s.id].price / before[i] - 1]);
      out.gap = bossGapMult();
      while(run.phase === 'market') tick();
      run.bossPlan[run.round] = 'bubblePeak'; startBossWeek(); run.day = 2; startDay();
      startMarket(); out.bubble2 = run.forcedState; while(run.phase === 'market') tick();
      run.day = 4; startDay(); startMarket(); out.bubble4 = [run.forcedState, bossGapMult()]; while(run.phase === 'market') tick();
      return out;
    });
    const crashOk = fin.moves.every(([up, m]) => up ? m < -0.08 : m > 0.08);
    ok(W + ' 블랙 먼데이: 약세장 + 전 종목 −12%(인버스 +) + 갭 ×1.5', fin.state === 'BEAR' && crashOk && fin.gap === 1.5, fin);
    ok(W + ' 버블의 정점: 화 강세장 → 목 약세장 + 갭 ×2', fin.bubble2 === 'BULL' && fin.bubble4[0] === 'BEAR' && fin.bubble4[1] === 2, fin);

    // 보스 주 파산 → 사인 기록
    await p.evaluate(() => { Fx.skipQueue(); hideOverlay(); run.bossPlan[run.round] = 'marginHike'; startBossWeek(); run.phase = 'premarket'; run.day = 2; startDay(); run.cash = -1; checkBankruptcy(); });
    await p.waitForFunction(() => overlayOpen && !!document.querySelector('.ending-title'), null, { timeout: 8000 }).catch(() => {});
    const over = await p.evaluate(() => [run.endBoss, (document.querySelector('.ending-boss') || {}).textContent || '', loadRecords().history[0].boss]);
    ok(W + ' 보스 주 파산 → 게임오버 사인 + 파산 기록', over[0] === 'marginHike' && over[1].includes('증거금 상향') && over[2] === 'marginHike', over);
    await p.screenshot({ path: `${S}/boss-over-${W}.png` });
    // 도감 보스 필터
    await p.evaluate(() => { hideOverlay(); switchTab('collection'); });
    await (await p.evaluate(s => window.revealPaged ? revealPaged(s) : true, '#collectionFilter [data-rarity="boss"]'), p.locator('#collectionFilter [data-rarity="boss"]')).click(); await sleep(150);
    ok(W + ' 도감 👹 보스: 전부 (최종 2 · 정산 카운터 3 · 빌드 카운터는 플래그 켬일 때 4)', await p.evaluate(() => [document.querySelectorAll('#collectionBox .boss-tile').length, document.querySelectorAll('#collectionBox .boss-tile.final').length, document.querySelectorAll('#collectionBox .boss-tile.counter').length, document.querySelectorAll('#collectionBox .boss-tile.build').length].join() === [BOSSES.length, 2, 3, BOSS_COUNTERS_ON ? 4 : 0].join()));
    await p.screenshot({ path: `${S}/boss-collection-${W}.png` });
    await p.evaluate(() => switchTab('records'));
    ok(W + ' 파산 기록 목록에 사인', await p.evaluate(() => /사인: 📈 증거금 상향/.test($('recordsBox').textContent)));
    await p.close();
  }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
function BOSS_NAME_PLACEHOLDER(id){ return { shortBan: '공매도 전면 금지', bigStep: '빅스텝', delistReview: '상장폐지 심사', marginHike: '증거금 상향', fssCrackdown: '금감원 특별 단속', tipBomb: '찌라시 폭탄', tradeTax: '거래세 인상', antShakeout: '개미 털기', multCap: '목표 상향 조정', addSeal: '더하기 봉인', taxAudit: '국세청 세무조사', posCap: '포지션 한도 규제', levCap: '레버리지 규제', streakReset: '기록 리셋', seize: '유물 압류' }[id] || '?'; }
