# M0 모션·연출 조사 결과 전문 (코드 수정 없음)

조사 기준: `origin/main` 10ee996 (`docs/demo` 7,878줄 · `docs/fx.js` 391 · `docs/audio.js` 715 · `docs/music.js` 612 · `docs/soundlab.js` 411). 정적 분석(grep·파싱) + 화면 측정. 줄 번호는 모두 이 커밋 기준.
**한계**: 실제 프레임 시간(fps)은 측정하지 않았다(성능 항목은 코드 구조에서 읽은 위험이고 수치 근거 아님). 아래 '트리거' 열의 클래스 부착 위치는 클래스명을 grep한 추정이라 틀릴 수 있다.

## 한눈에

| 항목 | 수 |
|---|---|
| CSS `@keyframes` | 92개 (전부 `docs/demo`, `docs/fx.js`엔 0) |
| `animation:` 선언 | 144곳 중 `none`(끄기) 제외 **110건**(1-1 표), 그중 무한 반복(∞) **39건** |
| CSS `transition:` | **1곳**(demo:293 `transform .18s steps(6)`) — 거의 모든 움직임이 keyframes + `steps()` |
| 키프레임 중 transform·opacity만 쓰는 것 | 64/92 |
| 레이아웃 속성(`margin-left`·`background-position`) 애니메이션 | 4개 (relicCrack·hazeDrift·speedLines·gaTape) |
| `box-shadow`·`filter`·`text-shadow`·`clip-path` 애니메이션 | 24개 |
| `requestAnimationFrame` | `docs/demo` 13곳 + `docs/fx.js` 3곳 |
| `setTimeout` | `docs/demo` 57곳 + `docs/fx.js` 15곳 / `setInterval` 3곳(+music.js 1) |
| Web Animations API(`el.animate`) | `docs/demo:3315`·`3343`·`3599` |
| 외부 애니메이션 라이브러리 | **없음** |

---

## 1. 애니메이션·연출 전체표

### 1-1. CSS keyframes (화면별)

규칙: 거의 전부 `steps(N)`(픽셀풍). `∞` = 무한 반복. `body.no-motion`·`@media (prefers-reduced-motion)`로 끄는 변형 선언은 위 표에서 제외했다(없는 것은 아래 6번에 정리).


#### 타이틀 (11건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 258 | `.t-ko .t-ch.pop` | tPop | .6s | 클래스 부착 demo:5736, demo:7675 |
| 275 | `` | badgeFloat | 2.4s∞ | 상시 |
| 301 | `.t-item.flash::before` | tFlash | .2s | 클래스 부착 demo:3734, demo:7705 |
| 330 | `#screen-title.intro-full .t-crt::before,#screen-title.intro-` | crtOpen | .4s | 클래스 부착 demo:7769, demo:7777 |
| 331 | `#screen-title.intro-full .t-crt i` | crtLine | .4s | 클래스 부착 demo:7769, demo:7777 |
| 332 | `#screen-title.intro-short .t-crt::before,#screen-title.intro` | crtOpen | .25s | 클래스 부착 demo:7769, demo:7777 |
| 333 | `#screen-title.intro-short .t-crt i` | crtLine | .25s | 클래스 부착 demo:7769, demo:7777 |
| 336 | `#screen-title.intro-full .t-chart` | tFadeChart | .35s | 클래스 부착 demo:7769, demo:7777 |
| 338 | `#screen-title.intro-full .t-ko .t-ch,#screen-title.intro-ful` | tType | .01s | 클래스 부착 demo:7769, demo:7777 |
| 340 | `#screen-title.intro-full .t-menu > *` | tSlide | .2s | 클래스 부착 demo:7769, demo:7777 |
| 358 | `.ticker` | scrollLeft | 22s∞ | 상시 |

