# 모션 정리 보고 — "결과는 그대로, 시간 제어만 한 곳으로"

기준 조사: `docs/ref/motion-audit.md` (브랜치 `origin/claude/motion-audit` 92ea432 — **main에는 아직 없음**, 이 브랜치에도 넣지 않았다).
작업 브랜치 `claude/upbeat-mayer-e54lvc` (main 10ee996에서). 새 연출·게임 로직·밸런스 변경 없음 (`docs/engine.js` 손대지 않음).

| 커밋 | 항목 |
|---|---|
| 0 | 기준선 필름스트립 `shots/baseline/` + 도구 `tools/motion/filmstrip.cjs`·`diff.cjs` |
| 1 | 시간 스케일 한 곳 `motionScale` · `Fx.motionTime(ms)` |
| 2 | 지속시간 단일 출처 `:root --dur-*` ↔ `Fx.dur()` · 뒷정리 `Fx.afterAnim` |
| 3 | 모션 끔 판정 하나 `isMotionReduced()` |
| 4 | 키프레임 겹침 정리 (animation 칸 분리 + 개별 `translate`) |
| 5 | 2× 이상 쌓임 정책 (동시 6개 · 간격 ×0.5) |
| 6 | 검증 결과 `shots/after/` + 이 보고서 |

---

## 0. 기준선 촬영 방법

- `node tools/motion/filmstrip.cjs <폴더> [--scenes …] [--speed 1|2|4] [--motion 0~100] [--shake 0|1] [--prm 1] [--finish-ended]` — 1920×1080, `?crt=0`.
- **JS 시간**: Playwright `page.clock` — 페이지를 열기 **전에** `pauseAt`으로 멈추고 이후 `runFor(10ms)`로만 흐르게 했다. (`install` 뒤 중간에 `pauseAt`하면 실시간이 새고 가끔 rAF가 멈추는 문제가 있어 대안으로 바꿈.)
- **CSS·WAAPI 시간**: 스텝마다 `document.getAnimations()` → 새로 보이면 `pause()`(보류 상태라 `ready`를 기다림) → `currentTime = 가짜 시각 − 발견 시각`.
- 결정성을 위해 추가한 것: `Math.random` 시드 PRNG(트리거 직전 다시 심음), `performance.now`·rAF 시각을 가짜 `Date`에 묶음, 소리 끔(오디오 시계가 실시간), 마우스를 테두리로, Chromium `--disable-threaded-animation`(합성 스레드가 지난 프레임을 보여 주는 문제), 같은 프레임 두 번 연속 같을 때까지 재촬영.
- **한계**: 히트스톱의 CSS 일시정지(`body.fx-hitstop`)는 `pause()`가 덮어써 반영 안 됨(전·후 같은 조건). 파티클 캔버스·10ms 스텝 경계 이벤트는 판마다 조금 흔들린다 → 같은 코드 두 번 촬영 차이를 `shots/baseline/noise-floor.md`에 남김.
- 장면 16개: 정산 무대·간이 무대·결산 체인·연출 큐(갭 강·청산·갭 중)·토스트·`.cabinet` 흔들림 1/2/3·글리치·흔들림+글리치 2종·정산 상자 흔들림·직전 흔들림·폭주 배경·상자 흔들림+직전 흔들림·모달(결산 결과).

## 1. 시간 스케일 한 곳

- `motionScale = 모션 강도(설정 motion %, 새 스테퍼 0~100, 기본 100) × 장 속도 보정 JUICE_CONFIG.motionSpeedScale {x0_5: 1, x1: 1, x2: 0.7, x4: 0.4}` (튜너 키에 점을 못 써서 `x0_5`).
- `Fx.motionTime(ms)` (fx.js) 하나를 세 모델이 거친다 — 모델 통합은 안 함:
  - 정산 무대(rAF 가상 시간): 이벤트 시각 비교 `motionTime(e.t) <= vt`
  - 결산 체인(setTimeout 배열): `at(ms)`·마지막 대기
  - 연출 큐(setTimeout): 항목 길이(`duration × fxSpeed dur`)·항목 간격
