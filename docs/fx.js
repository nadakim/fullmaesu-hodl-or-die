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
const FX_GLITCH_MS     = 380;
const FX_STAMP_MS      = 950;
// 연출 큐: 한 틱에 여러 이벤트가 나면 하나씩 이어서 재생 (간격 ms · 길이 배율). '최소'는 간격 0.1초
const FX_QUEUE_SPEED   = { normal: { gap: 450, dur: 1 }, fast: { gap: 250, dur: 0.65 }, min: { gap: 100, dur: 0.45 } };

const Fx = (() => {
  let motion = true, hitStopOn = true;
  let frozenUntil = 0, unfreezeTimer = null, shakeTimer = null, glitchTimer = null, lastStampAt = 0;
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

  /* ── 흔들림 · 글리치 · 스탬프 · 번쩍임 ── */
  function shake(lvl){
    if(!motion || !lvl) return;
    const cab = cabinet();
    cab.classList.remove('shake', 'shake-1', 'shake-2', 'shake-3');
    void cab.offsetWidth;
    cab.classList.add('shake-' + lvl);
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => cab.classList.remove('shake-' + lvl), 700);
  }
  function glitch(){
    if(!motion) return;
    const cab = cabinet();
    cab.classList.remove('fx-glitch'); void cab.offsetWidth; cab.classList.add('fx-glitch');
    clearTimeout(glitchTimer);
    glitchTimer = setTimeout(() => cab.classList.remove('fx-glitch'), FX_GLITCH_MS);
    const scan = document.createElement('div');   // 스캔라인 떨림
    scan.className = 'fx-scan';
    document.body.appendChild(scan);
    setTimeout(() => scan.remove(), FX_GLITCH_MS);
  }
  function stamp(text, tone, size){   // 화면 가운데 큰 도장 (tone: '' 빨강 · 'up' 초록 · 'gold' / size: '' 대 · 'sm' 소)
    if(now() - lastStampAt < 250) return;   // 한 틱에 반대매매가 여러 건이어도 도장은 한 번
    lastStampAt = now();
    const el = document.createElement('div');
    el.className = 'fx-stamp ' + (tone || '') + (size ? ' ' + size : '');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), FX_STAMP_MS);
  }
  function flash(el, cls){   // 요소 한 번 번쩍 (cls: fx-hit · fx-goal)
    if(!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 650);
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
      setTimeout(() => tag.remove(), 900);
    }
  }

  /* ── 카드 사용: 살짝 눌렸다 늘어나며(스쿼시&스트레치) 대상 쪽으로 날아가 사라진다 ── */
  function cardFly(ghost, fromRect, targetEl, onHit, trail){   // trail: 잔상 수 (카드 연쇄 2장째부터)
    for(let k = 1; k <= (trail || 0); k++){
      const g2 = ghost.cloneNode(true);
      g2.classList.add('fx-afterimage');
      g2.style.opacity = String(0.45 / k);
      setTimeout(() => cardFlyOne(g2, fromRect, targetEl, null), k * 45);
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
    a.onfinish = () => {
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

  // 수익 청산: 동전 픽셀이 포지션 행에서 순자산 표시 쪽으로 빨려 들어간다
  function coinsTo(fromRect, toRect, n){
    if(!shown(fromRect) || !shown(toRect)) return;
    const to = center(toRect);
    for(let i = 0; i < n; i++){
      const x0 = rnd(fromRect.left, fromRect.right), y0 = rnd(fromRect.top, fromRect.bottom);
      add({ seek: true, x: x0, y: y0, x0, y0, cx: x0 + rnd(-60, 60), cy: y0 - rnd(30, 90), tx: to.x + rnd(-20, 20), ty: to.y + rnd(-6, 6),
            dur: rnd(0.45, 0.8), age: 0, life: 99, delay: i * 0.018, size: 5, color: color('--gold'), edge: color('--gold2') });
    }
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
      setTimeout(() => el.remove(), 1100);
    }, delayMs || 0);
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
    const dur = Math.round(playing.duration * speedCfg().dur);
    try { playing.play({ chain: chainN, duration: dur, speed }); } catch(e) { console.error(e); }
    qTimer = setTimeout(() => {
      const it = playing;
      playing = null;
      if(it && it.stop) try { it.stop(); } catch(e) {}
      if(queue.length){ syncBlocker(); gapTimer = setTimeout(nextItem, speedCfg().gap); }
      else nextItem();
    }, dur);
  }
  function showChain(n){
    ensureBlocker();
    if(n < 2){ chainEl.classList.remove('on'); return; }
    chainEl.textContent = 'CHAIN ×' + n;
    chainEl.style.setProperty('--chain-scale', String(Math.min(2, 1 + (n - 2) * 0.18)));
    chainEl.classList.remove('on'); void chainEl.offsetWidth; chainEl.classList.add('on');
  }
  function skipQueue(){
    if(!playing && !queue.length) return false;
    clearTimeout(qTimer); clearTimeout(gapTimer); clearTimeout(startTimer); gapTimer = null; startTimer = null;
    const all = (playing ? [playing] : []).concat(queue);
    playing = null; queue = [];
    all.forEach(it => { try { if(it.stop) it.stop(); if(it.skip) it.skip(); } catch(e) {} });
    chainN = 0; showChain(0); release(); syncBlocker();
    onSkipHooks.forEach(fn => fn());
    return true;
  }
  const onSkip = fn => onSkipHooks.push(fn);

  return { setOptions, setUiScale, intensity, enqueue, pending, skipQueue, onSkip, setSpeed, streak, chip,
           get queueBusy(){ return busy(); }, get queueLength(){ return queue.length + (playing ? 1 : 0); }, get chain(){ return chainN; },
           get speed(){ return speed; }, level, hitStop, frozenFor, afterStop, shake, glitch, stamp, flash, jiggle, punch, cardFly,
           coinsTo, billRain, shatter, sparks, burst,
           get particleCount(){ return parts.length; }, get running(){ return raf !== 0; },
           get motion(){ return motion; }, get hitStopOn(){ return hitStopOn; } };
})();
