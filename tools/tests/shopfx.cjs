// S8(33) 암시장 몽롱 연출: 입장 안개·채도·몽환 패드·BGM 로우패스 / 호버 둥실 + 띠잉 / 팩 개봉 흔들림→터짐→빛기둥 / 신화 암전→금빛 기둥→합창 / 유물 구매 철컥
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOOK = `(() => { window.__snd = []; const o = Sound.play; Sound.play = (n, op) => { __snd.push([n, Math.round(performance.now())]); return o(n, op); }; })()`;
const played = (p, n) => p.evaluate(n => __snd.filter(s => s[0] === n).length, n);
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html'); await p.evaluate(() => { try { localStorage.setItem("hodl.unlockWeek", "8"); } catch(e) {} }); await p.keyboard.press('Shift');
    await p.evaluate(HOOK);
    await p.click('#startBtn'); await sleep(460);
    // 입장
    await p.evaluate(() => { __snd = []; run.slush = 50000; openShop(); switchTab('shop'); });
    await sleep(100);
    const en = await p.evaluate(() => [$('screen-shop').classList.contains('haze-in'), Music.muffled, __snd.filter(s => s[0] === 'shopPad').length,
      getComputedStyle($('screen-shop'), '::after').animationName]);
    ok(W + ' 입장: 채도 빠짐 + 보라 안개 + 몽환 패드 + BGM 로우패스', en[0] && en[1] && en[2] === 1 && en[3] === 'hazeDrift', en);
    await sleep(1300);
    ok(W + ' 채도는 돌아온다', await p.evaluate(() => !$('screen-shop').classList.contains('haze-in')));
    await p.screenshot({ path: `${S}/shopfx-haze-${W}.png` });
    // 호버
    await p.evaluate(() => { __snd = []; });
    const pack = p.locator('#shopBox .pack:not(.disabled)').first();
    await pack.hover(); await sleep(250);
    const hv = await p.evaluate(() => [__snd.filter(s => s[0] === 'shopHover').length, getComputedStyle(document.querySelector('#shopBox .pack:not(.disabled):hover .pk-icon')).animationName]);
    ok(W + ' 팩 호버: 띠잉 + 아이콘 둥실', hv[0] === 1 && hv[1] === 'shopFloat', hv);
    await pack.hover({ position: { x: 10, y: 10 } }); await sleep(150);
    ok(W + ' 같은 팩 안에서 움직여도 한 번만', await played(p, 'shopHover') === 1);
    // 팩 개봉 (희귀): 흔들림 → 터짐 → 빛기둥 → 뒤집힘
    await p.evaluate(() => { __snd = []; onGameEvent('packOpened', { packId: SHOP_PACKS[0].id, cardId: 'diamond', deckSize: 12 }); });
    await sleep(80);
    const po = await p.evaluate(() => [!!document.querySelector('.flip-stage.rare .pk-pillar'), !!document.querySelector('.pk-float .pk-shake .flip-card'), __snd.map(s => s[0]), $('overlay').classList.contains('pk-dark')]);
    ok(W + ' 팩 개봉: 공중 흔들림(달그락) + 등급 색 기둥 준비, 암전 없음', po[0] && po[1] && po[2].includes('packShake') && !po[2].includes('packBurst') && !po[3], po);
    await sleep(600);
    ok(W + ' 흔들림 뒤 터짐(펑)', await played(p, 'packBurst') === 1);
    await p.screenshot({ path: `${S}/shopfx-pack-${W}.png` });
    await sleep(700);
    ok(W + ' 뒤집히며 등급 음', await played(p, 'packFlip') === 1);
    await p.locator('#overlayBox [data-act="close"]').click(); await sleep(120);
    // 신화: 암전 → 금빛 기둥 + 합창 → 회전 등장 → 화면 돌아옴
    const myth = await p.evaluate(() => CARDS.find(c => c.rarity === 'mythic').id);
    await p.evaluate(m => { __snd = []; onGameEvent('packOpened', { packId: SHOP_PACKS[0].id, cardId: m, deckSize: 12 }); }, myth);
    await sleep(100);
    const m1 = await p.evaluate(() => [$('overlay').classList.contains('pk-dark'), !!document.querySelector('.flip-stage.mythic'), getComputedStyle(document.querySelector('#overlayBox .ov-btn')).visibility, __snd.map(s => s[0])]);
    ok(W + ' 신화: 암전 (버튼·글자 숨김, 흔들림 소리 없음)', m1[0] && m1[1] && m1[2] === 'hidden' && !m1[3].includes('packShake'), m1);
    await sleep(900);
    const m2 = await p.evaluate(() => [__snd.filter(s => s[0] === 'choir').length, getComputedStyle(document.querySelector('.flip-stage.mythic .flip-card')).animationName]);
    ok(W + ' 신화: 금빛 기둥 + 합창 + 회전', m2[0] === 1 && m2[1] === 'mythSpin', m2);
    await p.screenshot({ path: `${S}/shopfx-mythic-${W}.png` });
    await sleep(1300);
    ok(W + ' 신화: 등장 뒤 화면이 돌아온다', await p.evaluate(() => !$('overlay').classList.contains('pk-dark') && getComputedStyle(document.querySelector('#overlayBox .ov-btn')).visibility === 'visible'));
    await p.locator('#overlayBox [data-act="close"]').click(); await sleep(120);
    // 유물 구매: 칸에 철컥
    await p.evaluate(() => { __snd = []; });
    const rb = p.locator('#shopBox [data-buy-relic]:not([disabled])').first();
    const rid = await rb.getAttribute('data-buy-relic');
    await rb.click(); await sleep(80);
    const rl = await p.evaluate(id => { const i = run.relics.indexOf(id); const el = document.querySelectorAll('#shopBox .own-relics .relic-tile')[i]; return [i >= 0, !!el && el.classList.contains('slot-in')]; }, rid);
    await sleep(300);
    const rs = await p.evaluate(() => [__snd.filter(s => s[0] === 'relicClack').length, __snd.filter(s => s[0] === 'relicGain').length]);
    ok(W + ' 유물 구매 → 보유 칸에 꽂힘 + 철컥 (획득 징글 대신)', rl[0] && rl[1] && rs[0] === 1 && rs[1] === 0, { rl, rs });
    // 나가면 로우패스 해제
    await p.evaluate(() => switchTab('title')); await sleep(80);
    ok(W + ' 암시장을 나가면 BGM 로우패스 해제', await p.evaluate(() => !Music.muffled));
    await p.close();
  }
  ok('페이지 에러 없음', errs.length === 0, errs.slice(0, 3));
  console.log(`FAIL ${fail} / ${pass + fail}`); console.log('errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
