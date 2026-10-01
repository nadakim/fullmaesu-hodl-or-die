/* 사운드 감사 도구 — 브라우저 쪽 라이브러리 (tools/audio/lib.cjs의 audioPage가 audio.js·music.js와 함께 올린다).
   게임 파일은 건드리지 않고, 이미 오프라인 렌더를 지원하는 Sound.init(OfflineAudioContext)·Music.pump(ahead)를 그대로 쓴다.
   소리의 좋고 나쁨은 판단하지 않는다 — 길이·피크·RMS·스펙트럼 같은 숫자만 잰다 (귀로 확인할 것은 Sound Lab에서).

   측정 정의 (docs/audio/AUDIT.md 같은 이름)
   · 활성 구간 = 10ms 창 RMS가 -55 dBFS를 넘는 창들. 활성 RMS = 그 창들 에너지 평균의 제곱근, 길이 = 첫 창(-60 dBFS↑)~마지막 창
   · crest = 피크 - 활성 RMS (dB)
   · 스펙트럼 중심·고음 비율(2kHz↑)·2~4kHz 비율·저음 비율(150Hz↓, 노트북·휴대폰 스피커가 거의 못 내는 대역) = 활성 프레임(2048점 Hann, hop 1024) 파워 스펙트럼 합
   · loudA = 활성 RMS + A가중 보정 (A가중 파워 / 전체 파워) — 같은 RMS라도 2~5kHz가 센 소리가 더 크게 들리는 것을 거칠게 반영
   · 컴프레서 전/후 = 같은 소리를 ratio 1(압축 없음)과 게임 설정(threshold -20 · knee 6 · ratio 8)으로 각각 렌더
     (Chrome 컴프레서는 자동 메이크업 게인이 있다 → calibrate()로 정적 곡선을 잰다) */
