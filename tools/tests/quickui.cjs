// S5 빠른 UI: 손패 이름만 · 차트 크게 보기(장 진행 유지) · 시그널 칩·설명서 · 배속 0.5×·HUD 버튼·키 1~4 · 추천 카드 빛남
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[1280,1024],[390,844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift');
    await p.evaluate(() => { try { localStorage.removeItem('hodl.settings'); } catch(e){} });
    await p.click('#startBtn'); await sleep(460);
    await p.evaluate(() => { window.tipChance = () => 0; clearToasts(); gainRelic('antFlag', 't'); openPosition('semi', 1000, 1, 1, true);
      run.hand = ['stk_coin', 'levEtf', 'dove', 'hodl'].map(newCard); handSig = ''; renderAll(); });
    const h = await p.evaluate(() => [...document.querySelectorAll('#handBox .card')].map(c => [c.dataset.cid, !!c.querySelector('.g-desc'), c.classList.contains('boost')]));
    ok(W + ' 손패: 설명 줄 없음 (이름만)', h.every(x => !x[1]), h);
    ok(W + ' 추천 빛남: 종목(깃발 배수↑)·레버리지 ETF만', JSON.stringify(h.map(x => x[2])) === '[true,true,false,false]', h);
    // 배속
    const sb = await p.evaluate(() => { const el = $('speedBtns'); const r = el.getBoundingClientRect(); return [el.querySelectorAll('button').length, r.width > 0 && r.right <= innerWidth + 1]; });
    ok(W + ' HUD 배속 버튼 4개 · 화면 안', sb[0] === 4 && sb[1], sb);
    await p.locator('#speedBtns [data-speed="0.5"]').click(); await sleep(80);
    ok(W + ' 0.5× 버튼 → 설정 저장', await p.evaluate(() => settings.speed === 0.5 && JSON.parse(localStorage.getItem('hodl.settings')).speed === 0.5));
    await p.keyboard.press('4'); await sleep(50);
    ok(W + ' 키 4 → 4×', await p.evaluate(() => settings.speed === 4 && document.querySelector('#speedBtns .on').dataset.speed === '4'));
    // 차트 크게 보기: 장중에도 열리고 게임은 계속
    await p.click('#openBtn'); await sleep(100);
    await p.click('#candlestickChart'); await sleep(150);
    await p.locator('[data-cz="meme"]').click(); await sleep(100);
    const t0 = await p.evaluate(() => marketTickN);   // 누적 틱 (tickInDay는 하루가 끝나면 0으로 돌아간다)
    await p.evaluate(() => Fx.skipQueue()); await sleep(1500);
    const z = await p.evaluate(t0 => [!$('chartZoom').hidden, $('czHead').textContent.includes('밈코인'), marketTickN > t0, overlayOpen], t0);
    ok(W + ' 차트 크게 보기: 종목 탭 · 장 진행 계속', z[0] && z[1] && z[2] && !z[3], z);
    await p.screenshot({ path: `${S}/quickui-zoom-${W}.png` });
    await p.keyboard.press('Escape'); await sleep(80);
    ok(W + ' Esc → 닫힘 (메뉴 안 열림)', await p.evaluate(() => $('chartZoom').hidden && $('menuPanel').hidden));
    // 시그널 칩 + 설명서
    ok(W + ' 시그널 색 칩', await p.evaluate(() => document.querySelectorAll('#quoteBox .sig-chip').length === 5));
    await p.click('#menuBtn'); await sleep(80);
    await p.locator('[data-menu="signalGuide"]').click(); await sleep(150);
    ok(W + ' ≡ → 시그널 설명서', await p.evaluate(() => overlayOpen && $('overlayBox').textContent.includes('시그널 설명서') && $('overlayBox').textContent.includes('적중 65%')));
    await p.screenshot({ path: `${S}/quickui-guide-${W}.png` });
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  await b.close();
})();
