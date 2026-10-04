// 전일 등락률 · 종목 카드 이름만: 장전·장 마감 뒤 시세표 = '어제' + 어제 등락률(0%로 리셋 안 됨), 장중 = 오늘 등락률, 1일차 = 0%, 손패의 종목 카드 = 이름만(가격 줄 없음), 이름 안 잘림 (4개 창 크기)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920, 1080], [1366, 768], [1280, 1024], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?layout=classic');
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(500);
    await p.evaluate(() => { window.tipChance = () => 0; });
    const first = await p.evaluate(() => ({ t: document.querySelector('[data-q] .q-chg').textContent, yd: !!document.querySelector('.q-chg .yd') }));
    ok(`${W} 1일차 장전 = 어제 0%`, first.yd && /0\.0+%|0%/.test(first.t), first.t);
    await p.evaluate(() => { run.hand = ['stk_semi', 'credit', 'stk_semi', 'stk_semi', 'stk_semi', 'stk_semi', 'stk_semi', 'stk_semi'].map(newCard); handSig = ''; renderAll(); });
    const hand = await p.evaluate(() => { const cs = [...document.querySelectorAll('#handBox .card.gcard')]; return { n: cs.length, price: document.querySelectorAll('#handBox .c-price,#handBox .c-cost').length, clip: cs.filter(c => { const n = c.querySelector('.cv-name'); return n.scrollHeight > n.clientHeight + 1; }).length, fs: cs.map(c => parseFloat(getComputedStyle(c.querySelector('.cv-name')).fontSize))[0] }; });
    ok(`${W} 손패 가격 줄 없음`, hand.price === 0, hand);
    ok(`${W} 손패 이름 안 잘림`, hand.clip === 0, hand);
    await p.screenshot({ path: `${S}/qc-${W}-pre.png` });
    // 장중 → 오늘 등락률, 라벨 없음
    const mid = await p.evaluate(() => { startMarket(); tick(); tick(); renderAll(); return { yd: document.querySelectorAll('.q-chg .yd').length, chart: document.querySelector('#chartChg').innerHTML }; });
    ok(`${W} 장중엔 '어제' 라벨 없음`, mid.yd === 0, mid);
    // 장 마감 뒤: 어제 등락률 유지 (0 아님)
    const post = await p.evaluate(() => { const s = STOCKS[0].id; assets[s].price = assets[s].dayOpen * 1.12; while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); const a = assets[STOCKS[0].id];
      return { phase: run.phase, last: a.lastDayChg, txt: document.querySelector(`[data-q="${STOCKS[0].id}"] .q-chg`).textContent, yd: document.querySelectorAll('.q-chg .yd').length }; });
    ok(`${W} 장 마감 뒤 어제 등락률 표시`, post.yd > 0 && post.txt.includes('어제') && Math.abs(post.last) > 0.001, post);
    await p.screenshot({ path: `${S}/qc-${W}-post.png` });
    await p.close();
  }
  await b.close();
  console.log(`FAIL ${fail} / ${pass + fail}`, 'errors', JSON.stringify(errs));
})();
