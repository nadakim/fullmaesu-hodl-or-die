# Session Handoff

**Date:** 2026-09-26
**Branch:** `claude/affectionate-mendel-w5hwvt` → 이 세션 끝에 PR로 `main`에 머지함. 다음 세션은 **최신 `main`에서 새 브랜치**로 시작.

## Summary

레트로 픽셀 카드 트레이딩 게임 웹 프로토타입(`docs/demo` + `docs/engine.js` + `audio.js`·`music.js`·`fx.js`)의 연출·시장·암시장·UI 전면 개편 세션. **먼저 `/CLAUDE.md`를 읽을 것** — 구조(CONFIG/ENGINE/UI), 금지 소재, 글자·배율 규칙, 검증 절차가 전부 거기 있다. 사용자와는 한국어로 대화. 게임 이름은 곧 바뀔 예정 — 코드에서는 `GAME_TITLE`만 읽는다.

## What Was Accomplished (커밋 순)

- 엔진 분리 `docs/engine.js` + Node 헤드리스 전략 시뮬레이터 `sim/` (`node sim/runner.js`)
- 연출 레이어(엔진 무변경): 효과음 `audio.js`(합성 칩튠), BGM `music.js`, 타격감·연출 큐 `fx.js`, 결산 체인(▶ 다음), 갭 중앙 경보, 찌라시 결과 알림
- 읽을 수 있는 시장: 종목 숨은 추세·시그널(적중률)·다음 날 뉴스·카드/찌라시 기대값 (`docs/design/READABLE_MARKET.md`)
- 성장형 유물 6종 + 엔진 콤보 (`docs/design/GROWTH_RELICS.md`)
- 암시장: 팩 확률 팝업, 물가 상승 `shopPrice`, 카드 제거 무제한 + 누진, 진열 새로고침, **유물 3칸 + 암시장 전용 등급 확률** `RELIC_SHOP_RARITY_WEIGHTS` (`docs/design/SHOP_ECONOMY.md`)
- 화면: 글자 크기 변수 체계(`--fs-*`, Galmuri·Press Start 2P·VT323 규칙), 대비 보정(`--muted`·`--text2`), **창 전체 채우기** — 모든 CSS 길이 = `calc(N * var(--u))`, `--ui` = 창 높이 ÷ 600(0.25 단위, 1~2.5), 배경 레이어 삭제
- TR룸: 3단(시장·행동·포지션)/2단, 상단 탭 제거 → HUD ≡ 메뉴(타이틀로·찌라시 기록·덱·설정), 장세 뱃지는 차트 옆, **손패 3×3 격자**(10장이면 4×3, 설명·EV는 툴팁), 포지션 2줄 행 + 증거금률 미니 막대, 뉴스 전광판 하나 + '📰 내일'
- **새 타이틀**: 흐르는 캔들 배경(타이틀 전용 상태 + Math.random) + CRT, 상한가 로고 + 떡상 기원부적, [대괄호] 메뉴(키보드 ↑↓·Enter, 이어하기, 진행 중 판 확인, Electron [종료] 구멍), 등장 연출, 첫 입력 = 오디오 켜기만
- 설정: 장중 속도·흔들림·CRT·결산 연출·사운드/BGM·효과음 볼륨·틱 소리·히트스톱·연출 속도·**화면 크기**(작게/자동/크게/매우 크게)·**글자 크기**(보통/크게)
- 게임 이름·메타: `docs/demo` `<head>`의 `GAME_TITLE` · `GAME_META`(버전·제작자·스팀/디스코드 링크 — 빈 값이면 숨김)
- **브라우저 회귀 테스트를 저장소에 넣음**: `tools/tests/` (21개 + README, 실행법·주의점 포함)
- 플레이용 비공개 아티팩트(최신 반영, v16): https://claude.ai/artifact/Qv1Si1jamWgT4hRuHKbkCY — 바꾼 뒤엔 같은 URL을 `url`로 넘겨 재게시 (engine.js·audio.js·fx.js·music.js는 `files`로 함께)

## Key Decisions