(function(){
  const SR = 44100;
  const dB = x => 20 * Math.log10(Math.max(x, 1e-12));
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const seedRandom = s => { Math.random = mulberry32(s); };

  /* ── FFT (radix-2, 제자리) ── */
  const NF = 2048, HOP = 1024;
  const HANN = new Float64Array(NF), COS = new Float64Array(NF / 2), SIN = new Float64Array(NF / 2), REV = new Uint16Array(NF);
  for(let i = 0; i < NF; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NF - 1));
  for(let i = 0; i < NF / 2; i++){ COS[i] = Math.cos(2 * Math.PI * i / NF); SIN[i] = -Math.sin(2 * Math.PI * i / NF); }
  for(let i = 0, bits = Math.log2(NF); i < NF; i++){ let r = 0; for(let b = 0; b < bits; b++) if(i & (1 << b)) r |= 1 << (bits - 1 - b); REV[i] = r; }
  function fft(re, im){
    for(let i = 0; i < NF; i++){ const j = REV[i]; if(j > i){ let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for(let size = 2; size <= NF; size <<= 1){
      const half = size >> 1, step = NF / size;
      for(let s = 0; s < NF; s += size) for(let k = 0; k < half; k++){
        const c = COS[k * step], sn = SIN[k * step], a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  const aWeightDb = f => {   // IEC 61672 A가중 (dB)
    const f2 = f * f, ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
    return 20 * Math.log10(Math.max(ra, 1e-12)) + 2.0;
  };
  const A_POW = new Float64Array(NF / 2);
  for(let k = 1; k < NF / 2; k++) A_POW[k] = Math.pow(10, aWeightDb(k * SR / NF) / 10);

  const GATE = Math.pow(10, -55 / 20), FIRST = Math.pow(10, -60 / 20), FRAME_GATE = Math.pow(10, -80 / 20);
  function analyze(x, sr, from, to){
    const N0 = from || 0, N1 = Math.min(to === undefined ? x.length : to, x.length);
    const W = Math.round(sr * 0.01), nw = Math.floor((N1 - N0) / W);
    let peak = 0, over = 0;
    for(let i = N0; i < N1; i++){ const a = Math.abs(x[i]); if(a > peak) peak = a; if(a > 1) over++; }
    const rms = new Float64Array(nw);
    for(let w = 0; w < nw; w++){ let s = 0; const o = N0 + w * W; for(let j = 0; j < W; j++){ const v = x[o + j]; s += v * v; } rms[w] = Math.sqrt(s / W); }
    let first = -1, last = -1, act = 0, e = 0;
    for(let w = 0; w < nw; w++){
      if(rms[w] > FIRST){ if(first < 0) first = w; last = w; }
      if(rms[w] > GATE){ act++; e += rms[w] * rms[w]; }
    }
    if(first < 0) return { silent: true, peakDb: dB(peak), over };
    if(act === 0){ for(let w = 0; w < nw; w++) if(rms[w] > FIRST){ act++; e += rms[w] * rms[w]; } }   // 아주 작은 초단음: 게이트(-55)에 안 걸리면 -60 dBFS 위 창으로
    const rmsAct = Math.sqrt(e / act);
    const P = new Float64Array(NF / 2), re = new Float64Array(NF), im = new Float64Array(NF);
    let frames = 0;
    for(let s = N0 + first * W; s < N0 + (last + 1) * W; s += HOP){
      let fe = 0;
      for(let i = 0; i < NF; i++){ const v = (s + i < N1 ? x[s + i] : 0); re[i] = v * HANN[i]; im[i] = 0; fe += v * v; }
      if(Math.sqrt(fe / NF) <= FRAME_GATE) continue;   // 2048점 프레임 안에 10ms짜리 소리가 들어가면 프레임 RMS가 작다 → 프레임 게이트는 따로 -80 dBFS
      fft(re, im); frames++;
      for(let k = 1; k < NF / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    }
    let tot = 0, wsum = 0, hi = 0, b24 = 0, aw = 0, lo = 0;
    for(let k = 1; k < NF / 2; k++){
      const f = k * sr / NF, p = P[k];
      tot += p; wsum += f * p; aw += p * A_POW[k];
      if(f >= 2000) hi += p;
      if(f < 150) lo += p;
      if(f >= 2000 && f < 4000) b24 += p;
    }
    const rmsDb = dB(rmsAct), peakDb = dB(peak);
    return {
      peakDb, rmsDb, crestDb: peakDb - rmsDb, durS: (last - first + 1) * 0.01, activeS: act * 0.01,
      centroid: tot ? wsum / tot : 0, hiRatio: tot ? hi / tot : 0, band24: tot ? b24 / tot : 0, loRatio: tot ? lo / tot : 0,
      loudA: tot ? rmsDb + 10 * Math.log10(aw / tot) : rmsDb, over, frames
    };
  }

  /* ── 효과음 렌더 ── */
  async function renderSfx(name, opts, o){
    o = o || {};
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * (o.seconds || 7)), SR);
    seedRandom(o.seed || 1234);
    Sound.setEnabled(true); Sound.init(ctx); Sound.setVolume(o.volume === undefined ? 0.5 : o.volume);   // 설정 '효과음 볼륨' 기본 50
    if(o.bypass) Sound.mixBus.ratio.value = 1;
    const ok = Sound.play(name, opts || {});
    if(!ok) return null;
    return (await ctx.startRendering()).getChannelData(0);
  }
  async function measureSfx(name, opts, seconds){
    const pre = await renderSfx(name, opts, { bypass: true, seconds }), post = await renderSfx(name, opts, { seconds });
    if(!post) return { missing: true };
    const a = analyze(post, SR), b = analyze(pre, SR);
    if(a.silent) return { silent: true, peakDb: a.peakDb };
    return Object.assign({}, a, { peakPreDb: b.peakDb, rmsPreDb: b.rmsDb });
  }

  /* ── 컴프레서 정적 곡선 · 메이크업 게인 · 지연 ── */
  async function sineThroughComp(levelDb, bypass){
    const ctx = new OfflineAudioContext(1, SR * 2, SR);
    Sound.setEnabled(true); Sound.init(ctx);
    if(bypass) Sound.mixBus.ratio.value = 1;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = 1000; g.gain.value = Math.pow(10, levelDb / 20);
    osc.connect(g); g.connect(Sound.mixBus); osc.start();
    const x = (await ctx.startRendering()).getChannelData(0);
    let s = 0, n = 0;
    for(let i = SR; i < SR * 2; i++){ s += x[i] * x[i]; n++; }   // 안정된 뒤 1초
    return dB(Math.sqrt(s / n));
  }
  async function calibrate(){
    const rows = [];
    for(const lv of [-60, -40, -30, -20, -12, -6, -3]){
      const inRms = lv - 3.01;   // 사인 진폭 lv dBFS → RMS
      const pre = await sineThroughComp(lv, true), post = await sineThroughComp(lv, false);
      rows.push({ inPeakDb: lv, inRmsDb: inRms, preRmsDb: pre, postRmsDb: post, gainDb: post - pre });
    }
    return { rows, makeupDb: rows[0].gainDb };   // -60 dBFS는 threshold 아래 → 정적 메이크업 게인
  }

  /* ── 게인 변화 시계열: 같은 신호를 압축 없이/있이 렌더한 쌍으로 (컴프레서가 모든 소리에 똑같이 거는 게인) ──
     grDb(t) = 메이크업 게인에서 얼마나 눌렸나 (양수 = 눌림). 창 50ms, hop 25ms */
  function grSeries(pre, post, makeupDb){
    const W = Math.round(SR * 0.05), H = Math.round(SR * 0.025), out = [];
    for(let s = 0; s + W <= pre.length; s += H){
      let a = 0, b = 0;
      for(let i = 0; i < W; i++){ a += pre[s + i] * pre[s + i]; b += post[s + i] * post[s + i]; }
      a = Math.sqrt(a / W); b = Math.sqrt(b / W);
      out.push({ t: s / SR, preDb: dB(a), grDb: a > 1e-4 ? makeupDb - dB(b / a) : null });
    }
    return out;
  }

  /* ── BGM 렌더 ── */
  const MOOD0 = { state: 'NORMAL', progress: 0, danger: false, fss: false, jackpot: false };
  /* o: { song, loop(true=곡 트랙/false=스팅어), seconds, mood, solo:[채널], bypass, at:[{t, name, opts, duck:{key, level}}], seed } */
  async function renderBgm(o){
    const ctx = new OfflineAudioContext(1, Math.ceil(SR * o.seconds), SR);
    seedRandom(o.seed || 777);
    const keepCh = Object.assign({}, MUSIC_CH_VOL), keepJp = Object.assign({}, MUSIC_JACKPOT_VOL);
    try {
      if(o.solo){
        Object.keys(MUSIC_CH_VOL).forEach(k => { if(o.solo.indexOf(k) < 0) MUSIC_CH_VOL[k] = 0; });
        Object.keys(MUSIC_JACKPOT_VOL).forEach(k => { if(o.solo.indexOf(k) < 0 && o.solo.indexOf('jackpot') < 0) MUSIC_JACKPOT_VOL[k] = 0; });
      }
      Music.setEnabled(false);
      ['stage', 'tip', 'chain', 'danger'].forEach(k => Music.unduck(k));   // 덕킹·로우패스는 Music 모듈에 남는다 → 렌더마다 초기화 (압축 없음/있음 쌍의 조건을 같게)
      Music.setMuffle(false); Music.setMuffle(0, { key: 'danger' });
      Music.setMood(Object.assign({}, MOOD0, o.mood || {}));
      Sound.setEnabled(true); Sound.init(ctx); Sound.setVolume(0.5);
      if(o.bypass) Sound.mixBus.ratio.value = 1;
      if(o.loop !== false) Music.crossfadeTo(o.song, 0);
      Music.setEnabled(true);              // 첫 pump: ensure() → 새 컨텍스트에 그래프 연결 (+ 트랙 시작)
      if(o.loop === false) Music.stinger(o.song);
      Music.pump(o.seconds);               // 렌더 길이 전체의 음을 미리 예약 (타이머 pump는 이미 예약된 칸을 다시 만들지 않는다)
      (o.at || []).forEach(ev => ctx.suspend(Math.ceil(ev.t * SR / 128) * 128 / SR).then(() => {
        if(ev.duck) Music.duck(ev.duck.key, ev.duck.level);
        if(ev.name) Sound.play(ev.name, ev.opts || {});
        ctx.resume();
      }));
      const x = (await ctx.startRendering()).getChannelData(0);
      return x;
    } finally {
      Music.setEnabled(false);
      Object.assign(MUSIC_CH_VOL, keepCh); Object.assign(MUSIC_JACKPOT_VOL, keepJp);
    }
  }
  const loopSeconds = name => { const s = Music.SONGS[name]; return Music.barsOf(name) * s.beatsPerBar * 60 / s.bpm; };   // 한 바퀴 = 마디 수 × 박자 × 60/bpm (스윙은 2칸 합이 같다)

  /* 윈도 RMS(dB) 시계열 — 루프 이음매 검사용 */
  function rmsSeries(x, winS, hopS, from, to){
    const W = Math.round(SR * winS), H = Math.round(SR * hopS), out = [];
    for(let s = Math.round(SR * from); s + W <= Math.min(x.length, Math.round(SR * to)); s += H){
      let a = 0; for(let i = 0; i < W; i++) a += x[s + i] * x[s + i];
      out.push({ t: s / SR, db: dB(Math.sqrt(a / W)) });
    }
    return out;
  }

  const median = xs => { const a = xs.filter(v => v !== null && Number.isFinite(v)).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : null; };
  const percentile = (xs, p) => { const a = xs.filter(v => Number.isFinite(v)).sort((q, r) => q - r); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };

  /* 루프 이음매: 루프가 한 바퀴 돌아 처음으로 돌아가는 순간(tB)의 레벨 낙차를, 같은 곡의 다른 마디 경계들과 비교한다.
     (칩튠은 음표 사이가 -80dB 이하로 비는 일이 흔해서 '곡 안 아무 창'과 비교하면 이음매가 늘 이상치로 나온다 → 마디 경계끼리 비교)
     jumpDb = 경계 직전 30ms ↔ 직후 30ms RMS 차(dB), innerMax/P95 = 이음매를 뺀 마디 경계들의 같은 값,
     flag = 이음매가 다른 모든 마디 경계의 최대보다 6dB 넘게 크다 (이음매에서만 튀는 소리가 있다는 뜻) */
  function seamCheck(x, tB, barS, bars){
    const W = Math.round(SR * 0.03), t0 = tB - bars * barS;
    const rms = s => { let a = 0; for(let i = 0; i < W; i++) a += x[s + i] * x[s + i]; return dB(Math.sqrt(a / W)); };
    const edge = t => { const at = Math.round(SR * t); return { before: rms(at - W), after: rms(at) }; };
    const jump = t => { const e = edge(t); return Math.abs(e.before - e.after); };
    const inner = [];
    for(let k = 1; k < bars; k++){ const d = jump(t0 + k * barS); if(Number.isFinite(d)) inner.push(d); }
    const seam = edge(tB), j = Math.abs(seam.before - seam.after), mx = Math.max(...inner);
    return { jumpDb: j, beforeDb: seam.before, afterDb: seam.after, innerMedianDb: median(inner), innerP95Db: percentile(inner, 0.95), innerMaxDb: mx, flag: j > mx + 6 };
  }

  /* 큰 효과음 직후 BGM이 눌리는 정도: 같은 BGM(+ 효과음)을 압축 없이/있이 렌더해 컴프레서 게인 시계열을 비교한다.
     o: { song, mood, sfx:{name, opts}|null, duck:level|null, atS, seconds, makeupDb } → { baselineGrDb, peakGrDb, deltaGrDb, recoverS } */
  async function afterSfx(o){
    const at = o.sfx ? [{ t: o.atS, name: o.sfx.name, opts: o.sfx.opts, duck: o.duck ? { key: 'stage', level: o.duck } : null }] : [];
    const common = { song: o.song, mood: o.mood, seconds: o.seconds, at };
    const pre = await renderBgm(Object.assign({ bypass: true }, common)), post = await renderBgm(common);
    const gr = grSeries(pre, post, o.makeupDb);
    const base = median(gr.filter(r => r.t >= 2.5 && r.t < o.atS - 0.2).map(r => r.grDb));
    if(!o.sfx) return { baselineGrDb: base, p95GrDb: percentile(gr.filter(r => r.t >= 2.5).map(r => r.grDb), 0.95) };
    const win = gr.filter(r => r.t >= o.atS && r.t < o.atS + 4 && r.grDb !== null);
    let peak = -Infinity, peakT = o.atS;
    win.forEach(r => { if(r.grDb > peak){ peak = r.grDb; peakT = r.t; } });
    const rec = gr.find(r => r.t > peakT && r.grDb !== null && r.grDb <= base + 1);
    const postRms = analyze(post, SR, Math.round(SR * 2.5), Math.round(SR * (o.atS - 0.2)));
    return { baselineGrDb: base, peakGrDb: peak, deltaGrDb: peak - base, recoverS: rec ? rec.t - o.atS : null, bgmPostRmsDb: postRms.rmsDb };
  }

  /* ── 발음 리플레이: 기록한 Sound.play 호출을 같은 audio.js 규칙(합치기 30ms · 최대 8개 · 가장 오래된 것부터 끊기)으로 다시 돌려
     merged·stolen·stolenBy·peakVoices를 센다. 오프라인 컨텍스트를 suspend로 한 칸씩 전진시키고 performance.now를 기록 시각으로 바꿔 쓴다 ── */
  async function replayVoices(events, totalSec){
    const sr = 8000, ctx = new OfflineAudioContext(1, Math.ceil(sr * (totalSec + 6)), sr);
    seedRandom(99);
    Sound.setEnabled(true); Sound.init(ctx); Sound.setVolume(0.5);
    const realNow = performance.now.bind(performance);
    let vnow = 0;
    performance.now = () => vnow;
    const byQ = new Map();
    events.forEach(ev => { const q = Math.ceil(ev.t / 1000 * sr / 128) * 128 / sr; (byQ.get(q) || byQ.set(q, []).get(q)).push(ev); });
    let missing = {};
    const mergedBy = {}, lostBy = {}, lastOpts = {};   // 합쳐진 호출의 이름별 수 / 그중 앞 호출과 옵션(음높이 등)이 달라서 새 음이 사라진 수
    [...byQ.keys()].sort((a, b) => a - b).forEach(q => {
      ctx.suspend(q).then(() => {
        byQ.get(q).forEach(ev => {
          vnow = ev.t;
          const m0 = Sound.stats.merged, key = JSON.stringify(ev.opts || {});
          if(!Sound.play(ev.name, ev.opts || {})) missing[ev.name] = (missing[ev.name] || 0) + 1;
          if(Sound.stats.merged > m0){ mergedBy[ev.name] = (mergedBy[ev.name] || 0) + 1; if(lastOpts[ev.name] !== undefined && lastOpts[ev.name] !== key) lostBy[ev.name] = (lostBy[ev.name] || 0) + 1; }
          lastOpts[ev.name] = key;
        });
        ctx.resume();
      });
    });
    try { await ctx.startRendering(); } finally { performance.now = realNow; }
    const st = Sound.stats;
    return { merged: st.merged, stolen: st.stolen, stolenBy: Object.assign({}, st.stolenBy), peakVoices: st.peakVoices, played: Object.assign({}, st.played), missing, mergedBy, lostBy };
  }

  window.AudioAudit = { SR, dB, analyze, renderSfx, measureSfx, calibrate, grSeries, renderBgm, loopSeconds, rmsSeries, seamCheck, afterSfx, median, percentile, replayVoices, seedRandom, fft };
})();
