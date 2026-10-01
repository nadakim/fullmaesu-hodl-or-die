#!/usr/bin/env node
/* git이 추적하는 파일 중 크기 한도(기본 2MB) 초과 목록과 합계. 의존성 없음.
   node tools/check-tracked-size.cjs [--limit-mb 2] [--top 10] */
const { execSync } = require('child_process');
const fs = require('fs');
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? Number(a[i + 1]) : d; };
const limit = arg('--limit-mb', 2) * 1048576, top = arg('--top', 10);
const files = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean)
  .map(f => { try { return { f, n: fs.statSync(f).size }; } catch(e) { return null; } }).filter(Boolean);
const big = files.filter(x => x.n > limit).sort((x, y) => y.n - x.n);
const mb = n => (n / 1048576).toFixed(1) + ' MB';
console.log(`추적 파일 ${files.length}개 · 전체 ${mb(files.reduce((s, x) => s + x.n, 0))} · ${mb(limit)} 초과 ${big.length}개 · 초과분 합계 ${mb(big.reduce((s, x) => s + x.n, 0))}`);
big.slice(0, top).forEach(x => console.log(`  ${mb(x.n).padStart(9)}  ${x.f}`));
process.exitCode = 0;
