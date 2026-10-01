/* ══════════════════════════════════════════════════════════
   SOUND LAB — 소리를 사람이 직접 듣고 메모하는 화면 (UI 전용, 엔진 무관). 주소에 ?soundlab=1 이 있을 때만 docs/demo가 이 파일을 읽는다.
   일반 모드에서는 이 파일을 아예 부르지 않으므로 화면·소리·저장값에 아무 영향이 없다.

   Claude는 소리를 들을 수 없다 → 측정 가능한 것은 tools/audio/audit.cjs가 숫자로 재고 (docs/audio/AUDIT.md),
   귀로 판단할 것(거슬림·약함·과함)은 여기서 사용자가 소리마다 한 줄 메모로 남긴다 (localStorage hodl.soundNotes, '메모 복사'로 내보내기).

   이 파일의 위쪽 SOUND_META는 데이터뿐이라 감사 도구(tools/audio/*)도 같이 읽는다 (카테고리·옵션 변형·음높이 사다리의 단일 출처).
══════════════════════════════════════════════════════════ */

/* ── 카테고리: 같은 역할끼리 음량·음색을 비교하려고 나눈다 (감사 표는 카테고리별로 정렬) ── */
const SOUND_CATEGORIES = [
  { id: 'ui',       label: 'UI',       desc: '버튼·카드 조작 — 가장 자주, 가장 작게' },
  { id: 'feedback', label: '피드백',   desc: '매수·매도·유물·동전·콤보 등 행동의 즉각 반응' },
  { id: 'settle',   label: '정산',     desc: '장 마감 정산 무대·결산 체인 — 이 게임의 메인 이벤트' },
  { id: 'alarm',    label: '경보',     desc: '갭·반대매매·금감원·마감 임박 — 주의를 끌어야 하는 소리' },
  { id: 'sting',    label: '스팅어',   desc: '개장·마감·승패처럼 길고 큰 한 번짜리' },
  { id: 'ambient',  label: '앰비언트', desc: '길게 깔리는 분위기' }
];
const SOUND_CATEGORY_OF = {
  uiClick: 'ui', uiMove: 'ui', uiConfirm: 'ui', uiHover: 'ui', uiPress: 'ui', cardPlay: 'ui', cardReject: 'ui', cardDeal: 'ui',
  tick: 'ui', shopHover: 'ui', shopShuffle: 'ui',
  buy: 'feedback', sellWin: 'feedback', sellLoss: 'feedback', coin: 'feedback', coinDrop: 'feedback', billFlip: 'feedback', coinIn: 'feedback',
  cashRegister: 'feedback', relicTick: 'feedback', relicLevelUp: 'feedback', relicShatter: 'feedback', relicGain: 'feedback', relicClack: 'feedback',
  rareDraw: 'feedback', packShake: 'feedback', packBurst: 'feedback', packFlip: 'feedback', comboUp: 'feedback', comboBreak: 'feedback',
  multSlam: 'feedback', goalReach: 'feedback', tipJackpot: 'feedback', tipBust: 'feedback', flatShrug: 'feedback', survived: 'feedback', sigh: 'feedback',
  settleAdd: 'settle', settleMult: 'settle', settleThud: 'settle', tierBreak: 'settle', coinShower: 'settle', steam: 'alarm', bestBoom: 'settle', unitBreak: 'settle', reelStop: 'settle',
  jackpot: 'settle', chainStep: 'settle', countTick: 'settle', stampWin: 'settle', stampLoss: 'settle',
  marginCall: 'alarm', gapAlarm: 'alarm', gapUp: 'alarm', gapDown: 'alarm', heartbeat: 'alarm', fssWarn: 'alarm', fssSanction: 'alarm',
  tipArrive: 'alarm', crashDown: 'alarm', closeRoll: 'alarm', drumRoll: 'alarm',
  marketOpen: 'sting', dayEnd: 'sting', weekClear: 'sting', weekFail: 'sting', bankrupt: 'sting', victory: 'sting', choir: 'sting',
  shopPad: 'ambient'
};

/* ── 음높이 사다리: 연쇄·정산 단계마다 5음계로 한 칸씩 위 (docs/demo stagePitch와 같은 식 — JUICE_CONFIG.pentatonic · maxOctaves) ── */
const SOUND_PENTATONIC = [0, 2, 4, 7, 9], SOUND_MAX_OCTAVES = 2;
const soundLadderSemi = n => SOUND_PENTATONIC[n % SOUND_PENTATONIC.length] + 12 * (Math.floor(n / SOUND_PENTATONIC.length) % (SOUND_MAX_OCTAVES + 1));
const SOUND_LADDER_STEPS = 12;   // 0..11 → 0 2 4 7 9 12 14 16 19 21 24 26 반음
const SOUND_LADDER_NAMES = ['settleAdd', 'settleMult', 'comboUp', 'chainStep', 'countTick', 'coinIn', 'reelStop', 'cardDeal'];   // 실제로 사다리 음높이를 받는 소리