#### 전투 화면(TR룸) — 손패·HUD·포지션·시세 (30건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 500 | `.card.gcard.boost:not(.disabled)` | boostGlow | 1.6s∞ | 상시·클래스 부착 demo:4260, demo:4822 |
| 501 | `.hand .card.gcard.boost:not(.disabled)` | boostGlow | 1.6s∞ | 상시·클래스 부착 demo:4260, demo:4822 |
| 502 | `body.no-motion .hand .card.gcard.boost:not(.disabled)` | boostGlow | 1.6s∞ | 상시·클래스 부착 demo:4260, demo:4822 |
| 652 | `.hand .card.gcard` | handIdle | 3.2s∞ | 상시 |
| 794 | `.relic.g2` | relicGlowG | 1s∞ | 상시·클래스 부착 fx.js:134 |
| 795 | `.relic.g3` | relicGlowY | .8s∞ | 상시 |
| 796 | `.relic.g4` | relicGlowR | 1.2s∞ | 상시·클래스 부착 demo:4730 |
| 802 | `.fx-relic-big.crack` | relicCrack | .12s∞ | 상시·클래스 부착 demo:3347 |
| 804 | `.fx-lost` | lostFall | 1.1s | 클래스 부착 demo:3357 |
| 913 | `.fss.appear` | fssAppear | .4s | 클래스 부착 demo:4353 |
| 1564 | `#totalAssets.fx-pulse` | totalPulse | .16s | 클래스 부착 demo:3629 |
| 1568 | `.fx-hit` | fxHit | .45s | 클래스 부착 fx.js:48, fx.js:54 |
| 1570 | `.balance-main.fx-goal` | fxGoal | .6s | (정적 클래스·마크업) |
| 1572 | `.fss-track.fx-jiggle` | fxJiggle | .3s | (정적 클래스·마크업) |
| 1574 | `.fss.hot .fss-track` | fssPulse | 1s∞ | 상시·클래스 부착 demo:4353 |
| 1599 | `.relic.fx-relic-on` | relicOn | .5s | (정적 클래스·마크업) |
| 1603 | `.target-track.fx-goal` | fxGoal | .6s | (정적 클래스·마크업) |
| 1604 | `.fx-blink-up` | blinkUp | .25s∞ | 상시·클래스 부착 demo:3043, demo:3055 |
| 1605 | `.fx-blink-down` | blinkDown | .25s∞ | 상시·클래스 부착 demo:3043, demo:3055 |
| 1611 | `#handBox .card.gcard.deal` | dealIn | - | 클래스 부착 demo:3703, demo:3707 |
| 1613 | `#handBox .card.gcard.shine` | rareShine | .7s | 클래스 부착 demo:3708 |
| 1617 | `.countdown .cd-num` | cdPop | .3s | 클래스 부착 demo:3728, demo:3733 |
| 1619 | `.countdown.flash` | cdFlash | .3s | 클래스 부착 demo:3734, demo:7705 |
| 1624 | `.pos-item.flame-2` | flame2 | .5s∞ | 상시 |
| 1625 | `.pos-item.flame-3` | flame3 | .3s∞ | 상시 |
| 1628 | `.pos-item.fx-newhigh` | newHigh | .6s | 클래스 부착 demo:3758 |
| 1630 | `.pos-item.fx-danger` | dangerPulse | var(--beat-ms,900ms)∞ | 상시·클래스 부착 demo:4834, demo:4925 |
| 1634 | `.fx-danger-edge.beat` | edgeBeat | .36s | 클래스 부착 demo:3662, demo:3795 |
| 1858 | `.play-left .news-banner.marquee > span` | newsMarquee | var(--mq-dur, 10s)∞ | 상시·클래스 부착 demo:2736 |
| 2022 | `.card.cv.r-mythic .cv-gem` | gemTwinkle | 3.2s∞ | 상시·클래스 부착 demo:4203 |

#### 장중 공통 연출(Fx) (21건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 722 | `.popnum` | pixelPop | .9s | 클래스 부착 demo:7014 |
| 737 | `.bill` | pixelFall | 1.6s | (정적 클래스·마크업) |
| 1517 | `.cabinet.shake` | shake | .4s | 클래스 부착 demo:3208, demo:3734 |
| 1519 | `.red-flash` | fadeOut | .5s | 클래스 부착 demo:3208 |
| 1523 | `.cabinet.shake-1` | shake1 | .25s | 클래스 부착 fx.js:36, fx.js:37 |
| 1524 | `.cabinet.shake-2` | shake | .4s | 클래스 부착 fx.js:36, fx.js:37 |
| 1525 | `.cabinet.shake-3` | shake3 | .56s | 클래스 부착 fx.js:36, fx.js:37 |
| 1526 | `.cabinet.fx-glitch` | fxGlitch | .38s | 클래스 부착 fx.js:36, fx.js:79 |
| 1527 | `.cabinet.shake-3.fx-glitch` | shake3 | .56s | 클래스 부착 fx.js:36, fx.js:79 |
| 1532 | `.fx-scan` | fxScan | .38s | 클래스 부착 fx.js:83 |
| 1538 | `.fx-stamp` | fxStamp | .95s | (정적 클래스·마크업) |
| 1545 | `.fx-screen.survive` | fadeOut | var(--fx-ms, .5s) | 클래스 부착 demo:3504 |
| 1547 | `.unit-pop` | unitPop | var(--pop-ms, .42s) | 클래스 부착 demo:3533 |
| 1558 | `.fx-speed` | speedLines | var(--fx-ms, .4s) | 클래스 부착 demo:3585 |
| 1576 | `.fx-combo` | pixelPop | .9s | 클래스 부착 fx.js:120 |
| 1588 | `.fx-chainctr.on` | chainPop | .3s | 클래스 부착 demo:3444, demo:3484 |
| 1593 | `.fx-chip` | chipUp | 1.1s | 클래스 부착 fx.js:281 |
| 1704 | `.fx-streak.c4` | rainbow | .6s∞ | 상시·클래스 부착 demo:3429, demo:3431 |
| 1705 | `.fx-streak.c5` | jackpotFlash | .7s∞ | 상시·클래스 부착 demo:3429, demo:3431 |
| 1707 | `.fx-streak.bump:not(.c4):not(.c5)` | comboBump | .22s | 클래스 부착 demo:3448 |
| 1709 | `.fx-streak.cool` | streakBreak | 1.6s | 클래스 부착 demo:3470, demo:3474 |

