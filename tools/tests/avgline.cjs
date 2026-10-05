// 차트 정리: 메인 차트는 항상 IDX 하나(인버스 병치 없음) · 인버스 해금 = 시세 행 NEW 배지(첫 클릭에 사라짐) + 아래 토스트 1개(클릭·3초) · 해금 전후 차트 영역 픽셀 동일 ·
// 시세 행 클릭 = 큰 차트 창(메인 차트는 그대로) · 큰 차트 평단선(금색 점-선, 태그 '내 평단 … · ±%', 숏/×N, 범위 밖 ▲▼ 태그, 어제 종가 태그)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[1920, 1080], [1280, 800]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } }), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?crt=0&scenario=hand');
    await p.evaluate(() => { localStorage.setItem('hodl.unlockWeek', '2'); localStorage.removeItem('hodl.settings'); localStorage.removeItem('hodl.invNew'); }); await p.reload();
    await p.keyboard.press('Shift'); await sleep(300); await p.click('#startBtn'); await sleep(1500);
    await p.evaluate(() => { Fx.skipQueue(); window.tipChance = () => 0; });
    const pair = () => p.evaluate(() => { const e = document.getElementById('chartPair'); return { n: e.children.length, ids: [...e.children].map(c => c.id), r: e.getBoundingClientRect().toJSON(), inv: !!document.getElementById('invChartBox') || !!document.getElementById('invChart') }; });
    const a = await pair();
    ok(`${W}x${H} 메인 차트 하나(IDX) · 인버스 병치 요소 없음`, a.n === 1 && a.ids[0] === 'chartBox' && !a.inv, a);
    const regionShot = () => p.evaluate(() => { const r = document.getElementById('chartPair').getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) }; }).then(clip => p.screenshot({ clip, animations: 'disabled' }));
    const before = await regionShot();
    await p.evaluate(() => { settings.unlockTips = false; run.unlockBase = 3; emit('systemUnlocked', { round: 3, systems: ['short'], cards: [] }); renderLocks(); renderAll(); Fx.skipQueue(); hideOverlay(); });
    await sleep(300);
    const t = await p.evaluate(() => { const e = document.getElementById('unlockToast'); return { hidden: e.hidden, text: e.textContent, badge: !document.querySelector('.quote-row[data-q="inv"] .q-new').hidden, shown: getComputedStyle(document.querySelector('.quote-row[data-q="inv"]')).display !== 'none' }; });
    ok(`${W}x${H} 해금: 토스트 문구 · NEW 배지 · 인버스 행 보임`, !t.hidden && t.text === '지수 인버스 해금: 시장이 내릴 때 돈 버는 종목' && t.badge && t.shown, t);
    const b2 = await pair();
    ok(`${W}x${H} 해금 전후 차트 위치·크기 동일`, JSON.stringify(a.r) === JSON.stringify(b2.r) && b2.n === 1, [a.r, b2.r]);
    await p.evaluate(() => hideUnlockToast()); await sleep(100);
    ok(`${W}x${H} 해금 전후 차트 영역 픽셀 동일`, Buffer.compare(before, await regionShot()) === 0);
    await p.evaluate(() => showUnlockToast('x')); await p.click('#unlockToast'); await sleep(100);
    ok(`${W}x${H} 토스트 클릭으로 닫힘`, await p.evaluate(() => document.getElementById('unlockToast').hidden));
    await p.evaluate(() => showUnlockToast('x')); await sleep(3300);
    ok(`${W}x${H} 토스트 3초 뒤 자동 사라짐`, await p.evaluate(() => document.getElementById('unlockToast').hidden));
    await p.click('.quote-row[data-q="inv"]'); await sleep(300);
    const z = await p.evaluate(() => ({ badge: !document.querySelector('.quote-row[data-q="inv"] .q-new').hidden, zoom: zoomTarget, chartTarget, open: !document.getElementById('chartZoom').hidden, saved: localStorage.getItem('hodl.invNew') }));
    ok(`${W}x${H} 인버스 행 클릭: NEW 사라짐 · 큰 차트 창 열림 · 메인 차트는 IDX 그대로`, !z.badge && z.zoom === 'inv' && z.chartTarget === 'idx' && z.open && z.saved === null, z);
    // 평단선
    const goldRows = async () => p.evaluate(() => {
      const cv = document.getElementById('czCanvas'), ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
      const d = ctx.getImageData(0, 0, Math.floor(w * 0.5), h).data, rows = [];
      for (let y = 0; y < h; y++) { let g = 0; for (let x = 0; x < Math.floor(w * 0.5); x++) { const i = (y * Math.floor(w * 0.5) + x) * 4; if (d[i] > 240 && d[i + 1] > 200 && d[i + 2] < 40) g++; } rows.push(g); }
      return rows.filter(g => g > w * 0.12).length;
    });
    const setup = code => p.evaluate(code => {
      for (let d = 0; d < 2; d++) { startMarket(); while (run.phase === 'market') { if (run.pendingTip) resolveTip(1); tick(); } }
      startMarket(); for (let i = 0; i < 14; i++) { if (run.pendingTip) resolveTip(1); tick(); }
      run.positions.length = 0; run.cash = 1e9; const a = assets.semi;
      window.P = (dir, f, lev = 1) => { const p = openPosition('semi', 100, lev, dir, true); p.shares = p.entryExposure / (a.price * f); };
      eval(code); Fx.skipQueue(); renderAll(); hideOverlay(); openChartZoom('semi'); zoomMode = 'day'; document.getElementById('czTabs').dataset.sig = ''; renderChartZoom();
    }, code);
    await setup('');
    ok(`${W}x${H} 보유 없음: 평단선 없음`, await goldRows() === 0);
    await setup('P(1, 0.97)'); await sleep(200);
    ok(`${W}x${H} 보유: 금색 평단선 그려짐`, await goldRows() > 0);
    await setup('P(1, 1.6)'); await sleep(200);
    ok(`${W}x${H} 범위 밖(멀리 위): 선 없음(가장자리 태그만)`, await goldRows() === 0);
    await setup('P(1, 0.97); P(1, 0.97)');   // 같은 종목·방향·배율 → 엔진이 합침 = 선 하나
    ok(`${W}x${H} 추가 매수로 합쳐지면 평단선은 하나`, await p.evaluate(() => run.positions.length) === 1);
    ok(`${W}x${H} 페이지 에러 없음`, errs.length === 0, errs);
    await p.close();
  }
  await b.close();
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
