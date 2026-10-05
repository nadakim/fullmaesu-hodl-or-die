// 첫 3분 시나리오 (코드 수정 없음, 측정 전용): 처음 해 보는 사람처럼 '화면에 보이는 버튼'만 눌러 새 판을 시작하고, 각 지점의 스크린샷을 남긴다.
//   node tools/tests/first3min.js [출력폴더=docs/ux/first3min]   (사이트 사본은 :8765, hodl.unlockWeek=1 · 설정 기본값)
// 각 단계: 지금 화면에서 '눌러야 할 것'이 화면 안 CTA·문장으로 안내되는지(guided) 를 DOM에서 찾아 기록한다 (보이는 글자에 /눌러|선택|고르|클릭|▶/ 가 있는 안내문).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.argv[2] || path.join(__dirname, '../../docs/ux/first3min');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now(), log = [];
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html?crt=0');
  await p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('hodl.unlockWeek', '1'); } catch(e) {} });
  await p.reload();
  let n = 0;
  const snap = async (label, note) => {
    n++;
    const f = `${String(n).padStart(2, '0')}-${label}.png`;
    await p.screenshot({ path: path.join(OUT, f) });
    const s = await p.evaluate(() => ({ phase: window.run ? run.phase : 'title', tab: currentTab, overlay: overlayOpen, buttons: [...document.querySelectorAll('button:not([disabled]),[role=button]')].filter(e => e.offsetParent && !e.closest('[hidden]')).length }));
    log.push({ step: n, sec: Math.round((Date.now() - t0) / 1000), file: f, label, note: note || '', ...s });
    console.log(`${String(n).padStart(2, '0')} [${Math.round((Date.now() - t0) / 1000)}s] ${label} — phase=${s.phase} tab=${s.tab} overlay=${s.overlay} 누를 수 있는 버튼 ${s.buttons}개 ${note || ''}`);
  };
  await sleep(1500);
  await snap('title-first-view', '첫 입력 전(PRESS 안내)');
  await p.keyboard.press('Shift'); await sleep(1800);
  await snap('title-menu');
  await p.click('#startBtn'); await sleep(1800);
  await snap('W1D1-premarket', '장전: 손패 10장 · 목표 · 행동력');
  // 손패 첫 종목 카드(= 화면 맨 앞 카드) 클릭
  const stockCards = await p.$$('#handBox .card[data-cid^="stk_"]'); const card = stockCards[stockCards.length - 1];   // 부채꼴 맨 위(가장 오른쪽) 종목 카드 — 왼쪽 카드는 옆 카드에 가려 클릭이 막힌다(실제 관찰)
  if (card) { await card.click(); await sleep(900); await snap('after-card-click', '카드 클릭 직후(금액 창 또는 즉시 매수)'); }
  const amt = await p.$('#overlayBox button, #amtOk, [data-act="amtOk"]');
  if (await p.evaluate(() => typeof amtCtx !== 'undefined' && !!amtCtx)) { await snap('amount-picker', '금액 창'); await p.keyboard.press('Enter'); await sleep(800); }
  await snap('bought', '매수 뒤');
  await p.click('#openBtn'); await sleep(2500);
  await snap('market-countdown-or-open', '▶ 장 시작 직후');
  for (let i = 0; i < 3; i++) { await sleep(8000); await snap(`market-t${(i + 1) * 8}s`, '장중 진행'); }
  // 장이 끝날 때까지(최대 60초) 기다리며 도중 오버레이는 보이는 대로 기록
  for (let i = 0; i < 30; i++) {
    const st = await p.evaluate(() => ({ phase: run.phase, ov: overlayOpen, stage: !!document.querySelector('.stage-box,#stageHero') }));
    if (st.phase !== 'market') break;
    await sleep(2000);
  }
  await snap('day-end', '장 마감 직후(정산 무대 또는 간이 무대)');
  await sleep(3000); await snap('day-end-after', '정산 뒤');
  const next = await p.$('[data-act="stageNext"], [data-act="chainNext"]'); if (next) { await next.click(); await sleep(1200); }
  await snap('W1D2-premarket', '다음 날 장전 — 이 시점이 약 몇 초째인지 sec 열 참고');
  fs.writeFileSync(path.join(OUT, 'first3min.json'), JSON.stringify({ log, errs }, null, 1));
  console.log('pageerror:', JSON.stringify(errs));
  await b.close();
})();
