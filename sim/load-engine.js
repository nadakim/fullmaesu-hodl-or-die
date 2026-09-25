/* docs/engine.js(CONFIG + ENGINE)를 Node의 vm 컨텍스트 하나에 불러온다. DOM·Playwright 없이 엔진 함수를 그대로 쓴다.
   engine.js는 브라우저용 일반 스크립트라 최상위 let/const가 export되지 않는다 → 이름으로 꺼내는 Proxy를 돌려준다.
   const E = loadEngine();  E.setSeed(1); E.startNewRun(); E.run.phase ...
   run·assets·marketPrice처럼 재대입되는 변수(LIVE)는 매번 읽고, 나머지(함수·상수)는 한 번 읽어 캐시한다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE_FILE = path.join(__dirname, '../docs/engine.js');
const LIVE = new Set(['run', 'assets', 'marketPrice', 'marketState', 'candleData', 'eventListener']);

module.exports = function loadEngine(file = ENGINE_FILE){
  const ctx = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  // 재대입되는 변수는 컨텍스트 안의 getter로 읽는다 (runInContext를 매번 컴파일하지 않도록)
  const live = vm.runInContext('({' + [...LIVE].map(k => `get ${k}(){ return ${k}; }`).join(',') + '})', ctx);
  const cache = {};
  return new Proxy({}, {
    get(_, key){
      if(typeof key !== 'string') return undefined;
      if(LIVE.has(key)) return live[key];
      if(!(key in cache)) cache[key] = vm.runInContext(key, ctx);
      return cache[key];
    }
  });
};
