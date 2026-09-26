const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, info) => { results.push([cond ? 'PASS' : 'FAIL', name, info === undefined ? '' : info]); };

// 한 주 결산 직전 상태를 만든다: 유물·포지션을 깔고 마지막 날 장을 마감한다
async function setupWeek(page, opt){
  return page.evaluate(opt => {
    window.tipChance = () => 0;
    if(opt.seed) setSeed(opt.seed);
    startRun();
    (opt.relics || []).forEach(id => gainRelic(id, 'test'));
    run.cash += opt.extraCash || 0;
    (opt.buys || []).forEach(b => {
      const p = openPosition(b.id, b.amt, b.lev || 1, b.dir || 1, true);
      p.daysHeld = b.days || 0;
      if(b.diamond) p.diamond = true;
    });
    run.day = opt.day || DAYS_PER_ROUND;
    startMarket();
    Object.keys(opt.move || {}).forEach(id => { assets[id].price *= opt.move[id]; });
    const before = { cash: run.cash, realized: run.realized, liq: run.liquidations };
    endOfDay();   // 5일째 장 마감 → 주간 결산 (엔진 그대로)
    renderAll();
    const w = run.lastWeek;
    return { phase: run.phase, before, w: { eq: w.eq, unrealized: w.unrealized, diamondBonus: w.diamondBonus, target: w.target },
             chain: w.settlementChain.map(c => ({ name: c.posName, steps: c.steps.map(s => s.label + ':' + s.kind + ':' + s.value.toFixed(3)), finalPnl: c.finalPnl })),
             netEq: netEquity(), cash: run.cash, realized: run.realized };
  }, opt);
}
// 결산 결과에서 멈춘 뒤 '▶ 다음' (0.5초 가드 뒤)
const passNext = async page => { for(let i = 0; i < 60 && !(await page.evaluate(() => !!chainHold)); i++) await sleep(100); await sleep(560); await page.locator('[data-act="chainNext"]').click(); await sleep(150); };
const fmtSigned = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString() + '만';
const fmtMoney = v => '₩ ' + Math.round(v).toLocaleString() + '만';

