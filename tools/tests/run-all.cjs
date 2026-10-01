#!/usr/bin/env node
/* 브라우저 회귀 테스트 러너 (의존성 없음 — Node 내장 http·child_process·fs만).
   node tools/tests/run-all.cjs [--only a,b] [--skip a,b] [--repeat 1] [--workers 1] [--port 8770] [--timeout 600] [--no-retry] [--out DIR] [--json report.json]

   - 사이트 사본(docs/demo → demo.html + docs/*.js + docs/assets)을 임시 폴더에 만들고, 워커마다 자기 포트로 정적 서버를 띄운다
     (테스트는 환경 변수 TEST_BASE = http://127.0.0.1:<포트>를 읽는다 → 포트 충돌·다른 서버 의존 없음).
   - 판정: 마지막 'FAIL n / m' 줄이 있으면 n = 0이면 통과. 그 줄이 없는 관찰 스크립트(smoke·w-*)는 'errors []' 줄이 있고 'FAIL ' 줄이 없으면 통과.
     **결과 줄이 없는 종료(크래시·타임아웃 포함)는 실패**(noresult / timeout)로 센다.
   - 실패한 테스트는 끝에 단독으로 1회 다시 돌린다(--no-retry로 끔). 다시 통과하면 '불안정(flaky)' 경고 — 통과로 치지만 요약에 남긴다.
   - 종료 코드: 재실행 뒤에도 실패가 있으면 1. --repeat N이면 같은 스위트를 N번 돌려 테스트별 실패·무결과 횟수를 센다(재실행 없음). */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { spawn } = require('child_process');
const ROOT = process.env.HODL_ROOT || path.join(__dirname, '../..'), TESTS = __dirname;   // HODL_ROOT = 다른 위치의 테스트 묶음으로 이 저장소를 돌릴 때
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const list = v => (v && v !== true ? String(v).split(',').filter(Boolean) : []);
const only = list(opt('only')), skip = list(opt('skip'));
const REPEAT = +opt('repeat', 1), WORKERS = Math.max(1, +opt('workers', 1)), PORT0 = +opt('port', 8770);
const TIMEOUT = +opt('timeout', 600) * 1000, RETRY = !opt('no-retry', false) && REPEAT === 1;
const OUT = path.resolve(opt('out', path.join(os.tmpdir(), 'hodl-tests'))), JSON_OUT = opt('json', '');
const tests = fs.readdirSync(TESTS).filter(f => f.endsWith('.cjs') && f !== 'run-all.cjs').map(f => f.replace(/\.cjs$/, ''))
  .filter(t => (!only.length || only.indexOf(t) >= 0) && skip.indexOf(t) < 0).sort();

// 사이트 사본
const SITE = path.join(OUT, 'site');
fs.rmSync(SITE, { recursive: true, force: true }); fs.mkdirSync(SITE, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'docs/demo'), path.join(SITE, 'demo.html'));
fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.js')).forEach(f => fs.copyFileSync(path.join(ROOT, 'docs', f), path.join(SITE, f)));
fs.cpSync(path.join(ROOT, 'docs/assets'), path.join(SITE, 'assets'), { recursive: true });
['w', 'v'].forEach(d => fs.mkdirSync(path.join(OUT, d), { recursive: true }));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.json': 'application/json', '.txt': 'text/plain' };
function serve(port){
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
      if(!p.startsWith(SITE)){ rsp.writeHead(403); rsp.end(); return; }
      fs.readFile(p, (err, buf) => {
        if(err){ rsp.writeHead(404); rsp.end(); return; }
        rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); rsp.end(buf);
      });
    });
    srv.on('error', rej); srv.listen(port, '127.0.0.1', () => res(srv));
  });
}