/* ── 대표 옵션: 같은 소리가 옵션에 따라 달라지는 것들 (등급·크게·스택·단계…). 감사와 Sound Lab 둘 다 이 목록을 쓴다 ── */
const SOUND_RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
const SOUND_OPTION_VARIANTS = {
  relicLevelUp: SOUND_RARITIES.map(r => ({ label: 'rarity ' + r, opts: { rarity: r } })),
  packBurst:    SOUND_RARITIES.map(r => ({ label: 'rarity ' + r, opts: { rarity: r } })),
  packFlip:     SOUND_RARITIES.map(r => ({ label: 'rarity ' + r, opts: { rarity: r } })),
  rareDraw:     ['rare', 'legendary', 'mythic'].map(r => ({ label: 'rarity ' + r, opts: { rarity: r } })),
  settleMult:   [{ label: 'big', opts: { big: true } }],
  relicTick:    [1, 10, 30].map(s => ({ label: 'stacks ' + s, opts: { stacks: s } })),
  tierBreak:    [1, 2, 3, 4].map(t => ({ label: 'tier ' + t, opts: { tier: t } })),
  closeRoll:    [1, 2, 3].map(l => ({ label: 'level ' + l, opts: { level: l, dur: 0.76 } })),
  drumRoll:     [{ label: 'last', opts: { last: true } }],
  buy:          [{ label: '레버리지 2x', opts: { lev: 2 } }, { label: '레버리지 3x', opts: { lev: 3 } }, { label: '숏', opts: { dir: -1 } }],
  coinDrop:     [{ label: 'count 8', opts: { count: 8 } }],
  billFlip:     [{ label: 'count 3', opts: { count: 3 } }, { label: 'count 6', opts: { count: 6 } }],
  tick:         [-12, -6, 6, 12].map(n => ({ label: '콤보 음높이 ' + (n > 0 ? '+' : '') + n + '반음', opts: { pitch: Math.pow(2, n / 12) } }))   // 게임: Sound.semis(streak.dir × min(12, streak.n))
};
/* 기본 옵션(빈 객체)으로 부르면 안 되는 소리는 없다 — 모든 SFX 함수가 opts를 {}로 받는다 */

/* 감사·Sound Lab 공용: 소리 하나의 변형 목록 [{ id, name, label, opts, pitchStep?, kind }]
   kind: 'default' 기본 · 'option' 옵션 · 'ladder' 음높이 사다리 n단 (opts.pitch = 2^(반음/12)) */
function soundVariants(names){
  const out = [];
  (names || Object.keys(Sound.SFX)).forEach(name => {
    out.push({ id: name, name, label: '기본', opts: {}, kind: 'default' });
    (SOUND_OPTION_VARIANTS[name] || []).forEach((v, i) => out.push({ id: name + '#' + v.label, name, label: v.label, opts: v.opts, kind: 'option' }));
    if(SOUND_LADDER_NAMES.indexOf(name) >= 0){
      for(let n = 0; n < SOUND_LADDER_STEPS; n++) out.push({ id: name + '@' + n, name, label: '사다리 ' + (n + 1) + '단 (+' + soundLadderSemi(n) + '반음)', opts: { pitch: Math.pow(2, soundLadderSemi(n) / 12) }, pitchStep: n, kind: 'ladder' });
    }
  });
  return out;
}
const soundCategoryOf = name => SOUND_CATEGORY_OF[name] || 'uncategorized';

