---
name: 풀매수 기원단 BULL TRAP
description: 한국 주식·코인 밈을 입힌 레트로 픽셀 CRT 트레이딩 터미널 — 어두운 네이비 위에 네온 초록·빨강·금색.
colors:
  bg: "#02040a"
  panel: "#080e1c"
  panel-2: "#0c1428"
  text: "#d4deff"
  text-2: "#acb6d4"
  muted: "#8a96c4"
  line: "#1a2240"
  line-2: "#0f172a"
  up-green: "#00ff41"
  up-green-deep: "#00c832"
  up-green-dim: "#003a14"
  down-red: "#ff1a3c"
  down-red-deep: "#cc0028"
  down-red-dim: "#3a000e"
  jackpot-gold: "#ffd700"
  jackpot-gold-deep: "#e6a800"
  chip-cyan: "#00e5ff"
  legend-purple: "#9f5fff"
  rare-blue: "#3d7bff"
typography:
  title-pixel:
    fontFamily: "Press Start 2P, GP16, monospace"
    fontSize: "16px / 24px (8의 배수만)"
    fontWeight: 400
    lineHeight: 1.4
  body-ko:
    fontFamily: "Galmuri11, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  number:
    fontFamily: "VT323, GV20, monospace"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.1
  label-tag:
    fontFamily: "Press Start 2P, GP8, monospace"
    fontSize: "8px"
    fontWeight: 400
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  unit: "calc(1px * var(--ui))"
components:
  button-chunky:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "calc(6 * var(--u)) calc(12 * var(--u))"
  panel-base:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
---

# Design System: 풀매수 기원단 BULL TRAP

> 이 문서는 새로 지어낸 비주얼이 아니라 `docs/demo`의 `:root`·CSS와 CLAUDE.md '픽셀 디자인 시스템' 규칙을 옮겨 적은 **scan 기록**이다. 사용자에게 질문하지 않는다는 지시에 따라 North Star·분위기 문구는 기존 문서(JUICE_BIBLE, README, UX_AUDIT)에서 추론했다 — 추론한 부분은 `[추론]`.

## Overview

**Creative North Star: "새벽 3시의 증권사 터미널"** [추론]

밤새 호가창을 노려보는 사람의 모니터. 거의 검은 네이비 바탕, CRT 스캔라인과 노이즈, 네온 초록이 오르고 빨강이 내린다. 그 위에 밈 한 줄과 도파민 연출이 얹힌다. 터미널은 진지하고 문구는 우스운 — 이 대비가 톤이다. 현실의 증권 앱도 아니고 모던 SaaS 대시보드도 아니다. 오락실 레트로 + 한국 투자 커뮤니티.

밀도는 높다(시세 13종목, 손패 3×3, 포지션 2줄 행). 대신 구역마다 역할 색과 두꺼운 픽셀 테두리로 시선을 정리한다. 스킬의 모던·미니멀 기본값(여백 넓은 카드, 12–16px 둥근 모서리, 부드러운 그림자)은 이 세계에 맞지 않으므로 레트로를 우선한다 (PRODUCT.md 브랜드 약속).

**Key Characteristics:**
- 곡선 없음: `border-radius` 0, 부드러운 그림자·그라데이션 없음, 오프셋 단색 그림자로 두께를 표현.
- 색은 의미다: 초록 상승 / 빨강 하락 / 금색 배수·잭팟 / 청록 칩 / 보라 전설.
- 모든 길이는 `calc(N * var(--u))` — 창 높이에 따라 정수 배율로 커진다. 픽셀이 뭉개지지 않는 것이 규칙.
- 연출은 강약 — 대부분 가볍게, 10번 중 1번 크게 (JUICE_BIBLE).

## Colors

어두운 네이비 한 장 위에 네온 4색이 역할별로 나뉜다. 팔레트는 CRT 형광 느낌이고, 표면은 거의 검정에 가까워 네온이 튄다.

