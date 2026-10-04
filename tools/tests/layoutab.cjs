// 전투 화면 레이아웃 A/B (공통 요구): 상단 바 1줄 · 순자산이 가장 큰 글자 · 장 시작 = 우하단 대형 · 전량 매도 = 좌하단 작게 · 손패 부채꼴(하단 중앙) ·
// 포지션 없으면 빈 패널 없음 · 등락이 전부 0이면 가격만 · 가로 스크롤 없음 · 좁은 창은 현재 레이아웃으로 · B: 차트 폭 70%, 평단 마커
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const L of ['A', 'B']) for (const [W, H] of [[1920, 1080], [1280, 720], [1280, 800], [2560, 1080], [3840, 2160]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?layout=' + L);
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(900);
    await p.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi', 'stopLoss', 'hodl', 'credit', 'dove', 'stk_meme', 'takeProfit', 'yolo', 'hawk', 'pump'].map(newCard); handSig = ''; renderAll(); });
    await sleep(700);
    const m = await p.evaluate(() => {
      const r = id => { const e = typeof id === 'string' ? document.querySelector(id) : id; return e ? e.getBoundingClientRect() : null; };
      const vw = innerWidth, vh = innerHeight, hud = r('.hud'), open = r('#openBtn'), sell = r('#sellAllBtn'), chart = r('#chartBox'), hand = r('#handBox'), pos = r('#positionsBox');
      const cards = [...document.querySelectorAll('#handBox .card')].map(c => c.getBoundingClientRect());
      const fs = sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      const q = [...document.querySelectorAll('.quote-row')];
      return { layout: document.body.dataset.layout, vw, vh, hudH: hud.height, hudW: hud.width, open: [open.left / vw, open.top / vh, open.width / vw, open.height], sell: [sell.left / vw, sell.top / vh, sell.width / vw, sell.height],
        chartW: chart.width / vw, handCx: (hand.left + hand.width / 2) / vw, handBottom: hand.bottom / vh, nCards: cards.length, fan: document.querySelector('#handBox').classList.contains('fan'),
        posShown: pos && pos.width > 0 && pos.height > 0, docX: document.documentElement.scrollWidth - innerWidth, docY: document.documentElement.scrollHeight - innerHeight,
        total: fs('#totalAssets'), cash: fs('.asset-card .val'), apText: fs('#apText'),
        flatChg: q.every(e => getComputedStyle(e.querySelector('.q-chg')).display === 'none'), flatSpark: q.every(e => getComputedStyle(e.querySelector('canvas')).display === 'none'),
        price: q.every(e => e.querySelector('.q-price').textContent.length > 0), hasSwitch: !!document.querySelector('#layoutSwitch button'), gear: getComputedStyle(document.querySelector('#topSettingsBtn')).display !== 'none' };
    });
    const t = `${L} ${W}x${H}`;
    ok(`${t} 레이아웃 적용`, m.layout === L, m.layout);
    ok(`${t} 상단 바 1줄 (높이 ≤ 40u)`, m.hudH <= 40 * (H / 600) * 0.9 + 14, [m.hudH, m.hudW]);
    ok(`${t} 장 시작 = 우하단 대형 CTA`, m.open[0] > 0.6 && m.open[1] > 0.7 && m.open[2] > 0.18 && m.open[3] > 50, m.open);
    ok(`${t} 전량 매도 = 좌하단 작게`, m.sell[0] < 0.1 && m.sell[1] > 0.8 && m.sell[2] < 0.16, m.sell);
    ok(`${t} 손패 부채꼴 · 하단 중앙 · 10장`, m.fan && m.nCards === 10 && Math.abs(m.handCx - 0.5) < 0.12 && m.handBottom > 0.88, [m.fan, m.nCards, m.handCx, m.handBottom]);
    ok(`${t} 순자산 글자가 가장 큼`, m.total >= m.cash && m.total >= m.apText && m.total >= 16 * (H / 600) * 0.8, [m.total, m.cash, m.apText]);
    ok(`${t} 포지션 없음 = 빈 패널 없음`, !m.posShown, m.posShown);
    ok(`${t} 등락 전부 0 = 가격만`, m.flatChg && m.flatSpark && m.price, [m.flatChg, m.flatSpark]);
    ok(`${t} 가로 스크롤 없음`, m.docX <= 0, m.docX);
    ok(`${t} 레이아웃 스위치 · ⚙ 설정 버튼`, m.hasSwitch && m.gear);
    if (L === 'B') ok(`${t} 차트가 전체 폭의 약 70%`, Math.abs(m.chartW - 0.70) < 0.04, m.chartW);
    if (L === 'A') ok(`${t} 차트가 가운데(≈53%)`, Math.abs(m.chartW - 0.53) < 0.05, m.chartW);
    if (W === 1920) {   // 포지션 2개 → 표시 · B는 평단 마커
      await p.evaluate(() => { playCard(0, null); handSig = ''; run.hand = ['stk_coin', 'dove'].map(newCard); run.ap = 3; playCard(0, null); if(chartTarget === 'idx') showChart(run.positions[0].assetId); renderAll(); });
      await sleep(500);
      const q = await p.evaluate(() => { const pos = document.querySelector('#positionsBox').getBoundingClientRect(), ch = document.querySelector('#chartBox').getBoundingClientRect();
        return { n: document.querySelectorAll('#positionsBox .pos-item').length, shown: pos.height > 0, overChart: pos.left >= ch.left - 1 && pos.right <= ch.right + 1 && pos.top >= ch.top - 1 && pos.bottom <= ch.bottom + 1, belowChart: pos.top >= ch.bottom - 2, docX: document.documentElement.scrollWidth - innerWidth }; });
      ok(`${t} 포지션 ${q.n}개 표시`, q.n === 2 && q.shown, q);
      if (L === 'B') ok(`${t} 포지션 = 차트 위 마커`, q.overChart, q);
      if (L === 'A') ok(`${t} 포지션 = 차트 아래 줄`, q.belowChart, q);
      await p.screenshot({ path: `/tmp/layoutab-${L}-${W}.png` });
    }
    await p.close();
  }
  // 좁은 창(1100×800)은 현재 레이아웃 그대로
  const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?layout=A');
  await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
  await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(800);
  const nb = await p.evaluate(() => ({ layout: document.body.dataset.layout, info: document.querySelector('#infoCol').children.length, fan: document.querySelector('#handBox').classList.contains('fan') }));
  ok('1100×800: A를 골라도 현재 레이아웃으로 (정보열 비어 있음·부채꼴 없음)', nb.layout === 'classic' && nb.info === 0 && !nb.fan, nb);
  // 전환: A → 현재 → B 왕복 후 요소가 제자리로 돌아오는지
  const p2 = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://127.0.0.1:8765/demo.html');
  await p2.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
  await p2.keyboard.press('Shift'); await p2.click('#startBtn'); await sleep(800);
  const par = () => p2.evaluate(() => ({ bal: document.getElementById('balanceBox').parentElement.className, turn: document.querySelector('.turn-bar').parentElement.className, info: document.getElementById('infoCol').children.length }));
  const c0 = await par();
  for (const L of ['A', 'B', 'classic']) { await p2.click(`[data-layout-set="${L}"]`); await sleep(300); }
  const c1 = await par();
  ok('A → B → 현재 왕복: 요소가 원래 자리로 복귀', JSON.stringify(c0) === JSON.stringify(c1), [c0, c1]);
  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