- 엔진은 DOM 금지·`emit()`만, 수치는 전부 CONFIG. UI 작업은 **engine.js 무변경 + `node sim/runner.js` 결과 JSON 전후 동일**이 사용자 기본 조건
- 밸런스를 바꾸면 `tools/sim/sim.cjs`·`sim/runner.js` 전후 표로 보고, 수치 조정은 사용자가 "조정안만"이라 하면 바꾸지 말 것 (이 세션에 여러 번 그렇게 요청함)
- 타이틀 배경은 엔진 `generateNextCandle`을 직접 부르지 않는다 (엔진 `rand()`를 소모해 시드 재현이 깨짐) — 같은 식을 UI에서 `Math.random`으로
- 카드 설명 문구는 임의로 고치지 않는다 — 잘리면 목록만 보고
- 격자 카드에는 EV를 안 싣고 툴팁에만 (요청 목록에 없어서 — 사용자 확인 대기)

## Current State

모든 작업 커밋·푸시·머지 완료. 작업 트리 깨끗.

**Modified files:** 없음 · **Staged changes:** None · **Stash entries:** None

엔진 전략 성적(`sim/runner.js`, 전략당 500판, 8주 클리어): allIn3x 15.0% · inverseHedge 25.6% · shortSeller 21.6% · manipSpam 30.8% · gukbapDefense 17.8% · signalFollower 29.4% · random 28.4% · growthFirst 26.4% · deckThinner 26.6% · **nothing 7.0%**

## Open Questions (사용자 답 대기 — 다음 세션에서 먼저 물어볼 것)

1. **얇은 덱 무한 루프**: 덱 6~11장이면 보조지표 + 배당주 마인드로 현금 무한. 제안: 보조지표 소멸·하루 드로우 상한 / `MIN_DECK_SIZE` 10 / 제거 누진 2.0 — 선택 대기
2. **`SHOP_SINGLE_LIMIT`(주당 낱장 구매 한도)**: 지운 상태 — 되살릴지
3. **유물 3칸 이후 `nothing` 클리어율 상승**(4.6% → 7.0%): 일반 유물 가격 인상 or 칸 2개로 — 선택 대기
4. 격자 손패 카드에 EV를 다시 올릴지

## Known Issues

- Playwright MCP 서버는 연결 실패 → 전역 playwright를 node 스크립트로 (`tools/tests/README.md`). npm·pip·jsDelivr는 이 환경에서 막힘
- `docs/demo`는 확장자가 없어 그대로 서빙하면 HTML로 안 뜸 → `demo.html`로 복사해서 서빙
- `docs/engine.js` 1번째 줄 주석에 게임 이름 하드코딩 (engine 무변경 조건 때문에 둠 — 이름 바꿀 때 같이)
- 2단 레이아웃(4:3 등, 예: 1280×1024)에서는 포지션 칸이 35vh라 6개면 칸 안 스크롤. 3단(폭 ≥1200·비율 ≥1.45)은 스크롤 없음
- 타이틀 [종료]는 `window.electronAPI.quit`이 있어야 보임 — Electron 쪽 preload는 아직 없음
- `README.md`·`DEVELOPMENT_LOG.md`는 이 세션 변경을 반영 안 함

## Next Steps (제안)

1. Open Questions 1~4 답 받기
2. 이름 확정되면 `GAME_TITLE`·engine.js 주석·README 갱신
3. `README.md` 기능 현황 갱신 (타이틀·TR룸 격자·설정 항목)
4. Electron 래퍼(스팀) 준비 시 `window.electronAPI.quit` preload

## Relevant Files

- `/CLAUDE.md` — 규칙·구조·검증 (필독)
- `/docs/demo` — CSS·마크업·UI JS (게임 이름 `GAME_TITLE`은 `<head>`)
- `/docs/engine.js` — CONFIG + ENGINE (DOM 없음, Node 시뮬레이터와 공용)
- `/docs/audio.js` · `/docs/music.js` · `/docs/fx.js` — 효과음·BGM·연출 (UI 전용)
- `/docs/design/*.md` — 시장·성장형 유물·암시장 경제 설계
- `/sim/` — 헤드리스 전략 시뮬레이터 · `/tools/sim/` — 봇 밸런스 시뮬레이터 · `/docs/balance-baseline.md`
- `/tools/tests/` — 브라우저 회귀 테스트 (README에 실행법)
