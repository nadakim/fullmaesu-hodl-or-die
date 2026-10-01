// N2 자원 정리: HUD 상시 = 순자산(+목표 막대)·현금·행동력·예상 정산 배수 · 대출/이자/확정손익은 순자산 툴팁 · 비자금 작게 ·
// 금감원 게이지 0이면 숨김 · 포지션 심지 게이지(숫자는 툴팁) · 화면에 전문용어(증거금률·담보·대차) 없음
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[390,844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto((process.env.TEST_BASE || 'http://127.0.0.1:8765') + '/demo.html'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    await p.evaluate(() => { clearToasts(); openPosition('coin', 1000, 2, 1, true); openPosition('meme', 800, 3, 1, true); run.slush = 420; run.realized = 77; run.interestPaid = 5; posSig = ''; renderAll(); });
    await sleep(200);
    const hud = await p.evaluate(`(${vis.toString()}, (() => { const v = ${vis.toString()};
      return { total: v($('totalAssets')), target: v($('targetFill').parentElement), cash: v($('availableCash')), ap: v($('apPips')), mult: v($('multPreview')),
        debt: v($('debtVal')), realized: v($('realizedPnL')), interest: v($('interestVal')), fss: v($('fssBox')), cards: document.querySelectorAll('.play-top .asset-card').length,
        slush: $('slushVal').textContent }; })())`);
    ok(W + ' HUD 상시: 순자산·목표·현금·행동력·정산 배수', hud.total && hud.target && hud.cash && hud.ap && hud.mult, hud);
    ok(W + ' 대출·확정손익·이자는 숨김 (툴팁)', !hud.debt && !hud.realized && !hud.interest && hud.cards === 1, hud);
    ok(W + ' 비자금 = 💼 + 숫자', /^💼 420만$/.test(hud.slush), hud.slush);
    ok(W + ' 금감원 게이지 0 → 숨김', !hud.fss);
    if(W > 900){
      await p.hover('#balanceBox'); await sleep(150);
      const tip = await p.evaluate(`(() => { const v = ${vis.toString()}; return [v($('debtVal')), $('debtVal').textContent, $('realizedPnL').textContent, $('interestVal').textContent]; })()`);
      ok(W + ' 순자산 호버 → 빌린 돈·확정손익·이자', tip[0] && /₩/.test(tip[1]) && /77/.test(tip[2]) && /5만/.test(tip[3]), tip);
      await p.mouse.move(5, 5);
    }
    await p.evaluate(() => { raiseFss(10); renderAll(); }); await sleep(100);
    ok(W + ' 금감원 게이지 오르면 나타남', await p.evaluate(`(${vis.toString()})($('fssBox'))`));
    // 심지: 가격을 내리면 짧아지고 색이 바뀐다
    const f0 = await p.evaluate(() => { const el = document.querySelector('#positionsBox .fuse'); return [el.className, el.firstElementChild.style.width, el.title]; });
    ok(W + ' 심지 게이지 + 숫자·전문용어는 툴팁 (새 2x = 초록)', f0[0] === 'fuse ' && /심지 \d+%/.test(f0[2]) && /담보비율|증거금률/.test(f0[2]), f0);
    await p.evaluate(() => { assets.coin.price *= 0.72; renderAll(); }); await sleep(100);
    const f1 = await p.evaluate(() => { const p2 = run.positions.find(x => x.assetId === 'coin'); const el = document.querySelector(`#positionsBox [data-id="${p2.id}"] .fuse`); return [el.className, parseFloat(el.firstElementChild.style.width), marginWarn(p2)]; });
    ok(W + ' 가격 하락 → 심지 짧아짐·경고면 빨강(hot)', f1[1] < parseFloat(f0[1]) && (f1[2] ? /hot/.test(f1[0]) : /warm|hot/.test(f1[0])), f1);
    // 화면에 보이는 글자에 전문용어 없음 (툴팁 title 제외)
    const txt = await p.evaluate(() => [document.querySelector('.play-top').innerText, $('positionsBox').innerText, document.querySelector('.pos-title').innerText, document.querySelector('.turn-bar').innerText].join(' | '));
    ok(W + ' TR룸 화면 글자에 증거금률·담보·대차 없음', !/증거금률|담보|대차/.test(txt.replace(/빌린 돈 \(신용·대차\)/, '')), txt.slice(0, 200));
    if(W === 1366) await p.screenshot({ path: `${S}/hud-${W}.png` });
    // 암시장: 비자금 크게
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