- 0%면 정산 무대·결산 체인은 재생 없이 '결과로'와 같은 최종 상태(소리는 마지막 "둥"/도장만). 큐 항목은 길이 0.

## 2. 쌍으로 박혀 있던 시간 (JS ↔ CSS) 19개

| 연출 | CSS(전) | JS(전) | 지금 단일 값 | JS 연결 |
|---|---|---|---|---|
| 알림 토스트 | toastIn/Up 2.6s | 2600 | `--dur-toast` 2600ms | afterAnim |
| 청산 적색 섬광 | fadeOut .5s | 600 | `--dur-red-flash` 500ms | afterAnim |
| 포지션 신고가 | newHigh .6s | 650 | `--dur-newhigh` 600ms | afterAnim('newHigh') |
| Fx.flash fx-hit | fxHit .45s | 650 | `--dur-hit` | afterAnim('fxHit') |
| Fx.flash fx-goal (2곳) | fxGoal .6s | 650 | `--dur-goal` | afterAnim('fxGoal') |
| Fx.jiggle | fxJiggle .3s | 650 | `--dur-jiggle` | afterAnim('fxJiggle') |
| 유물 발동 | relicOn .5s | 650 | `--dur-relic-on` | afterAnim('relicOn') |
| 내일 뉴스 버튼 | rmUp .6s | 650 | `--dur-rm-up` | afterAnim('rmUp') |
| 흔들림 1·2·3 (`.cabinet`·`.overlay-box`) | .25/.4/.56s | 700 | `--dur-shake-1/2/3` | afterAnim(키프레임별) + 최소 700ms 창 유지 |
| 글리치·스캔라인 | .38s | FX_GLITCH_MS 380 | `--dur-glitch` | afterAnim('fxGlitch') / 요소 |
| 도장 | fxStamp .95s | FX_STAMP_MS 950 | `--dur-stamp` | afterAnim |
| 숫자 팝·COMBO 태그 | pixelPop .9s ×2 | 900 ×2 | `--dur-pop` | afterAnim |
| 효과 칩 | chipUp 1.1s | 1100 | `--dur-chip` | afterAnim |
| 희귀 드로우 반짝 | rareShine .7s ×2회 | 1400 | `--dur-shine` | afterAnim(2×, 'rareShine') |
| 유물 초기화 숫자 | lostFall 1.1s | 1200 | `--dur-lost` | afterAnim |
| 암시장 안개 | hazeIn 1.2s | hazeInMs 1200 +50 | `--dur-haze-in` → JUICE | afterAnim('hazeIn') |
| 팩 뒤집기 | cardFlip .6s | packFlipMs 600 | `--dur-pack-flip` → JUICE | 타이머(JUICE 값) |
| 신화 회전 | mythSpin 1.2s | mythSpinMs 1200 | `--dur-myth-spin` → JUICE | 타이머 |
| 콤보 끊김 | streakBreak 1.6s | comboCoolMs 1600 | `--dur-combo-cool` → JUICE | 타이머 |

- `Fx.dur()`는 값을 한 번 읽어 캐시한다(매번 `getComputedStyle`이면 스타일 재계산이 연출마다 일어나 다음 타이머가 수십 ms 밀렸다 — 전체 회귀에서 매수음 간격·CRT 포인터 테스트가 흔들려 발견). 튜너가 바꾸면 `Fx.refreshDur()`.
- JUICE와 묶인 4개는 `:root` 값으로 JUICE_CONFIG를 채우고 튜너로 바꾸면 `syncDurVars`가 CSS 변수에 다시 쓴다 (기본값은 CSS 한 곳).
- **통일이 위험했던 곳 → animationend**: 뒷정리를 고정 타이머에서 `Fx.afterAnim`(그 키프레임의 animationend)으로. 예비 타이머(--dur + 250ms)는 그 애니메이션이 아직 도는 중이면 남은 시간만큼 다시 기다린다(최대 8번). 예전엔 히트스톱이 겹치면 CSS는 멈추고 타이머는 흘러 도장·칩·스캔라인·적색 섬광을 **도중에 끊었다** (stress: 원본 2×에서 44건 → 0건).
- 그대로 둔 시간(쌍이 아님 또는 이미 단일 출처): 정산 무대 `--pop-ms`·`--slam-ms`·`--shake-ms`·`--rage-ms`·`--steam-ms`, 드로우 `--deal-ms`, 화면 번쩍임·속도선 `--fx-ms`(JS가 JUICE 값을 넣음). 카운트다운 숫자 팝 `cdPop .3s`는 박자(`countdownMs/4`)와 같은 값이지만 요소를 지우는 짝이 아니라 그대로 — 연쇄 속도 '빠름'·2×/4×에선 박자가 짧아져도 팝은 0.3초.