#### 갭 경보 (5건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 1642 | `.ga-flash` | gaFlash | .45s | 클래스 부착 demo:3026, demo:3112 |
| 1649 | `.ga-rays` | gaRays | .6s∞ | 상시·클래스 부착 demo:3026, demo:3112 |
| 1656 | `.ga-box` | gaInUp | .42s | 클래스 부착 demo:3027, demo:3113 |
| 1663 | `.ga-tape` | gaTape | .5s∞ | 상시·클래스 부착 demo:3028, demo:3114 |
| 1686 | `.ga-vig` | gaVig | .3s | 클래스 부착 demo:3169 |

#### 장 마감 정산 무대 (13건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 1303 | `.stage-mult.f3` | stageJitter | .12s∞ | 상시·클래스 부착 demo:5792, demo:5845 |
| 1304 | `.stage-mult.f4` | stageJitter | .08s∞ | 상시·클래스 부착 demo:5792, demo:5845 |
| 1318 | `.sh-flame i` | shFlick | var(--fl-ms, .16s)∞ | 상시·클래스 부착 demo:5784 |
| 1331 | `.sh-num.pop` | shPop | var(--pop-ms, .26s) | 클래스 부착 demo:5736, demo:7675 |
| 1332 | `.sh-num.slam` | shSlam | var(--slam-ms, .52s) | 클래스 부착 demo:5745 |
| 1341 | `.overlay-box.stage-live.stage-rage::before` | ovRage | var(--rage-ms, 1600ms)∞ | 상시·클래스 부착 demo:5722, demo:6009 |
| 1346 | `.sh-steam i` | steamUp | var(--steam-ms, 1100ms)∞ | 상시·클래스 부착 demo:5784 |
| 1357 | `.overlay-box.ov-shake-1` | ovShake1 | .25s | 클래스 부착 demo:6009, fx.js:37 |
| 1358 | `.overlay-box.ov-shake-2` | ovShake2 | .4s | 클래스 부착 demo:6009, fx.js:37 |
| 1359 | `.overlay-box.ov-shake-3` | ovShake3 | .56s | 클래스 부착 demo:6009, fx.js:37 |
| 1367 | `.stage-reel.spin` | stageJitter | .06s∞ | 상시·클래스 부착 demo:5706, demo:5825 |
| 1380 | `.sf-box.hit` | sfHit | .22s | 클래스 부착 demo:5757, fx.js:48 |
| 1385 | `.overlay-box.pre-shake` | preShake | var(--shake-ms, .2s) | 클래스 부착 demo:5762, demo:6009 |

#### 주간 결산 체인 (9건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 1392 | `.chain-row` | chainIn | .24s | 클래스 부착 demo:5791, demo:5933 |
| 1400 | `.chain-total.final.up` | chainGlow | .6s | 클래스 부착 demo:3025, demo:4199 |
| 1401 | `.chain-total.final.down` | chainGlow | .6s | 클래스 부착 demo:3025, demo:3111 |
| 1408 | `.chain-chip` | chipDrop | .4s | 클래스 부착 demo:5811, demo:5840 |
| 1417 | `.chain-stamp` | stampIn | .32s | 클래스 부착 demo:6120, demo:6149 |
| 1420 | `.chain-rest` | chainIn | .24s | 클래스 부착 demo:5795, demo:5936 |
| 1421 | `.chain-sum` | chainIn | .24s | 클래스 부착 demo:5796, demo:5937 |
| 1424 | `.chain-next` | nextIn | .36s∞ | 상시·클래스 부착 demo:5998, demo:6162 |
| 1426 | `body.no-motion .chain-next` | nextIn | .36s | 클래스 부착 demo:5998, demo:6162 |

#### 암시장·팩 개봉 (12건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 923 | `.rm-next.rm-up` | rmUp | .6s | 클래스 부착 demo:6529 |
| 975 | `.flip-card` | cardFlip | .6s | 클래스 부착 demo:6509, demo:6577 |
| 996 | `.rr-out` | rrOut | .22s | 클래스 부착 demo:6471 |
| 998 | `.rr-in` | rrIn | .5s | 클래스 부착 demo:6517 |
| 1009 | `#screen-shop::after` | hazeDrift | 14s∞ | 상시 |
| 1011 | `#screen-shop.haze-in #shopBox` | hazeIn | 1.2s | 클래스 부착 demo:6610, demo:6611 |
| 1014 | `#shopBox .shop-item:hover .card,#shopBox .pack:not(.disabled` | shopFloat | 1.4s∞ | 호버 ∞ |
| 1019 | `.pk-float` | pkDescend | .6s | 클래스 부착 demo:6577 |
| 1020 | `.pk-shake` | pkShake | - | 클래스 부착 demo:6577 |
| 1025 | `.pk-pillar` | pkPillar | 1.4s | 클래스 부착 demo:6576 |
| 1030 | `.flip-stage.mythic .pk-float .flip-card` | mythSpin | 1.2s | 클래스 부착 demo:6509, demo:6577 |
| 1037 | `.relic-tile.slot-in` | slotIn | .32s | 클래스 부착 demo:6546 |

