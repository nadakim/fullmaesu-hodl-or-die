// Sound Lab (?soundlab=1) — 일반 모드에는 아무것도 없다 · Lab 모드: 모든 SFX 줄·옵션/음높이 단계·사다리·장면(실제 게임 순서)·BGM 토글·메모 저장/복사
// · Lab 컨트롤은 게임의 uiClick·uiPress·uiHover를 울리지 않는다 · 설정(hodl.settings)은 건드리지 않는다 (1920·1366·390)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://127.0.0.1:8765/demo.html';
const spy = p => p.evaluate(() => { window.__plays = []; Sound.play = (n, o) => { __plays.push([n, o || {}]); return true; }; window.__stingers = []; const so = Music.stinger; Music.stinger = (n, o) => { __stingers.push(n); return so(n, o); }; });
const plays = p => p.evaluate(() => __plays.splice(0));

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];

  // ── 일반 모드: 아무것도 없다 ──
  {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
    const reqs = [];
    p.on('request', r => reqs.push(r.url())); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} }); await p.keyboard.press('Shift'); await sleep(600);
    const n = await p.evaluate(() => ({ lab: !!document.getElementById('soundLab'), reopen: !!document.getElementById('labReopen'), api: typeof SoundLab, notes: localStorage.getItem('hodl.soundNotes'), on: SOUNDLAB_ON, style: [...document.styleSheets].length }));
    ok('일반 모드: Lab 화면·다시 열기 버튼·API·저장값 없음', !n.lab && !n.reopen && n.api === 'undefined' && n.notes === null && n.on === false, n);
    ok('일반 모드: soundlab.js·측정 JSON 요청 없음', !reqs.some(u => /soundlab\.js|audio\/data/.test(u)), reqs.filter(u => /soundlab|audio\/data/.test(u)));
    await p.close();
  }

  for(const [W, H] of [[1920, 1080], [1366, 768], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if(m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.clock.install({ time: 0 });
    await p.addInitScript(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });
    await p.goto(BASE + '?soundlab=1');
    await p.waitForSelector('#soundLab'); await p.clock.runFor(400);
    const settings0 = await p.evaluate(() => localStorage.getItem('hodl.settings'));
    await spy(p);

    // 구성: 모든 SFX 한 줄씩 · 카테고리 · 사다리 · 장면
    const st = await p.evaluate(() => {
      const names = Object.keys(Sound.SFX), rows = [...document.querySelectorAll('.lab-row[data-name]')].map(r => r.dataset.name);
      return { names: names.length, rows: rows.length, missing: names.filter(n => rows.indexOf(n) < 0), uncategorized: names.filter(n => soundCategoryOf(n) === 'uncategorized'),
               ladders: document.querySelectorAll('.lab-ladder').length, steps: document.querySelectorAll('.lab-ladder [data-lab="step"]').length, scenes: document.querySelectorAll('.lab-scene[data-key^="scene:"]').length,
               overflow: document.getElementById('soundLab').scrollWidth - document.getElementById('soundLab').clientWidth };
    });
    ok(W + ' 모든 SFX가 한 줄씩 (카테고리 빠짐 없음)', st.names === st.rows && st.names >= 68 && !st.missing.length && !st.uncategorized.length, st);
    ok(W + ' 사다리 8줄 × 12단 · 장면 18개 · 가로 넘침 없음', st.ladders === 8 && st.steps === 96 && st.scenes === 18 && st.overflow <= 1, st);

    // 재생: 기본 / 옵션 / 음높이 단계
    await p.click('.lab-row[data-name="settleAdd"] [data-lab="play"]');
    let pl = await plays(p);
    ok(W + ' ▶ settleAdd = 그 이름 1번 · 옵션 없음', pl.length === 1 && pl[0][0] === 'settleAdd' && pl[0][1].pitch === undefined, pl);
    await p.selectOption('.lab-row[data-name="relicLevelUp"] [data-lab="variant"]', 'relicLevelUp#rarity mythic');
    await p.click('.lab-row[data-name="relicLevelUp"] [data-lab="play"]');
    pl = await plays(p);
    ok(W + ' 옵션 select → rarity mythic으로 재생', pl.length === 1 && pl[0][0] === 'relicLevelUp' && pl[0][1].rarity === 'mythic', pl);
    await p.selectOption('.lab-row[data-name="settleAdd"] [data-lab="step"]', '5');
    await p.click('.lab-row[data-name="settleAdd"] [data-lab="play"]');
    pl = await plays(p);
    ok(W + ' 음높이 6단(+12반음) = pitch 2', pl.length === 1 && Math.abs(pl[0][1].pitch - 2) < 1e-6, pl);
    await p.click('.lab-ladder[data-name="comboUp"] [data-step="11"]');
    pl = await plays(p);
    ok(W + ' 사다리 12단 = +26반음', pl.length === 1 && pl[0][0] === 'comboUp' && Math.abs(pl[0][1].pitch - Math.pow(2, 26 / 12)) < 1e-6, pl);
    await p.click('.lab-ladder[data-name="settleMult"] [data-lab="ladder"]'); await p.clock.runFor(2300);
    pl = await plays(p);
    ok(W + ' 올라가기 = 12번, 음높이가 단계마다 오름', pl.length === 12 && pl.every((x, i) => i === 0 || x[1].pitch > pl[i - 1][1].pitch), pl.map(x => +x[1].pitch.toFixed(2)));

    // 장면: 실제 게임 순서 (정산 무대는 dayEnd → … → settleThud, 시간은 오름차순)
    const sc = await p.evaluate(() => window.__soundLab.scenes.map(s => { const e = window.__soundLab.events(s.id); return { id: s.id, n: e.length, first: e[0][1], last: e[e.length - 1][1], sorted: e.every((x, i) => i === 0 || x[0] >= e[i - 1][0] - 1e-9), unknown: e.map(x => x[1]).filter(n => !Sound.SFX[n] && n !== 'crowdScream') }; }));
    ok(W + ' 장면 이벤트: 시간 오름차순 · 모르는 소리 이름 없음', sc.every(s => s.sorted && !s.unknown.length), sc.filter(s => !s.sorted || s.unknown.length));
    const big = sc.find(s => s.id === 'settle-big');
    ok(W + ' 정산 무대(대박): dayEnd로 시작해 settleThud로 끝남', big.first === 'dayEnd' && big.last === 'settleThud', big);
    await p.click('.lab-scene [data-scene="close"]'); await p.clock.runFor(3200);
    pl = await plays(p);
    ok(W + ' 장면 재생: 마감 임박 = closeRoll 1·2·3단계 → dayEnd', pl.map(x => x[0] + (x[1].level || '')).join() === 'closeRoll1,closeRoll2,closeRoll3,dayEnd', pl.map(x => x[0] + (x[1].level || '')));
    await p.click('.lab-scene [data-scene="combo"]'); await p.clock.runFor(4200);
    pl = await plays(p);
    ok(W + ' 콤보 장면: comboUp 14번 · 슬램 3·5·8 · 잭팟 1 · 끊김 1', pl.filter(x => x[0] === 'comboUp').length === 14 && pl.filter(x => x[0] === 'multSlam').length === 3 && pl.filter(x => x[0] === 'jackpot').length === 1 && pl.filter(x => x[0] === 'comboBreak').length === 1, pl.map(x => x[0]).join().slice(0, 120));
    await p.click('.lab-scene [data-scene="pack-mythic"]'); await p.clock.runFor(2500);
    pl = await plays(p);
    ok(W + ' 신화 팩 장면: packBurst + choir + packFlip (흔들림 없음)', pl.map(x => x[0]).join() === 'packBurst,choir,packFlip' && pl[0][1].rarity === 'mythic', pl.map(x => x[0]));

    // 게임의 전역 UI 소리가 Lab 조작에 섞이지 않는다
    // Lab 컨트롤은 button·.btn-chunky가 아니라서 게임의 전역 핸들러가 uiClick·uiPress·uiHover를 같이 울리지 않는다 — 위의 plays() 비교(이름이 정확히 1개)와 아래 목록이 그 증거
    await spy(p);
    await p.click('.lab-row[data-name="uiClick"] [data-lab="play"]'); await p.selectOption('.lab-row[data-name="buy"] [data-lab="variant"]', 'buy#레버리지 3x'); await p.hover('.lab-row[data-name="buy"] [data-lab="play"]');
    await p.click('.lab-row[data-name="buy"] [data-lab="play"]'); await p.click('[data-lab="stop"]');
    pl = await plays(p);
    ok(W + ' Lab 조작에 uiPress·uiHover가 안 섞임 (▶ 클릭·옵션 변경·호버·▶ 클릭·■ 정지 → uiClick 1 · buy 1뿐)', pl.map(x => x[0]).join() === 'uiClick,buy' && pl[1][1].lev === 3, pl.map(x => x[0]));

    // 메모: 평가·한 줄 → 저장 → 복사(JSON) → 새로고침 후 복원 → 지우기(두 번)
    await p.selectOption('.lab-row[data-name="settleAdd"] [data-lab="rating"]', 'harsh');
    await p.fill('.lab-row[data-name="settleAdd"] [data-lab="note"]', '너무 높은 단계에서 귀가 아픔');
    await p.fill('.lab-scene[data-key="scene:combo"] [data-lab="note"]', '12콤보 잭팟은 좋음');
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('hodl.soundNotes')));
    ok(W + ' 메모 저장: localStorage hodl.soundNotes (rating + 한 줄)', saved.version === 1 && saved.notes['sfx:settleAdd'].r === 'harsh' && saved.notes['sfx:settleAdd'].t === '너무 높은 단계에서 귀가 아픔' && saved.notes['scene:combo'].t === '12콤보 잭팟은 좋음', saved);
    ok(W + ' 메모 개수 표시', (await p.textContent('#labCount')) === '2개 메모' && (await p.evaluate(() => document.querySelector('.lab-row[data-name="settleAdd"]').classList.contains('noted'))));
    await p.click('[data-lab="copy"]'); await p.clock.runFor(100);
    const cp = await p.evaluate(() => JSON.parse(window.__soundLabLastCopy));
    ok(W + ' 메모 복사: JSON {at, 볼륨, notes[{key,label,rating,text}]}', cp.notes.length === 2 && cp.notes.some(n => n.key === 'sfx:settleAdd' && n.label === 'settleAdd (settle)' && n.rating === '거슬림' && n.text.includes('귀가')) && typeof cp.sfxVol === 'number' && !!cp.at, cp);
    ok(W + ' 복사 칸(수동 복사용)도 채워짐', (await p.inputValue('#labExport')).includes('거슬림'));
    await p.reload(); await p.waitForSelector('#soundLab'); await p.clock.runFor(300);
    ok(W + ' 새로고침 뒤 메모 복원', (await p.inputValue('.lab-row[data-name="settleAdd"] [data-lab="note"]')) === '너무 높은 단계에서 귀가 아픔' && (await p.inputValue('.lab-row[data-name="settleAdd"] [data-lab="rating"]')) === 'harsh');
    await p.click('[data-lab="clear"]');
    ok(W + ' 지우기는 한 번 더 눌러야 함', (await p.evaluate(() => Object.keys(window.__soundLab.notes()).length)) === 2);
    await p.click('[data-lab="clear"]');
    ok(W + ' 두 번 누르면 전부 지워짐', (await p.evaluate(() => Object.keys(window.__soundLab.notes()).length)) === 0 && (await p.textContent('#labCount')) === '0개 메모');

    // BGM: 곡·레이어·시장 상황·스팅어
    await spy(p);   // 새로고침으로 스파이가 사라졌으므로 다시
    await p.selectOption('[data-lab="bgmSong"]', 'shop'); await p.click('[data-lab="bgmPlay"]'); await p.clock.runFor(200);
    let m = await p.evaluate(() => ({ desired: Music.desired, enabled: Music.enabled }));
    ok(W + ' BGM ▶: 고른 곡으로 켜짐', m.desired === 'shop' && m.enabled, m);
    const p1 = await p.evaluate(() => SoundLab.chVol.p1);
    await p.click('[data-lab="bgmLayer"][data-ch="p1"]'); await p.clock.runFor(100);
    ok(W + ' 레이어 p1 끄면 채널 볼륨 0 (곡 다시 시작)', (await p.evaluate(() => MUSIC_CH_VOL.p1)) === 0 && (await p.evaluate(() => Music.enabled)));
    await p.click('[data-lab="bgmLayer"][data-ch="p1"]'); await p.clock.runFor(100);
    ok(W + ' 다시 켜면 원래 볼륨 복원', (await p.evaluate(() => MUSIC_CH_VOL.p1)) === p1, p1);
    await p.selectOption('[data-lab="bgmState"]', 'BEAR'); await p.check('[data-lab="bgmFlag"][data-flag="jackpot"]'); await p.check('[data-lab="bgmMuffle"]');
    m = await p.evaluate(() => ({ state: Music.mood.state, jackpot: !!Music.mood.jackpot, muffled: Music.muffled }));
    ok(W + ' 시장 상황·JACKPOT·암시장 로우패스 → Music 상태', m.state === 'BEAR' && m.jackpot && m.muffled, m);
    await p.click('[data-lab="sting"][data-song="victory"]');
    ok(W + ' 스팅어 ▶ = Music.stinger(victory)', (await p.evaluate(() => __stingers)).join() === 'victory');
    await p.click('[data-lab="bgmStop"]');
    ok(W + ' BGM ■: 꺼짐', (await p.evaluate(() => Music.enabled)) === false);

    // 닫기 / 다시 열기 · 설정은 그대로
    await p.click('[data-lab="close"]');
    ok(W + ' ← 게임 화면: Lab 숨김 + 🔊 Lab 버튼', (await p.evaluate(() => document.getElementById('soundLab').hidden && !document.getElementById('labReopen').hidden)));
    await p.click('#labReopen');
    ok(W + ' 🔊 Lab으로 다시 열림', (await p.evaluate(() => !document.getElementById('soundLab').hidden)));
    ok(W + ' 게임 설정(hodl.settings) 불변', (await p.evaluate(() => localStorage.getItem('hodl.settings'))) === settings0, settings0);
    await p.evaluate(() => document.getElementById('soundLab').scrollTo(0, 0));
    await p.screenshot({ path: `${S}/soundlab-${W}.png` });
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);
  await b.close();
})();
