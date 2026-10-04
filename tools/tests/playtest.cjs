// 플레이테스트 킷: 일반 모드는 화면에 아무것도 없음 · ?playtest=1 = 게임오버 화면 '📋 판 기록 복사' + 설문 3개·한 줄 + 기록 누적(hodl.playtestLog) +
// ≡ '전체 기록 복사' · 기록의 시드로 같은 판 재현 · 설정 '플레이테스트 모드'(주소 없음) = 복사 버튼만, 설문 없음 · 입력 중 Space가 단축키로 안 새어 나감
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async (b, W, H, q) => {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?layout=classic' + (q || ''));
  await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.removeItem('hodl.playtestLog'); } catch(e) {} });
  await p.keyboard.press('Shift');
  return { ctx, p };
};
const endNow = p => p.evaluate(() => { window.tipChance = () => 0; clearToasts(); endRun('BANKRUPT'); });
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    // 1) 일반 모드: 아무것도 없음
    { const { ctx, p } = await open(b, W, H, '');
      await p.click('#startBtn'); await sleep(500);
      const seeded = await p.evaluate(() => playtest.seed);
      await endNow(p); await p.waitForFunction(() => overlayOpen && !!document.querySelector('.ending-title'), null, { timeout: 8000 }).catch(() => {});
      const n = await p.evaluate(() => ({ box: !!$('ptBox'), log: localStorage.getItem('hodl.playtestLog'), menu: getComputedStyle($('menuPlaytest')).display, on: document.body.classList.contains('playtest-on') }));
      ok(W + ' 일반 모드: 복사 버튼·설문 없음 · 기록 안 쌓임 · 메뉴 항목 숨김 · 시드 안 건드림', !n.box && n.log === null && n.menu === 'none' && !n.on && seeded === null, { n, seeded });
      errs.push(...p.errs); await ctx.close(); }
    // 2) ?playtest=1: 복사 버튼 + 설문 + 기록
    { const { ctx, p } = await open(b, W, H, '?playtest=1');
      await p.click('#startBtn'); await sleep(500);
      const start = await p.evaluate(() => ({ seed: playtest.seed, hand: run.hand.map(c => c.id).join(','), n: playtest.sessionRuns }));
      ok(W + ' 판 시작: 시드를 정해 둔다 (세션 1판째)', Number.isInteger(start.seed) && start.n === 1, start);
      await p.evaluate(() => { gainRelic('antFlag', 't'); });
      await endNow(p); await p.waitForFunction(() => overlayOpen && !!$('ptBox'), null, { timeout: 8000 }).catch(() => {});
      const box = await p.evaluate(() => ({ q: document.querySelectorAll('#ptBox .pt-q').length, btns: document.querySelectorAll('#ptBox [data-pt-v]').length, note: !!$('ptNote'), copy: !!document.querySelector('[data-act="ptCopy"]'),
        log: JSON.parse(localStorage.getItem('hodl.playtestLog') || '[]').length }));
      ok(W + ' 게임오버: 설문 3문항(1~5) · 한 줄 후기 · 📋 판 기록 복사 · 기록 1판 저장', box.q === 3 && box.btns === 15 && box.note && box.copy && box.log === 1, box);
      if(W === 1920) await p.screenshot({ path: `${S}/playtest-over-${W}.png` });
      await p.locator('[data-pt-q="fun"][data-pt-v="4"]').click();
      await p.locator('[data-pt-q="fair"][data-pt-v="2"]').click();
      await p.locator('[data-pt-q="again"][data-pt-v="5"]').click();
      await p.locator('#ptNote').click(); await p.keyboard.type('3주차 보스 억까'); await p.keyboard.press('Space'); await p.keyboard.type('ㅠ'); await sleep(100);
      const still = await p.evaluate(() => overlayOpen && !!$('ptBox'));
      ok(W + ' 한 줄 후기 입력 중 Space가 단축키로 새지 않음 (창 그대로)', still);
      await p.locator('[data-act="ptCopy"]').click(); await sleep(300);
      const cp = await p.evaluate(() => { const t = window.__playtestLastCopy || '', j = JSON.parse(t.split('\nJSON: ')[1] || '{}'); return { head: t.split('\n')[0], j,
        on: !!document.querySelector('[data-pt-q="fun"][data-pt-v="4"].on') }; });
      const j = cp.j;
      const fields = ['version', 'seed', 'endWeek', 'ending', 'bossPlan', 'bossesBeaten', 'endEquity', 'maxDayMult', 'relics', 'deckSize', 'playSec', 'settings', 'sessionRun'].every(k => k in j);
      ok(W + ' 복사: 요약 + JSON 한 줄 (버전·시드·주차·엔딩·보스·순자산·배수·유물 주차·덱·시간·설정·세션 판 번호)', cp.head.includes('플레이테스트') && fields && j.seed === start.seed && j.relics.some(r => r.id === 'antFlag' && r.week === 1), { head: cp.head, keys: Object.keys(j) });
      ok(W + ' 설문 결과가 기록에 들어간다', !!j.survey && j.survey.fun === 4 && j.survey.fair === 2 && j.survey.again === 5 && j.survey.note === '3주차 보스 억까 ㅠ' && cp.on, j.survey);
      // 기록의 시드로 같은 판 재현 (첫 손패가 같다)
      const rep = await p.evaluate(s => { setSeed(s); startNewRun({ unlockWeek: loadUnlockWeek() }); return run.hand.map(c => c.id).join(','); }, j.seed);
      ok(W + ' 기록 시드 = 같은 판 (첫 손패 동일)', rep === start.hand, { rep, hand: start.hand });
      // 두 번째 판 → 전체 기록 복사
      await p.evaluate(() => { hideOverlay(); startRun(); switchTab('play'); }); await sleep(300);
      await endNow(p); await p.waitForFunction(() => overlayOpen && !!$('ptBox'), null, { timeout: 8000 }).catch(() => {});
      await p.evaluate(() => { hideOverlay(); startRun(); switchTab('play'); renderAll(); }); await sleep(300);
      const menuVis = await p.evaluate(() => getComputedStyle($('menuPlaytest')).display !== 'none');
      await p.locator('#menuBtn').click(); await sleep(150); await p.locator('[data-menu="playtestLog"]').click(); await sleep(300);
      const all = await p.evaluate(() => { const t = window.__playtestLastCopy || ''; return { head: t.split('\n')[0], lines: (t.split('JSONL:\n')[1] || '').trim().split('\n').length, runs: JSON.parse(localStorage.getItem('hodl.playtestLog')).map(r => r.sessionRun) }; });
      ok(W + ' ≡ 전체 기록 복사: 2판 JSONL · 세션 판 번호 1·2', menuVis && all.head.includes('2판') && all.lines === 2 && all.runs.join() === '1,2', { menuVis, all });
      errs.push(...p.errs); await ctx.close(); }
    // 3) 설정 토글만 (주소 없음): 복사 버튼만, 설문 없음
    { const { ctx, p } = await open(b, W, H, '');
      await p.evaluate(() => { settings.playtest = true; applySettings(); });
      await p.click('#startBtn'); await sleep(400);
      await endNow(p); await p.waitForFunction(() => overlayOpen && !!document.querySelector('.ending-title'), null, { timeout: 8000 }).catch(() => {});
      const t = await p.evaluate(() => ({ box: !!$('ptBox'), q: document.querySelectorAll('#ptBox .pt-q').length, copy: !!document.querySelector('[data-act="ptCopy"]'), seed: playtest.seed }));
      ok(W + " 설정 '플레이테스트 모드': 복사 버튼만 (설문은 ?playtest=1일 때만)", t.box && t.q === 0 && t.copy && Number.isInteger(t.seed), t);
      await p.evaluate(() => { settings.playtest = false; saveSettings(); });
      errs.push(...p.errs); await ctx.close(); }
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
