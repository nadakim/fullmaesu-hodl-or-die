/* 사운드 감사 도구 공용: docs/를 그대로 서빙하는 정적 서버 + Playwright 도우미.
   외부 의존성 없음 — Node 내장 http와 전역 playwright(tools/tests와 같은 경로)만 쓴다. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOCS = path.resolve(__dirname, '../../docs');
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
                '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

/* docs/를 서빙한다. docs/demo는 확장자가 없어서 /demo.html로도 열 수 있게 한다 (CLAUDE.md '수정 후 검증'의 복사 서버와 같은 주소) */
function serve(){
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p === '/' || p === '/demo.html') p = '/demo';
      const file = path.join(DOCS, p);
      if(!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': p === '/demo' ? TYPES['.html'] : (TYPES[path.extname(file)] || 'application/octet-stream') });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port }));
  });
}

/* 게임 화면 없이 소리 코드만 올린 빈 페이지 — 타이틀 애니메이션 등이 Math.random·타이머를 건드리지 않아 렌더가 결정적이다 */
async function audioPage(browser, { withLab = true } = {}){
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if(m.type() === 'error') errs.push(m.text()); });
  await page.setContent('<!doctype html><html><body></body></html>');
  for(const f of ['audio.js', 'music.js'].concat(withLab ? ['soundlab.js'] : [])) await page.addScriptTag({ path: path.join(DOCS, f) });
  await page.addScriptTag({ path: path.join(__dirname, 'page-lib.js') });
  page.errs = errs;
  return page;
}

function argv(defaults){
  const o = Object.assign({}, defaults), a = process.argv.slice(2);
  for(let i = 0; i < a.length; i++){
    if(!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), nxt = a[i + 1];
    if(nxt === undefined || nxt.startsWith('--')) o[k] = true;
    else { o[k] = typeof defaults[k] === 'number' ? Number(nxt) : nxt; i++; }
  }
  return o;
}

const round = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * Math.pow(10, d)) / Math.pow(10, d) : x);
module.exports = { DOCS, PLAYWRIGHT, serve, audioPage, argv, round, chromium: () => require(PLAYWRIGHT).chromium };
