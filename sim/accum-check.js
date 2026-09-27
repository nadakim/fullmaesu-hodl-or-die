/* 세력 매집 적중률 실측 (S7-20): '세력 매집 포착' 찌라시가 약속한 '내일 매수세 전환 확률'이 실제로 맞는지.
   node sim/accum-check.js [--n 400]  — random 봇으로 N판을 돌려, 찌라시가 뜬 종목의 다음 날 추세를 센다.
   표시 확률(accumUpChance, 판정에 쓰는 값)의 평균과 실제 UP 비율이 오차 범위 안에서 같아야 한다 */
const loadEngine = require('./load-engine.js');
const S = require('./strategies.js');
const n = +(process.argv[process.argv.indexOf('--n') + 1] || 400) || 400;
const E = loadEngine();
let events = 0, shownSum = 0, hits = 0, baseEvents = 0, baseHits = 0;
for(let seed = 1; seed <= n; seed++){
  E.setSeed(seed); E.startNewRun();
  const rng = (() => { let t = seed ^ 0x5bd1e995; return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })();
  let pending = [];   // 오늘 매집 포착된 종목 { id, shown }
  for(let steps = 0; steps < 20000 && E.run.phase !== 'over'; steps++){
    const ph = E.run.phase;
    if(ph === 'premarket'){ S.random.premarket(E, rng); E.startMarket(); }
    else if(ph === 'market'){
      const tip = E.run.pendingTip;
      if(tip){ if(tip.eventId === 'accum') pending.push({ id: tip.stockId, shown: tip.accumUp }); E.resolveTip(rng() < 0.5 ? 0 : 1); continue; }
      const day = E.run.day, round = E.run.round, before = E.STOCKS.filter(s => E.assets[s.id].regime).map(s => [s.id, E.assets[s.id].regime]);
      E.tick();
      if(E.run.day !== day || E.run.round !== round || E.run.phase !== 'market'){   // 장 마감 → 전이 끝
        pending.forEach(p => { events++; shownSum += p.shown; if(E.assets[p.id].regime === 'UP') hits++; });
        // 대조: 같은 날 매집이 안 뜬 UP·FLAT 종목의 UP 비율
        before.forEach(([id, r]) => { if(E.ACCUM_REGIMES.indexOf(r) >= 0 && !pending.some(p => p.id === id)){ baseEvents++; if(E.assets[id].regime === 'UP') baseHits++; } });
        pending = [];
      }
    }
    else if(ph === 'reward'){ if(E.run.rewardStep === 'card') E.chooseReward('skip'); else E.chooseRelicReward(''); }
    else if(ph === 'shop') E.leaveShop();
  }
}
const pct = x => (x * 100).toFixed(1) + '%';
const se = events ? Math.sqrt((hits / events) * (1 - hits / events) / events) : 0;
console.log(`세력 매집 포착 ${events}회 (${n}판)`);
console.log(`표시한 '내일 매수세 전환 확률' 평균 ${pct(shownSum / Math.max(1, events))} · 실제 UP 전환 ${pct(hits / Math.max(1, events))} (±${pct(1.96 * se)} 95%)`);
console.log(`대조: 매집 없는 UP·FLAT 종목의 다음 날 UP 비율 ${pct(baseHits / Math.max(1, baseEvents))} (${baseEvents}건)`);