### Primary
- **형광 상승 초록** (#00ff41): 상승·수익·긍정 확정. 한국식 반대 색(상승=빨강)을 쓰지 않는다. 호버·강조 테두리도 이 색(`--green`).
- **형광 하락 빨강** (#ff1a3c): 하락·손실·반대매매·위험 패널.

### Secondary
- **잭팟 금색** (#ffd700 / 짙은 #e6a800): 정산 **배수**(합산 +·곱 ×), 보상·순자산 강조 패널, 신화 등급. 칩과 섞지 않는다.
- **칩 청록** (#00e5ff): 정산 **칩**(오늘 손익·더하기), 정보성 강조. 초록·빨강은 상승·하락 전용이라 정산 숫자에 쓰지 않는다.

### Tertiary
- **전설 보라** (#9f5fff): 전설 등급, 암시장 안개.
- **희귀 파랑** (#3d7bff): 희귀 등급 테두리.

### Neutral
- **심야 네이비** (#02040a): 화면 바탕. **패널** (#080e1c), **패널 2** (#0c1428): 구역 표면.
- **본문 라벤더** (#d4deff), **보조 본문** (#acb6d4), **보조 라벨** (#8a96c4, bg 대비 7.07:1): 글자색. 보조 글자를 opacity로 흐리게 하지 말고 이 색으로.
- **테두리 남색** (#1a2240, #0f172a): 테두리·구분선 전용 — **글자에 쓰지 않는다** (대비 1.24:1).

### Named Rules
**The Signal Colors Rule.** 초록·빨강은 오르고 내리는 것에만. 칩은 청록, 배수는 금색. 한 색이 두 의미를 갖지 않는다.
**The Variable Only Rule.** 새 hex를 코드에 박지 않는다. 항상 `:root` 변수. Canvas에서 부득이하면 같은 값을 쓴다.
**The Contrast Floor Rule.** 글자는 배경 대비 4.5:1 이상. 낮은 대비의 배경 무늬 위에서도 `--muted` 기준 5.3:1 이상을 확인한다.

## Typography

**Display Font:** Press Start 2P (한글 대체 GP8·GP16·GP24)
**Body Font:** Galmuri 7·9·11·14 (한글 비트맵)
**Label/Mono Font:** VT323 (숫자·본문, 한글 대체 GV16~GV30)

**Character:** 픽셀 비트맵 세 얼굴. 숫자는 VT323, 한글 라벨은 Galmuri, 영문 짧은 태그·큰 숫자는 Press Start 2P. 전부 로컬 파일(SIL OFL), 외부 폰트 없음.

### Hierarchy
- **Pixel Title** (Press Start 2P, 16/24px, 8의 배수만): 제목·순자산·현금 큰 숫자·버튼·짧은 영문 태그. 예외로 정산 무대 주인공 배수 40px(`--fs-p4`, 숫자·×만).
- **Pixel Tag** (Press Start 2P 8px): 명찰(`.px-tag`)·짧은 영문 라벨.
- **Korean Body** (Galmuri 12px 기본, `--fs-xs` 10 · sm 12 · md 15 · m16 16 · lg 20 · xl 24 · xxl 30): 긴 라벨·설명. 최소 10px.
- **Number** (VT323 16/20/24/30px, 최소 16px): 가격·금액·배수·행동력.

### Named Rules
**The Integer Pixel Rule.** Press Start 2P는 8·16·24px만, Galmuri는 원래 크기 또는 정수배. 임의 크기를 쓰지 않는다.
**The Variable Size Rule.** 크기는 `--fs-*` 변수로만. 새 크기가 필요하면 변수·@font-face·'글자 크기: 크게' 재정의를 함께 추가한다.
**The Clipped Hangul Rule.** `overflow:hidden` + 좁은 line-height 안의 한글은 윗줄이 잘린다 — line-height 1.1 이상·padding-top을 준다.

## Layout

창 전체를 꽉 채운다(고정 비율·레터박스 없음). 배율 `--ui` = 창 높이 ÷ 600을 0.25 단위로 반올림, 1~2.5. 모든 길이는 `calc(N * var(--u))`.

- **3단 TR룸** (폭 ≥ 1200이고 폭/높이 ≥ 1.45): 상단 HUD 전체 폭 / 왼쪽 시장(뉴스·차트·시세 13종목 2열) / 가운데 행동(유물·행동력·칩·손패·장 시작) / 오른쪽 포지션.
- **2단** (그보다 좁음): 시장 | 행동+포지션(포지션 최소 35vh).
- **900px 이하**: 세로 스택 최대 520px, `--ui` 1.
- 손패 3×3 격자(10장이면 4열). 시세표는 자동 배율에서 7행이 스크롤 없이 보여야 한다.
- 상시 숫자는 순자산+목표 막대·현금·행동력·정산 배수뿐; 나머지는 호버 툴팁(N2 자원 정리).

### Named Rules
**The Whole Window Rule.** 화면 전체를 쓴다. 가운데 작은 상자에 가두지 않는다.
**The Every Size Rule.** 레이아웃을 건드렸으면 1615×900·1366×768·1920×1080·2560×1440·1280×1024·390×844에서 카드 잘림·겹침·시세 7행을 확인한다.

## Elevation & Depth

부드러운 그림자 없이 **오프셋 단색 그림자**로 두께를 표현하는 하이브리드. 버튼은 옆면(테두리 색의 어두운 톤) + 검은 바닥 그림자의 2단 두께, 누르면 그림자만큼 내려앉는다. 패널은 얇은 픽셀 틀. 구역 배경 무늬(`.tx-felt` 손패·`.tx-grid` 시장·`.tx-ledger` 포지션, 암시장 체크)는 hard-stop 그라디언트 + `color-mix` 저대비로만.

### Shadow Vocabulary
- **버튼 두께** (`box-shadow: var(--bk-d) var(--bk-d) 0 2u var(--bk-side), (d+1u) (d+1u) 0 2u #000`, 깊이 4u, 작은 버튼 2u): `.btn-chunky`. 호버 시 1칸 뜨고 누르면 그림자 0.
- **픽셀 오프셋** (`6px 6px 0 #000`, 배율 적용): 카드·패널 입체.
- **픽셀 테두리 유틸리티**: `.px-border` · `-gold` · `-green` · `-red` · `.px-corner-box`.

### Named Rules
**The Hard Offset Rule.** 이 세계에서는 0 블러 오프셋 그림자가 정답이다. (impeccable의 "hard offset shadow는 네오브루탈리즘 밖에서 금지" 기본값은 레트로 픽셀 월드에서 해당하지 않는다.)
**The Tilt Only Rule.** 카드·팩·유물은 마우스 기울기 `tiltFrame`(CSS 변수만, 최대 `tiltMaxDeg`). 대상 지정·드래그·흔들림 끔·동작 줄이기·터치에서는 끈다.

## Shapes

직각. `border-radius`는 쓰지 않는다 (impeccable 기본의 12–16px 카드 반경·알약형은 이 세계에 맞지 않아 레트로를 우선). 카드 테두리는 이중 — 안쪽 `--cc` = 종류 색, 바깥 `--rc` = 등급 색(일반 `--muted` · 고급 `--green2` · 희귀 `--blue` · 전설 `--purple` · 신화 `--gold`). Canvas는 `imageSmoothingEnabled = false`, `image-rendering: pixelated`.

## Components

### Buttons
- **Shape:** 직각, 두꺼운 단색 옆면 (`.btn-chunky`, 작은 버튼 `.btn-chunky.sm`).
- **Primary:** 색(`background`·`color`)과 테두리 색 `--bk-ring`만 정한다. `box-shadow`·호버 `transform`은 공통 규칙이 처리 (윗면 1픽셀 밝은 선·호버 1칸 상승·누름 하강·비활성 흐림).
- **Hover / Focus:** 호버 `uiHover`, 누름 `uiPress` 소리 자동. 중요 버튼은 `.breathe`로 숨쉬기(장 시작·정산 ▶ 다음 날).

### Cards / Containers
- **패널 3종:** 기본 `.px-panel`(강조색 `--pc`) · 강조 `.px-panel-gold`(보상·정산·순자산) · 위험 `.px-panel-red`(반대매매 경고·보스 예고). 제목 띠는 명찰 `.px-tag`.
- **게임 카드:** 보상·암시장·도감·덱 124×180(×u), 손패는 격자 칸을 채우는 `.card.gcard`. 설명이 넘치면 첫 문장만 남기고 툴팁.

### Navigation
탭 없음. 상단 HUD 왼쪽 ≡ 메뉴 + 게임 흐름이 `switchTab()`으로 화면을 바꾼다. 타이틀은 [대괄호] 텍스트 메뉴(호버·↑↓ 공용 `.sel`).

### 시세·포지션 행 (시그니처)
시세 한 칸: 이름·시그널 칩 / 가격·등락(상·하한가 上·下), 포지션 2줄 행의 심지 게이지 `.fuse`(초록 → 주황 → 빨강, 반대매매까지 여유). 정산 무대(`#stageHero`): 칩 × 배수 불타기 티어(`.f1~f4`), 크리티컬 777 릴.

## Do's and Don'ts

### Do:
- **Do** 색은 `:root` 변수만, 길이는 `calc(N * var(--u))`, 글자 크기는 `--fs-*`.
- **Do** 새 UI는 `.btn-chunky`·`.px-panel` 3종·`.px-tag`·기존 구역 무늬 4종을 재사용한다.
- **Do** 상승 = `--green`, 하락 = `--red`, 칩 = `--cyan`, 배수 = `--gold`.
- **Do** 화면 용어는 쉬운 말(심지·빌린 돈·낸 이자). 정식 용어는 툴팁·용어집에만.
- **Do** 화면 금액은 `formatKrw`(만·억·조·경…무량대수)를 거친다.
- **Do** 흔들림·번쩍임·암전·슬로모션은 `motionOK()`일 때만. 동작 줄이기 대응.

### Don't:
- **Don't** `border-radius`·부드러운 그림자·그라데이션 텍스트·블러 장식 (모던 SaaS 기본값은 이 세계에서 틀림).
- **Don't** 새 hex 하드코딩, 맨 px 길이(@media 경계값·@font-face만 예외), `opacity`로 보조 글자 흐리기.
- **Don't** `--line`·`--line2`를 글자에 쓰지 않는다.
- **Don't** Press Start 2P를 8·16·24 외 크기나 긴 한글에 쓰지 않는다 (VT323은 16px 미만 금지).
- **Don't** 한국식 반대 색 (상승=빨강) 쓰지 않는다.
- **Don't** 자해를 연상시키는 표현·실존 기업명·티커 (PRODUCT.md 제약).
- **Don't** impeccable 기본 'Refuse' 항목이 레트로 월드와 충돌할 때(오프셋 하드 그림자·격자/줄무늬 배경·12–16px 반경·이모지 글리프 아이콘) 월드 규칙을 깨고 스킬 기본값을 따르지 않는다. 단, 새 이모지 아이콘을 늘리는 것은 지양 — 현재 일부 HUD(💼 비자금·📰 내일·💰)에 이미 쓰이고 있으나 기존 관례일 뿐 확장 근거는 아니다 [추론].
