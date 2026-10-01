/* 재생 빈도 측정용 — 실제 게임 화면(docs/demo) 안에서 sim/strategies.js의 봇을 돌리는 도우미 (tools/audio/freq.cjs가 올린다).
   게임 파일은 바꾸지 않는다. 봇은 엔진 함수(E)를 그대로 부르고, 화면 전환(장 시작·정산 다음·보상·암시장 나가기)은 freq.cjs가 실제 버튼을 눌러서 한다.
   → 소리는 게임이 평소 부르는 경로(onGameEvent · 연출 큐 · 정산 무대) 그대로 나온다. Sound.play는 소리를 내지 않고 (이름·시각·옵션)만 기록한다. */
(function(){
  const LIVE = ['run', 'assets', 'marketPrice', 'marketState', 'candleData', 'eventListener', 'eventLog'];   // 재대입되는 변수는 매번 읽는다 (sim/load-engine.js와 같은 규칙)
  const live = {}; LIVE.forEach(k => { live[k] = new Function('return ' + k); });
  const cache = {};
  const E = new Proxy({}, { get(_, key){
    if(typeof key !== 'string') return undefined;
    if(live[key]) return live[key]();
    if(!(key in cache)){ try { cache[key] = (0, eval)(key); } catch(e) { cache[key] = undefined; } }
    return cache[key];
  } });
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  function pickReward(strat, choices, priority, rng, fallbackFirst){   // sim/runner.js와 같은 규칙
    if(strat.randomPicks) return rng() < 0.8 && choices.length ? choices[Math.floor(rng() * choices.length)] : '';
    const hit = priority.find(id => choices.indexOf(id) >= 0);
    return hit || (fallbackFirst && choices.length ? choices[0] : '');
  }

  const bot = window.__bot = {
    E, S: null, strat: null, rng: null, log: [],
    load(src){ const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); this.S = m.exports; },
    init(name, seed){ this.strat = this.S[name]; if(!this.strat) throw new Error('알 수 없는 전략: ' + name); this.rng = mulberry32(seed ^ 0x9E3779B9); setSeed(seed); },
    hook(){   // Sound.play 기록 (소리는 내지 않음 — 이 판의 발음 규칙은 나중에 같은 audio.js로 리플레이해서 센다)
      const log = this.log = [];
      Sound.play = (name, opts) => { log.push({ t: Math.round(performance.now()), name, opts: opts ? JSON.parse(JSON.stringify(opts)) : undefined }); return true; };
    },
    premarket(){ this.strat.premarket(E, this.rng); renderAll(); },
    tip(){ return this.strat.tip(E, this.rng); },
    cardPick(){ return pickReward(this.strat, E.run.rewardChoices, this.strat.cardPick || [], this.rng, false); },
    relicPick(){
      const st = this.strat, choices = st.relicFilter ? E.run.relicChoices.filter(x => st.relicFilter(E, x)) : E.run.relicChoices;
      const first = (st.relicFirst || []).find(id => choices.indexOf(id) >= 0);
      const id = first || pickReward(st, choices, st.relicPick || [], this.rng, true);
      const swap = id ? this.S.relicSwap(E, id, st.relicFirst || st.relicPick, st.randomPicks ? this.rng : null) : undefined;   // undefined = 칸 여유 · null = 포기 · id = 그 유물 교체
      return { id: id || '', swap: swap === undefined ? '' : swap };
    },
    shop(){ this.strat.shop(E, this.rng); (this.strat.arrange || this.S.arrangeRelics)(E); renderAll(); },
    state(){
      const q = (sel) => [...document.querySelectorAll('#overlayBox ' + sel)];
      const r = (typeof run !== 'undefined' && run) ? run : null;
      return {
        v: Math.round(performance.now()), tab: currentTab, phase: r && r.phase, round: r && r.round, day: r && r.day, tick: r && r.tickInDay,
        over: !!(r && r.phase === 'over'), endCause: r && r.endCause, weeks: r && r.weeksCleared,
        overlay: !!overlayOpen, busy: !!Fx.queueBusy, stage: !!stage, stageHold: !!(stage && stage.hold), chainPlay: !!chainPlay, chainHold: !!chainHold,
        pendingTip: !!(r && r.pendingTip), rewardStep: r && r.rewardStep,
        acts: overlayOpen ? q('[data-act]').map(e => e.dataset.act + (e.disabled ? '!' : '')) : [],
        tipBtns: overlayOpen ? q('[data-tip-choice]').map(e => e.dataset.tipChoice + (e.disabled ? '!' : '')) : [],
        rewards: overlayOpen ? q('[data-reward]').map(e => e.dataset.reward) : [],
        relics: overlayOpen ? q('[data-relic-reward]').map(e => e.dataset.relicReward) : [],
        swaps: overlayOpen ? q('[data-swap-pick]').map(e => e.dataset.swapPick) : [],
        openDisabled: !!(document.getElementById('openBtn') && document.getElementById('openBtn').disabled),
        slots: r ? r.relics.length : 0, bgm: settings.bgm, sound: settings.sound, speed: settings.speed, fxSpeed: settings.fxSpeed
      };
    }
  };
})();
