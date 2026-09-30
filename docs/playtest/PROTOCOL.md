# 플레이테스트 프로토콜 — 관찰 테스트 5~10명

> 지금까지의 밸런스 데이터는 전부 봇(`sim/`)이다. 이 절차는 **사람이 얼마나 쉽게·어렵게 느끼는지**를 모은다.
> 별도 텔레메트리가 없는 환경(사지방 등)을 가정한다. 테스터는 판 기록을 **복사해서 보낸다**.

## 준비물

- 플레이 링크 (아티팩트 또는 `docs/demo`) 뒤에 **`?playtest=1`**을 붙인다.
  - 판이 끝날 때마다 게임오버·졸업 화면에 설문 3개 + 한 줄 후기와 **'📋 판 기록 복사'**가 뜬다.
  - 판 기록(JSON 포함)은 테스터 브라우저에 쌓인다 (localStorage `hodl.playtestLog`).
  - 테스트가 끝나면 **≡ 메뉴 › '📋 전체 기록 복사'** 한 번으로 모든 판을 받는다.
  - 주소를 못 바꾸는 환경이면 타이틀 › ⚙ 환경 설정 › **'플레이테스트 모드' 켜기**로 기록·복사만 켤 수 있다 (이때 설문은 뜨지 않는다).
- 판 기록에는 시드가 있다. `setSeed(시드)` 뒤 `startNewRun()`이면 같은 판이 재현된다 (개발자 콘솔).
- 관찰자 1명당 테스터 1명. 관찰 시트(아래 CSV)와 타이머를 준비한다.
- **첫 판을 해 본 적 없는 사람**이어야 한다. 이미 해 본 브라우저라면 시크릿 창을 쓴다. 해금 주차(`hodl.unlockWeek`)가 남아 있으면 첫 판 온보딩이 재현되지 않는다.

## 진행 (한 사람당 30~40분)

1. **설명 없이 시작한다.** "주식 카드 게임이에요. 편하게 해 보세요, 생각나는 걸 소리 내어 말해 주면 좋아요." 말고는 아무것도 알려 주지 않는다.
   - 질문을 받으면 "화면에서 찾아보시겠어요?"라고만 답한다. 30초 넘게 멈춰 있을 때만 한 번 힌트를 준다. 힌트를 줬다는 것도 기록한다.
2. **첫 3분은 관찰자가 계속 적는다** (아래 '적을 것').
3. 판이 끝나면 테스터가 설문(1~5점 3개 + 한 줄)을 채우고 **'📋 판 기록 복사'**를 눌러 관찰자에게 붙여 넣어 준다.
4. "한 판 더 하시겠어요?"라고 **묻기만** 한다. 강요하지 않는다. 대답과 실제로 다시 했는지를 둘 다 적는다.
5. 테스트가 끝나면 **≡ 메뉴 › 전체 기록 복사**로 전 판 기록을 받는다.
6. 짧은 인터뷰 (5분):
   - "가장 헷갈렸던 것은?"
   - "가장 짜릿했던 순간은?"
   - "왜 졌다고(이겼다고) 생각하세요?"

## 적을 것 (관찰자)

| 항목 | 기준 |
|---|---|
| **첫 3분 중 멈춘 지점** | 5초 이상 아무것도 누르지 않은 화면과 그때 시각 (예: "1:40 장전, 손패 앞에서 멈춤") |
| **질문한 것** | 테스터가 말로 물은 것, 그대로 받아 적는다 (예: "행동력이 뭐예요?") |
| **놀란 순간** | 소리를 내거나 표정이 바뀐 순간과 그 원인 (정산 무대 배수·반대매매·갭·찌라시 등) |
| **이탈 시점** | 그만하고 싶어 한 순간, 딴짓을 시작한 순간, 판을 포기한 순간 |
| 힌트 | 관찰자가 힌트를 줬는지, 무엇을 알려 줬는지 |
| "아깝다" | 판이 끝났을 때 "아깝다 / 한 번만 더" 같은 말을 했는지 (예/아니오) |

