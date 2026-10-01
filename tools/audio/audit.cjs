#!/usr/bin/env node
/* 사운드 감사 — 효과음(SFX)·배경음악(BGM)을 OfflineAudioContext로 렌더해 숫자로 잰다. 게임 파일은 읽기만 하고 바꾸지 않는다.
     node tools/audio/audit.cjs [--sfx] [--bgm] [--quick] [--out docs/audio/data]
   · --sfx  Sound.SFX 전 종류(기본 옵션) + 대표 옵션(등급·크게·스택·단계) + 음높이 사다리 12단 → sfx.json
   · --bgm  곡·채널(레이어)별 레벨, 루프 이음매, 큰 효과음 직후 BGM 눌림 → bgm.json
   · 둘 다 없으면 둘 다. --quick = BGM 렌더를 짧게 (개발 중 점검용 — 보고서 수치는 quick 없이)
   결과 해석 · 가설별 판정은 docs/audio/AUDIT.md. 소리의 좋고 나쁨은 판정하지 않는다 (귀로 판단 → Sound Lab). */
const fs = require('fs');
const path = require('path');
const L = require('./lib.cjs');
const o = L.argv({ out: 'docs/audio/data', sfx: false, bgm: false, quick: false });
if(!o.sfx && !o.bgm){ o.sfx = true; o.bgm = true; }
const OUT = path.resolve(__dirname, '../..', o.out);
fs.mkdirSync(OUT, { recursive: true });

const r1 = x => L.round(x, 1), r2 = x => L.round(x, 2);
const pick = (m, keys) => { const out = {}; keys.forEach(k => { if(m[k] !== undefined) out[k] = typeof m[k] === 'number' ? r2(m[k]) : m[k]; }); return out; };
const METRIC_KEYS = ['peakDb', 'rmsDb', 'crestDb', 'loudA', 'durS', 'centroid', 'hiRatio', 'band24', 'loRatio', 'peakPreDb', 'rmsPreDb', 'over'];

