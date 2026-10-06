/* ══════════════════════════════════════════════════════════
   FX — 타격감 연출 (히트스톱 · 흔들림 3단계 · 글리치 · 스탬프 · 숫자 펀치 · 카드 비행 · 픽셀 파티클).
   UI 전용: 엔진(engine.js)은 이 파일을 모른다. 엔진 결과(손익·확률·틱 순서)에는 아무 영향이 없다.
   - 세기(intensity 0~1)는 금액을 순자산 대비 비율로 바꿔서 정한다: intensity(금액, 순자산).
     FX_MONEY_FULL = 순자산의 17% → 1.0. 시뮬레이터(전략 7종 × 200판)에서 청산 손익 상위 10%가 약 11.5%라
     '강(≥ FX_LEVEL_BIG)'은 대략 10번 중 1번, '약'이 대부분이 되게 맞췄다.
   - 흔들림·글리치·히트스톱은 motion(설정 '화면 흔들림')이 꺼지면 전부 끈다. 파티클·스탬프·펀치는 남는다.
   - 히트스톱: 게임 루프는 Fx.frozenFor() 동안 다음 tick을 미루기만 한다 (tick 순서·횟수는 그대로). CSS 애니메이션은 일시정지.
   - 색은 :root CSS 변수만 읽어서 쓰고, 파티클은 화면 위 캔버스 한 장(pointer-events:none)에 그린다.
══════════════════════════════════════════════════════════ */
const FX_MONEY_FULL    = 0.17;   // 순자산 대비 이 비율 = intensity 1
const FX_LEVEL_MID     = 0.34;   // intensity 이 이상 = 중
const FX_LEVEL_BIG     = 0.67;   // intensity 이 이상 = 강 (대략 상위 10%)
const FX_MAX_PARTICLES = 150;    // 동시 파티클 상한
const FX_PUNCH_MIN     = 0.0025; // 순자산 변화가 이 비율 미만이면 숫자 펀치 없음 (장중 자잘한 움직임은 무시)
const FX_COMBO_MS      = 1500;   // 같은 방향 변화가 이 안에 이어지면 콤보
const FX_SHAKE_CLEAR_MS = 700;         // 흔들림 클래스는 최소 이만큼 남긴다 (예전과 같은 창 — 애니메이션은 --dur-shake-N, 그보다 길어지면 끝날 때까지)
const FX_ANIM_FALLBACK_PAD_MS = 250;
const FX_ANIM_FALLBACK_TRIES = 8;      //   예비 타이머가 아직 도는 애니메이션을 다시 기다리는 최대 횟수 (탭 숨김 등으로 영영 안 끝나면 이 뒤엔 정리)   // 뒷정리 예비 타이머 여유: animationend가 안 오면(애니메이션 꺼짐·탭 숨김) --dur 값 + 이만큼 뒤 (히트스톱 최대 170ms보다 길게)
// 연출 큐: 한 틱에 여러 이벤트가 나면 하나씩 이어서 재생 (간격 ms · 길이 배율). '최소'는 간격 0.1초
const FX_QUEUE_SPEED   = { normal: { gap: 450, dur: 1 }, fast: { gap: 250, dur: 0.65 }, min: { gap: 100, dur: 0.45 } };

