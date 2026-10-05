// N4 색 언어: 칩 = --cyan, 배수 = --gold · 정산 무대 계산식 줄 [칩] × [배수] = [금액] · 금액 슬롯(자릿수 시간차) · 직전 흔들림 · 예상 정산 툴팁
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CYAN = 'rgb(0, 229, 255)', GOLD = 'rgb(255, 215, 0)';
const runDay = up => `(() => { window.tipChance = () => 0; startMarket(); while(run.phase === 'market'){ for(const id of ['semi','coin']) assets[id].price *= ${up}; tick(); } renderAll(); })()`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768],[1280,800]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.click('#startBtn'); await sleep(460);
    // 예상 정산 툴팁 (장전, 포지션 2개 + 곱하기 유물)
    await p.evaluate(() => { clearToasts(); window.rollCrit = () => 0; ['antFlag', 'levTower'].forEach(id => gainRelic(id, 't'));
      openPosition('semi', 1000, 1, 1, true); openPosition('coin', 800, 2, 1, true); relicSig = ''; renderAll(); });
    await p.hover('#multPreview'); await sleep(450);
    const tip = await p.evaluate(() => { const t = document.querySelector('.card-tip'); return { shown: !t.hidden,
      chips: [...t.querySelectorAll('.n-chip')].map(e => getComputedStyle(e).color), mults: [...t.querySelectorAll('.n-mult')].map(e => getComputedStyle(e).color), text: t.textContent }; });
    ok(W + ' 예상 정산 툴팁: 칩 청록 · 배수 금색', tip.shown && tip.chips.length >= 3 && tip.mults.length >= 3 && tip.chips.every(c => c === CYAN) && tip.mults.every(c => c === GOLD), tip);
    await p.screenshot({ path: `${S}/n4-tip-${W}.png` });
    await p.mouse.move(5, 5); await sleep(100);
    // 유물 툴팁: 종류 배지·설명 배수 금색
    await p.click('#relicBar [data-relic="antFlag"]'); await sleep(150);
    const rt = await p.evaluate(() => [...$('relicTip').querySelectorAll('.n-mult')].map(e => [e.textContent, getComputedStyle(e).color]));
    ok(W + ' 유물 툴팁 배수 금색', rt.length >= 2 && rt.every(([, c]) => c === GOLD), rt);
    const badge = await p.evaluate(() => [...document.querySelectorAll('#relicBar .rl-kind')].map(e => getComputedStyle(e).backgroundColor));
    ok(W + ' 곱 배수 배지 금색', badge.length === 2 && badge.every(c => c === GOLD), badge);
    await p.click('#relicBar [data-relic="antFlag"]'); await sleep(100);
    // 정산 무대: 계산식 줄
    await p.evaluate(runDay(1.02));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 });
    const f0 = await p.evaluate(() => [getComputedStyle($('sfChip')).color, getComputedStyle($('sfMult')).color, !!$('stageFormula')]);
    ok(W + ' 계산식 줄: 칩 상자 청록 · 배수 상자 금색', f0[0] === CYAN && f0[1] === GOLD && f0[2], f0);
    // 슬롯이 굴러가는 순간 · 직전 흔들림
    const mid = await p.waitForFunction(() => document.querySelector('#sfAmtV .slot-d.spin'), null, { timeout: 8000 }).then(() => true).catch(() => false);
    ok(W + ' 금액 슬롯: 자릿수가 굴러간다', mid);
    await p.screenshot({ path: `${S}/n4-stage-roll-${W}.png` });
    const shook = await p.waitForFunction(() => $('overlayBox').classList.contains('pre-shake'), null, { timeout: 4000 }).then(() => true).catch(() => false);
    ok(W + ' 최종 금액 직전 흔들림', shook);
    const amp = await p.evaluate(() => $('overlayBox').style.getPropertyValue('--amp'));
    ok(W + ' 흔들림 폭 = 세기 비례 (calc)', /calc\([\d.]+ \* var\(--u\)\)/.test(amp), amp);
    await p.waitForFunction(() => stage && stage.hold, null, { timeout: 15000 });
    await p.screenshot({ path: `${S}/n4-stage-${W}.png` });
    const fin = await p.evaluate(() => { const rows = stage.rows, r = rows[rows.length - 1], l = r.steps[r.steps.length - 1];
      return [$('sfAmtV').textContent, fmtSigned(l.runningChips * l.runningMult), $('sfChipV').textContent, fmtSigned(l.runningChips), $('sfMultV').textContent, fmtMultNum(l.runningMult),
        [...document.querySelectorAll('#stageList .chain-chip')].map(e => [e.className, getComputedStyle(e).color]), [...document.querySelectorAll('.stage-mult')].map(e => getComputedStyle(e).color)]; });
    ok(W + ' 계산식 = 엔진 값 (칩 × 배수 = 금액)', fin[0] === fin[1] && fin[2] === fin[3] && fin[4] === fin[5], fin.slice(0, 6));
    ok(W + ' 정산 칩: 더하기·손익 청록, 배수 금색', fin[6].every(([c, col]) => /\badd\b/.test(c) ? col === CYAN : col === GOLD), fin[6]);
    ok(W + ' 누적 배수 숫자 금색', fin[7].every(c => c === GOLD), fin[7]);
    // 결과로 점프해도 계산식은 최종값
    await p.evaluate(() => { stage.readyAt = 0; stageNext(); });
    await p.evaluate(() => { stageBest = { run, payout: 0 }; });
    await p.evaluate(runDay(1.02));
    await p.waitForFunction(() => !!stage, null, { timeout: 8000 });
    await sleep(100); await p.evaluate(() => { stageSkip(); stageSkip(); });
    const jump = await p.evaluate(() => { const r = stage.rows[stage.rows.length - 1], l = r.steps[r.steps.length - 1]; return [$('sfAmtV').textContent, fmtSigned(l.runningChips * l.runningMult), !document.querySelector('#sfAmtV .slot-d')]; });
    ok(W + ' 두 번 클릭 → 계산식 최종값 (굴러가는 자리 없음)', jump[0] === jump[1] && jump[2], jump);
    await p.evaluate(() => { stage.readyAt = 0; stageNext(); });
    await p.close();
  }
  ok('튜너에 슬롯 수치', await (async () => { const p = await b.newPage(); await p.goto('http://127.0.0.1:8765/demo.html?crt=0&layout=classic&tuner=1'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await sleep(400);
    const r = await p.evaluate(() => ['slotDigitGapMs', 'slotSpinMs', 'preShakeMs'].every(k => !!document.querySelector(`[data-tn="${k}"]`))); await p.close(); return r; })());
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
