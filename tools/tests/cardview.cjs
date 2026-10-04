// 공용 카드 컴포넌트 cardView: 손패·보상·암시장·덱·도감이 전부 이 하나 · 2:3 · 효과 1줄 ≤14자 · 희귀도 3중 표시 · 상태 5종 · 툴팁 · 날아가는 복제본
// + 상태 시트 shots/card-states.png (인자 2 = 저장 폴더, 기본 shots)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2] || '/tmp', SHOTS = process.argv[3] || 'shots';
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920, 1080], [1280, 800]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html');
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(900);
    await p.evaluate(() => { window.tipChance = () => 0; });

    // 1) 손패 — 같은 컴포넌트, 2:3, 이유 문구
    await p.evaluate(() => { run.hand = ['stk_semi', 'stopLoss', 'credit', 'dove', 'yolo', 'trauma'].map(newCard); run.ap = 0; handSig = ''; renderAll(); });
    await sleep(700);
    const hand = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('#handBox .card')];
      return { n: cs.length, cv: cs.every(c => c.classList.contains('cv')), old: document.querySelectorAll('#handBox .g-top, #handBox .c-desc').length,
        ratio: cs.map(c => { const r = c.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); }),
        reasons: cs.filter(c => c.classList.contains('disabled')).map(c => c.querySelector('.cv-reason').textContent),
        reasonVisible: cs.filter(c => c.classList.contains('disabled')).every(c => getComputedStyle(c.querySelector('.cv-reason')).display !== 'none'),
        gems: [...new Set(cs.map(c => getComputedStyle(c.querySelector('.cv-gem')).clipPath))].length };
    });
    ok(`${W} 손패 6장 전부 cardView`, hand.n === 6 && hand.cv && hand.old === 0, hand);
    ok(`${W} 손패 2:3 비율`, hand.ratio.every(r => Math.abs(r - 2 / 3) < 0.02), hand.ratio);
    ok(`${W} 행동력 0일 때 못 쓰는 카드에 이유 문구`, hand.reasons.length >= 3 && hand.reasonVisible && hand.reasons.some(t => t === '행동력 부족'), hand.reasons);
    ok(`${W} 보석 모양이 등급마다 다름`, hand.gems >= 3, hand.gems);

    // 2) 표준 크기(보상·암시장·덱·도감) — 2:3, 효과 1줄 ≤14자·넘치지 않음, 글자 크기
    await p.evaluate(() => { run.phase = 'reward'; run.rewardStep = 'card'; run.rewardChoices = ['dove', 'hawk', 'stopLoss']; run.relicChoices = []; showReward(); });
    await sleep(600);
    const rw = await p.evaluate(() => {
      const cs = [...document.querySelectorAll('#overlayBox .card[data-reward]')];
      return { n: cs.length, cv: cs.every(c => c.classList.contains('cv')), ratio: cs.map(c => { const r = c.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); }),
        line: cs.map(c => c.querySelector('.cv-line').textContent), over: cs.map(c => { const l = c.querySelector('.cv-line'); return l.scrollWidth - l.clientWidth; }) };
    });
    ok(`${W} 보상 카드 3장 cardView · 2:3`, rw.n === 3 && rw.cv && rw.ratio.every(r => Math.abs(r - 2 / 3) < 0.02), rw);
    ok(`${W} 보상 카드 효과 1줄이 칸 안에`, rw.over.every(o => o <= 1), rw.over);
    const raw = await p.evaluate(() => Object.entries(CARD_SHORT).filter(([k, v]) => v.length > CARD_SHORT_MAX).map(([k, v]) => k + ':' + v));
    ok('CARD_SHORT 원문이 전부 14자 이하 (잘려서 … 붙는 카드 없음)', raw.length === 0, raw);
    const all = await p.evaluate(() => CARDS.map(c => ({ id: c.id, t: cardShort(c) })));
    ok(`모든 카드(${all.length}장) 효과 1줄 ≤ 14자 · 비어 있지 않음`, all.every(c => c.t.length >= 1 && c.t.length <= 14), all.filter(c => c.t.length > 14 || !c.t));
    const fit = await p.evaluate(() => {   // 76장 전부 표준 카드로 그려 효과 줄이 안 넘치는지
      const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:0;top:0;width:3000px;z-index:-1;display:flex;flex-wrap:wrap;';
      holder.innerHTML = CARDS.map(c => cardHtml(c, {})).join(''); document.body.appendChild(holder);
      const bad = [...holder.querySelectorAll('.card')].filter(c => { const l = c.querySelector('.cv-line'); return l.scrollWidth - l.clientWidth > 1; }).map(c => c.dataset.cid);
      holder.remove(); return bad; });
    ok(`${W} 효과 1줄이 넘치는 카드 없음 (전 카드)`, fit.length === 0, fit);
    const fs = await p.evaluate(() => { const c = document.querySelector('#overlayBox .card[data-reward]'); const px = sel => parseFloat(getComputedStyle(c.querySelector(sel)).fontSize);
      return { cost: px('.cv-cost'), name: px('.cv-name'), line: px('.cv-line'), u: uiScale }; });
    if(W === 1920) ok('1080p 글자 크기: 코스트 ≥40 · 이름 ≥20 · 효과 줄 ≥16', fs.cost >= 40 && fs.name >= 20 && fs.line >= 16, fs);

    // 3) 툴팁(호버) — 전문
    const first = p.locator('#overlayBox .card[data-reward]').first();
    await first.hover(); await sleep(500);
    const tip = await p.evaluate(() => { const t = document.querySelector('.card-tip'); return { shown: !t.hidden, text: t.textContent.length > 20 }; });
    ok(`${W} 호버하면 전문 툴팁`, tip.shown && tip.text, tip);
    const hov = await first.evaluate(c => { const cs = getComputedStyle(c); return cs.transform; });
    ok(`${W} 호버 = 위로 상승(transform 변화)`, hov !== 'none', hov);

    // 4) 암시장 · 덱 · 도감
    await p.evaluate(() => { openShop(); switchTab('shop'); renderAll(); });
    await sleep(900);
    const shop = await p.evaluate(() => { const cs = [...document.querySelectorAll('#shopBox .card')]; return { n: cs.length, cv: cs.every(c => c.classList.contains('cv')), old: document.querySelectorAll('#shopBox .c-desc, #shopBox .sym').length }; });
    ok(`${W} 암시장 카드 전부 cardView`, shop.n > 0 && shop.cv && shop.old === 0, shop);
    await p.screenshot({ path: `${S}/cardview-shop-${W}.png` });
    await p.evaluate(() => { switchTab('play'); renderAll(); });
    await sleep(300);
    await p.close();
  }

  // 5) 상태 시트 + 선택·비활성·날아가기 (1920×1080)
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html');
  await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
  await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(900);
  await p.evaluate(() => { window.tipChance = () => 0; });
  await p.evaluate(() => { run.hand = ['stk_semi', 'dove', 'credit', 'yolo'].map(newCard); handSig = ''; renderAll(); });
  await sleep(600);
  // selected: 대상 지정 카드(손절 예약 → 포지션 필요) 대신 종목 카드로 클릭 선택이 되는지 — 선택 상태는 UI의 selectedIdx
  await p.evaluate(() => { run.positions.length || playCard(0, null); run.hand = ['stopLoss', 'stk_coin', 'dove'].map(newCard); handSig = ''; renderAll(); });
  await sleep(600);
  await p.locator('#handBox .card').first().click(); await sleep(300);
  const sel = await p.evaluate(() => { const c = document.querySelector('#handBox .card.selected'); if(!c) return null; const cs = getComputedStyle(c); return { shadow: cs.boxShadow, transform: cs.transform, rc: cs.getPropertyValue('--rc').trim() }; });
  ok('선택 상태: 흰 윤곽선(--text) + 위로 상승, 희귀도 링과 별개', !!sel && sel.shadow.includes('rgb(212, 222, 255)') && sel.transform !== 'none', sel);
  await p.keyboard.press('Escape'); await sleep(200);
  // played: 카드를 쓰면 복제본이 차트 쪽으로 날아간다
  await p.evaluate(() => { run.hand = ['dove', 'stk_coin'].map(newCard); run.ap = 3; handSig = ''; renderAll(); });
  await sleep(500);
  await p.evaluate(() => { window.__ghosts = []; const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if(n.classList && n.classList.contains('fx-card-ghost')) window.__ghosts.push({ cls: n.className, r0: n.getBoundingClientRect().toJSON(), t0: performance.now(), el: n }); }))); mo.observe(document.body, { childList: true }); });
  await p.evaluate(() => playCardFx(0, null));
  await sleep(340);   // 날아가기 420ms 중 후반(대상 쪽 이동 구간)
  const g = await p.evaluate(() => { const o = window.__ghosts[0]; if(!o) return null; const r1 = o.el.isConnected ? o.el.getBoundingClientRect() : o.r0, ch = $('chartBox').getBoundingClientRect();
    return { cls: o.cls, played: o.cls.includes('played'), cv: o.cls.includes('cv'), x0: o.r0.left + o.r0.width / 2, y0: o.r0.top + o.r0.height / 2, x1: r1.left + r1.width / 2, y1: r1.top + r1.height / 2, cx: ch.left + ch.width / 2, cy: ch.top + ch.height / 2 }; });
  ok('played: 복제본(.played)이 생기고 차트 중심 쪽으로 이동', !!g && g.played && g.cv && Math.hypot(g.x1 - g.cx, g.y1 - g.cy) < Math.hypot(g.x0 - g.cx, g.y0 - g.cy), g);
  await sleep(700);

  // 상태 시트
  await p.evaluate(() => {
    switchTab('play'); renderAll();
    const rar = [['stk_semi', 'common'], ['dove', 'uncommon'], ['levEtf', 'rare'], ['yolo', 'legendary'], ['manip', 'mythic']];
    const states = [['idle', ''], ['hover', 'is-hover tilt'], ['selected', 'selected'], ['disabled', 'disabled'], ['played', 'played']];
    const wrap = document.createElement('div'); wrap.id = 'cardSheet';
    wrap.style.cssText = 'position:fixed;left:0;top:0;width:calc(100vw / 0.4);height:calc(100vh / 0.4);zoom:.4;z-index:200;background:var(--bg);padding:calc(14*var(--u)) calc(24*var(--u));display:flex;flex-direction:column;gap:calc(10*var(--u));font-family:var(--gf-sm),monospace;color:var(--text);';
    const row = (title, cells) => `<div style="display:flex;gap:calc(26*var(--u));align-items:flex-start"><div style="width:calc(70*var(--u));font-size:var(--fs-sm);color:var(--gold);padding-top:calc(90*var(--u))">${title}</div>${cells}</div>`;
    let html = `<div style="font-size:var(--fs-lg);color:var(--gold)">카드 상태 시트 (40% 축소) — idle · hover(8↑ ±2°) · selected(흰 윤곽선 8↑) · disabled(이유) · played(날아가는 복제본)</div>`;
    html += `<div style="display:flex;gap:calc(26*var(--u));margin-left:calc(96*var(--u))">${states.map(([n]) => `<div style="width:calc(152*var(--u));font-size:var(--fs-sm);color:var(--cyan)">${n}</div>`).join('')}</div>`;
    rar.forEach(([id, rr]) => {
      const card = CARD_BY_ID[id];
      html += row(rr, states.map(([n, cls]) => cardHtml(card, { cls: cls + (n === 'tilt' ? '' : ''), reason: n === 'disabled' ? '행동력 부족' : '', ap: card.ap })).map((h, i) => i === 1 ? h.replace('class="card', 'style="--rx:2deg;--ry:-2deg" class="card') : h).join(''));
    });
    html += row('손패형', states.map(([n, cls]) => `<div style="width:calc(100*var(--u))">${handCardHtml(CARD_BY_ID['credit'], { cls: cls, reason: n === 'disabled' ? '행동력 부족' : '', ap: 1 })}</div>`).join('') + `<div style="font-size:var(--fs-xs);color:var(--muted);width:calc(220*var(--u))">손패형은 효과 줄 숨김(툴팁), 나머지 동일</div>`);
    wrap.innerHTML = html; document.body.appendChild(wrap);
    wrap.querySelectorAll('.card').forEach(c => c.style.pointerEvents = 'none');
  });
  await sleep(500);
  const sheetFile = `${SHOTS}/card-states.png`;
  await p.screenshot({ path: sheetFile });
  ok('상태 시트 저장 ' + sheetFile, true);

  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
