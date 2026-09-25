# Session Handoff

**Date:** 2026-09-25
**Branch:** `claude/exciting-newton-deckms` (main에 머지 안 됨, PR 없음 — 이 브랜치에서 계속 작업·푸시)

## Summary

레트로 픽셀 카드 트레이딩 게임 "풀매수 기원단: HODL or Die" 웹 프로토타입(`docs/demo`, 단일 HTML)의 밸런스·시스템·UI 작업 세션. **먼저 `/CLAUDE.md`를 읽을 것** — 코드 구조(CONFIG/ENGINE/UI), 금지 소재, 폰트 규칙, 검증 절차가 전부 거기 있다. 사용자와는 한국어로 대화.

## What Was Accomplished

- 시뮬레이터 `tools/sim/sim.cjs`(봇 8종), `cardev.cjs`, `bearbet.cjs` + 기준 기록 `docs/balance-baseline.md` (모든 밸런스 변경의 전/후 표가 여기 누적)
- 시드 난수 `rand()`/`setSeed`, 자살 연상 표현·실존 티커 제거
- 시장 카드 확률화 + 되돌림, 금감원 감시 게이지(제재 3종), 자진 신고 카드·전관 변호사 유물
- 5등급 레어리티(카드 50장·유물 17종), 신규 카드 11장·유물 9종
- 갭(급등락) + 미수 파산 → 파산율: stocksOnly 0% · allCards ~3% · yolo ~15%
- 엔딩 16종(파산 4·미달 11·졸업 1) + 타이틀 "파산 기록"(엔딩 도감·최근 30판·누적 통계)
- 암시장 전용 화폐 "비자금"(주간 결산 적립, 순자산 제외)
- 대차 이자 분리 `SHORT_BORROW_RATE`=0.2%, 인버스 녹음 `INVERSE_DECAY`
- 장세별 종목 움직임 +25% `STOCK_MOVE_MULT`, 주간 목표 +2% (`ROUND_TARGETS` 11,020 → … → 55,790)
- 한글 픽셀 폰트 Galmuri + 모든 폰트 로컬화(`docs/assets/fonts/`, Google Fonts 제거)
- 타이틀 "환경 설정"(속도 1/2/4x, 흔들림 끄기, CRT 강도, 배경 연출, 사운드 자리, 기록 초기화)
- 프로젝트 스킬 추가: `karpathy-guidelines`, `handoff` (`.claude/skills/`)
- 플레이용 비공개 아티팩트: https://claude.ai/artifact/QWQd2MEcvDvoeuQwpSqnp5 (자동 갱신 안 됨 — 바꾼 뒤 재게시 필요)

## Key Decisions

- 엔진은 DOM 금지·`emit()`만, 수치는 전부 CONFIG — Unity/C# 이식 대비 (CLAUDE.md)
- 게임오버·블랙코미디는 재정적 파산 소재만 (한강·투신 등 금지)
- 파산 = 순자산 ≤ 0 **또는** 반대매매가 음수(미수)로 체결된 뒤 현금 < 0
- Galmuri는 픽셀 격자에 맞는 크기에서만 선명 → CSS 글자 크기별 `@font-face` + `size-adjust` (`Galmuri-<n>px`, VT323 옆은 `GalmuriV-<n>px`)
- 설정(`hodl.settings`)·기록(`hodl.records`, `hodl.antRuns`)은 UI 전용 localStorage, 전부 try/catch
- 사용자 선택: 목표 +2%(파산율이 기준보다 약간 낮아짐 — 아래 Known Issues)

## Current State

모든 작업이 커밋·푸시됨. 최신 커밋 `9d3b3a8 Add karpathy-guidelines and handoff skills` (이 HANDOFF.md 커밋이 그 다음).

**Modified files:** 없음 (이 파일 제외)
**Staged changes:** None
**Stash entries:** None

현재 봇 성적(전략당 1,000판, 8주 클리어): stocksOnly 11.1% · shopper 10.4% · yolo 8.5% · bearInverse 5.7% · marketCards 4.1% · allCards 3.4% · bearShort 3.3% · nothing 0.9%

## Known Issues

- **Playwright 회귀 테스트 25종이 저장소에 없다** — 이전 세션 스크래치패드(`deck/*.cjs`)에만 있었고 새 세션에는 사라진다. 필요하면 다시 작성하거나 `tools/tests/`로 옮길 것
- 파산율이 갭 작업 때 세운 기준 아래: yolo 14.5%(기준 15~30%), allCards 2.5%(기준 3~10%) — `GAP_CHANCE_PER_RISK` 소폭 상향으로 맞출 수 있음 (미적용)
- 1주 통과율이 초기 설계 목표(stocksOnly 85~90%)보다 훨씬 낮음(~46%) — 원인은 지수 변동성 (`docs/balance-baseline.md` 참고)
- 공매도는 판 단위 성적에서 "고위험·고수익"의 수익 쪽이 안 드러남 — 제안 (a) 숏엔 드리프트 절반 (b) 매파 약세장 고베타 하락폭 확대 (c) 수익 시 자동 환매 (미적용)
- 신화 카드 효과·제안 목록(5등급 재설계 검증 기준 2~5 미달)은 baseline 문서에 제안만 기록
- 이 환경에서 npm·jsDelivr·pip는 403 (GitHub clone은 됨). Playwright MCP 서버는 연결 실패 → 전역 playwright(`/opt/node22/lib/node_modules/playwright`)를 node 스크립트로 사용
- `docs/demo`만 받아서는 한글 폰트가 안 나옴 — `docs/assets/`를 같이 둬야 함

## Next Steps (제안 — 사용자가 고르기 전)

1. 테스트 편의 기능: `?dev` 개발자 패널(현금 +1억·장 스킵·결산 스킵·카드 넣기·반대매매 발생), `?seed=` 시드 고정, 8x 속도 (사용자에게 제안해 둔 상태, 답 대기)
2. GitHub Pages 배포 준비: `docs/index.html` 생성 (저장소 공개 + Settings → Pages는 사용자가 직접)
3. 회귀 테스트를 `tools/tests/`로 저장소에 넣기 (Playwright, CLAUDE.md 스모크 시나리오 기준)
4. 파산율 기준 재조정 여부 확인 (`GAP_CHANCE_PER_RISK`)
5. 바뀐 게임을 아티팩트 링크에 재게시 (같은 URL을 `url`로 넘겨 갱신)

## Relevant Files

- `/CLAUDE.md` — 모든 규칙·구조·검증 절차 (필독)
- `/docs/demo` — 게임 본체 (단일 HTML, 확장자 없음; CONFIG → ENGINE → UI 순)
- `/docs/assets/fonts/` — 로컬 폰트 + OFL 라이선스 (배포 시 함께)
- `/docs/balance-baseline.md` — 밸런스 변경 이력과 전/후 표, 미적용 제안
- `/tools/sim/sim.cjs` — 밸런스 시뮬레이터 (`--n --strategies --targets --json --md --file`)
- `/tools/sim/cardev.cjs` — 카드 한 장 기대 수익
- `/tools/sim/bearbet.cjs` — 인버스 vs 공매도 베팅 비교
- `/DEVELOPMENT_LOG.md`, `/README.md` — 개발 기록·기능 현황 (이번 세션에선 갱신 안 함)
- `/.claude/skills/` — 프로젝트 스킬 (ponytail 계열, emil-design-eng, karpathy-guidelines, handoff)
