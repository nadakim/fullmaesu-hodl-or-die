#!/usr/bin/env node
/* 측정 JSON(docs/audio/data/sfx.json · bgm.json · freq.json)을 합쳐 docs/audio/AUDIT.md의 표 구역을 다시 쓴다.
     node tools/audio/report.cjs
   AUDIT.md 안의 <!-- TABLES:START --> ~ <!-- TABLES:END --> 사이만 바꾼다 (가설 판정 같은 손으로 쓴 부분은 그대로).
   '고빈도' 기준 = 분당 HIGH_FREQ_PER_MIN번 이상. '고음' = 2kHz 이상 에너지 60% 이상. 소리의 좋고 나쁨은 판정하지 않는다. */
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '../../docs/audio');
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'data', f), 'utf8')); } catch(e) { return null; } };
const sfx = read('sfx.json'), bgm = read('bgm.json'), freq = read('freq.json');
if(!sfx){ console.error('sfx.json 없음 — node tools/audio/audit.cjs 먼저'); process.exit(1); }

const HIGH_FREQ_PER_MIN = 5, HIGH_BAND = 0.6, LOW_CENTROID = 120, LONG_S = 0.9;
const f1 = x => (x === undefined || x === null || !Number.isFinite(x) ? '–' : x.toFixed(1));
const f0 = x => (x === undefined || x === null || !Number.isFinite(x) ? '–' : Math.round(x));
const pc = x => (x === undefined || x === null ? '–' : Math.round(x * 100) + '%');
const hz = x => (x >= 1000 ? (x / 1000).toFixed(1) + 'k' : String(Math.round(x)));
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'].concat(rows.map(r => '| ' + r.join(' | ') + ' |')).join('\n');
const CAT = { ui: 'UI', feedback: '피드백', settle: '정산', alarm: '경보', sting: '스팅어', ambient: '앰비언트' };
const ORDER = ['ui', 'feedback', 'settle', 'alarm', 'sting', 'ambient'];

const out = [];
const perMin = {}; if(freq) freq.all.top.forEach(r => { perMin[r.name] = r.perMin; });
const defaults = sfx.variants.filter(v => v.kind === 'default' && !v.silent);
const byName = {}; defaults.forEach(v => { byName[v.name] = v; });

/* ── 1. 컴프레서 ── */
out.push('### 컴프레서 정적 곡선 (게임 설정: threshold -20 · knee 6 · ratio 8, 1kHz 사인을 컴프레서에 직접 넣어 잼)\n');
out.push(table(['입력 피크 (dBFS)', '압축 없이 (RMS dB)', '게임 컴프레서 (RMS dB)', '게인 (dB)'],
  sfx.calibration.rows.map(r => [String(r.inPeakDb), f1(r.preRmsDb), f1(r.postRmsDb), (r.gainDb >= 0 ? '+' : '') + f1(r.gainDb)])));
out.push(`\n작은 소리(-20 dBFS 이하)는 **+${f1(sfx.calibration.makeupDb)} dB** 올라가고(Chrome 컴프레서의 자동 메이크업 게인), 입력이 0 dBFS에 가까울수록 그 이득이 깎인다. 아래 모든 'post' 수치는 이 컴프레서를 통과한 값(=귀에 가는 값)이다.\n`);
const KNEE_START = -23;   // threshold -20, knee 6 → 압축은 -23 dBFS(컴프레서 입력 피크)부터 시작
const overKnee = defaults.filter(v => v.peakPreDb > KNEE_START).sort((a, b) => b.peakPreDb - a.peakPreDb);
out.push(`컴프레서 입력 피크가 압축 시작선(${KNEE_START} dBFS)을 넘는 기본 소리는 **${overKnee.length}/${defaults.length}종**: ${overKnee.map(v => '`' + v.name + '` ' + f1(v.peakPreDb)).join(' · ')}. 나머지 ${defaults.length - overKnee.length}종은 압축 없이 메이크업 +${f1(sfx.calibration.makeupDb)} dB만 받는다.\n`);