/* 출력 → 판정. pass | fail(n) | noresult | timeout */
function classify(out, code, timedOut){
  const m = [...out.matchAll(/FAIL\s+(\d+)\s*\/\s*(\d+)/g)].pop();
  if(m) return { status: +m[1] === 0 ? 'pass' : 'fail', fails: +m[1], total: +m[2] };
  if(timedOut) return { status: 'timeout' };
  const errLine = /^errors (\[.*\])\s*$/m.exec(out);
  if(errLine){
    const bad = /^FAIL /m.test(out) || errLine[1].trim() !== '[]';
    return { status: bad ? 'fail' : 'pass', fails: bad ? 1 : 0, total: 1, observe: true };
  }
  return { status: 'noresult', code };
}
function runOne(name, port){
  return new Promise(res => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, [path.join(TESTS, name + '.cjs'), OUT], { cwd: ROOT, env: Object.assign({}, process.env, { TEST_BASE: `http://127.0.0.1:${port}` }) });
    let out = '', timedOut = false;
    ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { timedOut = true; ch.kill('SIGKILL'); }, TIMEOUT);
    ch.on('close', code => {
      clearTimeout(timer);
      const r = classify(out, code, timedOut);
      r.name = name; r.sec = Math.round((Date.now() - t0) / 1000);
      r.failLines = out.split('\n').filter(l => /^FAIL /.test(l) && !/^FAIL\s+\d+\s*\//.test(l)).slice(0, 5);
      if(r.status !== 'pass') r.tail = out.split('\n').filter(Boolean).slice(-6);
      res(r);
    });
  });
}
async function suite(servers){
  const queue = tests.slice(), results = [];
  await Promise.all(servers.map(async (_, w) => { while(queue.length){ const t = queue.shift(); const r = await runOne(t, PORT0 + w); results.push(r); log(r); } }));
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
const mark = s => ({ pass: 'PASS', fail: 'FAIL', noresult: 'NORESULT', timeout: 'TIMEOUT', flaky: 'FLAKY' }[s] || s);
const log = r => process.stdout.write(`${mark(r.status).padEnd(8)} ${r.name.padEnd(14)} ${r.total !== undefined ? `${r.fails}/${r.total}` : ''} ${r.sec}s\n`);

(async () => {
  const servers = [];
  for(let w = 0; w < WORKERS; w++) servers.push(await serve(PORT0 + w));
  const rounds = [];
  for(let k = 0; k < REPEAT; k++){
    if(REPEAT > 1) console.log(`\n── 회차 ${k + 1}/${REPEAT} ──`);
    rounds.push(await suite(servers));
  }
  const last = rounds[rounds.length - 1];
  if(RETRY){
    const bad = last.filter(r => r.status !== 'pass');
    if(bad.length) console.log(`\n── 실패 ${bad.length}개 단독 재실행 ──`);
    for(const r of bad){ const again = await runOne(r.name, PORT0); log(again); r.retry = again.status; if(again.status === 'pass') r.status = 'flaky'; }
  }
  servers.forEach(s => s.close());
  // 요약
  if(REPEAT > 1){
    console.log(`\n| 테스트 | 실패 | 무결과·타임아웃 | ${REPEAT}회 |\n|---|---|---|---|`);
    tests.forEach(t => {
      const rs = rounds.map(rd => rd.find(r => r.name === t));
      const f = rs.filter(r => r.status === 'fail').length, n = rs.filter(r => r.status === 'noresult' || r.status === 'timeout').length;
      if(f || n) console.log(`| ${t} | ${f} | ${n} | ${rs.map(r => mark(r.status)[0]).join('')} |`);
    });
  }
  const count = s => last.filter(r => r.status === s).length;
  console.log(`\n요약: 통과 ${count('pass')} · 불안정(재실행 통과) ${count('flaky')} · 실패 ${count('fail')} · 무결과 ${count('noresult')} · 타임아웃 ${count('timeout')} / ${last.length}`);
  last.filter(r => r.status !== 'pass').forEach(r => console.log(`  ${mark(r.status)} ${r.name}${r.retry ? ` (재실행: ${mark(r.retry)})` : ''}${r.failLines.length ? '\n    ' + r.failLines.join('\n    ') : ''}${r.status !== 'flaky' && r.tail ? '\n    … ' + r.tail.join('\n    … ') : ''}`));
  if(JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ date: new Date().toISOString(), repeat: REPEAT, workers: WORKERS, rounds }, null, 1));
  process.exitCode = last.some(r => ['fail', 'noresult', 'timeout'].indexOf(r.status) >= 0) ? 1 : 0;
})();
