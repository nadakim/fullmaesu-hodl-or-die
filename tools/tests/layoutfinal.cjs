// 전투 화면 확정 레이아웃 (body.lay-f): 시나리오 (a) 9종목 전부 보유 (b) 손패 가득 (c) 긴 순자산 (d) 보유 0개 × 1920×1080 · 1280×800 · 2560×1080
// 겹침 · 잘림 · 스크롤 · 종목 시세 그룹 · 보유 패널(1열→2열→외 N건) · IDX+인버스 차트 · 상단 바 · 좌측 열 · 손패 카드 폭 · 호버 상승 · 비활성 자물쇠(+툴팁) · 좁은 창 폴백 · ?layout=classic
// 인자 2 = 스크린샷 폴더(선택)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const SHOTS = process.argv[3] || '';
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [[1920, 1080], [1280, 800], [2560, 1080]];
const open = async (b, W, H, qs) => {
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/demo.html' + (qs ? '?' + qs : ''));
  await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
  await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(1500);
  await p.evaluate(() => { window.tipChance = () => 0; });
  return p;
};
const measure = p => p.evaluate(() => {
  const R = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if(!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
  const u = uiScale, vw = innerWidth, vh = innerHeight;
  const blocks = { top: R('.play-top'), info: R('#infoCol'), chart: R('#chartBox'), news: R('.news-row'), relic: R('#relicBar'), stocks: R('#stockList'), open: R('#openBtn'), sell: R('#sellAllBtn'), pileDeck: R('#pileDeck'), pileDiscard: R('#pileDiscard') };
  const cards = [...document.querySelectorAll('#handBox .card')].map(c => R(c));
  const inter = (a, b) => a && b && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
  const names = Object.keys(blocks), over = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if(inter(blocks[names[i]], blocks[names[j]])) over.push(names[i] + '×' + names[j]);
  const cardsOverBlocks = [];
  cards.forEach((c, i) => ['chart', 'stocks', 'open', 'sell', 'info', 'pileDeck', 'pileDiscard'].forEach(n => { if(inter(c, blocks[n])) cardsOverBlocks.push(i + '×' + n); }));
  const sl = document.querySelector('#stockList'), qb = [...document.querySelectorAll('.quote-row')], pl = [...document.querySelectorAll('#positionsBox .hold-row')];
  const clipped = pl.filter(e => [...e.querySelectorAll('.h-price,.h-pnl,.h-days')].some(d => d.offsetParent && d.scrollWidth > d.clientWidth + 1)).length;
  const pbx = document.querySelector('#positionsBox').getBoundingClientRect();
  const rowsInside = qb.every(e => { const r = e.getBoundingClientRect(); return !r.height || r.bottom <= sl.getBoundingClientRect().bottom + 1; }) && pl.every(e => { const r = e.getBoundingClientRect(); return r.bottom <= pbx.bottom + 1 && r.right <= pbx.right + 1; });
  const fs = sel => { const e = document.querySelector(sel); if(!e) return 0; const cs = getComputedStyle(e); return parseFloat(cs.fontSize) * (/Press Start/.test(cs.fontFamily) ? 1 : 0.6); };   // 보이는 글자 크기 ≈ 폰트 크기 × (Press Start 1.0 · VT323·Galmuri 0.6)
  const hand = document.querySelector('#handBox');
  return { u, vw, vh, layout: document.body.dataset.layout, blocks, over, cardsOverBlocks, cards,
    docX: document.documentElement.scrollWidth - vw, docY: document.documentElement.scrollHeight - vh,
    stockScroll: sl.scrollHeight - sl.clientHeight, infoScroll: document.querySelector('#infoCol').scrollHeight - document.querySelector('#infoCol').clientHeight,
    nQuotes: qb.length, nPos: pl.length, clipped, rowsInside,
    cardW: document.querySelector('#handBox .card').offsetWidth / u, cardsInside: cards.every(c => c.l >= 0 && c.r <= vw && c.b <= vh && c.t >= 0), handFan: hand.classList.contains('fan'),
    totalFs: fs('#totalAssets'), cashFs: fs('.asset-card .val'), apFs: fs('#apText'), totalText: document.querySelector('#totalAssets').textContent,
    posBoxShown: !!R('#positionsBox') && getComputedStyle(document.querySelector('#positionsBox')).display !== 'none', bodyBg: getComputedStyle(document.body).backgroundColor };
});
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of SIZES) {
    const t = `${W}x${H}`;
    // (a) 9종목 전부 보유
    let p = await open(b, W, H, 'scenario=nine'); let m = await measure(p);
    const U = m.u;
    ok(`${t} 확정 레이아웃 적용`, m.layout === 'F' && m.handFan, m.layout);
    ok(`${t} (a) 9종목 보유 → 보유 행 9개 · 시세 12행 전부 · 시세 목록 스크롤 없음`, m.nPos === 9 && m.nQuotes === 12 && m.stockScroll <= 1 && m.rowsInside, [m.nPos, m.nQuotes, m.stockScroll]);
    ok(`${t} (a) 보유 행 글자 안 잘림 (N일째·평단→현재가·손익)`, m.clipped === 0, m.clipped);
    const order = await p.evaluate(() => { const shown = [...document.querySelectorAll('#stockList .quote-row')].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top).map(r => r.dataset.q);
      return { ok: shown.join() === QUOTE_GROUPS.flatMap(g => g.ids).join(), caps: [...document.querySelectorAll('#quoteBox .q-gcap')].filter(c => c.offsetParent && c.textContent).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top).map(c => c.textContent) }; });
    ok(`${t} (a) 시세 = 그룹 순서 고정(GROUP_ORDER) · 그룹 캡션 4개`, order.ok && order.caps.join() === '안정,성장·테마,코인·투기,인버스', order);
    const hold = await p.evaluate(() => { const ranks = [...document.querySelectorAll('#positionsBox .hold-row')].map(r => quoteRank(r.dataset.asset)); return { sorted: ranks.every((r, i) => !i || ranks[i - 1] <= r), head: document.querySelector('#holdTotal').textContent, prin: document.querySelector('#holdPrin').textContent }; });
    ok(`${t} (a) 보유 패널: 행 순서 = 그룹 순서 · 헤더 총 평가손익(금액·%)·총 원금`, hold.sorted && /[+\-−].*\(.*%\)/.test(hold.head) && /원금/.test(hold.prin), hold);
    const pair = await p.evaluate(() => [...document.querySelectorAll('#chartPair .chart-box')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: r.top }; }));
    ok(`${t} (a) IDX 차트(≈60%) + 지수 인버스 차트(≈40%) 같은 높이`, pair.length === 2 && Math.abs(pair[0].h - pair[1].h) < 1 && Math.abs(pair[0].t - pair[1].t) < 1 && Math.abs(pair[0].w / (pair[0].w + pair[1].w) - 0.6) < 0.03, pair);
    ok(`${t} (a) 블록끼리 겹침 없음`, m.over.length === 0, m.over);
    ok(`${t} (a) 가로·세로 스크롤 없음`, m.docX <= 0 && m.docY <= 0, [m.docX, m.docY]);
    ok(`${t} 상단 바 ≈ 55u · 좌측 열 171u · 차트 ≥ 229u`, Math.abs(m.blocks.top.h / U - 55) < 6 && Math.abs(m.blocks.info.w / U - 171) < 3 && m.blocks.chart.h / U >= 228, [m.blocks.top.h / U, m.blocks.info.w / U, m.blocks.chart.h / U]);
    ok(`${t} 순자산 글자가 화면에서 가장 큼 (≥ 현금·행동력 글자)`, m.totalFs >= m.cashFs && m.totalFs >= m.apFs && m.totalFs >= 16 * U, [m.totalFs, m.cashFs, m.apFs]);
    ok(`${t} 장 시작 = 우하단 대형 · 전량 매도 = 좌하단 (멀리)`, m.blocks.open.l > m.vw * 0.6 && m.blocks.open.t > m.vh * 0.8 && m.blocks.sell.l < m.vw * 0.1 && m.blocks.sell.t > m.vh * 0.85 && m.blocks.open.l - m.blocks.sell.r > m.vw * 0.4, [m.blocks.open, m.blocks.sell]);
    // 보유 행 둘째 줄 내용
    const line = await p.evaluate(() => { const e = document.querySelector('#positionsBox .hold-row'); return { txt: e.textContent.replace(/\s+/g, ' ').trim(), btn: !!e.querySelector('[data-sell]'), pnl: e.querySelector('[data-f=pnl]').className, bar: !!e.querySelector('.h-bar i') }; });
    ok(`${t} 보유 행: 종목명 · 롱/숏 · 배율 · N일째 · 평단→현재가 · 손익 · 막대 + 매도`, /(롱|숏)/.test(line.txt) && /\dx/.test(line.txt) && /\d+일째/.test(line.txt) && /[\d,]+→[\d,]+/.test(line.txt) && /[+\-−]/.test(line.txt) && line.btn && line.bar && /pnl-(up|down)/.test(line.pnl), line.txt);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/nine-${t}.png` });
    // 매도 버튼 동작: 한 포지션 매도
    const before = await p.evaluate(() => run.positions.length);
    await p.locator('#positionsBox .hold-row .sell-btn').first().click(); await sleep(300);
    const after = await p.evaluate(() => run.positions.length);
    ok(`${t} 매도 버튼 동작`, after === before - 1, [before, after]);
    ok(`${t} pageerror 없음`, p.errs.length === 0, p.errs); await p.close();

    // 한 종목에 포지션 2개
    p = await open(b, W, H, 'scenario=multi'); m = await measure(p);
    const multi = await p.evaluate(() => { const rows = [...document.querySelectorAll('#positionsBox .hold-row')].filter(e => e.dataset.asset === STOCKS[0].id); return rows.length; });
    ok(`${t} 한 종목 포지션 2개(레버리지 다름) → 보유 행 2개`, multi === 2, multi);
    await p.close();

    // (b) 손패 가득
    p = await open(b, W, H, 'scenario=hand'); m = await measure(p);
    ok(`${t} (b) 손패 10장 가득 · 부채꼴 · 화면 안`, m.cards.length === 10 && m.handFan && m.cardsInside, [m.cards.length, m.cardsInside]);
    ok(`${t} (b) 손패가 차트·시세·장 시작·정보열·더미를 가리지 않음`, m.cardsOverBlocks.length === 0, m.cardsOverBlocks);
    ok(`${t} (b) 카드 폭 ≈ 108u (190px@1080p)`, Math.abs(m.cardW - 108) < 2, m.cardW);
    ok(`${t} (b) 덱·버림 더미 장수 표시`, await p.evaluate(() => +document.querySelector('#pileDeckN').textContent === run.drawPile.length && +document.querySelector('#pileDiscardN').textContent === run.discard.length));
    ok(`${t} (b) 블록끼리 겹침 없음 · 스크롤 없음`, m.over.length === 0 && m.docX <= 0 && m.docY <= 0, [m.over, m.docX, m.docY]);
    // 비활성: 자물쇠만 · 이유는 툴팁
    const dis = await p.evaluate(() => { const c = document.querySelector('#handBox .card.disabled'); if(!c) return null; const lock = c.querySelector('.cv-lock'), reason = c.querySelector('.cv-reason'), r = c.getBoundingClientRect(), lr = lock.getBoundingClientRect();
      return { lock: getComputedStyle(lock).display !== 'none', reasonHidden: getComputedStyle(reason).display === 'none', inside: lr.left >= r.left && lr.right <= r.right && lr.top >= r.top && lr.bottom <= r.bottom, idx: [...document.querySelectorAll('#handBox .card')].indexOf(c) }; });
    ok(`${t} (b) 비활성 카드 = 자물쇠 아이콘만 (이유 문구는 카드 위에 없음)`, !!dis && dis.lock && dis.reasonHidden && dis.inside, dis);
    if (dis) {
      await p.evaluate(i => document.querySelectorAll('#handBox .card')[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), dis.idx); await sleep(600);
      const tip = await p.evaluate(() => { const t = document.querySelector('.card-tip'); return { shown: !t.hidden, reason: /🔒/.test(t.textContent) }; });
      ok(`${t} (b) 비활성 카드 호버 → 툴팁에 이유`, tip.shown && tip.reason, tip);
    }
    // 호버 상승
    const lift = await p.evaluate(async () => { const c = [...document.querySelectorAll('#handBox .card:not(.disabled)')].sort((a, b) => Math.abs(+a.style.getPropertyValue('--kx')) - Math.abs(+b.style.getPropertyValue('--kx')))[0]; if(!c) return null; const y0 = c.getBoundingClientRect().top; c.classList.add('is-hover'); await new Promise(r => setTimeout(r, 50)); const y1 = c.getBoundingClientRect().top; c.classList.remove('is-hover'); return (y0 - y1) / uiScale; });
    ok(`${t} (b) 호버 시 약 14u(24px@1080p) 상승`, lift !== null && lift > 10 && lift < 20, lift);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/hand-${t}.png` });
    ok(`${t} pageerror 없음`, p.errs.length === 0, p.errs); await p.close();

    // (c) 긴 순자산
    p = await open(b, W, H, 'scenario=long'); await sleep(1500); m = await measure(p);
    const topOver = await p.evaluate(() => { const bm = document.querySelector('.balance-main'), t = document.querySelector('#totalAssets'), tl = document.querySelector('.target-line'), tr = document.querySelector('.target-track'), br = bm.getBoundingClientRect();
      const ins = e => { const r = e.getBoundingClientRect(); return r.left >= br.left - 1 && r.right <= br.right + 1; }; const sp = document.querySelector('#speedBtns').getBoundingClientRect();
      return { text: t.textContent, totalIn: ins(t), lineIn: ins(tl), noOverlapSpeed: br.right <= sp.left + 1, total: t.getBoundingClientRect().right <= tl.getBoundingClientRect().left + 1 || tl.getBoundingClientRect().left >= t.getBoundingClientRect().right - 1 }; });
    ok(`${t} (c) 긴 순자산 "${m.totalText}" 상단 바 안 · 목표와 안 겹침 · 속도 버튼과 안 겹침`, /123억/.test(m.totalText) && topOver.totalIn && topOver.lineIn && topOver.noOverlapSpeed && topOver.total, topOver);
    ok(`${t} (c) 블록 겹침·스크롤 없음`, m.over.length === 0 && m.docX <= 0 && m.docY <= 0, [m.over, m.docX, m.docY]);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/long-${t}.png` });
    await p.close();

    // (d) 보유 0개
    p = await open(b, W, H, 'scenario=empty'); m = await measure(p);
    const empty = await p.evaluate(() => ({ txt: document.querySelector('#positionsBox').textContent.trim(), head: getComputedStyle(document.querySelector('#holdHead')).display }));
    ok(`${t} (d) 보유 0개 → '보유 종목 없음' 한 줄만 · 시세 12행`, m.nPos === 0 && empty.txt === '보유 종목 없음 · 종목 카드를 써서 매수' && empty.head === 'none' && m.nQuotes === 12, [m.nPos, empty]);
    const flat = await p.evaluate(() => [...document.querySelectorAll('.quote-row')].every(r => getComputedStyle(r.querySelector('.q-chg')).display === 'none' && getComputedStyle(r.querySelector('canvas')).display === 'none' && r.querySelector('.q-price').textContent));
    ok(`${t} (d) 등락 전부 0 → 가격만`, flat);
    ok(`${t} (d) 블록 겹침·스크롤 없음`, m.over.length === 0 && m.docX <= 0 && m.docY <= 0, [m.over, m.docX, m.docY]);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/empty-${t}.png` });
    await p.close();

    // 전 종목 보유 + 2개 더 → 2열 · 손익 큰 순 + '외 N건 합계' · 스크롤 없음
    p = await open(b, W, H, 'scenario=all'); m = await measure(p);
    const many = await p.evaluate(() => { const box = document.querySelector('#positionsBox'), more = box.querySelector('.hold-more'); return { mode: box.className, rows: box.querySelectorAll('.hold-row').length, more: more ? more.textContent : '', n: run.positions.length }; });
    ok(`${t} 포지션 ${many.n}개 → 2열(넘치면 '외 N건 합계') · 행 잘림·스크롤 없음`, /c2/.test(many.mode) && (many.rows === many.n || (/^외 \d+건 합계 [+\-−]/.test(many.more) && many.rows + +many.more.match(/\d+/)[0] === many.n)) && m.rowsInside && m.stockScroll <= 1 && m.docY <= 0, many);
    await p.close();
    // 인버스 해금 전 → IDX 차트가 전체 폭 · 인버스 행·그룹 캡션 숨김
    p = await open(b, W, H, 'scenario=lockinv');
    const li = await p.evaluate(() => ({ boxes: [...document.querySelectorAll('#chartPair .chart-box')].filter(e => e.offsetParent).length, chartW: document.querySelector('#chartBox').getBoundingClientRect().width, pairW: document.querySelector('#chartPair').getBoundingClientRect().width, invRow: !!document.querySelector('.quote-row[data-q="inv"]').offsetParent, caps: [...document.querySelectorAll('#quoteBox .q-gcap')].filter(c => c.offsetParent && c.textContent).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top).map(c => c.textContent) }));
    ok(`${t} 인버스 해금 전 → IDX 차트 전체 폭 · 인버스 행·캡션 숨김`, li.boxes === 1 && Math.abs(li.chartW - li.pairW) < 1 && !li.invRow && li.caps.indexOf('인버스') < 0, li);
    await p.close();
    // 시장 지도: [목록 | 지도] 토글 · 해금된 종목만 타일 · 그룹 캡션 · 클릭 = 목록 행과 같은 동작 · 설정 저장
    for (const [qs, n] of [['scenario=all', 12], ['scenario=lockinv,nine', 9]]) {
      p = await open(b, W, H, qs);
      await p.click('[data-qview="map"]'); await sleep(400);
      const mp = await p.evaluate(() => { const area = document.querySelector('#qmArea').getBoundingClientRect(), tiles = [...document.querySelectorAll('.qm-tile')], R = e => e.getBoundingClientRect();
        let ov = 0; for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) { const a = R(tiles[i]), c = R(tiles[j]); if(a.left < c.right - 1 && a.right > c.left + 1 && a.top < c.bottom - 1 && a.bottom > c.top + 1) ov++; }
        return { n: tiles.length, list: getComputedStyle(document.querySelector('#quoteBox')).display, ov, inside: tiles.every(t => { const r = R(t); return r.left >= area.left - 1 && r.right <= area.right + 1 && r.top >= area.top - 1 && r.bottom <= area.bottom + 1; }),
          held: tiles.filter(t => t.classList.contains('held')).every(t => /^★/.test(t.querySelector('.qm-name').textContent)), sum: /^상승 \d+ · 하락 \d+/.test(document.querySelector('#qmSum').textContent),
          caps: document.querySelectorAll('.qm-cap').length, saved: JSON.parse(localStorage.getItem('hodl.settings') || '{}').quoteView }; });
      ok(`${t} 시장 지도(${qs}) → 타일 ${n}개 · 목록 숨김 · 겹침·넘침 없음 · 보유 ★ · 상승/하락 요약 · 설정 저장`, mp.n === n && mp.list === 'none' && mp.ov === 0 && mp.inside && mp.held && mp.sum && mp.caps >= 3 && mp.saved === 'map', mp);
      const id = await p.evaluate(() => document.querySelector('.qm-tile').dataset.q);
      await p.click(`.qm-tile[data-q="${id}"]`); await sleep(250);
      ok(`${t} 지도 타일 클릭 = 그 종목 큰 차트 (목록 행과 같은 동작)`, await p.evaluate(i => chartTarget === i, id));
      await p.click('[data-qview="list"]'); await sleep(200);
      ok(`${t} 목록으로 되돌림`, await p.evaluate(() => getComputedStyle(document.querySelector('#quoteMap')).display === 'none' && settings.quoteView === 'list'));
      await p.close();
    }
  }
  // 검은 띠: 와이드 화면에서 배경(body)이 화면 끝까지 같은 색
  let p = await open(b, 2560, 1080, 'scenario=empty');
  const edge = await p.evaluate(() => { const bg = getComputedStyle(document.body).backgroundColor, cab = document.querySelector('.cabinet').getBoundingClientRect(); return { bg, cabW: cab.width, cabH: cab.height, vw: innerWidth, vh: innerHeight }; });
  ok('2560×1080 캐비닛이 화면 전체를 채움 (검은 띠 없음)', Math.abs(edge.cabW - edge.vw) < 2 && Math.abs(edge.cabH - edge.vh) < 2, edge);
  await p.close();
  // 좁은 창(1100×800)·주소 ?layout=classic → 예전 레이아웃
  p = await open(b, 1100, 800, 'scenario=nine'); let nb = await p.evaluate(() => ({ layout: document.body.dataset.layout, info: document.querySelector('#infoCol').children.length, fan: document.querySelector('#handBox').classList.contains('fan') }));
  ok('1100×800: 좁은 창은 예전 레이아웃 (정보열 비어 있음·부채꼴 없음)', nb.layout === 'classic' && nb.info === 0 && !nb.fan, nb); await p.close();
  p = await open(b, 1920, 1080, 'layout=classic'); nb = await p.evaluate(() => ({ layout: document.body.dataset.layout, info: document.querySelector('#infoCol').children.length }));
  ok('?layout=classic: 1920×1080에서도 예전 레이아웃', nb.layout === 'classic' && nb.info === 0, nb); await p.close();
  // 레이아웃 왕복: 확정 → 좁은 창 → 확정 에서 요소가 제자리
  p = await open(b, 1920, 1080, '');
  const par = () => p.evaluate(() => ({ cash: document.querySelector('.assets-grid').parentElement.id || document.querySelector('.assets-grid').parentElement.className, quotes: document.getElementById('quoteBox').parentElement.id || document.getElementById('quoteBox').parentElement.className }));
  const f1 = await par(); await p.setViewportSize({ width: 1100, height: 800 }); await sleep(500); const c1 = await par(); await p.setViewportSize({ width: 1920, height: 1080 }); await sleep(500); const f2 = await par();
  ok('창 크기 왕복: 확정 ↔ 예전 레이아웃에서 요소가 제 부모로 이동·복귀', f1.cash === 'infoCol' && c1.cash !== 'infoCol' && f2.cash === 'infoCol' && c1.quotes !== 'stockList' && f2.quotes === 'stockList', [f1, c1, f2]);
  await p.close();
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