/* ── 2. SFX 표 (카테고리별) ── */
out.push('### 효과음 전체 (기본 옵션, 설정 효과음 볼륨 50%)\n');
out.push('컬럼: 길이(-60dBFS 이상 구간) · 피크 후/전 = 컴프레서 통과 후/전 · RMS = 활성 구간 · crest = 피크-RMS · A가중 = A가중 보정 RMS · 중심 = 스펙트럼 중심(Hz) · 고음 = 2kHz↑ 에너지 · 저음 = 150Hz↓ 에너지 · 분당 = 봇 판에서 실제 재생 횟수/분.\n');
out.push('플래그: **L±** 카테고리 평균에서 RMS ±6dB 밖 · **H** 고음 60%↑ · **H+F** 고음 60%↑이면서 분당 ' + HIGH_FREQ_PER_MIN + '회↑ · **lo** 중심 ' + LOW_CENTROID + 'Hz 미만이거나 저음 50%↑ (노트북·휴대폰 스피커가 거의 못 내는 대역).\n');
ORDER.forEach(c => {
  const rows = defaults.filter(v => v.category === c).sort((a, b) => b.rmsDb - a.rmsDb);
  if(!rows.length) return;
  const cs = sfx.categories[c];
  out.push(`**${CAT[c]}** (${rows.length}종, 평균 RMS ${f1(cs.rmsDb)} dB · A가중 ${f1(cs.loudA)} dB · 피크 ${f1(cs.peakDb)} dB)\n`);
  out.push(table(['소리', '길이 s', '피크 후 dB', '피크 전 dB', 'RMS dB', 'crest', 'A가중', '중심 Hz', '고음', '저음', '분당', '플래그'],
    rows.map(v => {
      const fl = [];
      if(v.flagLevel) fl.push('L' + (v.dRms > 0 ? '+' : '-') + Math.abs(v.dRms));
      if(v.flagHigh) fl.push(perMin[v.name] >= HIGH_FREQ_PER_MIN ? 'H+F' : 'H');
      if(v.centroid < LOW_CENTROID || v.loRatio >= 0.5) fl.push('lo');
      return ['`' + v.name + '`', f1(v.durS), f1(v.peakDb), f1(v.peakPreDb), f1(v.rmsDb), f1(v.crestDb), f1(v.loudA), hz(v.centroid), pc(v.hiRatio), pc(v.loRatio), perMin[v.name] === undefined ? '–' : f1(perMin[v.name]), fl.join(' ')];
    })));
  out.push('');
});

/* ── 3. 카테고리 간 격차 / 극단 ── */
const rmsList = defaults.map(v => v.rmsDb), maxR = Math.max(...rmsList), minR = Math.min(...rmsList);
const loudest = defaults.slice().sort((a, b) => b.rmsDb - a.rmsDb).slice(0, 6), quietest = defaults.slice().sort((a, b) => a.rmsDb - b.rmsDb).slice(0, 6);
out.push('### 음량 격차\n');
out.push(`기본 옵션 ${defaults.length}종의 활성 RMS는 **${f1(minR)} ~ ${f1(maxR)} dB (격차 ${f1(maxR - minR)} dB)**. 가장 큰 쪽 ${loudest.map(v => '`' + v.name + '` ' + f1(v.rmsDb)).join(' · ')} / 가장 작은 쪽 ${quietest.map(v => '`' + v.name + '` ' + f1(v.rmsDb)).join(' · ')}.`);
const catMeans = ORDER.filter(c => sfx.categories[c]).map(c => sfx.categories[c].rmsDb);
out.push(`카테고리 평균 RMS는 ${ORDER.filter(c => sfx.categories[c]).map(c => CAT[c] + ' ' + f1(sfx.categories[c].rmsDb)).join(' · ')} dB (최대-최소 ${f1(Math.max(...catMeans) - Math.min(...catMeans))} dB).`);
const lvl = defaults.filter(v => v.flagLevel);
out.push(`카테고리 평균에서 ±6dB를 벗어난 소리: ${lvl.length}종 — ${lvl.map(v => '`' + v.name + '` ' + (v.dRms > 0 ? '+' : '') + v.dRms).join(' · ') || '없음'}.`);
const lowS = defaults.filter(v => v.centroid < LOW_CENTROID || v.loRatio >= 0.5);
out.push(`스펙트럼이 150Hz 아래에 쏠린 소리(\`lo\`): ${lowS.length}종 — ${lowS.map(v => '`' + v.name + '` 중심 ' + hz(v.centroid) + 'Hz·저음 ' + pc(v.loRatio)).join(' · ') || '없음'}.`);
const clip = sfx.variants.filter(v => !v.silent && v.peakDb > -0.1);
out.push(`컴프레서 통과 후 피크가 0 dBFS에 닿거나 넘는 변형: ${clip.length ? clip.map(v => v.id + ' ' + f1(v.peakDb)).join(' · ') : '없음 (전체 변형 중 최대 ' + f1(Math.max(...sfx.variants.filter(v => !v.silent).map(v => v.peakDb))) + ' dBFS)'}.\n`);

