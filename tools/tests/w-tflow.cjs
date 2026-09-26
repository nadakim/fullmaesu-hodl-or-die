const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch(); const errs = []; const res = [];
  const ok = (n, c, i) => res.push(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' ' + JSON.stringify(i)}`);
  const p = await b.newPage({ viewport: { width: 1615, height: 900 } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8765/demo.html'); await sleep(300);
  const st = () => p.evaluate(() => ({ tab: currentTab, phase: run && run.phase, sel: (document.querySelector('#screen-title .sel') || {}).id, cont: !$('continueBtn').hidden, press: !$('titlePress').hidden, intro: $('screen-title').className, quit: !$('quitBtn').hidden }));
  let s = await st(); ok('처음: 안내 문구 · 이어하기 없음 · 종료 숨김(웹)', s.press && !s.cont && !s.quit, s);
  // 첫 입력(Enter)은 메뉴 선택으로 쓰지 않는다
  await p.keyboard.press('Enter'); await sleep(300);
  s = await st(); ok('첫 Enter: 소비만 (화면 그대로), 연출 끝, 안내 숨김, 선택 = 영끌 출격', s.tab === 'title' && !s.press && !/intro/.test(s.intro) && s.sel === 'startBtn', s);
  // Esc 무시
  await p.keyboard.press('Escape'); await sleep(100); s = await st(); ok('Esc 무시', s.tab === 'title', s);
  // ↓ 끝까지 → 아이콘까지 갔다가 순환
  const seq = [];
  for (let i = 0; i < 7; i++) { await p.keyboard.press('ArrowDown'); await sleep(40); seq.push((await st()).sel); }
  ok('↓ 순환: 손절 기계 → 파산 기록 → 환경 설정 → ⚙ → 🌐 → 영끌 출격', seq.join() === 'collectionBtn,recordsBtn,settingsBtn,titleSettingsIcon,langBtn,startBtn,collectionBtn', seq);
  await p.keyboard.press('ArrowUp'); await sleep(40);
  // 키보드만으로 각 메뉴: 도감
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await sleep(350);
  s = await st(); ok('Enter → 손절 기계(도감)', s.tab === 'collection', s);
  await p.click('#collectionBack'); await sleep(60);
  s = await st(); ok('도감 ◀ → 타이틀 (두 번째 진입: CRT만 짧게)', s.tab === 'title' && /intro-short/.test(s.intro), s); await sleep(300);
  await sleep(400);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await sleep(350);
  s = await st(); ok('Enter → 파산 기록', s.tab === 'records', s);
  await p.click('#recordsBack'); await sleep(400);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await sleep(350);
  s = await st(); ok('Enter → 환경 설정', s.tab === 'settings', s);
  await p.click('#settingsBack'); await sleep(400);
  s = await st(); ok('설정 ◀ → 타이틀', s.tab === 'title', s);
  // 영끌 출격 (판 없음 → 바로)
  await p.evaluate(() => setTitleSel(titleItems().indexOf($('startBtn')), false));
  await p.keyboard.press('Enter'); await sleep(120);
  const flashed = await p.evaluate(() => $('startBtn').classList.contains('flash'));
  await sleep(250);
  s = await st(); ok('Enter → 영끌 출격: 번쩍 → 0.2초 뒤 TR룸 장전', flashed && s.tab === 'play' && s.phase === 'premarket', { flashed, s });
  // ≡ → 타이틀 → 이어하기 보임
  await p.click('#menuBtn'); await p.locator('[data-menu="title"]').click(); await sleep(400);
  s = await st(); ok('판 있음 → 이어하기 표시', s.tab === 'title' && s.cont, s);
  // 영끌 출격 확인
  await p.evaluate(() => { run.cash = 12345; setTitleSel(titleItems().indexOf($('startBtn')), false); });
  await p.keyboard.press('Enter'); await sleep(300);
  const armed = await p.evaluate(() => [currentTab, $('startBtn').textContent, run.cash]);
  ok('진행 중 → 영끌 출격 1번: 확인 문구, 판 그대로', armed[0] === 'title' && /정말/.test(armed[1]) && armed[2] === 12345, armed);
  await p.keyboard.press('ArrowUp'); await sleep(50);
  // 이어하기
  s = await st(); ok('↑ → 이어하기 선택', s.sel === 'continueBtn', s);
  await p.keyboard.press('Enter'); await sleep(400);
  const back = await p.evaluate(() => [currentTab, run.cash, $('startBtn').textContent]);
  ok('이어하기 → TR룸, 판 그대로 (확인 해제)', back[0] === 'play' && back[1] === 12345 && back[2] === '▮[영끌 출격]', back);
  // 판 끝나면 이어하기 사라짐
  await p.evaluate(() => { run.phase = 'over'; switchTab('title'); }); await sleep(300);
  s = await st(); ok('판 끝(over) → 이어하기 숨김', !s.cont, s);
  // 확인 2번 → 새 판
  await p.evaluate(() => { startRun(); switchTab('title'); run.cash = 777; setTitleSel(titleItems().indexOf($('startBtn')), false); }); await sleep(300);
  await p.keyboard.press('Enter'); await sleep(100); await p.keyboard.press('Enter'); await sleep(400);
  const nw = await p.evaluate(() => [currentTab, run.cash]);
  ok('확인 두 번 → 새 판', nw[0] === 'play' && nw[1] !== 777, nw);
  // 언어 버튼 토스트
  await p.evaluate(() => switchTab('title')); await sleep(300);
  await p.click('#langBtn'); await sleep(200);
  ok('🌐 → English 준비 중 토스트', await p.evaluate(() => /English/.test(document.querySelector('.toast-layer') ? document.querySelector('.toast-layer').textContent : '')));
  // 마우스 호버 = 키보드 선택 공유
  await p.hover('#recordsBtn'); await sleep(100);
  s = await st(); ok('호버 → 같은 선택 상태', s.sel === 'recordsBtn', s);
  // 제작자·링크 설정값
  const meta = await p.evaluate(() => [$('titleAuthor').hidden, $('steamLink').hidden, $('discordLink').hidden, $('titleVersion').textContent]);
  ok('제작자·링크 비어 있으면 숨김, 버전 표기', meta[0] && meta[1] && meta[2] && meta[3] === 'Version 0.1 (DEMO)', meta);
  // Electron 구멍
  const p2 = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p2.addInitScript(() => { window.electronAPI = { quit: () => { window.__quit = true; } }; });
  await p2.goto('http://127.0.0.1:8765/demo.html'); await sleep(300); await p2.keyboard.press('Shift'); await sleep(100);
  const q = await p2.evaluate(() => !$('quitBtn').hidden);
  await p2.click('#quitBtn'); await sleep(350);
  ok('electronAPI 있으면 [종료] 표시 · 누르면 quit()', q && await p2.evaluate(() => !!window.__quit));
  console.log(res.join('\n')); console.log('errors', errs); await b.close(); })();