#### 공통(토스트·버튼·깜박임) (9건)

| docs/demo 줄 | 대상 | 애니메이션 | 지속(∞=반복) | 트리거 |
|---|---|---|---|---|
| 165 | `.btn-chunky.breathe:not(:disabled)` | bkBreathe | 1.5s∞ | 상시 |
| 298 | `.t-item.sel .t-cur` | blink | .5s∞ | 상시·클래스 부착 demo:7689, demo:7690 |
| 319 | `.t-press` | blink | 1.1s∞ | 상시 |
| 690 | `.fuse.hot .fz-cord::after` | blink | .4s∞ | 상시·클래스 부착 demo:4894 |
| 1122 | `.fss.hot .fss-label,.fss.hot .fss-state` | blink | 1s∞ | 상시·클래스 부착 demo:4353 |
| 1239 | `.toast` | toastIn | 2.6s | 클래스 부착 demo:2962 |
| 1431 | `.chain-skip` | blink | 1.2s∞ | 상시·클래스 부착 demo:5798, demo:5939 |
| 1562 | `body.closing #dayText,body.closing #openBtn` | blink | .5s∞ | 상시·클래스 부착 demo:3612, demo:3984 |
| 1671 | `.ga-warn` | blink | .4s∞ | 상시·클래스 부착 demo:3032, demo:3117 |

### 1-2. JS 연출 (rAF·타이머·Web Animations·Canvas)

| 화면/영역 | 줄 | 무엇이 | 지속시간 | 트리거 |
|---|---|---|---|---|
| 공통(게임 루프) | demo:7852-7866 | 시장 tick 루프(`setTimeout` 재귀) | `TICK_MS(800ms) ÷ 장중속도` | 앱 시작 후 상시. 히트스톱·`Fx.queueBusy`·오버레이 중엔 tick을 건너뜀 |
| 공통(Fx 큐) | fx.js:340-364 | 연쇄 연출 큐(순차 재생, 클릭·Space·Enter 스킵) | 항목 `duration × FX_QUEUE_SPEED[fxSpeed].dur`, 항목 간 `gap`(450/250/100ms) | `Fx.enqueue` ← `enqueueGap`·`enqueueLiquidation`·`enqueueRelic*`·`enqueueTipResult`·`enqueueCountdown`·`enqueueBossAlert` |
| 공통(히트스톱) | fx.js:43-55 | 게임 루프를 N ms 미룸 + 정산 무대 가상시간 정지 | 60~100ms대(`FX_TIER`), 곱하기 `multHitStopMs` | `Fx.hitStop` 호출(큰 이벤트) |
| 공통(Fx) | fx.js:59-100 | `shake`(캐비닛)·`glitch`·`stamp`·`flash` | 700ms 정리 타이머 / `FX_GLITCH_MS` 380 / `FX_STAMP_MS` 950 / 650 | 이벤트 → `Fx.*` |
| 공통(Fx) | fx.js:105-160 | `punch`(숫자 펀치)·`cardFly`(날아가는 카드, 잔상 `k*45ms`) | 900ms 태그 정리 / 카드 연쇄 간격 45ms | 카드 사용·순자산 변화 |
| 공통(Canvas 파티클) | fx.js:164-322 | 캔버스 한 장(`FX_MAX_PARTICLES` 150) — `coinsTo`·`billRain`·`coinRain`·`streak`·`shatter`·`sparks`·`burst`·`chip` | 파티클 수명(코드 내 상수) | 활성 파티클이 있을 때만 rAF(fx.js:186, 225) |
| TR룸 장중 | demo:3782-3800 | `heartLoop` — 위험 포지션 심장 박동·BGM 로우패스 | 반복 간격 400ms~(`heartInterval`) | 앱 시작 후 상시(위험 없으면 400ms마다 검사만) |
| TR룸 장중 | demo:3569·3620·3665 | `rocket`(급등 로켓)·`cashout`(매도 동전)·`slowMo`(`document.getAnimations()` 재생속도) | `JUICE_CONFIG`(`rocket*`·`cashout*`·`slowMoMs`) | tick 뒤 `juiceRockets/Survive/Closing`, 매도 |
| TR룸 | demo:3692-3714 | `playDeal` 장전 드로우(부채꼴, `setTimeout` 카드별) | `dealMs`·`dealGapMs` | `dayStart` → 다음 `renderHand` |
| TR룸 | demo:3720-3760 | `enqueueCountdown` 3·2·1 → 벨 | `countdownMs` | '▶ 장 시작' 버튼 |
| TR룸 | demo:3432-3520 | 수익 콤보(`comboHit`/`comboBreak`, idle·cool 타이머) | `comboIdleMs`·`comboCoolMs` | 오른 캔들·수익 매도·적중 |
| TR룸 | demo:3315·3343·3599 | `el.animate()` — 유물 대발동·유물 깨짐·콤보 슬램 | `ctx.duration`·`comboSlamMs` | `enqueueRelicBig/Shatter`, `comboTierUp` |
| TR룸 | demo:7451-7470 | `tiltFrame` 카드 기울기(mousemove → rAF 1회) | 마우스 이동 동안 | `TILT_SEL` 카드 위 호버 |
| 장 마감 정산 무대 | demo:5770-5980 | `playDayStage`·`playPlainStage` — 가상시간 타임라인(`stage.events`, rAF 1개) | `JUICE_CONFIG.stageMs`(intro 420·row 300·step 480·count 800…) / 간이 `plainStageMs` ≈ 1초 | `daySettled` → 다음 날 장전 뒤 `whenFxIdle` |
| 주간 결산 체인 | demo:6042-6200 | `playSettlementChain` — `setTimeout` 배열(`chainPlay.timers`) | `CHAIN_MS`(row 280·chip 480·stamp 520·end 900) | `roundClear` |
| 암시장 | demo:6561-6590·6608 | `juicePack` 팩 개봉(흔들 → 터짐 → 뒤집기), `enterShopHaze` | `packShakeMs`·`packFlipMs`·`mythDarkMs`·`hazeInMs` | 팩 구매·암시장 입장 |
| 타이틀 | demo:7598-7632·7793-7796 | 흐르는 캔들 차트(rAF)·CRT 노이즈(`setInterval 90ms`)·로고 상한가/하한가 타이머 | rAF 상시 / 90ms / 5~8초 간격 | 타이틀 화면에서만(`currentTab === 'title'`) |
| 공통 | demo:7806-7814 | `skipLoop` — '스킵 ▶' 버튼 표시 판정 | 매 프레임 | **앱 시작 후 상시 rAF** |
| 설정(CRT 곡률) | demo:6786-6810 | 루트 `html`에 SVG `feDisplacementMap` 필터(기본 곡률 30%) | 상시(정지 필터, 화면 갱신 때마다 재래스터) | 설정 `crtCurve`>0·`?crt=0` 아니면 |
| 디버그 | demo:7027-7126 | JUICE TUNER·`tunerComboTest`(`setInterval 220ms`)·`tunerStageTest` | — | `?debug=1`·`?tuner=1`·백틱 |
| 디버그 | demo:6872-6879 | `?perf=1` 프레임 시간 표시(rAF) | 매 프레임 | `?perf=1`일 때만 |

