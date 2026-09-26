/* docs/demo를 페이지 하나로 서빙하기 위해 읽는다. 같은 폴더의 <script src="*.js">(engine.js · audio.js · fx.js)는 내용으로 인라인한다
   (파일이 없으면 태그를 그대로 둔다 — 분리 전 파일 호환). 변경 전 비교: mkdir -p /tmp/before && git show HEAD:docs/demo > /tmp/before/demo
   && git show HEAD:docs/engine.js > /tmp/before/engine.js (audio.js·fx.js가 있는 버전이면 그것도 같은 폴더에) */
const fs = require('fs');
const path = require('path');
module.exports = function readDemoHtml(file){
  const dir = path.dirname(file);
  return fs.readFileSync(file, 'utf8').replace(/<script src="([\w.-]+\.js)"><\/script>/g, (tag, name) => {
    const f = path.join(dir, name);
    return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : tag;
  });
};
