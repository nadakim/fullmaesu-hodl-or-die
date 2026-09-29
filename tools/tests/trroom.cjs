// S8 TR룸 연출 (30·31·32): 장전 드로우 부채꼴·희귀 반짝·카드 연속 사용 음높이 / 장 시작 카운트다운(스킵·'최소' 생략) / 포지션 불꽃·신고가 번쩍·반대매매 심장 박동
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 효과음 기록 (이름·pitch)
const HOOK = `(() => { window.__snd = []; const o = Sound.play; Sound.play = (n, op) => { __snd.push([n, op && op.pitch, performance.now()]); return o(n, op); }; })()`;
const snd = (p, name) => p.evaluate(n => __snd.filter(s => s[0] === n), name);
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.evaluate(HOOK);
    await p.evaluate(() => { window.tipChance = () => 0; });
    await p.click('#startBtn'); await sleep(460);
    // (30) 첫 장전: 손패가 부채꼴로 한 장씩, 5음계로 위로
    await sleep(1400);
    const deal = await snd(p, 'cardDeal');
    const hand = await p.evaluate(() => run.hand.length);
    ok(W + ' 장전 드로우: 카드 수만큼 촥 (음높이 위로)', deal.length === hand && deal[1][1] > deal[0][1] && deal[2][1] > deal[1][1], [deal.length, hand, deal.slice(0, 3).map(s => s[1])]);
    // 희귀 이상 카드 → 반짝 + 종 (다음 날 드로우를 흉내)
    await p.evaluate(() => { __snd = []; run.hand = ['stk_semi', 'diamond', 'credit'].map(newCard); dealPending = true; renderAll(); });
    await sleep(60);
    ok(W + ' 드로우 중 .deal 클래스', await p.evaluate(() => document.querySelectorAll('#handBox .card.gcard.deal').length) >= 1);
    await sleep(600);
    const rare = await p.evaluate(() => [__snd.filter(s => s[0] === 'rareDraw').length, [...document.querySelectorAll('#handBox .card.gcard.shine')].map(e => e.dataset.cid)]);
    ok(W + ' 희귀 카드만 반짝 + 종', rare[0] === 1 && rare[1].length === 1 && rare[1][0] === 'diamond', rare);
    await p.screenshot({ path: `${S}/trroom-deal-${W}.png` });
    // 카드 연속 사용: 두 번째 장은 한 칸 위
    const pit = await p.evaluate(() => {
      __snd = [];
      cardChain = { run, key: run.round + '/' + run.day, n: 0 }; onGameEvent('cardPlayed', { card: CARD_BY_ID.credit });
      cardChain.n = 3; onGameEvent('cardPlayed', { card: CARD_BY_ID.credit });
      return __snd.filter(s => s[0] === 'cardPlay').map(s => s[1]);
    });
    ok(W + ' 카드 연속 사용 → 음높이 5음계로 위로', pit.length === 2 && pit[1] > pit[0], pit);
    // (31) 장 시작 카운트다운: 그동안 시장 정지 → 3·2·1 → OPEN + 벨
    await p.evaluate(() => { __snd = []; openPosition('semi', 1000, 1, 1, true); renderAll(); });
    await p.click('#openBtn'); await sleep(250);
    const cd = await p.evaluate(() => [!!document.querySelector('.countdown'), Fx.queueBusy, run.phase, run.tickInDay]);
    ok(W + ' 장 시작 → 카운트다운 (시장 정지)', cd[0] && cd[1] && cd[2] === 'market' && cd[3] === 0, cd);
    await p.screenshot({ path: `${S}/trroom-countdown-${W}.png` });
    await sleep(1600);
    const cd2 = await p.evaluate(() => [!!document.querySelector('.countdown'), __snd.filter(s => s[0] === 'drumRoll').length, __snd.filter(s => s[0] === 'marketOpen').length]);
    ok(W + ' 카운트다운 끝 → 드럼 4박 + 벨 1번, 오버레이 사라짐', !cd2[0] && cd2[1] === 4 && cd2[2] === 1, cd2);
    await sleep(900);
    ok(W + ' 카운트다운 뒤 장 진행', await p.evaluate(() => run.tickInDay > 0));
    // 스킵 (Space) → 즉시 사라지고 벨은 한 번
    await p.evaluate(() => { __snd = []; while(run.phase === 'market') tick(); renderAll(); dealPending = false; });
    await p.waitForFunction(() => !!stage, null, { timeout: 5000 }).catch(() => {});   // 포지션이 있으면 매일 정산 무대 (stage-every-day) → 닫고 진행
    await p.evaluate(() => { if(stage){ stageSkip(); stageSkip(); stage.readyAt = 0; stageNext(); } dealPending = false; });
    await sleep(300);
    await p.evaluate(() => { __snd = []; }); await p.click('#openBtn'); await sleep(200);
    await p.keyboard.press('Space'); await sleep(80);
    const sk = await p.evaluate(() => [!!document.querySelector('.countdown'), Fx.queueBusy, __snd.filter(s => s[0] === 'marketOpen').length]);
    ok(W + ' Space → 카운트다운 스킵 (벨 1번)', !sk[0] && !sk[1] && sk[2] === 1, sk);
    // 연쇄 속도 '최소' → 카운트다운 생략, 드로우도 생략
    await p.evaluate(() => { settings.fxSpeed = 'min'; __snd = []; while(run.phase === 'market') tick(); renderAll(); });
    await sleep(900);
    ok(W + " '최소' → 드로우 연출 없음", (await snd(p, 'cardDeal')).length === 0);
    await p.click('#openBtn'); await sleep(120);
    const mn = await p.evaluate(() => [!!document.querySelector('.countdown'), Fx.queueBusy, __snd.filter(s => s[0] === 'marketOpen').length]);
    ok(W + " '최소' → 카운트다운 생략, 벨만", !mn[0] && !mn[1] && mn[2] === 1, mn);
    await p.evaluate(() => { settings.fxSpeed = 'normal'; });
    // (32) 연속 상승 → 불꽃 1·2·3단, 신고가 금색 번쩍, 하락하면 꺼짐 (시장은 막아 두고 틱을 직접)
    await p.evaluate(() => { Fx.enqueue({ kind: 'hold', blocking: true, duration: 600000, play(){} }); });
    const fl = await p.evaluate(() => {
      const pos = openPosition('game', 1000, 1, 1, true); renderAll(); marketTickN++; notePosTicks();   // 새 포지션 (손익 0에서 시작)
      const lv = []; let high = false;
      for(let k = 0; k < 8; k++){
        assets.game.price *= 1.01; marketTickN++; notePosTicks(); renderAll();
        const el = posRowEl(pos.id); high = high || el.classList.contains('fx-newhigh');
        lv.push([1, 2, 3].find(n => el.classList.contains('flame-' + n)) || 0);
      }
      return { lv, high, phase: run.phase, pnl: posPnl(pos), map: JSON.stringify(posFx.map[pos.id]) };
    });
    ok(W + ' 연속 상승 → 불꽃 단계가 오른다 (1→2→3)', fl.lv.includes(1) && fl.lv.includes(2) && fl.lv[fl.lv.length - 1] === 3, fl);
    ok(W + ' 신고가 → 금색 번쩍', fl.high);
    await p.screenshot({ path: `${S}/trroom-flame-${W}.png` });
    const off = await p.evaluate(() => { assets.game.price *= 0.97; marketTickN++; notePosTicks(); renderAll(); const el = posRowEl(run.positions.find(x => x.assetId === 'game').id); return [1, 2, 3].filter(n => el.classList.contains('flame-' + n)).length; });
    ok(W + ' 하락 → 불꽃 꺼짐', off === 0, off);
    // 반대매매 위험 → 붉은 맥동 + 가장자리 + 심장 박동 (위험할수록 빠르게)
    const dz = await p.evaluate(() => {
      const pos = openPosition('coin', 1000, 3, 1, true);
      let guard = 0;
      while(!marginWarn(pos) && guard++ < 400) assets.coin.price *= 0.998;
      renderAll(); __snd = [];
      return [marginWarn(pos), marginCalled(pos), marginHealth(pos)];
    });
    await sleep(1500);
    const hb = await p.evaluate(() => [document.querySelectorAll('.pos-item.fx-danger').length, $('fxDangerEdge').classList.contains('on'), __snd.filter(s => s[0] === 'heartbeat').length]);
    ok(W + ' 위험 포지션 → 맥동·가장자리·심장 박동', dz[0] && !dz[1] && hb[0] === 1 && hb[1] && hb[2] >= 1, { dz, hb });
    await p.screenshot({ path: `${S}/trroom-danger-${W}.png` });
    const iv = await p.evaluate(() => {
      const pos = run.positions.find(x => x.assetId === 'coin'), slow = heartInterval(pos);
      let guard = 0;
      while(marginHealth(pos) > 1.02 && guard++ < 400) assets.coin.price *= 0.999;
      return [slow, heartInterval(pos), marginHealth(pos), JUICE_CONFIG.heartMs[1]];
    });
    ok(W + ' 건강도가 1에 가까울수록 박동이 빠르다', iv[1] < iv[0] && iv[1] >= iv[3], iv);
    await p.evaluate(() => { Fx.skipQueue(); });
    await p.close();
  }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