---

## 2. JUICE TUNER와 정산 무대·결산 체인 구조

### JUICE TUNER (demo:7027-7126)

- 조정 대상은 **`JUICE_CONFIG`**(demo:5573-5678, **최상위 키 97개, 숫자 칸 152개**)뿐이다. 중첩 배열·객체 안 숫자까지 `tunerLeaves`가 전부 슬라이더로 만든다. 그룹별: 정산 무대·결산 82 · 고조(juice-escalation) 32 · 콤보 19 · TR룸(드로우·카운트다운·불꽃·심장) 10 · 암시장 7 · 기울기·버튼 2.
- 등록: 별도 등록 코드가 없다. **`JUICE_CONFIG`에 숫자를 넣으면 자동으로 패널에 뜬다**(`buildTuner`가 `JUICE_DEFAULTS`를 순회). 슬라이더 범위는 기본값의 4배까지(0이면 0~10, 1 미만이면 0~1, `tunerRange`).
- 저장: 바꿀 때마다 `localStorage['hodl.tuner']`에 `JUICE_CONFIG` 전체 JSON(`tunerSave`). **불러오기는 `?tuner=1`/`?debug=1`일 때만**(`tunerLoad`, `onload` demo:7868) — 보통 플레이는 기본값. '기본값'(`tunerReset`)은 값을 되돌리고 저장 삭제, '값 복사'는 JSON을 클립보드·글상자로.
- 보조 기능: 콤보 테스트(1→20→끊김), 정산 무대 테스트(가짜 ×2→×10,000), 유물 장착(`__debug.giveRelic`).
- **조절되지 않는 것**: CSS `@keyframes`의 고정 시간(위 표의 `.6s`·`1.5s` 등 대부분), `fx.js` 상수(`FX_TIER`·`FX_GLITCH_MS`·`FX_STAMP_MS`·`FX_QUEUE_SPEED`·`FX_MAX_PARTICLES`), `CHAIN_MS`(demo:6028, 결산 체인), `TITLE_*`(타이틀), 토스트 2600ms. 즉 튜너가 닿는 범위는 정산 무대·콤보·고조·TR룸 일부이고, 결산 체인·장중 일반 Fx는 코드 상수다.

### 장 마감 정산 무대 (`playDayStage` demo:5770, `playPlainStage` 5910, `stageFrame` 5971)

