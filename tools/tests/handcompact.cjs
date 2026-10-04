// 손패 컴팩트 격자(데스크톱): 5열 × 필요한 행만 · 카드 크기 축소 · 시세 13행 스크롤 없음(손패 5장) · 10장 전부 보임 · 0장 = 빈 한 줄 · 모바일(390)은 기존 3열 유지 · 알림은 가운데 아래(3단)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IDS = ['stk_semi', 'stk_coin', 'stk_sc', 'stk_meme', 'stk_ev', 'stk_game', 'stopLoss', 'takeProfit', 'hodl', 'credit'];
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920, 1080], [1366, 768], [1280, 1024], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html');
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(900);
    await p.evaluate(() => { window.tipChance = () => 0; });
    const state = async n => { await p.evaluate(([n, ids]) => { run.hand = ids.slice(0, n).map(newCard); handSig = ''; renderAll(); }, [n, IDS]); await sleep(700);
      return p.evaluate(() => { const box = $('handBox'), cards = [...box.querySelectorAll('.card.gcard')], u = uiScale, bx = box.getBoundingClientRect(), qb = $('quoteBox'), c0 = cards[0] && cards[0].getBoundingClientRect();
        const inside = cards.every(c => { const r = c.getBoundingClientRect(); return r.left >= bx.left - 1 && r.right <= bx.right + 1 && r.bottom <= bx.bottom + 1 && r.top >= bx.top - 1; });
        return { n: cards.length, slots: box.querySelectorAll('.g-slot').length, cols: getComputedStyle(box).gridTemplateColumns.split(' ').length, compact: box.classList.contains('compact'), h: Math.round(bx.height / u), cardH: c0 ? Math.round(c0.height / u) : 0, cardW: c0 ? Math.round(c0.width / u) : 0, inside,
          qScroll: qb.scrollHeight - qb.clientHeight, docX: document.documentElement.scrollWidth - document.documentElement.clientWidth, names: cards.every(c => { const g = c.querySelector('.g-name'); return g.scrollHeight <= g.clientHeight + 1; }) }; }); };
    const s0 = await state(0), s5 = await state(5), s10 = await state(10);
    if (W > 900) {
      ok(`${W} 컴팩트 5열`, s5.compact && s5.cols === 5 && s10.cols === 5, [s5.cols, s10.cols]);
      ok(`${W} 카드 높이 ≤ 68u (변경 전 96u+)`, s5.cardH <= 69 && s5.cardH >= 55, s5.cardH);
      ok(`${W} 5장 = 1행 · 빈 칸 0`, s5.n === 5 && s5.slots === 0 && s5.h < 90, s5);
      ok(`${W} 10장 = 2행 · 전부 보임`, s10.n === 10 && s10.slots === 0 && s10.inside && s10.h < 170, s10);
      ok(`${W} 0장 = 한 줄 빈 칸 5개`, s0.n === 0 && s0.slots === 5, s0);
      ok(`${W} 카드 이름이 칸 안에 (잘림 없음)`, s5.names && s10.names, [s5.names, s10.names]);
      if (W >= 1920 || W === 1366) ok(`${W} 손패 5장일 때 시세 13종목 스크롤 없음`, s5.qScroll <= 1, s5.qScroll);
      ok(`${W} 가로 스크롤 없음`, s5.docX <= 0 && s10.docX <= 0);
    } else {
      ok('390 모바일은 기존 3열 격자 유지 (컴팩트 아님)', !s5.compact && s5.cols === 3 && s5.cardH === 96, s5);
      ok('390 모바일 10장 = 4열', s10.cols === 4 && !s10.compact, s10.cols);
    }
    await p.screenshot({ path: `${S}/handcompact-${W}.png` });
    await p.close();
  }
  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