## 3. 모션 끔 판정 하나 — `isMotionReduced()`

`!settings.shake || PREFERS_REDUCED_MOTION || settings.motion === 0`. CSS는 `body.no-motion`(= 이 값) 하나, `@media (prefers-reduced-motion)` 블록 15개를 합쳤다. JS는 motionOK·Fx 모션(흔들림·글리치·히트스톱)·적색 섬광·카운트다운 번쩍·신화 암전·뉴스 전광판·기울기·타이틀(등장·흐르는 차트·노이즈)·히트스톱 설정 비활성이 전부 이 함수.

**분기 간에 원래 달랐던 동작** (이제 아래 '지금'으로 통일):

| 항목 | 흔들림 끔(전) | 시스템 동작 줄이기(전) | 지금 |
|---|---|---|---|
| 정산 보너스 카드 빛남 | 금빛 맥동 계속 | 정지 금빛 테두리 | **정지 금빛 테두리** |
| 위험 포지션 줄 | 정지 빨간 테두리 | 맥동 없음, 테두리 없음 | **정지 빨간 테두리** |
| 팩 개봉(내려앉기·흔들림·회전·기둥)·암시장 안개/둥실·유물 철컥 | 재생 | 없음(기둥 .22 정지) | 없음 |
| 카드 뒤집기 `.flip-card` · 장전 드로우 `.deal` · 카운트다운 숫자 팝 · 콤보 c4/c5/bump · 단위 돌파 팝 · 카드 호버 transition | 재생 | 없음 | 없음 |
| 신화 팩 암전 · 타이틀 흐르는 차트 · 타이틀 노이즈 | 재생 | 없음 | 없음 |
| 흔들림·글리치·히트스톱·적색 섬광·카운트다운 번쩍 | 없음 | 설정에서 흔들림을 켜면 **재생** (motionOK는 끔이라 반쪽) | 없음 (시스템 동작 줄이기면 항상 끔) |

최종 화면 비교 (`tools/motion/screens.cjs`, 13화면 × 원본/지금, 결과 `shots/after/motion-off/`): 흔들림 끔·동작 줄이기·모션 0%(원본 흔들림 끔과 비교) 모두 위 표의 항목(보너스 카드 테두리·팩 개봉 최종 위치)과 모션 0%의 설정 화면(새 '모션 강도' 줄) 말고는 같다. `title`·`combo-c5`는 모션 켬끼리도 달라서(타이틀 차트·콤보 시간이 실시간) 판정에서 뺐다.

## 4. 키프레임 충돌 정리

- `.cabinet`: `animation: var(--cab-shake, none), var(--cab-glitch, none)` — 흔들림(transform)·글리치(filter)가 칸 하나씩. 예전엔 shake-1·2 + 글리치면 나중 규칙(글리치)만 돌고, 글리치 클래스가 빠지면 흔들림이 그때 늦게 시작했다.
- `.overlay-box`: `--ov-shake`(정산 상자 흔들림, transform) · `--ov-pre`(금액 직전 흔들림 → **개별 속성 `translate`**). 겹치면 합성된다. 폭주 배경 `stage-rage`는 `::before` 가상요소라 원래 충돌 없음.
- 모션 끔이면 두 상자 모두 `animation:none` 한 줄.
- 손패 카드(`handIdle`+`boostGlow`+`rareShine`+`dealIn`)의 겹침은 요청 범위 밖이라 그대로.