/* ── 4. 옵션·사다리 ── */
out.push('### 옵션 변형 (등급·크게·스택·단계)\n');
out.push(table(['소리', '옵션', '길이 s', '피크 후', 'RMS', '중심 Hz', '고음'],
  sfx.variants.filter(v => v.kind === 'option' && !v.silent).map(v => ['`' + v.name + '`', v.label, f1(v.durS), f1(v.peakDb), f1(v.rmsDb), hz(v.centroid), pc(v.hiRatio)])));
out.push('\n### 음높이 사다리 (5음계 12단: +0 2 4 7 9 12 14 16 19 21 24 26 반음) — 단계별 스펙트럼 중심 / 고음 비율 / RMS\n');
const ladderNames = [...new Set(sfx.variants.filter(v => v.kind === 'ladder').map(v => v.name))];
out.push(table(['소리', '1단', '5단', '6단', '10단', '11단', '12단', '12단 피크 후', '12단 고음'],
  ladderNames.map(n => {
    const at = i => sfx.variants.find(v => v.kind === 'ladder' && v.name === n && v.pitchStep === i);
    const cell = i => { const v = at(i); return !v || v.silent ? '–' : `${hz(v.centroid)}Hz·${f1(v.rmsDb)}dB`; };
    const l = at(11);
    return ['`' + n + '`', cell(0), cell(4), cell(5), cell(9), cell(10), cell(11), l && !l.silent ? f1(l.peakDb) : '–', l && !l.silent ? pc(l.hiRatio) : '–'];
  })));
const tickRows = sfx.variants.filter(v => v.name === 'tick' && !v.silent);
if(tickRows.length > 1){
  out.push('\n### `tick` — 호출 쪽이 주는 음높이(반음)에 따른 변화 (게임: `Sound.semis(streak.dir × min(12, streak.n))`)\n');
  out.push(table(['변형', '중심 Hz', '고음', 'RMS dB'], tickRows.map(v => [v.label, hz(v.centroid), pc(v.hiRatio), f1(v.rmsDb)])));
}
out.push('');