async function main(){
  const browser = await L.chromium().launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let page = await L.audioPage(browser);
  const fresh = async () => { await page.close(); page = await L.audioPage(browser); return page; };
  const t0 = Date.now();

  const calib = await page.evaluate(() => AudioAudit.calibrate());
  console.log('컴프레서 정적 곡선 (1kHz 사인, 컴프레서 입력 기준):');
  calib.rows.forEach(r => console.log(`  입력 ${String(r.inPeakDb).padStart(4)} dBFS 피크 → 게인 ${r1(r.gainDb)} dB`));
  console.log(`  메이크업(작은 소리 게인) = +${r1(calib.makeupDb)} dB`);

  if(o.sfx){
    const variants = await page.evaluate(() => soundVariants());
    const rows = [];
    for(const v of variants){
      const m = await page.evaluate(([name, opts]) => AudioAudit.measureSfx(name, opts, 7), [v.name, v.opts]);
      rows.push(Object.assign({ id: v.id, name: v.name, label: v.label, kind: v.kind, category: await page.evaluate(n => soundCategoryOf(n), v.name), pitchStep: v.pitchStep }, m.silent || m.missing ? { silent: true } : pick(m, METRIC_KEYS)));
    }
    const src = await page.evaluate(() => Object.fromEntries(Object.keys(Sound.SFX).map(n => [n, Sound.SFX[n].toString()])));
    rows.forEach(r => { if(r.kind === 'default'){ r.usesRandom = /Math\.random/.test(src[r.name]); r.usesNoise = /\bnoise\(/.test(src[r.name]); } });   // 소리 함수가 난수를 직접 쓰는가 / 노이즈 부품(시작 위치가 매번 무작위)을 쓰는가
    const defaults = rows.filter(r => r.kind === 'default' && !r.silent);
    const cats = {};
    defaults.forEach(r => { (cats[r.category] || (cats[r.category] = [])).push(r); });
    const catStats = {};
    Object.keys(cats).forEach(c => {
      const a = cats[c], mean = k => a.reduce((s, r) => s + r[k], 0) / a.length;
      catStats[c] = { n: a.length, rmsDb: r1(mean('rmsDb')), loudA: r1(mean('loudA')), peakDb: r1(mean('peakDb')) };
    });
    defaults.forEach(r => {
      const c = catStats[r.category];
      r.dRms = r1(r.rmsDb - c.rmsDb); r.dLoudA = r1(r.loudA - c.loudA);
      r.flagLevel = Math.abs(r.dRms) > 6;          // 카테고리 평균에서 ±6dB 벗어남 (활성 RMS 기준)
      r.flagLevelA = Math.abs(r.dLoudA) > 6;       //                              (A가중 기준)
      r.flagHigh = r.hiRatio >= 0.6;               // 고음(2kHz↑) 비중 60% 이상 — '고빈도'와의 교집합은 report.cjs가 freq.json과 합쳐 판정
    });
    const silent = rows.filter(r => r.silent).map(r => r.id);
    const uncategorized = [...new Set(rows.filter(r => r.category === 'uncategorized').map(r => r.name))];
    fs.writeFileSync(path.join(OUT, 'sfx.json'), JSON.stringify({ sr: 44100, volumeSetting: 0.5, calibration: calib, categories: catStats, silent, uncategorized, variants: rows }, null, 1));
    console.log(`SFX ${rows.length}개 변형 측정 (기본 ${defaults.length}종) → ${path.join(o.out, 'sfx.json')}${silent.length ? ' · 무음: ' + silent.join(',') : ''}${uncategorized.length ? ' · 카테고리 없음: ' + uncategorized.join(',') : ''}`);
  }

  if(o.bgm){
    const meta = await page.evaluate(() => Object.keys(Music.SONGS).map(name => { const s = Music.SONGS[name]; return { name, loop: s.loop !== false, bpm: s.bpm, key: s.key, adaptive: !!s.adaptive, layers: Object.keys(s.layers || {}), bars: Music.barsOf(name), seconds: AudioAudit.loopSeconds(name) }; }));
    const A = (from, secs) => Math.round(from * 44100);
    const songs = {};
    for(const s of meta){
      const entry = { loop: s.loop, bpm: s.bpm, key: s.key, adaptive: s.adaptive, bars: s.bars, seconds: r1(s.seconds) };
      await fresh();
      if(s.loop){
        const secs = o.quick ? Math.min(s.seconds + 3, 25) : s.seconds + 0.06 + 2.5;
        const full = await page.evaluate(async ([name, secs]) => {
          const pre = await AudioAudit.renderBgm({ song: name, seconds: secs, bypass: true }), post = await AudioAudit.renderBgm({ song: name, seconds: secs });
          const SR = AudioAudit.SR, from = Math.round(SR * 1.5);   // 처음 1초는 트랙 페이드 인
          const a = AudioAudit.analyze(post, SR, from), b = AudioAudit.analyze(pre, SR, from);
          const tB = 0.06 + AudioAudit.loopSeconds(name), sg = Music.SONGS[name], barS = sg.beatsPerBar * 60 / sg.bpm;
          return { a, b, seam: tB + 1 < secs ? AudioAudit.seamCheck(post, tB, barS, Music.barsOf(name)) : null };
        }, [s.name, secs]);
        entry.full = Object.assign(pick(full.a, METRIC_KEYS), { peakPreDb: r2(full.b.peakDb), rmsPreDb: r2(full.b.rmsDb) });
        if(full.seam) entry.seam = pick(full.seam, ['jumpDb', 'beforeDb', 'afterDb', 'innerMedianDb', 'innerP95Db', 'innerMaxDb', 'flag']);
        // 채널(레이어)별 단독 레벨
        const chans = ['p1', 'p2', 'tri', 'noise'];
        entry.channels = {};
        for(const ch of chans){
          await fresh();
          const secs2 = Math.min(s.seconds + 1.5, o.quick ? 14 : 40);
          const m = await page.evaluate(async ([name, solo, secs2]) => AudioAudit.analyze(await AudioAudit.renderBgm({ song: name, seconds: secs2, solo: [solo] }), AudioAudit.SR, Math.round(AudioAudit.SR * 1.5)), [s.name, ch, secs2]);
          entry.channels[ch] = m.silent ? { silent: true } : pick(m, METRIC_KEYS);
        }
        // 적응형 곡(market): 장세·위험·금감원·JACKPOT 레이어를 켰을 때
        if(s.adaptive){
          entry.moods = {};
          const MOODS = { NORMAL: {}, BULL: { state: 'BULL' }, BEAR: { state: 'BEAR' }, VOLATILE: { state: 'VOLATILE' }, danger: { danger: true }, fss: { fss: true }, jackpot: { jackpot: true }, '마감 임박(tempo +12%)': { progress: 1 } };
          for(const k of Object.keys(MOODS)){
            await fresh();
            const secs3 = o.quick ? 14 : 24;
            const m = await page.evaluate(async ([name, mood, secs3]) => AudioAudit.analyze(await AudioAudit.renderBgm({ song: name, seconds: secs3, mood }), AudioAudit.SR, Math.round(AudioAudit.SR * 1.5)), [s.name, MOODS[k], secs3]);
            entry.moods[k] = m.silent ? { silent: true } : pick(m, METRIC_KEYS);
          }
          // JACKPOT 레이어만 / 킬러: lead2·ring
          entry.layerSolo = {};
          for(const [lbl, solo, mood] of [['lead2(BULL 옥타브 위)', ['lead2'], { state: 'BULL' }], ['ring(금감원 전화벨)', ['ring'], { fss: true }], ['jackpot 패드·금관', ['jackpot'], { jackpot: true }]]){
            await fresh();
            const secs4 = o.quick ? 14 : 24;
            const m = await page.evaluate(async ([name, solo, mood, secs4]) => AudioAudit.analyze(await AudioAudit.renderBgm({ song: name, seconds: secs4, mood, solo }), AudioAudit.SR, Math.round(AudioAudit.SR * 1.5)), [s.name, solo, mood, secs4]);
            entry.layerSolo[lbl] = m.silent ? { silent: true } : pick(m, METRIC_KEYS);
          }
        }
      } else {   // 스팅어
        const secs = s.seconds + 1.5;
        const m = await page.evaluate(async ([name, secs]) => {
          const post = await AudioAudit.renderBgm({ song: name, loop: false, seconds: secs }), pre = await AudioAudit.renderBgm({ song: name, loop: false, seconds: secs, bypass: true });
          const a = AudioAudit.analyze(post, AudioAudit.SR), b = AudioAudit.analyze(pre, AudioAudit.SR);
          return Object.assign({}, a, { peakPreDb: b.peakDb, rmsPreDb: b.rmsDb });
        }, [s.name, secs]);
        entry.full = m.silent ? { silent: true } : pick(m, METRIC_KEYS);
      }
      songs[s.name] = entry;
      console.log(`BGM ${s.name}${s.loop ? '' : ' (스팅어)'} 측정 완료 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }

    // 큰 효과음 직후 BGM 눌림 (market 곡, 장중 평상 상태 · 정산 무대 덕킹 0.25 유무)
    const BIG = [['bestBoom', {}], ['bankrupt', {}], ['victory', {}], ['jackpot', {}], ['marginCall', {}], ['stampWin', {}], ['multSlam', {}], ['settleMult', { big: true }],
                 ['packBurst', { rarity: 'mythic' }], ['choir', {}], ['crashDown', {}], ['cashRegister', {}], ['sellWin', {}], ['cardPlay', {}]];
    const song = 'market', secs = o.quick ? 14 : 20, atS = o.quick ? 7 : 8;
    await fresh();
    const base = await page.evaluate(([song, secs, atS, makeupDb]) => AudioAudit.afterSfx({ song, seconds: secs, atS, makeupDb, sfx: null }), [song, secs, atS, calib.makeupDb]);
    const after = [];
    for(const [name, opts] of BIG){
      for(const duck of [null, 0.25]){
        await fresh();
        const m = await page.evaluate(([song, secs, atS, makeupDb, name, opts, duck]) => AudioAudit.afterSfx({ song, seconds: secs, atS, makeupDb, sfx: { name, opts }, duck }), [song, secs, atS, calib.makeupDb, name, opts, duck]);
        after.push({ sfx: name + (opts.big ? '(big)' : opts.rarity ? '(' + opts.rarity + ')' : ''), duck: duck || 0, baselineGrDb: r2(m.baselineGrDb), peakGrDb: r2(m.peakGrDb), deltaGrDb: r2(m.deltaGrDb), recoverS: m.recoverS === null ? null : r2(m.recoverS), bgmPostRmsDb: r2(m.bgmPostRmsDb) });
      }
      console.log(`  큰 효과음 직후 BGM 눌림: ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    fs.writeFileSync(path.join(OUT, 'bgm.json'), JSON.stringify({ sr: 44100, bgmVolumeSetting: 0.4, sfxVolumeSetting: 0.5, calibration: { makeupDb: calib.makeupDb }, songs, afterSfx: { song, atS, bgmOnly: { baselineGrDb: r2(base.baselineGrDb), p95GrDb: r2(base.p95GrDb) }, rows: after } }, null, 1));
    console.log('BGM → ' + path.join(o.out, 'bgm.json'));
  }

  if(page.errs.length) console.log('페이지 에러:', page.errs.slice(0, 5));
  await browser.close();
  console.log(`끝 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
main().catch(e => { console.error(e); process.exit(1); });