## 5. 쌓임 정책 (장중 2× 이상)

- JUICE_CONFIG `stackFromSpeed 2` · `stackMax 6` · `stackStaggerMul 0.5` (튜너에 자동). 1×·0.5×는 꺼짐 = 원래 그대로.
- 진행 중 연출 = afterAnim 대기 요소·클래스 + 연출 큐 재생 항목(1개) + 날아가는 카드. 상한 초과 → 가장 오래된 것부터 즉시 최종 상태(요소 제거·클래스 떼기·큐 항목 stop+skip·카드 finish).
- 간격 ×0.5: 큐 항목 간격·카드 잔상·칩 지연·동전 간격·전량 매도 행 간격·매수음 순번.

`tools/motion/stress.cjs` (틱마다 갭·청산·알림·칩·도장·흔들림·번쩍 14틱, 끝나면 시장 정지 후 잔여 확인):

| 속도 | 지금: 동시 최대 / 당겨 끝냄 / 끊김 / 남음 | 원본: 끊김 / 남음(큐 잔여) |
|---|---|---|
| 1× | 26 / 0 / 0 / 진행 중 큐 5 | 50 / 큐 5 |
| 2× | **6** / 175 / **0** / **0** | 44 / 큐 8 |
| 4× | **6** / 177 / **0** / **0** | 44 / 큐 9 |

(끊김 = 끝이 있는 애니메이션이 도는 중에 요소 제거, 쌓임 정책과 토스트 3개 상한은 제외.) 2×·4× 필름스트립 `shots/after/speed2|speed4/`(끝난 애니메이션의 종료 이벤트를 보내는 `--finish-ended`): 큐·정산 무대·체인이 끝까지 가고 남는 요소 없음.

## 6. 하지 않은 것 — Sound Lab `SCENES` 복제 (위치·위험만)

- 위치: `docs/soundlab.js:110-200` (`sceneSettle`·`sceneCrit`·`sceneCombo`·`sceneClose`·`sceneDanger`·`scenePack`·`sceneTip`·`sceneOpen`·`sceneDeal`·`sceneChain`) + 목록 `SCENES` :193.
- 위험:
  1. **motionScale을 모른다** — 장면은 1× 시간으로 울리고, 게임은 2×(0.7)·4×(0.4)·모션 강도로 짧아진다. Sound Lab에서 듣는 간격 ≠ 빠른 장속 실제 간격.
  2. 순서·간격 복제: `sceneSettle`은 `stageMs`는 읽지만 단계 구성(add/mult)·금액 슬롯·동전 순서를 다시 썼다. `sceneChain`은 `CHAIN_MS`를 안 읽고 0.32·1.8·2.6초를 박아 둠. `sceneCombo` 0.24초 간격, `sceneCrit` 기본값 350(게임 `critStopGapMs` 260), `sceneClose`는 `TICK_MS`만(장 속도 무시).
  3. 쌓임 정책(간격 ×0.5·당겨 끝냄)도 반영 안 됨 → 4×의 실제 겹침 소리를 Lab에서 재현 못 함.
- 소리 호출 순서(`onGameEvent`·큐 항목 `play()` 안의 `Sound.play`)도 손대지 않았다. 모션 0%·당겨 끝냄에서는 연출 단계 중간의 소리가 생략되고 마지막 소리(정산 "둥"·체인 도장)만 남는다.

## 7. 검증

- **1×·모션 100% 필름스트립** `shots/baseline` ↔ `shots/after` (`shots/after/diff.md`, 차이 그림 `shots/after/diff/`):
  - 허용 오차: 채널 차 > 2인 픽셀이 프레임의 0.05%(1,036px) 이하, 또는 같은 코드 재촬영 기준과 그 안. 근거: 원본 두 번 촬영 차이가 파티클·글자 가장자리 최대 0.033%(채널 차 ≤ 53) + 10ms 스텝 경계 이벤트(정산 칩 1개, 최대 1.6%)였다 (`shots/baseline/noise-floor.md`).
  - 판정은 기준·기준 재촬영 × 지금·지금 재촬영 중 가장 가까운 짝 (같은 코드도 판마다 조금 흔들림).
  - 결과: 16장면 중 12장면 전 프레임 같음. 단독 연출(흔들림 1/2/3·글리치·상자 흔들림·직전 흔들림·폭주 배경·토스트·간이 무대·연출 큐·모달)은 전부 같음.
  - **기준선과 달라진 것 — 의도된 차이**: `shake2glitch`(13프레임)·`ovcombo`(8프레임) = 4단계 겹침 정리로 두 애니메이션이 함께 돈다.
  - 나머지 '다름' 4프레임(stage 3600 0.055% · chain 4200~4800 ≤ 0.07%)은 파티클 캔버스 점 위치만 다름(수동 확인).
