---
name: new-test
description: tools/tests에 브라우저 회귀 테스트(Playwright node 스크립트)를 새로 만든다. 프로젝트 관례(해금 주차·Shift 입력·대기 시간·출력 규약)를 지킨 템플릿으로 시작. "테스트 추가", "회귀 테스트 만들어줘" 때 사용.
disable-model-invocation: true
argument-hint: "<이름> [검증할 기능 한 줄]"
---

# new-test

`tools/tests/<이름>.cjs`를 만든다. 비슷한 기존 테스트를 하나 골라 읽고 따라 쓰면 가장 빠르다 (표는 `tools/tests/README.md`): HUD → `hud.cjs`, 정산 무대 → `daystage.cjs`, 암시장 → `shopfx.cjs`, 흐름 → `smoke.cjs`.

## 템플릿 (관례 전부 포함)

```js
// <이름>: <검증하는 것 한 줄>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');   // 전역 playwright, npm 설치 없음
const S = process.argv[2];                                                  // 스크린샷 폴더
let pass = 0, fail = 0;
const ok = (name, c, info) => { if(c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [W, H] of [[1920,1080],[1366,768]]) {                          // UI 테스트는 두 크기 이상
    const p = await b.newPage({ viewport: { width: W, height: H } });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/demo.html');
    await p.evaluate(() => { try { localStorage.setItem('hodl.unlockWeek', '8'); } catch(e) {} });   // 전 시스템 해금
    await p.keyboard.press('Shift');                                        // 타이틀 첫 입력은 오디오 켜기용
    await p.click('#startBtn'); await sleep(460);                           // 확정 뒤 0.2초 후 전환 → 260ms 이상 대기
    // 상황 만들기 — 손패는 고정, 찌라시는 끈다:
    await p.evaluate(() => { window.tipChance = () => 0; run.hand = ['stk_semi', 'credit'].map(newCard); handSig = ''; renderAll(); });
    // … 조작하고 ok('설명', 조건, 값)로 검증 …
    await p.screenshot({ path: `${S}/<이름>-${W}.png` });
    await p.close();
  }
  ok('page errors 없음', errs.length === 0, errs);
  console.log(`FAIL ${fail} / ${pass + fail}`);                             // 통과 = 'FAIL 0 / N' + errors []
  await b.close();
})();
```

## 지킬 것
- **해금**: 첫 `goto` 직후 `hodl.unlockWeek = '8'`. `localStorage.clear()` 뒤에는 다시 넣는다. 온보딩 자체를 보는 테스트만 예외(`onboarding.cjs`).
- **요소 핸들을 오래 들고 있지 않는다** — 게임 루프(800ms)가 화면을 다시 그린다. locator를 매번 새로 찾는다.
- **기다리기 어려운 상황은 상태를 만든다**: 반대매매 `assets.meme.price *= 0.7; checkMarginCalls();`, 주 끝 `run.day = DAYS_PER_ROUND; startMarket(); while(run.phase === 'market'){ if(run.pendingTip) resolveTip(1); tick(); } renderAll();`. 연출 큐가 시장을 멈추면 `Fx.skipQueue`/`whenFxIdle`.
- 시장은 TR룸 화면·장중·찌라시/오버레이 없음일 때만 움직인다.
- 레이아웃 테스트는 크기를 더한다(1615×900 · 2560×1440 · 1280×1024 · 390×844) — CLAUDE.md '레이아웃'.
- 테스트가 실패하면 **테스트를 약하게 고치지 말고** 원인을 먼저 본다.

## 마무리
1. `tools/verify-ui.sh <이름>`으로 돌려 `PASS`와 스크린샷 확인.
2. `tools/tests/README.md` 표에 한 줄 추가(파일·보는 것·창 크기).
3. 테스트 개수가 바뀌었으면 `CLAUDE.md`의 "Playwright node 스크립트 N개"를 맞춘다.
