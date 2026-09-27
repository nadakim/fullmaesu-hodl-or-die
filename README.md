# fullmaesu-hodl-or-die
Retro 2D trading game prototype — BULL TRAP

# 풀매수 기원단: BULL TRAP
> 주식 시장의 급등락과 도파민을 카드 게임으로 재해석한 레트로 2D 트레이딩 게임.

## 🎮 Project

**풀매수 기원단: BULL TRAP**은 주식 시장의 급등과 폭락을 게임 시스템으로 재해석한 2D 게임 프로젝트입니다.

현재는 군복무로 인하여 사이버지식정보방에서 HTML / CSS / JavaScript / Canvas를 활용한 웹 프로토타입을 개발하고 있으며, 이후 웹 그대로 데스크톱 래퍼(Electron)로 포장해 스팀에 출시하는 것을 목표로 합니다. Unity 이식은 출시·흥행 이후 필요할 때 검토합니다.

## ✨ Core Features

* 실시간 OHLC 캔들 차트
* 매수 / 매도 시스템
* 현금 및 포지션 관리
* 평가손익 / 확정손익
* 랜덤 시장 변동
* 급등 / 급락 시장 이벤트
* 카드 시스템
* 유물 시스템
* 상점 시스템
* 레트로 픽셀 UI

## 🛠 Tech Stack

### Current Prototype

* HTML
* CSS
* JavaScript
* Canvas

### Balance Simulator

* `node tools/sim/sim.cjs --n 400 --tip random` — 봇 5종으로 N판 자동 진행, 결과 표 출력 (Playwright 필요). 기준점: `docs/balance-baseline.md`

### Planned

* Electron (데스크톱 래퍼, 스팀 출시)
* Unity + C# 이식은 출시 이후 필요할 때 검토

## 📌 Development Status

현재 웹 프로토타입 개발 중

* [x] 기본 게임 화면
* [x] 캔들 차트
* [x] 매수 / 매도
* [x] 자산 및 손익 시스템
* [x] 랜덤 시장 변동
* [x] 시장 이벤트
* [ ] 카드 / 유물 시스템 고도화
* [ ] 상점 시스템
* [ ] 게임 밸런싱
* [ ] Electron 포장 (스팀)
* [ ] 출시 준비

## 📖 Development Log

개발 과정과 주요 문제 해결 기록은 `DEVELOPMENT_LOG.md`에서 확인할 수 있습니다.

## 🎯 Goal

웹 프로토타입을 통해 핵심 게임 시스템을 검증한 후 웹 그대로 Electron으로 포장해 스팀에 출시하는 것을 목표로 합니다. 엔진(게임 로직)은 DOM과 분리해 두어 나중에 Unity 이식이 필요해도 옮길 수 있게 유지합니다.
