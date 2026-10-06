// 필름스트립 픽셀 비교: node tools/motion/diff.cjs <기준 폴더> <비교 폴더> [--alt 기준 재촬영 폴더] [--alt-b 비교 재촬영 폴더] [--md 표.md] [--diffdir 차이이미지폴더] [--chan 2] [--pct 0.05]
// 프레임마다 RGB 채널 차이가 chan을 넘는 픽셀 수를 센다. 다른 픽셀 비율 ≤ pct(%)면 '같음'.
// --alt: 같은 코드로 한 번 더 찍은 기준. 프레임이 기준 또는 재촬영 중 하나와 오차 안이면 '같음' (촬영 자체의 흔들림 = 10ms 스텝 경계·파티클 몇 픽셀을 거른다).
// 브라우저 캔버스로 PNG를 읽는다 (npm 의존성 없음).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
const A = a[0], B = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const CHAN = +opt('chan', 2), PCT = +opt('pct', 0.05), ALT = opt('alt', null), ALTB = opt('alt-b', null), MD = opt('md', null), DIFFDIR = opt('diffdir', null);
(async () => {
  const fa = JSON.parse(fs.readFileSync(path.join(A, 'frames.json'))), fb = JSON.parse(fs.readFileSync(path.join(B, 'frames.json')));
  const fc = ALT ? JSON.parse(fs.readFileSync(path.join(ALT, 'frames.json'))) : null;
  const fd = ALTB ? JSON.parse(fs.readFileSync(path.join(ALTB, 'frames.json'))) : null;
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<canvas id=a></canvas><canvas id=b></canvas>');
  const rows = [];
  if(DIFFDIR) fs.mkdirSync(DIFFDIR, { recursive: true });
  for(const scene of Object.keys(fa.scenes)){
    const xs = fa.scenes[scene], ys = (fb.scenes[scene] || []);
    let worst = 0, worstT = null, maxDelta = 0, same = 0, n = 0, altUsed = 0;
    for(const x of xs){
      const y = ys.find(q => q.t === x.t);
      if(!y){ rows.push([scene, x.t, 'missing']); continue; }
      const cmp = (dirA, fileA, dirB, fileB) => p.evaluate(async ({ da, db, CHAN, wantImg }) => {
        const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
        const [ia, ib] = await Promise.all([load(da), load(db)]);
        const w = ia.width, h = ia.height;
        const get = im => { const c = document.createElement('canvas'); c.width = w; c.height = h; const cx = c.getContext('2d'); cx.drawImage(im, 0, 0); return cx.getImageData(0, 0, w, h).data; };
        const pa = get(ia), pb = get(ib);
        let diff = 0, maxD = 0;
        const out = wantImg ? new ImageData(w, h) : null;
        for(let i = 0; i < pa.length; i += 4){
          const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
          if(d > maxD) maxD = d;
          const bad = d > CHAN;
          if(bad) diff++;
          if(out){ const g = (pa[i] + pa[i + 1] + pa[i + 2]) / 9; out.data[i] = bad ? 255 : g; out.data[i + 1] = bad ? 0 : g; out.data[i + 2] = bad ? 60 : g; out.data[i + 3] = 255; }
        }
        let img = null;
        if(out && diff){ const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0); img = c.toDataURL('image/png'); }
        return { diff, maxD, total: w * h, img };
      }, { da: 'data:image/png;base64,' + fs.readFileSync(path.join(dirA, fileA)).toString('base64'), db: 'data:image/png;base64,' + fs.readFileSync(path.join(dirB || B, fileB || y.file)).toString('base64'), CHAN, wantImg: !!DIFFDIR });
      let r = await cmp(A, x.file), pct = r.diff / r.total * 100;
      if(pct > PCT && fc){   // 재촬영 기준과도 비교 — 둘 중 가까운 쪽
        const z = (fc.scenes[scene] || []).find(q => q.t === x.t);
        if(z){ const r2 = await cmp(ALT, z.file), p2 = r2.diff / r2.total * 100; if(p2 < pct){ r = r2; pct = p2; altUsed++; } }
      }
      if(pct > PCT && fd){   // 비교 쪽 재촬영과도 (기준·기준 재촬영 각각)
        const w = (fd.scenes[scene] || []).find(q => q.t === x.t), z = fc ? (fc.scenes[scene] || []).find(q => q.t === x.t) : null;
        for(const [dA, fA] of [[A, x.file]].concat(z ? [[ALT, z.file]] : [])){
          if(!w || pct <= PCT) break;
          const r3 = await cmp(dA, fA, ALTB, w.file), p3 = r3.diff / r3.total * 100;
          if(p3 < pct){ r = r3; pct = p3; altUsed++; }
        }
      }
      n++; if(pct <= PCT) same++;
      if(pct > worst){ worst = pct; worstT = x.t; }
      maxDelta = Math.max(maxDelta, r.maxD);
      if(DIFFDIR && r.img && pct > PCT) fs.writeFileSync(path.join(DIFFDIR, `${scene}-t${String(x.t).padStart(4, '0')}-diff.png`), Buffer.from(r.img.split(',')[1], 'base64'));
    }
    rows.push([scene, n, same, worst, worstT, maxDelta, altUsed]);
    console.log(scene, `${same}/${n} same`, 'alt', altUsed, 'worst', worst.toFixed(4) + '%', '@', worstT, 'maxΔ', maxDelta);
  }
  await b.close();
  if(MD){
    const lines = [`| 장면 | 프레임 | 허용 오차 안 | 재촬영 기준으로 통과 | 최대 다른 픽셀 % (시각) | 최대 채널 차 | 판정 |`, '|---|---|---|---|---|---|---|'];
    rows.filter(r => r.length === 7).forEach(([s, n, same, w, wt, md, alt]) => lines.push(`| ${s} | ${n} | ${same} | ${alt} | ${w.toFixed(4)}% ${wt !== null ? '(' + wt + 'ms)' : ''} | ${md} | ${same === n ? '같음' : '**다름**'} |`));
    fs.writeFileSync(MD, lines.join('\n') + '\n');
  }
})();