- **모션 0%**: 위 3절 최종 화면 비교 + 필름스트립 `shots/after/motion0/` — 정산 무대·체인은 바로 결과, 큐는 길이 0.
- **2×·4×**: 위 5절.
- 촬영 도구 주의: 준비 단계 끝에 `page.clock.runFor(0)`을 넣으면 가짜 rAF 격자 위상이 바뀌어 정산 무대가 한 칸 앞서 찍힌다(코드 차이 아님) — 넣지 않는다.
- 회귀 테스트: 각 단계마다 관련 테스트(smoke·daystage·plainstage·chain·nextbtn·chainfx·juice·stagejuice·escalation·trroom·combo·comboidle·toastpos·settlecolors·shopfx·packinfo·growth·relicslots·tilt·w-title·w-tflow·quickui·hud·no-scroll) 통과. 한 번씩 실패했다 재실행에서 통과한 것: escalation(큐 도장 타이밍)·trroom(시간 초과).
- **전체 52개** (최종 코드): 49개 통과. 실패 3개는 원본 코드에서도 같은 항목이 실패한다(같은 조건으로 원본 대비 재실행):
  - `boss` '결과 화면에 추징 표시' — 원본도 실패.
  - `onboarding` 3주차 소개·새 판 시작 덱 — 원본도 2번 중 1번 실패(지금 코드도 2번 중 1번).
  - `crt-curve` 2560×1080 장 시작 버튼 모서리 2점 — `?scenario=nine`에서 '목표 돌파!' 마일스톤의 흔들림(shake 2)이 5.8~9.3초 사이 아무 때나 와서 버튼 모서리 탐침과 겹치면 빗나간다. 원본·지금 모두 같은 흔들림이 같은 구간에 나온다(호출 기록 확인) — 테스트 쪽 경쟁 조건.
  - 이 과정에서 발견해 고친 것: `Fx.dur()`가 매번 `getComputedStyle`을 불러 타이머가 밀리던 문제(chainfx 매수음 간격 실패의 원인) → 캐시.

## 결정이 필요한 것 (임의로 정한 값)

1. '모션 강도'를 **새 설정 스테퍼(0~100%, 기본 100)**로 추가했고 '화면 흔들림' 켬/끔은 그대로 두었다. 0% = 모션 끔 + 연출 재생 없이 결과. 둘을 하나로 합칠지?
2. 장 속도 0.5×의 보정값은 지시에 없어 **1.0**(느려지지 않음).
3. 시스템 '동작 줄이기'면 설정에서 흔들림을 켜도 **항상 끔**으로 통일(예전엔 반쪽만 켜짐).
4. 분기 충돌 두 곳을 **정지 쪽**으로: 보너스 카드 = 정지 금빛 테두리, 위험 줄 = 정지 빨간 테두리.
5. 모션 스케일은 지시대로 정산 무대·결산 체인·연출 큐에만. 토스트·도장·칩 등 CSS 지속시간과 카운트다운 숫자 팝은 1× 그대로.
6. 쌓임 정책에 세는 것: 요소·클래스 연출 + 큐 재생 항목 + 날아가는 카드 (파티클은 따로 상한 150). 토스트도 센다. 간격 배율 0.5.
7. 흔들림 클래스는 애니메이션이 끝나도 **최소 700ms 남김**(예전 관찰 창 유지 — 테스트·다른 코드가 클래스를 본다).
