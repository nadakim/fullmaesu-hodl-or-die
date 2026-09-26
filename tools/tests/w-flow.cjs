const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2]; const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => { const b = await chromium.launch(); const errs = []; const res = [];
  const p = await b.newPage({ viewport: { width: 1615, height: 900 } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const ok = (n, c, info) => res.push(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' ' + JSON.stringify(info)}`);
  const st = () => p.evaluate(() => ({ tab: currentTab, phase: run && run.phase, round: run && run.round, day: run && run.day, overlay: overlayOpen, menu: !$('menuPanel').hidden, cont: !$('continueBtn').hidden, tabnav: !!document.querySelector('.tabnav') }));
  await p.goto('http://127.0.0.1:8765/demo.html'); await p.keyboard.press('Shift'); await sleep(300);
  let s = await st(); ok('타이틀: 탭 없음 · 이어하기 숨김', s.tab === 'title' && !s.tabnav && !s.cont, s);
  await p.click('#startBtn'); await sleep(300);
  s = await st(); ok('출격 → TR룸 장전', s.tab === 'play' && s.phase === 'premarket', s);
  await p.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi', 'stopLoss'].map(newCard); handSig = ''; renderAll(); });
  await p.locator('#handBox .card').first().click(); await sleep(200);
  ok('손패 격자 카드 클릭 → 매수', await p.evaluate(() => run.positions.length === 1));
  // 대상 지정 중 Esc = 취소 우선
  await p.locator('#handBox .card', { hasText: '손절 예약' }).click(); await sleep(150);
  ok('대상 지정 시작 · 포지션 금색 강조', await p.evaluate(() => selectedIdx >= 0 && !!document.querySelector('.pos-item.targetable') && !!document.querySelector('#handBox .card.selected')));
  await p.keyboard.press('Escape'); await sleep(100);
  s = await st(); ok('Esc: 대상 지정 취소 (메뉴 안 열림)', await p.evaluate(() => selectedIdx === -1) && !s.menu, s);
  await p.keyboard.press('Escape'); await sleep(100);
  s = await st(); ok('Esc: 메뉴 열기', s.menu, s);
  await p.screenshot({ path: `${S}/w/menu-1615.png` });
  await p.keyboard.press('Escape'); await sleep(100);
  s = await st(); ok('Esc: 메뉴 닫기', !s.menu, s);
  // 장중 → 찌라시 도착 · 선택
  await p.click('#openBtn'); await sleep(300);
  s = await st(); ok('장 시작 → 장중', s.phase === 'market', s);
  await p.evaluate(() => { openTip('mom'); renderAll(); onGameEvent('tipEvent', {}); }); await sleep(300);
  ok('찌라시 도착 → TR룸 중앙 오버레이', await p.evaluate(() => overlayOpen && !!$('overlayBox').querySelector('[data-tip-choice]')));
  await p.screenshot({ path: `${S}/w/tip-1615.png` });
  await p.locator('#overlayBox [data-tip-choice="1"]').click(); await sleep(300);
  await p.evaluate(() => Fx.skipQueue()); await sleep(400);
  ok('찌라시 선택 → 결과 기록', await p.evaluate(() => run.tipLog.length === 1 && !run.pendingTip));
  const dotAfterShown = await p.evaluate(() => !$('menuDot').hidden);
  await p.evaluate(() => { if(overlayOpen) hideOverlay(); });
  // 결과 오버레이 안 본 미확인 결과 → 점
  await p.evaluate(() => { openTip('mom'); hideOverlay(); resolveTip(0); Fx.skipQueue(); renderAll(); }); await sleep(300);   // 결과 오버레이가 안 뜬 경우
  await p.evaluate(() => { if(overlayOpen) hideOverlay(); renderAll(); });
  ok('미확인 찌라시 결과 → 메뉴 점', await p.evaluate(() => !$('menuDot').hidden), { dotAfterShown });
  await p.click('#menuBtn'); await sleep(100);
  await p.locator('[data-menu="tips"]').click(); await sleep(200);
  ok('찌라시 기록 오버레이 (2건) · 점 꺼짐', await p.evaluate(() => overlayOpen && $('overlayBox').querySelectorAll('.tip-log li').length === 2 && $('menuDot').hidden));
  await p.screenshot({ path: `${S}/w/tiplog-1615.png` });
  await p.locator('#overlayBox [data-act="close"]').click(); await sleep(150);
  // 덱 확인
  await p.click('#menuBtn'); await p.locator('[data-menu="deck"]').click(); await sleep(150);
  ok('메뉴 → 덱 확인', await p.evaluate(() => overlayOpen && !!$('overlayBox').querySelector('.deck-list')));
  await p.evaluate(() => hideOverlay());
  // 설정 → 돌아가기
  await p.click('#menuBtn'); await p.locator('[data-menu="settings"]').click(); await sleep(150);
  s = await st(); ok('메뉴 → 환경 설정', s.tab === 'settings' && (await p.textContent('#settingsBack')).includes('TR룸'), s);
  await p.click('#settingsBack'); await sleep(150);
  s = await st(); ok('설정 ◀ TR룸 → 복귀', s.tab === 'play', s);
  // 타이틀로 → 이어하기
  await p.click('#menuBtn'); await p.locator('[data-menu="title"]').click(); await sleep(200);
  const snap = await p.evaluate(() => [run.round, run.day, run.tickInDay, run.positions.length, run.cash]);
  s = await st(); ok('메뉴 → 타이틀 (판 유지, 이어하기 보임)', s.tab === 'title' && s.cont && s.phase === 'market', s);
  await sleep(1800);
  ok('타이틀에 있는 동안 시장 정지', await p.evaluate(s => run.tickInDay === s[2], snap));
  await p.click('#continueBtn'); await sleep(200);
  s = await st(); ok('이어하기 → TR룸 복귀, 판 그대로', s.tab === 'play' && await p.evaluate(s => run.round === s[0] && run.day === s[1] && run.positions.length === s[3], snap), s);
  // 결산 → 보상 → 암시장 → 다음 주
  await p.evaluate(() => { run.cash += 5000; run.day = DAYS_PER_ROUND; while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll(); });
  await p.evaluate(async () => { for(let i = 0; i < 100 && !chainHold && !document.querySelector('[data-act="toReward"]'); i++) await new Promise(r => setTimeout(r, 100)); });
  await sleep(700);
  if (await p.locator('[data-act="chainNext"]').count()) { await p.locator('[data-act="chainNext"]').click(); await sleep(300); }
  ok('주간 결산 화면', await p.locator('[data-act="toReward"]').count() === 1);
  await p.locator('[data-act="toReward"]').click(); await sleep(250);
  await p.locator('[data-reward]').first().click(); await sleep(250);
  if (await p.locator('[data-relic-reward]').count()) await p.locator('[data-relic-reward]').first().click();
  await sleep(400);
  s = await st(); ok('보상 → 암시장 자동 진입', s.tab === 'shop' && s.phase === 'shop', s);
  await p.locator('#shopLeaveBtn').click(); await sleep(300);
  s = await st(); ok('다음 주 개장 → TR룸 WEEK 2', s.tab === 'play' && s.round === 2 && s.phase === 'premarket', s);
  // 장세 뱃지
  const badge = await p.evaluate(() => { const out = []; for (const m of ['NORMAL','BULL','BEAR','VOLATILE']) { marketState = m; renderHud(); out.push(m + ':' + ($('marketStateBadge').hidden ? '-' : $('marketStateBadge').textContent)); } marketState = 'NORMAL'; renderHud(); return out; });
  ok('장세 뱃지', badge.join() === 'NORMAL:-,BULL:▲강세,BEAR:▼약세,VOLATILE:⚡변동성', badge);
  console.log(res.join('\n')); console.log('errors', errs); await b.close(); })();