const Fx = (() => {
  /* ── 연출 시간 스케일 (한 곳) ── motionScale = 모션 강도 설정 × 장 속도 보정 (demo가 setMotionScale로 값 또는 함수를 준다).
     정산 무대(rAF 가상 시간)·결산 체인(setTimeout)·연출 큐(setTimeout)는 연출 시간을 전부 motionTime(ms)로 바꿔 쓴다.
     1 = 원래 시간 그대로 · 0 = 연출 없이 최종 상태로 (세 모델은 그대로 따로 돈다 — 시간 값만 이 함수를 거친다) */
  let scaleSrc = 1;
  const motionScale = () => { const v = typeof scaleSrc === 'function' ? scaleSrc() : scaleSrc; return v > 0 ? v : 0; };
  const setMotionScale = v => { scaleSrc = v; };
  const motionTime = ms => ms * motionScale();
  /* ── 연출 시간 단일 출처 ── 지속시간은 demo :root의 --dur-* 한 곳에만 쓴다. JS는 dur('이름')(ms)으로 같은 값을 읽는다.
     요소·클래스 뒷정리는 afterAnim — 그 요소의 CSS 애니메이션이 끝나는 순간(animationend, 히트스톱으로 멈춘 만큼 같이 늦다).
     애니메이션이 안 돌면(꺼짐·탭 숨김) 예비 타이머가 같은 --dur 값 + FX_ANIM_FALLBACK_PAD_MS 뒤에 정리한다 */
  /* ── 쌓임 정책 (장중 속도가 빠를 때) ── demo가 setStackPolicy(() => ({ on, max, staggerMul }))로 준다 (JUICE_CONFIG stack*).
     진행 중 연출 = afterAnim으로 끝을 기다리는 요소·클래스 + 연출 큐에서 재생 중인 항목 + 날아가는 카드 (시작 순 목록 live).
     on이면 ① 연출 사이 간격(stagger)에 staggerMul을 곱하고 ② 진행 중 연출이 max를 넘는 순간 가장 오래된 것부터 즉시 최종 상태로(fast-forward).
     off(1× 이하)면 둘 다 아무것도 안 한다 — 원래 시간·개수 그대로 */
  let policySrc = () => ({ on: false, max: 6, staggerMul: 1 });
  const setStackPolicy = fn => { policySrc = fn; };
  const live = [];
  let ffCount = 0, ffing = false;
  function track(fin, kind){ const h = { fin, kind }; live.push(h); capLive(); return h; }
  function untrack(h){ const i = live.indexOf(h); if(i >= 0) live.splice(i, 1); }
  function capLive(){
    const p = policySrc();
    if(!p.on) return;
    while(live.length > Math.max(1, p.max)){
      const h = live.shift();
      ffCount++; ffing = true;
      try { h.fin(true); } catch(e) { console.error(e); }
      ffing = false;
    }
  }
  const stagger = ms => { const p = policySrc(); return p.on ? ms * p.staggerMul : ms; };
  function dur(name){
    const v = getComputedStyle(document.documentElement).getPropertyValue('--dur-' + name).trim(), n = parseFloat(v);
    return Number.isFinite(n) ? (/ms$/.test(v) ? n : n * 1000) : 0;
  }
  function afterAnim(el, ms, fn, name){   // name = 기다릴 @keyframes 이름 (같은 요소의 다른 애니메이션이 먼저 끝나도 안 끊기게). fn(ff) — ff = 쌓임 정책으로 당겨 끝냄
    let done = false, t = 0, h = null;
    const fin = ff => { if(done) return; done = true; untrack(h); el.removeEventListener('animationend', onEnd); clearTimeout(t); fn(!!ff); };
    const onEnd = e => { if(e.target === el && !e.pseudoElement && (!name || e.animationName === name)) fin(); };
    el.addEventListener('animationend', onEnd);
    let tries = 0;
    const fallback = () => {   // 예비 타이머: 그 애니메이션이 아직 도는 중이면(히트스톱으로 멈췄던 만큼 늦음) 남은 시간만큼 다시 기다린다 (최대 FX_ANIM_FALLBACK_TRIES번)
      const a = el.isConnected && el.getAnimations ? el.getAnimations().find(x => !name || x.animationName === name) : null;
      const tm = a && a.effect ? a.effect.getComputedTiming() : null;
      if(tm && Number.isFinite(tm.endTime) && tm.progress !== null && tm.progress < 1 && ++tries <= FX_ANIM_FALLBACK_TRIES){
        t = setTimeout(fallback, Math.max(16, tm.endTime - (a.currentTime || 0)) + FX_ANIM_FALLBACK_PAD_MS);
        return;
      }
      fin();
    };
    t = setTimeout(fallback, ms + FX_ANIM_FALLBACK_PAD_MS);
    h = track(fin, name || 'el');
  }
  let motion = true, hitStopOn = true;
  let frozenUntil = 0, unfreezeTimer = null, lastStampAt = 0;
  const colorCache = {};
  const punchState = {};   // 요소 id → { dir, at, combo }
  const now = () => performance.now();
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const cabinet = () => document.querySelector('.cabinet');
  const color = name => colorCache[name] || (colorCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff');

  function setOptions(o){
    motion = !!o.motion;
    hitStopOn = !!o.hitStop && motion;
    if(!hitStopOn) release();
    if(!motion){ const cab = cabinet(); if(cab) cab.classList.remove('shake', 'shake-1', 'shake-2', 'shake-3', 'fx-glitch'); }
    if(!motion) document.querySelectorAll('.overlay-box').forEach(b => b.classList.remove('ov-shake-1', 'ov-shake-2', 'ov-shake-3'));
  }
  const intensity = (amount, equity) => clamp01(Math.abs(amount) / Math.max(1, Math.abs(equity)) / FX_MONEY_FULL);
  const level = i => i >= FX_LEVEL_BIG ? 3 : i >= FX_LEVEL_MID ? 2 : 1;

  /* ── 히트스톱 ── */
  function hitStop(ms){
    if(!hitStopOn || ms <= 0) return 0;
    const until = now() + ms;
    if(until > frozenUntil){
      frozenUntil = until;
      document.body.classList.add('fx-hitstop');
      clearTimeout(unfreezeTimer);
      unfreezeTimer = setTimeout(release, ms);
    }
    return frozenFor();
  }
  function release(){ frozenUntil = 0; document.body.classList.remove('fx-hitstop'); }
  const frozenFor = () => Math.max(0, frozenUntil - now());
  const afterStop = fn => { const w = frozenFor(); if(w > 0) setTimeout(fn, w); else fn(); };

  /* ── 흔들림 · 글리치 · 스탬프 · 번쩍임 ── 흔들림(transform)·글리치(filter)는 .cabinet animation 목록의 다른 칸 (demo CSS --cab-shake · --cab-glitch) */
  const SHAKE_KF = { 1: 'shake1', 2: 'shake', 3: 'shake3' };   // .cabinet.shake-N의 @keyframes 이름
  const shakeTok = new WeakMap();   // 요소 → 마지막 흔들림 번호 (다시 흔들면 옛 뒷정리는 아무것도 안 한다)
  function clearShakeLater(el, cls, lvl, kf){   // 흔들림 애니메이션이 끝나고(animationend) FX_SHAKE_CLEAR_MS도 지난 뒤 클래스를 뗀다
    const tok = (shakeTok.get(el) || 0) + 1, t0 = now();
    shakeTok.set(el, tok);
    afterAnim(el, dur('shake-' + lvl), ff => {
      const rm = () => { if(shakeTok.get(el) === tok) el.classList.remove(cls); }, left = FX_SHAKE_CLEAR_MS - (now() - t0);
      if(left > 0 && !ff) setTimeout(rm, left); else rm();   // 당겨 끝내면 바로 떼어 흔들림을 멈춘다
    }, kf);
  }
  function shake(lvl){
    if(!motion || !lvl) return;
    const cab = cabinet();
    cab.classList.remove('shake', 'shake-1', 'shake-2', 'shake-3');
    void cab.offsetWidth;
    cab.classList.add('shake-' + lvl);
    clearShakeLater(cab, 'shake-' + lvl, lvl, SHAKE_KF[lvl]);   // 흔들림 칸이 끝난 뒤 (글리치 칸이 먼저 끝나도 안 끊긴다)
    const box = document.querySelector('.overlay.show .overlay-box.stage-live');   // 정산 무대가 열려 있으면 상자도 (오버레이는 .cabinet 밖이라 안 흔들린다)
    if(box){
      box.classList.remove('ov-shake-1', 'ov-shake-2', 'ov-shake-3');
      void box.offsetWidth;
      box.classList.add('ov-shake-' + lvl);
      clearShakeLater(box, 'ov-shake-' + lvl, lvl, 'ovShake' + lvl);
    }
  }
  function glitch(){
    if(!motion) return;
    const cab = cabinet();
    cab.classList.remove('fx-glitch'); void cab.offsetWidth; cab.classList.add('fx-glitch');
    afterAnim(cab, dur('glitch'), () => cab.classList.remove('fx-glitch'), 'fxGlitch');
    const scan = document.createElement('div');   // 스캔라인 떨림
    scan.className = 'fx-scan';
    document.body.appendChild(scan);
    afterAnim(scan, dur('glitch'), () => scan.remove());
  }
  let lastStampText = '';
  function stamp(text, tone, size){   // 화면 가운데 큰 도장 (tone: '' 빨강 · 'up' 초록 · 'gold' · 'cyan' / size: '' 대 · 'sm' 소)
    if(text === lastStampText && now() - lastStampAt < 250) return;   // 한 틱에 반대매매가 여러 건이어도 같은 도장은 한 번 (다른 문구는 막지 않는다)
    lastStampAt = now(); lastStampText = text;
    const el = document.createElement('div');
    el.className = 'fx-stamp ' + (tone || '') + (size ? ' ' + size : '');
    el.textContent = text;
    document.body.appendChild(el);
    afterAnim(el, dur('stamp'), () => el.remove());
  }
  const FLASH_DUR = { 'fx-hit': ['hit', 'fxHit'], 'fx-goal': ['goal', 'fxGoal'], 'fx-jiggle': ['jiggle', 'fxJiggle'], 'fx-relic-on': ['relic-on', 'relicOn'], 'rm-up': ['rm-up', 'rmUp'] };   // 클래스 → [--dur-*, @keyframes]
  function flash(el, cls){   // 요소 한 번 번쩍 (cls: fx-hit · fx-goal · fx-jiggle · fx-relic-on · rm-up)
    if(!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    const f = FLASH_DUR[cls] || ['goal'];
    afterAnim(el, dur(f[0]), () => el.classList.remove(cls), f[1]);
  }
  function jiggle(el){ flash(el, motion ? 'fx-jiggle' : 'fx-hit'); }

  /* ── 숫자 펀치: 커졌다 돌아오며 초록/빨강 번쩍. 같은 방향이 이어지면 콤보로 더 크게 ── */
  function punch(el, delta, i){
    if(!el || !delta || !el.animate) return;
    const st = punchState[el.id] || (punchState[el.id] = { dir: 0, at: 0, combo: 0 });
    const dir = delta > 0 ? 1 : -1, t = now();
    st.combo = st.dir === dir && t - st.at < FX_COMBO_MS ? st.combo + 1 : 1;
    st.dir = dir; st.at = t;
    const s = 1.08 + 0.3 * clamp01(i) + Math.min(0.2, (st.combo - 1) * 0.05);
    const c = color(dir > 0 ? '--green' : '--red');
    el.animate([
      { transform: `scale(${s})`, color: c },
      { transform: `scale(${1 + (s - 1) * 0.35})`, color: c, offset: 0.5 },
      { transform: 'scale(1)' }
    ], { duration: 380, easing: 'steps(6)' });
    if(st.combo >= 3){
      const r = el.getBoundingClientRect(), tag = document.createElement('div');
      tag.className = 'fx-combo';
      tag.style.left = Math.round(r.right - 8) + 'px';
      tag.style.top = Math.round(r.top - 4) + 'px';
      tag.style.color = c;
      tag.textContent = 'COMBO ×' + st.combo;
      document.body.appendChild(tag);
      afterAnim(tag, dur('pop'), () => tag.remove());
    }
  }

  /* ── 카드 사용: 살짝 눌렸다 늘어나며(스쿼시&스트레치) 대상 쪽으로 날아가 사라진다 ── */
  function cardFly(ghost, fromRect, targetEl, onHit, trail){   // trail: 잔상 수 (카드 연쇄 2장째부터)
    for(let k = 1; k <= (trail || 0); k++){
      const g2 = ghost.cloneNode(true);
      g2.classList.add('fx-afterimage');
      g2.style.opacity = String(0.45 / k);
      setTimeout(() => cardFlyOne(g2, fromRect, targetEl, null), stagger(k * 45));
    }
    cardFlyOne(ghost, fromRect, targetEl, onHit, true);
  }
  function cardFlyOne(ghost, fromRect, targetEl, onHit, main){
    if(!ghost.animate || !shown(fromRect)){ if(onHit) onHit(); return; }
    Object.assign(ghost.style, { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px' });
    ghost.classList.add('fx-card-ghost');
    ghost.removeAttribute('data-idx');
    document.body.appendChild(ghost);
    const tr = targetEl ? targetEl.getBoundingClientRect() : null;
    const tx = tr ? tr.left + tr.width / 2 : window.innerWidth / 2, ty = tr ? tr.top + tr.height / 2 : window.innerHeight * 0.45;
    const dx = Math.round(tx - (fromRect.left + fromRect.width / 2)), dy = Math.round(ty - (fromRect.top + fromRect.height / 2));
    const a = ghost.animate([
      { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
      { transform: 'translate(0,-6px) scale(1.12,0.9)', offset: 0.18 },
      { transform: 'translate(0,-14px) scale(0.92,1.1)', offset: 0.36 },
      { transform: `translate(${dx}px,${dy}px) scale(0.3,0.3)`, opacity: 0.2 }
    ], { duration: 420, easing: 'steps(9)' });
    const h = track(() => a.finish(), 'cardFly');   // 당겨 끝내면 도착 상태로 (onfinish가 그대로 이어서 처리)
    a.onfinish = () => {
      untrack(h);
      ghost.remove();
      if(!main) return;
      if(targetEl) flash(targetEl, 'fx-hit');
      else burst(tx, ty, 10, ['--gold', '--cyan']);
      if(onHit) onHit();
    };
  }

  /* ── 픽셀 파티클 (캔버스 한 장, 활성 파티클이 없으면 requestAnimationFrame을 멈춘다) ── */
  let canvas = null, cx = null, parts = [], raf = 0, lastT = 0;
  function ensureCanvas(){
    if(canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    document.body.appendChild(canvas);
    resize();
    window.addEventListener('resize', resize);
  }
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    cx = canvas.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.imageSmoothingEnabled = false;
  }
  function add(p){
    ensureCanvas();
    parts.push(p);
    if(parts.length > FX_MAX_PARTICLES) parts.splice(0, parts.length - FX_MAX_PARTICLES);   // 오래된 것부터 버린다
    if(!raf){ lastT = now(); raf = requestAnimationFrame(frame); }
  }
  function step(p, dt){
    if(p.delay > 0){ p.delay -= dt; return; }
    p.age += dt;
    if(p.seek){   // 목표로 빨려 들어간다 (가속)
      const k = Math.min(1, p.age / p.dur), u = k * k;   // 2차 베지어, 시간은 가속(ease-in)
      p.x = p.x0 + (p.cx - p.x0) * 2 * u * (1 - u) + (p.tx - p.x0) * u * u;
      p.y = p.y0 + (p.cy - p.y0) * 2 * u * (1 - u) + (p.ty - p.y0) * u * u;
      if(k >= 1) p.age = p.life;
    } else {
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  /* 화면 배율 (demo의 --ui = 창 높이 ÷ 600). 파티클 한 칸 크기만 키운다 — 좌표는 화면 px 그대로 */
  let uiScale = 1;
  function setUiScale(v){ uiScale = v > 0 ? v : 1; }
  function draw(p){
    if(p.delay > 0) return;
    const x = Math.round(p.x), y = Math.round(p.y), w = Math.round((p.w || p.size) * uiScale), h = Math.round((p.h || p.size) * uiScale);
    cx.globalAlpha = p.seek || p.solid ? 1 : Math.max(0, 1 - p.age / p.life);
    cx.fillStyle = p.edge || p.color;
    cx.fillRect(x, y, w, h);
    if(p.edge){ cx.fillStyle = p.color; cx.fillRect(x + 1, y + 1, w - 2, h - 2); }   // 동전·지폐: 테두리 + 안쪽
    if(p.mark){ cx.fillStyle = p.edge; cx.fillRect(x + Math.floor(w / 2) - 1, y + 2, 2, h - 4); }   // 지폐 가운데 초상 자리
  }
  function frame(t){
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    const frozen = frozenFor() > 0;   // 히트스톱 동안 파티클도 멈춘다
    cx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    parts = parts.filter(p => {
      if(!frozen) step(p, dt);
      if(p.age >= p.life) return false;
      draw(p);
      return true;
    });
    cx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(frame) : 0;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = xs => xs[Math.floor(Math.random() * xs.length)];
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const shown = r => !!r && (r.width > 0 || r.height > 0);   // 다른 화면에 숨어 있는 요소(크기 0)에서는 파티클을 내지 않는다

  // 수익 청산: 동전 픽셀이 포지션 행에서 순자산 표시 쪽으로 빨려 들어간다 (2차 베지어 곡선).
  // o.bills = 지폐 비율(0~1) · o.arc = 곡선을 위로 더 띄우는 높이(px) · o.gap = 한 닢 간격(초). 돌려주는 값 = 도착 시각(초, 오름차순) — 입금음·숫자 맥박을 맞춘다
  function coinsTo(fromRect, toRect, n, o){
    o = o || {};
    if(!shown(fromRect) || !shown(toRect)) return [];
    const to = center(toRect), arrive = [], gap = stagger(o.gap || 0.018), arc = o.arc || 0;
    for(let i = 0; i < n; i++){
      const x0 = rnd(fromRect.left, fromRect.right), y0 = rnd(fromRect.top, fromRect.bottom);
      const bill = Math.random() < (o.bills || 0), dur = rnd(0.45, 0.8), delay = i * gap;
      add({ seek: true, x: x0, y: y0, x0, y0, cx: x0 + rnd(-60, 60) + (to.x - x0) * 0.15, cy: Math.min(y0, to.y) - rnd(30, 90) - arc, tx: to.x + rnd(-20, 20), ty: to.y + rnd(-6, 6),
            dur, age: 0, life: 99, delay, size: 5, color: color(bill ? '--green2' : '--gold'), edge: color(bill ? '--green-dim' : '--gold2'),
            w: bill ? 12 : 0, h: bill ? 7 : 0, mark: bill });
      arrive.push(delay + dur);
    }
    return arrive.sort((a, b) => a - b);
  }
  // 찌라시 적중: 지폐가 화면 위에서 쏟아진다 (옛 cashRain의 DOM 지폐 → 파티클 캔버스). 끝에서 흐려진다
  function billRain(n){
    const W = window.innerWidth, H = window.innerHeight;
    for(let i = 0; i < n; i++){
      const big = Math.random() < 0.3;
      add({ x: rnd(0, W), y: rnd(-60, -10), vx: rnd(-40, 40), vy: rnd(60, 160), g: rnd(120, 260), age: 0, life: rnd(1.1, 1.8) * Math.max(1, H / 900),
            delay: rnd(0, 0.5), w: big ? 14 : 10, h: big ? 8 : 6, size: 6, solid: false, mark: true,
            color: color(Math.random() < 0.8 ? '--green2' : '--gold'), edge: color('--green-dim') });
    }
  }
  function coinRain(n){   // 금빛 동전이 위에서 우수수 떨어진다 (정산 마지막 단계 피날레). 파티클 상한 FX_MAX_PARTICLES 안에서만
    const W = window.innerWidth, H = window.innerHeight;
    for(let i = 0; i < n; i++){
      const big = Math.random() < 0.35;
      add({ x: rnd(0, W), y: rnd(-80, -10), vx: rnd(-30, 30), vy: rnd(120, 260), g: rnd(500, 900), age: 0, life: rnd(1.0, 1.7) * Math.max(1, H / 900),
            delay: rnd(0, 0.45), w: big ? 12 : 8, h: big ? 12 : 8, size: 6, solid: false, mark: true,
            color: color(Math.random() < 0.7 ? '--gold' : '--gold2'), edge: color('--gold2') });
    }
  }
  // 유물 조명: 아이콘에서 픽셀이 튀어나와 영향을 받는 숫자 쪽으로 날아간다
  function streak(fromRect, toRect, n, colorNames){
    if(!shown(fromRect) || !shown(toRect)) return;
    const a = center(fromRect), to = center(toRect), cols = colorNames.map(color);
    for(let i = 0; i < n; i++){
      add({ seek: true, x: a.x, y: a.y, x0: a.x, y0: a.y, cx: a.x + rnd(-80, 80), cy: a.y + rnd(-60, 60), tx: to.x + rnd(-14, 14), ty: to.y + rnd(-5, 5),
            dur: rnd(0.35, 0.6), age: 0, life: 99, delay: i * 0.02, size: 3, color: pick(cols) });
    }
  }
  // 도착 지점에 튀어 오르는 효과 칩 ("+₩230만 🔏")
  function chip(text, rect, tone, delayMs){
    if(!shown(rect)) return;
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'fx-chip ' + (tone || '');
      el.textContent = text;
      el.style.left = Math.round(rect.left + rect.width / 2) + 'px';
      el.style.top = Math.round(rect.top) + 'px';
      document.body.appendChild(el);
      afterAnim(el, dur('chip'), () => el.remove());
    }, stagger(delayMs || 0));
  }

  // 반대매매: 포지션 행이 픽셀 조각으로 부서져 떨어진다
  function shatter(rect, n){
    if(!shown(rect)) return;
    const cols = ['--red', '--red2', '--muted', '--line2', '--panel2'].map(color);
    for(let i = 0; i < n; i++){
      add({ x: rnd(rect.left, rect.right), y: rnd(rect.top, rect.bottom), vx: rnd(-90, 90), vy: rnd(-170, -30), g: 700,
            age: 0, life: rnd(0.8, 1.4), delay: 0, size: Math.round(rnd(3, 8)), color: pick(cols) });
    }
  }
  // 갭: 시세 행에서 위/아래 방향 스파크
  function sparks(rect, dir, n, colorName){
    if(!shown(rect)) return;
    const c = color(colorName), c2 = color('--gold');
    for(let i = 0; i < n; i++){
      add({ x: rnd(rect.left + rect.width * 0.4, rect.right), y: dir > 0 ? rect.top : rect.bottom, vx: rnd(-70, 70),
            vy: dir > 0 ? rnd(-320, -120) : rnd(120, 300), g: dir > 0 ? 260 : 380,
            age: 0, life: rnd(0.4, 0.8), delay: 0, size: Math.round(rnd(2, 4)), color: i % 3 ? c : c2 });
    }
  }
  // 폭발: 팩 개봉·스탬프 (colorNames 중에서 섞어서)
  function burst(x, y, n, colorNames){
    const cols = colorNames.map(color);
    for(let i = 0; i < n; i++){
      const a = rnd(0, Math.PI * 2), v = rnd(80, 300);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 260, age: 0, life: rnd(0.6, 1.2), delay: 0,
            size: Math.round(rnd(3, 6)), color: pick(cols) });
    }
  }

  /* ── 연출 큐: enqueue({ kind, tier 1~4, blocking, duration(ms), play(ctx), stop(), skip() }) ──
     한 틱에 몰린 이벤트를 발생 순서대로 하나씩. 두 번째부터 'CHAIN ×n'. blocking 항목이 남아 있는 동안 시장 정지(busy)
     + 투명 차단막(클릭 = 스킵). 스킵하면 남은 항목을 전부 버리고 각 항목의 skip()으로 최종 상태만 남긴다. */
  let chainCounterOn = true;   // false = 'CHAIN ×n' 표시를 끈다 (수는 그대로 센다 — 효과음 음높이용). 수익 콤보가 숫자를 대신 보여준다
  const setChainCounter = on => { chainCounterOn = !!on; };
  let playHandle = null;
  let queue = [], playing = null, chainN = 0, qTimer = null, gapTimer = null, startTimer = null, speed = 'normal', blocker = null, chainEl = null;
  const onSkipHooks = [];
  function setSpeed(v){ speed = FX_QUEUE_SPEED[v] ? v : 'normal'; }
  const speedCfg = () => FX_QUEUE_SPEED[speed];
  function ensureBlocker(){
    if(blocker) return;
    blocker = document.createElement('div');
    blocker.className = 'fx-blocker';
    blocker.addEventListener('click', e => { e.stopPropagation(); skipQueue(); });
    document.body.appendChild(blocker);
    chainEl = document.createElement('div');
    chainEl.className = 'fx-chainctr';
    document.body.appendChild(chainEl);
  }
  const busy = () => !!((playing && playing.blocking) || queue.some(i => i.blocking));
  function syncBlocker(){ ensureBlocker(); blocker.classList.toggle('on', busy()); }
  function enqueue(item){
    item.duration = item.duration || 600;
    queue.push(item);
    syncBlocker();
    // 재생은 한 박자 뒤에 시작: 같은 틱에 몰린 이벤트가 전부 줄을 선 다음 발생 순서대로 (약 경보 묶기도 이때)
    if(!playing && !gapTimer && !startTimer) startTimer = setTimeout(() => { startTimer = null; nextItem(); }, 0);
    return item;
  }
  const pending = () => queue.slice();   // 아직 시작 안 한 항목 (약 경보 묶기용)
  function nextItem(){
    gapTimer = null;
    playing = queue.shift() || null;
    if(!playing){ chainN = 0; showChain(0); syncBlocker(); return; }
    chainN++;
    showChain(chainN);
    syncBlocker();
    const dur = Math.round(motionTime(playing.duration * speedCfg().dur));
    try { playing.play({ chain: chainN, duration: dur, speed }); } catch(e) { console.error(e); }
    const it = playing;
    qTimer = setTimeout(() => endItem(it, false), dur);
    playHandle = track(ff => { if(playing === it){ clearTimeout(qTimer); endItem(it, ff); } }, 'queue:' + it.kind);
  }
  function endItem(it, ff){   // 항목 끝 (ff = 쌓임 정책으로 당겨 끝냄 → skip()으로 최종 상태까지)
    untrack(playHandle); playHandle = null;
    playing = null;
    if(it && it.stop) try { it.stop(); } catch(e) {}
    if(ff && it && it.skip) try { it.skip(); } catch(e) {}
    if(queue.length){ syncBlocker(); gapTimer = setTimeout(nextItem, stagger(motionTime(speedCfg().gap))); }
    else nextItem();
  }
  function showChain(n){
    ensureBlocker();
    if(n < 2 || !chainCounterOn){ chainEl.classList.remove('on'); return; }
    chainEl.textContent = 'CHAIN ×' + n;
    chainEl.style.setProperty('--chain-scale', String(Math.min(2, 1 + (n - 2) * 0.18)));
    chainEl.classList.remove('on'); void chainEl.offsetWidth; chainEl.classList.add('on');
  }
  function skipQueue(){
    if(!playing && !queue.length) return false;
    clearTimeout(qTimer); clearTimeout(gapTimer); clearTimeout(startTimer); gapTimer = null; startTimer = null;
    const all = (playing ? [playing] : []).concat(queue);
    untrack(playHandle); playHandle = null;
    playing = null; queue = [];
    all.forEach(it => { try { if(it.stop) it.stop(); if(it.skip) it.skip(); } catch(e) {} });
    chainN = 0; showChain(0); release(); syncBlocker();
    onSkipHooks.forEach(fn => fn());
    return true;
  }
  const onSkip = fn => onSkipHooks.push(fn);

  return { setOptions, setUiScale, dur, afterAnim, motionTime, setStackPolicy, stagger, get liveCount(){ return live.length; }, get ffCount(){ return ffCount; }, get ffing(){ return ffing; }, setMotionScale, get motionScale(){ return motionScale(); }, intensity, enqueue, pending, skipQueue, onSkip, setSpeed, setChainCounter, streak, chip,
           get queueBusy(){ return busy(); }, get queueLength(){ return queue.length + (playing ? 1 : 0); }, get chain(){ return chainN; },
           get speed(){ return speed; }, level, hitStop, frozenFor, afterStop, shake, coinRain, glitch, stamp, flash, jiggle, punch, cardFly,
           coinsTo, billRain, shatter, sparks, burst,
           get particleCount(){ return parts.length; }, get running(){ return raf !== 0; },
           get motion(){ return motion; }, get hitStopOn(){ return hitStopOn; } };
})();