- 엔진 기록 `run.lastDay`(`daySettled`)를 **재생만** 한다(rand·상태 변경 없음). `stage = { events[], vt(가상시간), speed, clicks, raf, hold, end }` 객체 하나.
- 이벤트 배열은 시작 때 한 번에 만들어 시각 순서 정렬 → rAF 1개(`stageFrame`)가 `vt += Δt × speed`로 앞으로 가며 `events[idx].fn()` 실행. 히트스톱 중엔 `vt` 정지(demo:5975).
- 작은 정산(이번 판 최고 대비 `smallRatio` 미만)은 `speed = smallSpeed`(2배).
- **스킵**: 클릭·Space `stageSkip`(demo:5981) — 한 번 = `ffSpeed`(5배)로 빨리 감기, 두 번 = 결과로 점프(소리·흔들림 없이 최종 상태). 간이 무대는 한 번에 결과로. 결과에서 '▶ 다음 날'·Enter = `stageNext`(6000). 키보드 처리는 demo:7474-7480(Space/Enter 분기).

### 주간 결산 체인 (`playSettlementChain` demo:6042, `chainPlay`·`chainHold` 6033-6034)

- 엔진이 만든 `run.lastWeek.settlementChain`을 포지션별 행으로 재생. **가상시간 없이 `setTimeout` 배열**(`chainPlay.timers`)로 단계 예약(demo:6071 `at(ms, fn)`), 끝나면 `enterChainHold`.
- **스킵**: Space = `skipSettlementChain`(6179, 남은 소리 `Sound.stopAll()` + 도장 소리 1번 + 최종 결과로 점프). 스킵 직후 `CHAIN_SKIP_GUARD_MS` 300ms.
- 결과에서 **멈춤**(`chainHold`): `▶ 다음`·**Enter만** `chainNext`(6166)로 결산 화면으로. **Space는 안 넘긴다**(연타 방지), 결과 표시 후 `CHAIN_NEXT_GUARD_MS` 500ms는 입력 무시.
- 공통 스킵 버튼: `#fxSkipBtn`('스킵 ▶')이 `skipTarget()`(demo:7800)으로 현재 연출(큐·정산 무대·체인·팩 개봉·타이틀 등장)을 고르고 같은 함수를 호출.
- 구조적 비대칭: **무대는 rAF 가상시간, 체인은 setTimeout, Fx 큐는 setTimeout 큐**로 서로 다른 시간 모델 세 가지가 병존한다(히트스톱은 무대만 멈추고 체인·큐 타이머는 안 멈춘다).

---

## 3. 효과음(soundlab) 목록과 호출 지점

- `docs/soundlab.js`는 `?soundlab=1`일 때만 로드되는 청취·메모 화면이다. 효과음 이름은 `SOUND_CATEGORY_OF`(soundlab.js:20)에 **70개**, 카테고리 6종: ui 11 · feedback 26 · settle 13 · alarm 12 · sting 7 · ambient 1. 장면(`SCENES` :193)은 정산 작음/보통/대박·크리티컬·콤보·마감 임박·위험·개장·드로우·체인·팩·찌라시 등.
- 이름 → 언제 울리는지의 정식 표는 `docs/audio.js` 상단 주석(1~80줄).
- 호출 지점: `Sound.play('이름'…)` 리터럴 **60개 이름·89곳**(`docs/demo` 및 `docs/fx.js`) + 이름을 변수로 넘기는 동적 호출 4곳(demo:3047·5853·6121 등). 가장 많이 쓰는 이름: `countTick`(5곳)·`marketOpen`·`cardReject`·`dayEnd`·`settleThud`(각 3곳).
- **연출과 소리는 같은 이벤트에 '함수 안에서 나란히' 묶여 있다.** `onGameEvent`(demo:3863-4107, 58개 case)는 case마다 토스트·`Fx.*`·`enqueue*`·`Sound.play`를 직접 호출하고, 연쇄 큐 항목의 `play()` 안에서 `Sound.play`와 `Fx.hitStop/shatter/stamp`를 같이 부른다(예: `enqueueLiquidation` demo:3201-3216). 소리만/연출만 따로 끄는 구조는 없다(설정 `sound`·`shake`·`fxSpeed`가 각각 마스터 스위치).
- 소리 쪽 별도 규칙: 같은 이름은 `SFX_MERGE_MS` 안에 병합, 동시 `SFX_MAX_VOICES` 제한(`Sound.stats`로 관찰).
- 중복: `soundlab.js`의 `SCENES`(sceneSettle 등, :109~)는 게임의 정산·콤보 소리 순서를 **다시 써서 재현**한다(`JUICE_CONFIG.stageMs`는 읽지만 순서는 복제). 게임 쪽 연출을 바꾸면 Sound Lab 장면이 어긋날 수 있다.

---

## 4. 이벤트가 UI로 가는 방식 · 모션 후보 지점

