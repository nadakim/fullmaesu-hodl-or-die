/* docs/demo를 페이지 하나로 서빙하기 위해 읽는다. <script src="engine.js">는 같은 폴더의 engine.js 내용으로 인라인한다
   (분리 전 파일이면 그대로). 변경 전 비교: mkdir -p /tmp/before && git show HEAD:docs/demo > /tmp/before/demo && git show HEAD:docs/engine.js > /tmp/before/engine.js */
const fs = require('fs');
const path = require('path');
const TAG = '<script src="engine.js"></script>';
module.exports = function readDemoHtml(file){
  const html = fs.readFileSync(file, 'utf8');
  if(html.indexOf(TAG) < 0) return html;
  const engine = fs.readFileSync(path.join(path.dirname(file), 'engine.js'), 'utf8');
  return html.replace(TAG, () => '<script>\n' + engine + '\n</script>');
};
