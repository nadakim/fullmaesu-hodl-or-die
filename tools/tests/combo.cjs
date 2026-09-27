// S8(46·34) 수익 콤보: 단계 1~2/3~4/5~7/8~11/12+ JACKPOT · 음높이 5음계 · 끊기면 '최대 ×N' · 수익/손실 이벤트 연결 · CHAIN 표시 없음 / ?tuner=1 조정 패널
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOOK = `(() => { window.__snd = []; const o = Sound.play; Sound.play = (n, op) => { __snd.push([n, op && op.pitch]); return o(n, op); }; })()`;
const URL = 'http://127.0.0.1:8765/demo.html';
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.keyboard.press('Shift');
    await p.evaluate(() => { try { localStorage.removeItem('hodl.tuner'); } catch(e) {} });
    await p.evaluate(HOOK);
    await p.click('#startBtn'); await sleep(460);
    // 단계: 1~2 / 3~4 / 5~7 / 8~11 / 12+ JACKPOT
    const st = await p.evaluate(() => {
      __snd = []; hideStreak();
      const seen = {};
      for(let n = 1; n <= 12; n++){ comboHit('t'); seen[n] = [$('fxStreak').className.replace(/\s*bump/, ''), $('fxStreak').textContent]; }
      return { seen, ups: __snd.filter(s => s[0] === 'comboUp').map(s => s[1]), slam: __snd.filter(s => s[0] === 'multSlam').length, jack: __snd.filter(s => s[0] === 'jackpot').length,
               stamp: (document.querySelector('.fx-stamp') || {}).textContent };
    });
    ok(W + ' 1은 숨김, 2부터 COMBO ×n', !/on/.test(st.seen[1][0]) && st.seen[2][1] === 'COMBO ×2' && /c1/.test(st.seen[2][0]), st.seen);
    ok(W + ' 단계 c2(3) · c3(5) · c4(8) · c5 JACKPOT(12)', /c2/.test(st.seen[3][0]) && /c2/.test(st.seen[4][0]) && /c3/.test(st.seen[5][0]) && /c3/.test(st.seen[7][0]) && /c4/.test(st.seen[8][0]) && /c5/.test(st.seen[12][0]) && st.seen[12][1] === 'JACKPOT ×12');
    ok(W + ' 오를 때마다 5음계 한 칸 위 (12번)', st.ups.length === 12 && st.ups[1] > st.ups[0] && st.ups[4] > st.ups[3], st.ups.slice(0, 6));
    ok(W + ' 단계 오름 쾅 3번 + JACKPOT 팡파르 + 도장', st.slam === 3 && st.jack === 1 && st.stamp === 'JACKPOT!', st);
    await sleep(150);
    await p.screenshot({ path: `${S}/combo-jackpot-${W}.png` });
    // 끊김 → '최대 ×12' 식음 → 사라짐
    const br = await p.evaluate(() => { __snd = []; comboBreak(); return [$('fxStreak').className, $('fxStreak').textContent, __snd.map(s => s[0]), combo.n, combo.max]; });
    ok(W + " 끊기면 '최대 ×12' + 식는 소리, 최고 기록 유지", /cool/.test(br[0]) && br[1] === '최대 ×12' && br[2].includes('comboBreak') && br[3] === 0 && br[4] === 12, br);
    await sleep(1800);
    ok(W + ' 잠시 뒤 사라짐', await p.evaluate(() => !/cool|on/.test($('fxStreak').className)));
    // 실제 이벤트: 수익 매도 +1 · 손실 매도 끊김 · 유리한 갭 +1 · 반대매매 끊김 · CHAIN 표시 없음
    const ev = await p.evaluate(() => {
      window.tipChance = () => 0; hideStreak(); const out = {};
      openPosition('semi', 1000, 1, 1, true); assets.semi.price *= 1.05; sellAllPositions(); out.win = combo.n;
      openPosition('coin', 1000, 1, 1, true); onGameEvent('gap', { stockId: 'coin', pct: 0.1 }); out.gapUp = combo.n;
      assets.coin.price *= 0.9; sellAllPositions(); out.loss = combo.n;
      openPosition('semi', 1000, 1, 1, true); assets.semi.price *= 1.05; sellAllPositions(); const before = combo.n;
      onGameEvent('marginCall', { pos: { id: -1, name: 'x', lev: 3, dir: 1 }, pnl: -100, penalty: 1, saved: 0, refund: 0 }); out.liq = [before, combo.n];
      onGameEvent('daySettled', { round: 1, day: 5, settlement: [], payout: 100 }); out.settle = combo.n;
      Fx.skipQueue();
      out.chainShown = document.querySelector('.fx-chainctr') ? document.querySelector('.fx-chainctr').classList.contains('on') : false;
      return out;
    });
    ok(W + ' 수익 매도 +1 · 유리한 갭 +1 · 손실 매도 끊김 · 반대매매 끊김 · 정산 보너스 +1', ev.win >= 1 && ev.gapUp === ev.win + 1 && ev.loss === 0 && ev.liq[0] >= 1 && ev.liq[1] === 0 && ev.settle === 1 && !ev.chainShown, ev);
    await p.close();
  }
  // ?tuner=1 조정 패널
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.evaluate(() => { try { localStorage.removeItem('hodl.tuner'); } catch(e) {} });
    ok(W + ' 보통 주소에는 패널 없음', await p.locator('#tunerPanel').count() === 0);
    await p.goto(URL + '?tuner=1'); await p.keyboard.press('Shift');
    const t1 = await p.evaluate(() => [document.querySelectorAll('#tunerPanel [data-tn]').length, tunerLeaves(JUICE_DEFAULTS, [], []).length]);
    ok(W + ' ?tuner=1 → JUICE_CONFIG 숫자마다 슬라이더', t1[0] > 40 && t1[0] === t1[1], t1);
    await p.screenshot({ path: `${S}/tuner-${W}.png` });
    await p.evaluate(() => { const el = document.querySelector('[data-tn="comboShowFrom"]'); el.value = 4; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const t2 = await p.evaluate(() => [JUICE_CONFIG.comboShowFrom, JSON.parse(localStorage.getItem('hodl.tuner')).comboShowFrom, document.querySelector('[data-tnv="comboShowFrom"]').textContent]);
    ok(W + ' 슬라이더 → 즉시 적용 + 저장', t2[0] === 4 && t2[1] === 4 && t2[2] === '4', t2);
    await p.evaluate(() => { const el = document.querySelector('[data-tn="stageMs.row"]'); el.value = 600; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(W + ' 중첩 값(stageMs.row)도', await p.evaluate(() => JUICE_CONFIG.stageMs.row === 600));
    await p.reload(); await p.keyboard.press('Shift');
    ok(W + ' 다시 열어도 저장값 유지 (?tuner=1)', await p.evaluate(() => JUICE_CONFIG.comboShowFrom === 4 && JUICE_CONFIG.stageMs.row === 600));
    await p.goto(URL); await p.keyboard.press('Shift');
    ok(W + ' 보통 주소로 열면 기본값 (저장값은 조정 모드에서만)', await p.evaluate(() => JUICE_CONFIG.comboShowFrom === 2 && JUICE_CONFIG.stageMs.row === 300));
    await p.goto(URL + '?tuner=1'); await p.keyboard.press('Shift');
    await p.evaluate(HOOK);
    await p.locator('[data-tn-act="combo"]').click();
    await sleep(20 * 220 + 600);
    const ct = await p.evaluate(() => [__snd.filter(s => s[0] === 'comboUp').length, __snd.filter(s => s[0] === 'jackpot').length, $('fxStreak').textContent]);
    ok(W + " 콤보 테스트: 1→20 → JACKPOT → '최대 ×20'", ct[0] === 20 && ct[1] === 1 && ct[2] === '최대 ×20', ct);
    await p.locator('[data-tn-act="copy"]').click(); await sleep(80);
    const cp = await p.evaluate(() => { const j = JSON.parse(tunerLastCopy); return [j.comboShowFrom, Array.isArray(j.comboTiers), !$('tunerOut').hidden && $('tunerOut').value === tunerLastCopy]; });
    ok(W + ' 값 복사: JSON (클립보드 + 글상자)', cp[0] === 4 && cp[1] && cp[2], cp);
    await p.locator('[data-tn-act="reset"]').click(); await sleep(80);
    const rs = await p.evaluate(() => [JUICE_CONFIG.comboShowFrom, JUICE_CONFIG.stageMs.row, localStorage.getItem('hodl.tuner'), document.querySelector('[data-tn="comboShowFrom"]').value]);
    ok(W + ' 기본값: 값 복원 + 저장 삭제 + 슬라이더 원위치', rs[0] === 2 && rs[1] === 300 && rs[2] === null && rs[3] === '2', rs);
    await p.locator('[data-tn-act="fold"]').click(); await sleep(50);
    ok(W + ' ─ 접기', await p.evaluate(() => $('tunerPanel').classList.contains('folded') && getComputedStyle(document.querySelector('.tn-body')).display === 'none'));
    await p.close();
  }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