## 집계 지표

| 지표 | 계산 | 어디서 |
|---|---|---|
| **첫 판 사망 주차** | 테스터별 첫 판 `endWeek`의 중앙값·분포 | 판 기록 JSON |
| **"아깝다" 비율** | 첫 판이 끝나고 "아깝다"류 반응을 보인 테스터 ÷ 전체 | 관찰 시트 |
| **한 판 더 하겠다는 비율** | 설문 '바로 한 판 더' 4~5점 ÷ 응답, 그리고 실제로 한 판 더 한 비율 | 설문 `again` · 관찰 시트 |
| 재미 | 설문 '재미' 평균·분포 (판별, 테스터별 첫 판) | 설문 `fun` |
| 납득 | 설문 '납득' 평균, 3점 이하 판의 엔딩·사인 | 설문 `fair` · `ending`·`deathBoss` |
| 첫 3분 멈춤 수 | 테스터당 멈춤 횟수와 자주 멈춘 화면 순위 | 관찰 시트 |
| 봇과 비교 | 첫 판 사망 주차를 `docs/design/BALANCE_METRICS.md`의 봇 분포와 나란히 둔다 | 판 기록 · 시뮬 |

판정 목표 (첫 라운드 기준, 조정 가능):
- 첫 판 사망 주차 중앙값 ≥ 2주
- "아깝다" 비율 ≥ 50%
- 한 판 더 (설문 4~5점) ≥ 60%
- 첫 3분 멈춤 ≤ 2회

## CSV 템플릿

관찰 시트 (테스터 한 줄 = 한 판, 첫 판은 `run` = 1):

```csv
tester,run,date,device_window,hint_given,stop_points_first3min,questions,surprise_moments,drop_off_point,said_close_call,would_play_again_said,played_again,survey_fun,survey_fair,survey_again,survey_note,end_week,ending,death_boss,seed,max_day_mult,relics_with_week,deck_size,play_sec
T01,1,2026-10-01,1366x768,no,"1:40 장전 손패 앞","행동력이 뭐예요?","정산 ×12에서 소리 지름","3주차 보스 경보",yes,yes,yes,4,2,5,"3주차 보스 억까",3,MARGIN_CALL,bigStep,67453931,12.5,"개미 군단 깃발(1주)",16,742
```

- `survey_*`·`end_week`·`ending`·`death_boss`·`seed`·`max_day_mult`·`relics_with_week`·`deck_size`·`play_sec`는 판 기록 JSON에서 옮긴다. 이름은 JSON 키 `survey.fun/fair/again/note`·`endWeek`·`ending`·`deathBoss`·`seed`·`maxDayMult`·`relics[].name(week)`·`deckSize`·`playSec`다.
- 나머지 칸은 관찰자가 적는다.

집계 시트 (테스터 한 줄):

```csv
tester,first_run_end_week,first_run_close_call,first_run_again_score,runs_played,stops_first3min,top_confusion
T01,3,yes,5,2,1,"행동력"
```

## 판 기록 필드 (JSON)

`version` 게임 버전(`GAME_META`) · `seed` · `sessionRun` 세션 내 판 번호 · `endWeek`/`endDay`/`weeksCleared` · `ending`/`endingTitle` 엔딩 · `deathBoss` 사인(보스) · `bossPlan`/`bossesBeaten` 보스 일정·격파 · `endEquity`/`peakEquity` (만원) · `maxDayMult` 하루 최대 정산 배수 · `relics[{id, name, week}]` 보유 유물과 획득 주차 · `deckSize` · `playSec` 플레이 시간(초) · `settings{speed, fxSpeed, chainFx, shake, uiSize, fontSize, window}` · `survey{fun, fair, again, note}` (1~5, 0 = 안 누름).