/* ── 5. 재생 빈도 ── */
if(freq){
  const A = freq.all;
  out.push('### 재생 빈도 (봇 판 ' + A.games + '개, 가상 ' + A.minutes + '분, 소리 ' + A.total + '번)\n');
  out.push('설정: 연출 보통 · 장중 1배속 · BGM 끔(스팅어 대신 효과음 경로) · 온보딩 전부 해금 · 정산 무대·결산 체인 스킵 안 함. ' + freq.note + '\n');
  out.push(table(['전략', '판', '결과', '주 통과', '가상 분', '소리 수', 'merged', 'stolen', '동시 발음 최대'],
    freq.games.map(g => [g.strat + ':' + g.seed, '1', g.ended ? g.endCause : '중단(' + g.capped + ')', String(g.weeksCleared), f1(g.minutes), String(g.events), String(g.merged), String(g.stolen), String(g.peakVoices)])));
  out.push('\n**이름별 분당 상위 15**\n');
  out.push(table(['순위', '소리', '카테고리', '총 횟수', '분당', '고음', '전체 중 비율'],
    A.top.slice(0, 15).map((r, i) => [String(i + 1), '`' + r.name + '`', byName[r.name] ? CAT[byName[r.name].category] : '–', String(r.count), f1(r.perMin), byName[r.name] ? pc(byName[r.name].hiRatio) : '–', pc(r.count / A.total)])));
  const hiShare = A.top.filter(r => byName[r.name] && byName[r.name].hiRatio >= HIGH_BAND).reduce((s, r) => s + r.count, 0) / A.total;
  const hiFreq = A.top.filter(r => byName[r.name] && byName[r.name].hiRatio >= HIGH_BAND && r.perMin >= HIGH_FREQ_PER_MIN);
  out.push(`\n고음(2kHz↑ 60%↑) 소리가 전체 재생 횟수의 **${pc(hiShare)}**. 고음+고빈도(분당 ${HIGH_FREQ_PER_MIN}회↑) 소리: ${hiFreq.map(r => '`' + r.name + '` ' + f1(r.perMin) + '/분').join(' · ') || '없음'}.\n`);
  out.push('**전략별 분당 상위 5**\n');
  out.push(table(['전략', '가상 분', '소리 수', '분당 합계', '상위 5 (분당)'],
    Object.keys(freq.byStrategy).map(k => { const s = freq.byStrategy[k]; return [k, f1(s.minutes), String(s.total), f1(s.total / s.minutes), s.top.slice(0, 5).map(r => r.name + ' ' + f1(r.perMin)).join(' · ')]; })));
  out.push('\n**발음 정리 (audio.js: 합치기 30ms · 최대 8개 · 가장 오래된 소리부터 끊기)**\n');
  const sb = Object.keys(A.stolenBy).map(k => ({ name: k, n: A.stolenBy[k], dur: byName[k] ? byName[k].durS : null, cat: byName[k] ? CAT[byName[k].category] : '–', per: A.counts[k] })).sort((a, b) => b.n - a.n);
  out.push(`합계: merged ${A.merged}회(전체의 ${pc(A.merged / A.total)}) · stolen ${A.stolen}회(${pc(A.stolen / A.total)}) · 동시 발음 최대 ${A.peakVoices} (한도 8).\n`);
  out.push(sb.length ? table(['끊긴 소리', '끊긴 횟수', '그 소리 총 재생', '길이 s', '카테고리'], sb.map(r => ['`' + r.name + '`', String(r.n), String(r.per), r.dur === null ? '–' : f1(r.dur), r.cat])) : '끊긴 소리 없음');
  const longStolen = sb.filter(r => r.dur !== null && r.dur >= LONG_S);
  out.push(`\n길이 ${LONG_S}s 이상인 소리가 끊긴 횟수: **${longStolen.reduce((s, r) => s + r.n, 0)} / ${A.stolen}** (${longStolen.map(r => r.name + ' ' + r.n).join(' · ') || '없음'}).`);
  const LONG_MID = 0.3, isLong = n => byName[n] && byName[n].durS >= LONG_MID;
  const playLong = Object.keys(A.counts).filter(isLong).reduce((s, k) => s + A.counts[k], 0), stealLong = Object.keys(A.stolenBy).filter(isLong).reduce((s, k) => s + A.stolenBy[k], 0);
  out.push(`길이 ${LONG_MID}s 이상인 소리는 전체 재생의 **${pc(playLong / A.total)}**인데 끊긴 것의 **${pc(stealLong / A.stolen)}** (${stealLong}/${A.stolen}) — 긴 소리일수록 8개 한도 안에 오래 남아 '가장 오래된 소리'가 되기 쉽다는 뜻이다.`);
  const endSounds = ['bestBoom', 'bankrupt', 'victory', 'jackpot', 'weekFail', 'weekClear'];
  out.push(`가설에서 걱정한 긴 소리의 재생/끊김: ${endSounds.map(n => '`' + n + '` ' + (A.counts[n] || 0) + '번 중 ' + (A.stolenBy[n] || 0) + '번 끊김').join(' · ')}.`);
  const BOT_FAST = { cardPlay: '봇이 한 프레임에 연달아 부름 (사람 클릭 간격은 훨씬 넓음)', shopShuffle: '봇이 새로고침을 연달아 부름', };
  out.push('\n**합쳐진 소리 (같은 이름이 30ms 안에 또 오면 새 음을 울리지 않고 앞 음 볼륨만 ×1.2)** — 사다리 소리에서 합쳐지면 새 음높이가 사라진다\n');
  const mb = Object.keys(A.mergedBy).map(k => ({ name: k, n: A.mergedBy[k], lost: (A.lostBy && A.lostBy[k]) || 0, total: A.counts[k] })).sort((a, b) => b.n - a.n);
  out.push(table(['합쳐진 소리', '합쳐진 횟수', '그 소리 총 재생', '비율', '그중 음높이·옵션이 달라 새 음이 사라진 수', '원인'],
    mb.map(r => ['`' + r.name + '`', String(r.n), String(r.total), pc(r.n / r.total), String(r.lost), BOT_FAST[r.name] || '게임 연출이 같은 틱에 연달아 부름'])));
  const real = mb.filter(r => !BOT_FAST[r.name]), lostAll = mb.reduce((s, r) => s + r.lost, 0);
  out.push(`\n봇 속도 탓(cardPlay·shopShuffle)을 빼면 합쳐진 호출은 ${real.reduce((s, r) => s + r.n, 0)}회, 음높이·옵션이 달라 새 음이 사라진 것 ${lostAll}회 (${mb.filter(r => r.lost).map(r => r.name + ' ' + r.lost).join(' · ')}).\n`);
  out.push('**호출 다양성 — 분당 상위 15 (같은 이름+옵션 호출이 얼마나 반복되는가)**\n');
  out.push(table(['소리', '재생', '서로 다른 호출(옵션 조합)', '가장 흔한 호출의 비율', '합성에 난수', '노이즈 부품'],
    A.top.slice(0, 15).map(r => { const v = A.variety[r.name], b = byName[r.name]; return ['`' + r.name + '`', String(v.n), String(v.distinct), pc(v.topShare), b && b.usesRandom ? '예' : '아니오', b && b.usesNoise ? '예 (시작 위치 무작위)' : '아니오']; })));
  const same = A.top.filter(r => r.perMin >= HIGH_FREQ_PER_MIN && A.variety[r.name].topShare >= 0.9 && !(byName[r.name] && (byName[r.name].usesRandom)));
  out.push(`\n분당 ${HIGH_FREQ_PER_MIN}회 이상 재생되는데 90%↑가 같은 호출이고 합성에 난수도 없는 소리: ${same.map(r => '`' + r.name + '` ' + f1(r.perMin) + '/분 (동일 ' + pc(A.variety[r.name].topShare) + (byName[r.name].usesNoise ? ', 노이즈 시작 위치만 변함' : ', 완전 동일') + ')').join(' · ') || '없음'}.`);
  const b24 = A.top.filter(r => byName[r.name] && byName[r.name].band24 >= 0.4 && r.perMin >= HIGH_FREQ_PER_MIN);
  out.push(`2~4kHz 에너지 40%↑이면서 분당 ${HIGH_FREQ_PER_MIN}회↑: ${b24.map(r => '`' + r.name + '` ' + pc(byName[r.name].band24) + '·' + f1(r.perMin) + '/분').join(' · ') || '없음'}.`);
  /* 합치기 대상 */
  out.push('');
}

