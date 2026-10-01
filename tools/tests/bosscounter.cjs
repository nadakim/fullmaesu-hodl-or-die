// 빌드 카운터 보스 4종: 일정 보장(한 판에 최소 1개) · 포지션 한도 규제(새 포지션 차단·합치는 매수 허용·분할/공모주 차단·풀매수 건너뜀·사유 툴팁) ·
// 레버리지 규제(신용·영끌 → 2x·레버리지 ETF 2x까지·가진 포지션 그대로·툴팁) · 기록 리셋(주 시작·장 마감 보유 일수·연속 상승 0) ·
// 유물 압류(1번 칸 정산 무효·재방송·몰아주기·순서 바꾸면 풀림·칸 표시) · 경보·배지·예고·도감 표적/대비책 (1920·1366·1280×800)
// 기본값은 꺼짐(보류) → 이 테스트는 engine.js를 받아 올 때 BOSS_COUNTERS_ON만 true로 바꿔 켠 상태의 회귀를 본다. 끝에 기본 상태(꺼짐 = 보스 13종·보장 없음)도 확인
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[1280,800]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/engine.js', async route => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace(/const BOSS_COUNTERS_ON\s*=\s*false;/, 'const BOSS_COUNTERS_ON = true;') }); });
    await p.goto((process.env.TEST_BASE || 'http://127.0.0.1:8765') + '/demo.html'); await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    await p.evaluate(() => { window.tipChance = () => 0; settings.chainFx = false; });   // 장 마감 정산 무대는 이 테스트 밖 (daystage·plainstage)

    // ── 일정: 빌드 카운터 4종 · 한 판에 최소 BOSS_COUNTER_MIN개 (시드 60개) ──
    const plan = await p.evaluate(() => {
      const keep = run, counts = {};
      const ids = BOSSES.filter(b => b.build).map(b => b.id);
      for(let s = 1; s <= 60; s++){ setSeed(s); startNewRun({ unlockWeek: 8 }); const n = BOSS_WEEK_ROUNDS.filter(r => BOSS_BY_ID[run.bossPlan[r]].build).length; counts[n] = (counts[n] || 0) + 1; }
      setSeed(null); run = keep;
      return { ids, counts, min: BOSS_COUNTER_MIN, flag: BOSS_COUNTERS_ON, answersInPool: BOSSES.filter(b => b.build).every(b => b.answers.relics.every(id => RELIC_BY_ID[id]) && b.answers.cards.every(id => CARD_BY_ID[id])) };
    });
    ok(W + ' 빌드 카운터 4종 · 판마다 최소 1개 (시드 60) · 대비책 유물·카드가 게임에 있음', plan.flag && plan.ids.join() === 'posCap,levCap,streakReset,seize' && !plan.counts[0] && plan.answersInPool, plan);

    // ── 포지션 한도 규제 ──
    const cap = await p.evaluate(() => {
      const out = {};
      const setBoss = id => { run.bossPlan[run.round] = id; startBossWeek(); };
      Fx.skipQueue(); hideOverlay();
      run.phase = 'premarket'; run.ap = 20; run.cash = 1e6; run.positions = []; resetPending();
      setBoss('posCap');
      ['semi', 'ev', 'bio'].forEach(id => openPosition(id, 1000, 1, 1, true));
      run.hand = ['stk_game', 'stk_semi', 'split', 'ipo', 'hedge', 'avgDown'].map(newCard);
      out.newStock = checkPlay(0, null); out.sameStock = checkPlay(1, null);
      out.split = checkPlay(2, run.positions[0].id); out.ipo = checkPlay(3, null);
      out.n = run.positions.length;
      run.positions.pop();   // 2개면 분할(2개로)·새 종목 가능
      out.split2 = checkPlay(2, run.positions[0].id); out.newStock2 = checkPlay(0, null);
      openPosition('bio', 1000, 1, 1, true);
      // 풀매수: 한도를 넘기는 종목은 손패에 남긴다, 합쳐지는 종목은 산다
      run.hand = ['fullBuy', 'stk_game', 'stk_semi'].map(newCard);
      playCard(0, null);
      out.fullBuy = { positions: run.positions.length, left: run.hand.map(c => c.id).join() };
      out.merged = run.positions.find(p => p.assetId === 'semi').principal > 1000;
      out.boss = run.boss;
      return out;
    });
    ok(W + ' 한도 규제: 3개면 새 종목·분할·공모주 거절, 가진 종목 추가 매수는 됨', cap.newStock === 'boss' && cap.sameStock === null && cap.split === 'boss' && cap.ipo === 'boss' && cap.n === 3, cap);
    ok(W + ' 한도 규제: 2개면 새 종목·분할(→3개) 가능', cap.split2 === null && cap.newStock2 === null, cap);
    ok(W + ' 한도 규제: 풀매수는 합쳐지는 종목만 사고 나머지는 손패에', cap.fullBuy.positions === 3 && cap.fullBuy.left === 'stk_game' && cap.merged, cap.fullBuy);
    // 사유 툴팁 + 거절 알림
    await p.evaluate(() => { run.hand = ['stk_game', 'stk_semi'].map(newCard); handSig = ''; renderAll(); });
    await sleep(200);
    const blockedCls = await p.evaluate(() => { const el = document.querySelector('#handBox [data-idx="0"]'); return [el.classList.contains('disabled'), el.classList.contains('boss-blocked'), document.querySelector('#handBox [data-idx="1"]').classList.contains('boss-blocked')]; });
    const tipTxt = await p.evaluate(() => { showCardTip(document.querySelector('#handBox [data-idx="0"]')); return document.querySelector('.card-tip').hidden ? '' : document.querySelector('.card-tip').textContent; });
    ok(W + ' 막힌 손패 카드: 흐림 + 툴팁에 🛑 사유 (합쳐지는 카드는 정상)', blockedCls[0] && blockedCls[1] && !blockedCls[2] && /🛑 🚧 포지션 한도 규제 — 포지션 3개까지만/.test(tipTxt), { blockedCls, tipTxt: tipTxt.slice(-80) });
    if(W === 1920) await p.screenshot({ path: `${S}/bosscounter-poscap-tip-${W}.png` });
    await p.evaluate(() => { hideCardTip(); clearToasts(); playCard(0, null); });
    await sleep(150);
    ok(W + ' 거절 알림도 같은 사유', await p.evaluate(() => /포지션 한도 규제/.test($('toastLayer').textContent)));

    // ── 레버리지 규제 ──
    const lev = await p.evaluate(() => {
      const out = {};
      run.positions = []; resetPending(); run.cash = 1e6; run.ap = 20;
      const old = openPosition('meme', 1000, 3, 1, true);   // 보스 전에 산 3x
      run.bossPlan[run.round] = 'levCap'; startBossWeek();
      out.oldLev = old.lev;
      run.hand = ['credit', 'stk_semi', 'yolo', 'stk_ev', 'levEtf'].map(newCard);
      const play = id => playCard(run.hand.findIndex(c => c.id === id), null);
      play('credit'); out.pending = run.pending.lev; out.previewLev = hypotheticalBuy('semi').lev;
      play('stk_semi'); out.credit = run.positions.find(p => p.assetId === 'semi').lev;
      play('yolo'); out.previewYolo = hypotheticalBuy('ev').lev; play('stk_ev');
      out.yolo = run.positions.find(p => p.assetId === 'ev').lev;
      const one = openPosition('bio', 1000, 1, 1, true), two = run.positions.find(p => p.assetId === 'semi');
      const i = run.hand.findIndex(c => c.id === 'levEtf');
      out.etf1 = checkPlay(i, one.id); out.etf2 = checkPlay(i, two.id); out.etfOld = checkPlay(i, old.id);
      out.oldLevAfter = old.lev;
      return out;
    });
    ok(W + ' 레버리지 규제: 신용 2x 그대로 · 영끌 3x → 2x · 미리보기도 2x', lev.credit === 2 && lev.yolo === 2 && lev.previewLev === 2 && lev.previewYolo === 2, lev);
    ok(W + ' 레버리지 규제: 레버리지 ETF는 1x → 2x만 (2x·3x 포지션엔 거절) · 가진 3x는 그대로', lev.etf1 === null && lev.etf2 === 'boss' && lev.etfOld === 'boss' && lev.oldLevAfter === 3, lev);
    await p.evaluate(() => { run.hand = ['yolo', 'stk_semi', 'levEtf'].map(newCard); playCard(0, null); handSig = ''; renderAll(); });
    const levTip = await p.evaluate(() => { showCardTip(document.querySelector('#handBox [data-idx="0"]')); const t = document.querySelector('.card-tip').textContent; hideCardTip(); return t; });
    ok(W + ' 레버리지 규제: 종목 카드 툴팁 "3x 대신 2x로 산다"', /3x 대신 2x로 산다/.test(levTip), levTip.slice(-60));

    // ── 기록 리셋 ──
    const sr = await p.evaluate(() => {
      const out = {};
      run.positions = []; resetPending(); run.relics = []; run.boss = '';
      const pos = openPosition('semi', 1000, 1, 1, true); pos.daysHeld = 5; pos.upStreak = 3;
      gainRelic('oath', 't');
      out.before = settleSteps(pos, 100).steps.map(s => s.source).join();
      run.bossPlan[run.round] = 'streakReset'; startBossWeek();
      out.atStart = [pos.daysHeld, pos.upStreak];
      out.after = settleSteps(pos, 100).steps.map(s => s.source).join();
      run.day = 1; run.phase = 'premarket'; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); }
      out.afterClose = [pos.daysHeld, pos.upStreak];
      run.relics = [];
      return out;
    });
    ok(W + ' 기록 리셋: 주 시작·장 마감마다 보유 일수·연속 상승 0 → 존버 서약서 발동 안 함', /oath/.test(sr.before) && !/oath/.test(sr.after) && sr.atStart.join() === '0,0' && sr.afterClose.join() === '0,0', sr);

    // ── 유물 압류 ──
    const sz = await p.evaluate(() => {
      const out = {};
      Fx.skipQueue(); hideOverlay();
      run.phase = 'premarket'; run.day = 2; run.positions = []; resetPending(); run.boss = ''; run.relics = [];
      const pos = openPosition('semi', 1000, 1, 1, true); pos.daysHeld = 9;
      ['antFlag', 'seal', 'rerun'].forEach(id => gainRelic(id, 't'));
      const src = () => settleSteps(pos, 100).steps.map(s => s.source).join();
      out.off = src();
      run.bossPlan[run.round] = 'seize'; startBossWeek();
      out.on = src();
      moveRelic(1, 0);   // 인장을 1번 칸으로 → 깃발은 풀린다
      out.moved = src();
      run.relics = []; ['antFlag', 'focus', 'seal'].forEach(id => gainRelic(id, 't'));
      out.focus = settleSteps(pos, 100).steps.filter(s => s.source === 'focus').length;
      run.relics = []; ['focus', 'seal'].forEach(id => gainRelic(id, 't'));
      out.focusSeized = src();
      run.relics = []; ['antFlag', 'seal'].forEach(id => gainRelic(id, 't'));
      out.boss = run.boss;
      return out;
    });
    ok(W + ' 유물 압류: 1번 칸(깃발) 무효 · 재방송이 1번 칸을 복사해도 무효 · 인장은 발동', /antFlag/.test(sz.off) && /rerun/.test(sz.off) && !/antFlag/.test(sz.on) && !/rerun/.test(sz.on) && /seal/.test(sz.on), sz);
    ok(W + ' 유물 압류: 순서를 바꾸면 새 1번 칸이 무효 · 몰아주기가 1번 칸을 반복해도 무효 · 압류된 몰아주기면 오른쪽 칸 살아남', /antFlag/.test(sz.moved) && !/seal/.test(sz.moved) && sz.focus === 0 && /seal/.test(sz.focusSeized), sz);
    await p.evaluate(() => { relicSig = ''; renderAll(); });
    const bar = await p.evaluate(() => { const r = document.querySelectorAll('#relicBar .relic'); return [r[0].classList.contains('seized'), !!r[0].querySelector('.rl-seize'), r[1].classList.contains('seized'), /압류/.test(r[0].title)]; });
    ok(W + ' 유물 압류: 1번 칸에 "압류" 딱지 + 툴팁 (2번 칸은 정상)', bar[0] && bar[1] && !bar[2] && bar[3], bar);
    await p.locator('#relicBar .relic').first().click(); await sleep(150);
    ok(W + ' 유물 압류: 유물 설명에 압류 안내', await p.evaluate(() => /유물 압류/.test($('relicTip').textContent)));
    await p.screenshot({ path: `${S}/bosscounter-seize-${W}.png` });
    await p.evaluate(() => { relicTipId = ''; relicSig = ''; run.relics = []; run.boss = ''; renderAll(); });

    // ── 경보·배지 ──
    await p.evaluate(() => { run.bossPlan[run.round] = 'posCap'; startBossWeek(); renderAll(); });
    await sleep(300);
    const al = await p.evaluate(() => [!!document.querySelector('.boss-alert'), (document.querySelector('.boss-alert .ga-name') || {}).textContent, $('bossChip').textContent, !$('bossChip').hidden, $('bossChip').title]);
    ok(W + ' 보스 주 시작: 중앙 경보 + HUD 배지 (호버 설명)', al[0] && /포지션 한도 규제/.test(al[1]) && /포지션 한도 규제/.test(al[2]) && al[3] && /3개까지만/.test(al[4]), al);
    await p.screenshot({ path: `${S}/bosscounter-alert-${W}.png` });
    await p.keyboard.press('Space'); await sleep(200);

    // ── 예고: 결산 결과에 표적·대비책 ──
    await p.evaluate(() => { Fx.skipQueue(); run.boss = ''; run.positions = []; run.bossPlan[run.round + 1] = 'levCap';
      run.cash += currentTarget() * 1.2; run.day = DAYS_PER_ROUND; run.phase = 'premarket'; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
    for(let i = 0; i < 60 && !(await p.evaluate(() => !!chainHold)); i++) await sleep(100);
    await sleep(560); await p.locator('[data-act="chainNext"]').click(); await sleep(250);
    const note = await p.evaluate(() => { const n = document.querySelector('#overlayBox .boss-notice[data-boss="levCap"]'); return n ? n.textContent : ''; });
    ok(W + ' 결산 예고: 빌드 카운터 + 표적(레버리지 탑·영끌 대출) + 대비책', /빌드 카운터/.test(note) && /표적/.test(note) && /레버리지 탑/.test(note) && /대비책/.test(note) && /개미 군단 깃발/.test(note), note.slice(0, 160));
    await p.screenshot({ path: `${S}/bosscounter-notice-${W}.png` });

    // ── 도감 ──
    await p.evaluate(() => { hideOverlay(); switchTab('collection'); });
    await p.locator('#collectionFilter [data-rarity="boss"]').click(); await sleep(150);
    const col = await p.evaluate(() => [...document.querySelectorAll('#collectionBox .boss-tile.build')].map(t => [t.dataset.boss, t.querySelectorAll('.b-vs').length, /빌드 카운터/.test(t.textContent)]));
    ok(W + ' 도감: 빌드 카운터 4장 · 표적·대비책 줄', col.length === 4 && col.every(c => c[1] === 2 && c[2]), col);
    await p.locator('#collectionBox .boss-tile.build').first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${S}/bosscounter-collection-${W}.png` });
    // 글자 잘림: 도감 타일 안 글자가 타일 밖으로 나가지 않는다
    const overflow = await p.evaluate(() => [...document.querySelectorAll('#collectionBox .boss-tile.build')].filter(t => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1).length);
    ok(W + ' 도감 타일 넘침 없음', overflow === 0, overflow);
    await p.close();
  }
  // 기본 상태 (플래그 꺼짐): 빌드 카운터 없음 · 일정 보장 없음
  { const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto((process.env.TEST_BASE || 'http://127.0.0.1:8765') + '/demo.html');
    const d = await p.evaluate(() => { let c = 0; for(let s = 1; s <= 60; s++){ setSeed(s); startNewRun({ unlockWeek: 8 }); c += BOSS_WEEK_ROUNDS.filter(r => BOSS_BY_ID[run.bossPlan[r]].build).length; } setSeed(null);
      return { flag: BOSS_COUNTERS_ON, n: BOSSES.length, builds: BOSSES.filter(b => b.build).length, planned: c, mult: BOSS_COUNTER_TARGET_MULT, held: BOSS_COUNTER_TARGET_HELD }; });
    ok('기본 상태: BOSS_COUNTERS_ON 꺼짐 · 보스 13종 · 일정에 카운터 없음 · 손잡이 꺼짐', !d.flag && d.n === 13 && d.builds === 0 && d.planned === 0 && d.mult === 0 && !d.held, d);
    await p.close(); }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
