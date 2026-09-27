// S7-20 세력 매집: 긴 아래꼬리 + UP·FLAT → 찌라시 '세력 매집 포착' (표시 확률 = 엔진 accumUpChance), 내일 UP 보너스, 일반 찌라시 추첨에서 제외
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
    await p.click('#startBtn'); await sleep(460);
    const r = await p.evaluate(() => {
      window.tipChance = () => 1; clearToasts(); startMarket();   // 찌라시 켬 (세력 매집은 tipChance 0이면 안 뜬다)
      STOCKS.forEach(s => { assets[s.id].accumBonus = 0; if(assets[s.id].regime) assets[s.id].regime = 'DOWN'; });   // 다른 종목은 조건 밖
      const a = assets.semi; a.regime = 'FLAT';
      a.candles.push({ open: 100, close: 101, high: 102, low: 90, gap: 0 });   // 몸통 1, 아래꼬리 10
      const mr = Math.random; Math.random = () => 0;   // 엔진 rand() (시드 없음) → 발동 확률 판정 통과
      const opened = maybeAccumTip(); Math.random = mr;
      renderAll();
      return { opened, tip: run.pendingTip, bonus: a.accumBonus, shown: accumUpChance('semi'), base: REGIME_TRANSITION.FLAT.find(o => o.state === 'UP').chance };
    });
    ok(W + ' 긴 아래꼬리 + FLAT → 세력 매집 찌라시', r.opened && r.tip.eventId === 'accum' && r.tip.stockId === 'semi' && r.bonus > 0, r);
    ok(W + ' 표시 확률 = 기본 UP(20%) + 보너스(35%p) = 55%', Math.abs(r.shown - 0.55) < 1e-9, r);
    await sleep(300);
    const txt = await p.evaluate(() => $('overlayBox').textContent);
    ok(W + ' 찌라시 본문에 종목명·확률(55%)', /세력 매집 포착: 반도체전자/.test(txt) && /55%/.test(txt), txt.slice(0, 120));
    await p.screenshot({ path: `${S}/accum-${W}.png` });
    await p.evaluate(() => chooseTip(1)); await sleep(200);
    const nx = await p.evaluate(() => { const row = transitionRow(assets.semi); return row.find(o => o.state === 'UP').chance; });
    ok(W + ' 내일 전이표 UP = 표시 확률', Math.abs(nx - 0.55) < 1e-9, nx);
    ok(W + ' 일반 찌라시 추첨에서 제외 (special)', await p.evaluate(() => TIP_BY_ID.accum.special === true));
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
