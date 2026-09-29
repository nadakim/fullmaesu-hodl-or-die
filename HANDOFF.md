# Session Handoff

**Date:** 2026-09-28
**main:** S0~S9 + N1까지 머지됨. 먼저 `/CLAUDE.md` → 이 파일 → `docs/design/MASTER_PLAN.md`(§0 규칙, §9 체크리스트) 순서로 읽는다. 사용자와는 한국어로.

## 지금 상태 (다음 세션은 여기부터)

- **완료·머지**: S0~S8 전부, S9 보스 주간(PR #20) + 정산 카운터 순자산화(PR #21), N1 정산 비중(PR #22 측정 + 현행 유지 결정). N4 색 언어(PR #24). N2 자원 정리 1단계(PR, 머지) — 🛑 2단계 비자금·현금 통합 사용자 결정 대기 (SHOP_ECONOMY.md 'N2 통합안').
- **N1 정산 비중: D 현행 유지로 결정·완료** (SETTLEMENT.md 'N1'). 스위치 `SETTLE_BASE_CAP`·`HOLD_CHIP_PCT`는 0.
- **N4 색 언어** (브랜치 `claude/n4-settle-colors-b9zw19`): 칩 = `--cyan`, 배수 = `--gold` 통일 + 정산 무대 계산식 줄·금액 슬롯·직전 흔들림. UI 전용(engine.js 무변경, sim/runner.js 결과 동일), 테스트 `tools/tests/settlecolors.cjs` 추가.
- **N2 자원 정리 1단계**: HUD 상시 = 순자산+목표·현금·행동력·정산 배수, 나머지는 순자산 호버 툴팁 `#balTip`, 금감원 게이지 0이면 숨김, 포지션 심지 게이지 `.fuse`, 화면 전문용어는 툴팁. 테스트 `tools/tests/hud.cjs` (33개).
- **그 다음**: S10 메타 진행 (🛑 D12 해금 조건 목록 확인부터), S11은 **(42) 중간 저장만** (43·45 하지 않음).
  - **S10은 사용자 지시로 중지** ("다시 하라고 할 때까지"). D12 해금 조건 표 초안(시작 풀 카드 58·유물 20, 잠금 카드 17·유물 15 + 조건)은 채팅에만 제시, 승인 전. 브랜치 `claude/s10a-unlocks`는 커밋 없음.
- **ui-tactile** (브랜치 `claude/ui-tactile`, PR 후 멈춤): `.btn-chunky` 버튼 통일·패널 3종 `.px-panel`·명찰 `.px-tag`·카드 기울기(`tiltMaxDeg`)·손패 떠 있기·구역 배경 무늬·작은 숫자 VT323. UI 전용(engine.js 무변경). 규칙은 CLAUDE.md '픽셀 디자인 시스템'.
- **작업 규칙(사용자 지시)**: 최신 main에서 새 브랜치, 한 PR = 한 목적, PR 설명에 요약·파일·플레이테스트·기획 문서 항목. **작업이 끝나면 묻지 않고 자동으로 PR을 만들어 직접 머지한다** (2026-09-28 사용자 지시). **PR·수정마다 플레이 데모 아티팩트 재게시** (아래).
- **플레이 데모 아티팩트**: https://claude.ai/artifact/87p2qHpf3e8D9rtNUr4fTp — `docs/demo`를 `index.html`로 복사(`<title></title>` → `<title>BULL TRAP</title>`), `engine.js`·`audio.js`·`music.js`·`fx.js`·`assets/sfx/files.js`를 `files`로 함께 게시. 다른 세션이면 먼저 `Artifact read` 후 `url`로 게시(폰트는 기존 아티팩트에 있음).
- **N3 섹터 레벨업** (PR #26 머지 — 조정안 1 보상 리포트 칸 + 3 행동력 0 적용, 다음 후보는 SECTOR_LEVELS.md): 리포트 카드 11장·리서치 팩·정산 맨 앞 섹터 칩·배수·보상 가중, 플래그 `SECTOR_LEVELS_ON`. 봇 `sectorAllIn`. 테스트 `tools/tests/sector.cjs`.
- **검증 방법**: 테스트 34개 `tools/tests/*.cjs` (README의 사이트 복사 + `python3 -m http.server 8765`), 헤드리스 시뮬 `node sim/runner.js --n 500`, 비교 `node sim/compare.js 전.json 후.json`, 보스 `node sim/boss-check.js 켬.json 끔.json`, 정산 비중 `node sim/settle-share.js`.
- **주의**: 셸 heredoc은 반드시 `<<'EOF'`(따옴표)로 — 따옴표 없는 heredoc에 백틱이 있으면 명령으로 실행된다. `pkill -f`는 자기 셸을 죽일 수 있다.

## 단계별 결정 기록 (요약)

- D1 BULL TRAP · D3 주간 체인 = 요약 · D4/D8 목표 1억200만 → 300억 · D5~D7 덱빌딩 · D9 지수 A안 · D10 새 종목 6개 · (14) 담보유지비율 롱 140%·숏 130% · D11 정산 카운터 보스 3종 → 순자산 카운터(목표 상향 조정·세무조사 초과분 50%)
- S8: TR룸 연출(#17) · 암시장 연출(#18) · 수익 콤보 통합 + `?tuner=1`(#19)
- S9 결과: 보스는 대조군 대비 대부분 ±5%p, 목표 상향 조정만 −34%p (`docs/design/BOSS_WEEKS.md`)

---

# (이전 기록)
## 지금 진행 방식 (2026-09-27~)

`docs/design/MASTER_PLAN.md` §5대로 단계별 진행. **한 단계 = 한 브랜치 = 한 PR, 끝나면 멈추고 요약.** 🛑 결정 지점은 질문으로 정리해 묻는다.
사용자 지시: **S11에서는 (42) 중간 저장만** 하고 (43) 웹 데모 패키징·(45) 릴리스 문서는 하지 않는다.

- **S0** (PR #3, 브랜치 `claude/handoff-review-status-lw9aio`): 로드맵 Electron·스팀 출시로, 게임 영문 이름 **BULL TRAP**(D1, 한국어 '풀매수 기원단' 유지), Open Q 1~4는 뒤 단계 후 재측정(D2: Q1·Q2 → S3 후, Q3 → S2 후, Q4 → S1 예상 정산으로 대체 검토)
- **S1** (브랜치 `claude/s1-settlement-engine`, S0 위에 쌓음 — PR base = S0 브랜치): 장 마감 정산 `settleDay`(유물 보정 → 현금 보너스, add·mult·xmult), 예상 정산 미리보기(행동력 줄 `정산 ×N` + 종목 카드 툴팁), `formatKrw` 큰 수 단위, 주간 체인 = 이번 주 정산 요약, 시뮬 지표(최고 순자산 분포·하루 최대 배수) + `sim/compare.js`. 문서 `docs/design/SETTLEMENT.md`
- S1 결정: **D3** 주간 결산 체인 = 요약 한 화면 유지(확정), **D4** 목표 금액 그대로 → **S4 이후 재측정**
- 사용자 요청: PR을 올리거나 수정 작업을 끝낼 때마다 **웹에서 바로 플레이할 수 있는 데모 아티팩트**를 올린다 (아래 Demo 항목)
- **플레이 데모 아티팩트 (최신)**: https://claude.ai/artifact/87p2qHpf3e8D9rtNUr4fTp — 작업마다 같은 URL로 재게시. 만드는 법: `docs/demo` → `index.html`(`<title>BULL TRAP</title>` 넣기) + `engine.js`·`audio.js`·`music.js`·`fx.js`·`assets/sfx/files.js`를 `files`로, 폰트 6개는 `{artifact: <이 URL>, path: 'assets/fonts/…'}`로 서버 복사. 다른 세션에서 갱신하려면 먼저 `Artifact read`(파일 전부 읽기) 후 `url`로 게시. 예전 아티팩트(Qv1Si1jamWgT4hRuHKbkCY)는 S0 이전 버전
- **S2** (브랜치 `claude/s2-relic-slots`, S1 위): 유물 칸 6개·교체/포기·순서 변경(끌기·◀▶·←→, 장전·암시장)·암시장 판매, 정산 배수를 칸 순서대로 차례 적용 (`docs/design/RELIC_SLOTS.md`). Open Q3 재측정: `nothing` 8.8% (칸 제한 영향 없음)
- S2 후 결정: Open Q3(`nothing` 8.8%) = **A안** 그대로 두고 S4 후 재측정
- **S3** (브랜치 `claude/s3-deckbuilding`, S2 위): 카드 강화(+) 50종·보상 '카드 강화'·암시장 리모델링/변환/복제, 빌드 태그 7종 + 등급 안 가중치, 덱 순환(빌 때만 셔플·retain 틀), 종목 카드 금액 입력 창 (`docs/design/DECKBUILDING.md`). D5 표대로 · D6 버림 + retain 예외 · D7 종목 카드 등급 폐지. Open Q1 재측정: deckThinner 26.8% → 24.6%
- **S4** (브랜치 `claude/s4-multiplier-content`, S3 위): 떡상 적금·반대매매 생존자 → xmult(폭주 허용, 사용자 결정), 곱하기 유물 12종·카드 8종, 크리티컬 정산 5%, 배수 봇 `levTowerBuild`·`antFlagBuild` (`docs/design/MULTIPLIERS.md`). 상위 10% ÷ 중앙값 = ×38~×62만 (대박 구조 확인), 대신 전 전략 클리어율 +6~16%p, nothing 12.8%
- S4 결정: **D8** 배수 그대로 + 목표를 거침없이 상향 → `ROUND_TARGETS` 1억 200만 → 300억 (D4 재측정 완료). 배수 봇 30.6%·53.0%, 나머지 0~5%, nothing 2.2%
- 다음: 결정 후 S5 빠른 UI (`claude/s5-quick-ui`)

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

## Open Questions (사용자 결정: 뒤 단계 구조 변경 후 재측정 — Q1·Q2 S3 후, Q3 S2 후, Q4 S1 후)

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
