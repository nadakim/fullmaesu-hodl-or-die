// CRT 곡률(배럴 왜곡) 클릭 정확도 게이트 — 곡률을 켠 채(?crt=0 없이) 연다.
// 화면마다 주요 버튼의 레이아웃 좌표(중심 + 네 모서리 3px 안쪽)를 crtSeen(수식의 역)으로 '눈에 보이는 위치'로 바꿔 마우스로 누르고,
// 다시 보내진 click이 그 버튼 안에 도착하는지 단언한다. 곡률 30%(기본)·100%(최대) × 1920x1080·1280x800·2560x1080.
// 대조군: 보정을 끄면(crtCurve = null) 같은 클릭 중 일부가 빗나가야 테스트가 의미 있다.
// 끝에 효과 확인: 장 시작(우하단)·전량 매도(좌하단)·장 속도(상단)·≡ 메뉴(상단)·설정 스테퍼를 보이는 위치로 눌러 상태가 바뀌는지.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2] || '/tmp/hodl-test'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:8765/demo.html?scenario=nine';
const RES = [[1920, 1080], [1280, 800], [2560, 1080]];
const LEVELS = [30, 100];
const SCREENS = {
  title: { sel: ['#settingsBtn', '#titleMenu .t-item'] },
  settings: { go: async p => { await p.evaluate(() => { switchTab('settings'); }); await sleep(400); },
    sel: ['#settingsBack', '[data-step="crtVig"][data-d="10"]', '[data-step="crtCurve"][data-d="-10"]'] },
  battle: { go: async p => { await p.evaluate(() => { switchTab('title'); }); await sleep(200); await p.evaluate(() => $('startBtn').click()); await sleep(1500); await p.evaluate(() => { window.tipChance = () => 0; Fx.skipQueue(); }); await sleep(300); },
    sel: ['#openBtn', '#sellAllBtn', '#menuBtn', '#speedBtns button', '#topSettingsBtn', '.quote-row'] },
  settle: { go: async p => { await p.evaluate(() => { run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); STOCKS.forEach(s => { assets[s.id].price *= 1.004; }); tick(); } Fx.skipQueue(); }); await sleep(1500);
      await p.evaluate(() => { if(chainPlay) skipSettlementChain(); if(chainHold){ chainHold.readyAt = 0; chainNext(); } }); await sleep(800); },
    sel: ['[data-act="toReward"]'] },
  shop: { go: async p => { await p.evaluate(() => { hideOverlay(); run.slush = 50000; openShop(); switchTab('shop'); renderAll(); }); await sleep(1500); },
    sel: ['#shopLeaveBtn', '.pack'] }
};
(async () => { const b = await chromium.launch(); const errs = []; let fail = 0, total = 0; const out = [];
  const ok = (name, cond, info) => { total++; if(!cond) fail++; if(!cond) out.push('FAIL ' + name + '  ' + JSON.stringify(info || '')); };
  // 보이는 위치를 눌러 보정된 click이 어디에 도착했는지 (도착만 기록하고 핸들러는 막는다)
  async function probe(p, sel){
    return p.evaluate(sel => {
      const first = document.querySelector(sel); if(first && typeof revealPaged === 'function') revealPaged(first);
      const els = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden' && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) && e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
      if(!els.length) return null;
      const e = els[0], r = e.getBoundingClientRect(), m = 3;
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + m, r.top + m], [r.right - m, r.top + m], [r.left + m, r.bottom - m], [r.right - m, r.bottom - m]]
        .filter(([x, y]) => e.contains(document.elementFromPoint(x, y)));
      e.setAttribute('data-crt-probe', '1');
      return pts.map(([x, y]) => ({ lay: [x, y], seen: crtSeen(x, y) }));
    }, sel);
  }
  for (const [W, H] of RES) for (const lv of LEVELS) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(lv => { try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.setItem('hodl.settings', JSON.stringify({ crtOn: true, crtCurve: lv })); } catch(e) {} }, lv);
    await p.goto(URL); await p.keyboard.press('Shift'); await sleep(1600);
    await p.evaluate(() => { window.__hits = []; window.__probe = true;
      window.addEventListener('click', e => { if(!window.__probe || e.isTrusted) return; window.__hits.push(!!e.target.closest('[data-crt-probe]')); e.stopImmediatePropagation(); e.preventDefault(); }, true); });
    ok(`${W}x${H} ${lv}% 필터 켜짐`, await p.evaluate(() => !!crtCurve && document.documentElement.style.filter.includes('crtBarrel')));
    let missNoFix = 0, ptsAll = 0;
    for (const [name, sc] of Object.entries(SCREENS)) {
      if (sc.go) { await p.evaluate(() => { window.__probe = false; }); await sc.go(p); await p.evaluate(() => { window.__probe = true; }); }
      for (const sel of sc.sel) {
        await p.evaluate(() => document.querySelectorAll('[data-crt-probe]').forEach(e => e.removeAttribute('data-crt-probe')));
        const pts = await probe(p, sel);
        ok(`${W}x${H} ${lv}% ${name} ${sel} 보임`, !!(pts && pts.length));
        if (!pts) continue;
        for (const pt of pts) {
          await p.evaluate(() => { window.__hits = []; });
          await p.mouse.click(pt.seen[0], pt.seen[1]); await sleep(30);
          const h = await p.evaluate(() => window.__hits);
          ok(`${W}x${H} ${lv}% ${name} ${sel} @(${pt.lay.map(Math.round)}) → 보이는 (${pt.seen.map(Math.round)})`, h.length === 1 && h[0], h);
          // 대조군: 보정 끔
          const miss = await p.evaluate(async ([x, y]) => { const c = crtCurve; crtCurve = null; window.__hits = []; window.__raw = null;
            window.__rawF && window.removeEventListener('click', window.__rawF, true);
            window.__rawF = e => { if(!e.isTrusted) return; window.__raw = !!e.target.closest('[data-crt-probe]'); e.stopImmediatePropagation(); e.preventDefault(); };
            window.addEventListener('click', window.__rawF, true); return { c: JSON.stringify(c) }; }, pt.seen);
          await p.mouse.click(pt.seen[0], pt.seen[1]); await sleep(30);
          const raw = await p.evaluate(c => { crtCurve = JSON.parse(c); window.removeEventListener('click', window.__rawF, true); window.__rawF = null; return window.__raw; }, miss.c);
          ptsAll++; if (raw === false) missNoFix++;
        }
      }
    }
    ok(`${W}x${H} ${lv}% 대조군(보정 끔)에서 빗나가는 클릭이 있음`, missNoFix > 0, { missNoFix, ptsAll });
    out.push(`${W}x${H} 곡률 ${lv}%: 보정 끔이면 ${missNoFix}/${ptsAll} 빗나감`);
    // 효과 확인 (보이는 위치를 실제로 눌러 핸들러가 돈다)
    await p.evaluate(() => { window.__probe = false; hideOverlay(); startNewRun({ unlockWeek: 8 }); switchTab('play'); window.tipChance = () => 0; renderAll(); });
    await sleep(900); await p.evaluate(() => Fx.skipQueue()); await sleep(200);
    const press = async sel => { const pt = await p.evaluate(sel => { const e = [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width > 4); const r = e.getBoundingClientRect(); return crtSeen(r.left + r.width / 2, r.top + r.height / 2); }, sel); await p.mouse.click(pt[0], pt[1]); await sleep(250); };
    // 호버: 손패 카드의 보이는 위치에 올리면 카드 툴팁이 뜨고, 치우면 사라진다
    const hp = await p.evaluate(() => { for(const c of document.querySelectorAll('#handBox .card[data-cid]')){ const r = c.getBoundingClientRect();
      for(const [fx, fy] of [[.5, .3], [.8, .3], [.2, .3]]){ const x = r.left + r.width * fx, y = r.top + r.height * fy; const t = document.elementFromPoint(x, y);
        if(t && t.closest('.card[data-cid]') === c){ c.setAttribute('data-crt-hover', '1'); return crtSeen(x, y); } } } return null; });
    if (hp) { await p.mouse.move(hp[0] - 40, hp[1] - 60); await p.mouse.move(hp[0], hp[1], { steps: 4 }); await sleep(700); }
    ok(`${W}x${H} ${lv}% 호버 → 카드 툴팁`, !!hp && await p.evaluate(() => !cardTipEl.hidden && !!crtHoverEl && !!crtHoverEl.closest('[data-crt-hover]')));
    await p.mouse.move(W / 2, 5, { steps: 3 }); await sleep(200);
    ok(`${W}x${H} ${lv}% 호버 해제 → 툴팁 닫힘`, await p.evaluate(() => cardTipEl.hidden));
    await press('#speedBtns button:last-child'); ok(`${W}x${H} ${lv}% 상단 장 속도`, await p.evaluate(() => settings.speed === 4));
    await press('#speedBtns button:nth-child(2)');
    await press('#menuBtn'); ok(`${W}x${H} ${lv}% 상단 ≡ 메뉴`, await p.evaluate(() => !$('menuPanel').hidden && getComputedStyle($('menuPanel')).display !== 'none'));
    await press('#menuBtn');
    await p.evaluate(() => { openPosition('coin', 1500, 1, 1, true); renderAll(); }); await sleep(200);
    await press('#sellAllBtn'); await sleep(300); await p.evaluate(() => Fx.skipQueue && Fx.skipQueue());
    ok(`${W}x${H} ${lv}% 좌하단 전량 매도`, await p.evaluate(() => run.positions.length === 0), await p.evaluate(() => run.positions.length));
    await press('#openBtn'); await sleep(400); await p.evaluate(() => Fx.skipQueue());
    ok(`${W}x${H} ${lv}% 우하단 장 시작`, await p.evaluate(() => run.phase === 'market'));
    await p.evaluate(() => { switchTab('settings'); }); await sleep(400);
    const v0 = await p.evaluate(() => { revealPaged(document.querySelector('[data-step="crtVig"][data-d="10"]')); return settings.crtVig; }); await sleep(100);
    await press('[data-step="crtVig"][data-d="10"]');
    ok(`${W}x${H} ${lv}% 설정 스테퍼 비네트 +`, await p.evaluate(v0 => settings.crtVig === v0 + 10, v0));
    if (W === 1920 && lv === 30) await p.screenshot({ path: `${S}/crt-curve-battle.png` });
    await ctx.close();
  }
  // 0% = 필터 없음
  const p0 = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p0.addInitScript(() => { try { localStorage.setItem('hodl.settings', JSON.stringify({ crtOn: true, crtCurve: 0 })); } catch(e) {} });
  await p0.goto(URL); await sleep(500);
  ok('곡률 0% = 필터·맵 없음', await p0.evaluate(() => !crtCurve && !document.documentElement.style.filter && !$('crtSvg')));
  await p0.goto(URL.replace('?', '?crt=0&')); await p0.evaluate(() => localStorage.setItem('hodl.settings', JSON.stringify({ crtOn: true, crtCurve: 100 }))); await p0.reload(); await sleep(500);
  ok('?crt=0 = 필터·맵 없음', await p0.evaluate(() => !crtCurve && !document.documentElement.style.filter && !$('crtSvg')));
  ok('page errors 없음', errs.length === 0, errs);
  out.forEach(l => console.log(l));
  console.log(`FAIL ${fail} / ${total}`); await b.close(); })();
