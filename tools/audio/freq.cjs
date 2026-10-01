#!/usr/bin/env node
/* 효과음 재생 빈도 측정 — 실제 게임 화면(docs/demo)을 Playwright 가상 시계(page.clock)로 빠르게 돌리면서 봇이 판을 끝까지 두고,
   Sound.play 호출을 (이름·시각·옵션)만 기록한다. 소리는 내지 않는다. 연출 경로는 평소 설정('보통')·장중 1배속 그대로 —
   정산 무대·결산 체인도 스킵하지 않고 끝까지 재생한다 (가장 시끄러운 쪽 = 상한에 가까운 빈도).
     node tools/audio/freq.cjs [--games antFlagBuild:1,antFlagBuild:2,levTowerBuild:1,random:1,random:2,nothing:1]
                               [--maxMin 25]  판당 가상 시간 상한 (분)   [--wall 1500] 전체 실제 시간 상한 (초)   [--raw /tmp/audio/raw] 판별 원본 로그
                               [--from /tmp/audio/raw]  판을 다시 돌리지 않고 저장한 원본 로그(--raw)에서 리플레이·집계만 다시 한다
   기록한 호출은 같은 audio.js 규칙(합치기 30ms · 최대 8개 · 가장 오래된 것부터 끊기)으로 오프라인 컨텍스트에서 리플레이해
   merged · stolen · stolenBy(이름별) · peakVoices(동시 발음 최대)를 센다.
   한계: UI 조작음(uiHover·uiPress·uiClick)은 봇이 누른 버튼만큼만 나온다 / BGM 끔(스팅어 대신 효과음 경로) / 온보딩 전부 해금 상태. */
const fs = require('fs');
const path = require('path');
const L = require('./lib.cjs');
const o = L.argv({ games: 'antFlagBuild:1,antFlagBuild:2,levTowerBuild:1,random:1,random:2,nothing:1', maxMin: 25, wall: 1500, out: 'docs/audio/data', raw: '', from: '', step: 120 });
const OUT = path.resolve(__dirname, '../..', o.out);
fs.mkdirSync(OUT, { recursive: true });
const STRAT_SRC = fs.readFileSync(path.resolve(__dirname, '../../sim/strategies.js'), 'utf8');
const BOT_FILE = path.join(__dirname, 'bot-page.js');

