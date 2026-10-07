# 전투 화면 모션 — 모션 강도별 최종 화면 비교

조작 순서마다 모션 시계를 3초 흘린 뒤 1920×1080 전체를 찍어 100%와 픽셀 비교 (다른 픽셀 수). 0%는 모션 끔(isMotionReduced → body.no-motion, bmK 0) = [0,true].

상태 = 전투 화면 요소마다 [id/태그·클래스·글자·hidden·display·visibility·opacity·transform·translate·scale·위치·크기]가 다른 요소 수 (body의 no-motion 클래스는 제외).

| 체크포인트 | 픽셀 0% vs 100% | 픽셀 70% vs 100% | 상태 0% vs 100% | 상태 70% vs 100% |
|---|---:|---:|---:|---:|
| buy | 1248 | 0 | 0 | 0 |
| buy2 | 8429 | 0 | 0 | 0 |
| open | 0 | 0 | 0 | 0 |
| ticks | 0 | 0 | 0 | 0 |
| deny | 0 | 0 | 0 | 0 |
| bigmove | 0 | 0 | 0 | 0 |
| sell | 0 | 0 | 0 | 0 |
| ticks2 | 0 | 0 | 0 | 0 |