/* ── 6. BGM ── */
if(bgm){
  out.push('### BGM — 곡 전체 (설정 BGM 볼륨 40%, 효과음 볼륨 50%, 같은 컴프레서 통과)\n');
  const rowsB = Object.keys(bgm.songs).map(n => { const s = bgm.songs[n]; const m = s.full || {}; return ['`' + n + '`', s.loop ? '루프' : '스팅어', s.bpm + ' bpm', f1(s.seconds), f1(m.peakDb), f1(m.rmsDb), f1(m.loudA), f1(m.crestDb), hz(m.centroid || 0), pc(m.loRatio), s.seam ? `${f1(s.seam.jumpDb)} / ${f1(s.seam.innerMaxDb)} ${s.seam.flag ? '⚠' : 'ok'}` : '–']; });
  out.push(table(['곡', '종류', '템포', '길이 s', '피크 후 dB', 'RMS dB', 'A가중', 'crest', '중심 Hz', '저음', '이음매 낙차 / 다른 마디 경계 최대 dB'], rowsB));
  const sfxAvg = Object.fromEntries(ORDER.filter(c => sfx.categories[c]).map(c => [c, sfx.categories[c].rmsDb]));
  const loops = Object.keys(bgm.songs).filter(n => bgm.songs[n].loop && bgm.songs[n].full && !bgm.songs[n].full.silent);
  const bgmAvg = loops.reduce((s, n) => s + bgm.songs[n].full.rmsDb, 0) / loops.length;
  out.push(`\n루프 곡 평균 RMS **${f1(bgmAvg)} dB** vs 효과음 카테고리 평균 ${ORDER.filter(c => sfxAvg[c] !== undefined).map(c => CAT[c] + ' ' + f1(sfxAvg[c])).join(' · ')} → BGM − 효과음 평균: ${ORDER.filter(c => sfxAvg[c] !== undefined).map(c => CAT[c] + ' ' + (bgmAvg - sfxAvg[c] >= 0 ? '+' : '') + f1(bgmAvg - sfxAvg[c])).join(' · ')} dB. (BGM은 계속 깔리는 소리, 효과음은 짧은 순간 소리라 RMS 비교는 거친 지표.)\n`);
  out.push('**채널(레이어) 단독 레벨** — RMS dB (post)\n');
  const chRows = Object.keys(bgm.songs).filter(n => bgm.songs[n].channels).map(n => { const c = bgm.songs[n].channels; const g = k => (c[k] && !c[k].silent ? f1(c[k].rmsDb) : '무음'); return ['`' + n + '`', g('p1'), g('p2'), g('tri'), g('noise'), f1(bgm.songs[n].full.rmsDb)]; });
  out.push(table(['곡', 'p1 멜로디', 'p2 화음', 'tri 베이스', 'noise 드럼', '전체'], chRows));
  const bal = Object.keys(bgm.songs).filter(n => bgm.songs[n].channels && bgm.songs[n].channels.tri && !bgm.songs[n].channels.tri.silent && !bgm.songs[n].channels.p1.silent).map(n => ({ n, d: bgm.songs[n].channels.tri.rmsDb - bgm.songs[n].channels.p1.rmsDb }));
  out.push(`\n베이스(tri)가 멜로디(p1)보다 큰 정도: ${bal.map(b => '`' + b.n + '` +' + f1(b.d)).join(' · ')} dB. 루프 곡 전체 에너지의 150Hz 아래 비중: ${Object.keys(bgm.songs).filter(n => bgm.songs[n].loop).map(n => '`' + n + '` ' + pc(bgm.songs[n].full.loRatio)).join(' · ')}.`);
  const mk = bgm.songs.market;
  if(mk && mk.moods){
    out.push('\n**market 적응형 — 상황별 전체 RMS dB / 레이어 단독**\n');
    out.push(table(['상황', 'RMS dB', '피크 후 dB', '중심 Hz'], Object.keys(mk.moods).map(k => { const m = mk.moods[k]; return [k, f1(m.rmsDb), f1(m.peakDb), hz(m.centroid || 0)]; })
      .concat(Object.keys(mk.layerSolo).map(k => { const m = mk.layerSolo[k]; return ['레이어 단독: ' + k, m.silent ? '무음' : f1(m.rmsDb), m.silent ? '–' : f1(m.peakDb), m.silent ? '–' : hz(m.centroid)]; }))));
  }
  const DUCKED = { bestBoom: '정산 무대 덕킹 0.25', settleMult: '정산 무대 덕킹 0.25', stampWin: '결산 체인 덕킹 0.2', multSlam: '없음', jackpot: '없음', marginCall: '없음', bankrupt: '스팅어 덕킹 0.3(BGM 켜짐이면 스팅어 곡)', victory: '스팅어 덕킹 0.3(BGM 켜짐이면 스팅어 곡)' };
  out.push('\n### 큰 효과음 직후 BGM 눌림 (market 곡 위에 효과음을 얹고, 컴프레서가 전체 믹스를 몇 dB 눌렀나)\n');
  out.push(`BGM만 있을 때 컴프레서 눌림 기준선: 중앙값 ${f1(bgm.afterSfx.bgmOnly.baselineGrDb)} dB · 95% ${f1(bgm.afterSfx.bgmOnly.p95GrDb)} dB. 눌림 = 압축 없이 렌더한 쌍과 비교한 게인 감소(+는 BGM이 그만큼 작아짐). 덕킹 열은 게임이 그 소리 때 실제로 거는 BGM 덕킹(참고).\n`);
  const seen = {};
  out.push(table(['효과음', '눌림 dB', '회복 s', 'BGM 덕킹 (게임)'], bgm.afterSfx.rows.filter(r => r.duck === 0).map(r => [r.sfx, f1(r.deltaGrDb), r.recoverS === null ? '–' : f1(r.recoverS), DUCKED[r.sfx.replace(/\(.*\)/, '')] || '없음'])));
}

const md = out.join('\n');
const file = path.join(DIR, 'AUDIT.md');
const A0 = '<!-- TABLES:START (tools/audio/report.cjs가 다시 쓴다 — 손으로 고치지 말 것) -->', A1 = '<!-- TABLES:END -->';
let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# 사운드 감사\n\n${A0}\n${A1}\n`;
if(doc.indexOf(A0.slice(0, 20)) < 0) doc += `\n${A0}\n${A1}\n`;
const i0 = doc.indexOf('<!-- TABLES:START'), i1 = doc.indexOf(A1);
doc = doc.slice(0, i0) + A0 + '\n\n' + md + '\n\n' + doc.slice(i1);
fs.writeFileSync(file, doc);
console.log('AUDIT.md 표 구역 갱신 (' + md.split('\n').length + '줄)');