async function playOne(browser, url, strat, seed, deadline){
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.setDefaultTimeout(4000);
  await page.clock.install({ time: 0 });
  await page.addInitScript(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); localStorage.setItem('hodl.settings', JSON.stringify({ bgm: false })); } catch(e) {} });
  await page.goto(url + '/demo.html');
  await page.addScriptTag({ path: BOT_FILE });
  await page.evaluate(src => __bot.load(src), STRAT_SRC);
  await page.evaluate(() => __bot.hook());
  await page.keyboard.press('Shift');
  await page.clock.runFor(300);
  await page.evaluate(([n, s]) => __bot.init(n, s), [strat, seed]);
  const res = { strat, seed, steps: 0, clickFail: 0, notes: [] };
  const click = async sel => {
    try { await page.click(sel, { timeout: 1500 }); return true; }
    catch(e) { res.clickFail++; try { await page.evaluate(s => { const el = document.querySelector(s); if(el) el.click(); }, sel); } catch(e2) {} return false; }
  };
  await click('#startBtn');
  await page.clock.runFor(700);

  let vstart = null, overAt = null, dayKey = '', dayAt = 0, prepKey = '', shopKey = '', relicPlan = null, lastSig = '', lastChange = 0, lastEsc = 0;
  for(;;){
    const st = await page.evaluate(() => __bot.state());
    if(vstart === null) vstart = st.v;
    res.steps++;
    if(st.over && overAt === null) overAt = st.v;
    if(overAt !== null && (st.acts.includes('restart') || st.v - overAt > 45000)){   // 엔딩 화면이 뜰 때까지 (졸업이면 결산 체인 → 승리음, 파산·미달이면 게임오버음) 연출을 끝까지 진행한 뒤 마무리
      await page.clock.runFor(4000); res.endV = (await page.evaluate(() => performance.now())); res.ended = true; if(!st.acts.includes('restart')) res.notes.push('엔딩 화면 없이 45초 경과'); break;
    }
    if((st.v - vstart) / 60000 > o.maxMin){ res.capped = 'maxMin'; res.endV = st.v; break; }
    if(Date.now() > deadline){ res.capped = 'wall'; res.endV = st.v; break; }
    const sig = [st.phase, st.round, st.day, st.tick, st.overlay, st.acts.join(), st.stage, st.stageHold, st.chainPlay, st.chainHold, st.busy, st.tab].join('|');
    if(sig !== lastSig){ lastSig = sig; lastChange = st.v; }
    const idle = st.v - lastChange;
    let acted = false;

    if(st.overlay){
      if(st.acts.includes('stageNext')) acted = await click('#overlayBox [data-act="stageNext"]');
      else if(st.acts.includes('chainNext')) acted = await click('#overlayBox [data-act="chainNext"]');
      else if(st.tipBtns.length){
        let i = await page.evaluate(() => __bot.tip());
        if(st.tipBtns.includes(i + '!')) i = i === 0 ? 1 : 0;
        acted = await click(`#overlayBox [data-tip-choice="${i}"]`);
      }
      else if(st.acts.includes('toReward')) acted = await click('#overlayBox [data-act="toReward"]');
      else if(st.swaps.length){
        acted = relicPlan && relicPlan.swap ? await click(`#overlayBox [data-swap-pick="${relicPlan.swap}"]`) : await click('#overlayBox [data-act="swapGiveUp"]');
      }
      else if(st.relics.length){
        relicPlan = await page.evaluate(() => __bot.relicPick());
        acted = !relicPlan.id || relicPlan.swap === null ? await click('#overlayBox [data-act="skipRelic"]') : await click(`#overlayBox [data-relic-reward="${relicPlan.id}"]`);
      }
      else if(st.rewards.length || st.acts.includes('skip')){
        const id = await page.evaluate(() => __bot.cardPick());
        acted = id && st.rewards.includes(id) ? await click(`#overlayBox [data-reward="${id}"]`) : await click('#overlayBox [data-act="skip"]');
      }
      else if(st.acts.includes('close')) acted = await click('#overlayBox [data-act="close"]');
      else if(idle > 5000 && st.v - lastEsc > 3000){ lastEsc = st.v; await page.keyboard.press('Escape'); acted = true; }
    } else if(st.stage || st.chainPlay || st.busy){
      // 연출 재생 중 — 그대로 둔다 (스킵하지 않음)
    } else if(st.phase === 'premarket' && st.tab === 'play'){
      const key = st.round + '-' + st.day;
      if(key !== dayKey){ dayKey = key; dayAt = st.v; }
      if(prepKey !== key && st.v - dayAt >= 1400){ prepKey = key; try { await page.evaluate(() => __bot.premarket()); } catch(e) { res.notes.push('premarket: ' + e.message.slice(0, 80)); } acted = true; }
      else if(prepKey === key && st.v - dayAt >= 1500){ acted = await click('#openBtn'); }
    } else if(st.phase === 'shop'){
      if(shopKey !== String(st.round)){ shopKey = String(st.round); try { await page.evaluate(() => __bot.shop()); } catch(e) { res.notes.push('shop: ' + e.message.slice(0, 80)); } acted = true; }
      else acted = await click('#shopLeaveBtn');
    } else if(idle > 6000 && st.phase !== 'market' && st.v - lastEsc > 3000){
      lastEsc = st.v; await page.keyboard.press('Escape'); acted = true;
    }
    if(idle > 90000 && st.phase !== 'market'){ res.capped = 'stalled'; res.notes.push('멈춤: ' + sig); res.endV = st.v; break; }
    await page.clock.runFor(acted ? 80 : o.step);
  }
  const log = await page.evaluate(() => __bot.log);
  const fin = await page.evaluate(() => ({ phase: run.phase, endCause: run.endCause, round: run.round, day: run.day, weeks: run.weeksCleared, peak: Math.round(run.peakEquity), relics: run.relics.slice() }));
  Object.assign(res, fin, { vstart, minutes: (res.endV - vstart) / 60000, events: log.filter(e => e.t >= vstart).map(e => ({ t: e.t - vstart, name: e.name, opts: e.opts })), errs });
  await page.close();
  return res;
}

async function replay(browser, res){
  const page = await L.audioPage(browser, { withLab: false });
  const r = await page.evaluate(([events, sec]) => AudioAudit.replayVoices(events, sec), [res.events, res.minutes * 60]);
  await page.close();
  return r;
}

