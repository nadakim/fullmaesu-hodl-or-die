---
name: balance-compare
description: 밸런스(CONFIG 수치·카드·유물·보스)를 바꾸기 전/후로 시뮬레이터를 돌려 표로 비교한다. "밸런스 비교", "전후 비교", "시뮬 돌려줘" 때 사용.
disable-model-invocation: true
argument-hint: "[--n 400] [--tip A|B|random]"
---

# balance-compare

CLAUDE.md 규칙: 밸런스를 바꾸면 변경 전/후를 같은 시드로 돌려 **표로 보고**한다. 기준점은 `docs/balance-baseline.md`.

## 1. 변경 전 엔진 보존 (수정 전에, 이미 수정했다면 HEAD 기준)
```sh
mkdir -p /tmp/before && git show HEAD:docs/demo > /tmp/before/demo && git show HEAD:docs/engine.js > /tmp/before/engine.js
```

## 2. 전/후 실행 (같은 시드·같은 옵션)
```sh
# 봇 시뮬레이터 (tools/sim)
node tools/sim/sim.cjs --file /tmp/before/demo --n 400 --md /tmp/before/sim.md
node tools/sim/sim.cjs --n 400 --md /tmp/after-sim.md

# 헤드리스 전략 시뮬레이터 (sim/) — 대조군 random·nothing 포함
node sim/runner.js --engine /tmp/before/engine.js --n 500 --out sim/results/before.json
node sim/runner.js --n 500 --out sim/results/after.json
node sim/compare.js sim/results/before.json sim/results/after.json
```
- 파일 수정 없이 상수만 실험: `--set 'NAME=값;NAME2=값'`, 목표 곡선: `--targets ...`.
- 카드 한 장: `node tools/sim/cardev.cjs [--all]`. 보스: `node sim/boss-check.js 켬.json 끔.json`. 지표: `node sim/metrics.js 결과.json`.
- `sim/results/*`는 생성물 — 훅이 직접 수정을 막으므로 반드시 위 명령으로만 만든다.

## 3. 보고
- 전/후를 한 표로: 클리어·파산·목표미달 %, 평균 생존 주, 반대매매, 최고 순자산 분포, 전략별.
- 점검: `nothing`은 0%에 가까워야 하고, 잘 짠 빌드가 `random`·`nothing`보다 높아야 한다. 어떤 전략이 비정상적으로 높으면 그 전략의 카드/유물을 의심 (`sim/README.md` '해석 기준').
- `docs/balance-baseline.md` 기준점 대비 벗어난 곳을 짚고, 의도한 변화인지 판단 근거를 적는다.