- **방식 = 엔진 `emit(type, data)` → 단일 리스너 콜백.** `engine.js:843-850` `emit`이 `eventLog`에 쌓고 `setEventListener`로 등록된 함수 하나를 부른다. UI는 `docs/demo:3862` `setEventListener((type, d) => onGameEvent(type, d))` 한 줄. **이벤트 버스·다중 구독 없음.** 엔진의 `emit` 종류 60개 중 `onGameEvent`가 58개 처리, **미처리 2개: `relicSlotsFull`·`signalsResolved`**.
- `onGameEvent` 하나가 245줄·58 case의 거대 switch(demo:3863-4107). 새 연출은 그 case에 추가하거나 `enqueue*`로 넘기는 구조.
- 이벤트 로그 소비처는 한 곳(플레이테스트 기록 demo:5448)뿐.
- UI 쪽 직접 호출(이벤트 없이): 입력 핸들러 → 엔진 함수 → `renderAll()`(예: 카드 클릭 `playCardFx`), 게임 루프 tick 뒤 `notePosTicks`·`juiceRockets/Survive/Closing`·`renderAll`(demo:7852-7862).
- **모션을 붙일 후보(현재 연출이 약하거나 없는 곳)**: 
  1. 카드 사용 실패(`cardRejected`·`shopRejected`) — 소리+토스트뿐, 해당 카드/버튼 흔들림 없음.
  2. 시장 지도 타일 갱신(`renderQuoteMap`) — 색만 바뀜(타일 번쩍임·등락 화살표 모션 없음).
  3. 매수 직후 포지션 줄 등장(`bought` → 줄이 그냥 생김; `.pos-item` 진입 모션 없음, `slotIn`은 유물 전용).
  4. 암시장 구매 후 재고 갱신(`singleBought`·`buyBtn`) — 재렌더로 통째로 바뀜. 스크롤 목록 도입 이후 위치 유지는 되지만 진입·퇴장 모션 없음.
  5. 목표 진행 바(`.target-track`) — `fxGoal`(돌파 번쩍)만, 증가 모션 없음.
  6. 보상·덱 확인 창 진입 — `showOverlay`가 즉시 교체(진입 모션 없음, 정산 무대·체인만 자체 모션).
  7. 손패 카드 소모(`cardPlayed`)는 `Fx.cardFly`가 있으나 소멸·버림 더미 쪽 도착 모션은 `#pileDiscard` 숫자 변화뿐.

---

## 5. 장 속도(0.5x~4x)가 연출 시간에 반영되는가

- **게임 루프 간격에만 반영**: `setTimeout(loop, TICK_MS / settings.speed)`(demo:7864, 7866). 캔들 1개 간격이 1600ms(0.5×)~200ms(4×).
- 속도를 읽는 다른 곳은 **`closeRoll` 효과음 길이 하나**(demo:3617 `TICK_MS / settings.speed / 1000 * 0.95`)뿐이다.
- **그 외 모든 연출 시간은 속도와 무관(실시간 고정)**: CSS keyframes(토스트 2.6s 등), `Fx` 큐(`fxSpeed` 별도 설정 보통/빠름/최소), 정산 무대·결산 체인(별도 `smallSpeed`·`ffSpeed`), 콤보 만료 타이머(`comboIdleMs`, 틱이 아니라 ms), `heartLoop` 400ms~, 로켓·마감 임박 연출.
- 결과: 4×에서 틱이 200ms인데 연출은 0.3~2.6초 → 연출이 쌓인다. 완충 장치는 두 가지: ① `Fx.queueBusy`(blocking 큐 항목)·히트스톱이 tick을 **미룬다**(속도가 사실상 무력화), ② 오버레이가 열리면 시장이 멈춘다. 반대로 0.5×에서는 연출이 틱보다 짧아 템포가 느려진다.
- `fxSpeed`('최소')는 큐 gap 100ms·`dur` 0.45배·갭 경보 약화만 줄이고 CSS keyframes·소리는 그대로.

---

## 6. 성능 위험 (코드에서 읽은 것, **fps 실측 아님**)

