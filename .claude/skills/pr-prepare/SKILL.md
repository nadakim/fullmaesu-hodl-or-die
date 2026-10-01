---
name: pr-prepare
description: PR을 올리기 전에 CLAUDE.md Git 규칙(한 목적·겹치는 PR·rebase·실행 가능 상태)을 점검하고 PR 설명 초안을 만든다. "PR 준비", "PR 올리기 전 점검" 때 사용. PR 생성은 사용자가 시킬 때만.
disable-model-invocation: true
---

# pr-prepare

PR을 **만들기 전** 점검과 설명 초안까지만 한다. PR 생성·푸시는 사용자가 명시적으로 시킬 때만 한다.

## 1. 범위 점검
- `git fetch origin main` 후 `git log --oneline origin/main..HEAD`, `git diff --stat origin/main...HEAD`.
- **한 PR = 한 목적.** 서로 다른 기능이 섞였으면 나눌 것을 제안한다. MASTER_PLAN의 한 단계(S5 등)를 한 PR로 볼지는 사용자에게 묻는다.
- 열린 PR 중 **같은 파일**(`docs/demo`·`docs/engine.js` 등)을 건드리는 것이 있는지 GitHub MCP(`list_pull_requests` → `pull_request_read` files)로 확인하고, 있으면 먼저 사용자에게 알린다.
- 브랜치가 최신 `main` 기준인지: 뒤처졌으면 **merge 대신 rebase**(이미 푸시한 브랜치면 사용자 확인).

## 2. 품질 점검 (있는 도구로)
- 엔진·UI 변경: `engine-purity-reviewer` 서브에이전트로 diff 검토.
- `tools/verify-ui.sh all` (또는 `regression-runner` 서브에이전트) — FAIL 0 확인. UI를 바꿨으면 1920×1080·1366×768 스크린샷.
- 밸런스 변경: `/balance-compare` 표 첨부. 연출만 바꿨다면 `sim/runner.js` 전/후 결과 JSON이 같아야 한다(tick 순서·결과 불변).
- **`main`이 실행 가능해야 한다**: 미완성 기능은 CONFIG 플래그로 꺼져 있는지, 기본값에서 게임이 도는지.
- 문서: 설계가 바뀌었으면 `docs/design/*.md`·`CHANGELOG.md`·`HANDOFF.md`(필요 시 `/handoff`)·`CLAUDE.md`.

## 3. PR 설명 초안 (필수 항목)
`.github`에 템플릿이 없으니 아래 구조로 쓴다.

```markdown
## 변경 요약
- (무엇을, 왜)

## 영향받는 파일
- `docs/engine.js` — …

## 플레이테스트 방법
1. `docs/demo`를 열어 (`tools/verify-ui.sh`로 서빙) …를 눌러 …를 확인

## 관련 기획 문서
- `docs/design/MASTER_PLAN.md` S?-?? / `…md` 항목

## 검증
- tools/verify-ui.sh all: FAIL 0 / N · 밸런스 표(해당 시) · 스크린샷
```

끝에 시스템이 정한 PR 푸터를 붙인다. 초안은 사용자에게 보여 주고 확인받는다.