(async () => {
  const b = await chromium.launch(); const errs = [];
  for(const [W, H] of [[1920, 1080], [1366, 768]]){
    const page = await b.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => errs.push(W + ': ' + e.message));
    await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
    await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
    await page.reload(); await page.keyboard.press('Shift');
    await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(200);

    // 1) 유물 3개 + 다이아몬드: 체인 재생, 숫자 일치
    const s1 = await setupWeek(page, { seed: 7, relics: ['seal', 'theme', 'gukbap'], extraCash: 3000,
      buys: [{ id: 'meme', amt: 600, days: 4 }, { id: 'semi', amt: 1000, days: 4, diamond: true }, { id: 'gukbap', amt: 800, days: 1 }],
      move: { meme: 1.25, semi: 1.06, gukbap: 0.9 } });
    console.log(W, 'chain', JSON.stringify(s1.chain));
    ok(W + ' 결산 통과 → reward', s1.phase === 'reward');
    await sleep(900);
    ok(W + ' 체인 재생 시작', await page.locator('#chainList').count() === 1);
    if(W === 1920) await page.screenshot({ path: S + '/chain-mid.png' });
    // 끝까지 기다렸다가 최종 숫자 비교 (칩이 다 떨어진 뒤)
    const rowsN = s1.chain.length;
    let snap = null;
    for(let i = 0; i < 60; i++){ await sleep(150);
      snap = await page.evaluate(() => $('chainList') ? { totals: [...document.querySelectorAll('#chainList .chain-row')].map(r => [r.querySelector('.chain-name').textContent, r.querySelector('.chain-total').textContent, [...r.querySelectorAll('.chain-chip')].map(c => c.textContent), !!r.querySelector('.chain-stamp')]), sum: (document.querySelector('.chain-sum:not(.pending)') || {}).textContent } : null);
      if(snap && snap.sum) break; }
    if(W === 1920) await page.screenshot({ path: S + '/chain-end.png' });
    console.log(W, 'shown', JSON.stringify(snap));
    const byName = {}; s1.chain.forEach(c => { byName[c.name] = c; });
    ok(W + ' 행 수 = 포지션 수', snap.totals.length === rowsN, snap.totals.length + '/' + rowsN);
    snap.totals.forEach(([nm, tot, chips, stamp]) => {
      const c = s1.chain.find(x => nm.startsWith(x.name));
      ok(W + ` ${nm} 최종 숫자 = 엔진 finalPnl`, tot === fmtSigned(c.finalPnl), tot + ' vs ' + fmtSigned(c.finalPnl));
      ok(W + ` ${nm} 칩 수 = 보정 단계 수`, chips.length === c.steps.length - 1, chips.join(' | '));
      ok(W + ` ${nm} 스탬프 (보정 있을 때만)`, stamp === (c.steps.length > 1));
    });
    ok(W + ' 정산 합계 = 평가손익 + 다이아 보너스', snap.sum.endsWith(fmtSigned(s1.w.unrealized + s1.w.diamondBonus)), snap.sum);
    await passNext(page);
    const res = await page.evaluate(() => ({ hero: (document.querySelector('.result-hero') || {}).textContent, cash: run.cash, realized: run.realized, eq: netEquity(), liq: run.liquidations }));
    ok(W + ' 연출 끝 → 결산 요약 화면', !!res.hero, res.hero);
    ok(W + ' 결산 화면 순자산 = 실제 순자산', res.hero === fmtMoney(res.eq) && Math.abs(res.eq - s1.w.eq) < 1e-6, res.hero + ' / ' + fmtMoney(s1.w.eq));
    ok(W + ' 연출 전후 cash·realized·반대매매 불변', res.cash === s1.cash && res.realized === s1.realized && res.liq === s1.before.liq);
    if(W === 1920) await page.screenshot({ path: S + '/chain-result.png' });

    // 2) 클릭 스킵 + 연타 방지
    await setupWeek(page, { seed: 8, relics: ['seal', 'theme'], extraCash: 3000, buys: [{ id: 'meme', amt: 600, days: 4 }, { id: 'sc', amt: 800, days: 4 }], move: { meme: 1.2, sc: 1.2 } });
    await sleep(500);
    ok(W + ' 스킵 전 체인 재생 중', await page.evaluate(() => !!chainPlay));
    await page.mouse.click(W / 2, H / 2);
    await page.mouse.click(W / 2, H / 2);   // 연타: 결산 화면 버튼이 눌리면 안 된다
    const sk = await page.evaluate(() => ({ playing: !!chainPlay, hold: !!chainHold, hero: !!document.querySelector('.result-hero'), reward: !!document.querySelector('[data-reward]') }));
    ok(W + ' 클릭 → 최종 결과에서 멈춤 (연타해도 안 넘어감)', !sk.playing && sk.hold && !sk.hero && !sk.reward, JSON.stringify(sk));
    await passNext(page);

    // 3) SPACE 스킵
    await setupWeek(page, { seed: 9, relics: ['seal', 'theme'], extraCash: 3000, buys: [{ id: 'meme', amt: 600, days: 4 }], move: { meme: 1.2 } });
    await sleep(400);
    await page.keyboard.press('Space');
    const sp = await page.evaluate(() => ({ playing: !!chainPlay, hold: !!chainHold }));
    ok(W + ' SPACE → 최종 결과에서 멈춤', !sp.playing && sp.hold);
    await passNext(page);

    // 4) 보정 없는 주 → 체인 없이 바로 결산 화면
    await setupWeek(page, { seed: 10, extraCash: 3000, buys: [{ id: 'semi', amt: 1000, days: 4 }], move: { semi: 1.05 } });
    await passNext(page);
    const np = await page.evaluate(() => ({ playing: !!chainPlay, hero: !!document.querySelector('.result-hero') }));
    ok(W + ' 보정 없음 → 요약 + ▶ 다음 → 결산 화면', !np.playing && np.hero);

    // 5) 포지션 5개 → 상위 3개 + 요약 한 줄
    const s5 = await setupWeek(page, { seed: 11, relics: ['seal', 'theme', 'gukbap'], extraCash: 6000,
      buys: [{ id: 'meme', amt: 300, days: 4 }, { id: 'sc', amt: 800, days: 4 }, { id: 'semi', amt: 1000, days: 4 }, { id: 'gukbap', amt: 800, days: 4 }, { id: 'coin', amt: 1500, days: 4 }],
      move: { meme: 1.3, sc: 1.3, semi: 1.02, gukbap: 0.95, coin: 1.1 } });
    await page.keyboard.press('Space'); // 재생이 느리니 끝 화면 구조는 끝까지 기다려 확인
    await setupWeek(page, { seed: 11, relics: ['seal', 'theme', 'gukbap'], extraCash: 6000,
      buys: [{ id: 'meme', amt: 300, days: 4 }, { id: 'sc', amt: 800, days: 4 }, { id: 'semi', amt: 1000, days: 4 }, { id: 'gukbap', amt: 800, days: 4 }, { id: 'coin', amt: 1500, days: 4 }],
      move: { meme: 1.3, sc: 1.3, semi: 1.02, gukbap: 0.95, coin: 1.1 } });
    let s5snap = null;
    for(let i = 0; i < 80; i++){ await sleep(150); s5snap = await page.evaluate(() => $('chainList') ? { rows: [...document.querySelectorAll('#chainList .chain-row:not(.pending) .chain-name')].map(e => e.textContent), rest: (document.querySelector('.chain-rest:not(.pending)') || {}).textContent } : null); if(s5snap && s5snap.rest) break; }
    const top3 = s5.chain.slice().sort((a, c) => Math.abs(c.finalPnl) - Math.abs(a.finalPnl)).slice(0, 3).map(c => c.name);
    ok(W + ' 5개 → 재생 3행', s5snap.rows.length === 3 && s5snap.rows.every((r, i) => r.startsWith(top3[i])), s5snap.rows.join(', ') + ' / top3 ' + top3.join(','));
    ok(W + ' 나머지 요약 한 줄', /외 포지션 2개/.test(s5snap.rest || ''), s5snap.rest);
    if(W === 1920) await page.screenshot({ path: S + '/chain-top3.png' });
    await page.keyboard.press('Space');

    // 6) 설정 off → 바로 결산 화면
    await page.evaluate(() => { settings.chainFx = false; });
    await setupWeek(page, { seed: 12, relics: ['seal', 'theme'], extraCash: 3000, buys: [{ id: 'meme', amt: 600, days: 4 }], move: { meme: 1.2 } });
    await passNext(page);
    const off = await page.evaluate(() => ({ playing: !!chainPlay, hero: !!document.querySelector('.result-hero') }));
    ok(W + ' 설정 off → 요약 + ▶ 다음 → 결산 화면', !off.playing && off.hero);
    await page.evaluate(() => { settings.chainFx = true; });

    // 7) 목표 미달 → 게임오버 화면, 체인 없음
    const s7 = await setupWeek(page, { seed: 13, relics: ['seal', 'theme'], extraCash: -2000, buys: [{ id: 'meme', amt: 600, days: 4 }], move: { meme: 1.2 } });
    const mo = await page.evaluate(() => ({ playing: !!chainPlay, over: !!document.querySelector('.ending-title'), phase: run.phase }));
    ok(W + ' 목표 미달 → 체인 없이 게임오버', s7.phase === 'over' && !mo.playing && mo.over, JSON.stringify(mo));

    // 8) 졸업(8주차 통과) → 체인 → 엔딩 화면
    await page.evaluate(() => { window.tipChance = () => 0; startRun(); run.round = MAX_ROUND; markWeekStart(); });
    const s8 = await page.evaluate(() => { gainRelic('seal','t'); gainRelic('theme','t'); run.cash += 20000;
      const p = openPosition('meme', 600, 1, 1, true); p.daysHeld = 4; run.day = DAYS_PER_ROUND; startMarket(); assets.meme.price *= 1.2; endOfDay(); renderAll();
      return { phase: run.phase, reason: run.endReason, playing: !!chainPlay }; });
    ok(W + ' 졸업 → 체인 재생', s8.reason === 'VICTORY' && s8.playing, JSON.stringify(s8));
    await page.keyboard.press('Space');
    await passNext(page);
    ok(W + ' 졸업 체인 스킵 → ▶ 다음 → 엔딩 화면', await page.evaluate(() => (document.querySelector('.ending-title') || {}).dataset?.cause === 'VICTORY'));
    await page.close();
  }
  results.forEach(r => console.log(r.join('  ')));
  console.log('FAIL', results.filter(r => r[0] === 'FAIL').length, '/', results.length, 'errors', errs);
  await b.close();
})();