/* ══════════════════════════════════════════════════════════
   Sound Lab 화면 (mount는 docs/demo가 ?soundlab=1 일 때만 부른다)
   · 컨트롤은 <button>·.btn-chunky가 아니라 div[role=button]이다 — 게임의 전역 핸들러가 버튼 클릭·누름·호버에 uiClick·uiPress·uiHover를
     같이 울려서 감상하는 소리가 오염되기 때문. (타이틀의 '첫 입력 삼키기'는 mount가 wakeTitle()로 미리 푼다)
   · 장면(scene)은 실제 게임이 부르는 순서·간격·음높이를 그대로 따라 한다 (docs/demo의 playDayStage·콤보·마감 임박·팩 개봉 등).
══════════════════════════════════════════════════════════ */
const SoundLab = (() => {
  const NOTES_KEY = 'hodl.soundNotes';
  const RATINGS = [['', '—'], ['good', '좋음'], ['harsh', '거슬림'], ['weak', '약함'], ['loud', '과함']];
  let root = null, notes = {}, measured = null, timers = [], bgm = { song: 'market', mood: { state: 'NORMAL', danger: false, fss: false, jackpot: false, progress: 0 }, muffle: false, layers: { p1: true, p2: true, tri: true, noise: true }, playing: false };
  const memNotes = {};   // localStorage가 막혀 있을 때의 임시 저장
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = n => Math.pow(2, soundLadderSemi(n) / 12);   // 사다리 n단의 음높이 배율 (= docs/demo stagePitch)
  const semis = n => Math.pow(2, n / 12);

  function loadNotes(){ try { const o = JSON.parse(localStorage.getItem(NOTES_KEY)); return o && o.notes && typeof o.notes === 'object' ? o.notes : {}; } catch(e) { return Object.assign({}, memNotes); } }
  function saveNotes(){ try { localStorage.setItem(NOTES_KEY, JSON.stringify({ version: 1, notes })); } catch(e) { Object.assign(memNotes, notes); } }
  function setNote(key, patch){
    const cur = notes[key] || { r: '', t: '' }, next = Object.assign({}, cur, patch);
    if(!next.r && !next.t.trim()) delete notes[key]; else notes[key] = next;
    saveNotes(); refreshCount();
  }

  /* ── 재생 ── */
  function play(name, opts){ Sound.unlock(); Sound.setEnabled(true); return Sound.play(name, opts || {}); }
  function stopAll(){ timers.forEach(clearTimeout); timers = []; Sound.stopAll(); }
  function playEvents(events){   // [[초, 이름, 옵션], …]
    stopAll();
    Sound.unlock();
    events.forEach(e => timers.push(setTimeout(() => Sound.play(e[1], e[2] || {}), Math.round(e[0] * 1000))));
    return events.length ? events[events.length - 1][0] : 0;
  }

  /* ── 장면: 실제 게임의 순서·간격·음높이 ── */
  const jc = () => (typeof JUICE_CONFIG !== 'undefined' ? JUICE_CONFIG : {});
  function sceneSettle(size){   // 장 마감 정산 무대 (playDayStage): 칩/배수 단계 → 금액 슬롯 → 동전 → 금전등록기 → 둥
    const M = Object.assign({ intro: 420, row: 300, step: 480, count: 800, sum: 500, coins: 700, end: 420 }, jc().stageMs || {}), ms = k => M[k] / 1000;
    const plan = { small: ['add', 'add', 'mult'], mid: ['add', 'add', 'mult', 'mult/1', 'mult'], big: ['add', 'add', 'mult', 'mult/1', 'mult/2', 'mult/3', 'mult', 'mult/best'] }[size];
    const ev = [[0, 'dayEnd']];
    let t = ms('intro') + ms('row');
    ev.push([t, 'countTick', { pitch: P(0) }]);
    t += ms('row');
    plan.forEach((s, k) => {
      const [kind, extra] = s.split('/'), x = kind === 'mult';
      ev.push([t, x ? 'settleMult' : 'settleAdd', { pitch: P(k), big: k >= 3 }]);
      if(extra && extra !== 'best') ev.push([t, 'tierBreak', { tier: +extra, pitch: P(k) }]);
      if(extra === 'best') ev.push([t + 0.12, 'bestBoom']);
      t += ms('step');
    });
    const nd = { small: 4, mid: 7, big: 11 }[size], spin = (jc().slotSpinMs || 300) / 1000, gap = Math.min((jc().slotDigitGapMs || 90) / 1000, 1.4 / Math.max(1, nd));
    for(let q = 0; q < nd; q++) ev.push([t + spin + gap * q + 0.01, 'billFlip', { count: 2 + Math.round(q / 2), pitch: semis(q) }]);
    t += spin + gap * (nd - 1) + 0.02 + ms('count') * 0.5;
    if(size === 'big') ev.push([t, 'unitBreak', { pitch: semis(-4) }]);
    t += ms('sum');
    ev.push([t, 'coinDrop', { count: { small: 3, mid: 6, big: 9 }[size] }]);
    t += ms('coins');
    ev.push([t, 'cashRegister', { volume: size === 'small' ? 0.5 : 1 }]);
    t += ms('end');
    ev.push([t, 'settleThud']);
    return ev;
  }
  function sceneCrit(){   // 크리티컬 릴: 7 7 7 한 칸씩 멈춤 → 잭팟
    const gap = (jc().critStopGapMs || 350) / 1000;
    return [[0, 'reelStop', { pitch: P(5) }], [gap, 'reelStop', { pitch: P(6) }], [gap * 2, 'jackpot', { pitch: P(7) }]];
  }
  function sceneCombo(){   // 수익 콤보 1→14 → 끊김 (단계: 1~2 / 3~4 / 5~7 / 8~11 / 12+)
    const tier = n => (n >= 12 ? 5 : n >= 8 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : 1), ev = [];
    for(let n = 1; n <= 14; n++){
      const t = (n - 1) * 0.24;
      ev.push([t, 'comboUp', { pitch: P(n - 1), volume: 0.45 + 0.1 * tier(n) }]);
      if(n === 3 || n === 5 || n === 8 || n === 12) ev.push([t + 0.03, tier(n) >= 5 ? 'jackpot' : 'multSlam', { pitch: semis((tier(n) - 2) * 2) }]);
    }
    ev.push([14 * 0.24 + 0.2, 'comboBreak', { pitch: P(9) }]);
    return ev;
  }
  function sceneClose(){   // 마감 임박: 마지막 3틱마다 스네어 연타가 촘촘해진다 (한 틱 = TICK_MS / 속도)
    const tick = (typeof TICK_MS === 'number' ? TICK_MS : 800) / 1000;
    return [[0, 'closeRoll', { level: 1, dur: tick * 0.95 }], [tick, 'closeRoll', { level: 2, dur: tick * 0.95 }], [tick * 2, 'closeRoll', { level: 3, dur: tick * 0.95 }], [tick * 3, 'dayEnd']];
  }
  function sceneDanger(){   // 반대매매 위험: 심장 박동이 점점 빨라진다 → 경보 → 반대매매
    const hm = jc().heartMs || [1100, 350], ev = [];
    let t = 0;
    for(let i = 0; i < 8; i++){ ev.push([t, 'heartbeat']); t += (hm[0] + (hm[1] - hm[0]) * (i / 7)) / 1000; }
    ev.push([t, 'gapAlarm', { pitch: semis(-5) }], [t + 0.9, 'marginCall']);
    return ev;
  }
  function scenePack(r){   // 팩 개봉: 흔들림 → 터짐 → (신화: 합창) → 뒤집기
    const T = typeof packTiming === 'function' ? packTiming(r) : { start: 500, reveal: 1200, myth: r === 'mythic' }, ev = [];
    if(!T.myth) ev.push([0, 'packShake']);
    ev.push([T.start / 1000, 'packBurst', { rarity: r }]);
    if(T.myth) ev.push([T.start / 1000, 'choir']);
    ev.push([(T.reveal - 220) / 1000, 'packFlip', { rarity: r }]);
    return ev;
  }
  function sceneTip(kind){   // 찌라시 도착 → 결과 (상승·횡보·하락)
    const ev = [[0, 'tipArrive']];
    if(kind === 'up') ev.push([1.4, 'billFlip', { count: 3, volume: 0.7 }], [1.45, 'coinDrop', { count: 8 }], [1.65, 'cashRegister']);
    else if(kind === 'flat') ev.push([1.4, 'flatShrug']);
    else ev.push([1.4, 'crashDown'], [1.4, 'crowdScream', { volume: 0.8 }]);   // crowdScream은 파일(assets/sfx/scream.*)이 있을 때만 울린다
    return ev;
  }
  function sceneOpen(){   // 장 시작 3·2·1 → OPEN
    const g = (jc().countdownMs || 1200) / 1000 / 4;
    return [[0, 'drumRoll', { pitch: 1 }], [g, 'drumRoll', { pitch: semis(2) }], [g * 2, 'drumRoll', { pitch: semis(4) }], [g * 3, 'drumRoll', { last: true }], [g * 3, 'marketOpen']];
  }
  function sceneDeal(){   // 장전 드로우: 카드 한 장씩 5음계로 올라가고 희귀 카드는 종
    const gap = (jc().dealGapMs || 70) / 1000, ev = [];
    for(let i = 0; i < 6; i++) ev.push([i * gap, 'cardDeal', { pitch: P(i) }]);
    ev.push([6 * gap + 0.1, 'rareDraw', { rarity: 'rare' }], [6 * gap + 0.5, 'rareDraw', { rarity: 'legendary' }], [6 * gap + 1.1, 'rareDraw', { rarity: 'mythic' }]);
    return ev;
  }
  function sceneChain(){   // 주간 결산 체인: 칩 → 카운트업 → 도장
    const ev = [];
    for(let i = 0; i < 5; i++) ev.push([i * 0.32, 'chainStep', { semi: i, pitch: semis(i * 2), volume: i % 2 ? 1.15 : 0.9 }]);
    for(let i = 0; i < 8; i++) ev.push([1.8 + i * 0.07, 'countTick', { pitch: semis(i / 4) }]);
    ev.push([2.6, 'stampWin']);
    return ev;
  }
  const SCENES = [
    { id: 'settle-small', label: '정산 무대 — 작은 날 (칩 2 · 배수 1)', ev: () => sceneSettle('small') },
    { id: 'settle-mid',   label: '정산 무대 — 보통 (칩 2 · 배수 3 · 구간 돌파 1회)', ev: () => sceneSettle('mid') },
    { id: 'settle-big',   label: '정산 무대 — 대박 (구간 돌파 1~3 · 최고 갱신 · 단위 돌파)', ev: () => sceneSettle('big') },
    { id: 'crit',         label: '크리티컬 릴 7·7·7 → 잭팟', ev: sceneCrit },
    { id: 'combo',        label: '수익 콤보 1→14 (3·5·8 슬램 · 12 잭팟) → 끊김', ev: sceneCombo },
    { id: 'close',        label: '마감 임박 (마지막 3틱) → 장 마감', ev: sceneClose },
    { id: 'danger',       label: '반대매매 위험: 심장 박동 가속 → 경보 → 반대매매', ev: sceneDanger },
    { id: 'open',         label: '장 시작 카운트다운 3·2·1 → OPEN', ev: sceneOpen },
    { id: 'deal',         label: '장전 드로우 (카드 6장 + 희귀·전설·신화 종)', ev: sceneDeal },
    { id: 'chain',        label: '주간 결산 체인 (칩 → 카운트업 → 떡상!)', ev: sceneChain }
  ].concat(SOUND_RARITIES.map(r => ({ id: 'pack-' + r, label: '팩 개봉 — ' + r, ev: () => scenePack(r) })),
           [['up', '찌라시 결과 — 상승'], ['flat', '찌라시 결과 — 횡보'], ['down', '찌라시 결과 — 하락']].map(([k, l]) => ({ id: 'tip-' + k, label: l, ev: () => sceneTip(k) })));

  /* ── 화면 ── */
  const CSS = `
#soundLab{position:fixed;inset:0;z-index:100000;overflow:auto;background:var(--bg);color:var(--text);font-family:var(--gf-sm,monospace),monospace;font-size:var(--fs-sm,12px);padding:calc(10 * var(--u,1px)) calc(14 * var(--u,1px)) calc(60 * var(--u,1px))}
#soundLab[hidden]{display:none}
#soundLab h1{font-family:'Press Start 2P',var(--gp-p1),monospace;font-size:var(--fs-p2,16px);color:var(--gold);margin:calc(6 * var(--u,1px)) 0}
#soundLab h2{font-size:var(--fs-lg,20px);color:var(--cyan);margin:calc(18 * var(--u,1px)) 0 calc(4 * var(--u,1px));border-bottom:calc(2 * var(--u,1px)) solid var(--line2);padding-bottom:calc(2 * var(--u,1px))}
#soundLab h3{font-size:var(--fs-md,15px);color:var(--gold2);margin:calc(10 * var(--u,1px)) 0 calc(3 * var(--u,1px))}
#soundLab .lab-sub{color:var(--text2);margin:0 0 calc(6 * var(--u,1px));line-height:1.45}
#soundLab .lab-bar{display:flex;flex-wrap:wrap;gap:calc(8 * var(--u,1px)) calc(14 * var(--u,1px));align-items:center;position:sticky;top:calc(-10 * var(--u,1px));z-index:2;background:var(--bg);padding:calc(6 * var(--u,1px)) 0;border-bottom:calc(2 * var(--u,1px)) solid var(--line)}
#soundLab .lab-row{display:grid;grid-template-columns:calc(170 * var(--u,1px)) calc(130 * var(--u,1px)) calc(104 * var(--u,1px)) minmax(0,1fr) calc(78 * var(--u,1px)) calc(190 * var(--u,1px));gap:calc(6 * var(--u,1px));align-items:center;padding:calc(3 * var(--u,1px)) 0;border-bottom:calc(1 * var(--u,1px)) solid var(--line)}
#soundLab .lab-row.noted{background:color-mix(in srgb,var(--gold) 8%,transparent)}
#soundLab .lab-btn{display:inline-block;cursor:pointer;user-select:none;padding:calc(4 * var(--u,1px)) calc(8 * var(--u,1px));background:var(--panel2);color:var(--text);border:calc(2 * var(--u,1px)) solid var(--cyan);box-shadow:calc(2 * var(--u,1px)) calc(2 * var(--u,1px)) 0 #000;font-family:'VT323',var(--gv-v1),monospace;font-size:var(--fs-v2,20px);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#soundLab .lab-btn:hover,#soundLab .lab-btn:focus-visible{background:var(--panel);color:var(--gold);outline:none}
#soundLab .lab-btn:active{transform:translate(calc(2 * var(--u,1px)),calc(2 * var(--u,1px)));box-shadow:none}
#soundLab .lab-btn.sm{font-size:var(--fs-v1,16px);padding:calc(2 * var(--u,1px)) calc(6 * var(--u,1px))}
#soundLab .lab-btn.warn{border-color:var(--red);color:var(--red2)}
#soundLab .lab-meta{color:var(--muted);font-family:'VT323',var(--gv-v1),monospace;font-size:var(--fs-v1,16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#soundLab select,#soundLab input[type=text]{background:var(--panel2);color:var(--text);border:calc(2 * var(--u,1px)) solid var(--line2);font-family:var(--gf-sm,monospace),monospace;font-size:var(--fs-sm,12px);padding:calc(2 * var(--u,1px)) calc(3 * var(--u,1px));min-width:0;width:100%;box-sizing:border-box}
#soundLab input[type=range]{width:calc(120 * var(--u,1px))}
#soundLab .lab-ladder{display:flex;flex-wrap:wrap;gap:calc(4 * var(--u,1px));align-items:center;padding:calc(4 * var(--u,1px)) 0;border-bottom:calc(1 * var(--u,1px)) solid var(--line)}
#soundLab .lab-ladder .nm{width:calc(110 * var(--u,1px));color:var(--gold2)}
#soundLab .lab-ladder .note{display:flex;gap:calc(6 * var(--u,1px));flex:1 1 calc(260 * var(--u,1px));min-width:0}
#soundLab .lab-scene{display:grid;grid-template-columns:calc(70 * var(--u,1px)) minmax(0,1fr) calc(78 * var(--u,1px)) calc(190 * var(--u,1px));gap:calc(6 * var(--u,1px));align-items:center;padding:calc(3 * var(--u,1px)) 0;border-bottom:calc(1 * var(--u,1px)) solid var(--line)}
#soundLab .lab-chk{display:inline-flex;gap:calc(4 * var(--u,1px));align-items:center;margin-right:calc(10 * var(--u,1px));cursor:pointer}
#soundLab textarea{width:100%;box-sizing:border-box;height:calc(90 * var(--u,1px));background:var(--panel2);color:var(--text2);border:calc(2 * var(--u,1px)) solid var(--line2);font-family:monospace;font-size:var(--fs-xs,10px)}
#soundLab .lab-cnt{color:var(--gold);font-family:'VT323',var(--gv-v1),monospace;font-size:var(--fs-v2,20px)}
#labReopen{position:fixed;right:calc(10 * var(--u,1px));bottom:calc(10 * var(--u,1px));z-index:100001}
@media (max-width:900px){#soundLab .lab-row{grid-template-columns:1fr 1fr;}#soundLab .lab-scene{grid-template-columns:calc(70 * var(--u,1px)) 1fr}#soundLab .lab-row .lab-meta{grid-column:1 / -1}}`;

  const btn = (act, label, attrs, cls) => `<div class="lab-btn ${cls || ''}" role="button" tabindex="0" data-lab="${act}" ${attrs || ''}>${label}</div>`;
  const ratingSel = key => `<select data-lab="rating" data-key="${esc(key)}" aria-label="평가">${RATINGS.map(([v, l]) => `<option value="${v}" ${(notes[key] && notes[key].r) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const noteIn = key => `<input type="text" data-lab="note" data-key="${esc(key)}" maxlength="120" placeholder="한 줄 메모" value="${esc((notes[key] && notes[key].t) || '')}">`;

  function metaText(id){
    const m = measured && measured[id];
    if(!m) return '';
    return `RMS ${m.rmsDb.toFixed(0)}dB · 피크 ${m.peakDb.toFixed(0)}dB · 중심 ${m.centroid >= 1000 ? (m.centroid / 1000).toFixed(1) + 'k' : Math.round(m.centroid)}Hz · 고음 ${Math.round(m.hiRatio * 100)}%`;
  }
  function sfxRows(){
    return SOUND_CATEGORIES.map(c => {
      const names = Object.keys(Sound.SFX).filter(n => soundCategoryOf(n) === c.id);
      if(!names.length) return '';
      return `<h3>${esc(c.label)} <small style="color:var(--text2)">— ${esc(c.desc)}</small></h3>` + names.map(n => {
        const vs = soundVariants([n]), opt = vs.filter(v => v.kind !== 'ladder'), lad = vs.filter(v => v.kind === 'ladder');
        return `<div class="lab-row" data-name="${n}" data-key="sfx:${n}">
          ${btn('play', '▶ ' + n)}
          <select data-lab="variant" aria-label="옵션">${opt.map(v => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</select>
          ${lad.length ? `<select data-lab="step" aria-label="음높이 단계"><option value="">음높이 원음</option>${lad.map(v => `<option value="${v.pitchStep}">${v.pitchStep + 1}단 +${soundLadderSemi(v.pitchStep)}</option>`).join('')}</select>` : '<span></span>'}
          <span class="lab-meta" data-lab="meta">${esc(metaText(n))}</span>
          ${ratingSel('sfx:' + n)}${noteIn('sfx:' + n)}</div>`;
      }).join('');
    }).join('');
  }
  function ladderRows(){
    return SOUND_LADDER_NAMES.map(n => `<div class="lab-ladder" data-name="${n}">
      <span class="nm">${n}</span>${btn('ladder', '▶ 올라가기 12단', `data-name="${n}"`)}${btn('ladderDown', '▶ 내려가기 (손실)', `data-name="${n}"`, 'warn')}
      ${Array.from({ length: SOUND_LADDER_STEPS }, (_, i) => btn('step', String(i + 1), `data-name="${n}" data-step="${i}" title="+${soundLadderSemi(i)}반음"`, 'sm')).join('')}
      <span class="note">${ratingSel('ladder:' + n)}${noteIn('ladder:' + n)}</span></div>`).join('');
  }
  function sceneRows(){
    return SCENES.map(s => `<div class="lab-scene" data-key="scene:${s.id}">${btn('scene', '▶ 장면', `data-scene="${s.id}"`)}<span>${esc(s.label)}</span>${ratingSel('scene:' + s.id)}${noteIn('scene:' + s.id)}</div>`).join('');
  }
  function bgmPanel(){
    const loops = Object.keys(Music.SONGS).filter(n => Music.SONGS[n].loop !== false), stings = Object.keys(Music.SONGS).filter(n => Music.SONGS[n].loop === false);
    return `<div class="lab-row" style="grid-template-columns:repeat(auto-fit,minmax(calc(130 * var(--u,1px)),max-content))">
      <select data-lab="bgmSong" aria-label="곡">${loops.map(n => `<option value="${n}" ${n === bgm.song ? 'selected' : ''}>${n} (${Music.SONGS[n].bpm}bpm)</option>`).join('')}</select>
      ${btn('bgmPlay', '▶ 재생 / 다시')}${btn('bgmStop', '■ 정지', '', 'warn')}</div>
    <div class="lab-sub">레이어(채널) — 끄고 켜면 곡을 처음부터 다시 시작합니다.</div>
    <div>${['p1', 'p2', 'tri', 'noise'].map(c => `<label class="lab-chk"><input type="checkbox" data-lab="bgmLayer" data-ch="${c}" checked> ${c}${{ p1: ' 멜로디', p2: ' 화음', tri: ' 베이스', noise: ' 드럼' }[c]}</label>`).join('')}</div>
    <div class="lab-sub" style="margin-top:calc(6 * var(--u,1px))">시장 상황 (market 곡이 반응 — 다음 마디부터 바뀜)</div>
    <div><select data-lab="bgmState" aria-label="장세">${['NORMAL', 'BULL', 'BEAR', 'VOLATILE'].map(s => `<option>${s}</option>`).join('')}</select>
      <label class="lab-chk"><input type="checkbox" data-lab="bgmFlag" data-flag="danger"> 반대매매 위험(사이렌)</label>
      <label class="lab-chk"><input type="checkbox" data-lab="bgmFlag" data-flag="fss"> 금감원 경고(전화벨)</label>
      <label class="lab-chk"><input type="checkbox" data-lab="bgmFlag" data-flag="jackpot"> JACKPOT 레이어</label>
      <label class="lab-chk"><input type="checkbox" data-lab="bgmMuffle"> 암시장 로우패스</label>
      <label class="lab-chk">마감 진행 <input type="range" min="0" max="100" value="0" data-lab="bgmProgress"></label></div>
    <div style="margin:calc(6 * var(--u,1px)) 0">스팅어: ${stings.map(n => btn('sting', '▶ ' + n, `data-song="${n}"`, 'sm')).join(' ')}</div>
    <div class="lab-scene" data-key="bgm:song">${btn('noop', '메모', '', 'sm')}<span>이 곡(위에서 고른 곡) 전체에 대한 메모</span>${ratingSel('bgm:' + bgm.song)}${noteIn('bgm:' + bgm.song)}</div>`;
  }

  function bgmStart(){
    stopAll();
    Sound.unlock();
    Music.setEnabled(false);
    Object.keys(bgm.layers).forEach(c => { MUSIC_CH_VOL[c] = bgm.layers[c] ? SoundLab.chVol[c] : 0; });   // 채널 볼륨은 곡이 시작될 때 읽힌다
    Music.setMood(Object.assign({}, bgm.mood));
    Music.setMuffle(bgm.muffle);
    Music.crossfadeTo(bgm.song, 0.15);
    Music.setEnabled(true);
    bgm.playing = true;
  }
  function bgmStop(){ Music.setEnabled(false); bgm.playing = false; }

  function currentOpts(row){
    const name = row.dataset.name, vs = soundVariants([name]);
    const vSel = row.querySelector('[data-lab="variant"]'), sSel = row.querySelector('[data-lab="step"]');
    const v = vs.find(x => x.id === (vSel ? vSel.value : name)) || vs[0];
    let opts = Object.assign({}, v.opts), id = v.id;
    if(sSel && sSel.value !== ''){ opts = Object.assign(opts, { pitch: P(+sSel.value) }); id = name + '@' + sSel.value; }
    return { name, opts, id };
  }
  function refreshCount(){ const el = root && root.querySelector('#labCount'); if(el) el.textContent = Object.keys(notes).length + '개 메모'; if(root) root.querySelectorAll('.lab-row[data-key]').forEach(r => r.classList.toggle('noted', !!notes[r.dataset.key])); }

  function exportNotes(){
    const label = key => {
      const [kind, id] = key.split(/:(.*)/);
      if(kind === 'sfx') return `${id} (${soundCategoryOf(id)})`;
      if(kind === 'scene') return (SCENES.find(s => s.id === id) || { label: id }).label;
      return key;
    };
    return JSON.stringify({ at: new Date().toISOString(), sfxVol: Math.round((Number(root.querySelector('[data-lab="sfxVol"]').value))), bgmVol: Math.round(Number(root.querySelector('[data-lab="bgmVol"]').value)),
      notes: Object.keys(notes).sort().map(k => ({ key: k, label: label(k), rating: (RATINGS.find(r => r[0] === notes[k].r) || ['', ''])[1], text: notes[k].t })) }, null, 1);
  }
  function copyNotes(){
    const text = exportNotes();
    window.__soundLabLastCopy = text;
    const box = root.querySelector('#labExport');
    box.value = text; box.hidden = false;
    const fallback = () => { box.select(); let ok = false; try { ok = document.execCommand('copy'); } catch(e) {} return ok; };
    const done = ok => { root.querySelector('#labCopyState').textContent = ok ? '복사됨 — 붙여 넣어 전달하세요' : '복사가 막혀 있어요 — 아래 칸을 직접 복사하세요'; };
    try { if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback())); return; } } catch(e) {}
    done(fallback());
  }

  function onAct(el){
    const act = el.dataset.lab;
    if(act === 'play'){ const row = el.closest('.lab-row'), c = currentOpts(row); play(c.name, c.opts); const m = row.querySelector('[data-lab="meta"]'); m.textContent = metaText(c.id) || m.textContent; }
    else if(act === 'step'){ const n = el.dataset.name; play(n, { pitch: P(+el.dataset.step) }); }
    else if(act === 'ladder' || act === 'ladderDown'){
      stopAll();
      for(let i = 0; i < SOUND_LADDER_STEPS; i++) timers.push(setTimeout(() => Sound.play(el.dataset.name, { pitch: act === 'ladder' ? P(i) : Math.pow(2, -soundLadderSemi(i) / 12) }), i * 170));
    }
    else if(act === 'scene'){ const s = SCENES.find(x => x.id === el.dataset.scene); playEvents(s.ev()); }
    else if(act === 'stop'){ stopAll(); bgmStop(); }
    else if(act === 'copy') copyNotes();
    else if(act === 'clear'){ if(el.dataset.armed){ notes = {}; saveNotes(); root.querySelectorAll('[data-lab="rating"]').forEach(s => { s.value = ''; }); root.querySelectorAll('[data-lab="note"]').forEach(i => { i.value = ''; }); delete el.dataset.armed; el.textContent = '메모 전부 지우기'; refreshCount(); } else { el.dataset.armed = '1'; el.textContent = '정말 지울까요? 한 번 더'; } }
    else if(act === 'close'){ root.hidden = true; document.getElementById('labReopen').hidden = false; }
    else if(act === 'bgmPlay') bgmStart();
    else if(act === 'bgmStop') bgmStop();
    else if(act === 'sting'){ stopAll(); Music.setEnabled(true); Sound.unlock(); Music.stinger(el.dataset.song); }
  }
  function onChange(el){
    const act = el.dataset.lab;
    if(act === 'rating') setNote(el.dataset.key, { r: el.value });
    else if(act === 'note') setNote(el.dataset.key, { t: el.value });
    else if(act === 'variant' || act === 'step'){ const row = el.closest('.lab-row'), c = currentOpts(row); row.querySelector('[data-lab="meta"]').textContent = metaText(c.id); }
    else if(act === 'sfxVol'){ Sound.setVolume(el.value / 100); }
    else if(act === 'bgmVol'){ Music.setVolume(el.value / 100); }
    else if(act === 'bgmSong'){ bgm.song = el.value; if(bgm.playing) bgmStart(); }
    else if(act === 'bgmLayer'){ bgm.layers[el.dataset.ch] = el.checked; if(bgm.playing) bgmStart(); }
    else if(act === 'bgmState'){ bgm.mood.state = el.value; Music.setMood({ state: el.value }); }
    else if(act === 'bgmFlag'){ bgm.mood[el.dataset.flag] = el.checked; Music.setMood({ [el.dataset.flag]: el.checked }); }
    else if(act === 'bgmMuffle'){ bgm.muffle = el.checked; Music.setMuffle(el.checked); }
    else if(act === 'bgmProgress'){ bgm.mood.progress = el.value / 100; Music.setMood({ progress: el.value / 100 }); }
  }

  function mount(){
    if(root) return;
    notes = loadNotes();
    SoundLab.chVol = Object.assign({}, MUSIC_CH_VOL);   // 원래 채널 볼륨 (레이어 끄기·켜기 복원용)
    if(typeof wakeTitle === 'function' && typeof titleWoke !== 'undefined' && !titleWoke && currentTab === 'title') wakeTitle();   // 타이틀의 '첫 입력 삼키기'를 풀어 둔다
    if(typeof updateMusic === 'function') window.updateMusic = () => {};   // 게임 화면이 곡을 바꾸지 못하게 (Lab이 BGM을 직접 다룬다)
    Music.setEnabled(false);
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div');
    root.id = 'soundLab';
    const sfxVol = typeof settings !== 'undefined' ? settings.sfxVol : 50, bgmVol = typeof settings !== 'undefined' ? settings.bgmVol : 40;
    root.innerHTML = `
      <h1>🔊 SOUND LAB</h1>
      <p class="lab-sub">소리를 직접 듣고 한 줄씩 메모하세요. 숫자로 잰 값(RMS·피크·중심 주파수·고음 비율)은 각 줄 옆에 있고, 전체 표와 해석은 docs/audio/AUDIT.md.
        메모는 이 브라우저에 자동 저장됩니다 (<code>hodl.soundNotes</code>). 이 화면은 주소에 <code>?soundlab=1</code>이 있을 때만 열립니다.</p>
      <div class="lab-bar">
        <label>효과음 볼륨 <input type="range" min="0" max="100" value="${sfxVol}" data-lab="sfxVol"></label>
        <label>BGM 볼륨 <input type="range" min="0" max="100" value="${bgmVol}" data-lab="bgmVol"></label>
        ${btn('stop', '■ 모두 정지', '', 'warn')}${btn('copy', '📋 메모 복사 (JSON)')}${btn('clear', '메모 전부 지우기', '', 'sm warn')}
        <span class="lab-cnt" id="labCount"></span><span id="labCopyState" class="lab-meta"></span>${btn('close', '← 게임 화면', '', 'sm')}
      </div>
      <textarea id="labExport" hidden readonly aria-label="내보내기 JSON"></textarea>
      <h2>① 효과음</h2><p class="lab-sub">▶ 로 재생 · 옵션(등급·크게·스택 등)과 음높이 단계를 고르면 그대로 재생됩니다. 평가는 소리 하나(이름)에 대한 것입니다.</p>${sfxRows()}
      <h2>② 음높이 사다리 (5음계 12단)</h2><p class="lab-sub">연쇄·정산 단계마다 5음계로 한 칸씩 올라갑니다 (1단~12단 = 0·2·4·7·9·12·14·16·19·21·24·26 반음). 높은 단계의 거슬림·귀 피로를 확인하세요.</p>${ladderRows()}
      <h2>③ 장면 (실제 게임의 순서·간격·음높이)</h2>${sceneRows()}
      <h2>④ BGM</h2>${bgmPanel()}
      <h2>⑤ 메모</h2><p class="lab-sub">위 📋 버튼으로 내보낸 JSON이 여기 쌓이는 메모 전부입니다.</p>`;
    document.body.appendChild(root);
    const re = document.createElement('div'); re.id = 'labReopen'; re.hidden = true; re.className = 'lab-btn'; re.setAttribute('role', 'button'); re.tabIndex = 0; re.textContent = '🔊 Lab';
    re.addEventListener('click', () => { root.hidden = false; re.hidden = true; });
    document.body.appendChild(re);
    root.addEventListener('click', e => { const el = e.target.closest('[data-lab]'); if(el && el.getAttribute('role') === 'button') onAct(el); });
    root.addEventListener('keydown', e => {
      e.stopPropagation();   // 게임의 전역 단축키(Space·Enter·1~4·Esc)가 입력을 가로채지 않게
      if((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button'){ e.preventDefault(); onAct(e.target.closest('[data-lab]')); }
    });
    root.addEventListener('change', e => { if(e.target.dataset && e.target.dataset.lab) onChange(e.target); });
    root.addEventListener('input', e => { const t = e.target; if(t.dataset && (t.dataset.lab === 'note' || t.dataset.lab === 'sfxVol' || t.dataset.lab === 'bgmVol' || t.dataset.lab === 'bgmProgress')) onChange(t); });
    refreshCount();
    // 측정값(tools/audio/audit.cjs가 만든 docs/audio/data/sfx.json)이 있으면 각 줄 옆에 보여 준다 — 없어도 Lab은 그대로 동작
    fetch('audio/data/sfx.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if(!d) return;
      measured = {}; d.variants.forEach(v => { if(!v.silent) measured[v.id] = v; });
      root.querySelectorAll('.lab-row[data-name]').forEach(r => { const m = r.querySelector('[data-lab="meta"]'); if(m && !m.textContent) m.textContent = metaText(r.dataset.name); });
    }).catch(() => {});
    window.__soundLab = { notes: () => notes, scenes: SCENES, events: id => SCENES.find(s => s.id === id).ev(), export: exportNotes };
  }
  return { mount, chVol: null };
})();
