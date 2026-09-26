/* ══════════════════════════════════════════════════════════
   AUDIO — 칩튠 효과음. 음원 파일 없이 Web Audio API(사각파·삼각파·톱니파·노이즈)로 합성한다.
   UI 전용: 엔진(engine.js)은 이 파일을 모른다. docs/demo의 onGameEvent·연출 함수만 Sound.play()를 부른다.

   사용: Sound.play('buy', { pitch: 2, volume: 0.8 })   pitch = 주파수 배율(2 = 한 옥타브 위), volume = 이 소리만의 배율
         첫 클릭·키 입력 때 Sound.unlock()이 AudioContext를 만들고 resume한다 (브라우저 자동재생 정책).
   섞기: 소리마다 버스(GainNode) → 마스터 GainNode(볼륨) → DynamicsCompressor → 스피커.
         같은 이름이 SFX_MERGE_MS 안에 또 오면 새로 울리지 않고 앞 소리 볼륨만 조금 키운다 (전량 매도로 5개 동시 청산 등).
         동시에 SFX_MAX_VOICES개까지 — 넘으면 가장 오래된 소리를 끊는다.

   이벤트 이름 → 언제 울리는지 (Unity 이식 때 AudioClip 이름표로 그대로 쓴다)
   | 이름        | 언제 (docs/demo)                                            | 소리                                   |
   |-------------|-------------------------------------------------------------|----------------------------------------|
   | uiClick     | 버튼·탭 클릭                                                | 짧은 틱                                |
   | cardPlay    | cardPlayed                                                  | 노이즈 "탁" + 저음 펀치                |
   | cardReject  | cardRejected · shopRejected                                 | 낮은 버저 2음 하강                     |
   | buy         | bought (opts.lev: 2x 이상 한 옥타브 위 + 디스토션, opts.dir −1 = 숏은 하강) | 2음 "띠링"             |
   | sellWin     | sold · soldAll · orderFilled (pnl ≥ 0)                      | 동전 "칭"                              |
   | sellLoss    | sold · soldAll · orderFilled (pnl < 0)                      | 둔탁한 하강음                          |
   | tick        | 장중 캔들마다 (게임 루프, 설정 '장중 틱 소리')             | 아주 작은 시계 틱                      |
   | marketOpen  | marketOpen                                                  | 개장 벨 3음 아르페지오                 |
   | dayEnd      | dayEnd · circuitBreak                                       | 장 마감 종 2음                         |
   | gapUp       | gap · gapOpen (pct > 0)                                     | 로켓 상승 스윕                         |
   | gapDown     | gap · gapOpen (pct < 0)                                     | 급하강 스윕 + 노이즈                   |
   | marginCall  | marginCall (연쇄 큐 · 체인 피치)                            | 사이렌 2회 + 저음 쿵 + 글리치 노이즈   |
   | gapAlarm    | 강 단계 갭 경보 · 파산 직전 경고                            | 경보 사이렌 2회 (쿵 없음)              |
   | tipArrive   | tipEvent                                                    | 휴대폰 진동 "지잉 지잉"                |
   | tipJackpot  | tipResolved (delta > 0)                                     | 짧은 팡파레                            |
   | tipBust     | (예전 tipResolved delta < 0 — 지금은 찌라시 결과 알림이 아래 소리들을 쓴다) | 트롬본 하강 "뿌와와와" |
   | coinDrop    | 찌라시 결과 알림: 상승 (지폐·동전이 쏟아질 때)              | 고음 사각·사인 3개 어긋난 "짤랑" × opts.count 무작위 간격 |
   | billFlip    | 찌라시 결과 알림: 상승, 금액 카운트업 한 칸마다             | 하이패스 노이즈 12ms × opts.count "촤르르" |
   | cashRegister| 찌라시 결과 알림: 상승 tier 3, 카운트업 끝                  | 저음 노이즈 "철컹" + 고음 벨 "띵"      |
   | flatShrug   | 찌라시 결과 알림: 횡보                                      | 살짝 올라갔다 내려오는 김빠진 "음~음"   |
   | crashDown   | 찌라시 결과 알림: 하락                                      | 긴 하강 글리산도 + 저음 쿵             |
   | crowdScream | 찌라시 결과 알림: 하락 — 합성음 없음, 파일(scream.*)이 있을 때만 | (파일 전용)                      |
   | relicTick   | 유물 소발동 (매 틱·매일 발동, 성장형 +스택). opts.stacks: 1 = 기본음, 10스택마다 한 옥타브 위 (최대 3옥타브) | 짧은 "칭" |
   | relicLevelUp| 유물 대발동 (성장형 5·10·25·50스택, 저금통 지급, 큰 금액). opts.rarity: 끝음이 등급마다 다름, 신화는 반짝 아르페지오 추가 | 상승 아르페지오 + 반짝 |
   | relicShatter| 성장형 유물 초기화 (relicReset)                             | 유리 깨지는 노이즈 + 하강음           |
   | shopShuffle | shopRerolled (암시장 진열 새로고침)                         | 카드 섞는 "촤르륵" 노이즈 연타 + 끝 "탁" |

   파일 덮어쓰기: docs/assets/sfx/<이름>.ogg|mp3|wav 를 docs/assets/sfx/files.js의 SFX_FILES 목록에 적으면 합성음 대신 그 파일을 튼다
   (fetch + decodeAudioData, 실패하면 조용히 합성음). crowdScream은 'scream' 파일명도 받는다 (SFX_FILE_ALIAS). 목록이 비어 있으면 요청 0번.
   목록을 두는 이유: 브라우저는 없는 파일을 찾아보기만 해도 콘솔에 404 에러를 남긴다.
   | fssWarn     | fssRaised (warn)                                            | 전화벨 1회                             |
   | fssSanction | fssSanction                                                 | 전화벨 + 도장 쾅                       |
   | chainStep   | 결산 체인 스텝 (opts.pitch로 반음씩 상승)                   | "칭"                                   |
   | countTick   | 결산 체인 숫자 카운트업 한 칸                               | 아주 짧은 블립                         |
   | stampWin    | 결산 체인 "떡상!" 스탬프 (스킵하면 이것 1번)                | 쾅 + 장조 아르페지오                   |
   | stampLoss   | 결산 체인 "물림" 스탬프                                     | 쾅 + 단조 하강                         |
   | weekClear   | roundClear (결산 화면이 뜰 때)                              | 승리 징글 6음                          |
   | goalReach   | 주중 순자산이 이번 주 목표를 처음 넘을 때                   | 짧은 2음 + 반짝                        |
   | packFlip    | packOpened (opts.rarity: 등급마다 끝음이 다름, 신화는 반짝 아르페지오) | 휘릭 + 끝음                 |
   | relicGain   | relicGained                                                 | 신비한 벨 3음 + 메아리                 |
   | weekFail    | runOver (MISSED)                                            | 짧은 하강 3음                          |
   | bankrupt    | runOver (BANKRUPT)                                          | 긴 하강 글리산도 + 게임오버 4음        |
   | victory     | runOver (VICTORY, 졸업)                                     | 가장 긴 팡파레                         |
══════════════════════════════════════════════════════════ */
const SFX_MERGE_MS    = 30;    // 같은 소리가 이 안에 또 오면 합친다
const SFX_MERGE_GAIN  = 1.2;   //   합칠 때마다 앞 소리 볼륨 × 이만큼
const SFX_MERGE_MAX   = 1.8;   //   최대 배율
const SFX_MAX_VOICES  = 8;     // 동시 발음 수
const SFX_MASTER_GAIN = 0.6;
const RELIC_TICK_OCTAVE_STACKS = 10;   // relicTick: 이 스택마다 한 옥타브 위
const RELIC_TICK_MAX_OCTAVES   = 3;    //   상한
const SFX_FILE_DIR    = 'assets/sfx/';            // 덮어쓰기 파일 폴더 (docs/demo 기준)
const SFX_FILE_ALIAS  = { crowdScream: 'scream' }; // SFX 이름 → 다른 파일명도 허용   // 마스터 게인 = 이 값 × 설정 볼륨(0~1). 설정 볼륨 50%면 0.3

