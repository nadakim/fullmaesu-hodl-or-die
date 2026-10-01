// 알림(토스트) 위치: 데스크톱은 왼쪽 아래(시세표 하단) — 상단 HUD·차트·장 시작·전량 매도와 겹침 0, 새 알림이 맨 아래, 동시에 3개 이하, 글자 --fs-sm 이상. 모바일(390)은 겹침만 보고
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920, 1080], [1366, 768], [1280, 1024], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html');
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.keyboard.press('Shift'); await p.click('#startBtn'); await sleep(500);
    await p.evaluate(() => { window.tipChance = () => 0; toast('첫째 알림', 'info'); toast('▶ 장 시작!', 'good'); toast('청산 경고: 담보가 부족합니다', 'bad'); toast('금감원 감시 게이지 상승', 'warn'); });
    await sleep(300);
    const r = await p.evaluate(() => { const R = s => { const e = document.querySelector(s); if(!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { toasts: [...document.querySelectorAll('#toastLayer > *')].map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: e.textContent }; }),
        hud: R('.hud-col'), chart: R('#chartBox'), open: R('#openBtn'), sell: R('#sellAllBtn'),
        fs: parseFloat(getComputedStyle(document.querySelector('.toast')).fontSize), ui: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1, pe: getComputedStyle(document.getElementById('toastLayer')).pointerEvents }; });
    const ov = {}; for (const k of ['hud', 'chart', 'open', 'sell']) ov[k] = Math.round(r.toasts.reduce((s, t) => s + (r[k] ? area(t, r[k]) : 0), 0));
    console.log(`${W}x${H} 겹침 넓이(px²)`, JSON.stringify(ov));
    ok(`${W} 동시에 보이는 알림 ≤ 3`, r.toasts.length <= 3, r.toasts.length);
    ok(`${W} 알림 글자 ≥ --fs-sm(12 × --ui)`, r.fs >= 12 * r.ui - 0.5, [r.fs, r.ui]);
    ok(`${W} 알림 레이어 pointer-events:none`, r.pe === 'none');
    if (W > 900) {
      ok(`${W} HUD·차트·장 시작·전량 매도와 겹침 0`, Object.values(ov).every(v => v === 0), ov);
      ok(`${W} 새 알림이 맨 아래 (오래된 것이 위)`, r.toasts.length === 3 && r.toasts[2].text.includes('금감원') && r.toasts[0].top < r.toasts[2].top, r.toasts.map(t => Math.round(t.top)));
      ok(`${W} 화면 밖으로 안 나감`, r.toasts.every(t => t.left >= 0 && t.right <= W && t.bottom <= H && t.top >= 0));
    } else { console.log(`${W} (모바일, 기존 위치 유지) HUD 겹침 ${ov.hud}px² — 보고용`); }
    await p.screenshot({ path: `${S}/toastpos-${W}.png` });
    await p.close();
  }
  ok('pageerror 없음', errs.length === 0, errs);
  console.log(`\n${fail ? 'FAIL' : 'PASS'} ${fail} / ${pass + fail}`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