1. **상시 rAF**: `skipLoop`(demo:7811)은 앱 시작부터 매 프레임 `skipTarget()`을 부른다(탭 숨김 시 브라우저가 멈춤). 가벼운 DOM 조회지만 다른 상시 rAF는 없음(`tiltFrame`은 마우스 이동 시, `stageFrame`은 정산 무대 재생 중, `fx.js` 파티클은 활성 파티클이 있을 때, 타이틀 rAF·노이즈 `setInterval 90ms`는 타이틀에서만).
2. **전체 화면 필터**: 설정 기본값에서 루트 `html`에 `filter:url(#crtBarrel)`(SVG `feDisplacementMap`, 곡률 30%) — 화면의 어떤 애니메이션이든 필터 영역 재래스터를 일으킬 수 있다. 저장소는 `?perf=1`(demo:6872)로 켬/끔 비교를 하라고 만들어 둠. **측정하지 않았다.**
3. **무한 반복 + paint-heavy**: `bkBreathe`(`filter:brightness`, '장 시작'·'다음' 버튼 ∞, demo:166), `boostGlow`(box-shadow ∞, 정산 보너스 카드 최대 10장, 500-501), `relicGlowG/Y/R`(box-shadow ∞, 유물 등급별), `flame2/3`(box-shadow ∞, 보유 포지션 줄), `dangerPulse`(box-shadow ∞, 위험 줄), `rainbow`(콤보), `blinkUp/Down`(∞), `gaRays/gaTape`(갭 경보 중). `hazeDrift`(`background-position` ∞ 14s steps(28), 암시장 전체 화면 `position:fixed` 가상요소, demo:1009-1010). 모두 `steps()`라 프레임 수는 적지만(2~28단계) 매 단계 repaint.
4. **레이아웃 속성 애니메이션**: `relicCrack`(`margin-left`, ∞ .12s), `hazeDrift`·`speedLines`·`gaTape`(`background-position`). 나머지 64/92는 transform·opacity만.
5. **전체 화면 filter 키프레임**: `fxGlitch`(`.cabinet`에 `drop-shadow` 2개, .38s), `hazeIn`(암시장 입장 1.2s), `chainGlow`, `rareShine`(box-shadow+filter, 희귀 카드 드로우 때 2회 반복).
6. **프레임/틱마다 재렌더**: `renderAll()`(demo:4973)이 tick마다(200~1600ms) + 대부분의 이벤트마다 호출 — 안에서 `renderMainChart`가 **캔버스 크기를 매번 다시 지정**(`cc.width = …`, demo:2764-2780, 백킹 스토어 재할당)하고 전체를 다시 그림, `renderQuotes`가 스파크라인 13개 캔버스를 매번 다시 그림. 손패·포지션·유물은 시그니처(`handSig`·`posSig`·`relicSig`)로 변경 때만 `innerHTML` 재생성(OK). 암시장 `renderShop`은 구매 때마다 전체 `innerHTML`(48곳 중 가장 큼).
7. **고빈도 DOM 생성**: `Fx.chip`·`punch`·`stamp`·`cardFly`는 이벤트마다 요소 생성 + 타이머 제거(900~1100ms). 갭·청산 연출은 큐로 직렬화돼 있음.
8. 루트 CSS 변수 변경: `heartLoop`가 위험 중 매 박동마다 `documentElement.style.setProperty('--beat-ms')`(demo:3797) — 루트 변수 변경은 문서 전체 스타일 재계산 대상.
9. `slowMo`(demo:3665)는 `document.getAnimations()` 전체를 순회해 재생속도 조정(턱걸이 통과 때만).
10. `will-change`·`backdrop-filter` 사용 없음.

---

## 7. 외부 애니메이션 라이브러리

**없음.** `docs/demo` `<script src>`는 로컬 5개(`engine.js`·`assets/sfx/files.js`·`audio.js`·`music.js`·`fx.js`)이고 `soundlab.js`는 `?soundlab=1`에서만. GSAP·anime.js·Lottie·Howler·Tone 등 없음. Web Animations API(`el.animate`·`document.getAnimations`)와 Canvas 2D·Web Audio만 쓴다(CLAUDE.md 기술 스택 규칙과 일치).

---

## 빠진 것 · 중복 · 충돌 위험 (5줄)

1. **빠진 것**: 장 속도(0.5~4×)를 연출 시간에 곱하는 층이 없다(루프 간격만) — 4×에서 연출이 쌓이고(`Fx.queueBusy`가 tick을 미룸) 0.5×는 느슨하다. 진입 모션이 없는 화면(보상·덱·암시장 재고·포지션 줄)과 `relicSlotsFull`·`signalsResolved` 이벤트의 UI 반응도 없다.
2. **중복**: 시간 모델이 3개(정산 무대 rAF 가상시간 / 결산 체인 setTimeout 배열 / Fx 큐 setTimeout 큐)이고, `soundlab.js` `SCENES`가 게임의 소리 순서를 복제하며, '연출 끔' 분기도 `body.no-motion`·`@media prefers-reduced-motion`·JS `motionOK()` 세 가지가 따로 있다.
3. **충돌 위험(시간 하드코딩)**: JS 타이머가 CSS 시간과 별도로 박혀 있다(토스트 2600ms ↔ `toastIn 2.6s`, `fx-newhigh` 650ms ↔ `newHigh .6s`, `red-flash` 600ms ↔ `fadeOut .5s`). 한쪽만 바꾸면 요소가 끊기거나 남는다. 튜너는 `JUICE_CONFIG`만 만지고 CSS·`fx.js`·`CHAIN_MS`는 못 만진다.
4. **충돌 위험(동시 모션)**: 같은 요소·화면에 여러 keyframes가 겹친다(`.cabinet`의 `shake`+`fxGlitch`, `.overlay-box`의 `ov-shake`+`pre-shake`+`stage-rage`, 손패 `handIdle`+`boostGlow`+`rareShine`+`dealIn`). 소리 쪽은 동시 발음 제한으로 서로 끊는다(`Sound.stats.stolen`).
5. **성능 위험**: 기본 켜짐인 루트 SVG 곡률 필터 + 무한 box-shadow/filter 반복(버튼·유물·위험 줄) + tick마다 메인 차트 캔버스 재할당이 겹치는 구간(장중 + 위험 포지션 + 정산 보너스 카드)이 가장 무겁다고 *추정*된다 — 실측은 `?perf=1`로 해야 한다.
