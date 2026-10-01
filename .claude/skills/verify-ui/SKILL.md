---
name: verify-ui
description: UI·엔진을 고친 뒤 Playwright로 실제 동작을 검증한다 (사이트 사본 서빙 → 스모크 → 회귀 테스트 → 1920×1080·1366×768 스크린샷). "검증해줘", "UI 확인", "스크린샷" 때 사용.
disable-model-invocation: true
argument-hint: "[테스트이름 ... | all]"
---

# verify-ui

CLAUDE.md '수정 후 검증(필수)'를 한 번에 돌린다.

## 실행

```sh
tools/verify-ui.sh $ARGUMENTS      # 인자 없음 = smoke만 · 이름 나열 = smoke + 그 테스트 · all = tools/tests 전부
```

- `docs/demo` → `demo.html`로 복사해 `127.0.0.1:8765`에 서빙하고, `tools/tests/<이름>.cjs`를 돌려 `PASS/FAIL` 한 줄씩 요약한다. 스크린샷은 `/tmp/hodl-test`.
- 스모크 = 출격 → 장전 → 종목 카드 매수 → 장 시작 → 전량 매도 → 주간 결산 → 암시장 → 2주차, `pageerror` 없음 (1920·1366·390).

## 절차

1. 바꾼 영역에 맞는 테스트를 고른다 (표는 `tools/tests/README.md`): 예) HUD → `hud`, 정산 무대 → `daystage plainstage`, 암시장 → `shopfx`, 보스 → `boss bosscounter`. 모르겠으면 `all`.
2. `tools/verify-ui.sh <이름>` 실행. FAIL이면 출력된 줄로 원인을 찾아 고치고 다시 돌린다 (테스트를 약하게 고쳐 통과시키지 않는다).
3. 레이아웃을 건드렸으면 `/tmp/hodl-test/*.png`를 Read로 열어 눈으로 확인한다: 카드 잘림·겹침, 시세 7행. 1615×900, 2560×1440, 1280×1024(2단), 390×844는 CLAUDE.md '레이아웃' 절 기준으로 필요할 때 `w-*.cjs`나 임시 스크립트로 추가 촬영.
4. 변경한 기능 자체도 직접 조작해 본다. 손패는 `run.hand = ['stk_semi','credit'].map(newCard); handSig=''; renderAll();`처럼 고정, 찌라시는 `window.tipChance = () => 0;`.
5. 보고: 돌린 테스트와 PASS/FAIL, 본 스크린샷, 남은 문제.

## 주의
- Playwright MCP가 붙어 있으면 그걸로 직접 조작해도 되지만, 회귀 확인은 이 스크립트가 기준이다 (전역 playwright, npm 설치 없음).
- 타이틀 첫 입력은 `keyboard.press('Shift')`, 시작 버튼 뒤 260ms 이상 대기 — 기존 테스트가 이미 처리한다.
