---
name: add-content
description: 게임 콘텐츠(카드·유물·보스·찌라시·뉴스·엔딩·효과음)를 새로 추가할 때의 위치·형식·검증 체크리스트. "카드 추가", "유물 만들어줘", "보스 추가", "찌라시 추가" 때 사용.
argument-hint: "<card|relic|boss|tip|news|ending|sfx> [이름]"
---

# add-content

새 콘텐츠는 **데이터 한 줄 + 필요한 계산 지점 하나**로 넣는다 (CLAUDE.md). 먼저 같은 종류의 기존 항목 하나를 읽고 형식을 맞춘다. 수치는 전부 CONFIG 상수(`NAME_*`)로 — 코드 중간에 숫자를 박지 않는다.

## 종류별 위치 (`docs/engine.js`, 소리·엔딩만 UI)

| 종류 | 어디에 | 같이 볼 곳 |
|---|---|---|
| **카드** | `defCard(id, name, type, ap, rarity, target, exhaust, desc, valid, play)` — 효과 함수는 `run`·`assets`만 바꾼다. 문구의 수치는 `${CONST}`로 | 강화판 `defUpgrade(id, over)`(수치 `*_UP`) · 빌드 태그 `CARD_TAGS` · 잠기는 시스템이면 `SYSTEM_CARDS` · 정산 배수를 올리면 UI `boostsSettle`(docs/demo)이 빛내는지 · 행동력은 `cardCost` |
| **유물** | `RELICS`에 `{id, icon, name, rarity, desc, flavor}` 한 줄 | 정산이면 `SETTLE_EFFECTS[id]`(kind `add`·`mult`·`xmult`, `onLoss`) · 그 외는 **계산 함수 안에서 `hasRelic(id)`로 분기** · 태그 `RELIC_TAGS` · 잠기는 시스템이면 `SYSTEM_RELICS` · 가격은 `RELIC_PRICE`(등급별) · 성장형이면 `growth` 필드 + `GROWTH_RELICS.md` |
| **보스** | `BOSSES`에 `{id, name, icon, desc, mods:{…}}` 한 줄 | 효과는 `bossMod(key, 기본값)` 하나로만 읽는다(보스 id로 분기 금지) — 새 `mods` 키면 읽는 곳 하나 추가 · 잠긴 시스템 겨냥이면 `SYSTEM_BOSSES` · 점검 `node sim/boss-check.js` |
| **찌라시** | `TIP_EVENTS`에 `{id, headline, body, choices:[{label, outcomes:[{chance, tag, text, effects}]}]}` — 데이터만 | effect kind: cash·buy·shock·pump·market·sellStock·protect·slush · 확률은 합 1 · `tipExpectedValue`가 같은 식을 읽는다 |
| **뉴스** | `NEWS_EVENTS`에 `{id, text, target:'stock:…', effect:{volMult, drift, gapMult}, reliability:'confirmed'\|'rumor'}` | 적중률 실측 `node sim/signal-check.js` |
| **엔딩** | UI `docs/demo`의 `ENDINGS[endCause]`(title·color·group·hint·sub·cause) + 엔진 `classifyEnd` 판정(`END_*` 상수) | 파산 기록 `hint`(미해금 조건 문구) |
| **효과음** | `docs/audio.js`의 `SFX` 사전 + **파일 맨 위 이름→이벤트 표**에 한 줄 + **`docs/soundlab.js`의 `SOUND_CATEGORY_OF`에 카테고리** (옵션이 있으면 `SOUND_OPTION_VARIANTS`) | 부르는 곳은 `onGameEvent`·UI 연출 함수뿐 (엔진에 `Sound` 금지) · 파일 덮어쓰기 `assets/sfx/files.js` · 카테고리를 빼먹으면 `tools/tests/soundlab.cjs`가 실패 · 추가 뒤 `node tools/audio/audit.cjs --sfx`로 음량·스펙트럼을 재고 Sound Lab(`?soundlab=1`)에서 직접 듣는다 |

## 규칙 (어기면 훅·리뷰가 잡는다)
- **금지 소재**: 한강·투신·수온 등 자해 연상, 실존 기업명·티커(삼성전자·NVDA·TSLA…) 금지. 문구·이름·flavor는 재정적 파산 소재(반대매매·깡통계좌·영끌 실패)로만. `content-guard` 훅이 검사한다.
- 엔진은 DOM·`Math.random` 금지 → 무작위는 `rand()`, 알림은 `emit()`. `engine-guard` 훅이 검사한다.
- 화면 문구에 "증거금률"·"담보비율"·"대차 이자" 금지(툴팁만). 카드·유물·보스 설명(엔진 문구)은 예외.
- UI에 보이는 확률은 엔진이 판정에 쓰는 값을 그대로 읽는다.
- 끄고 켤 수 있어야 하면 플래그를 둔다(끄면 도입 전과 같은 판 = 난수 순서도 그대로). 미완성은 플래그로 꺼서 `main`을 실행 가능하게.

## 마무리
1. `node sim/runner.js --n 100`으로 엔진이 도는지(DOM 의존 없음) 먼저 확인.
2. 밸런스에 영향이 있으면 `/balance-compare`로 전/후 표 — 새 카드 한 장은 `node tools/sim/cardev.cjs`.
3. 화면이 바뀌면 `/verify-ui` + 관련 테스트. 새 동작은 `/new-test`로 회귀 테스트 추가.
4. 설계가 바뀌었으면 해당 `docs/design/*.md`와 `docs/design/CHANGELOG.md` 한 줄, 필요하면 `CLAUDE.md`(구조 설명).