async function main(){
  const { server, url } = await L.serve();
  const browser = await L.chromium().launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const t0 = Date.now(), deadline = t0 + o.wall * 1000, games = [];
  for(const g of o.games.split(',')){
    const [strat, seed] = g.split(':');
    const t1 = Date.now();
    const res = o.from ? JSON.parse(fs.readFileSync(path.join(o.from, `${strat}-${seed}.json`), 'utf8')) : await playOne(browser, url, strat, +seed, deadline);
    res.voices = await replay(browser, res);
    const counts = {}; res.events.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; });
    res.counts = counts;
    if(o.raw && !o.from){ fs.mkdirSync(o.raw, { recursive: true }); fs.writeFileSync(path.join(o.raw, `${strat}-${seed}.json`), JSON.stringify(res)); }
    games.push(res);
    console.log(`${strat}:${seed}  ${res.ended ? (res.endCause || res.phase) : '중단(' + res.capped + ')'}  ${res.weeks}주 통과·W${res.round}D${res.day}  가상 ${res.minutes.toFixed(1)}분  소리 ${res.events.length}번  merged ${res.voices.merged} stolen ${res.voices.stolen} 동시 ${res.voices.peakVoices}  (${((Date.now() - t1) / 1000).toFixed(0)}s)${res.notes.length ? '  ⚠ ' + res.notes.join(' / ') : ''}${res.errs.length ? '  페이지에러 ' + res.errs.length : ''}`);
    if(Date.now() > deadline){ console.log('전체 시간 상한 도달 — 남은 판 생략'); break; }
  }
  await browser.close(); server.close();

  // 합산: 전체 / 전략 묶음별
  const sum = (rows) => {
    const minutes = rows.reduce((s, g) => s + g.minutes, 0), counts = {};
    rows.forEach(g => Object.keys(g.counts).forEach(k => { counts[k] = (counts[k] || 0) + g.counts[k]; }));
    const stolenBy = {}; rows.forEach(g => Object.keys(g.voices.stolenBy).forEach(k => { stolenBy[k] = (stolenBy[k] || 0) + g.voices.stolenBy[k]; }));
    const top = Object.keys(counts).map(k => ({ name: k, count: counts[k], perMin: L.round(counts[k] / minutes, 2) })).sort((a, b) => b.perMin - a.perMin);
    const mergedBy = {}, lostBy = {}, variety = {};
    rows.forEach(g => { Object.keys(g.voices.mergedBy || {}).forEach(k => { mergedBy[k] = (mergedBy[k] || 0) + g.voices.mergedBy[k]; }); Object.keys(g.voices.lostBy || {}).forEach(k => { lostBy[k] = (lostBy[k] || 0) + g.voices.lostBy[k]; }); });
    const combos = {};   // 이름 → { 옵션 JSON → 횟수 } : 같은 호출이 얼마나 반복되는가
    rows.forEach(g => g.events.forEach(e => { const c = combos[e.name] || (combos[e.name] = {}), k = JSON.stringify(e.opts || {}); c[k] = (c[k] || 0) + 1; }));
    Object.keys(combos).forEach(k => { const v = Object.values(combos[k]), n = v.reduce((a, b) => a + b, 0); variety[k] = { n, distinct: v.length, topShare: L.round(Math.max(...v) / n, 3) }; });
    return { games: rows.length, minutes: L.round(minutes, 2), total: rows.reduce((s, g) => s + g.events.length, 0), merged: rows.reduce((s, g) => s + g.voices.merged, 0), stolen: rows.reduce((s, g) => s + g.voices.stolen, 0),
             peakVoices: Math.max(...rows.map(g => g.voices.peakVoices)), stolenBy, mergedBy, lostBy, variety, counts, top };
  };
  const byStrat = {}; games.forEach(g => { (byStrat[g.strat] || (byStrat[g.strat] = [])).push(g); });
  const data = {
    note: '가상 시계로 돌린 실제 UI. 연출 보통·장중 1배속·BGM 끔·온보딩 전부 해금. perMin = 이름별 총 횟수 ÷ 가상 플레이 분',
    settings: { fxSpeed: 'normal', speed: 1, bgm: false, unlockWeek: 8 },
    all: sum(games), byStrategy: Object.fromEntries(Object.keys(byStrat).map(k => [k, sum(byStrat[k])])),
    games: games.map(g => ({ strat: g.strat, seed: g.seed, ended: !!g.ended, capped: g.capped || null, endCause: g.endCause, weeksCleared: g.weeks, round: g.round, day: g.day, minutes: L.round(g.minutes, 2),
                            events: g.events.length, merged: g.voices.merged, stolen: g.voices.stolen, peakVoices: g.voices.peakVoices, stolenBy: g.voices.stolenBy, relics: g.relics, notes: g.notes }))
  };
  fs.writeFileSync(path.join(OUT, 'freq.json'), JSON.stringify(data, null, 1));
  console.log('\n상위 15 (분당):');
  data.all.top.slice(0, 15).forEach(r => console.log(`  ${r.name.padEnd(14)} ${String(r.count).padStart(6)}회  ${String(r.perMin).padStart(6)}/분`));
  console.log(`동시 발음 최대 ${data.all.peakVoices} · merged ${data.all.merged} · stolen ${data.all.stolen}  → ${path.join(o.out, 'freq.json')}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
main().catch(e => { console.error(e); process.exit(1); });
