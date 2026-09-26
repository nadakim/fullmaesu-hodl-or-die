const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const S = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const ok = (n, c, i) => R.push([c ? 'PASS' : 'FAIL', n, i === undefined ? '' : (typeof i === 'string' ? i : JSON.stringify(i))]);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctxB = await b.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctxB.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/demo.html'); await page.keyboard.press('Shift');
  await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
  await page.reload();   // 첫 입력 전 무음을 재야 하므로 여기서는 Shift 안 누름 — 아래 첫 클릭이 오디오를 켜고(메뉴 선택으로는 안 쓰임)
  const st = () => page.evaluate(() => ({ track: Music.track, desired: Music.desired, inst: Music.instances, duck: +Music.duckLevel.toFixed(2), ctx: Sound.context && Sound.context.state }));

  // 1. 타이틀: 첫 클릭 전엔 잠김, 클릭하면 title
  const pre = await st();
  await page.mouse.click(10, 700); await sleep(1300);
  const t1 = await st();
  ok('첫 입력 전 무음 → 클릭 후 title 재생', pre.ctx == null && t1.track === 'title' && t1.ctx === 'running', { pre, t1 });
  ok('동시 오실레이터 수 고정 (title: 채널 3 + 비브라토 LFO 1)', t1.inst.length === 1 && t1.inst[0].osc <= 6, t1.inst);
  const def = await page.evaluate(() => ({ bgm: settings.bgm, vol: settings.bgmVol }));
  ok('기본값 배경음악 켜기 · 볼륨 40', def.bgm === true && def.vol === 40, def);

  // 2. 장전 → 크로스페이드
  await page.click('#startBtn'); await new Promise(r => setTimeout(r, 260)); await sleep(300);
  const x = await st();
  ok('영끌 출격 → premarket, 크로스페이드 중 2곡 겹침', x.track === 'premarket' && x.inst.length === 2 && x.inst.some(i => i.name === 'title' && i.stopping), x.inst);
  await sleep(1300);
  ok('1초 뒤 title 정리', (await st()).inst.length === 1);

  // 3. 장중: market, 1초 크로스페이드, 박자 격자
  await page.evaluate(() => { window.tipChance = () => 0; setSeed(5); startRun(); });
  await sleep(1300);
  await page.evaluate(() => { window.__tick = tick; tick = function(){}; startMarket(); renderAll(); });   // 검증 동안 장을 멈춰 둔다 (엔진 tick만 비움)
  await sleep(300);
  const m1 = await st();
  ok('장 시작 → market (premarket와 1초 크로스페이드)', m1.track === 'market' && m1.inst.length === 2, m1.inst);
  await sleep(4000);
  // 4. 적응형: 레버리지 포지션을 위험 상태로 → 다음 마디부터 사이렌
  const dz = await page.evaluate(() => {
    const p = openPosition('meme', 600, 2, 1, true);
    assets.meme.price *= 0.8;   // 증거금률 경고 구간 (반대매매 전)
    renderAll();
    const r = marginRatio(p);
    const t = Sound.context.currentTime;
    return { ratio: r, warn: MARGIN_WARN_RATIO, call: MARGIN_CALL_RATIO, setAt: t, mood: Music.mood };
  });
  await sleep(4200);
  const logA = await page.evaluate(() => Music.log.filter(e => e.track === 'market'));
  const firstDanger = logA.find(e => e.mood.danger);
  const barLen = 60 / 128 * 4;
  const aligned = logA.every((e, i) => i === 0 || Math.abs(((e.t - logA[0].t) / barLen) - Math.round((e.t - logA[0].t) / barLen)) < 0.02 || e.bpm !== 128);
  ok('증거금률 경고 상태 (반대매매 전)', dz.ratio < dz.warn && dz.ratio > dz.call && dz.mood.danger, dz);
  ok('사이렌 레이어는 설정 시각 이후 첫 마디 경계에서 시작', firstDanger && firstDanger.t >= dz.setAt && firstDanger.t - dz.setAt <= barLen + 0.15 && logA.filter(e => e.t < dz.setAt).every(e => !e.mood.danger),
     { setAt: +dz.setAt.toFixed(3), firstDangerBar: firstDanger && +firstDanger.t.toFixed(3), barLen });
  ok('마디 시작 시각이 전부 같은 격자 위', aligned, logA.slice(-4).map(e => +e.t.toFixed(3)));

  // 5. 강세·약세·변동성·금감원·템포
  const moodTest = async (fn, label, check) => {
    const setAt = await page.evaluate(fn);
    await sleep(barLen * 1000 + 700);
    const last = await page.evaluate(() => Music.log.filter(e => e.track === 'market').slice(-1)[0]);
    ok(label, last.t >= setAt && check(last), { t: +last.t.toFixed(2), mood: last.mood, bpm: last.bpm });
  };
  await moodTest(() => { marketState = 'BULL'; renderAll(); return Sound.context.currentTime; }, 'BULL → 다음 마디에 강세 (G장조 코드 + 옥타브 레이어)', l => l.mood.state === 'BULL');
  await moodTest(() => { marketState = 'BEAR'; renderAll(); return Sound.context.currentTime; }, 'BEAR → 다음 마디에 약세 (반음 하강 베이스, 하이햇 제거)', l => l.mood.state === 'BEAR');
  await moodTest(() => { marketState = 'VOLATILE'; run.fss = FSS_WARN; renderAll(); return Sound.context.currentTime; }, 'VOLATILE + 금감원 경고 → 브레이크비트·비브라토 + 전화벨 레이어', l => l.mood.state === 'VOLATILE' && l.mood.fss);
  await moodTest(() => { marketState = 'NORMAL'; run.fss = 0; run.tickInDay = TICKS_PER_DAY - 1; renderAll(); return Sound.context.currentTime; }, '장 마감 직전 → 템포 +11% (128 → 약 142)', l => l.bpm > 140 && l.bpm <= 128 * 1.12 + 0.1);

  // 6. 메인 스레드 1.5초 멈춤 → 박자 격자 유지 (뒤처진 칸은 소리 없이 건너뜀)
  const before = await page.evaluate(() => Music.log.filter(e => e.track === 'market').slice(-1)[0].t);
  await page.evaluate(() => { const t = performance.now(); while(performance.now() - t < 1500){} });
  await sleep(3000);
  const after = await page.evaluate(() => Music.log.filter(e => e.track === 'market').slice(-3));
  const barNow = 60 / after[after.length - 1].bpm * 4;
  const drift = after.map(e => { const k = (e.t - before) / barNow; return Math.abs(k - Math.round(k)); });
  ok('메인 스레드 1.5초 정지 뒤에도 마디 격자가 밀리지 않음 (뒤처진 칸은 소리 없이 건너뜀)', drift.every(d => d < 0.03), drift.map(d => +d.toFixed(3)));
  // 탭 가림 흉내: hidden=true + 타이머가 1초 간격으로 느려진 상황 (0.9초씩 막고 0.1초 풀기 × 4)
  const hidTest = await page.evaluate(async () => {
    const sk0 = Music.skippedSteps;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await new Promise(r => setTimeout(r, 60));
    for(let k = 0; k < 4; k++){ const t = performance.now(); while(performance.now() - t < 900){} await new Promise(r => setTimeout(r, 100)); }
    delete document.hidden;
    await new Promise(r => setTimeout(r, 2500));
    const L = Music.log.filter(e => e.track === 'market').slice(-6);
    return { skipped: Music.skippedSteps - sk0, gaps: L.slice(1).map((e, i) => +(e.t - L[i].t).toFixed(3)), bpm: L.map(e => e.bpm) };
  });
  ok('탭 가림(타이머 1초로 느려짐) 동안에도 1.5초 앞까지 예약 → 건너뛴 칸 0, 마디 간격 일정', hidTest.skipped === 0 && hidTest.gaps.every(g => Math.abs(g - hidTest.gaps[0]) < 0.01), hidTest);
  await page.evaluate(() => { tick = window.__tick; });

  // 7. 찌라시: 스팅어 + 50%, 고르면 복귀
  const tip = await page.evaluate(async () => { openTip(TIP_EVENTS[0].id); renderAll();
    await new Promise(r => setTimeout(r, 400)); const d1 = Music.duckLevel, ins = Music.instances.map(i => i.name);
    resolveTip(1); renderAll(); hideOverlay(); await new Promise(r => setTimeout(r, 1500)); return { d1, ins, d2: Music.duckLevel }; });
  ok('찌라시: tipAlert 스팅어 + BGM 50% → 고르면 100%', tip.ins.includes('tipAlert') && tip.d1 <= 0.5 && tip.d2 > 0.95, tip);

  // 8. 결산 체인: 20%로 낮추고 끝나면 weekClear 스팅어
  const ch = await page.evaluate(async () => {
    window.tipChance = () => 0; setSeed(7); startRun(); ['seal','theme'].forEach(id => gainRelic(id,'t')); run.cash += 3000;
    const p = openPosition('meme', 600, 1, 1, true); p.daysHeld = 4;
    run.day = DAYS_PER_ROUND; startMarket(); renderAll(); assets.meme.price *= 1.2;
    await new Promise(r => setTimeout(r, 1200));
    endOfDay(); renderAll();
    await new Promise(r => setTimeout(r, 900));
    const d1 = Music.duckLevel;
    while(chainPlay) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 560)); chainNext(); await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 150));
    return { d1, ins: Music.instances.map(i => i.name), track: Music.track };
  });
  ok('결산 체인 중 BGM 20% → 끝나면 weekClear 스팅어', ch.d1 <= 0.25 && ch.ins.includes('weekClear'), ch);

  // 9. 암시장 · 기록
  await page.locator('[data-act="toReward"]').click(); await sleep(200);
  const r = page.locator('[data-reward]'); if(await r.count()) await r.first().click(); else await page.locator('[data-act="skip"]').click();
  await sleep(200); const rr = page.locator('[data-relic-reward]'); if(await rr.count()) await rr.first().click();
  await sleep(1400);
  ok('암시장 → shop', (await st()).track === 'shop');
  await page.locator('#shopLeaveBtn').click(); await sleep(1400);
  ok('다음 주 개장 → premarket', (await st()).track === 'premarket');

  // 10. 파산 → gameOver 스팅어 → records
  const go = await page.evaluate(async () => { startMarket(); renderAll(); await new Promise(r => setTimeout(r, 1200));
    const p = openPosition('meme', 3000, 3, 1, true); run.cash = 0; assets.meme.price *= 0.3; checkMarginCalls(); checkBankruptcy(); renderAll();
    while(Fx.queueLength) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 300)); const a = { phase: run.phase, ins: Music.instances.map(i => i.name + (i.stopping ? '(끝)' : '')) };
    await new Promise(r => setTimeout(r, 7500)); a.after = Music.track; return a; });
  ok('파산 → gameOver 스팅어 (BGM 멈춤) → 끝나면 records', go.phase === 'over' && go.ins.includes('gameOver') && go.after === 'records', go);
  await page.locator('[data-act="title"]').click(); await sleep(1400);
  ok('타이틀로 → title', (await st()).track === 'title');

  // 11. 설정 즉시 반영
  await page.click('#settingsBtn'); await sleep(1400);
  ok('설정 화면 → records', (await st()).track === 'records');
  await page.locator('[data-row="bgm"] button', { hasText: '끄기' }).click(); await sleep(600);
  const off = await st();
  ok('배경음악 끄기 → 즉시 정지 (볼륨 행 비활성)', off.inst.length === 0 && await page.evaluate(() => document.querySelector('[data-row="bgmVol"] button').disabled), off);
  await page.locator('[data-row="bgm"] button', { hasText: '켜기' }).click(); await sleep(1300);
  ok('다시 켜기 → records 재개', (await st()).track === 'records');
  await page.locator('[data-row="sound"] button', { hasText: '끄기' }).click(); await sleep(600);
  ok('사운드 끄기 → BGM도 정지', (await st()).inst.length === 0);
  await page.locator('[data-row="sound"] button', { hasText: '켜기' }).click(); await sleep(1300);
  await page.locator('[data-row="bgmVol"] button', { hasText: '100' }).click(); await sleep(200);
  ok('볼륨 100 저장', await page.evaluate(() => JSON.parse(localStorage.getItem('hodl.settings')).bgmVol === 100));
  await page.screenshot({ path: S + '/bgm-settings-1366.png' });

  // 12. 오프라인 렌더: 트랙별 피크 (BGM 볼륨 100 · 효과음과 섞여도 클리핑 없는지)
  const peaks = await page.evaluate(async () => {
    const out = {};
    const render = async (name, secs, mood, withSfx) => {
      const oc = new OfflineAudioContext(2, 44100 * secs, 44100);
      Sound.init(oc); Sound.setVolume(1); Music.setEnabled(true); Music.setVolume(1);
      if(mood) Music.setMood(mood);
      if(Music.SONGS[name].loop === false) Music.stinger(name); else Music.crossfadeTo(name, 0.01);
      Music.pump(secs);
      if(withSfx) ['marginCall', 'sellWin', 'chainStep', 'buy'].forEach(n => Sound.play(n));
      const buf = await oc.startRendering();
      let pk = 0, sum = 0, n = 0; for(let c = 0; c < 2; c++){ const d = buf.getChannelData(c); for(let i = 0; i < d.length; i++){ const a = Math.abs(d[i]); if(a > pk) pk = a; sum += d[i] * d[i]; n++; } }
      return { peak: +pk.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
    };
    for(const n of ['title', 'premarket', 'market', 'shop', 'records']) out[n] = await render(n, 8);
    out['market BULL+위험+금감원'] = await render('market', 8, { state: 'BULL', danger: true, fss: true, progress: 1 });
    out['market VOLATILE'] = await render('market', 8, { state: 'VOLATILE', danger: false, fss: false, progress: 0 });
    out['market + 효과음 4개'] = await render('market', 4, { state: 'NORMAL', danger: false, fss: false, progress: 0 }, true);
    for(const n of ['tipAlert', 'weekClear', 'gameOver', 'victory']) out[n] = await render(n, 5);
    return out;
  });
  console.log(JSON.stringify(peaks));
  ok('모든 트랙·스팅어 피크 < 1.0 (볼륨 100, 효과음과 겹쳐도)', Object.values(peaks).every(p => p.peak < 1 && p.rms > 0.001), peaks);

  R.forEach(r => console.log(r.join('  ')));
  console.log('FAIL', R.filter(r => r[0] === 'FAIL').length, '/', R.length, 'errors', errs);
  await b.close();
})();
