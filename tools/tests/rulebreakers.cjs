// 규칙 파괴형 유물 10종 (RULE_BREAKER_RELICS.md): 유물별 규칙 발동 · 정산 무대 계산식 줄의 유물 이름(칩 cyan·배수 gold) · 찌라시 B 잠금 ·
// 튜너(?tuner=1) 유물 장착 · 플래그 끔(RULE_BREAKER_RELICS_ON=false)이면 10종이 없음
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?tuner=1'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
  await p.click('#startBtn'); await sleep(500);
  // 판마다 새로: 유물·포지션 비우고 시작
  const fresh = () => p.evaluate(() => { window.tipChance = () => 0; setSeed(7); startRun(); clearToasts(); run.relics = []; run.relicState = {}; run.cash = 1e6; renderAll(); });
  const ev = (type) => p.evaluate(t => eventLog.filter(e => e.type === t).map(e => e.data), type);

  // 1) 💎 존버 서약서: 매도 불가 · 장 마감 넘긴 날 n → ×1.5ⁿ
  await fresh();
  const oath = await p.evaluate(() => { gainRelic('oath', 't'); const q = openPosition('semi', 1000, 1, 1, true); q.daysHeld = 2;
    const sold = sellPosition(q.id), st = settleSteps(q, 100).steps.find(x => x.source === 'oath'); return { sold, canSell: canSell(q), v: st && st.value }; });
  ok('💎 존버 서약서: 직접 매도 불가 · 2일 → ×2.25', !oath.sold && !oath.canSell && Math.abs(oath.v - 2.25) < 1e-9, oath);
  // 2) ⚡ 단타 중독: 수익 매도 순간 정산 · 장 마감 보유 포지션은 보너스 없음
  await fresh();
  const sc = await p.evaluate(() => { gainRelic('scalper', 't'); gainRelic('antFlag', 't');
    const q = openPosition('semi', 1000, 1, 1, true), q2 = openPosition('coin', 1000, 1, 1, true);
    assets.semi.price *= 1.1; assets.coin.price *= 1.1;
    const cash0 = run.cash; sellPosition(q.id); const s = eventLog.filter(e => e.type === 'sellSettled').map(e => e.data)[0];
    const plain = settleDay.length >= 0 ? (settleSteps(q2, 50, 0, { noBonus: true }).steps.length) : -1;
    return { s: s && { base: Math.round(s.base), payout: Math.round(s.payout), nth: s.nth, srcs: s.steps.map(x => x.source) }, gain: Math.round(run.cash - cash0), plain }; });
  ok('⚡ 단타 중독: 수익 매도 → 즉시 정산 (단타 +0.5·깃발 ×) · 보유 정산은 보너스 없음', !!sc.s && sc.s.payout > 0 && sc.s.srcs.indexOf('scalper') >= 0 && sc.s.srcs.indexOf('antFlag') >= 0 && sc.plain === 1, sc);
  // 3) 🌊 물타기 장인: 손실 중 추가 매수 → 물 +1, 손실 중 매도 불가, 수익 마감 ×2^물
  await fresh();
  const wa = await p.evaluate(() => { gainRelic('water', 't'); const q = openPosition('semi', 1000, 1, 1, true); assets.semi.price *= 0.9;
    const can = canSell(q); openPosition('semi', 1000, 1, 1, true); const st = settleSteps(q, 100).steps.find(x => x.source === 'water');
    return { water: q.water, can, v: st && st.value }; });
  ok('🌊 물타기 장인: 손실 중 추가 매수 → 물 1 · 손실 중 매도 불가 · ×2', wa.water === 1 && !wa.can && wa.v === 2, wa);
  // 4) 🐜 인간 역지표: 롱 종목 추세 매도세 · 같은 종목 숏 ×3
  await fresh();
  const ct = await p.evaluate(() => { gainRelic('contrarian', 't'); openPosition('semi', 1000, 1, 1, true); const s2 = openPosition('semi', 1000, 1, -1, true);
    nextRegimes(); const st = settleSteps(s2, 100).steps.find(x => x.source === 'contrarian'); return { regime: assets.semi.regime, v: st && st.value }; });
  ok('🐜 인간 역지표: 롱 종목 추세 = 매도세 · 같은 종목 숏 ×5', ct.regime === 'DOWN' && ct.v === 5, ct);
  // 5) 🏦 영끌 대출: 현금 0에서도 매수 · 빚 → 합산 배수 · 주말 이자
  await fresh();
  const ln = await p.evaluate(() => { gainRelic('yoloLoan', 't'); run.cash = 500; openPosition('gukbap', 5000, 1, 1, false); /* 순자산 여유 (장중 급락으로 파산하지 않게) */ run.hand = ['stk_semi'].map(newCard);
    const r = checkPlay(0, undefined, { amount: 1000 }); playCard(0, undefined, { amount: 1000 });
    const q = run.positions.find(x => x.assetId === 'semi'), st = q && settleSteps(q, 100).steps.find(x => x.source === 'yoloLoan'), cashAfter = Math.round(run.cash);
    run.cash = -3000; run.day = DAYS_PER_ROUND; /* 주말 이자 확인: 빚을 확실히 남긴다 (순자산은 국밥제약 5000으로 플러스) */ startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(0); tick(); }
    return { r, cash: cashAfter, max: stockMaxAmount(), mult: st && +st.value.toFixed(3), interest: eventLog.some(e => e.type === 'loanInterest') }; });
  ok('🏦 영끌 대출: 현금보다 큰 매수 → 마이너스 현금 · 빚만큼 합산 배수 · 주말 이자', ln.r === null && ln.mult > 0 && ln.interest, ln);
  await p.evaluate(() => { Fx.skipQueue(); hideOverlay(); });
  // 6) 🧲 몰아주기: 왼쪽 칸 2번 더 · 오른쪽 칸 꺼짐
  await fresh();
  const fo = await p.evaluate(() => { ['antFlag', 'focus', 'seal'].forEach(id => gainRelic(id, 't')); const q = openPosition('semi', 1000, 1, 1, true); q.daysHeld = 5;
    const srcs = settleSteps(q, 100).steps.map(x => x.source); return { flag: srcs.filter(x => x === 'antFlag').length, focus: srcs.filter(x => x === 'focus').length, seal: srcs.indexOf('seal') >= 0 }; });
  ok('🧲 몰아주기: 왼쪽(깃발) 1+2번 · 오른쪽(인장) 꺼짐', fo.flag === 1 && fo.focus === 2 && !fo.seal, fo);
  // 7) 🚂 막차 탑승: 맨 오른쪽 m → m^1.5 · 아니면 ×0.5
  await fresh();
  const lt = await p.evaluate(() => { ['antFlag', 'lastTrain'].forEach(id => gainRelic(id, 't')); openPosition('coin', 1000, 1, 1, true); const q = openPosition('semi', 1000, 1, 1, true);
    const a = settleSteps(q, 100).mult; moveRelic(1, 0); const bb = settleSteps(q, 100).mult; return { a, want: Math.pow(2.25, 1.5), b: bb }; });
  ok('🚂 막차 탑승: 맨 오른쪽 ×2.25 → ×3.375 · 맨 오른쪽 아니면 효과 없음(×2.25)', Math.abs(lt.a - lt.want) < 1e-9 && Math.abs(lt.b - 2.25) < 1e-9, lt);
  // 8) 🕳️ 무소유 투자법: 빈 칸당 ×1.5 · 결산 유물 보상 대신 비자금
  await fresh();
  const cg = await p.evaluate(() => { gainRelic('cashGang', 't'); const q = openPosition('semi', 1000, 1, 1, true); const m = settleSteps(q, 100).mult;
    const slush0 = run.slush; run.cash += 1e6; run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(0); tick(); }
    return { m, want: Math.pow(1.5, 5), phase: run.phase, choices: run.relicChoices.length, slushGain: run.slush - slush0 }; });
  ok('🕳️ 무소유 투자법: 빈 칸 5 → ×7.59 · 유물 보상 없음 · 비자금 +300 포함', Math.abs(cg.m - cg.want) < 1e-9 && cg.phase === 'reward' && cg.choices === 0 && cg.slushGain >= 300, cg);
  await p.evaluate(() => { Fx.skipQueue(); hideOverlay(); });
  // 9) 🙏 풀매수 교주: 다른 종목 차단 · 그 종목 행동력 0 · 추가 매수 k → ×(1+k)
  await fresh();
  const cu = await p.evaluate(() => { gainRelic('cult', 't'); openPosition('semi', 1000, 1, 1, true); run.hand = ['stk_coin', 'stk_semi'].map(newCard); run.ap = 3;
    const rc = checkPlay(0, undefined, { amount: 1000 }), cost = cardCost(CARD_BY_ID.stk_semi); playCard(1, undefined, { amount: 1000 });
    const q = run.positions[0], st = settleSteps(q, 100).steps.find(x => x.source === 'cult'); return { rc, cost, adds: run.week.cultAdds, v: st && st.value, ap: run.ap }; });
  ok('🙏 풀매수 교주: 다른 종목 relicRule · 그 종목 행동력 0 · 추가 매수 1 → ×2', cu.rc === 'relicRule' && cu.cost === 0 && cu.adds === 1 && cu.v === 2 && cu.ap === 3, cu);
  // 10) 🎰 찌라시 확신범: B 잠금(화면·엔진) · 쪽박 뒤집힘 · 대박 절반 · 기대값도 같은 식
  await fresh();
  await p.evaluate(() => { gainRelic('tipBro', 't'); run.day = 1; startMarket(); openTip('fed'); renderAll(); showTipOverlay(); });
  await sleep(200);
  const tb = await p.evaluate(() => { const bBtn = document.querySelector('[data-tip-choice="1"]');
    const flip = tipBroEffect({ kind: 'cash', amount: -300 }, 0, 1), half = tipBroEffect({ kind: 'cash', amount: 300 }, 0, 0), mk = tipBroEffect({ kind: 'market', state: 'BEAR' }, 0, 1);
    const evA = tipExpectedValue(0); const r = resolveTip(1);
    return { disabled: bBtn && bBtn.disabled, flip: flip.amount, half: half.amount, mk: mk.state, evAllUp: evA.outcomes.every(o => o.delta >= 0), choice: r.choiceIdx }; });
  ok('🎰 찌라시 확신범: B 버튼 잠금 · B 눌러도 A · 쪽박 −300 → +300 · 대박 절반 · 약세 → 강세 · 기대값 반영', tb.disabled && tb.flip === 300 && tb.half === 150 && tb.mk === 'BULL' && tb.evAllUp && tb.choice === 0, tb);
  await p.evaluate(() => { Fx.skipQueue(); hideOverlay(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(0); tick(); } });
  // 정산 무대: 규칙 파괴 단계 → 계산식 줄 아래 이름 (배수 = gold)
  await fresh();
  await p.evaluate(() => { stageBest = { run, payout: 1e9 };
    playDayStage({ round: 1, day: 1, payout: 300, settlement: [{ posId: 1, posName: '반도체전자', assetId: 'semi', dir: 1, lev: 1, base: 100, payout: 300,
      steps: [{ label: '오늘 손익', kind: 'base', value: 100, runningChips: 100, runningMult: 1, source: 'base' },
              { label: '🚂 막차 탑승 ×4.00^1.5', kind: 'xmult', value: 2, runningChips: 100, runningMult: 4, source: 'lastTrain' }], sources: [] }] }); });
  await p.waitForFunction(() => stage && stage.hold, null, { timeout: 8000 }).catch(() => {});
  const sr = await p.evaluate(() => { const el = $('sfRule'); return { hidden: el.hidden, text: el.textContent, gold: el.classList.contains('n-mult') }; });
  ok('정산 무대: 규칙 파괴 유물 이름이 계산식 줄 아래 (배수 = gold)', !sr.hidden && sr.text.includes('막차 탑승') && sr.gold, sr);
  await p.screenshot({ path: `${S}/rulebreaker-stage-1920.png` });
  await p.evaluate(() => { stageSkip(); stageSkip(); stage.readyAt = 0; stageNext(); });
  // ⚡ 단타 중독: 결산 보상·암시장 유물 풀에서 제외 (튜너 장착은 된다)
  const pool = await p.evaluate(() => { run.relics = []; let seen = false; for(let k = 0; k < 400; k++){ if(rollRelics(3).indexOf('scalper') >= 0) seen = true; } return { seen, ex: RULE_BREAKER_POOL_EXCLUDE }; });
  ok('⚡ 단타 중독: 유물 풀 제외 (400번 뽑아도 안 나옴)', !pool.seen && pool.ex.indexOf('scalper') >= 0, pool);
  // 튜너: 유물 장착
  await fresh();
  await p.selectOption('#tunerRelic', 'scalper'); await p.click('[data-tn-act="relic"]'); await sleep(200);
  ok('튜너(?tuner=1): 유물 장착 — 풀에서 뺀 단타 중독도 장착된다 (규칙 파괴형이 목록 맨 위)', await p.evaluate(() => hasRelic('scalper') && document.querySelector('#tunerRelic option').textContent.startsWith('⚠')));
  // 플래그 끔
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route('**/engine.js', async route => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('const RULE_BREAKER_RELICS_ON = true', 'const RULE_BREAKER_RELICS_ON = false') }); });
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://127.0.0.1:8765/demo.html'); await p2.keyboard.press('Shift');
  const off = await p2.evaluate(() => ({ flag: RULE_BREAKER_RELICS_ON, n: RELICS.filter(r => r.rule).length, total: RELICS.length }));
  ok('플래그 끔 → 규칙 파괴형 0종 (유물 35종 그대로)', !off.flag && off.n === 0 && off.total === 35, off);
  await ctx.close();
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
