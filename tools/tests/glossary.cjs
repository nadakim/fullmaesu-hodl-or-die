// 주식 용어집: ≡ 메뉴 '📖 용어집' → 항목 수 = GLOSSARY 길이(잠긴 시스템 항목은 🔒만, 설명 숨김) → 카테고리 필터 → Esc로 닫힘 → 열린 동안 장 멈춤 · 390px 가로 스크롤 없음
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(b, W, H, unlockWeek) {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?layout=classic');
  if (unlockWeek) await p.evaluate(w => { try { localStorage.setItem('hodl.unlockWeek', w); } catch(e) {} }, unlockWeek);
  await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(500);
  await p.evaluate(() => { window.tipChance = () => 0; });
  return p;
}
const errs = [];
const openGloss = async p => { await p.click('#menuBtn'); await p.click('#menuPanel [data-menu="glossary"]'); await sleep(150); };
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[1920, 1080], [1366, 768], [390, 844]]) {
    // 1주차(온보딩 잠금 그대로)
    const p = await open(b, W, H, null);
    await openGloss(p);
    const a = await p.evaluate(() => ({ open: overlayOpen && glossaryOpen, items: document.querySelectorAll('.gloss-item').length, total: GLOSSARY.length,
      locked: document.querySelectorAll('.gloss-item.locked').length, wantLocked: GLOSSARY.filter(g => g.sys && !sysOpen(g.sys)).length,
      lockText: [...document.querySelectorAll('.gloss-item.locked')].every(e => /🔒 \d주차에 열림/.test(e.textContent) && !e.querySelector('.gloss-detail')),
      aliasOnlyHere: !/증거금률|담보비율|대차 이자/.test(document.body.innerText.replace(document.getElementById('overlayBox').innerText, '')) }));
    ok(`${W} ≡ 메뉴 → 용어집 열림`, a.open, a);
    ok(`${W} 항목 수 = GLOSSARY 길이`, a.items === a.total && a.total >= 35, [a.items, a.total]);
    ok(`${W} 잠긴 시스템 항목은 🔒 N주차에 열림 · 설명 숨김`, a.locked === a.wantLocked && a.locked > 0 && a.lockText, [a.locked, a.wantLocked]);
    ok(`${W} 정식 용어는 용어집 밖 화면에 안 보임 (N2)`, a.aliasOnlyHere);
    const f = await p.evaluate(async () => { const out = {}; for (const [k] of [['all']].concat(GLOSS_CATS)) { document.querySelector(`[data-gloss-cat="${k}"]`).click(); out[k] = [document.querySelectorAll('.gloss-item').length, GLOSSARY.filter(g => k === 'all' || g.cat === k).length, document.querySelector(`[data-gloss-cat="${k}"]`).classList.contains('on')]; } return out; });
    ok(`${W} 카테고리 필터 전환 (항목 수·선택 표시)`, Object.values(f).every(v => v[0] === v[1] && v[0] > 0 && v[2]), f);
    if (W === 390) { const sx = await p.evaluate(() => [document.documentElement.scrollWidth - document.documentElement.clientWidth, $('overlayBox').scrollWidth - $('overlayBox').clientWidth]); ok('390 가로 스크롤 없음', sx[0] <= 0 && sx[1] <= 1, sx); }
    await p.evaluate(() => showGlossary('lev')); await sleep(100);
    await p.screenshot({ path: `${S}/glossary-${W}-locked.png` });
    await p.keyboard.press('Escape'); await sleep(100);
    ok(`${W} Esc로 닫힘`, await p.evaluate(() => !overlayOpen && !glossaryOpen));
    await p.close();
    // 전부 열린 상태
    const q = await open(b, W, H, '8');
    await openGloss(q);
    const c = await q.evaluate(() => ({ items: document.querySelectorAll('.gloss-item').length, locked: document.querySelectorAll('.gloss-item.locked').length,
      details: document.querySelectorAll('.gloss-detail').length, nums: /undefined|NaN|\[object/.test(document.getElementById('glossList').innerText) }));
    ok(`${W} 다 열린 상태: 잠금 0 · 설명 전부 · undefined/NaN 없음`, c.locked === 0 && c.details === c.items && !c.nums, c);
    const txt = await q.evaluate(() => ({ lev: [...document.querySelectorAll('.gloss-item')].find(e => e.dataset.gloss === '청산').innerText,
      cfg: { m: MAINTENANCE_RATIO, s: SHORT_MAINTENANCE_RATIO, pen: LIQUIDATION_PENALTY, crit: CRIT_CHANCE, di: DAILY_INTEREST } }));
    ok(`${W} 청산 항목 수치 = 엔진 CONFIG`, txt.lev.includes(Math.round(txt.cfg.m * 100) + '%') && txt.lev.includes(Math.round(txt.cfg.s * 100) + '%') && txt.lev.includes(Math.round(txt.cfg.pen * 100) + '%'), txt.lev.slice(0, 120));
    await q.evaluate(() => showGlossary('game')); await sleep(100);
    await q.screenshot({ path: `${S}/glossary-${W}-open.png` });
    await q.close();
  }
  // 열려 있는 동안 장은 멈춘다
  {
    const p = await open(b, 1366, 768, '8');
    await p.evaluate(() => { startMarket(); });
    await p.waitForFunction(() => run.phase === 'market', null, { timeout: 5000 });
    await openGloss(p);
    const t0 = await p.evaluate(() => run.tickInDay); await sleep(1800);
    ok('용어집이 열려 있는 동안 장 멈춤', (await p.evaluate(() => run.tickInDay)) === t0 && (await p.evaluate(() => glossaryOpen)), t0);
    await p.keyboard.press('Escape'); await sleep(1800);
    ok('닫으면 장 재개', (await p.evaluate(() => run.tickInDay)) > t0);
    await p.close();
  }
  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