const Sound = (() => {
  let ctx = null, master = null, comp = null, noiseBuf = null, drive = null;
  let enabled = true, volume = 0.5;
  let buffers = {};                // 덮어쓰기 파일: SFX 이름 → AudioBuffer
  let voices = [];                 // 울리는 중: { name, bus, base, boost, end }
  let lastByName = {};             // 이름 → { at(ms), voice } — 중복 합치기용
  const stats = { played: {}, merged: 0, stolen: 0 };   // 검증·디버그용 카운터

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /* ── 합성 부품 ── */
  function makeNoise(c){   // 1초 노이즈. 4샘플씩 같은 값을 유지해 8비트 기계의 거친 노이즈 느낌
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), data = buf.getChannelData(0);
    let v = 0;
    for(let i = 0; i < data.length; i++){ if(i % 4 === 0) v = Math.random() * 2 - 1; data[i] = v; }
    return buf;
  }
  function makeDrive(c){   // 레버리지 매수의 살짝 찢어진 소리
    const ws = c.createWaveShaper(), n = 256, curve = new Float32Array(n);
    for(let i = 0; i < n; i++){ const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 3); }
    ws.curve = curve;
    return ws;
  }
  function filter(dest, type, freq, q){
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    f.connect(dest);
    return f;
  }
  // 음 하나: type 파형, f0 → f1(글라이드), 길이 dur, 볼륨 vol. hold = 볼륨 유지 비율(나머지는 감쇠)
  function tone(dest, type, f0, t, dur, vol, o){
    o = o || {};
    const s = ctx.createOscillator(), g = ctx.createGain();
    s.type = type;
    s.frequency.setValueAtTime(f0, t);
    if(o.f1) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    if(o.vibrato){   // 트롬본 떨림
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.value = f0 * 0.03;
      lfo.connect(lg); lg.connect(s.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    const a = o.attack || 0.004, hold = o.hold || 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if(hold > 0) g.gain.setValueAtTime(vol, t + Math.max(a, dur * hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
    return s;
  }
  function noise(dest, t, dur, vol, type, f0, f1, q){
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if(f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const seq = (dest, type, notes, t, step, dur, vol, p, o) => {   // 음 여러 개를 step 간격으로
    notes.forEach((n, i) => tone(dest, type, midi(n) * p, t + i * step, i === notes.length - 1 ? dur * 2.5 : dur, vol, o));
    return (notes.length - 1) * step + dur * 2.5;
  };
  const bell = (dest, n, t, dur, vol, p) => {   // 삼각파 + 배음(사인 2.76배) = 종소리
    tone(dest, 'triangle', midi(n) * p, t, dur, vol);
    tone(dest, 'sine', midi(n) * p * 2.76, t, dur * 0.5, vol * 0.25);
  };
  const thud = (dest, t, vol) => {   // 도장 쾅 / 저음 쿵
    noise(dest, t, 0.12, vol * 0.7, 'lowpass', 700);
    tone(dest, 'sine', 130, t, 0.3, vol, { f1: 42 });
  };
  const ring = (dest, t, dur, vol, p) => {   // 옛날 전화벨: 두 음을 빠르게 번갈아
    const s = ctx.createOscillator(), g = ctx.createGain();
    s.type = 'square';
    for(let k = 0, x = t; x < t + dur; k++, x += 0.03) s.frequency.setValueAtTime((k % 2 ? 1480 : 1240) * p, x);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(filter(dest, 'lowpass', 3200)); s.start(t); s.stop(t + dur + 0.02);
  };

  /* ── 효과음 사전: fn(bus, t 시작 시각, p 피치 배율, opts) → 길이(초) ── */
  const SFX = {
    uiClick(b, t, p){ tone(b, 'square', 2200 * p, t, 0.025, 0.08); return 0.03; },
    cardPlay(b, t, p){
      noise(b, t, 0.05, 0.45, 'bandpass', 1800 * p, 0, 0.9);
      tone(b, 'triangle', 160 * p, t, 0.13, 0.6, { f1: 55 * p });
      return 0.14;
    },
    cardReject(b, t, p){
      const lp = filter(b, 'lowpass', 1400);
      tone(lp, 'square', midi(52) * p, t, 0.11, 0.16, { hold: 0.7 });
      tone(lp, 'square', midi(47) * p, t + 0.12, 0.17, 0.16, { hold: 0.7 });
      return 0.3;
    },
    buy(b, t, p, o){
      const lev = o.lev || 1;
      const up = (o.dir || 1) > 0;
      const q = p * (lev >= 2 ? 2 : 1);
      let dest = b;
      if(lev >= 2){ const d = makeDrive(ctx); const g = ctx.createGain(); g.gain.value = lev >= 3 ? 0.55 : 0.4; d.connect(g); g.connect(b); dest = d; }
      const notes = up ? [76, 83] : [83, 76];   // 숏은 거꾸로 내려간다
      tone(dest, 'square', midi(notes[0]) * q, t, 0.06, 0.13);
      tone(dest, 'square', midi(notes[1]) * q, t + 0.065, 0.16, 0.13);
      return 0.23;
    },
    sellWin(b, t, p){
      tone(b, 'square', midi(83) * p, t, 0.07, 0.12, { hold: 0.8 });
      tone(b, 'square', midi(88) * p, t + 0.07, 0.35, 0.12, { hold: 0.2 });
      return 0.43;
    },
    sellLoss(b, t, p){
      tone(b, 'triangle', 330 * p, t, 0.28, 0.35, { f1: 98 * p });
      tone(filter(b, 'lowpass', 500), 'square', midi(40) * p, t, 0.12, 0.12);
      return 0.3;
    },
    tick(b, t, p){ noise(b, t, 0.012, 0.12, 'highpass', 4500 * p); return 0.015; },
    marketOpen(b, t, p){ [72, 76, 79].forEach((n, i) => bell(b, n, t + i * 0.11, i === 2 ? 0.9 : 0.45, 0.18, p)); return 1.15; },
    dayEnd(b, t, p){ [79, 72].forEach((n, i) => bell(b, n, t + i * 0.24, 0.8, 0.2, p)); return 1.1; },
    gapUp(b, t, p){
      tone(b, 'square', 180 * p, t, 0.32, 0.1, { f1: 1500 * p, hold: 0.8 });
      tone(b, 'triangle', 90 * p, t, 0.32, 0.25, { f1: 750 * p, hold: 0.8 });
      tone(b, 'square', midi(96) * p, t + 0.3, 0.06, 0.07);
      tone(b, 'square', midi(100) * p, t + 0.36, 0.1, 0.07);
      return 0.48;
    },
    gapDown(b, t, p){
      tone(filter(b, 'lowpass', 2600), 'sawtooth', 1300 * p, t, 0.45, 0.13, { f1: 70 * p, hold: 0.6 });
      noise(b, t + 0.05, 0.35, 0.3, 'lowpass', 1200, 200);
      return 0.5;
    },
    marginCall(b, t, p){
      // 사이렌 2회 (위아래로 두 번 울렁)
      const s = ctx.createOscillator(), g = ctx.createGain();
      s.type = 'square';
      s.frequency.setValueAtTime(600 * p, t);
      for(let k = 0; k < 2; k++){
        s.frequency.linearRampToValueAtTime(980 * p, t + k * 0.36 + 0.18);
        s.frequency.linearRampToValueAtTime(600 * p, t + k * 0.36 + 0.36);
      }
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.02);
      g.gain.setValueAtTime(0.13, t + 0.66); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.74);
      s.connect(g); g.connect(filter(b, 'lowpass', 3000)); s.start(t); s.stop(t + 0.76);
      // 저음 쿵
      tone(b, 'sine', 110, t + 0.74, 0.5, 0.9, { f1: 32 });
      noise(b, t + 0.74, 0.22, 0.5, 'lowpass', 450);
      // 짧은 글리치: 끊어진 노이즈 조각
      for(let i = 0; i < 6; i++) noise(b, t + 0.8 + i * 0.045 + Math.random() * 0.015, 0.02, 0.22, 'bandpass', 800 + Math.random() * 3000, 0, 3);
      return 1.3;
    },
    coinDrop(b, t, p, o){   // 동전 "짤랑": 고음 3개를 몇 ms씩 어긋나게, 짧은 감쇠. count번 무작위 간격으로
      const n = o.count || 5;
      let x = t;
      for(let i = 0; i < n; i++){
        const f = (2400 + Math.random() * 900) * p, v = 0.05 + Math.random() * 0.03;
        tone(b, 'square', f, x, 0.09, v);
        tone(b, 'sine', f * 1.5, x + 0.006, 0.14, v * 1.3);
        tone(b, 'square', f * 1.19, x + 0.013, 0.07, v * 0.7);
        x += 0.05 + Math.random() * 0.11;
      }
      return x - t + 0.15;
    },
    billFlip(b, t, p, o){   // 지폐 세는 기계: 아주 짧은 하이패스 노이즈를 빠르게
      const n = o.count || 6;
      for(let i = 0; i < n; i++) noise(b, t + i * 0.022, 0.012 + Math.random() * 0.006, 0.28, 'highpass', 3500 * p, 0, 0.7);
      return n * 0.022 + 0.03;
    },
    cashRegister(b, t, p){   // 금전등록기: 저음 "철컹" + 고음 "띵"
      noise(b, t, 0.08, 0.6, 'lowpass', 500);
      tone(b, 'square', 150 * p, t, 0.07, 0.12, { f1: 90 * p });
      noise(b, t + 0.06, 0.05, 0.35, 'bandpass', 1800, 0, 2);
      bell(b, 100, t + 0.13, 0.9, 0.22, p);
      bell(b, 107, t + 0.13, 0.5, 0.08, p);
      return 1.05;
    },
    flatShrug(b, t, p){   // 김빠진 "음~음": 조금 올라갔다가, 아래로 내려앉는다
      tone(b, 'triangle', midi(62) * p, t, 0.26, 0.2, { f1: midi(64) * p, hold: 0.6, vibrato: 5 });
      tone(b, 'triangle', midi(60) * p, t + 0.3, 0.42, 0.2, { f1: midi(55) * p, hold: 0.5, vibrato: 4 });
      return 0.75;
    },
    crashDown(b, t, p){   // 폭락: 긴 하강 글리산도 + 저음 쿵
      const s = ctx.createOscillator(), g = ctx.createGain();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(900 * p, t);
      s.frequency.exponentialRampToValueAtTime(55 * p, t + 0.85);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.02);
      g.gain.setValueAtTime(0.1, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.88);
      s.connect(g); g.connect(filter(b, 'lowpass', 1600)); s.start(t); s.stop(t + 0.9);
      tone(b, 'square', 450 * p, t, 0.8, 0.03, { f1: 40 * p });
      thud(b, t + 0.84, 1);
      noise(b, t + 0.84, 0.35, 0.35, 'lowpass', 300);
      return 1.3;
    },
    shopShuffle(b, t, p){   // 카드 섞기: 짧은 대역 노이즈를 점점 빠르게 → 마지막에 탁 내려놓기
      let x = t;
      for(let i = 0; i < 9; i++){ noise(b, x, 0.02, 0.22, 'bandpass', 2600 + i * 180, 0, 1.5); x += 0.045 - i * 0.003; }
      noise(b, x + 0.02, 0.06, 0.45, 'lowpass', 900);
      tone(b, 'square', 330 * p, x + 0.02, 0.05, 0.05, { f1: 220 * p });
      return x - t + 0.12;
    },
    relicTick(b, t, p, o){   // 쌓일수록 높아지는 "칭"
      const oct = Math.min(RELIC_TICK_MAX_OCTAVES, Math.max(0, ((o.stacks || 1) - 1) / RELIC_TICK_OCTAVE_STACKS));
      const q = p * Math.pow(2, oct);
      tone(b, 'square', midi(84) * q, t, 0.05, 0.07);
      tone(b, 'sine', midi(91) * q, t + 0.02, 0.16, 0.08);
      return 0.2;
    },
    relicLevelUp(b, t, p, o){   // 대발동: 상승 아르페지오 + 반짝, 등급별 끝음
      const END = { common: 79, uncommon: 81, rare: 84, legendary: 86, mythic: 91 };
      const x = seq(b, 'square', [67, 71, 74, 79], t, 0.06, 0.06, 0.09, p);
      bell(b, END[o.rarity] || 84, t + 0.26, 0.7, 0.2, p);
      seq(b, 'triangle', [96, 100, 103], t + 0.3, 0.04, 0.04, 0.05, p);
      if(o.rarity === 'mythic' || o.rarity === 'legendary') seq(b, 'square', [91, 95, 98, 103, 107], t + 0.5, 0.045, 0.04, 0.045, p);
      return Math.max(x, 1.0);
    },
    relicShatter(b, t, p){   // 초기화: 유리 깨짐 + 슬픈 하강
      noise(b, t, 0.18, 0.5, 'highpass', 4000, 0, 0.8);
      for(let i = 0; i < 7; i++) tone(b, 'sine', (2500 + Math.random() * 3500) * p, t + 0.01 + Math.random() * 0.12, 0.08, 0.035);
      noise(b, t + 0.05, 0.3, 0.2, 'bandpass', 2500, 900, 2);
      seq(b, 'triangle', [72, 68, 65, 60], t + 0.22, 0.13, 0.12, 0.14, p);
      return 1.1;
    },
    gapAlarm(b, t, p){   // 강 단계 갭 경보: 사이렌만 (반대매매의 저음 쿵은 뺀다)
      const s = ctx.createOscillator(), g = ctx.createGain();
      s.type = 'square';
      s.frequency.setValueAtTime(700 * p, t);
      for(let k = 0; k < 2; k++){
        s.frequency.linearRampToValueAtTime(1100 * p, t + k * 0.3 + 0.15);
        s.frequency.linearRampToValueAtTime(700 * p, t + k * 0.3 + 0.3);
      }
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.02);
      g.gain.setValueAtTime(0.11, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      s.connect(g); g.connect(filter(b, 'lowpass', 3000)); s.start(t); s.stop(t + 0.64);
      return 0.65;
    },
    tipArrive(b, t, p){
      [0, 0.4].forEach(dt => {   // "지잉 지잉": 저주파 사각파를 22Hz로 떨게 한다
        const s = ctx.createOscillator(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), env = ctx.createGain();
        s.type = 'square'; s.frequency.value = 92 * p;
        lfo.type = 'square'; lfo.frequency.value = 22; lg.gain.value = 0.5; am.gain.value = 0.5;
        lfo.connect(lg); lg.connect(am.gain);
        env.gain.setValueAtTime(0.0001, t + dt); env.gain.linearRampToValueAtTime(0.3, t + dt + 0.02);
        env.gain.setValueAtTime(0.3, t + dt + 0.24); env.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.28);
        s.connect(am); am.connect(env); env.connect(filter(b, 'lowpass', 500));
        s.start(t + dt); s.stop(t + dt + 0.3); lfo.start(t + dt); lfo.stop(t + dt + 0.3);
      });
      return 0.72;
    },
    tipJackpot(b, t, p){
      const d = seq(b, 'square', [72, 76, 79, 84], t, 0.08, 0.07, 0.11, p, { hold: 0.7 });
      seq(b, 'triangle', [48, 55, 60], t, 0.1, 0.1, 0.22, p);
      return d;
    },
    tipBust(b, t, p){
      const lp = filter(b, 'lowpass', 900, 2);
      [55, 54, 53].forEach((n, i) => tone(lp, 'sawtooth', midi(n) * p, t + i * 0.24, 0.22, 0.22, { hold: 0.7 }));
      tone(lp, 'sawtooth', midi(52) * p, t + 0.72, 0.7, 0.22, { hold: 0.6, vibrato: 6 });
      return 1.45;
    },
    fssWarn(b, t, p){ ring(b, t, 0.45, 0.07, p); return 0.5; },
    fssSanction(b, t, p){ ring(b, t, 0.4, 0.07, p); thud(b, t + 0.5, 0.85); return 0.85; },
    chainStep(b, t, p){
      tone(b, 'square', midi(84) * p, t, 0.05, 0.12);
      tone(b, 'triangle', midi(96) * p, t + 0.02, 0.2, 0.24);
      return 0.23;
    },
    countTick(b, t, p){ tone(b, 'square', midi(93) * p, t, 0.018, 0.08); return 0.02; },
    stampWin(b, t, p){
      thud(b, t, 0.8);
      return 0.06 + seq(b, 'square', [72, 76, 79, 84], t + 0.06, 0.05, 0.08, 0.1, p, { hold: 0.6 });
    },
    stampLoss(b, t, p){
      thud(b, t, 0.8);
      return 0.06 + seq(filter(b, 'lowpass', 1800), 'square', [67, 63, 60], t + 0.06, 0.09, 0.1, 0.11, p, { hold: 0.6 });
    },
    weekClear(b, t, p){
      const lead = [72, 76, 79, 84, 79, 84], dur = [0.09, 0.09, 0.09, 0.18, 0.09, 0.45];
      let x = t;
      lead.forEach((n, i) => { tone(b, 'square', midi(n) * p, x, dur[i], 0.11, { hold: 0.75 }); x += dur[i] + 0.01; });
      [48, 55, 60].forEach((n, i) => tone(b, 'triangle', midi(n) * p, t + i * 0.19, 0.19, 0.25, { hold: 0.8 }));
      tone(b, 'triangle', midi(48) * p, t + 0.57, 0.5, 0.25, { hold: 0.5 });
      return x - t + 0.1;
    },
    goalReach(b, t, p){
      tone(b, 'square', midi(79) * p, t, 0.07, 0.1, { hold: 0.7 });
      tone(b, 'square', midi(84) * p, t + 0.08, 0.2, 0.1, { hold: 0.5 });
      tone(b, 'triangle', midi(103) * p, t + 0.16, 0.12, 0.08);
      return 0.36;
    },
    packFlip(b, t, p, o){
      noise(b, t, 0.22, 0.28, 'bandpass', 400, 3500, 1.5);   // 휘릭
      const END = { common: [84], uncommon: [84, 88], rare: [84, 88, 91], legendary: [84, 88, 91, 96],
                    mythic: [84, 88, 91, 96, 100, 103, 108] };
      const notes = END[o.rarity] || END.common;
      const step = o.rarity === 'mythic' ? 0.045 : 0.07;
      return 0.22 + seq(b, 'triangle', notes, t + 0.22, step, 0.08, 0.2, p);
    },
    relicGain(b, t, p){
      [81, 88, 93].forEach((n, i) => { bell(b, n, t + i * 0.16, 0.9, 0.16, p); bell(b, n, t + 0.48 + i * 0.16, 0.7, 0.05, p * 1.005); });
      return 1.55;
    },
    weekFail(b, t, p){ return seq(b, 'triangle', [64, 60, 55], t, 0.2, 0.2, 0.28, p, { hold: 0.6 }); },
    bankrupt(b, t, p){
      tone(filter(b, 'lowpass', 2500), 'square', 880 * p, t, 1.3, 0.1, { f1: 50 * p, hold: 0.7 });
      const lp = filter(b, 'lowpass', 1600);
      [62, 61, 60].forEach((n, i) => tone(lp, 'square', midi(n) * p, t + 1.4 + i * 0.3, 0.28, 0.12, { hold: 0.7 }));
      tone(lp, 'square', midi(59) * p, t + 2.3, 0.9, 0.12, { hold: 0.6, vibrato: 6 });
      tone(b, 'triangle', midi(35) * p, t + 2.3, 0.9, 0.25, { hold: 0.5 });
      return 3.25;
    },
    victory(b, t, p){
      const lead = [67, 72, 76, 79, 76, 79, 84, 84, 83, 84, 88, 91];
      const dur  = [0.1, 0.1, 0.1, 0.22, 0.1, 0.1, 0.34, 0.12, 0.12, 0.12, 0.2, 0.8];
      let x = t;
      lead.forEach((n, i) => { tone(b, 'square', midi(n) * p, x, dur[i], 0.1, { hold: 0.75 }); tone(b, 'square', midi(n - 12) * p, x, dur[i], 0.04, { hold: 0.75 }); x += dur[i] + 0.015; });
      [48, 52, 55, 60, 55, 53, 55, 48].forEach((n, i) => tone(b, 'triangle', midi(n) * p, t + i * 0.32, 0.3, 0.25, { hold: 0.8 }));
      seq(b, 'triangle', [96, 100, 103, 108], x - 0.6, 0.06, 0.06, 0.06, p);
      return x - t + 0.4;
    }
  };

  /* ── 재생 관리 ── */
  function init(context){   // 실제 AudioContext 또는 (검증용) OfflineAudioContext
    ctx = context;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 8;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ctx.createGain();
    master.gain.value = SFX_MASTER_GAIN * volume;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);
    voices = []; lastByName = {};
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    if(!offline) loadFiles();
    return ctx;
  }
  /* 덮어쓰기 파일 읽기: files.js의 SFX_FILES에 적힌 것만. 실패는 조용히 무시 (합성음 그대로) */
  function loadFiles(){
    const list = typeof SFX_FILES !== 'undefined' && Array.isArray(SFX_FILES) ? SFX_FILES : [];
    if(!list.length || typeof fetch === 'undefined') return;
    list.forEach(file => {
      const base = String(file).replace(/\.[^.]+$/, '');
      const name = Object.keys(SFX_FILE_ALIAS).find(k => SFX_FILE_ALIAS[k] === base) || base;
      fetch(SFX_FILE_DIR + file)
        .then(r => (r.ok ? r.arrayBuffer() : null))
        .then(ab => (ab ? new Promise(res => ctx.decodeAudioData(ab, res, () => res(null))) : null))
        .then(buf => { if(buf) buffers[name] = buf; })
        .catch(() => {});
    });
  }
  function playBuffer(bus, t, p, buf){
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = p;
    src.connect(bus); src.start(t);
    return buf.duration / p;
  }
  function unlock(){
    if(!enabled) return;
    if(!ctx){
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if(!AC) return;
      try { init(new AC()); } catch(e) { return; }
    }
    if(ctx.state === 'suspended' && ctx.resume) ctx.resume();
  }
  function attachUnlock(target){
    const h = () => unlock();
    target.addEventListener('pointerdown', h, true);
    target.addEventListener('keydown', h, true);
  }
  function kill(v){
    const t = ctx.currentTime;
    try {
      v.bus.gain.cancelScheduledValues(t);
      v.bus.gain.setValueAtTime(v.bus.gain.value, t);
      v.bus.gain.linearRampToValueAtTime(0, t + 0.012);
    } catch(e) {}
    setTimeout(() => { try { v.bus.disconnect(); } catch(e) {} }, 40);
  }
  function prune(){
    const t = ctx.currentTime;
    voices = voices.filter(v => {
      if(v.end + 0.05 > t) return true;
      try { v.bus.disconnect(); } catch(e) {}
      return false;
    });
  }
  function play(name, opts){
    opts = opts || {};
    if(!enabled || !ctx || (!SFX[name] && !buffers[name])) return false;
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;   // 검증용 렌더링은 렌더 전까지 늘 suspended
    if(ctx.state === 'closed' || (ctx.state === 'suspended' && !offline)) return false;   // 아직 잠김: 나중에 한꺼번에 터지지 않게 버린다
    const at = nowMs();
    prune();
    const last = lastByName[name];
    if(last && at - last.at < SFX_MERGE_MS && voices.indexOf(last.voice) >= 0){   // 같은 프레임의 중복 → 1번 + 조금 크게
      const v = last.voice;
      v.boost = Math.min(SFX_MERGE_MAX, v.boost * SFX_MERGE_GAIN);
      v.bus.gain.setValueAtTime(v.base * v.boost, ctx.currentTime);
      stats.merged++;
      return true;
    }
    while(voices.length >= SFX_MAX_VOICES){ kill(voices.shift()); stats.stolen++; }
    const bus = ctx.createGain();
    const base = Math.max(0, Math.min(2, opts.volume === undefined ? 1 : opts.volume));
    bus.gain.value = base;
    bus.connect(master);
    const t = ctx.currentTime + 0.005;
    const len = buffers[name] ? playBuffer(bus, t, opts.pitch || 1, buffers[name]) : SFX[name](bus, t, opts.pitch || 1, opts);
    const v = { name, bus, base, boost: 1, end: t + len };
    voices.push(v);
    lastByName[name] = { at, voice: v };
    stats.played[name] = (stats.played[name] || 0) + 1;
    return true;
  }
  function stopAll(){
    if(!ctx) return;
    voices.forEach(kill);
    voices = []; lastByName = {};
  }
  function setEnabled(on){
    enabled = !!on;
    if(!enabled) stopAll();
  }
  function setVolume(v){
    volume = Math.max(0, Math.min(1, v));
    if(master) master.gain.setValueAtTime(SFX_MASTER_GAIN * volume, ctx.currentTime);
  }
  const semis = n => Math.pow(2, n / 12);   // 반음 n개 → 피치 배율

  return { SFX, play, unlock, attachUnlock, init, stopAll, setEnabled, setVolume, semis, stats,
           get context(){ return ctx; }, get mixBus(){ return comp; },   // 배경음악(music.js)도 같은 컴프레서로 섞는다
           get activeVoices(){ return voices.length; },
           hasFile: name => !!buffers[name] };
})();
