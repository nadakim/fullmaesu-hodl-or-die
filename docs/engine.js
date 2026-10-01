/* 풀매수 기원단: BULL TRAP — 게임 엔진 (CONFIG + ENGINE). DOM·Canvas·타이머를 쓰지 않는다.
   브라우저: docs/demo가 <script src="engine.js">로 불러오고, UI는 setEventListener()로 이벤트를 받는다.
   Node: sim/load-engine.js가 vm으로 불러온다 (헤드리스 시뮬레이터 sim/runner.js). */

/* ══════════════════════════════════════════════════════════
   CONFIG — 밸런스 수치는 전부 여기서 조절
══════════════════════════════════════════════════════════ */
// 판 구조
const START_CASH        = 10000;   // 시작 자금 (만원) = 1억
const TICK_MS           = 800;     // 캔들 1개 = 0.8초
const TICKS_PER_DAY     = 12;      // 장중 = 캔들 12개 (약 10초)
const DAYS_PER_ROUND    = 5;       // 1주(라운드) = 5거래일
/* 목표 성장률 (docs/design/TARGET_GROWTH.md, 실험 — 기본 꺼짐): 목표 = max(고정 곡선 ROUND_TARGETS, 주 시작 순자산 × TARGET_GROWTH_K[주]).
   주 시작에 확정(run.week.growthTarget)해 주 중에 바뀌지 않는다. K ≤ 1(1~2주차 1.0)이면 성장 목표 없음 = 고정 곡선 그대로. 끄면 도입 전과 같은 판.
   UI는 startNewRun({targetGrowth: true})로도 켤 수 있다 (데모 ?growth=1) */
const TARGET_GROWTH_ON  = false;
const TARGET_GROWTH_K   = [1, 1, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3];   // 후보 S1 (실험 후보 S1~S4는 TARGET_GROWTH.md)
const ROUND_TARGETS     = [10200, 12000, 15000, 25000, 50000, 150000, 600000, 3000000]; // 주차별 순자산 목표 (만원). D8(사용자 결정): 곱하기 배수는 그대로 두고 목표를 거침없이 올린다 — 1억 200만 → 300억. 배수 빌드(레버리지 탑·개미 군단 깃발)만 끝까지 가고 곱하기 없는 빌드·nothing은 0~5% (sim/runner.js, MULTIPLIERS.md)
const MAX_ROUND         = ROUND_TARGETS.length;

// 시장
const IDX_SENS          = 0.6;     // 지수 움직임이 종목에 전달되는 비율 (× beta)
const IDIO_SCALE        = 0.25;    // 종목 고유 변동 크기 (× volatility)
const INVERSE_DECAY     = 0.0008;  // 인버스 ETF(beta < 0) 녹음: 틱당 기대 로그수익률 감소 (롤오버 비용·복리 손실).
                                   // 평소 5일 보유 시 지수 인버스·곱버스 평균이 소폭 마이너스, 약세장(매파 발언) 하루 보유는 여전히 플러스
const STOCK_DRIFT       = 0.001;   // 종목 틱당 기대 로그수익률 — 사면 이길 확률이 조금 더 높도록 (공매도는 그만큼 불리).
                                   // 0.001 = 지수 인버스도 1주 보유 시 반반(52%)이 되는 최소값. 우량주는 65% → 79%
const ASSET_HISTORY     = 30;      // 시세 스파크라인 길이
const EVENT_DURATION    = 15;      // 랜덤 시장 이벤트 지속 틱
const EVENT_MIN_GAP     = 12;      // 랜덤 시장 이벤트 사이 최소 틱
const EVENT_CHANCE      = 0.08;    // 최소 간격이 지난 뒤 틱마다 시장 이벤트 확률
const INDEX_TICK_CENTER = 0.49;    // 지수 캔들 변화 = (난수 − 이 값) × 40 → 0.5보다 작으면 지수가 조금씩 오른다 (틱당 약 +0.04%)
const STOCK_MOVE_MULT   = { NORMAL:1.25, BULL:1.25, BEAR:1.25, VOLATILE:1 };   // 장세별 종목 한 틱 움직임 배수 (지수 전달분 + 고유 변동 + 꼬리).
                                   // 횡보·상승·하락장은 이전보다 25% 크게 요동 (변동성 장세는 이미 커서 그대로). 기대 수익(드리프트)은 건드리지 않는다
const CANDLE_WICK_SCALE = 0.5;     // 종목 캔들 꼬리 길이 (× 종목 고유 변동 크기)
// 갭: 드물게 한 틱에 종목 가격이 크게 튄다. 반대매매는 갭 이후 가격으로 체결 → 레버리지·숏은 원금 이상 잃을 수 있다
//   위험도 = volatility + |beta| × GAP_BETA_WEIGHT  (밈코인 .25 · 초전도체 .16 · 대장코인 .11 · 반도체 .03 · 국밥제약 .014)
const GAP_BETA_WEIGHT     = 0.01;
const GAP_CHANCE_PER_RISK = 0.02;  // 틱당 갭 확률 = 위험도 × 이 값 × 장세 배수. 0.035 → 0.02: 목표 곡선이 완만해진 뒤 레버리지 빌드가 갭 파산으로만 끝나지 않게 (allIn3x 파산 28% → 17%)
const GAP_SIZE_PER_RISK   = 6;     // 갭 크기 = 위험도 × 이 값 × (1 + 난수)
const GAP_SIZE_MAX        = 0.90;  // 갭 크기 상한 (하락 갭 −90%, 상승 갭 +90%)
const GAP_UP_SHARE        = 0.5;   // 상승 갭 비율 (상승 갭은 숏을 턴다)
const GAP_STATE_MULT      = { NORMAL:1, BULL:1, BEAR:2, VOLATILE:2.5 };   // 약세장·변동성 장세에서 확률 증가

// 포지션 · 이자 · 반대매매
const DAILY_INTEREST      = 0.004; // 신용이자·마통이자: 장 마감마다 빌린 돈의 0.4% (게임용 과장)
const SHORT_BORROW_RATE   = 0.002; // 대차 이자(공매도): 장 마감마다 빌린 주식 노출액 전체의 이 비율
                                   // 역할 분담 — 인버스 ETF: 이자·반대매매 없음, 대신 지수 상승 추세에 조금씩 녹는 '안전한 하락 베팅'
                                   //            공매도: 아무 종목(고베타)·레버리지와 결합, 이자·반대매매를 감수하는 '공격적인 하락 베팅'
const MARGIN_CALL_RATIO   = 0.25;  // 증거금률(포지션순자산 ÷ 노출액) 25% 미만 → 반대매매
const MARGIN_WARN_RATIO   = 0.40;  // 이 아래부터 위험 표시
/* (S7-14) 담보유지비율 반대매매 — 한국 신용거래 방식. 담보비율 = 포지션 평가액 ÷ 빌린 돈(롱) / (원금 + 공매도 대금) ÷ 갚을 주식 평가액(숏).
   유지비율 미만이면 반대매매 → 2x는 약 −30%, 3x는 약 −7% 하락에서 (레버리지가 높을수록 빨리 온다). 🛑 수치는 시뮬 보고 후 사용자 확정 — 그때까지 꺼 둔다 */
const MAINTENANCE_MARGIN_ON     = true;  // true = 담보유지비율 방식 / false = 기존 증거금률(MARGIN_CALL_RATIO) 방식 — 2026-09-27 사용자 확정 (140%·130%)
const MAINTENANCE_RATIO         = 1.4;   // 롱(신용): 담보비율 140% 미만 → 반대매매
const SHORT_MAINTENANCE_RATIO   = 1.3;   // 숏(대차): 130% 미만 → 반대매매 (1x 숏 약 +54% 상승에서)
const MAINT_WARN_HEALTH         = 1.15;  // 위험 표시: 담보비율 ÷ 유지비율이 이 아래
const MAINT_GAUGE_MAX           = 2;     // 화면 막대: 담보비율 ÷ 유지비율 0~2를 0~100%로 (반대매매 선 = 50%)
const LIQUIDATION_PENALTY = 0.05;  // 반대매매 때 노출액의 5% 추가 손실 (시장가 투매 슬리피지)
const MISU_CASH_FLOOR     = 0;     // 반대매매가 음수(미수)로 체결된 뒤 현금이 이 값 미만이면 미수 동결 → 파산

// 덱
const DRAW_PER_DAY      = 5;       // 매일 아침 드로우
const HAND_MAX          = 10;      // 손패 최대
const AP_PER_DAY        = 3;       // 행동력
const REWARD_CHOICES    = 3;       // 주간 보상 후보 수
// 등급 5단계. 보상·팩·낱장은 등급을 먼저 뽑고, 그 등급 안에서 카드를 균등하게 뽑는다.
const RARITIES          = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
// 주간 카드 보상·암시장 낱장 진열의 등급 확률 (주차 upTo 이하에 적용, 단위 %)
const REWARD_RARITY_BY_WEEK = [
  { upTo: 2, weights: { common:60, uncommon:31, rare:7,    legendary:2,   mythic:0 } },
  { upTo: 4, weights: { common:52, uncommon:33, rare:10.5, legendary:3.5, mythic:1 } },
  { upTo: 6, weights: { common:44, uncommon:34, rare:14,   legendary:6,   mythic:2 } },
  { upTo: 8, weights: { common:36, uncommon:34, rare:18,   legendary:9,   mythic:3 } }
];
const MYTHIC_DECK_LIMIT = 1;       // 덱 전체 신화 카드 수 한도 (전설·신화는 원래 카드별 1장 — 덱에 있는 카드는 후보에서 빠진다)
const RELIC_RARITY_WEIGHTS = { common:30, uncommon:35, rare:22, legendary:10, mythic:3 };   // 결산 보상 유물 후보 등급 확률 (등급 먼저 → 등급 안 균등)
const RELIC_SHOP_RARITY_WEIGHTS = { common:40, uncommon:32, rare:18, legendary:8, mythic:2 };   // 암시장 유물 진열 등급 확률 (칸마다 등급 먼저 → 등급 안 균등). 3칸이라 보상보다 흔한 쪽으로
const MIN_DECK_SIZE     = 5;       // 카드 제거로 이 아래로는 줄일 수 없다

// 카드 수치
const CREDIT_LEV          = 2;     // 신용 매수
const YOLO_LEV            = 3;     // 영끌
const YOLO_PRINCIPAL_MULT = 2;     // 영끌 원금 배수
const AVG_DOWN_RATIO      = 0.5;   // 물타기: 원금의 50% 추가
const IPO_AMOUNT          = 250;   // 공모주 청약 (만원). 400 → 250 (기대 +3.7%)
const STOP_LOSS_PCT       = -0.10; // 손절 예약
const TAKE_PROFIT_PCT     = 0.15;  // 익절 예약
const TRAIL_GAP           = 0.07;  // 트레일링 스탑 (최고 수익률 대비 %p)
const CUT_LOSS_REFUND     = 0.50;  // 손절은 과학: 손실의 50% 환급 (0.2 → 0.5)
const TAKE_PROFIT_BONUS   = 0.50;  // 익절은 항상 옳다: 수익의 50% 보너스 (0.2 → 0.5, 익절 빌드 보상)
const ESCAPE_DRAW         = 2;     // 탈출은 지능순 드로우
const DIAMOND_BONUS       = 0.60;  // 다이아몬드 핸드: 주말 평가이익의 60% (0.3 → 0.6)
const FORCED_DIVIDEND     = 0.04;  // 강제 장기투자: 원금의 4% (소멸 카드)
const DIVIDEND_PER_POS    = 80;    // 배당주 마인드: 포지션당 (만원)
const DIVIDEND_MAX_POS    = 5;     // 배당주 마인드: 최대 포지션 수
const CHASE_AMOUNT        = 600;   // 상한가 따라잡기: 매수 금액 (만원)
const CHASE_HOT_PCT       = 0.10;  // 상한가 따라잡기: 전날 이만큼 오른 종목이면
const CHASE_HOT_LEV       = 2;     //   이 레버리지로 체결
const ANT_ARMY_DRAW       = 1;     // 개미 군단 총공격: 종목 카드를 쓸 때마다 드로우
const SPLIT_SELL_RATIO    = 1 / 3; // 분할 매도: 매도 비율
const SPLIT_SELL_DRAW     = 1;     // 분할 매도: 드로우
const TOP_SPOTTER_BONUS   = 0.30;  // 상투 감별사: 익절 예약·트레일링 스탑 체결 수익 보너스
const COMPOUND_RATIO      = 0.50;  // 복리의 마법: 평가이익 중 원금에 더하는 비율 (0.2 → 0.5, 장기 보유 빌드 보상)
const VALUE_GOD_DAYS      = 2;     // 가치투자의 신: 장 마감을 이만큼 넘긴 롱 포지션부터
const VALUE_GOD_PCT       = 0.015; //   원금의 이만큼을 장 마감마다 현금으로
const ROTATION_MAX_DRAW   = 4;     // 테마 순환매: 최대 드로우
const ROTATION_AP_SECTORS = 3;     //   섹터가 이만큼 이상이면
const ROTATION_AP         = 1;     //   행동력 +1
const MANIP_PCT           = 0.20;  // 작전 세력: 오늘 하루 확정 급등 (+20%)
const MANIP_GAP           = -0.12; //   다음 날 개장 직후 갭
const MANIP_DRIFT         = Math.log(1 + MANIP_PCT) / TICKS_PER_DAY;
const PUMP_MANIP          = 2;     // run.pumps 값: 1 급등 / −1 설거지 / 2 작전 세력(확정)
const LOSS_GUARD_REFUND   = 0.50;  // 손실 보전 약정: 반대매매 손실 환급 비율
const CIRCUIT_DROP        = 0.08;  // 서킷브레이커: 개장 대비 순자산이 이만큼 빠지면 장 마감
const HODL_RECOVER        = 0.30;  // 존버는 승리한다: 평가손실 30% 회복
const PUMP_UP_CHANCE      = 0.70;  // 리딩방 찌라시: 급등 확률
const PUMP_UP_PCT         = 0.11;  // 급등: 하루(12틱) 동안 +11%
const PUMP_DOWN_PCT       = 0.15;  // 설거지: 하루 동안 −15%  → 한 번 쓸 때 기대값 약 +3.2%
const PUMP_UP_DRIFT       = Math.log(1 + PUMP_UP_PCT) / TICKS_PER_DAY;    // 틱당 작전 추세
const PUMP_DOWN_DRIFT     = Math.log(1 - PUMP_DOWN_PCT) / TICKS_PER_DAY;  // (음수)
const INDICATOR_DRAW      = 2;     // 보조지표 42개 드로우
const COFFEE_AP           = 2;     // 아아 수혈
const MARGIN_TOPUP        = 500;   // 증거금 보충 (만원)
const HEDGE_RATIO         = 0.30;  // 인버스 헤지: 롱 노출액의 30%
const HEDGE_STOCK         = 'inv'; // 인버스 헤지로 사는 종목
const OVERDRAFT_AMOUNT    = 1500;  // 마이너스 통장 (만원)
const SAVINGS_AMOUNT      = 300;   // 적금 깨기 (만원). 800 → 300: 1주차 목표(+1%)의 8배를 공짜로 주던 것 (기대 +7.6%)
// 카드 강화(+) 수치 (docs/design/DECKBUILDING.md — 강화는 한 가지만: 행동력 −1 또는 수치 한 단계)
const CREDIT_LEV_UP          = 3;
const YOLO_PRINCIPAL_MULT_UP = 3;
const AVG_DOWN_RATIO_UP      = 1.0;
const IPO_AMOUNT_UP          = 500;
const CHASE_AMOUNT_UP        = 1000;
const STOP_LOSS_PCT_UP       = -0.07;
const TAKE_PROFIT_PCT_UP     = 0.12;
const CUT_LOSS_REFUND_UP     = 0.75;
const TAKE_PROFIT_BONUS_UP   = 0.75;
const ESCAPE_DRAW_UP         = 3;
const SPLIT_SELL_DRAW_UP     = 2;
const DIAMOND_BONUS_UP       = 0.90;
const FORCED_DIVIDEND_UP     = 0.08;
const DIVIDEND_PER_POS_UP    = 120;
const HODL_RECOVER_UP        = 0.50;
const COMPOUND_RATIO_UP      = 0.75;
const VALUE_GOD_PCT_UP       = 0.025;
const PUMP_UP_CHANCE_UP      = 0.80;
const MARKET_CARD_MAIN_UP    = 0.80;  // 비둘기·매파·CEO 트윗+: 주 장세 확률 (나머지는 원래 비율대로 줄인다)
const INDICATOR_DRAW_UP      = 3;
const COFFEE_AP_UP           = 3;
const ROTATION_MAX_DRAW_UP   = 5;
const ROTATION_AP_UP         = 2;
const FSS_GAIN_UP            = { manip: 60 };   // 강화판 금감원 게이지 상승량 (없으면 원래 값)
const MARGIN_TOPUP_UP        = 800;
const CASHOUT_DRAW_UP        = 1;
const HEDGE_RATIO_UP         = 0.50;
const INTEREST_FREE_DRAW_UP  = 2;
const OVERDRAFT_AMOUNT_UP    = 2500;
const FSS_CONFESS_CUT_UP     = 70;
const SAVINGS_AMOUNT_UP      = 500;
const LOSS_GUARD_REFUND_UP   = 0.75;
const CIRCUIT_DROP_UP        = 0.05;

// 시장 카드 — 장세를 확정하지 않고 확률을 기울인다. 결과는 장이 열릴 때 판정 (chance 합 1, NORMAL = 시장이 무시함)
const MARKET_CARD_ODDS = {
  dove:     [ { state:'BULL', chance:0.70 }, { state:'NORMAL', chance:0.20 }, { state:'BEAR', chance:0.10 } ],
  hawk:     [ { state:'BEAR', chance:0.70 }, { state:'NORMAL', chance:0.20 }, { state:'BULL', chance:0.10 } ],
  ceoTweet: [ { state:'VOLATILE', chance:0.70 }, { state:'BULL', chance:0.20 }, { state:'NORMAL', chance:0.10 } ]
};
/* 강화판(+) 판정표: 주 장세 확률을 MARKET_CARD_MAIN_UP으로 올리고 나머지는 원래 비율대로 */
['dove', 'hawk', 'ceoTweet'].forEach(id => {
  const o = MARKET_CARD_ODDS[id], main = o[0].chance, rest = 1 - main;
  MARKET_CARD_ODDS[id + '+'] = o.map((x, i) => ({ state: x.state, chance: i === 0 ? MARKET_CARD_MAIN_UP : x.chance * (1 - MARKET_CARD_MAIN_UP) / rest }));
});
const REVERSION_TICKS     = 3;     // 카드로 만든 강세·약세장 다음 날, 개장 후 이만큼 틱 동안
const REVERSION_DRIFT     = 6;     // 반대 방향 지수 드리프트 (강세장 12의 절반) — 차익실현 매물
// 지수 장세별 캔들 (generateNextCandle): 틱당 드리프트(지수 포인트)와 변동 배수. 시장 카드 기대값(marketCardEv)도 같은 값을 읽는다
const INDEX_STATE = { NORMAL:{ drift:0, vol:1.0 }, BULL:{ drift:12, vol:1.2 }, BEAR:{ drift:-12, vol:1.2 }, VOLATILE:{ drift:0, vol:2.8 } };
const INDEX_TICK_RANGE = 40;       // 지수 캔들 변화 = (난수 − INDEX_TICK_CENTER) × 이 값 × 변동 배수

/* ── 읽을 수 있는 시장 (docs/design/READABLE_MARKET.md) ──
   종목 추세(regime): 인버스가 아닌 종목마다 숨은 상태 하나. 틱당 추가 드리프트로 가격에 실제로 반영되고, 장 마감마다 전이 행렬로 바뀐다.
   HOT(과열)은 조금 오르지만 갭하락 확률이 GAP_HOT_MULT배. 인버스(beta < 0)는 추세 없이 지수를 따른다 (기존 로직). */
const REGIMES = ['UP', 'FLAT', 'DOWN', 'HOT'];
const REGIME_DRIFT = { UP:0.004, FLAT:0, DOWN:-0.004, HOT:0.002 };   // 틱당 로그수익률 (STOCK_DRIFT에 더함). UP 하루 ≈ +4.9%
const GAP_HOT_MULT = 2.5;          // 과열 종목의 갭'하락' 확률 배수
const REGIME_UP_LONG_DAYS = 2;     // UP이 이만큼 이어지면 전이 행을 UP_LONG으로 (과열 확률 ↑)
/* 전이 행렬 (장 마감마다, 행 = 오늘 상태 → 내일 상태 확률, 합 1). 유지 50~60% → 평균 지속 2~2.5일 (1 / (1 − 유지))
   정상 상태 분포(π) 계산 — UP을 첫날(UP1)·이틀 이상(UP2)으로 나눈 5상태 마르코프 체인, πT = π를 반복으로 풀면:
     π(FLAT) = 0.3125, π(UP1) = 0.1250, π(UP2) = 0.1500 → π(UP) = 0.2750, π(DOWN) = 0.3125, π(HOT) = 0.1000
   가중평균 드리프트 = 0.004 × 0.2750 − 0.004 × 0.3125 + 0.002 × 0.1000 = −0.00015 + 0.0002 = +0.00005 /틱
     → STOCK_DRIFT(0.001)의 5%. 종목 기대수익은 이전과 거의 같다 (HOT의 추가 갭하락은 별도 — 고변동 종목에서만 크다) */
const REGIME_TRANSITION = {
  FLAT:    [ { state:'FLAT', chance:0.60 }, { state:'UP', chance:0.20 }, { state:'DOWN', chance:0.20 } ],
  UP:      [ { state:'UP', chance:0.60 }, { state:'FLAT', chance:0.20 }, { state:'DOWN', chance:0.10 }, { state:'HOT', chance:0.10 } ],
  UP_LONG: [ { state:'UP', chance:0.50 }, { state:'HOT', chance:0.25 }, { state:'FLAT', chance:0.15 }, { state:'DOWN', chance:0.10 } ],
  DOWN:    [ { state:'DOWN', chance:0.60 }, { state:'FLAT', chance:0.20 }, { state:'UP', chance:0.20 } ],
  HOT:     [ { state:'HOT', chance:0.50 }, { state:'DOWN', chance:0.35 }, { state:'FLAT', chance:0.15 } ]
};
const REGIME_START = [ { state:'UP', chance:0.275 }, { state:'FLAT', chance:0.3125 }, { state:'DOWN', chance:0.3125 }, { state:'HOT', chance:0.10 } ];   // 판 시작 = 정상 상태 분포
// 시그널: 장전마다 종목별로 한 번 굴려 그날 고정. 정확도 확률로 실제 추세, 아니면 나머지 셋 중 하나(균등)
const SIGNAL_ACCURACY        = 0.65;
const SIGNAL_INDICATOR_BONUS = 0.20;   // '보조지표 42개': 오늘 시그널 정확도 +20%p (다시 굴림)
// 다음 날 뉴스 (장 마감에 예고 → 다음 개장에 판정). 루머는 이 확률로만 사실
const NEWS_RUMOR_CHANCE = 0.6;
/* target: 'stock:<id>' | 'sector:<섹터>' | 'market'(전 종목, drift는 beta 부호를 따른다)
   effect: volMult = 종목 고유 변동 배수, drift = 틱당 로그수익률 추가, gapMult = 갭 확률 배수 */
const NEWS_EVENTS = [
  { id:'semiEarn',   text:'반도체전자 실적 발표 — 어닝 서프라이즈냐 쇼크냐', target:'stock:semi', effect:{ volMult:2, drift:0, gapMult:1 }, reliability:'confirmed' },
  { id:'scPaper',    text:'초전도체 재현 논문 공개 "임박" (업로드 예정일만 3번째)', target:'stock:sc', effect:{ volMult:2.5, drift:0, gapMult:2 }, reliability:'rumor' },
  { id:'coinEtf',    text:'대장코인 현물 ETF 승인 발표 임박설', target:'stock:coin', effect:{ volMult:1, drift:0.004, gapMult:1 }, reliability:'rumor' },
  { id:'gukbapP3',   text:'국밥제약 임상 3상 결과 발표 — 국밥이냐 맹물이냐', target:'stock:gukbap', effect:{ volMult:3, drift:0, gapMult:1 }, reliability:'confirmed' },
  { id:'cpi',        text:'미국 CPI 발표 — 전 종목 변동성 확대', target:'market', effect:{ volMult:1.5, drift:0, gapMult:1 }, reliability:'confirmed' },
  { id:'memeWallet', text:'밈코인 개발자 지갑에서 물량 이동 포착', target:'stock:meme', effect:{ volMult:1, drift:-0.004, gapMult:2 }, reliability:'rumor' },
  { id:'semiBuyback',text:'반도체전자 자사주 매입 공시 예정', target:'stock:semi', effect:{ volMult:1, drift:0.002, gapMult:1 }, reliability:'confirmed' },
  { id:'coinDelist', text:'대장코인 거래소 상장폐지 검토설 — "사실무근" 공지 준비 중', target:'stock:coin', effect:{ volMult:1, drift:-0.004, gapMult:1.5 }, reliability:'rumor' },
  { id:'themeRaid',  text:'테마주 단톡방 "내일 9시 동시 매수" 공지', target:'sector:테마주', effect:{ volMult:1.5, drift:0.004, gapMult:1 }, reliability:'rumor' },
  { id:'fomc',       text:'FOMC 의사록 공개 — 해석은 100명이 100개', target:'market', effect:{ volMult:1.3, drift:0, gapMult:1.3 }, reliability:'confirmed' },
  { id:'defensive',  text:'경기 둔화 우려 — 방어주로 수급 이동', target:'sector:방어주', effect:{ volMult:1, drift:0.002, gapMult:1 }, reliability:'confirmed' },
  { id:'memeCeleb',  text:'해외 인플루언서 밈코인 언급 예고 (프로필 사진이 개)', target:'stock:meme', effect:{ volMult:1.5, drift:0.005, gapMult:1 }, reliability:'rumor' },
  { id:'shortReport',text:'해외 공매도 리포트 "반도체전자 회계 의혹" 발간 예고', target:'stock:semi', effect:{ volMult:1, drift:-0.003, gapMult:2 }, reliability:'rumor' },
  { id:'holiday',    text:'연휴 앞 관망세 — 거래량 실종, 전 종목 변동성 축소', target:'market', effect:{ volMult:0.6, drift:0, gapMult:0.5 }, reliability:'confirmed' },
  { id:'cryptoTax',  text:'가상자산 과세 유예 법안 통과 기대감', target:'sector:암호화폐', effect:{ volMult:1, drift:0.003, gapMult:1 }, reliability:'rumor' }
];

// 금감원 감시 게이지 — 시장 카드를 쓸 때마다 쌓이고, 주가 바뀌면 조금 줄고, 가득 차면 제재
const FSS_MAX             = 100;
// 시장 카드별 게이지 상승량 (설계서 20/15/25/50 비율 × 1.7 — 비둘기·매파 3장이면 제재)
const FSS_GAIN            = { dove: 34, hawk: 34, ceoTweet: 26, pump: 42, manip: 85 };
const FSS_WEEKLY_DECAY    = 15;    // 새 주가 시작될 때 줄어드는 양
const FSS_DAILY_DECAY     = 5;     // 장 마감마다 줄어드는 양
const FSS_CONFESS_CUT     = 40;    // '자진 신고' 카드: 게이지 감소량
const FSS_WARN            = 60;    // 이 이상이면 '내사 착수' (2장째 — 한 장 더 쓰면 제재)
const FSS_SANCTION_WEIGHTS = { fine: 1, ban: 1, liquidate: 1 };   // 제재 종류 가중치: 과징금 / 다음 날 매수 금지 / 가장 큰 포지션 강제 청산
const FSS_FINE_PCT        = 0.05;  // 과징금 = 순자산의 5%
const FSS_BAN_TYPES       = ['stock', 'buy'];   // 매수 금지 날 못 쓰는 카드 종류

// 비자금: 암시장 전용 화폐. 순자산에 포함되지 않고, 계좌 현금과 섞이지 않는다.
// 주간 결산에서 목표를 달성하면 적립 = 기본 + 목표 초과분 × 비율 (초과분 자체는 계좌에 그대로 남는다)
const SLUSH_START         = 0;     // 시작 비자금 (만원)
const SLUSH_WEEKLY_BASE   = 500;   // 주간 결산 통과 시 기본 적립
const SLUSH_EXCESS_RATE   = 0.25;  // 목표 초과 달성분의 이 비율만큼 추가 적립
const TIP_SLUSH_SAFE      = 80;    // 찌라시 안전한 선택(B)의 확정 보상 — 계좌 현금 대신 비자금

// 암시장 (주간 결산 → 보상 선택 후, 다음 주 개장 전까지만 열림). 값은 전부 비자금으로 낸다 (아래 가격 단위 = 비자금 만원).
// 카드 팩: 희귀도를 weights로 먼저 뽑고, 그 희귀도 안에서 풀의 카드를 균등하게 뽑는다 → 화면의 %가 곧 실제 확률.
// pool이 빈 배열이면 전체 카드(상태 카드 제외).
const SHOP_PACKS = [
  { id:'junk',   name:'잡코인 팩', icon:'📦', price:250, desc:'싸다. 대부분 일반 카드.',
    weights:{ common:70, uncommon:24, rare:5,  legendary:1,  mythic:0 }, pool:[] },
  { id:'leader', name:'주도주 팩', icon:'🧧', price:500, desc:'고급 이상이 70%. 신화도 가끔.',
    weights:{ common:30, uncommon:45, rare:18, legendary:6,  mythic:1 }, pool:[] },
  { id:'ruin',   name:'파산각 팩', icon:'💀', price:666, desc:'고위험 카드만. 희귀 이상 60%.',
    weights:{ common:0,  uncommon:40, rare:35, legendary:19, mythic:6 },
    pool:['credit', 'short', 'avgDown', 'hodl', 'forgotPw', 'pump', 'ceoTweet', 'overdraft',
          'stk_coin', 'stk_inv2', 'stk_sc', 'stk_meme', 'chaseLimit', 'yolo', 'fullBuy', 'hodlWins',
          'lossGuard', 'antArmy', 'manip'] }
];
/* 암시장 물가 (docs/design/SHOP_ECONOMY.md): 가격 = 기본가 × (1 + 계수 × (주차 − 1)), 10만 단위 반올림 → shopPrice()
   7주차(마지막 암시장)엔 팩·낱장 ×1.72, 유물 ×1.6. remove·reroll은 따로 공식을 쓰므로 0 (헬퍼만 공유) */
const SHOP_INFLATION      = { pack: 0.12, single: 0.12, relic: 0.10, remove: 0.0, reroll: 0.0, service: 0.12 };
// 덱 조작 (암시장): 리모델링(강화 +) · 변환(같은 등급 무작위 카드) · 복제(한 장 더, 신화 불가). 같은 주 n번째마다 × 누진, 주차 물가 service
const SHOP_SERVICE_BASE       = { upgrade: 350, transform: 200, duplicate: 450 };
const SHOP_SERVICE_ESCALATION = 1.5;
const STOCK_BUY_MIN           = 50;    // 종목 카드 매수 금액 최소 (만원). 최대 = 현금 ÷ 원금 배수
const SHOP_PRICE_ROUND    = 10;    // 가격 반올림 단위 (만원)
const SHOP_SINGLE_MIN     = 3;     // 낱장 진열 최소 장수
const SHOP_SINGLE_MAX     = 5;     // 낱장 진열 최대 장수
const SHOP_SINGLE_PRICE   = { common:300, uncommon:500, rare:750, legendary:1100, mythic:1800 }; // 낱장 정가 (비자금)
const SHOP_REMOVE_BASE    = 400;   // 카드 제거 기본 비용 (비자금)
const SHOP_REMOVE_PER_WEEK = 200;  // 주차가 지날 때마다 제거 비용 증가
const SHOP_REROLL_BASE        = { single: 100, relic: 250 };   // 진열 새로고침 기본가 (비자금). 낱장·유물 따로 센다
const SHOP_REROLL_WEEK_GROWTH = 0.15;  // 주차마다 기본가 +15%
const SHOP_REROLL_ESCALATION  = 1.5;   // 같은 주에 같은 종류를 새로고침할 때마다 × 이만큼 (1주차 낱장 100 → 150 → 230 → 340)
const SHOP_REMOVE_ESCALATION = 1.6; // 같은 주에 제거할 때마다 비용 × 이만큼 (횟수 제한 없음, 덱 MIN_DECK_SIZE장까지). 1주차 400 → 640 → 1,020 → 1,640

/* 종목. 인버스 종목은 beta가 음수 → 같은 가격 공식으로 지수와 반대로 움직인다.
   종목 카드는 전부 일반 등급 (D7: 등급 없음 — 종목 차이는 변동성·베타·시그널로). cost = 매수 금액 기본값(직접 입력 가능) */
const STOCKS = [
  { id:'semi',   name:'반도체전자', sector:'우량주',   cost:1000, beta: 1.0, volatility:0.02,  basePrice:72000, rarity:'common' },
  { id:'coin',   name:'대장코인',   sector:'암호화폐', cost:1500, beta: 2.5, volatility:0.08,  basePrice:95000, rarity:'common' },
  { id:'sc',     name:'초전도체',   sector:'테마주',   cost:800,  beta: 3.8, volatility:0.12,  basePrice:12000, rarity:'common' },
  { id:'gukbap', name:'국밥제약',   sector:'방어주',   cost:800,  beta: 0.4, volatility:0.01,  basePrice:8500,  rarity:'common' },
  { id:'meme',   name:'밈코인',     sector:'동전주',   cost:300,  beta: 5.0, volatility:0.20,  basePrice:420,   rarity:'common' },
  { id:'inv',    name:'지수 인버스', sector:'인버스',  cost:800,  beta:-1.0, volatility:0.004, basePrice:5000,  rarity:'common' },
  { id:'inv2',   name:'곱버스',     sector:'인버스',   cost:600,  beta:-2.0, volatility:0.008, basePrice:3000,  rarity:'common' },
  // S7 추가 (D10 사용자 선택 — 실존 기업·티커를 흉내 내지 않은 '업종 + 밈' 이름)
  { id:'ev',     name:'전기차모터스', sector:'전기차', cost:1200, beta: 1.8, volatility:0.05,  basePrice:38000, rarity:'common' },
  { id:'bio',    name:'떡상바이오', sector:'바이오',   cost:700,  beta: 1.5, volatility:0.07,  basePrice:21000, rarity:'common' },
  { id:'build',  name:'존버건설',   sector:'건설',     cost:900,  beta: 0.7, volatility:0.02,  basePrice:15000, rarity:'common' },
  { id:'game',   name:'치킨게임즈', sector:'게임',     cost:600,  beta: 1.2, volatility:0.04,  basePrice:26000, rarity:'common' },
  // (S7-19) 초고변동 작전주: 하루 ±30% 상·하한가(PRICE_LIMIT)까지 튄다
  { id:'delist', name:'상폐직전테크', sector:'작전주', cost:200, beta: 2.0, volatility:0.28,  basePrice:900,   rarity:'common', limit:true },
  { id:'ailab',  name:'급등AI랩',   sector:'작전주',   cost:400,  beta: 3.0, volatility:0.25,  basePrice:3300,  rarity:'common', limit:true }
];
const PRICE_LIMIT  = 0.30;   // (S7-19) limit 종목의 하루 가격 제한폭 ±30% (전일 종가 기준 — 상한가·하한가)
const DAILY_KEEP   = 40;     // (S7-15) 일봉 기록 개수 (큰 차트 '일봉' 탭)
const STOCK_BY_ID = {};
STOCKS.forEach(s => { STOCK_BY_ID[s.id] = s; });

/* (N3) 섹터 레벨 (docs/design/SECTOR_LEVELS.md): 발라트로의 행성 카드처럼 섹터를 레벨업 → 그 섹터 포지션이 수익으로 장 마감하면
   정산 맨 앞(유물보다 먼저)에 칩 +원금 × SECTOR_LEVEL_CHIP_PCT × (레벨−1), 합산 배수 +SECTOR_LEVEL_MULT × (레벨−1). 레벨 1 = 효과 없음.
   레벨업 = '리포트' 카드(섹터마다 1장, 소멸). 보상·낱장·팩에서 레벨이 가장 높은 섹터의 종목·리포트 카드는 등급 안 가중치 +SECTOR_BIAS */
const SECTOR_LEVELS_ON      = true;   // false면 리포트 카드·리서치 팩이 없고 모든 섹터 레벨 1 (= 도입 전과 같은 판)
const SECTOR_LEVEL_CHIP_PCT = 0.02;   // 레벨 1 오를 때마다 칩 + 포지션 원금의 2%
const SECTOR_LEVEL_MULT     = 0.25;   // 레벨 1 오를 때마다 합산 배수 +0.25
const SECTOR_BIAS           = 0.3;    // 최고 레벨 섹터(레벨 2 이상)의 종목·리포트 카드: 등급 안 가중치 +30% (TAG_BIAS와 더한다)
const SECTOR_REPORT_AP      = 0;      // 리포트 카드 행동력 — 조정안 3 (1 → 0, 사용자 결정 2026-09-28). 강화판 = 레벨 +1 + 카드 1장 드로우
const SECTOR_REPORT_SLOTS   = 1;      // 결산 카드 보상 중 리포트 칸 수 — 조정안 1 (발라트로 상점의 행성 카드 칸처럼, 사용자 결정 2026-09-28)
const SECTOR_REPORT_UP_DRAW = 1;      // 리포트 강화판: 레벨 +1과 함께 뽑는 카드 수
const SECTOR_REPORT_RARITY  = 'uncommon';
/* 섹터 목록 = STOCKS의 sector. key = 리포트 카드 id(rpt_<key>), report = 카드 이름 (밈 톤), quote = 설명 끝 한 줄 */
const SECTORS = [
  { name:'우량주',   key:'blue',    icon:'🏢', report:'목표주가 상향 리포트',   quote:'매수 의견 27년 연속 유지.' },
  { name:'암호화폐', key:'crypto',  icon:'🪙', report:'코인 리포트: 반감기 온다', quote:'이번엔 진짜 다르다.' },
  { name:'테마주',   key:'theme',   icon:'🔥', report:'테마 발굴 리포트',       quote:'재료는 찾으면 나온다.' },
  { name:'방어주',   key:'defense', icon:'🍚', report:'배당 귀족 리포트',       quote:'지루함이 곧 수익률.' },
  { name:'동전주',   key:'penny',   icon:'🎲', report:'동전주 10루타 시나리오', quote:'100원이 1,000원 되면 10배잖아.' },
  { name:'인버스',   key:'inverse', icon:'📉', report:'폭락 예언 리포트',       quote:'10년째 폭락을 예언 중.' },
  { name:'전기차',   key:'ev',      icon:'🔋', report:'목표주가 3배 리포트',     quote:'근거는 "성장성".' },
  { name:'바이오',   key:'bio',     icon:'🧪', report:'임상 3상 기대 리포트',   quote:'결과 발표는 늘 다음 분기.' },
  { name:'건설',     key:'build',   icon:'🏗', report:'재건축 수혜 리포트',     quote:'삽 뜨기 전이 제일 비싸다.' },
  { name:'게임',     key:'game',    icon:'🎮', report:'신작 흥행 리포트',       quote:'사전예약 1,000만 (봇 포함).' },
  { name:'작전주',   key:'manip',   icon:'🕴', report:'세력 동향 보고서',       quote:'출처: 텔레그램 방.' }
];
const SECTOR_BY_NAME = {};
SECTORS.forEach(x => { SECTOR_BY_NAME[x.name] = x; });
/* 리서치 팩 (암시장, SECTOR_LEVELS_ON일 때만): 종목 카드 + 리포트 카드만 */
const RESEARCH_PACK = { id:'research', name:'리서치 팩', icon:'📑', price:400, desc:'종목 카드와 섹터 리포트만. 한 섹터에 올인할 때.',
  weights:{ common:40, uncommon:60, rare:0, legendary:0, mythic:0 },
  pool: STOCKS.map(x => 'stk_' + x.id).concat(SECTORS.map(x => 'rpt_' + x.key)) };
if(SECTOR_LEVELS_ON) SHOP_PACKS.push(RESEARCH_PACK);

/* 유물 — 한 판 동안 상시 발동(패시브). 효과는 ENGINE의 계산 지점에서 hasRelic()으로 개입한다.
   획득: 매주 결산 보상에서 카드 보상 다음 단계로 2개 중 1개 선택 + 암시장 진열. */
const RELIC_GUKBAP_SECTORS       = ['방어주', '우량주']; // 국밥 정신 적용 섹터
const RELIC_GUKBAP_LOSS_CUT      = 0.5;   // 국밥 정신: 평가손실 50% 감소
const RELIC_SEAL_DAYS            = 3;     // 존버의 인장: 장 마감을 이만큼 넘긴 포지션부터
const RELIC_SEAL_BONUS           = 0.20;  // 존버의 인장: 평가이익 +20% (0.1 → 0.2)
const RELIC_VIP_PUMP_CHANCE      = 0.80;  // 리딩방 VIP: 찌라시 급등 확률 (기대값 +3.2% → +5.8%)
const RELIC_HOTLINE_PENALTY_CUT = 1.0;    // 증권사 담당자 핫라인: 반대매매 투매 손실 면제 비율
const RELIC_CAPITAL_INTEREST_CUT = 0.5;   // 캐피탈 VVIP: 이자 할인
const RELIC_TALISMAN_AP          = 1;     // 떡상 기원 부적: 매일 행동력 +1
const RELIC_LAWYER_DECAY_MULT    = 2;     // 전관 변호사: 금감원 게이지 자연 감소(매일·매주) 배수
const RELIC_REWARD_CHOICES       = 2;     // 매주 결산 보상에 나오는 유물 수 (아직 없는 것만)
const RELIC_SHOP_COUNT           = 3;     // 암시장 유물 진열 수 (남은 유물이 모자라면 그만큼만)
const RELIC_SLOTS                = 6;     // 유물 보유 칸. 가득 차면 새 유물은 한 칸을 골라 교체하거나 포기 (docs/design/RELIC_SLOTS.md)
const RELIC_SELL_RATE            = 0.5;   // 암시장 유물 판매: 얻을 때 값(구매가, 보상이면 그 주 암시장 가격)의 이 비율을 비자금으로
const RELIC_PRICE                = { common:900, uncommon:1300, rare:1700, legendary:2200, mythic:3000 }; // 암시장 유물 가격 (비자금)
const RELIC_PAYDAY_BASE          = 60;    // 월급날: 매주 첫날 현금 +이만큼 × 주차. 200 → 60: 완만한 목표에서 카드 없이도 통과시키던 불로소득 (2~8주 합계 원금의 +70% → +21%)
const RELIC_INVERSE_DRAW         = 1;     // 인버스 장인: 인버스 종목을 살 때마다 드로우
const RELIC_COLD_WALLET_RATIO    = 0.20;  // 콜드월렛: 코인 종목 반대매매 기준 (기본 25%)
const RELIC_COLD_WALLET_MAINT_CUT = 0.15;  //   담보유지비율 방식이면 유지비율 −15%p (140% → 125%)
const RELIC_COLD_WALLET_STOCKS   = ['coin', 'meme'];
const RELIC_THEME_SECTORS        = ['테마주', '동전주', '작전주'];   // 테마주 헌터 적용 섹터
const RELIC_THEME_BONUS          = 0.15;  // 테마주 헌터: 평가이익 +15%
const RELIC_COMMUNITY_BONUS      = 0.10;  // 개미 커뮤니티: 찌라시 A 선택의 대박 확률 +10%p
const RELIC_DAYTRADER_CUT        = 1;     // 단타의 신: 하루 첫 매도 카드 행동력 −1
const RELIC_FSS_CONNECT_CUT      = 0.5;   // 금감원 인맥: 게이지 상승량 50% 감소
/* 성장형 유물 (docs/design/GROWTH_RELICS.md) — 판이 진행될수록 스택이 쌓이고, 조건에 걸리면 초기화된다.
   상태 run.relicState[id] = { stacks, best, bank }. 떡상 적금·반대매매 생존자는 S4부터 스택당 곱 배수(xmult) — 폭주가 목표 (사용자 결정, 제한은 무한 모드 목표 상승으로) */
const MOON_COMBO_STEP        = 3;     // 떡상 적금: 상승 콤보 3·6·9…마다 +1스택
const MOON_XMULT_PER_STACK   = 1.01;  //   스택당 정산 ×1.01 (곱)
const MOON_RESET_DOWN        = 10;    //   하락 콤보가 이 값이 되는 순간 0스택
const TEARJAR_RATE           = 0.10;  // 개미의 눈물 저금통: 손실 청산액의 10% 적립
const TEARJAR_PAYOUT_COMBO   = 5;     //   상승 콤보가 이 값이 되면 전액 현금 지급
const TEARJAR_MARGIN_KEEP    = 0.5;   //   반대매매 당하면 이만큼만 남는다 (절반 증발)
const TRAUMA_XMULT_PER_STACK = 1.03;  // 반대매매 생존자: 스택당 레버리지·숏 포지션 정산 ×1.03 (곱)
const TIPCOL_PER_STACK       = 0.02;  // 찌라시 수집가: 스택당 A 대박 확률 +2%p
const TIPCOL_MAX_BONUS       = 0.20;  //   최대 +20%p
const TIP_JACKPOT_CAP        = 0.95;  // 찌라시 A 대박 확률 상한 (개미 커뮤니티와 합산 후)
const DTREE_DAYS             = 3;     // 존버 나무: 장 마감을 이만큼 넘긴 포지션 1개당 +1스택
const DTREE_CUT_PER_STACK    = 0.01;  //   스택당 이자 −1%
const DTREE_MAX_CUT          = 0.60;  //   최대 −60%
const DTREE_SELL_KEEP        = 0.5;   //   그런 포지션을 직접 팔면 스택 절반
const COMPOUND_EXCESS        = 0.10;  // 복리 괴물: 결산에서 목표 대비 +10% 이상이면 +1스택, 아니면(통과는 했을 때) −1
const COMPOUND_CASH_PER_STACK = 0.01; //   주 첫날 현금 = 순자산 × 1% × 스택

/* ── S4 곱하기 콘텐츠 (docs/design/MULTIPLIERS.md) — 전부 장 마감 정산 배수. 수치는 D8(시뮬 후 조정) ── */
const ANTFLAG_PER_POS      = 1.5;   // 개미 군단 깃발: 포지션 1개당 ×1.5
const CC_START             = 1.1;   // 복리의 복리: ×1.1에서 시작
const CC_STEP              = 0.1;   //   수익 마감한 날 +0.1 (스택 1개 = 0.1)
const CC_LOSS_STEPS        = 3;     //   손실 마감한 날 −0.3 (스택 3개, ×1.1 아래로는 안 내려감)
const LIMITUP_BASE         = 2;     // 상한가 행진: 연속 상승 n일 → ×2ⁿ
const LIMITUP_MAX_STREAK   = 10;    //   n 상한 (×1024)
const PHOENIX_PER_STACK    = 1.25;  // 반대매매 불사조: 반대매매 1번당 영구 ×1.25
const DOPAMINE_PER_COMBO   = 1;     // 도파민 과다: 상승 콤보 1당 합산 배수 +1
const DOPAMINE_X_COMBO     = 10;    //   콤보가 이 이상이면 대신 ×콤보
const FSS_VIP_MULT         = 10;    // 금감원 VIP: 이번 주 제재를 당했으면 ×10
const BRINK_RATIO          = 0.5;   // 벼랑 끝 전술: 순자산 < 이번 주 목표 × 0.5면
const BRINK_MULT           = 5;     //   ×5
const SPLIT_WAYS           = 2;     // 주식 분할: 똑같은 두 포지션으로 (강화 3개)
const SPLIT_WAYS_UP        = 3;
const LEV_ETF_MULT         = 2;     // 레버리지 ETF: 포지션 레버리지 ×2 (중첩)
const LEV_ETF_MAX_LEV      = 24;    //   레버리지 상한
const FUTURES_MULT         = 3;     // 선물 만기일: 이번 주 정산 ×3
const FUTURES_MULT_UP      = 4;
const FUTURES_NEXT         = 0.5;   //   다음 주 정산 ×0.5
const COIN_FLIP_CHANCE     = 0.5;   // 모 아니면 도: 성공 확률 (화면에 그대로)
const COIN_FLIP_CHANCE_UP  = 0.6;
const COIN_FLIP_MULT       = 10;    //   성공하면 그 포지션 오늘 정산 ×10, 실패하면 포지션 가치 0
/* N1 정산 비중 실험 스위치 (0 = 끔 = 현행). docs/design/SETTLEMENT.md 'N1' — 사용자 결정 전까지 둘 다 0
   SETTLE_BASE_CAP: 정산에 넣는 base를 포지션 원금 대비 하루 ±이 비율로 자른다 (평가손익은 그대로, 보너스 계산만)
   HOLD_CHIP_PCT:   수익 마감 포지션에 base와 별개로 원금 × 이 비율을 칩으로 더한다 (작은 상승에도 배수가 일하게) */
const SETTLE_BASE_CAP      = 0;
const HOLD_CHIP_PCT        = 0;
const CRIT_CHANCE          = 0.05;  // 크리티컬 정산: 수익 포지션 정산마다 5%
const CRIT_TABLE           = [ { mult: 2, weight: 70 }, { mult: 3, weight: 25 }, { mult: 5, weight: 5 } ];   // 배수 · 가중치

/* ══ 규칙 파괴형 유물 10종 (docs/design/RULE_BREAKER_RELICS.md) — 큰 제약 1개 + 큰 보상 1개. 끄면(RULE_BREAKER_RELICS_ON=false) 도입 전과 같은 판 ══ */
const RULE_BREAKER_RELICS_ON = true;
const OATH_X_PER_DAY        = 1.5;   // 💎 존버 서약서: 장 마감을 넘긴 날마다 그 포지션 정산 ×1.5
const OATH_MAX_DAYS         = 12;    //    최대 12일 (×1.5¹² ≈ ×130)
const SCALP_MULT_STEP       = 0.5;   // ⚡ 단타 중독: 오늘 k번째 수익 매도 정산에 합산 배수 +0.5k
const WATER_X_PER_STACK     = 2;     // 🌊 물타기 장인: 손실 중 추가 매수마다 물 +1 → 수익 마감 정산 ×2^물
const WATER_MAX             = 6;     //    물 최대 6 (×64)
const CONTRARIAN_SHORT_MULT = 5;     // 🐜 인간 역지표: 롱으로 가진 종목에 건 숏 포지션 정산 ×5 (3 → 5, 사용자 결정 2026-09-30 — 측정 보정 A안)
const YOLO_LOAN_LIMIT       = 0.5;   // 🏦 영끌 대출: 현금 마이너스 한도 = 이번 주 목표 × 0.5
const YOLO_LOAN_WEEKLY_RATE = 0.2;   //    주말 결산 때 마이너스 현금의 20% 이자
const YOLO_LOAN_MULT_UNIT   = 0.1;   //    빚이 이번 주 목표의 10%만큼 늘 때마다 정산 합산 배수 +1
const FOCUS_EXTRA           = 2;     // 🧲 몰아주기: 바로 왼쪽 칸 유물 효과를 이 칸에서 2번 더 (오른쪽 칸은 꺼짐)
const LAST_TRAIN_POW        = 1.5;   // 🚂 막차 탑승: 맨 오른쪽 칸이면 누적 배수 m → m^1.5 (사용자 결정 — 제곱 대신)
const LAST_TRAIN_PENALTY    = 1;     //    맨 오른쪽이 아니면 정산 ×1 = 효과 없음 (0.5 → 1, 사용자 결정 2026-09-30 — 측정 보정 A안)
const CASHGANG_PER_EMPTY    = 1.5;   // 🕳️ 무소유 투자법: 빈 유물 칸 1개당 정산 ×1.5 (사용자 결정 — 1.8 대신)
const CASHGANG_SLUSH        = 300;   //    결산 유물 보상 대신 비자금 +300
const CULT_BLOCKED_CARDS    = ['ipo', 'chaseLimit', 'hedge', 'fullBuy', 'relist'];   // 🙏 풀매수 교주: 다른 종목을 살 수 있는 카드 (포지션이 있으면 막힘)
const TIPBRO_JACKPOT_SCALE  = 0.5;   // 🎰 찌라시 확신범: 대박 효과는 절반 (쪽박은 뒤집힘)
const RULE_BREAKER_POOL_EXCLUDE = ['scalper'];   // 결산 보상·암시장 유물 풀에서 뺀다 (코드·튜너 장착은 그대로). ⚡ 단타 중독: 장중 매도 봇으로도 −28~−34%p = 정산 구조 문제 → 장중 거래 설계와 함께 재설계 (사용자 결정 2026-09-30)
const RULE_BREAKER_IDS = ['oath', 'scalper', 'water', 'contrarian', 'yoloLoan', 'focus', 'lastTrain', 'cashGang', 'cult', 'tipBro'];

const RELICS = [
  { id:'gukbap',   icon:'🍲', name:'국밥 정신',       rarity:'rare',
    desc:`${RELIC_GUKBAP_SECTORS.join('·')} 종목 포지션이 그날 손실로 장을 마감하면 그 손실의 ${Math.round(RELIC_GUKBAP_LOSS_CUT * 100)}%를 정산에서 돌려받는다.`,
    flavor:'든든하게 한 그릇 말고 오면 손실도 반만 아프다.' },
  { id:'seal',     icon:'🔏', name:'존버의 인장',     rarity:'uncommon',
    desc:`장 마감을 ${RELIC_SEAL_DAYS}번 이상 넘긴 포지션은 장 마감 정산 ×${1 + RELIC_SEAL_BONUS}.`,
    flavor:'팔면 끝이고, 안 팔면 아직 끝난 게 아니다.' },
  { id:'vip',      icon:'📱', name:'리딩방 VIP',      rarity:'uncommon',
    desc:`리딩방 찌라시 급등 확률 ${Math.round(PUMP_UP_CHANCE * 100)}% → ${Math.round(RELIC_VIP_PUMP_CHANCE * 100)}%.`,
    flavor:'월 99만원. 무료방보다 3초 빨리 알려준다.' },
  { id:'hotline', icon:'📞', name:'증권사 담당자 핫라인', rarity:'uncommon',
    desc:`반대매매 때 투매 손실(노출액 ${Math.round(LIQUIDATION_PENALTY * 100)}%)이 ${Math.round(RELIC_HOTLINE_PENALTY_CUT * 100)}% 면제된다.`,
    flavor:'담보 부족 문자보다 전화가 먼저 온다.' },
  { id:'capital',  icon:'🏦', name:'캐피탈 VVIP 카드', rarity:'common',
    desc:`신용·대차·마이너스 통장 이자 ${Math.round(RELIC_CAPITAL_INTEREST_CUT * 100)}% 할인.`,
    flavor:'고객님은 저희 캐피탈의 소중한 VVIP입니다. (연 19.9%)' },
  { id:'talisman', icon:'🧿', name:'떡상 기원 부적',  rarity:'mythic',
    desc:`매일 장전 행동력 +${RELIC_TALISMAN_AP}.`,
    flavor:'타이틀 화면에 붙어 있던 그 부적. 효과는 과학적으로 검증되지 않았다.' },
  { id:'parents',  icon:'💌', name:'부모님 카드',     rarity:'legendary',
    desc:'목표 미달로 강제 은퇴될 때 딱 한 번, 부족한 금액을 채워 결산을 통과시킨다. 쓰면 사라진다.',
    flavor:'"이번이 진짜 마지막이다." 이후 연락 두절.' },
  { id:'lawyer',   icon:'👔', name:'전관 변호사',     rarity:'uncommon',
    desc:`금감원 감시 게이지가 매일·매주 ${RELIC_LAWYER_DECAY_MULT}배로 빨리 줄어든다 (장 마감 −${FSS_DAILY_DECAY * RELIC_LAWYER_DECAY_MULT}, 새 주 −${FSS_WEEKLY_DECAY * RELIC_LAWYER_DECAY_MULT}).`,
    flavor:'"그 건은 제가 전화 한 통이면 됩니다." 수임료는 묻지 마세요.' },
  { id:'payday',   icon:'🪙', name:'월급날',          rarity:'common',
    desc:`매주 첫날 현금 +₩${RELIC_PAYDAY_BASE}만 × 주차.`,
    flavor:'통장을 스쳐 지나가는 데 걸리는 시간 0.3초.' },
  { id:'inverse',  icon:'🔄', name:'인버스 장인',     rarity:'common',
    desc:`인버스 종목(지수 인버스·곱버스)을 카드로 살 때마다 카드 ${RELIC_INVERSE_DRAW}장을 뽑는다.`,
    flavor:'"모두가 탐욕스러울 때 곱버스." 3년째 물려 있다.' },
  { id:'coldwallet', icon:'🧊', name:'콜드월렛',      rarity:'common',
    desc: MAINTENANCE_MARGIN_ON ? `대장코인·밈코인 포지션의 담보유지비율 ${Math.round(MAINTENANCE_RATIO * 100)}% → ${Math.round((MAINTENANCE_RATIO - RELIC_COLD_WALLET_MAINT_CUT) * 100)}% (반대매매가 늦게 온다).`
      : `대장코인·밈코인 포지션의 반대매매 기준 증거금률 ${Math.round(MARGIN_CALL_RATIO * 100)}% → ${Math.round(RELIC_COLD_WALLET_RATIO * 100)}%.`,
    flavor:'시드 문구는 냉장고에 붙여 놨다.' },
  { id:'theme',    icon:'🔥', name:'테마주 헌터',     rarity:'uncommon',
    desc:`${RELIC_THEME_SECTORS.join('·')} 포지션의 장 마감 정산 ×${1 + RELIC_THEME_BONUS}.`,
    flavor:'테마는 순환한다. 내가 산 테마만 빼고.' },
  { id:'community', icon:'👥', name:'개미 커뮤니티',   rarity:'uncommon',
    desc:`찌라시에서 A(고위험)를 고르면 대박 확률 +${Math.round(RELIC_COMMUNITY_BONUS * 100)}%p.`,
    flavor:'"형님들 이거 가나요?" "갑니다(떡상 이모티콘)"' },
  { id:'shortpro', icon:'📉', name:'공매도 전문가',   rarity:'rare',
    desc:'숏 포지션 대차 이자 면제.',
    flavor:'개인도 할 수 있다. 서류가 47장이라서 그렇지.' },
  { id:'daytrader', icon:'⚡', name:'단타의 신',      rarity:'rare',
    desc:`하루 첫 매도 카드의 행동력 −${RELIC_DAYTRADER_CUT} (최소 0).`,
    flavor:'보유 기간 평균 11초. 세금은 연말에 생각하기로.' },
  { id:'fssconnect', icon:'🤝', name:'금감원 인맥',   rarity:'rare',
    desc:`금감원 감시 게이지 상승량 ${Math.round(RELIC_FSS_CONNECT_CUT * 100)}% 감소.`,
    flavor:'"고등학교 동창이 거기 다녀." 동창은 인사팀이다.' },
  { id:'timemachine', icon:'🕰️', name:'타임머신',    rarity:'mythic',
    desc:'매일 장전에 시장 카드(비둘기·매파·CEO 트윗) 판정과 리딩방 결과를 미리 본다.',
    flavor:'정보가 곧 실력이다. 그 정보가 미래에서 왔을 뿐.' },
  // ── 성장형 (growth: 'count' = 스택 개수 · 'money' = 적립금 만원) ──
  { id:'moonSavings', icon:'📈', name:'떡상 적금', rarity:'rare', growth:'count',
    desc:`상승 콤보 ${MOON_COMBO_STEP}·${MOON_COMBO_STEP * 2}·${MOON_COMBO_STEP * 3}…마다 +1스택. 스택당 모든 포지션 장 마감 정산 ×${MOON_XMULT_PER_STACK} (곱 — 스택이 쌓일수록 기하급수). 하락 콤보 ${MOON_RESET_DOWN}이면 강제 해지(0스택).`,
    reset:`하락 콤보 ${MOON_RESET_DOWN} → 0스택`,
    flavor:'"적금은 복리래." 이율은 차트가 정한다.' },
  { id:'tearJar', icon:'🐷', name:'개미의 눈물 저금통', rarity:'uncommon', growth:'money',
    desc:`손실로 청산할 때마다 손실액의 ${Math.round(TEARJAR_RATE * 100)}% 적립. 상승 콤보 ${TEARJAR_PAYOUT_COMBO}에 전액 현금 지급. 반대매매 당하면 절반 증발.`,
    reset:`반대매매 → 적립금 ${Math.round((1 - TEARJAR_MARGIN_KEEP) * 100)}% 증발`,
    flavor:'눈물 젖은 돼지. 배를 가르면 조금 덜 슬프다.' },
  { id:'traumaSurvivor', icon:'🩹', name:'반대매매 생존자', rarity:'legendary', growth:'count',
    desc:`반대매매를 당할 때마다 +1스택 (트라우마 카드는 그대로). 스택당 레버리지·숏 포지션 장 마감 정산 ×${TRAUMA_XMULT_PER_STACK} (곱).`,
    reset:'초기화 없음 — 대신 반대매매 자체가 고통',
    flavor:'"한 번 털려 봐야 안다." 세 번 털린 사람이 말했다.' },
  { id:'tipCollector', icon:'📂', name:'찌라시 수집가', rarity:'rare', growth:'count',
    desc:`찌라시 A(고위험)를 고를 때마다 +1스택 (결과 무관). 스택당 A 대박 확률 +${Math.round(TIPCOL_PER_STACK * 100)}%p (최대 +${Math.round(TIPCOL_MAX_BONUS * 100)}%p). B를 고르면 초기화.`,
    reset:'찌라시 B 선택 → 0스택',
    flavor:'단톡방 캡처 폴더 128GB. 출처는 전부 "아는 형".' },
  { id:'diamondTree', icon:'🌳', name:'존버 나무', rarity:'uncommon', growth:'count',
    desc:`장 마감마다 ${DTREE_DAYS}일 이상 보유한 포지션 수만큼 +스택. 스택당 매일 이자 −${Math.round(DTREE_CUT_PER_STACK * 100)}% (최대 −${Math.round(DTREE_MAX_CUT * 100)}%). 그 포지션을 직접 팔면 절반 벌목.`,
    reset:`${DTREE_DAYS}일 이상 보유 포지션 수동 매도 → 스택 절반`,
    flavor:'물 대신 물린 만큼 자란다.' },
  { id:'compoundMonster', icon:'👹', name:'복리 괴물', rarity:'mythic', growth:'count',
    desc:`결산에서 목표를 ${Math.round(COMPOUND_EXCESS * 100)}% 이상 넘기면 +1스택, 겨우 통과하면 −1. 매주 첫날 현금 +순자산 × ${Math.round(COMPOUND_CASH_PER_STACK * 100)}% × 스택.`,
    reset:`목표 +${Math.round(COMPOUND_EXCESS * 100)}% 미만으로 통과 → −1스택`,
    flavor:'아인슈타인이 말했다던 그것. 말한 적은 없다.' },
  // ── 곱하기 (S4) ──
  { id:'levTower', icon:'🗼', name:'레버리지 탑', rarity:'rare',
    desc:'장 마감 정산 × 보유 포지션 레버리지를 전부 곱한 값 (3x·2x·2x → ×12). 오늘 반대매매가 났으면 그날은 효과 없음.',
    flavor:'한 층 올라갈 때마다 전망이 좋아진다. 내려올 땐 엘리베이터가 없다.' },
  { id:'sectorSet', icon:'🧩', name:'섹터 풀세트', rarity:'uncommon',
    desc:'장 마감 정산 × 보유한 서로 다른 섹터 수.',
    flavor:'분산 투자의 정석. 전부 같이 빠진다는 것만 빼면.' },
  { id:'antFlag', icon:'🚩', name:'개미 군단 깃발', rarity:'uncommon',
    desc:`장 마감 정산 × ${ANTFLAG_PER_POS}^포지션 수 (포지션 1개당 ×${ANTFLAG_PER_POS}).`,
    flavor:'깃발 아래 모인 개미는 강하다. 한 마리씩 털려서 그렇지.' },
  { id:'ccompound', icon:'♾️', name:'복리의 복리', rarity:'rare', growth:'count',
    desc:`장 마감 정산 ×${CC_START}에서 시작. 수익으로 마감한 날마다 영구 +${CC_STEP}, 손실로 마감하면 −${CC_STEP * CC_LOSS_STEPS} (×${CC_START} 아래로는 안 내려감).`,
    reset:`손실 마감한 날 −${CC_STEP * CC_LOSS_STEPS}`,
    flavor:'복리를 복리로 굴리면? 계산기가 먼저 포기했다.' },
  { id:'limitUp', icon:'🚀', name:'상한가 행진', rarity:'legendary',
    desc:`포지션이 장 마감 기준으로 연속 상승한 날 수 n(오늘 포함, 최대 ${LIMITUP_MAX_STREAK}) → 그 포지션 정산 ×${LIMITUP_BASE}ⁿ. 하락 마감하면 리셋.`,
    flavor:'점상 → 점상 → 점상. 네 번째 날 아침이 제일 무섭다.' },
  { id:'phoenix', icon:'🐦‍🔥', name:'반대매매 불사조', rarity:'rare', growth:'count',
    desc:`반대매매를 당할 때마다 영구 +1스택. 모든 포지션 정산 ×${PHOENIX_PER_STACK}^스택.`,
    reset:'초기화 없음',
    flavor:'깡통에서 다시 태어난다. 몇 번째인지는 세지 않는다.' },
  { id:'copycat', icon:'🦜', name:'리딩방 따라쟁이', rarity:'rare',
    desc:'정산에서 바로 오른쪽 칸 유물의 효과를 한 번 더 복사해 발동한다.',
    flavor:'"저도 그거 샀어요." 언제나 한 박자 늦게.' },
  { id:'rerun', icon:'📺', name:'재방송 뉴스', rarity:'rare',
    desc:'정산에서 맨 왼쪽(1번 칸) 유물의 효과가 이 칸에서 한 번 더 발동한다.',
    flavor:'어제 호재가 오늘 또 호재. 시장은 기억력이 나쁘다.' },
  { id:'dopamine', icon:'💉', name:'도파민 과다', rarity:'uncommon',
    desc:`장 마감 때 상승 콤보 수만큼 합산 배수 +${DOPAMINE_PER_COMBO}. 콤보 ${DOPAMINE_X_COMBO} 이상이면 대신 ×콤보 수.`,
    flavor:'초록 캔들 하나에 도파민 한 방울.' },
  { id:'fssVip', icon:'🎖️', name:'금감원 VIP', rarity:'rare',
    desc:`이번 주 금감원 제재를 당했으면 장 마감 정산 ×${FSS_VIP_MULT}.`,
    flavor:'조사실 커피 취향까지 기억해 주는 사이.' },
  { id:'brink', icon:'🧗', name:'벼랑 끝 전술', rarity:'uncommon',
    desc:`순자산이 이번 주 목표의 ${Math.round(BRINK_RATIO * 100)}% 미만이면 장 마감 정산 ×${BRINK_MULT}.`,
    flavor:'잃을 게 없는 사람이 제일 크게 건다.' },
  { id:'infinity', icon:'🌌', name:'무량대수', rarity:'mythic',
    desc:'정산 맨 마지막(칸 위치 무관)에 그 포지션 정산 금액(만원)의 자릿수만큼 ×배수.',
    flavor:'10⁶⁸. 여기까지 세어 본 사람은 없다.' }
];
if(RULE_BREAKER_RELICS_ON) RELICS.push(   // ── 규칙 파괴형 (rule: true — 정산 무대 계산식 줄에 이름이 뜬다) ──
  { id:'oath', icon:'💎', name:'존버 서약서', rarity:'rare', rule:true,
    desc:`직접 매도 전부 불가 (매도 버튼·전량 매도·매도 카드). 대신 포지션이 장 마감을 넘긴 날 n마다 그 포지션 정산 ×${OATH_X_PER_DAY}ⁿ (최대 ${OATH_MAX_DAYS}일). 예약주문·반대매매는 그대로.`,
    flavor:'"팔면 지는 거다." 서명은 인감도장으로.' },
  { id:'scalper', icon:'⚡', name:'단타 중독', rarity:'rare', rule:true,
    desc:`장 마감 정산에서 보유 포지션은 보너스 없음. 대신 수익 매도하는 순간 그 매도분을 바로 정산한다 (유물 칸 순서대로) — 오늘 k번째 수익 매도면 합산 배수 +${SCALP_MULT_STEP}k.`,
    flavor:'차트를 끄면 손이 떨린다. 켜면 더 떨린다.' },
  { id:'water', icon:'🌊', name:'물타기 장인', rarity:'uncommon', rule:true,
    desc:`손실 중인 포지션은 직접 팔 수 없다. 손실 중인 포지션에 추가 매수할 때마다 물 +1 → 수익으로 마감한 날 그 포지션 정산 ×${WATER_X_PER_STACK}^물 (최대 ${WATER_MAX}).`,
    flavor:'평단은 낮아지고 수위는 높아진다.' },
  { id:'contrarian', icon:'🐜', name:'인간 역지표', rarity:'rare', rule:true,
    desc:`내가 롱으로 가진 종목은 매일 추세가 무조건 매도세가 된다. 대신 롱과 같은 종목에 건 숏 포지션 정산 ×${CONTRARIAN_SHORT_MULT}.`,
    flavor:'"내가 사면 떨어진다." 이제 그걸로 돈을 번다.' },
  { id:'yoloLoan', icon:'🏦', name:'영끌 대출', rarity:'legendary', rule:true,
    desc:`현금이 마이너스여도 매수할 수 있다 (한도: 이번 주 목표의 ${Math.round(YOLO_LOAN_LIMIT * 100)}%). 빚이 목표의 ${Math.round(YOLO_LOAN_MULT_UNIT * 100)}%씩 늘 때마다 수익 정산 합산 배수 +1. 대신 주말 결산 때 마이너스 현금의 ${Math.round(YOLO_LOAN_WEEKLY_RATE * 100)}% 이자.`,
    flavor:'한도는 목표 금액, 이자는 영혼.' },
  { id:'focus', icon:'🧲', name:'몰아주기', rarity:'rare', rule:true,
    desc:`정산에서 바로 왼쪽 칸 유물의 효과가 이 칸에서 ${FOCUS_EXTRA}번 더 발동한다. 대신 바로 오른쪽 칸 유물은 꺼진다.`,
    flavor:'한 놈만 팬다. 옆 놈은 굶는다.' },
  { id:'lastTrain', icon:'🚂', name:'막차 탑승', rarity:'legendary', rule:true,
    desc:`맨 오른쪽 유물 칸에 있으면 그때까지 쌓인 정산 배수 m → m^${LAST_TRAIN_POW}. ${LAST_TRAIN_PENALTY < 1 ? `맨 오른쪽이 아니면 수익 정산 ×${LAST_TRAIN_PENALTY}.` : '맨 오른쪽이 아니면 효과 없음.'}`,
    flavor:'"여기가 꼭대기일 리 없어." 기관사도 모른다.' },
  { id:'cashGang', icon:'🕳️', name:'무소유 투자법', rarity:'uncommon', rule:true,
    desc:`빈 유물 칸 1개당 수익 정산 ×${CASHGANG_PER_EMPTY}. 대신 결산 유물 보상을 받을 수 없다 (비자금 +${CASHGANG_SLUSH}로 대신). 암시장 유물은 살 수 있다.`,
    flavor:'가진 게 없으면 잃을 것도 없다. 계좌 빼고.' },
  { id:'cult', icon:'🙏', name:'풀매수 교주', rarity:'rare', rule:true,
    desc:`한 번에 한 종목만 보유할 수 있다 (다른 종목 매수 차단). 그 종목 카드는 행동력 0, 이번 주 그 종목에 추가 매수한 횟수 k → 정산 ×(1+k).`,
    flavor:'분산 투자는 믿음이 부족한 자의 것.' },
  { id:'tipBro', icon:'🎰', name:'찌라시 확신범', rarity:'uncommon', rule:true,
    desc:`찌라시에서 B(안전)를 고를 수 없다. 대신 A가 쪽박이면 효과가 뒤집힌다 (손실 → 이익, 하락 → 상승). 대박이면 효과는 ${Math.round(TIPBRO_JACKPOT_SCALE * 100)}%만.`,
    flavor:'출처: 믿어봐 형.' }
);

/* 찌라시 — 장중 무작위 선택 이벤트. 도착하면 선택할 때까지 시장이 멈춘다.
   choices[0] = A(고위험), choices[1] = B(작지만 확정 / 위험 회피). outcomes의 chance 합은 1.
   효과 kind: cash(현금 ±) · buy(종목 1x 매수, 현금 사용) · shock(종목 가격 즉시 ±%) · pump(오늘 남은 장 동안 작전 추세 ±)
            · market(시장 분위기 BULL/BEAR/VOLATILE) · sellStock(그 종목 포지션 정리) · protect(오늘 모든 포지션 반대매매 면제) · slush(비자금 +amount, 주차 배율 없음)
   cash·buy 금액은 1주차 기준 만원이고, 주차 목표에 비례해 커진다 (tipScale).
   stock:'$pick' = 찌라시가 도착할 때 무작위로 정한 종목(인버스 제외), 글에서는 {stock}. */
const TIP_EVENT_CHANCE  = 0.08;  // 장중 캔들마다 찌라시 도착 확률
const TIP_MIN_GAP_TICKS = 6;     // 찌라시 사이 최소 캔들 수
const TIP_MAX_PER_DAY   = 2;     // 하루 최대 찌라시 수
const TIP_LOG_SIZE      = 6;     // 찌라시 탭에 남기는 최근 결과 수

const TIP_EVENTS = [
  { id:'fed', headline:'★ 속보: FED 연준 의장 기침!', body:'시장이 과민반응을 보이고 있습니다. 포지션을 유지하시겠습니까?', pick:false,
    choices:[
      { label:'숏 스퀴즈에 사활 걸기', outcomes:[
        { chance:0.5, tag:'대박', text:'숏 스퀴즈 성공! 공매도 세력이 털렸다', effects:[{ kind:'cash', amount:300 }, { kind:'market', state:'BULL' }] },
        { chance:0.5, tag:'쪽박', text:'역으로 털렸습니다… 세력은 늘 한 수 위', effects:[{ kind:'cash', amount:-300 }, { kind:'market', state:'BEAR' }] } ] },
      { label:'관망하며 현금 기원', outcomes:[
        { chance:1, tag:'확정', text:'관망 성공. 커피값은 비자금으로', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  { id:'semi10', headline:'[찌라시] 반도체전자 "10만 전자" 간다', body:'단톡방 17곳에서 동시에 같은 캡처가 돌고 있다. 출처는 "아는 형".', pick:false,
    choices:[
      { label:'소문에 올라탄다', outcomes:[
        { chance:0.5, tag:'대박', text:'10만 전자 가즈아! 반도체전자 급등', effects:[{ kind:'buy', stock:'semi', amount:1500 }, { kind:'shock', stock:'semi', pct:0.1 }] },
        { chance:0.5, tag:'쪽박', text:'고점에 물렸다. 반도체전자 급락', effects:[{ kind:'buy', stock:'semi', amount:1500 }, { kind:'shock', stock:'semi', pct:-0.1 }] } ] },
      { label:'찌라시를 되판다', outcomes:[
        { chance:1, tag:'확정', text:'리딩방에 캡처를 팔았다. 뒷돈은 비자금으로', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  { id:'memeList', headline:'[속보] 밈코인 해외 거래소 상장설', body:'"오늘 밤 12시 상장" 트윗. 계정 생성일은 사흘 전이다.', pick:false,
    choices:[
      { label:'밈코인 몰빵', outcomes:[
        { chance:0.4, tag:'대박', text:'상장 확정! 밈코인 폭등', effects:[{ kind:'buy', stock:'meme', amount:600 }, { kind:'shock', stock:'meme', pct:0.45 }] },
        { chance:0.6, tag:'쪽박', text:'가짜 뉴스였다. 밈코인 폭락', effects:[{ kind:'buy', stock:'meme', amount:600 }, { kind:'shock', stock:'meme', pct:-0.3 }] } ] },
      { label:'구경하며 방송 켠다', outcomes:[
        { chance:1, tag:'확정', text:'"떡락 중계" 방송 후원이 비자금으로 들어왔다', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  { id:'hack', headline:'[속보] 대장 거래소 해킹 의혹', body:'출금이 막혔다는 글이 올라온다. 거래소 공지는 "점검 중" 한 줄뿐.', pick:false,
    choices:[
      { label:'공포에 산다', outcomes:[
        { chance:0.5, tag:'대박', text:'루머였다! 대장코인 반등', effects:[{ kind:'buy', stock:'coin', amount:1000 }, { kind:'shock', stock:'coin', pct:0.2 }] },
        { chance:0.5, tag:'쪽박', text:'진짜였다… 대장코인 급락', effects:[{ kind:'buy', stock:'coin', amount:1000 }, { kind:'shock', stock:'coin', pct:-0.2 }, { kind:'market', state:'BEAR' }] } ] },
      { label:'대장코인 전부 손절', outcomes:[
        { chance:1, tag:'회피', text:'보유 대장코인을 전부 정리했다. 오늘 밤은 잔다', effects:[{ kind:'sellStock', stock:'coin' }] } ] } ] },
  { id:'sc', headline:'[찌라시] 초전도체 상온 재현 성공?!', body:'흐릿한 논문 사진 한 장. 전공자는 아무도 없는데 확신은 넘친다.', pick:false,
    choices:[
      { label:'테마 추격 매수', outcomes:[
        { chance:0.5, tag:'대박', text:'재현 성공 소식! 오늘 종일 상한가 행진', effects:[{ kind:'buy', stock:'sc', amount:800 }, { kind:'shock', stock:'sc', pct:0.1 }, { kind:'pump', stock:'sc', dir:1 }] },
        { chance:0.5, tag:'쪽박', text:'재현 실패. 오늘 종일 설거지', effects:[{ kind:'buy', stock:'sc', amount:800 }, { kind:'shock', stock:'sc', pct:-0.1 }, { kind:'pump', stock:'sc', dir:-1 }] } ] },
      { label:'논문부터 읽어본다', outcomes:[
        { chance:1, tag:'확정', text:'논문 요약 블로그 광고 수익 (비자금)', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  { id:'bigstep', headline:'[속보] 한은 총재 "빅스텝도 배제 안 해"', body:'금리가 오르면 누가 웃고 누가 우는가.', pick:false,
    choices:[
      { label:'곱버스 풀매수', outcomes:[
        { chance:0.5, tag:'대박', text:'폭락장 개막! 곱버스 파티', effects:[{ kind:'buy', stock:'inv2', amount:1000 }, { kind:'shock', stock:'inv2', pct:0.08 }, { kind:'market', state:'BEAR' }] },
        { chance:0.5, tag:'쪽박', text:'"배제 안 한다"는 "안 한다"였다. 반등장', effects:[{ kind:'buy', stock:'inv2', amount:1000 }, { kind:'shock', stock:'inv2', pct:-0.08 }, { kind:'market', state:'BULL' }] } ] },
      { label:'레버리지 포지션 방어', outcomes:[
        { chance:1, tag:'회피', text:'오늘 모든 포지션 반대매매 면제. 담보부터 챙겼다', effects:[{ kind:'protect' }] } ] } ] },
  { id:'youtuber', headline:'[찌라시] 구독자 300만 유튜버 "인생 종목" 공개', body:'썸네일: 빨간 화살표 3개, 놀란 얼굴, "{stock} 이거 모르면 손해".', pick:true,
    choices:[
      { label:'구독, 좋아요, 풀매수', outcomes:[
        { chance:0.35, tag:'대박', text:'진짜 인생 종목! {stock} 급등', effects:[{ kind:'buy', stock:'$pick', amount:700 }, { kind:'shock', stock:'$pick', pct:0.4 }] },
        { chance:0.65, tag:'쪽박', text:'영상 올리기 전에 본인이 팔았다. {stock} 급락', effects:[{ kind:'buy', stock:'$pick', amount:700 }, { kind:'shock', stock:'$pick', pct:-0.22 }] } ] },
      { label:'댓글로 "잘 봤습니다"만', outcomes:[
        { chance:1, tag:'확정', text:'베스트 댓글 등극. 광고 수익은 비자금으로', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  { id:'mom', headline:'[문자] 엄마: "너 요즘 주식하니?"', body:'읽음 표시가 떴다. 답장을 기다리고 계신다.', pick:false,
    choices:[
      { label:'코인 한다고 고백', outcomes:[
        { chance:0.45, tag:'대박', text:'"우리 아들 대단하네" 용돈 입금', effects:[{ kind:'cash', amount:500 }] },
        { chance:0.55, tag:'쪽박', text:'등짝 스매싱. 이번 달 용돈 끊김', effects:[{ kind:'cash', amount:-400 }] } ] },
      { label:'"적금 들고 있어요"', outcomes:[
        { chance:1, tag:'확정', text:'"기특하네" 몰래 쓰라며 비상금 입금', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] },
  // (S7-20) 세력 매집: 무작위로 오지 않는다(special) — 장중 캔들에 긴 아래꼬리가 생기면 maybeAccumTip이 연다. {accumUp} = 내일 매수세 전환 확률(엔진 accumUpChance 그대로)
  { id:'accum', special:true, headline:'★ 세력 매집 포착: {stock}', body:'장중 긴 아래꼬리 — 누군가 저가에서 쓸어 담았다. 내일 매수세 전환 확률 {accumUp} (평소보다 높음).', pick:true,
    choices:[
      { label:'세력 옆자리에 탑승 (매수)', outcomes:[
        { chance:1, tag:'확정', text:'{stock} 매수 완료. 내일 추세는 개장 뒤에 드러난다', effects:[{ kind:'buy', stock:'$pick', amount:500 }] } ] },
      { label:'"설거지일 수도" 관망', outcomes:[
        { chance:1, tag:'확정', text:'캡처만 해 뒀다. 정보값은 비자금으로', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] }
];
/* (S7-20) 세력 매집 이벤트 */
const ACCUM_TAIL_RATIO     = 3;      // 아래꼬리 ≥ 몸통 × 3
const ACCUM_TRIGGER_CHANCE = 0.05;   // 조건을 만족한 캔들에서 찌라시가 뜰 확률 (종목 13개 × 12틱이라 조건 캔들이 많다 — 찌라시 5건 중 1건쯤이 되게)
const ACCUM_UP_BONUS       = 0.35;   // 매집 포착 종목: 내일 UP 전이 확률 +35%p (다른 상태는 비율대로 줄인다)
const ACCUM_REGIMES        = ['UP', 'FLAT'];   // 이 추세일 때만 (하락·과열 종목의 꼬리는 매집이 아니다)

/* 게임오버 원인 판정 기준 (문구는 UI의 ENDINGS) */
// 목표 미달 엔딩 판정 (classifyEnd). 위에서부터 먼저 맞는 것
//   이번 주 매수 0회 + 현금 위주 → 관망의 신 · 주중에 목표를 넘겼다가 미달 → 천당과 지옥 · 아깝다 → 반대매매 단골
//   → 부족분의 END_CAUSE_SHARE 이상을 차지한 손실 원인 (과징금 → 찌라시 → 이자 → 평가손실 → 확정손실) → 수익은 났지만 미달 → 깡통 계좌
const END_NEAR_MISS_PCT      = 0.90;  // 아깝다: 목표의 90% 이상이면서
const END_NEAR_MISS_PROGRESS = 0.50;  //         이번 주 필요 상승분(목표 − 주 시작 순자산)의 50% 이상을 벌었을 때 (주간 수익 플러스)
const END_CAUSE_SHARE        = 0.50;  // 부족분(목표 − 순자산)의 절반 이상을 한 원인이 차지하면 그 원인의 엔딩
const END_LIQ_ADDICT         = 3;     // 한 판 반대매매 이 횟수 이상 → '반대매매 단골'
const END_SIDELINE_INVESTED  = 0.50;  // 관망의 신: 매수 0회 + 결산 때 직접 산 포지션(찌라시 제외) 노출액이 순자산의 이 비율 미만
const END_ROUND_TRIP_OVER    = 0.03;  // 천당과 지옥: 주중 최고 순자산이 목표를 이만큼(+3%) 넘겼다가 결산에서 미달

/* 빌드 태그 7종 (docs/design/DECKBUILDING.md). 보상·암시장 진열·팩에서 내 덱(카드 + 유물)의 가장 많은 태그를 가진 후보는
   같은 등급 안에서 가중치 × (1 + TAG_BIAS). 등급 확률은 그대로, 등급 안 확률만 바뀐다 (팩 확률 팝업도 같은 값) */
const TAGS = {
  lev:    { icon:'🔥', name:'레버리지' },
  short:  { icon:'📉', name:'공매도' },
  hodl:   { icon:'💎', name:'존버' },
  scalp:  { icon:'⚡', name:'단타' },
  tip:    { icon:'🎰', name:'찌라시' },
  manip:  { icon:'🕴', name:'작전' },
  spread: { icon:'🐜', name:'분산' }
};
const TAG_BIAS = 0.3;
const CARD_TAGS = {
  stk_inv:['short'], stk_inv2:['short'], stk_delist:['manip'], stk_ailab:['manip'],
  credit:['lev'], yolo:['lev'], short:['short'], avgDown:['hodl'], ipo:['spread'], fullBuy:['spread'], chaseLimit:['scalp'], antArmy:['spread'],
  stopLoss:['scalp'], takeProfit:['scalp'], trailing:['scalp'], cutLoss:['scalp'], takeWin:['scalp'], escape:['scalp'], splitSell:['scalp'], topSpotter:['scalp'],
  hodl:['lev', 'hodl'], diamond:['hodl'], forcedLong:['hodl'], dividend:['spread'], forgotPw:['lev'], hodlWins:['hodl'], compound:['hodl'], valueGod:['hodl'],
  pump:['tip'], dove:['manip'], hawk:['manip', 'short'], ceoTweet:['manip'], coffee:['scalp'], rotation:['spread'], manip:['manip'],
  marginTopup:['lev'], hedge:['short'], interestFree:['lev'], overdraft:['lev'], confess:['manip'], lossGuard:['lev'], circuit:['lev'],
  split:['spread'], levEtf:['lev'], reinvest:['hodl'], timeLoop:['scalp'], allIn:['lev'], futures:['scalp'], coinFlip:['tip'], relist:['lev']
};
const RELIC_TAGS = {
  gukbap:['hodl'], seal:['hodl'], vip:['tip'], hotline:['lev'], capital:['lev'], lawyer:['manip'], inverse:['short'], coldwallet:['lev'],
  theme:['scalp'], community:['tip'], shortpro:['short'], daytrader:['scalp'], fssconnect:['manip'], timemachine:['manip'],
  moonSavings:['scalp'], tearJar:['hodl'], traumaSurvivor:['lev'], tipCollector:['tip'], diamondTree:['hodl'], compoundMonster:['hodl'],
  levTower:['lev'], sectorSet:['spread'], antFlag:['spread'], ccompound:['hodl'], limitUp:['hodl'], phoenix:['lev'],
  copycat:['tip'], rerun:['scalp'], dopamine:['scalp'], fssVip:['manip'], brink:['tip'], infinity:[],
  oath:['hodl'], scalper:['scalp'], water:['hodl'], contrarian:['short'], yoloLoan:['lev'], focus:[], lastTrain:[], cashGang:[], cult:[], tipBro:['tip']   // 규칙 파괴형 (빈 태그 = 새 빌드 축)
};

/* 시작 덱 15장: 종목 8 + 증강 7 */
const STARTER_DECK = [
  'stk_semi', 'stk_semi', 'stk_gukbap', 'stk_coin', 'stk_sc', 'stk_meme', 'stk_inv', 'stk_inv2',
  'credit', 'short', 'stopLoss', 'takeProfit', 'hodl', 'marginTopup', 'indicators'
];

/* ══ 온보딩: 시스템 단계 해금 (docs/design/ONBOARDING.md) ══
   ONBOARDING_ON이면 시스템마다 SYSTEM_UNLOCK_WEEK 주차에 처음 도달할 때 열리고, 한 번 연 시스템은 영구 —
   UI가 지금까지 도달한 최고 주차를 판 시작 때 넘긴다(startNewRun({unlockWeek})). 시뮬레이터는 넘기지 않으니 매 판 처음 하는 플레이어.
   잠긴 시스템: 카드 사용(checkPlay 'locked')·보상·팩·낱장·변환·유물 후보에서 빠지고, 찌라시가 오지 않고, 그 시스템을 겨냥한 보스는 그 주 후보에서 빠진다.
   시작 덱의 잠긴 카드는 빼 두었다가(run.heldCards) 해금되는 주에 덱에 넣는다(emit('systemUnlocked')). 끄면 도입 전과 같은 판 */
const ONBOARDING_ON = true;
const SYSTEM_UNLOCK_WEEK = { signals: 2, tips: 2, news: 2, short: 3, leverage: 3, shopTools: 3, sector: 4, fss: 4 };   // news = 화면만 (뉴스 효과는 늘 있다)
const SYSTEM_CARDS = {   // 시스템별 카드 (기본 id — 강화판 포함). 섹터 리포트(종류 report)는 sector
  signals:  ['indicators', 'analyst'],
  short:    ['short', 'stk_inv', 'stk_inv2', 'hedge'],
  leverage: ['credit', 'yolo', 'forgotPw', 'hodl', 'marginTopup', 'interestFree', 'overdraft', 'lossGuard', 'circuit', 'levEtf', 'relist', 'delever'],
  fss:      ['pump', 'dove', 'hawk', 'ceoTweet', 'manip', 'confess', 'stk_delist', 'stk_ailab']
};
const SYSTEM_RELICS = {   // 시스템별 유물 (결산 보상·암시장 진열 후보)
  tips:     ['community', 'tipCollector', 'tipBro'],
  short:    ['inverse', 'shortpro', 'contrarian'],
  leverage: ['hotline', 'capital', 'coldwallet', 'traumaSurvivor', 'levTower', 'phoenix', 'yoloLoan'],
  fss:      ['vip', 'lawyer', 'fssconnect', 'timemachine', 'fssVip']
};
const SYSTEM_BOSSES = { shortBan: 'short', bigStep: 'leverage', marginHike: 'leverage', fssCrackdown: 'fss', tipBomb: 'tips', levCap: 'leverage' };   // 잠긴 시스템을 겨냥한 보스
const ONBOARDING_STARTER_SUBS = { stk_inv: 'stk_ev', stk_inv2: 'stk_game' };   // 시작 덱에서 잠긴 카드 대신 넣는 카드 (없으면 그냥 뺀다)

/* ══ 보스 주간 (S9, docs/design/BOSS_WEEKS.md) ══
   BOSS_WEEK_ROUNDS 주차는 일반 보스(한 판에 중복 없음), BOSS_FINAL_ROUND 주차는 최종 보스.
   판 시작 때 rollBossPlan이 전부 정해 둔다(run.bossPlan) → 직전 주 결산·보상·암시장에서 nextBossId()로 예고.
   효과는 mods 데이터. 엔진 계산 지점은 bossMod(key, 기본값) 하나로 읽는다 (보스 id로 if문을 흩뿌리지 않는다).
   counter = 정산 카운터(D11): 곱하기 빌드를 겨냥한 보스 — 곱하기 유물이 없으면 거의 무해하다 */
const BOSS_WEEKS_ON           = true;
const BOSS_WEEK_ROUNDS        = [2, 4, 6];   // 일반 보스 주차
const BOSS_FINAL_ROUND        = 8;           // 최종 보스 주차 (= MAX_ROUND)
const BOSS_SLUSH_BONUS        = 300;         // 보스 주를 통과하면 비자금 + (만원)
const BOSS_RELIC_CHOICE_BONUS = 1;           // 보스 주를 통과하면 유물 보상 선택지 +
/* 빌드 카운터 보스 4종 (docs/design/BOSS_WEEKS.md '빌드 카운터') — 특정 빌드를 막아 적응을 강요한다.
   끄면(BOSS_COUNTERS_ON=false) BOSSES에 안 들어가고 일정 보장도 없다 = 도입 전과 같은 판 (난수 소비 그대로) */
const BOSS_COUNTERS_ON        = false;   // 2026-09-30 보류 (BOSS_WEEKS.md '빌드 카운터 — 결정') — 목표 구조가 정해지면 재측정
const BOSS_COUNTER_MIN        = 1;           // 한 판 일반 보스 칸(BOSS_WEEK_ROUNDS) 중 빌드 카운터 최소 개수
const BOSS_POSITION_CAP       = 3;           // 포지션 한도 규제: 포지션 최대 개수 (넘기는 새 포지션 금지)
const BOSS_LEV_CAP            = 2;           // 레버리지 규제: 새 포지션·레버리지 ETF 상한 (x)
/* 조정안 실험용 손잡이 (기본 0·false = 꺼짐, 켜지 않으면 판 결과 그대로): 빌드 카운터 주에 목표 = max(원래 목표, 주 시작 순자산 × 배수) — 목표 상향 조정과 같은 식.
   HELD = true면 표적 유물을 가진 판에만 건다 */
const BOSS_COUNTER_TARGET_MULT = 0;
const BOSS_COUNTER_TARGET_HELD = false;
const BOSSES = [
  { id: 'shortBan',     name: '공매도 전면 금지', icon: '🚫', desc: '이번 주 새 공매도(숏) 금지. 이미 가진 숏은 그대로.', mods: { noShort: true } },
  { id: 'bigStep',      name: '빅스텝',           icon: '🏦', desc: '신용·대차·마통 이자 ×3.', mods: { interestMult: 3 } },
  { id: 'delistReview', name: '상장폐지 심사',    icon: '⛔', desc: '베타가 가장 높은 종목 거래정지 — 가격이 멈추고 사고팔 수 없다.', mods: { haltTopBeta: true } },
  { id: 'marginHike',   name: '증거금 상향',      icon: '📈', desc: '반대매매 기준 담보비율 +20%p (롱 160%·숏 150%).', mods: { maintAdd: 0.2, marginCallAdd: 0.1 } },
  { id: 'fssCrackdown', name: '금감원 특별 단속', icon: '🚨', desc: '금감원 게이지 상승 ×2.', mods: { fssMult: 2 } },
  { id: 'tipBomb',      name: '찌라시 폭탄',      icon: '💣', desc: '찌라시가 3배 자주, 하루 최대 4개.', mods: { tipChanceMult: 3, tipMaxPerDay: 4 } },
  { id: 'tradeTax',     name: '거래세 인상',      icon: '🧾', desc: '모든 매도(반대매매 포함)에 매도 금액의 1% 세금.', mods: { sellTax: 0.01 } },
  { id: 'antShakeout',  name: '개미 털기',        icon: '🧹', desc: '갭 확률 ×2, 시그널 적중률 −15%p.', mods: { gapMult: 2, signalAccAdd: -0.15 } },
  // 정산 카운터 (D11 — 곱하기 빌드 견제)
  { id: 'multCap',      name: '목표 상향 조정',   icon: '🧢', counter: true, desc: '이번 주 목표 = 원래 목표와 주 시작 순자산 ×2 중 큰 값.', mods: { targetEquityMult: 2 } },
  { id: 'addSeal',      name: '더하기 봉인',      icon: '🔒', counter: true, desc: '정산의 더하기(+) 유물 무효 — 곱하기(×) 유물만 발동.', mods: { noAddRelics: true } },
  { id: 'taxAudit',     name: '국세청 세무조사',  icon: '🕵️', counter: true, desc: '주말 결산을 통과하면 목표 초과분의 50% 추징.', mods: { excessTax: 0.5 } },
  // 최종 보스
  { id: 'blackMonday',  name: '블랙 먼데이',      icon: '🖤', final: true, desc: '월요일 개장 직후 전 종목 −12% 폭락(인버스 +12%) + 약세장, 이번 주 갭 ×1.5.', mods: { crashDay: 1, crashPct: 0.12, gapMult: 1.5 } },
  { id: 'bubblePeak',   name: '버블의 정점',      icon: '🫧', final: true, desc: '월~수 강세장이 이어지다 목·금은 약세장 + 갭 ×2.', mods: { bubbleUpDays: 3, bubbleGapMult: 2 } }
];
/* 빌드 카운터 (build: true): targets = 표적 유물(점검·도감), answers = 대비책 유물·카드 (도감·예고에 보여 준다 — 전부 보상·암시장 풀에 있는 것) */
if(BOSS_COUNTERS_ON) BOSSES.splice(BOSSES.findIndex(b => b.final), 0,
  { id: 'posCap',      name: '포지션 한도 규제', icon: '🚧', build: true,
    desc: `포지션 ${BOSS_POSITION_CAP}개까지만 — 넘기는 새 포지션 금지 (종목 매수·주식 분할·재상장·공모주·따라잡기). 가진 포지션과 같은 종목·방향·레버리지 추가 매수는 된다.`,
    mods: { positionCap: BOSS_POSITION_CAP, targetEquityMult: BOSS_COUNTER_TARGET_MULT, targetIfHeld: BOSS_COUNTER_TARGET_HELD }, targets: ['antFlag', 'sectorSet'], answers: { relics: ['levTower', 'cult', 'water'], cards: ['levEtf', 'avgDown', 'allIn'] } },
  { id: 'levCap',      name: '레버리지 규제',    icon: '⚖️', build: true,
    desc: `새로 사는 포지션 레버리지 최대 ${BOSS_LEV_CAP}x (신용·영끌·재상장도 ${BOSS_LEV_CAP}x로), 레버리지 ETF는 ${BOSS_LEV_CAP}x까지. 이미 가진 포지션은 그대로.`,
    mods: { levCap: BOSS_LEV_CAP, targetEquityMult: BOSS_COUNTER_TARGET_MULT, targetIfHeld: BOSS_COUNTER_TARGET_HELD }, targets: ['levTower', 'yoloLoan'], answers: { relics: ['antFlag', 'sectorSet'], cards: ['split', 'timeLoop'] } },
  { id: 'streakReset', name: '기록 리셋',        icon: '🔄', build: true,
    desc: '주 시작과 장 마감마다 모든 포지션의 보유 일수·연속 상승이 0으로 — 존버·연상 기록이 쌓이지 않는다.',
    mods: { streakReset: true, targetEquityMult: BOSS_COUNTER_TARGET_MULT, targetIfHeld: BOSS_COUNTER_TARGET_HELD }, targets: ['limitUp', 'oath', 'seal', 'diamondTree'], answers: { relics: ['moonSavings', 'phoenix', 'ccompound'], cards: ['timeLoop', 'futures'] } },
  { id: 'seize',       name: '유물 압류',        icon: '🏷️', build: true,
    desc: '빨간 딱지: 정산에서 1번 칸 유물 효과 무효 (1번 칸을 복사·반복하는 효과도). 칸은 그대로, 순서 바꾸기·판매는 된다.',
    mods: { slot1Seized: true, targetEquityMult: BOSS_COUNTER_TARGET_MULT, targetIfHeld: BOSS_COUNTER_TARGET_HELD }, targets: ['rerun', 'focus'], answers: { relics: ['capital', 'hotline'], cards: [] } }
);

/* 지수(메인 캔들 차트) — 시장 전체 분위기 */
let marketPrice = 1000;
let marketState = 'NORMAL';


/* ══════════════════════════════════════════════════════════
   MAIN GAME CANDLESTICK CHART (원본 보존)
══════════════════════════════════════════════════════════ */
const MAX_CANDLES = 22;
let candleData = [];
/* (S7-15) 하루 차트: 오늘 장 캔들만(개장 때 비움) · 전일 종가 · 일봉 기록 — 표시용 (난수·판정에 쓰지 않는다) */
let idxDay = { prevClose: 0, candles: [], daily: [] };

function initChartData(){
  candleData = [];
  let base = marketPrice;
  for(let i=0;i<MAX_CANDLES;i++){
    const c = generateNextCandle(base);
    candleData.push(c);
    base = c.close;
  }
  marketPrice = base;
}

function generateNextCandle(openPrice, extraDrift = 0){
  const st = INDEX_STATE[marketState] || INDEX_STATE.NORMAL;
  const drift = extraDrift + st.drift, volMult = st.vol;

  const change = drift + (rand()-INDEX_TICK_CENTER)*INDEX_TICK_RANGE*volMult;
  const closePrice = Math.max(100, Math.round(openPrice+change));
  const highExtra = rand()*20*volMult;
  const lowExtra  = rand()*20*volMult;
  const high = Math.round(Math.max(openPrice,closePrice)+highExtra);
  const low  = Math.round(Math.min(openPrice,closePrice)-lowExtra);
  return {open:Math.round(openPrice), high:Math.max(10,high), low:Math.max(10,low), close:Math.round(closePrice)};
}

function pushNewCandle(extraDrift = 0){
  const lastClose = candleData.length>0 ? candleData[candleData.length-1].close : marketPrice;
  const newCandle = generateNextCandle(lastClose, extraDrift);
  marketPrice = newCandle.close;
  candleData.push(newCandle);
  idxDay.candles.push(newCandle);
  if(candleData.length > MAX_CANDLES) candleData.shift();
  return Math.log(newCandle.close / lastClose); // 지수 로그수익률 → 개별 종목에 전달
}


/* ══════════════════════════════════════════════════════════
   ENGINE — 게임 규칙 (DOM 접근 없음 → 나중에 C#으로 그대로 번역 가능)
   UI에는 emit()으로 이벤트만 알린다.
══════════════════════════════════════════════════════════ */
const MARKET_EVENTS = [
  { text:'FED, 기준 금리 전격 인하! 폭등장 시작!', state:'BULL' },
  { text:'대형 거래소 해킹 의혹 조사 중... 투매주의!', state:'BEAR' },
  { text:'기관 투자자 대규모 매수세 유입!', state:'BULL' },
  { text:'CEO 밈 트윗으로 변동성 폭발 중!', state:'VOLATILE' },
  { text:'글로벌 공급망 차질 우려, 시장 혼조세', state:'VOLATILE' }
];

let run = null;     // 한 판의 모든 상태
let assets = {};    // 종목별 가격 상태 { price, dayOpen, history[] }

/* 이벤트: 엔진은 화면을 모른다. emit()은 이번 판 이벤트 로그(eventLog, startNewRun에서 비움)에 쌓고,
   리스너가 있으면(브라우저 UI = onGameEvent) 알린다. 시뮬레이터는 리스너 없이 로그만 쓴다 (리플레이·디버깅). */
const eventLog = [];
let eventListener = null;
function setEventListener(fn){ eventListener = fn; }
function emit(type, data){
  data = data || {};
  eventLog.push({ type: type, data: data });
  if(eventListener) eventListener(type, data);
}

/* 난수 — 엔진의 모든 무작위는 rand()를 거친다.
   기본은 Math.random 그대로. setSeed(n)을 부르면 시드 난수(mulberry32)로 바뀌어 같은 시드 = 같은 판 (시뮬레이터·버그 재현용).
   setSeed(null)이면 다시 Math.random.  C#: System.Random(seed)로 대응. */
let rngSeeded = false, rngState = 0;
function setSeed(seed){
  rngSeeded = seed !== null && seed !== undefined;
  rngState = rngSeeded ? (seed >>> 0) : 0;
}
function rand(){
  if(!rngSeeded) return Math.random();
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function gauss(){ // 표준정규분포 난수 (Box-Muller)
  let u = 0, v = 0;
  while(u === 0) u = rand();
  while(v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function randInt(n){ return Math.floor(rand() * n); }
function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = randInt(i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ── 종목 가격 ── */
function initAssets(){
  assets = {};
  STOCKS.forEach(s => {
    assets[s.id] = { price: s.basePrice, dayOpen: s.basePrice, lastDayChg: 0, history: Array(ASSET_HISTORY).fill(s.basePrice), candles: [],
                     dayCandles: [], daily: [], limitHit: 0, accumBonus: 0,   // accumBonus = 세력 매집 포착 → 내일 UP 전이 보너스   // (S7) 오늘 캔들 · 일봉 · 오늘 상·하한가(+1/−1/0)
                     regime: '', regimeDays: 0 };   // 숨은 추세 (인버스는 '' = 지수를 따른다). initRegimes에서 정한다
  });
  // 시작 시 차트가 비어 보이지 않도록 과거 시세를 미리 만들어 둔다
  for(let i = 0; i < ASSET_HISTORY; i++) updateAssetPrices(gauss() * 0.01, {});
  STOCKS.forEach(s => { const a = assets[s.id]; a.dayOpen = a.price; a.dayCandles = a.candles.slice(-TICKS_PER_DAY); });
}
/* 판 시작: 지수 하루 차트도 과거 캔들 마지막 하루치로 채워 둔다 (첫 장전에 빈 차트가 안 보이게) */
function initDayCharts(){
  idxDay = { prevClose: candleData.length ? candleData[0].open : marketPrice, candles: candleData.slice(-TICKS_PER_DAY), daily: [] };
  STOCKS.forEach(s => { const a = assets[s.id]; a.prevClose = a.dayCandles.length ? a.dayCandles[0].open : a.price; });
}
/* 개장: 오늘 캔들을 비우고 전일 종가를 기억한다 */
function openDayCharts(){
  idxDay.prevClose = marketPrice; idxDay.candles = [];
  STOCKS.forEach(s => { const a = assets[s.id]; a.prevClose = a.price; a.dayCandles = []; a.limitHit = 0; });
}
/* 장 마감: 오늘 하루를 일봉 하나로 */
function closeDayCharts(){
  const toDaily = (open, cs, close) => ({ open, close, high: Math.max(open, close, ...cs.map(c => c.high)), low: Math.min(open, close, ...cs.map(c => c.low)), gap: 0 });
  idxDay.daily.push(toDaily(idxDay.prevClose, idxDay.candles, marketPrice));
  if(idxDay.daily.length > DAILY_KEEP) idxDay.daily.shift();
  STOCKS.forEach(s => { const a = assets[s.id]; a.daily.push(toDaily(a.prevClose, a.dayCandles, a.price)); if(a.daily.length > DAILY_KEEP) a.daily.shift(); });
}
/* (S7-19) 상·하한가: limit 종목은 전일 종가(dayOpen) ±PRICE_LIMIT를 넘지 못한다. 처음 닿으면 emit('priceLimit') */
function applyPriceLimits(){
  STOCKS.forEach(s => {
    if(!s.limit) return;
    const a = assets[s.id], hi = a.dayOpen * (1 + PRICE_LIMIT), lo = a.dayOpen * (1 - PRICE_LIMIT);
    const dir = a.price >= hi ? 1 : a.price <= lo ? -1 : 0;
    if(!dir){ a.limitHit = 0; return; }   // 제한폭 안으로 돌아오면 표시도 끈다
    a.price = dir > 0 ? hi : lo;
    const c = a.candles[a.candles.length - 1];
    if(c){ c.close = a.price; c.high = Math.min(c.high, hi); c.low = Math.max(c.low, lo); }
    a.history[a.history.length - 1] = a.price;
    if(a.limitHit !== dir){ a.limitHit = dir; emit('priceLimit', { stockId: s.id, dir }); }
  });
}

/* 종목 수익률 = 지수 수익률 × beta × 전달비율 + 고유 변동 × 뉴스 변동 배수 + 작전 드리프트(찌라시) + 추세·뉴스 드리프트
   live = 장중 틱 (판 시작 전 과거 시세를 만들 때는 추세·뉴스를 쓰지 않는다)
   틱 하나 = 종목 캔들 하나 (시가 = 직전가, 종가 = 새 가격, 꼬리는 고유 변동 크기에 비례) */
function updateAssetPrices(idxLogRet, pumps, live){
  STOCKS.forEach(s => {
    const a = assets[s.id];
    const move = STOCK_MOVE_MULT[marketState] || 1;
    const nf = live ? newsEffectFor(s.id) : NEWS_NEUTRAL;
    let r = STOCK_DRIFT + move * (s.beta * idxLogRet * IDX_SENS + s.volatility * IDIO_SCALE * nf.volMult * gauss());
    if(s.beta < 0) r -= INVERSE_DECAY;
    if(live && a.regime) r += REGIME_DRIFT[a.regime];
    r += nf.drift;
    if(pumps[s.id]) r += pumps[s.id] === PUMP_MANIP ? MANIP_DRIFT : pumps[s.id] > 0 ? PUMP_UP_DRIFT : PUMP_DOWN_DRIFT;
    const open = a.price;
    const halted = live && bossHalt(s.id);   // 상장폐지 심사: 거래정지 종목은 가격이 멈춘다 (난수는 똑같이 소비)
    a.price *= halted ? 1 : Math.exp(r);
    const wick = halted ? 0 : move * s.volatility * IDIO_SCALE * nf.volMult * CANDLE_WICK_SCALE;
    const cd = {
      open, close: a.price,
      high: Math.max(open, a.price) * (1 + Math.abs(gauss()) * wick),
      low:  Math.min(open, a.price) * (1 - Math.abs(gauss()) * wick),
      gap: 0
    };
    a.candles.push(cd);
    if(live) a.dayCandles.push(cd);
    if(a.candles.length > MAX_CANDLES) a.candles.shift();
    a.history.push(a.price);
    if(a.history.length > ASSET_HISTORY) a.history.shift();
  });
}

/* ── 포지션: 롱·숏 공용 공식 (dir = +1 롱 / −1 숏) ──
   노출액 = 보유수량 × 현재가
   포지션순자산 = 원금 + dir × (노출액 − 진입노출액)
   증거금률 = 포지션순자산 ÷ 노출액                                       */
const exposure     = p => p.shares * assets[p.assetId].price;
/* ── 유물 ── */
const RELIC_BY_ID = {};
RELICS.forEach(r => { RELIC_BY_ID[r.id] = r; r.tags = RELIC_TAGS[r.id] || []; });
const hasRelic = id => !!run && run.relics.indexOf(id) >= 0;

/* 유물 칸 (RELIC_SLOTS): run.relics 순서 = 칸 순서 = 장 마감 정산 발동 순서 (왼쪽부터).
   가득 차면 gainRelic은 실패한다 — 새 유물은 replaceId(교체할 보유 유물)를 주고 얻는다. paid = 판매가 기준값 (구매가) */
const relicSlotsFull = () => run.relics.length >= RELIC_SLOTS;

/* ── 보스 주간 (S9) ── */
const BOSS_BY_ID = {};
BOSSES.forEach(b => { BOSS_BY_ID[b.id] = b; });
/* 이번 주 보스의 수정자 (보스가 없거나 그 키가 없으면 기본값) — 보스 효과는 전부 이것으로 읽는다 */
function bossMod(key, def){
  const b = run && run.boss ? BOSS_BY_ID[run.boss] : null;
  return b && b.mods[key] !== undefined ? b.mods[key] : def;
}
const nextBossId = () => (run && run.bossPlan[run.round + 1]) || '';   // 다음 주 보스 (예고용)
/* 판 시작 때 보스 일정: 일반 보스 주차마다 남은 풀에서 하나씩 (중복 없음) + 최종 보스 하나 */
function rollBossPlan(){
  const plan = {};
  if(!BOSS_WEEKS_ON) return plan;
  const pool = BOSSES.filter(b => !b.final).map(b => b.id), finals = BOSSES.filter(b => b.final).map(b => b.id);
  BOSS_WEEK_ROUNDS.forEach(r => {   // (온보딩) 그 주에 아직 잠긴 시스템을 겨냥한 보스는 빼고 뽑는다 — 플래그를 끄면 전과 같은 추첨
    const ok = pool.filter(id => !SYSTEM_BOSSES[id] || sysOpenAt(SYSTEM_BOSSES[id], r));
    const id = ok[randInt(ok.length)];
    pool.splice(pool.indexOf(id), 1);
    plan[r] = id;
  });
  if(BOSS_COUNTERS_ON) ensureBossCounters(plan);   // 플래그 끔이면 난수를 더 쓰지 않는다
  plan[BOSS_FINAL_ROUND] = finals[randInt(finals.length)];
  return plan;
}
/* 빌드 카운터가 BOSS_COUNTER_MIN개보다 적으면: 카운터가 아닌 칸 하나를 골라 아직 안 쓴 카운터로 바꾼다 (그 주에 잠긴 시스템 겨냥 보스는 제외) */
function ensureBossCounters(plan){
  const isCounter = id => !!BOSS_BY_ID[id] && !!BOSS_BY_ID[id].build;
  let have = BOSS_WEEK_ROUNDS.filter(r => isCounter(plan[r])).length;
  while(have < BOSS_COUNTER_MIN){
    const slots = BOSS_WEEK_ROUNDS.filter(r => !isCounter(plan[r]));
    if(!slots.length) return;
    const r = slots[randInt(slots.length)], used = BOSS_WEEK_ROUNDS.map(x => plan[x]);
    const ok = BOSSES.filter(b => b.build && used.indexOf(b.id) < 0 && (!SYSTEM_BOSSES[b.id] || sysOpenAt(SYSTEM_BOSSES[b.id], r))).map(b => b.id);
    if(!ok.length) return;
    plan[r] = ok[randInt(ok.length)];
    have++;
  }
}
/* 온보딩 해금 판정 (순수). round = 그 주차에 열려 있나 — 판 시작 기준 주차(run.unlockBase, 지금까지 도달한 최고)와 큰 쪽 */
function sysOpenAt(sys, round){
  if(!ONBOARDING_ON || !sys || !SYSTEM_UNLOCK_WEEK[sys]) return true;
  return SYSTEM_UNLOCK_WEEK[sys] <= Math.max(round, run ? run.unlockBase : 1);
}
const offerRound = () => run.round + (run.phase === 'reward' || run.phase === 'shop' ? 1 : 0);   // 보상·암시장은 다음 주에 쓸 것
const sysOpen = sys => !run || sysOpenAt(sys, offerRound());
function cardSystem(id){
  const c = CARD_BY_ID[id];
  if(!c) return '';
  if(c.type === 'report') return 'sector';
  for(const sys in SYSTEM_CARDS) if(SYSTEM_CARDS[sys].indexOf(c.base) >= 0) return sys;
  return '';
}
function relicSystem(id){
  for(const sys in SYSTEM_RELICS) if(SYSTEM_RELICS[sys].indexOf(id) >= 0) return sys;
  return '';
}
const cardOpen  = id => sysOpen(cardSystem(id));
const relicOpen = id => sysOpen(relicSystem(id));
const packOpen  = pk => pk.id !== RESEARCH_PACK.id || sysOpen('sector');
/* 새 주: 이번 주에 처음 열린 시스템 → 빼 둔 시작 카드를 덱에 넣고 알린다 */
function unlockSystemsForRound(){
  if(!ONBOARDING_ON || run.round <= run.unlockBase) return;
  const systems = Object.keys(SYSTEM_UNLOCK_WEEK).filter(sys => SYSTEM_UNLOCK_WEEK[sys] === run.round);
  if(!systems.length) return;
  const open = id => sysOpenAt(cardSystem(id), run.round);   // 이번 주 기준 (startNextRound는 아직 암시장 단계라 sysOpen을 쓰지 않는다)
  const cards = run.heldCards.filter(open);
  run.heldCards = run.heldCards.filter(id => !open(id));
  cards.forEach(id => run.masterDeck.push(id));
  emit('systemUnlocked', {round: run.round, systems, cards});
}
/* 상장폐지 심사: 베타가 가장 높은 종목 (같으면 앞 종목) */
const topBetaStockId = () => STOCKS.reduce((best, s) => (s.beta > best.beta ? s : best), STOCKS[0]).id;
const bossHalt = id => !!run && !!run.haltStock && run.haltStock === id;
/* 이번 틱 갭 배수: 개미 털기·블랙 먼데이 gapMult, 버블의 정점은 약세 구간(bubbleUpDays 뒤)만 */
function bossGapMult(){
  const up = bossMod('bubbleUpDays', 0);
  return bossMod('gapMult', 1) * (up && run.day > up ? bossMod('bubbleGapMult', 1) : 1);
}
/* 기록 리셋 (보스): 모든 포지션의 보유 일수·연속 상승 → 0 */
function resetStreaks(){
  if(!bossMod('streakReset', false)) return;
  run.positions.forEach(p => { p.daysHeld = 0; p.upStreak = 0; });
}
/* 레버리지 규제 (보스): 새 포지션 레버리지 상한 */
const capLev = lev => { const cap = bossMod('levCap', 0); return cap && lev > cap ? cap : lev; };
/* 포지션 한도 규제 (보스): 이 매수(종목·레버리지·방향)가 새 포지션을 n개 만들어 한도를 넘기나 — 같은 포지션에 합쳐지면 괜찮다 */
function overPositionCap(stockId, lev, dir, n){
  const cap = bossMod('positionCap', 0);
  if(!cap) return false;
  if(stockId && findSamePosition(stockId, capLev(lev), dir)) return false;
  return run.positions.length + (n || 1) > cap;
}
/* 이번 주 보스 시작: 거래정지 종목 정하기 → emit('bossStart') */
function startBossWeek(){
  run.boss = run.bossPlan[run.round] || '';
  run.haltStock = bossMod('haltTopBeta', false) ? topBetaStockId() : '';
  resetStreaks();   // 기록 리셋 (보스): 들고 들어온 포지션도 0부터
  if(run.boss) emit('bossStart', {id: run.boss, round: run.round, haltStock: run.haltStock});
}
function gainRelic(id, source, paid, replaceId){
  if(!RELIC_BY_ID[id] || hasRelic(id)) return false;
  let at = run.relics.length;
  if(relicSlotsFull()){
    if(!replaceId || !hasRelic(replaceId)) return false;
    at = run.relics.indexOf(replaceId);   // 교체한 칸에 그대로 들어간다
    loseRelic(replaceId);
    emit('relicReplaced', {id: replaceId, by: id});
  }
  run.relics.splice(at, 0, id);
  run.relicState[id] = { stacks: 0, best: 0, paid: paid !== undefined ? paid : relicPrice(id) };
  emit('relicGained', {id, source});
  return true;
}
function loseRelic(id){ run.relics = run.relics.filter(x => x !== id); }
/* 칸 순서 바꾸기 (장전·암시장에서만, 장중 불가). from → to 자리로 옮긴다 */
const canArrangeRelics = () => !!run && (run.phase === 'premarket' || run.phase === 'shop');
function moveRelic(from, to){
  if(!canArrangeRelics()) return false;
  const n = run.relics.length;
  if(from < 0 || from >= n || to < 0 || to >= n || from === to) return false;
  const id = run.relics.splice(from, 1)[0];
  run.relics.splice(to, 0, id);
  emit('relicMoved', {id, from, to});
  return true;
}
/* 판매가 = 얻을 때 값 × RELIC_SELL_RATE (10만 단위). 부모님 카드처럼 쓰고 사라진 유물은 팔 수 없다 */
const relicSellPrice = id => Math.round(((run.relicState[id] && run.relicState[id].paid) || 0) * RELIC_SELL_RATE / SHOP_PRICE_ROUND) * SHOP_PRICE_ROUND;

/* ── 성장형 유물: 스택 (적립형 tearJar는 만원 단위 적립금) ── */
const relicStacks = id => hasRelic(id) && run.relicState[id] ? run.relicState[id].stacks : 0;
function growRelic(id, n){
  if(!hasRelic(id) || !(n > 0)) return;
  const st = run.relicState[id];
  st.stacks += n;
  st.best = Math.max(st.best, st.stacks);
  emit('relicGrew', {id, stacks: st.stacks, delta: n});
}
/* keep = 남기는 비율 (0 = 전부 초기화). 잃은 양이 있을 때만 알린다 */
function resetRelic(id, reason, keep){
  if(!hasRelic(id)) return;
  const st = run.relicState[id], before = st.stacks;
  st.stacks = RELIC_BY_ID[id].growth === 'count' ? Math.floor(before * (keep || 0)) : before * (keep || 0);
  if(before - st.stacks > 0) emit('relicReset', {id, lost: before - st.stacks, stacks: st.stacks, reason});
}
function shrinkRelic(id, n, reason){   // 복리 괴물: −1
  if(!hasRelic(id) || relicStacks(id) <= 0) return;
  const st = run.relicState[id], lost = Math.min(n, st.stacks);
  st.stacks -= lost;
  emit('relicReset', {id, lost, stacks: st.stacks, reason});
}
/* 존버 나무: 3일 이상 보유 포지션을 직접 팔면 (한 번의 매도 행동에 한 번) 스택 절반 */
function noteManualSell(ps){
  if(ps.some(p => p.daysHeld >= DTREE_DAYS)) resetRelic('diamondTree', 'sell', DTREE_SELL_KEEP);
}
/* 성장형 정산 곱 배수 (장 마감 정산 SETTLE_EFFECTS의 'xmult', 1 = 효과 없음) */
const moonX   = () => Math.pow(MOON_XMULT_PER_STACK, relicStacks('moonSavings'));
const traumaX = p => (p.lev > 1 || p.dir < 0) ? Math.pow(TRAUMA_XMULT_PER_STACK, relicStacks('traumaSurvivor')) : 1;

/* ── 콤보 (엔진): 매 틱 끝, 직전 틱에도 있던 포지션들의 평가손익 합이 오르면 up+1·down=0, 내리면 반대. 없거나 0이면 유지 ── */
function updateCombo(){
  let delta = 0, any = false;
  const now = {};
  run.positions.forEach(p => {
    const v = posPnl(p);
    now[p.id] = v;
    if(run.comboPnl[p.id] !== undefined){ delta += v - run.comboPnl[p.id]; any = true; }
  });
  run.comboPnl = now;
  if(!any || delta === 0) return;
  if(delta > 0){ run.combo.up++; run.combo.down = 0; } else { run.combo.down++; run.combo.up = 0; }
  emit('comboChanged', {up: run.combo.up, down: run.combo.down});
  if(run.combo.up > 0 && run.combo.up % MOON_COMBO_STEP === 0) growRelic('moonSavings', 1);
  if(run.combo.down === MOON_RESET_DOWN) resetRelic('moonSavings', 'downCombo', 0);
  if(run.combo.up === TEARJAR_PAYOUT_COMBO && relicStacks('tearJar') >= 1){   // 저금통 지급
    const pay = relicStacks('tearJar');
    run.cash += pay;
    run.relicState.tearJar.stacks = 0;
    emit('relicTriggered', {id: 'tearJar', amount: pay, big: true});
  }
}

/* 아직 없는 유물 n개 (희귀도 가중치, 중복 없음) */
function rollRelics(n, exclude = [], weights = RELIC_RARITY_WEIGHTS){   // 등급을 먼저 뽑고(weights), 그 등급 안에서 균등. 없는 유물만 (exclude: 더 뺄 유물 — 새로고침 때 지금 진열)
  const picks = [];
  while(picks.length < n){
    const cands = RELICS.filter(r => !hasRelic(r.id) && picks.indexOf(r.id) < 0 && exclude.indexOf(r.id) < 0 && relicOpen(r.id) && RULE_BREAKER_POOL_EXCLUDE.indexOf(r.id) < 0);
    const rarity = rollRarity(weights, cands);
    if(!rarity) break;
    picks.push(pickTagged(cands.filter(r => r.rarity === rarity)).id);
  }
  return picks;
}

/* 암시장 유물 한 칸의 등급별 확률 (순수 함수, UI 표시용 — rollRarity와 같은 계산). 보유한 유물을 뺀 뒤 남은 등급만으로 다시 나눈다 */
function relicShopOdds(exclude = []){
  const cands = RELICS.filter(r => !hasRelic(r.id) && exclude.indexOf(r.id) < 0);
  const tiers = RARITIES.filter(r => RELIC_SHOP_RARITY_WEIGHTS[r] > 0 && cands.some(c => c.rarity === r));
  const total = tiers.reduce((sum, r) => sum + RELIC_SHOP_RARITY_WEIGHTS[r], 0);
  return tiers.map(r => ({ rarity: r, chance: RELIC_SHOP_RARITY_WEIGHTS[r] / total, count: cands.filter(c => c.rarity === r).length }));
}

const pumpUpChance = () => hasRelic('vip') ? RELIC_VIP_PUMP_CHANCE : PUMP_UP_CHANCE;
const maxAp        = () => AP_PER_DAY + (hasRelic('talisman') ? RELIC_TALISMAN_AP : 0);
const capitalCut      = () => hasRelic('capital') ? 1 - RELIC_CAPITAL_INTEREST_CUT : 1;   // 캐피탈 VVIP: 신용·대차·마통 모두 할인
const interestRate    = () => DAILY_INTEREST * capitalCut();
const shortBorrowRate = () => SHORT_BORROW_RATE * capitalCut();
/* 오늘 밤 낼 이자: 신용대출·마통 × 신용이자율 + 빌린 주식 × 대차 이자율 (공매도 전문가는 대차 이자 면제) */
function dailyInterest(){
  if(run.interestFree) return 0;
  const credit = run.positions.filter(p => p.dir > 0).reduce((s, p) => s + posBorrowed(p), 0) + run.overdraft;
  const shorts = hasRelic('shortpro') || run.shortFeeFreeToday ? 0 : run.positions.filter(p => p.dir < 0).reduce((s, p) => s + posBorrowed(p), 0);
  return (credit * interestRate() + shorts * shortBorrowRate()) * (1 - dtreeCut()) * bossMod('interestMult', 1);   // 빅스텝
}
const dtreeCut = () => Math.min(DTREE_MAX_CUT, relicStacks('diamondTree') * DTREE_CUT_PER_STACK);   // 존버 나무
const gukbapApplies = p => hasRelic('gukbap') && RELIC_GUKBAP_SECTORS.indexOf(STOCK_BY_ID[p.assetId].sector) >= 0;
const sealApplies   = p => hasRelic('seal') && p.daysHeld >= RELIC_SEAL_DAYS;

/* 가격만으로 계산한 손익. 유물 보정은 평가손익에 섞지 않고 장 마감 정산(settleDay)에서 현금으로 준다 */
const rawPnl = p => p.dir * (exposure(p) - p.entryExposure);
const posEquity    = p => p.principal + rawPnl(p);

/* ══ 장 마감 정산 (docs/design/SETTLEMENT.md) ══
   포지션마다 base = 직전 정산(또는 매수) 이후의 가격 손익 = dir × (노출액 − 기준 노출액 refExp).
   step kind: 'base' | 'add'(칩 +) | 'mult'(합산 배수 +) | 'xmult'(곱 배수 ×)
     chips = base + Σadd,  mult = 1에서 시작해 칸 순서대로 +mult · ×xmult,  정산금 = chips × mult − base (이미 평가손익에 든 base는 빼고 보너스분만 현금)
   수익(base > 0)엔 onLoss가 아닌 효과만, 손실(base < 0)엔 손실을 줄이는 onLoss 효과만 (예: 국밥 정신 ×0.5 → 절반 환급).
   유물은 run.relics 순서(= 칸 순서, 왼쪽부터)대로 발동한다. 새 정산 유물은 여기에 한 줄 추가 (kind = 화면 표시·자동 정렬용 대표 종류). */
const SETTLE_EFFECTS = {
  gukbap:         { kind: 'xmult', onLoss: true,  apply: p => gukbapApplies(p) ? { kind: 'xmult', value: 1 - RELIC_GUKBAP_LOSS_CUT } : null },
  seal:           { kind: 'xmult', onLoss: false, apply: p => sealApplies(p) ? { kind: 'xmult', value: 1 + RELIC_SEAL_BONUS } : null },
  theme:          { kind: 'xmult', onLoss: false, apply: p => RELIC_THEME_SECTORS.indexOf(STOCK_BY_ID[p.assetId].sector) >= 0 ? { kind: 'xmult', value: 1 + RELIC_THEME_BONUS } : null },
  moonSavings:    { kind: 'xmult', onLoss: false, apply: p => moonX() > 1 ? { kind: 'xmult', value: moonX(), label: `${relicStepLabel('moonSavings')} ${relicStacks('moonSavings')}스택` } : null },
  traumaSurvivor: { kind: 'xmult', onLoss: false, apply: p => traumaX(p) > 1 ? { kind: 'xmult', value: traumaX(p), label: `${relicStepLabel('traumaSurvivor')} ${relicStacks('traumaSurvivor')}스택` } : null },
  // S4 곱하기
  levTower:  { kind: 'xmult', onLoss: false, apply: p => { const v = levProduct(); return v > 1 && !run.liqToday ? { kind: 'xmult', value: v } : null; } },
  sectorSet: { kind: 'xmult', onLoss: false, apply: p => { const n = heldSectorCount(); return n > 1 ? { kind: 'xmult', value: n, label: `${relicStepLabel('sectorSet')} ${n}섹터` } : null; } },
  antFlag:   { kind: 'xmult', onLoss: false, apply: p => { const n = run.positions.length; return n > 0 ? { kind: 'xmult', value: Math.pow(ANTFLAG_PER_POS, n), label: `${relicStepLabel('antFlag')} ${n}개` } : null; } },
  ccompound: { kind: 'xmult', onLoss: false, apply: p => ({ kind: 'xmult', value: ccX() }) },
  limitUp:   { kind: 'xmult', onLoss: false, apply: (p, base) => { const n = limitUpStreak(p, base); return n > 0 ? { kind: 'xmult', value: Math.pow(LIMITUP_BASE, n), label: `${relicStepLabel('limitUp')} ${n}연상` } : null; } },
  phoenix:   { kind: 'xmult', onLoss: false, apply: p => relicStacks('phoenix') > 0 ? { kind: 'xmult', value: Math.pow(PHOENIX_PER_STACK, relicStacks('phoenix')), label: `${relicStepLabel('phoenix')} ${relicStacks('phoenix')}스택` } : null },
  dopamine:  { kind: 'mult',  onLoss: false, apply: p => { const c = run.combo.up; return c <= 0 ? null : c >= DOPAMINE_X_COMBO ? { kind: 'xmult', value: c, label: `${relicStepLabel('dopamine')} 콤보 ${c}` } : { kind: 'mult', value: c * DOPAMINE_PER_COMBO, label: `${relicStepLabel('dopamine')} 콤보 ${c}` }; } },
  fssVip:    { kind: 'xmult', onLoss: false, apply: p => run.week.sanctioned ? { kind: 'xmult', value: FSS_VIP_MULT } : null },
  brink:     { kind: 'xmult', onLoss: false, apply: p => netEquity() < baseTarget() * BRINK_RATIO ? { kind: 'xmult', value: BRINK_MULT } : null },
  copycat:   { kind: 'copy',  onLoss: false, apply: () => null },   // 효과는 settleSteps가 복사 대상으로 대신 (copySource)
  rerun:     { kind: 'copy',  onLoss: false, apply: () => null },
  infinity:  { kind: 'xmult', onLoss: false, apply: () => null },   // 정산 맨 마지막에 settleSteps가 따로
  // 규칙 파괴형 (몰아주기·막차 탑승은 settleSteps가 칸 위치로 따로 처리)
  oath:       { kind: 'xmult', onLoss: false, apply: p => { const n = Math.min(OATH_MAX_DAYS, p.daysHeld); return n > 0 ? { kind: 'xmult', value: Math.pow(OATH_X_PER_DAY, n), label: `${relicStepLabel('oath')} ${n}일` } : null; } },
  water:      { kind: 'xmult', onLoss: false, apply: p => p.water > 0 ? { kind: 'xmult', value: Math.pow(WATER_X_PER_STACK, p.water), label: `${relicStepLabel('water')} 물 ${p.water}` } : null },
  contrarian: { kind: 'xmult', onLoss: false, apply: p => p.dir < 0 && run.positions.some(q => q.dir > 0 && q.assetId === p.assetId) ? { kind: 'xmult', value: CONTRARIAN_SHORT_MULT } : null },
  yoloLoan:   { kind: 'mult',  onLoss: false, apply: () => { const v = loanDebt() / (baseTarget() * YOLO_LOAN_MULT_UNIT); return v > 0 ? { kind: 'mult', value: v, label: `${relicStepLabel('yoloLoan')} 빚 +${v.toFixed(2)}` } : null; } },
  focus:      { kind: 'copy',  onLoss: false, apply: () => null },
  lastTrain:  { kind: 'last',  onLoss: false, apply: () => null },
  cashGang:   { kind: 'xmult', onLoss: false, apply: () => { const n = RELIC_SLOTS - run.relics.length; return n > 0 ? { kind: 'xmult', value: Math.pow(CASHGANG_PER_EMPTY, n), label: `${relicStepLabel('cashGang')} 빈 칸 ${n}` } : null; } },
  cult:       { kind: 'xmult', onLoss: false, apply: () => run.week.cultAdds > 0 ? { kind: 'xmult', value: 1 + run.week.cultAdds, label: `${relicStepLabel('cult')} 추가 매수 ${run.week.cultAdds}` } : null }
};
/* 🏦 영끌 대출: 매수에 쓸 수 있는 돈 = 현금 + 마이너스 한도 (없으면 현금 그대로) */
const loanRoom = () => hasRelic('yoloLoan') ? baseTarget() * YOLO_LOAN_LIMIT : 0;
const buyCash  = () => run.cash + loanRoom();
const loanDebt = () => hasRelic('yoloLoan') ? Math.max(0, -run.cash) : 0;
/* S4 정산 보조 (순수) */
const levProduct    = () => run.positions.reduce((m, p) => m * p.lev, 1);
const ccX           = () => CC_START + CC_STEP * relicStacks('ccompound');
const limitUpStreak = (p, base) => base > 0 ? Math.min(LIMITUP_MAX_STREAK, (p.upStreak || 0) + 1) : 0;   // 오늘 포함 연속 상승 마감 수
/* 따라쟁이(오른쪽 칸)·재방송(1번 칸): 효과를 빌려 올 유물. 복사 유물끼리는 복사하지 않는다 ('' = 없음) */
function copySource(id, i){
  const t = id === 'copycat' ? run.relics[i + 1] : id === 'rerun' ? run.relics[0] : id;
  if(!t || (t !== id && SETTLE_EFFECTS[t] && SETTLE_EFFECTS[t].kind === 'copy') || t === 'infinity') return '';
  return t;
}
/* 판정 난수가 필요 없는 정산 단계 라벨 (유물이 아닌 source) */
const SETTLE_SOURCE_LABEL = { sector: '📊 섹터 레벨', hold: '🪙 보유 칩', card: '🃏 카드', futures: '📅 선물 만기일', crit: '💥 크리티컬', timeLoop: '⏪ 타임 루프' };
const stepLabel = src => RELIC_BY_ID[src] ? relicStepLabel(src) : (SETTLE_SOURCE_LABEL[src] || src);
const relicStepLabel = id => RELIC_BY_ID[id].icon + ' ' + RELIC_BY_ID[id].name;
const fmtMultEngine  = v => v >= 100 ? String(Math.round(v)) : v.toFixed(2);   // 정산 단계 라벨용 배수 표기

/* 순수 계산 (rand·상태 변경 없음): 포지션 p가 오늘 base만큼 벌었을 때의 정산 단계. 미리보기(previewSettlement)와 공용.
   배수는 칸 순서대로 차례로: mult = 지금 배수 + 값, xmult = 지금 배수 × 값 → 더하기를 앞 칸, 곱하기를 뒤 칸에 둘수록 커진다 */
function settleSteps(p, base, crit, opts){
  let chips = base, m = 1;
  const steps = [{ label: '오늘 손익', kind: 'base', value: base, runningChips: chips, runningMult: 1, source: 'base' }];
  const push = (e, source, label) => {
    if(e.kind === 'add') chips += e.value;
    else if(e.kind === 'mult') m += e.value;
    else m *= e.value;
    steps.push({ label, kind: e.kind, value: e.value, runningChips: chips, runningMult: m, source });
  };
  if(opts && opts.noBonus) return { steps, chips, mult: m, total: chips * m };   // ⚡ 단타 중독: 장 마감 보유 포지션은 보너스 없음
  if(opts && opts.scalpMult) push({ kind: 'mult', value: opts.scalpMult }, 'scalper', `${relicStepLabel('scalper')} ${opts.scalpNth}번째`);
  if(base > 0 && HOLD_CHIP_PCT > 0) push({ kind: 'add', value: p.principal * HOLD_CHIP_PCT }, 'hold', SETTLE_SOURCE_LABEL.hold);   // N1-B 보유 칩
  const sb = base > 0 ? sectorBonus(p) : null;   // (N3) 섹터 레벨: 수익 마감이면 유물보다 먼저 칩 + 합산 배수
  if(sb){ push({ kind: 'add', value: sb.chip }, 'sector', sb.label); push({ kind: 'mult', value: sb.mult }, 'sector', sb.label); }
  if(base !== 0){
    const seized = bossMod('slot1Seized', false) ? 0 : -1;   // 유물 압류 (보스): 1번 칸 효과 무효 — 그 칸을 복사·반복해도 무효
    const applyRelic = (id, i, owner) => {   // owner = 발동을 일으킨 칸의 유물 (몰아주기가 왼쪽 칸을 다시 발동)
      const src = copySource(id, i), fx = SETTLE_EFFECTS[src];
      if(i === seized || (src !== id && run.relics.indexOf(src) === seized)) return;
      if(!fx || (base < 0) !== fx.onLoss) return;
      const e = fx.apply(p, base);
      if(!e) return;
      if(bossMod('noAddRelics', false) && (e.kind === 'add' || e.kind === 'mult')) return;   // 더하기 봉인 (보스)
      const label = e.label || relicStepLabel(src);
      push(e, owner, src === owner ? label : `${relicStepLabel(owner)} ← ${label}`);
    };
    run.relics.forEach((id, i) => {
      if(i === seized) return;
      if(i > 0 && run.relics[i - 1] === 'focus' && i - 1 !== seized) return;   // 🧲 몰아주기: 바로 오른쪽 칸은 꺼진다 (압류된 몰아주기는 효과 없음)
      if(id === 'focus'){ if(i > 0) for(let k = 0; k < FOCUS_EXTRA; k++) applyRelic(run.relics[i - 1], i - 1, 'focus'); return; }
      if(id === 'lastTrain'){   // 🚂 막차 탑승: 맨 오른쪽 칸이면 m → m^POW, 아니면 ×PENALTY (수익만)
        if(base <= 0) return;
        if(i === run.relics.length - 1){ if(m > 1) push({ kind: 'xmult', value: Math.pow(m, LAST_TRAIN_POW - 1) }, 'lastTrain', `${relicStepLabel('lastTrain')} ×${fmtMultEngine(m)}^${LAST_TRAIN_POW}`); }
        else if(LAST_TRAIN_PENALTY !== 1) push({ kind: 'xmult', value: LAST_TRAIN_PENALTY }, 'lastTrain', `${relicStepLabel('lastTrain')} 맨 오른쪽 아님`);
        return;
      }
      applyRelic(id, i, id);
    });
  }
  if(base > 0){   // 카드 효과 → 무량대수 → 크리티컬 (최종 금액 직전)
    (p.todayX || []).forEach(x => push({ kind: 'xmult', value: x.value }, 'card', x.label));
    if(run.week.futures && run.week.futures !== 1) push({ kind: 'xmult', value: run.week.futures }, 'futures', `${SETTLE_SOURCE_LABEL.futures} ×${run.week.futures}`);
    if(hasRelic('infinity')){ const d = String(Math.floor(Math.abs(chips * m))).length; push({ kind: 'xmult', value: d }, 'infinity', `${relicStepLabel('infinity')} ${d}자리`); }
    if(crit > 1) push({ kind: 'xmult', value: crit }, 'crit', `${SETTLE_SOURCE_LABEL.crit} ×${crit}`);
  }
  return { steps, chips, mult: m, total: chips * m };
}
/* 크리티컬 판정 (settleDay 안에서만, rand) → 배수 또는 0 */
function rollCrit(){
  if(rand() >= CRIT_CHANCE) return 0;
  const total = CRIT_TABLE.reduce((sum, c) => sum + c.weight, 0);
  let roll = rand() * total;
  for(let i = 0; i < CRIT_TABLE.length; i++){ roll -= CRIT_TABLE[i].weight; if(roll < 0) return CRIT_TABLE[i].mult; }
  return CRIT_TABLE[CRIT_TABLE.length - 1].mult;
}

/* 장 마감 정산: 포지션마다 보너스를 현금으로. 기록 run.lastDay → emit('daySettled') (정산 연출은 이 기록을 재생만 한다) */
function settleDay(){
  const rows = [];
  const bySource = {};   // 유물별 보너스 합 (연출용)
  let payoutSum = 0;
  let dayBase = 0;
  run.positions.slice().forEach(p => {
    const raw = p.dir * (exposure(p) - p.refExp);
    const cap = SETTLE_BASE_CAP * p.principal;   // N1-A: 정산 입력만 원금 대비 ±cap으로 자른다 (평가손익·순자산은 그대로)
    const base = cap > 0 ? Math.max(-cap, Math.min(cap, raw)) : raw;
    p.refExp = exposure(p);
    dayBase += base;
    const noBonus = hasRelic('scalper');   // ⚡ 단타 중독: 장 마감 보유 포지션은 보너스 없음 (크리티컬 판정도 안 한다)
    const crit = base > 0 && !noBonus ? rollCrit() : 0;
    const r = settleSteps(p, base, crit, noBonus ? { noBonus: true } : null);
    if(crit) emit('settleCrit', {posId: p.id, name: p.name, mult: crit});
    let payout = r.total - base;
    if(base > 0 && run.timeLoopToday > 0 && !noBonus){   // 타임 루프: 오늘 정산(손익 × 배수)을 한 번 더
      const again = r.total * run.timeLoopToday;
      r.steps.push({ label: `${SETTLE_SOURCE_LABEL.timeLoop} ×${run.timeLoopToday}`, kind: 'add', value: again,
                     runningChips: r.chips + again / r.mult, runningMult: r.mult, source: 'timeLoop' });
      payout += again;
    }
    p.upStreak = base > 0 ? limitUpStreak(p, base) : base < 0 ? 0 : (p.upStreak || 0);   // 상한가 행진
    p.todayX = [];
    if(p.reinvestToday && payout > 0) addToPosition(p, payout);   // 배당 재투자: 정산금을 현금 대신 원금에
    else run.cash += payout;
    p.reinvestToday = false;
    payoutSum += payout;
    if(base > 0) run.maxSettleMult = Math.max(run.maxSettleMult, r.mult);
    const sources = [];   // 이 포지션의 보너스를 단계별로 나눈 몫 [{source, label, amount}] — 합 = payout
    r.steps.forEach((st, k) => {
      if(k === 0) return;
      const prev = r.steps[k - 1];
      const amount = st.runningChips * st.runningMult - prev.runningChips * prev.runningMult;
      sources.push({ source: st.source, label: stepLabel(st.source), amount });
      bySource[st.source] = (bySource[st.source] || 0) + amount;
    });
    rows.push({ posId: p.id, posName: p.name, assetId: p.assetId, dir: p.dir, lev: p.lev,
                base, steps: r.steps, chips: r.chips, mult: r.mult, payout, sources });
  });
  run.settledToday = payoutSum;
  run.settledTotal += payoutSum;
  run.maxSettlePayout = Math.max(run.maxSettlePayout, payoutSum);
  run.lastDay = { round: run.round, day: run.day, settlement: rows, payout: payoutSum };
  run.weekDays.push(run.lastDay);
  run.timeLoopToday = 0;
  if(dayBase > 0) growRelic('ccompound', 1);   // 복리의 복리
  else if(dayBase < 0) shrinkRelic('ccompound', CC_LOSS_STEPS, 'lossDay');
  emit('daySettled', run.lastDay);
  if(run.day < DAYS_PER_ROUND)   // 연출용 (이미 계산된 값). 주 마지막 날은 주간 결산 체인이 유물별로 보여준다
    Object.keys(bySource).forEach(id => { if(bySource[id] && RELIC_BY_ID[id]) emit('relicTriggered', {id, amount: bySource[id]}); });
}

/* 예상 정산 미리보기 (순수 함수 — rand·상태 변경 없음). extra = 가정 포지션(카드를 쓰면 생길 포지션, 선택).
   포지션별 배수 = 오늘 수익이 났을 때의 mult. 전체 배수 = 노출액 가중 평균 (모든 포지션이 유리하게 1% 움직일 때 번 돈 ÷ 기본 손익).
   → { mult, rows: [{posId, name, dir, lev, mult, per1pct}] } — per1pct = 유리하게 +1%면 정산 후 손익(기본 + 보너스) */
function previewSettlement(extra){
  // 포지션 수·섹터·레버리지 곱을 세는 유물(깃발·섹터 풀세트·레버리지 탑)도 가정 포지션을 세도록 잠깐 넣었다가 그대로 뺀다 (결과 상태 불변)
  if(extra) run.positions.push(extra);
  try {
    let expSum = 0, gainSum = 0;
    const rows = run.positions.map(p => {
      const e = exposure(p), sb = sectorBonus(p);
      const m = settleSteps(p, 1).mult * (sb ? 1 + sb.chip / Math.max(1e-9, e * 0.01) : 1);   // (N3) 섹터 칩은 유리하게 1% 움직인 손익 대비 배수로 환산 (레벨 1이면 그대로)
      expSum += e;
      gainSum += e * m;
      return { posId: p.id, name: p.name, dir: p.dir, lev: p.lev, mult: m, per1pct: e * 0.01 * m };
    });
    return { mult: expSum > 0 ? gainSum / expSum : 1, rows };
  } finally {
    if(extra) run.positions.pop();
  }
}
/* 종목 카드를 쓰면 생길 포지션 (미리보기용, run에 넣지 않음) */
function hypotheticalBuy(stockId, amount){
  const s = STOCK_BY_ID[stockId], principal = (amount || s.cost) * run.pending.principalMult, lev = capLev(run.pending.lev), exp = principal * lev;
  return { id: -1, assetId: s.id, name: s.name, dir: run.pending.dir, lev, principal,
           shares: exp / assets[s.id].price, entryExposure: exp, refExp: exp, daysHeld: 0 };
}

/* 주간 결산 체인 (연출용 요약) — 이번 주 매일 정산(run.weekDays)을 포지션별·유물별로 합친다. 값은 이미 현금으로 지급됨.
   step = { label, kind: 'base'|'add', value, runningTotal, source }: base = 이번 주 장 마감 손익 합, add = 유물별 정산 보너스 합.
   diamondPaid = endOfRound가 준 다이아몬드 보너스 [{ posId, amount }] */
function buildSettlementChain(diamondPaid){
  const byPos = [];
  run.weekDays.forEach(d => d.settlement.forEach(r => {
    let g = byPos.find(x => x.posId === r.posId);
    if(!g){ g = { posId: r.posId, posName: r.posName, assetId: r.assetId, dir: r.dir, lev: r.lev, base: 0, bonus: 0, sources: [] }; byPos.push(g); }
    g.base += r.base;
    g.bonus += r.payout;
    r.sources.forEach(x => {
      const e = g.sources.find(y => y.source === x.source);
      if(e) e.amount += x.amount; else g.sources.push({ source: x.source, label: x.label, amount: x.amount });
    });
  }));
  return byPos.map(g => {
    const steps = [{ label: '장 마감 손익 (이번 주)', kind: 'base', value: g.base, runningTotal: g.base, source: 'base' }];
    let total = g.base;
    g.sources.forEach(x => { if(x.amount === 0) return; total += x.amount; steps.push({ label: x.label, kind: 'add', value: x.amount, runningTotal: total, source: x.source }); });
    if(steps.length > 1) steps[steps.length - 1].runningTotal = g.base + g.bonus;   // 합은 실제 지급액과 정확히
    const paid = diamondPaid.find(d => d.posId === g.posId);
    if(paid){
      const prev = steps[steps.length - 1].runningTotal;
      steps.push({ label: '💎 다이아몬드 핸드', kind: 'add', value: paid.amount, runningTotal: prev + paid.amount, source: 'diamond' });
    }
    return { posId: g.posId, posName: g.posName, assetId: g.assetId, dir: g.dir, lev: g.lev,
             steps, finalPnl: steps[steps.length - 1].runningTotal };
  });
}
const marginCallRatio = p => (hasRelic('coldwallet') && RELIC_COLD_WALLET_STOCKS.indexOf(p.assetId) >= 0 ? RELIC_COLD_WALLET_RATIO : MARGIN_CALL_RATIO) + bossMod('marginCallAdd', 0);   // 증거금 상향 (보스)
const posPnl       = p => posEquity(p) - p.principal;
const posReturn    = p => posPnl(p) / p.principal;
const avgPrice     = p => p.entryExposure / p.shares;
const marginRatio  = p => { const e = exposure(p); return e > 0 ? posEquity(p) / e : 1; };
/* (S7-14) 담보유지비율: 담보비율(collateralRatio) · 유지비율(maintRatio) · 건강도 = 담보비율 ÷ 유지비율 (1 미만 = 반대매매) */
const coldWalletOn     = p => hasRelic('coldwallet') && RELIC_COLD_WALLET_STOCKS.indexOf(p.assetId) >= 0;
const collateralRatio  = p => {
  if(p.dir < 0) return (p.principal + p.entryExposure) / Math.max(1e-9, exposure(p));   // 숏: (원금 + 공매도 대금) ÷ 갚을 주식 평가액
  const loan = posLoan(p);
  return loan > 0 ? exposure(p) / loan : Infinity;                                    // 롱: 평가액 ÷ 빌린 돈 (1x는 빌린 돈 없음)
};
const maintRatio   = p => (p.dir < 0 ? SHORT_MAINTENANCE_RATIO : MAINTENANCE_RATIO) - (coldWalletOn(p) ? RELIC_COLD_WALLET_MAINT_CUT : 0) + bossMod('maintAdd', 0);   // 증거금 상향 (보스)
const marginHealth = p => MAINTENANCE_MARGIN_ON ? collateralRatio(p) / maintRatio(p) : marginRatio(p) / marginCallRatio(p);   // 1 미만 = 반대매매
const marginCalled = p => marginHealth(p) < 1;
const marginWarn   = p => MAINTENANCE_MARGIN_ON ? marginHealth(p) < MAINT_WARN_HEALTH : marginRatio(p) < MARGIN_WARN_RATIO;
/* 콜드월렛이 아니었으면 반대매매됐을 포지션 (연출용) */
const coldWalletSaved = p => coldWalletOn(p) && !marginCalled(p) && (MAINTENANCE_MARGIN_ON ? collateralRatio(p) < maintRatio(p) + RELIC_COLD_WALLET_MAINT_CUT : marginRatio(p) < MARGIN_CALL_RATIO);
const isMarginable = p => p.lev > 1 || p.dir < 0;          // 반대매매 대상
const posLoan      = p => p.dir > 0 ? Math.max(0, p.entryExposure - p.principal) : 0;
const posBorrowed  = p => p.dir > 0 ? posLoan(p) : exposure(p); // 이자가 붙는 금액: 신용대출 / 빌린 주식 전액
const canSell      = p => !p.diamond && !run.noSellToday && !bossHalt(p.assetId)   // 거래정지 종목은 못 판다 (보스)
  && !hasRelic('oath') && !(hasRelic('water') && isLosing(p));   // 💎 존버 서약서: 직접 매도 불가 · 🌊 물타기 장인: 손실 중이면 불가
const isProtected  = p => p.protectedToday || run.allProtectedToday;
const isLosing     = p => posPnl(p) < 0;
const isWinning    = p => posPnl(p) > 0;

const totalBorrowed = () => run.positions.reduce((s, p) => s + posBorrowed(p), 0) + run.overdraft;
const netEquity     = () => run.cash + run.positions.reduce((s, p) => s + posEquity(p), 0) - run.overdraft;
/* 이번 주 목표. 목표 상향 조정(보스, 정산 카운터)이면 주 시작 순자산 × 배수와 비교해 큰 값 — 불어난 순자산을 직접 겨냥 */
/* 목표 성장률 (순수): round주차를 순자산 eq로 시작하면 그 주 성장 목표 (꺼짐이면 0).
   K ≤ 1이면 성장 목표 없음 = 고정 곡선 그대로 (eq × 1.0을 목표로 두면 '그 주 손해 금지'가 되어 기존과 달라진다) */
const growthTargetFor = (round, eq) => { const k = TARGET_GROWTH_K[round - 1] || 0; return run && run.targetGrowth && k > 1 ? eq * k : 0; };
const fixedTarget = round => ROUND_TARGETS[round - 1] || 0;
/* 이번 주 성장 목표가 고정 목표보다 큰가 (= 성장 목표가 걸림) */
const growthBinding = () => !!run && run.week.growthTarget > fixedTarget(run.round);
/* 다음 주 목표 미리보기 (결산·보상·암시장 — 지금 순자산으로 다음 주를 시작한다고 보고). 보스 목표 상향은 그 주에 따로 */
const nextTarget = () => Math.max(fixedTarget(run.round + 1), growthTargetFor(run.round + 1, netEquity()));
/* 성장 목표를 뺀 목표 (고정 곡선 + 보스 목표 상향) — 목표에 비례하는 다른 규칙(찌라시 금액·영끌 대출 한도·벼랑 끝 전술)은 이것을 읽는다. 성장 목표로 이들이 순자산에 비례해 되먹임하지 않게 */
const currentTarget = () => Math.max(baseTarget(), run.week.growthTarget || 0);
const baseTarget = () => Math.max(ROUND_TARGETS[run.round - 1], run.weekStart.equity * (bossMod('targetIfHeld', false) && !bossTargetHeld() ? 0 : bossMod('targetEquityMult', 0)));
/* 이번 주 보스의 표적 유물을 가졌나 (빌드 카운터 조정안 targetIfHeld) */
const bossTargetHeld = () => { const b = run.boss ? BOSS_BY_ID[run.boss] : null; return !!b && !!b.targets && b.targets.some(id => hasRelic(id)); };
const longExposure  = () => run.positions
  .filter(p => p.dir > 0 && STOCK_BY_ID[p.assetId].beta > 0)
  .reduce((s, p) => s + exposure(p), 0);
const hedgeAmount   = (ratio = HEDGE_RATIO) => Math.round(Math.min(longExposure() * ratio, run.cash));

/* 기존 포지션에 추가 매수: 원금·수량·진입노출액을 더해 평단이 자연히 섞인다 */
function addToPosition(p, principal){
  if(hasRelic('water') && posPnl(p) < 0 && p.water < WATER_MAX){ p.water++; emit('waterAdded', {pos: p, water: p.water}); }   // 🌊 물타기 장인
  if(hasRelic('cult')) run.week.cultAdds++;   // 🙏 풀매수 교주: 이번 주 추가 매수 횟수
  const exp = principal * p.lev;
  p.principal += principal;
  p.shares += exp / assets[p.assetId].price;
  p.entryExposure += exp;
  p.refExp += exp;   // 정산 기준: 새로 산 몫은 지금 가격부터
}

/* 같은 종목·방향·레버리지 포지션이 이미 있으면 거기에 합친다 (레버리지·방향이 다르면 별도 포지션) */
const findSamePosition = (stockId, lev, dir) =>
  run.positions.find(p => p.assetId === stockId && p.lev === lev && p.dir === dir) || null;

function openPosition(stockId, principal, lev, dir, payCash){
  const s = STOCK_BY_ID[stockId];
  lev = capLev(lev);   // 레버리지 규제 (보스)
  const exp = principal * lev;
  if(payCash) run.cash -= principal;
  const same = findSamePosition(stockId, lev, dir);
  if(!same && hasRelic('cult') && run.positions.some(q => q.assetId === stockId)) run.week.cultAdds++;   // 🙏 같은 종목 다른 레버리지·방향도 추가 매수로 센다
  if(same){
    addToPosition(same, principal);
    emit('bought', {pos: same, merged: true, added: principal});
    return same;
  }
  const p = {
    id: run.nextPosId++, assetId: stockId, name: s.name, dir, lev,
    principal, shares: exp / assets[stockId].price, entryExposure: exp, refExp: exp,   // refExp = 정산 기준 노출액 (직전 장 마감 또는 매수 시점 가격)
    stopLoss: false, takeProfit: false, trailing: false, trailPeak: 0,
    protectedToday: false, diamond: false, daysHeld: 0, viaTip: false,
    upStreak: 0, todayX: [], reinvestToday: false,   // S4: 상한가 행진 연속 상승 · 오늘 카드 정산 배수 · 배당 재투자
    water: 0   // 🌊 물타기 장인: 손실 중 추가 매수 횟수
  };
  run.positions.push(p);
  emit('bought', {pos: p, merged: false, added: principal});
  return p;
}

/* 청산: 포지션순자산이 현금으로 (음수면 미수). penalty = 반대매매 투매 손실 */
const sellTaxOn = (p, frac) => exposure(p) * frac * bossMod('sellTax', 0);   // 거래세 인상 (보스): 매도 금액 × 세율
/* ⚡ 단타 중독: 수익 매도 순간 그 매도분(직전 장 마감 이후 가격 손익)을 바로 정산 — 유물 칸 순서대로. 기록 → emit('sellSettled') */
function scalpSettle(p){
  const base = p.dir * (exposure(p) - p.refExp);
  if(base <= 0) return 0;
  run.scalpSells++;
  const r = settleSteps(p, base, 0, { scalpMult: SCALP_MULT_STEP * run.scalpSells, scalpNth: run.scalpSells });
  const payout = r.total - base;
  run.cash += payout;
  run.settledToday += payout;
  run.settledTotal += payout;
  run.maxSettleMult = Math.max(run.maxSettleMult, r.mult);
  run.maxSettlePayout = Math.max(run.maxSettlePayout, payout);
  emit('sellSettled', {posId: p.id, posName: p.name, assetId: p.assetId, dir: p.dir, lev: p.lev, base, steps: r.steps, chips: r.chips, mult: r.mult, payout, nth: run.scalpSells});
  return payout;
}
function closePosition(p, penalty){
  if(penalty === 0 && hasRelic('scalper')) scalpSettle(p);   // 반대매매(penalty > 0)는 정산 없음
  const tax = sellTaxOn(p, 1);
  run.taxPaid += tax;
  const proceeds = posEquity(p) - penalty - tax;
  const pnl = proceeds - p.principal;
  run.cash += proceeds;
  run.realized += pnl;
  run.positions = run.positions.filter(x => x !== p);
  if(pnl < 0) growRelic('tearJar', -pnl * TEARJAR_RATE);   // 개미의 눈물 저금통
  return pnl;
}

function closePart(p, frac){   // 포지션의 frac만큼 시장가 매도
  const tax = sellTaxOn(p, frac);
  run.taxPaid += tax;
  const pnl = posPnl(p) * frac - tax;
  run.cash += posEquity(p) * frac - tax;
  run.realized += pnl;
  p.principal *= 1 - frac;
  p.shares *= 1 - frac;
  p.entryExposure *= 1 - frac;
  p.refExp *= 1 - frac;
  return pnl;
}
const closeHalf = p => closePart(p, 0.5);

const canTrade = () => run && (run.phase === 'premarket' || run.phase === 'market');

function sellPosition(id){
  if(!canTrade()) return false;
  const p = run.positions.find(x => x.id === id);
  if(!p) return false;
  if(!canSell(p)){ emit('cardRejected', {reason: 'locked'}); return false; }
  noteManualSell([p]);
  emit('sold', {pos: p, pnl: closePosition(p, 0)});
  return true;
}

function closeAllSellable(){
  const targets = run.positions.filter(canSell);
  noteManualSell(targets);
  let total = 0;
  targets.forEach(p => { total += closePosition(p, 0); });
  return { count: targets.length, pnl: total };
}

function sellAllPositions(){
  if(!canTrade() || run.positions.length === 0) return false;
  const r = closeAllSellable();
  if(r.count === 0){ emit('cardRejected', {reason: 'locked'}); return false; }
  emit('soldAll', r);
  return true;
}

/* ── 대기 중인 매수 효과 (신용·영끌·공매도 → 다음 종목 카드에 적용) ── */
function resetPending(){ run.pending.lev = 1; run.pending.dir = 1; run.pending.principalMult = 1; }
/* 종목 카드 매수 금액: 직접 입력(run.buyAmount, playCard의 opts.amount) 또는 기본값 s.cost. 실제 투입 = 금액 × 원금 배수(영끌) */
const stockCost = s => (run.buyAmount || s.cost) * run.pending.principalMult;
const stockMaxAmount = () => Math.floor(Math.max(0, buyCash()) / run.pending.principalMult);   // 입력 가능한 최대 금액
/* 카드로 한 매수: 횟수를 세고 '내가 산 포지션'으로 표시 (찌라시가 사게 한 것은 제외) — '관망의 신' 판정용 */
function noteBuy(p){ run.buys++; p.viaTip = false; }
function buyStock(stockId){
  const s = STOCK_BY_ID[stockId];
  const p = openPosition(s.id, stockCost(s), run.pending.lev, run.pending.dir, true);
  noteBuy(p);
  inverseMasterDraw(s.id);
  return p;
}
function inverseMasterDraw(stockId){   // 인버스 장인
  if(hasRelic('inverse') && STOCK_BY_ID[stockId].beta < 0){ drawCards(RELIC_INVERSE_DRAW); emit('relicTriggered', {id: 'inverse', amount: RELIC_INVERSE_DRAW}); }
}

/* ── 예약주문 · 반대매매 (장중 매 틱) ── */
function checkOrders(){
  run.positions.slice().forEach(p => {
    if(p.diamond || bossHalt(p.assetId)) return;   // 거래정지 종목은 예약주문도 체결되지 않는다
    const r = posReturn(p);
    if(p.trailing) p.trailPeak = Math.max(p.trailPeak, r);
    let kind = '';
    if(p.stopLoss && r <= p.stopLoss) kind = 'stop';          // p.stopLoss·takeProfit = 체결 수익률 (false = 없음)
    else if(p.takeProfit && r >= p.takeProfit) kind = 'take';
    else if(p.trailing && p.trailPeak - r >= TRAIL_GAP) kind = 'trail';
    if(!kind) return;
    const pnl = closePosition(p, 0);
    let bonus = 0;
    if(run.week.topSpotter && (kind === 'take' || kind === 'trail') && pnl > 0){ bonus = pnl * TOP_SPOTTER_BONUS; run.cash += bonus; }
    emit('orderFilled', {pos: p, kind, pnl, bonus});
  });
}

function checkMarginCalls(){
  // 연출용 알림만 (상태·난수 변화 없음): 콜드월렛 덕분에 기본 기준이었으면 반대매매됐을 포지션
  run.positions
    .filter(p => isMarginable(p) && !isProtected(p) && coldWalletSaved(p))
    .forEach(p => emit('relicTriggered', {id: 'coldwallet', amount: 0, posId: p.id}));
  run.positions
    .filter(p => isMarginable(p) && !isProtected(p) && marginCalled(p))
    .forEach(p => {
      const fullPenalty = exposure(p) * LIQUIDATION_PENALTY;
      const saved = hasRelic('hotline') ? fullPenalty * RELIC_HOTLINE_PENALTY_CUT : 0;
      const penalty = fullPenalty - saved;
      const pnl = closePosition(p, penalty);
      const refund = run.lossGuardToday && pnl < 0 ? -pnl * run.lossGuardToday : 0;   // 손실 보전 약정 (lossGuardToday = 환급 비율)
      run.cash += refund;
      run.liquidations++;
      run.liqToday++;
      run.liquidated.push({ assetId: p.assetId, principal: p.principal, lev: p.lev, dir: p.dir });   // 재상장용
      run.lastLiquidation = { lev: p.lev, dir: p.dir, round: run.round, day: run.day };
      // 미수: 갭으로 포지션 순자산이 0 아래에서 체결됐는데 현금으로 못 갚으면 → 미수 동결 = 파산
      const deficit = pnl + p.principal < 0 && run.cash < MISU_CASH_FLOOR - loanRoom();   // 🏦 영끌 대출이면 마이너스 한도까지 버틴다
      if(deficit) run.misuDefault = true;
      run.discard.push(newCard('trauma'));   // 반대매매 트라우마: 덱 오염
      emit('marginCall', {pos: p, pnl, penalty, saved, refund, deficit});
      resetRelic('tearJar', 'marginCall', TEARJAR_MARGIN_KEEP);
      growRelic('traumaSurvivor', 1);
      growRelic('phoenix', 1);
      if(saved > 0) emit('relicTriggered', {id: 'hotline', amount: saved, posId: p.id});   // 연출용 (이미 계산된 값)
    });
}

/* ══════════════════════════════════════════════════════════
   CARDS — 데이터 + 효과 함수. valid(t)/play(t)는 엔진 상태만 만진다.
   type: stock | buy | sell | hold | action | defense | status
   target: null | 'position' | 'asset'
══════════════════════════════════════════════════════════ */
const CARDS = [];
const CARD_BY_ID = {};
function defCard(id, name, type, ap, rarity, target, exhaust, desc, valid, play){
  const c = { id, name, type, ap, rarity, target, exhaust, desc, valid, play, stock: '', sector: '',
              tags: CARD_TAGS[id] || [], base: id, upgraded: false, retain: false };   // sector = 종목·리포트 카드의 섹터 (N3 보상 가중)   // base·upgraded = 강화판(+) 구분, retain = 장 마감에 손패에 남는다
  CARDS.push(c);
  CARD_BY_ID[id] = c;
  return c;
}
const pct = r => Math.round(Math.abs(r) * 100) + '%';
const STATE_LABEL = { BULL:'강세장', BEAR:'약세장', VOLATILE:'변동성 장세', NORMAL:'평상시' };
const marketOddsText = id => MARKET_CARD_ODDS[id].map(o => `${STATE_LABEL[o.state]} ${pct(o.chance)}`).join(' / ');

/* 보유 포지션의 서로 다른 섹터 수 */
function heldSectorCount(){
  const sectors = [];
  run.positions.forEach(p => { const sec = STOCK_BY_ID[p.assetId].sector; if(sectors.indexOf(sec) < 0) sectors.push(sec); });
  return sectors.length;
}
/* 레버리지 롱 → 1x: 현금으로 대출을 갚고, 모자라면 순자산만큼만 남기고 판다 */
function deleverPosition(p){
  const pay = Math.min(Math.max(0, run.cash), posLoan(p));
  run.cash -= pay;
  p.principal += pay;
  const eq = posEquity(p), exp = exposure(p);
  if(eq <= 0){ closePosition(p, 0); return; }
  const sold = Math.max(0, 1 - eq / exp);          // 판 비율
  run.realized += posPnl(p) * sold;
  p.principal = eq;
  p.refExp *= (eq / assets[p.assetId].price) / p.shares;   // 남은 수량 비율만큼
  p.shares = eq / assets[p.assetId].price;
  p.entryExposure = eq;
  p.lev = 1;
}

/* 종목 카드 (행동력 1 + 현금) */
STOCKS.forEach(s => {
  const c = defCard('stk_' + s.id, s.name, 'stock', 1, s.rarity, null, false,
    `${s.sector} · β ${s.beta}`,
    () => buyCash() >= stockCost(s),
    () => { buyStock(s.id); resetPending(); });
  c.stock = s.id;
  c.sector = s.sector;
});

/* 매수 */
defCard('credit', '신용 매수', 'buy', 1, 'common', null, false,
  `다음 종목 매수를 레버리지 ${CREDIT_LEV}x로. 대출금에 매일 이자.`,
  () => run.pending.lev < CREDIT_LEV,
  () => { run.pending.lev = CREDIT_LEV; });
defCard('yolo', '영끌', 'buy', 1, 'legendary', null, false,
  `다음 매수: 원금 ${YOLO_PRINCIPAL_MULT}배 + 레버리지 ${YOLO_LEV}x. 영혼까지 끌어모은다.`,
  () => run.pending.principalMult === 1,
  () => { run.pending.lev = YOLO_LEV; run.pending.principalMult = YOLO_PRINCIPAL_MULT; });
defCard('short', '공매도', 'buy', 1, 'uncommon', null, false,
  `다음 종목 매수를 숏(하락 베팅)으로. 대차 이자 매일 ${(SHORT_BORROW_RATE * 100).toFixed(1)}%, 급등하면 반대매매.`,
  () => run.pending.dir === 1,
  () => { run.pending.dir = -1; });
defCard('avgDown', '물타기', 'buy', 1, 'common', 'position', false,
  `손실 중인 포지션에 원금의 ${pct(AVG_DOWN_RATIO)}를 같은 레버리지로 추가 매수.`,
  p => isLosing(p) && buyCash() >= p.principal * AVG_DOWN_RATIO,
  p => {
    const add = p.principal * AVG_DOWN_RATIO;
    run.cash -= add;
    addToPosition(p, add);
    noteBuy(p);
  });
defCard('ipo', '공모주 청약', 'buy', 1, 'uncommon', null, true,
  `무작위 종목(인버스 제외)을 ₩${IPO_AMOUNT}만어치 공짜로 1x 매수.`,
  () => true,
  () => {
    const pool = STOCKS.filter(s => s.beta > 0);
    noteBuy(openPosition(pool[randInt(pool.length)].id, IPO_AMOUNT, 1, 1, false));
  });
defCard('fullBuy', '풀매수', 'buy', 2, 'legendary', null, false,
  '손패의 모든 종목을 행동력 없이 매수. 대기 효과 적용, 원금 배수(영끌)는 첫 종목만.',
  () => run.hand.some(i => CARD_BY_ID[i.id].type === 'stock'),
  () => {
    run.hand.filter(i => CARD_BY_ID[i.id].type === 'stock').forEach(inst => {
      const s = STOCK_BY_ID[CARD_BY_ID[inst.id].stock];
      if(buyCash() < stockCost(s)) return;   // 현금이 모자라면 손패에 남긴다
      if(overPositionCap(s.id, run.pending.lev, run.pending.dir)) return;   // 포지션 한도 규제 (보스): 손패에 남긴다
      buyStock(s.id);
      run.pending.principalMult = 1;          // 영끌 원금 배수는 첫 종목에만
      run.hand.splice(run.hand.indexOf(inst), 1);
      run.discard.push(inst);
    });
    resetPending();
  });

defCard('chaseLimit', '상한가 따라잡기', 'buy', 1, 'rare', null, false,
  `전날 등락률 1위 종목 ₩${CHASE_AMOUNT}만 매수. 전날 +${pct(CHASE_HOT_PCT)} 이상이면 ${CHASE_HOT_LEV}x.`,
  () => buyCash() >= CHASE_AMOUNT,
  () => {
    const top = STOCKS.slice().sort((a, b) => assets[b.id].lastDayChg - assets[a.id].lastDayChg)[0];
    const hot = assets[top.id].lastDayChg >= CHASE_HOT_PCT;
    noteBuy(openPosition(top.id, CHASE_AMOUNT, hot ? CHASE_HOT_LEV : 1, 1, true));
  });
defCard('antArmy', '개미 군단 총공격', 'buy', 3, 'mythic', null, true,
  `이번 주 종목 카드 행동력 0, 쓸 때마다 ${ANT_ARMY_DRAW}장 드로우. 소멸.`,
  () => !run.week.antArmy,
  () => { run.week.antArmy = true; });

/* 매도 */
defCard('stopLoss', '손절 예약', 'sell', 0, 'common', 'position', false,
  `−${pct(STOP_LOSS_PCT)} 손실에 닿으면 자동 매도.`,
  p => !p.diamond && !p.stopLoss,
  p => { p.stopLoss = STOP_LOSS_PCT; });
defCard('takeProfit', '익절 예약', 'sell', 0, 'common', 'position', false,
  `+${pct(TAKE_PROFIT_PCT)} 수익에 닿으면 자동 매도.`,
  p => !p.diamond && !p.takeProfit,
  p => { p.takeProfit = TAKE_PROFIT_PCT; });
defCard('trailing', '트레일링 스탑', 'sell', 1, 'uncommon', 'position', false,
  `최고 수익률에서 ${Math.round(TRAIL_GAP * 100)}%p 밀리면 자동 매도.`,
  p => !p.diamond && !p.trailing,
  p => { p.trailing = true; p.trailPeak = posReturn(p); });
defCard('cutLoss', '손절은 과학', 'sell', 0, 'uncommon', 'position', false,
  `손실 중인 포지션을 즉시 매도, 손실의 ${pct(CUT_LOSS_REFUND)}를 멘탈 보상금으로.`,
  p => isLosing(p) && canSell(p),
  p => {
    noteManualSell([p]);
    const pnl = closePosition(p, 0);
    run.cash += -pnl * CUT_LOSS_REFUND;
    emit('sold', {pos: p, pnl});
  });
defCard('takeWin', '익절은 항상 옳다', 'sell', 1, 'rare', 'position', false,
  `수익 중인 포지션을 즉시 매도, 수익의 ${pct(TAKE_PROFIT_BONUS)}를 보너스로.`,
  p => isWinning(p) && canSell(p),
  p => {
    noteManualSell([p]);
    const pnl = closePosition(p, 0);
    run.cash += pnl * TAKE_PROFIT_BONUS;
    emit('sold', {pos: p, pnl});
  });
defCard('escape', '탈출은 지능순', 'sell', 1, 'common', null, false,
  `매도 가능한 모든 포지션을 시장가 청산하고 카드 ${ESCAPE_DRAW}장을 뽑는다.`,
  () => true,
  () => {
    const r = closeAllSellable();
    if(r.count > 0) emit('soldAll', r);
    drawCards(ESCAPE_DRAW);
  });

defCard('splitSell', '분할 매도', 'sell', 0, 'uncommon', 'position', false,
  `포지션 1/3 매도 + ${SPLIT_SELL_DRAW}장 드로우.`,
  p => canSell(p),
  p => {
    const pnl = closePart(p, SPLIT_SELL_RATIO);
    emit('sold', {pos: p, pnl, partial: true});
    drawCards(SPLIT_SELL_DRAW);
  });
defCard('topSpotter', '상투 감별사', 'sell', 2, 'mythic', null, true,
  `이번 주 익절 예약·트레일링 스탑 행동력 0, 체결 수익 +${pct(TOP_SPOTTER_BONUS)}. 소멸.`,
  () => !run.week.topSpotter,
  () => { run.week.topSpotter = true; });

/* 홀드 */
defCard('hodl', '존버', 'hold', 1, 'common', 'position', false,
  '오늘 하루 이 포지션(레버리지/숏)은 반대매매되지 않는다.',
  p => isMarginable(p) && !p.protectedToday,
  p => { p.protectedToday = true; });
defCard('diamond', '다이아몬드 핸드', 'hold', 1, 'rare', 'position', false,
  `이번 주 매도·예약주문 불가. 주말 결산 때 평가이익의 ${pct(DIAMOND_BONUS)} 보너스.`,
  p => !p.diamond,
  p => { p.diamond = DIAMOND_BONUS; p.stopLoss = false; p.takeProfit = false; p.trailing = false; });   // diamond = 결산 보너스 비율
defCard('forcedLong', '강제 장기투자', 'hold', 0, 'common', 'position', true,
  `손실 중인 포지션 원금의 ${pct(FORCED_DIVIDEND)}를 배당금으로. 물린 게 아니라 배당주다.`,
  p => isLosing(p),
  p => { run.cash += p.principal * FORCED_DIVIDEND; });
defCard('dividend', '배당주 마인드', 'hold', 0, 'uncommon', null, false,
  `보유 포지션 1개당 ₩${DIVIDEND_PER_POS}만을 받는다 (최대 ${DIVIDEND_MAX_POS}개).`,
  () => run.positions.length > 0,
  () => { run.cash += Math.min(run.positions.length, DIVIDEND_MAX_POS) * DIVIDEND_PER_POS; });
defCard('forgotPw', '계좌 비번 까먹기', 'hold', 1, 'uncommon', null, false,
  '오늘 모든 포지션 반대매매 면제. 대신 오늘은 수동 매도 불가(예약주문은 체결).',
  () => !run.noSellToday,
  () => { run.noSellToday = true; run.allProtectedToday = true; });
defCard('hodlWins', '존버는 승리한다', 'hold', 2, 'legendary', null, true,
  `손실 중인 모든 포지션의 평가손실 ${pct(HODL_RECOVER)} 회복(평단 조정).`,
  () => run.positions.some(isLosing),
  () => {
    // 손익 = dir × (노출액 − 진입노출액) → 진입노출액을 옮겨 손실을 줄인다
    run.positions.filter(isLosing).forEach(p => {
      const e = exposure(p);
      p.entryExposure = e - (e - p.entryExposure) * (1 - HODL_RECOVER);
    });
  });

defCard('compound', '복리의 마법', 'hold', 1, 'rare', 'position', false,
  `수익 포지션의 평가이익 ${pct(COMPOUND_RATIO)}만큼 원금 증가. 포지션 유지, 대출↓.`,
  p => isWinning(p),
  p => { p.principal += posPnl(p) * COMPOUND_RATIO; });
defCard('valueGod', '가치투자의 신', 'hold', 2, 'mythic', null, true,
  `이번 주 장 마감마다 ${VALUE_GOD_DAYS}일 이상 보유한 롱 원금의 ${(VALUE_GOD_PCT * 100).toFixed(1)}% 지급. 소멸.`,
  () => !run.week.valueGod,
  () => { run.week.valueGod = VALUE_GOD_PCT; });   // valueGod = 원금 대비 지급 비율

/* 행동 */
defCard('pump', '리딩방 찌라시', 'action', 1, 'uncommon', 'asset', false,
  `오늘 작전: ${pct(PUMP_UP_CHANCE)} 급등(+${pct(PUMP_UP_PCT)}) / ${pct(1 - PUMP_UP_CHANCE)} 설거지(−${pct(PUMP_DOWN_PCT)}). 개장 때 공개. 금감원 +${FSS_GAIN.pump}.`,
  s => !run.pumps[s.id],
  s => { run.pumps[s.id] = rand() < pumpChanceFor(CARD_BY_ID.pump) ? 1 : -1; });
defCard('dove', '연준 비둘기 발언', 'action', 1, 'uncommon', null, false,
  `개장 판정: ${marketOddsText('dove')}. 금감원 +${FSS_GAIN.dove}.`,
  () => run.marketCard !== 'dove',
  () => { run.marketCard = 'dove'; });
defCard('hawk', '연준 매파 발언', 'action', 1, 'uncommon', null, false,
  `개장 판정: ${marketOddsText('hawk')}. 금감원 +${FSS_GAIN.hawk}.`,
  () => run.marketCard !== 'hawk',
  () => { run.marketCard = 'hawk'; });
defCard('ceoTweet', 'CEO 밈 트윗', 'action', 0, 'uncommon', null, false,
  `개장 판정: ${marketOddsText('ceoTweet')}. 금감원 +${FSS_GAIN.ceoTweet}.`,
  () => run.marketCard !== 'ceoTweet',
  () => { run.marketCard = 'ceoTweet'; });
defCard('indicators', '보조지표 42개', 'action', 0, 'common', null, false,
  `카드 ${INDICATOR_DRAW}장 + 오늘 시그널 적중률 +${pct(SIGNAL_INDICATOR_BONUS)}p(다시 판독). 지표 42개가 전부 다른 말을 한다.`,
  () => true,
  () => {
    drawCards(INDICATOR_DRAW);
    STOCKS.filter(hasRegime).forEach(s => { const sg = run.signals[s.id]; if(sg && !sg.revealed) rollSignal(s.id, Math.min(1, sg.acc + SIGNAL_INDICATOR_BONUS)); });
  });
defCard('analyst', '애널리스트 리포트', 'action', 1, 'rare', 'asset', false,
  '이 종목의 오늘 실제 추세 100% 공개. 목표주가 3배, 발행 다음 날 매도 의견.',
  s => hasRegime(s) && !!run.signals[s.id] && !run.signals[s.id].revealed,
  s => { run.signals[s.id] = { shown: assets[s.id].regime, acc: 1, revealed: true }; });
defCard('coffee', '아아 수혈', 'action', 0, 'uncommon', null, true,
  `행동력 +${COFFEE_AP}.`,
  () => true,
  () => { run.ap += COFFEE_AP; });

defCard('rotation', '테마 순환매', 'action', 1, 'rare', null, false,
  `보유 섹터 수만큼 드로우 (최대 ${ROTATION_MAX_DRAW}). ${ROTATION_AP_SECTORS}개 이상이면 행동력 +${ROTATION_AP}.`,
  () => run.positions.length > 0,
  () => {
    const n = heldSectorCount();
    drawCards(Math.min(n, ROTATION_MAX_DRAW));
    if(n >= ROTATION_AP_SECTORS) run.ap += ROTATION_AP;
  });
defCard('manip', '작전 세력', 'action', 2, 'mythic', 'asset', true,
  `오늘 이 종목 확정 +${pct(MANIP_PCT)}. 내일 개장 ${Math.round(MANIP_GAP * 100)}% 갭. 금감원 +${FSS_GAIN.manip}. 소멸.`,
  s => !run.pumps[s.id],
  s => { run.pumps[s.id] = PUMP_MANIP; run.gapToday.push({ stockId: s.id, pct: MANIP_GAP }); });

/* 방어 */
defCard('marginTopup', '증거금 보충', 'defense', 0, 'common', 'position', false,
  `현금 ₩${MARGIN_TOPUP}만을 넣어 대출을 갚고 증거금률을 높인다.`,
  p => isMarginable(p) && run.cash >= MARGIN_TOPUP,
  p => { run.cash -= MARGIN_TOPUP; p.principal += MARGIN_TOPUP; });
defCard('cashOut', '현금화', 'defense', 0, 'common', 'position', false,
  '포지션의 절반을 매도해 현금을 확보한다.',
  p => canSell(p),
  p => { closeHalf(p); });
defCard('hedge', '인버스 헤지', 'defense', 1, 'uncommon', null, false,
  `보유 롱 노출액의 ${pct(HEDGE_RATIO)}만큼 지수 인버스를 1x 매수(현금 사용).`,
  () => hedgeAmount() >= 1,
  () => { noteBuy(openPosition(HEDGE_STOCK, hedgeAmount(), 1, 1, true)); inverseMasterDraw(HEDGE_STOCK); });
defCard('interestFree', '이자 유예', 'defense', 0, 'uncommon', null, false,
  '오늘 신용·대차 이자 면제. 카드 1장을 뽑는다.',
  () => !run.interestFree,
  () => { run.interestFree = true; drawCards(1); });
defCard('overdraft', '마이너스 통장', 'defense', 1, 'uncommon', null, true,
  `현금 +₩${OVERDRAFT_AMOUNT.toLocaleString()}만. 갚지 않는 영구 대출이라 매일 이자가 붙는다.`,
  () => true,
  () => { run.cash += OVERDRAFT_AMOUNT; run.overdraft += OVERDRAFT_AMOUNT; });
defCard('confess', '자진 신고', 'defense', 1, 'uncommon', null, true,
  `금감원 감시 게이지 −${FSS_CONFESS_CUT}. "반성문 제출했습니다." 소멸.`,
  () => run.fss > 0,
  () => { run.fss = Math.max(0, run.fss - FSS_CONFESS_CUT); });
defCard('savings', '적금 깨기', 'defense', 0, 'uncommon', null, true,
  `현금 +₩${SAVINGS_AMOUNT}만.`,
  () => true,
  () => { run.cash += SAVINGS_AMOUNT; });

defCard('delever', '디레버리징', 'defense', 1, 'rare', null, false,
  '레버리지 롱을 전부 1x로. 대출은 현금으로 갚고, 모자라면 매도.',
  () => run.positions.some(p => p.dir > 0 && posLoan(p) > 0),
  () => { run.positions.filter(p => p.dir > 0 && posLoan(p) > 0).forEach(deleverPosition); });
defCard('lossGuard', '손실 보전 약정', 'defense', 1, 'legendary', null, false,
  `오늘 반대매매 손실의 ${pct(LOSS_GUARD_REFUND)} 환급. ※ 실제로는 불법입니다.`,
  () => !run.lossGuardToday,
  () => { run.lossGuardToday = LOSS_GUARD_REFUND; });
defCard('circuit', '서킷브레이커', 'defense', 1, 'mythic', null, true,
  `오늘 순자산 −${pct(CIRCUIT_DROP)}(개장 대비)면 즉시 장 마감. 반대매매 면제. 소멸.`,
  () => !run.circuitToday,
  () => { run.circuitToday = CIRCUIT_DROP; run.allProtectedToday = true; });   // circuitToday = 장 마감 하락폭

/* ── 곱하기 카드 (S4) — 장 마감 정산 배수를 만진다 ── */
function splitPosition(p, n){   // 똑같은 n개 포지션으로 (합계는 그대로)
  ['principal', 'shares', 'entryExposure', 'refExp'].forEach(k => { p[k] /= n; });
  for(let i = 1; i < n; i++) run.positions.push(Object.assign({}, p, { id: run.nextPosId++, todayX: p.todayX.slice() }));
}
function levUpPosition(p, mult){   // 지금 가격으로 같은 방향 노출을 (mult−1)배 더 (빌린 돈으로)
  const add = exposure(p) * (mult - 1);
  p.shares *= mult;
  p.entryExposure += add;
  p.refExp += add;
  p.lev *= mult;
}
defCard('split', '주식 분할', 'hold', 1, 'uncommon', 'position', false,
  '포지션 하나를 똑같은 두 포지션으로 나눈다 (합계 그대로). 포지션 수를 세는 효과에 두 번 잡힌다.',
  p => true, p => { splitPosition(p, SPLIT_WAYS); });
defCard('levEtf', '레버리지 ETF', 'buy', 1, 'rare', 'position', false,
  `포지션 레버리지 ×${LEV_ETF_MULT} (지금 가격으로 빌려서 더 산다, 중첩 가능, 최대 ${LEV_ETF_MAX_LEV}x). 반대매매 위험도 ×${LEV_ETF_MULT}.`,
  p => p.lev * LEV_ETF_MULT <= LEV_ETF_MAX_LEV, p => { levUpPosition(p, LEV_ETF_MULT); });
defCard('reinvest', '배당 재투자', 'hold', 1, 'uncommon', 'position', false,
  '오늘 장 마감 정산금 전액을 현금 대신 그 포지션 원금에 추가한다 (같은 레버리지로 더 산다).',
  p => !p.reinvestToday, p => { p.reinvestToday = true; });
defCard('timeLoop', '타임 루프', 'action', 2, 'legendary', null, true,
  '오늘 장 마감 정산(손익 × 배수)을 수익 포지션마다 한 번 더 받는다. 소멸.',
  () => true, () => { run.timeLoopToday++; });
defCard('allIn', '몰빵', 'action', 1, 'rare', 'position', false,
  '이 포지션만 남기고 팔 수 있는 포지션을 전부 판다. 남은 포지션의 오늘 정산 ×(판 개수 + 1).',
  p => run.positions.some(x => x !== p && canSell(x)),
  p => {
    const others = run.positions.filter(x => x !== p && canSell(x));
    noteManualSell(others);
    others.forEach(x => closePosition(x, 0));
    p.todayX.push({ label: `🃏 몰빵 ×${others.length + 1}`, value: others.length + 1 });
    emit('allIn', {pos: p, sold: others.length});
  });
defCard('futures', '선물 만기일', 'action', 1, 'rare', null, false,
  `이번 주 장 마감 정산 ×${FUTURES_MULT}, 다음 주 정산 ×${FUTURES_NEXT}.`,
  () => run.week.futures < FUTURES_MULT, () => { run.week.futures = FUTURES_MULT * run.week.futures; run.futuresNext = FUTURES_NEXT; });
defCard('coinFlip', '모 아니면 도', 'action', 1, 'rare', 'position', false,
  `${pct(COIN_FLIP_CHANCE)}: 이 포지션 오늘 정산 ×${COIN_FLIP_MULT} / ${pct(1 - COIN_FLIP_CHANCE)}: 포지션 가치 0 (원금 증발).`,
  p => canSell(p), p => coinFlip(p, COIN_FLIP_CHANCE));
function coinFlip(p, chance){
  const win = rand() < chance;
  if(win) p.todayX.push({ label: `🃏 모 ×${COIN_FLIP_MULT}`, value: COIN_FLIP_MULT });
  else closePosition(p, posEquity(p));   // 가치 0으로 청산 (빌린 돈은 포지션이 갚고, 원금만큼 손실)
  emit('coinFlip', {pos: p, win, chance});
}
defCard('relist', '재상장', 'buy', 1, 'rare', null, true,
  '마지막으로 반대매매 당한 포지션을 원래 원금·레버리지·방향으로 되살린다 (현금 안 듦). 소멸.',
  () => run.liquidated.length > 0,
  () => {
    const x = run.liquidated.pop();
    run.cash += x.principal;
    const p = openPosition(x.assetId, x.principal, x.lev, x.dir, true);
    emit('relisted', {pos: p});
  });

/* 상태 (보상 풀에 나오지 않음) */
defCard('trauma', '반대매매 트라우마', 'status', 0, 'common', null, false,
  '사용 불가. 손패 자리만 차지한다. 주간 결산 때 사라진다.',
  () => false,
  () => {});

/* (N3) 리포트 카드: 섹터마다 1장, 쓰면 그 섹터 레벨 +1 (소멸). SECTOR_LEVELS_ON이 아니면 만들지 않는다 (보상 풀·도감에 없음) */
const sectorLevelText = () => `레벨당 칩 +원금의 ${Math.round(SECTOR_LEVEL_CHIP_PCT * 100)}% · 배수 +${SECTOR_LEVEL_MULT}`;
if(SECTOR_LEVELS_ON) SECTORS.forEach(x => {
  const c = defCard('rpt_' + x.key, x.report, 'report', SECTOR_REPORT_AP, SECTOR_REPORT_RARITY, null, true,
    `${x.name} 레벨 +1 — ${x.name} 포지션이 수익으로 장 마감하면 정산 맨 앞에서 ${sectorLevelText()}. ${x.quote}`,
    () => true,
    () => raiseSectorLevel(x.name, 1));
  c.sector = x.name;
});

/* ══ 강화판(+) — 카드마다 한 가지만 좋아진다 (DECKBUILDING.md 표). CARD_BY_ID에만 넣고 CARDS(보상·도감 풀)에는 넣지 않는다.
   id = 원래 id + '+', base = 원래 id, upgraded = true. over = 바꿀 필드 (ap·desc·valid·play) ══ */
const UPGRADES = [];
function defUpgrade(id, over){
  const b = CARD_BY_ID[id];
  const c = Object.assign({}, b, { id: id + '+', name: b.name + '+', upgraded: true, base: id }, over || {});
  CARD_BY_ID[c.id] = c;
  UPGRADES.push(c);
  return c;
}
const canUpgrade = id => !!CARD_BY_ID[id] && !CARD_BY_ID[id].upgraded && !!CARD_BY_ID[id + '+'];
STOCKS.forEach(s => defUpgrade('stk_' + s.id, { ap: 0, desc: `${s.sector} · β ${s.beta} · 행동력 0` }));
if(SECTOR_LEVELS_ON) SECTORS.forEach(x => defUpgrade('rpt_' + x.key, {   // 리포트 강화 = 레벨 +1 + 카드 드로우 (행동력은 이미 0)
  desc: `${x.name} 레벨 +1 · 카드 ${SECTOR_REPORT_UP_DRAW}장 뽑기 — ${x.name} 포지션이 수익으로 장 마감하면 정산 맨 앞에서 ${sectorLevelText()}. ${x.quote}`,
  play: () => { raiseSectorLevel(x.name, 1); drawCards(SECTOR_REPORT_UP_DRAW); } }));
defUpgrade('credit', { desc: `다음 종목 매수를 레버리지 ${CREDIT_LEV_UP}x로. 대출금에 매일 이자.`,
  valid: () => run.pending.lev < CREDIT_LEV_UP, play: () => { run.pending.lev = CREDIT_LEV_UP; } });
defUpgrade('yolo', { desc: `다음 매수: 원금 ${YOLO_PRINCIPAL_MULT_UP}배 + 레버리지 ${YOLO_LEV}x. 영혼까지 끌어모은다.`,
  play: () => { run.pending.lev = YOLO_LEV; run.pending.principalMult = YOLO_PRINCIPAL_MULT_UP; } });
defUpgrade('short', { desc: `다음 종목 매수를 숏(하락 베팅)으로. 오늘은 대차 이자 면제, 급등하면 반대매매.`,
  play: () => { run.pending.dir = -1; run.shortFeeFreeToday = true; } });
defUpgrade('avgDown', { desc: `손실 중인 포지션에 원금의 ${pct(AVG_DOWN_RATIO_UP)}를 같은 레버리지로 추가 매수.`,
  valid: p => isLosing(p) && buyCash() >= p.principal * AVG_DOWN_RATIO_UP,
  play: p => { const add = p.principal * AVG_DOWN_RATIO_UP; run.cash -= add; addToPosition(p, add); noteBuy(p); } });
defUpgrade('ipo', { desc: `무작위 종목(인버스 제외)을 ₩${IPO_AMOUNT_UP}만어치 공짜로 1x 매수.`,
  play: () => { const pool = STOCKS.filter(s => s.beta > 0); noteBuy(openPosition(pool[randInt(pool.length)].id, IPO_AMOUNT_UP, 1, 1, false)); } });
defUpgrade('fullBuy', { ap: 1 });
defUpgrade('chaseLimit', { desc: `전날 등락률 1위 종목 ₩${CHASE_AMOUNT_UP}만 매수. 전날 +${pct(CHASE_HOT_PCT)} 이상이면 ${CHASE_HOT_LEV}x.`,
  valid: () => buyCash() >= CHASE_AMOUNT_UP,
  play: () => { const top = STOCKS.slice().sort((a, b) => assets[b.id].lastDayChg - assets[a.id].lastDayChg)[0];
    noteBuy(openPosition(top.id, CHASE_AMOUNT_UP, assets[top.id].lastDayChg >= CHASE_HOT_PCT ? CHASE_HOT_LEV : 1, 1, true)); } });
defUpgrade('antArmy', { ap: 2 });
defUpgrade('stopLoss', { desc: `−${pct(STOP_LOSS_PCT_UP)} 손실에 닿으면 자동 매도.`, play: p => { p.stopLoss = STOP_LOSS_PCT_UP; } });
defUpgrade('takeProfit', { desc: `+${pct(TAKE_PROFIT_PCT_UP)} 수익에 닿으면 자동 매도.`, play: p => { p.takeProfit = TAKE_PROFIT_PCT_UP; } });
defUpgrade('trailing', { ap: 0 });
defUpgrade('cutLoss', { desc: `손실 중인 포지션을 즉시 매도, 손실의 ${pct(CUT_LOSS_REFUND_UP)}를 멘탈 보상금으로.`,
  play: p => { noteManualSell([p]); const pnl = closePosition(p, 0); run.cash += -pnl * CUT_LOSS_REFUND_UP; emit('sold', {pos: p, pnl}); } });
defUpgrade('takeWin', { desc: `수익 중인 포지션을 즉시 매도, 수익의 ${pct(TAKE_PROFIT_BONUS_UP)}를 보너스로.`,
  play: p => { noteManualSell([p]); const pnl = closePosition(p, 0); run.cash += pnl * TAKE_PROFIT_BONUS_UP; emit('sold', {pos: p, pnl}); } });
defUpgrade('escape', { desc: `매도 가능한 모든 포지션을 시장가 청산하고 카드 ${ESCAPE_DRAW_UP}장을 뽑는다.`,
  play: () => { const r = closeAllSellable(); if(r.count > 0) emit('soldAll', r); drawCards(ESCAPE_DRAW_UP); } });
defUpgrade('splitSell', { desc: `포지션 1/3 매도 + ${SPLIT_SELL_DRAW_UP}장 드로우.`,
  play: p => { const pnl = closePart(p, SPLIT_SELL_RATIO); emit('sold', {pos: p, pnl, partial: true}); drawCards(SPLIT_SELL_DRAW_UP); } });
defUpgrade('topSpotter', { ap: 1 });
defUpgrade('hodl', { ap: 0 });
defUpgrade('diamond', { desc: `이번 주 매도·예약주문 불가. 주말 결산 때 평가이익의 ${pct(DIAMOND_BONUS_UP)} 보너스.`,
  play: p => { p.diamond = DIAMOND_BONUS_UP; p.stopLoss = false; p.takeProfit = false; p.trailing = false; } });
defUpgrade('forcedLong', { desc: `손실 중인 포지션 원금의 ${pct(FORCED_DIVIDEND_UP)}를 배당금으로. 물린 게 아니라 배당주다.`,
  play: p => { run.cash += p.principal * FORCED_DIVIDEND_UP; } });
defUpgrade('dividend', { desc: `보유 포지션 1개당 ₩${DIVIDEND_PER_POS_UP}만을 받는다 (최대 ${DIVIDEND_MAX_POS}개).`,
  play: () => { run.cash += Math.min(run.positions.length, DIVIDEND_MAX_POS) * DIVIDEND_PER_POS_UP; } });
defUpgrade('forgotPw', { ap: 0 });
defUpgrade('hodlWins', { desc: `손실 중인 모든 포지션의 평가손실 ${pct(HODL_RECOVER_UP)} 회복(평단 조정).`,
  play: () => { run.positions.filter(isLosing).forEach(p => { const e = exposure(p); p.entryExposure = e - (e - p.entryExposure) * (1 - HODL_RECOVER_UP); }); } });
defUpgrade('compound', { desc: `수익 포지션의 평가이익 ${pct(COMPOUND_RATIO_UP)}만큼 원금 증가. 포지션 유지, 대출↓.`,
  play: p => { p.principal += posPnl(p) * COMPOUND_RATIO_UP; } });
defUpgrade('valueGod', { desc: `이번 주 장 마감마다 ${VALUE_GOD_DAYS}일 이상 보유한 롱 원금의 ${(VALUE_GOD_PCT_UP * 100).toFixed(1)}% 지급. 소멸.`,
  play: () => { run.week.valueGod = VALUE_GOD_PCT_UP; } });
defUpgrade('pump', { desc: `오늘 작전: ${pct(PUMP_UP_CHANCE_UP)} 급등(+${pct(PUMP_UP_PCT)}) / ${pct(1 - PUMP_UP_CHANCE_UP)} 설거지(−${pct(PUMP_DOWN_PCT)}). 개장 때 공개. 금감원 +${FSS_GAIN.pump}.`,
  play: s => { run.pumps[s.id] = rand() < pumpChanceFor(CARD_BY_ID['pump+']) ? 1 : -1; } });
['dove', 'hawk', 'ceoTweet'].forEach(id => defUpgrade(id, { desc: `개장 판정: ${marketOddsText(id + '+')}. 금감원 +${FSS_GAIN[id]}.`,
  valid: () => run.marketCard !== id + '+', play: () => { run.marketCard = id + '+'; } }));
defUpgrade('indicators', { desc: `카드 ${INDICATOR_DRAW_UP}장 + 오늘 시그널 적중률 +${pct(SIGNAL_INDICATOR_BONUS)}p(다시 판독). 지표 42개가 전부 다른 말을 한다.`,
  play: () => { drawCards(INDICATOR_DRAW_UP); STOCKS.filter(hasRegime).forEach(s => { const sg = run.signals[s.id]; if(sg && !sg.revealed) rollSignal(s.id, Math.min(1, sg.acc + SIGNAL_INDICATOR_BONUS)); }); } });
defUpgrade('analyst', { ap: 0 });
defUpgrade('coffee', { desc: `행동력 +${COFFEE_AP_UP}.`, play: () => { run.ap += COFFEE_AP_UP; } });
defUpgrade('rotation', { desc: `보유 섹터 수만큼 드로우 (최대 ${ROTATION_MAX_DRAW_UP}). ${ROTATION_AP_SECTORS}개 이상이면 행동력 +${ROTATION_AP_UP}.`,
  play: () => { const n = heldSectorCount(); drawCards(Math.min(n, ROTATION_MAX_DRAW_UP)); if(n >= ROTATION_AP_SECTORS) run.ap += ROTATION_AP_UP; } });
defUpgrade('manip', { desc: `오늘 이 종목 확정 +${pct(MANIP_PCT)}. 내일 개장 ${Math.round(MANIP_GAP * 100)}% 갭. 금감원 +${FSS_GAIN_UP.manip}. 소멸.` });
defUpgrade('marginTopup', { desc: `현금 ₩${MARGIN_TOPUP_UP}만을 넣어 대출을 갚고 증거금률을 높인다.`,
  valid: p => isMarginable(p) && run.cash >= MARGIN_TOPUP_UP, play: p => { run.cash -= MARGIN_TOPUP_UP; p.principal += MARGIN_TOPUP_UP; } });
defUpgrade('cashOut', { desc: `포지션의 절반을 매도해 현금을 확보하고 카드 ${CASHOUT_DRAW_UP}장을 뽑는다.`, play: p => { closeHalf(p); drawCards(CASHOUT_DRAW_UP); } });
defUpgrade('hedge', { desc: `보유 롱 노출액의 ${pct(HEDGE_RATIO_UP)}만큼 지수 인버스를 1x 매수(현금 사용).`,
  valid: () => hedgeAmount(HEDGE_RATIO_UP) >= 1, play: () => { noteBuy(openPosition(HEDGE_STOCK, hedgeAmount(HEDGE_RATIO_UP), 1, 1, true)); inverseMasterDraw(HEDGE_STOCK); } });
defUpgrade('interestFree', { desc: `오늘 신용·대차 이자 면제. 카드 ${INTEREST_FREE_DRAW_UP}장을 뽑는다.`, play: () => { run.interestFree = true; drawCards(INTEREST_FREE_DRAW_UP); } });
defUpgrade('overdraft', { desc: `현금 +₩${OVERDRAFT_AMOUNT_UP.toLocaleString()}만. 갚지 않는 영구 대출이라 매일 이자가 붙는다.`,
  play: () => { run.cash += OVERDRAFT_AMOUNT_UP; run.overdraft += OVERDRAFT_AMOUNT_UP; } });
defUpgrade('confess', { desc: `금감원 감시 게이지 −${FSS_CONFESS_CUT_UP}. "반성문 제출했습니다." 소멸.`, play: () => { run.fss = Math.max(0, run.fss - FSS_CONFESS_CUT_UP); } });
defUpgrade('savings', { desc: `현금 +₩${SAVINGS_AMOUNT_UP}만.`, play: () => { run.cash += SAVINGS_AMOUNT_UP; } });
defUpgrade('delever', { ap: 0 });
defUpgrade('lossGuard', { desc: `오늘 반대매매 손실의 ${pct(LOSS_GUARD_REFUND_UP)} 환급. ※ 실제로는 불법입니다.`, play: () => { run.lossGuardToday = LOSS_GUARD_REFUND_UP; } });
defUpgrade('circuit', { desc: `오늘 순자산 −${pct(CIRCUIT_DROP_UP)}(개장 대비)면 즉시 장 마감. 반대매매 면제. 소멸.`,
  play: () => { run.circuitToday = CIRCUIT_DROP_UP; run.allProtectedToday = true; } });
['levEtf', 'reinvest', 'allIn', 'relist'].forEach(id => defUpgrade(id, { ap: 0 }));
defUpgrade('split', { desc: `포지션 하나를 똑같은 ${SPLIT_WAYS_UP}개 포지션으로 나눈다 (합계 그대로).`, play: p => { splitPosition(p, SPLIT_WAYS_UP); } });
defUpgrade('timeLoop', { ap: 1 });
defUpgrade('futures', { desc: `이번 주 장 마감 정산 ×${FUTURES_MULT_UP}, 다음 주 정산 ×${FUTURES_NEXT}.`,
  valid: () => run.week.futures < FUTURES_MULT_UP, play: () => { run.week.futures = FUTURES_MULT_UP * run.week.futures; run.futuresNext = FUTURES_NEXT; } });
defUpgrade('coinFlip', { desc: `${pct(COIN_FLIP_CHANCE_UP)}: 이 포지션 오늘 정산 ×${COIN_FLIP_MULT} / ${pct(1 - COIN_FLIP_CHANCE_UP)}: 포지션 가치 0 (원금 증발).`,
  play: p => coinFlip(p, COIN_FLIP_CHANCE_UP) });

/* ── 카드 사용 ── */
function resolveTarget(card, targetId){
  if(card.target === 'position') return run.positions.find(p => p.id === targetId) || null;
  if(card.target === 'asset') return STOCK_BY_ID[targetId] || null;
  return null;
}

/* 이 카드를 지금 쓰는 데 드는 행동력 (이번 주 효과 반영) */
/* 표시용 카드 설명 — 유물로 확률이 바뀌는 카드는 지금 실제 값으로 (리딩방 VIP) */
function cardDesc(card){
  if(card.id === 'pump' && run && pumpUpChance() !== PUMP_UP_CHANCE)   // (강화판 pump+는 자기 desc가 이미 강화 확률)
    return `오늘 작전: ${pct(pumpUpChance())} 급등(+${pct(PUMP_UP_PCT)}) / ${pct(1 - pumpUpChance())} 설거지(−${pct(PUMP_DOWN_PCT)}). 개장 때 공개. 금감원 +${FSS_GAIN.pump}.`;
  return card.desc;
}

function cardCost(card){
  if(card.type === 'stock' && run.week.antArmy) return 0;
  if(card.type === 'stock' && hasRelic('cult') && card.stock === cultStock()) return 0;   // 🙏 풀매수 교주: 믿는 종목은 행동력 0
  if(run.week.topSpotter && (card.base === 'takeProfit' || card.base === 'trailing')) return 0;
  if(card.type === 'sell' && hasRelic('daytrader') && !run.sellDiscountUsed) return Math.max(0, card.ap - RELIC_DAYTRADER_CUT);
  return card.ap;
}

/* 사용 불가 이유 코드 (null = 사용 가능). opts.amount = 종목 카드 매수 금액 (없으면 기본값) */
function checkPlay(handIdx, targetId, opts){
  run && (run.buyAmount = opts && opts.amount ? opts.amount : 0);
  const r = checkPlayInner(handIdx, targetId);
  if(run) run.buyAmount = 0;
  return r;
}
function checkPlayInner(handIdx, targetId){
  if(!run || run.phase !== 'premarket') return 'phase';
  const inst = run.hand[handIdx];
  if(!inst) return 'none';
  const card = CARD_BY_ID[inst.id];
  if(card.type === 'status') return 'unplayable';
  if(!cardOpen(inst.id)) return 'sysLocked';   // 온보딩: 아직 잠긴 시스템
  if(run.buyBanToday && FSS_BAN_TYPES.indexOf(card.type) >= 0) return 'banned';
  if(run.ap < cardCost(card)) return 'ap';
  const t = resolveTarget(card, targetId);
  if(card.target && !t) return 'target';
  if(card.type === 'stock' && run.buyAmount && run.buyAmount < STOCK_BUY_MIN) return 'amount';
  if(bossBlocks(card, t)) return 'boss';   // 보스 주간 제한 (공매도 금지·거래정지)
  if(cultBlocks(card)) return 'relicRule';   // 🙏 풀매수 교주: 한 종목만
  if(!card.valid(t)) return 'invalid';
  return null;
}

/* 🙏 풀매수 교주: 포지션이 있으면 그 종목(전부 같은 종목일 때)만 살 수 있다. 다른 종목을 살 수 있는 카드는 막는다 */
const cultStock = () => run.positions.length && run.positions.every(p => p.assetId === run.positions[0].assetId) ? run.positions[0].assetId : '';
function cultBlocks(card){
  if(!hasRelic('cult') || !run.positions.length) return false;
  if(card.stock) return card.stock !== cultStock();
  return CULT_BLOCKED_CARDS.indexOf(card.base) >= 0;
}

/* 보스가 막는 카드: 공매도 금지 = 숏을 여는 카드(공매도·숏 재상장·숏 대기 중인 종목 카드), 거래정지 = 그 종목·포지션을 다루는 카드 */
function bossBlocks(card, t){
  if(bossMod('noShort', false)){
    if(card.base === 'short') return true;
    if(card.base === 'relist' && run.liquidated.length && run.liquidated[run.liquidated.length - 1].dir < 0) return true;
    if(card.stock && run.pending.dir < 0) return true;
  }
  if(bossBlockKind(card, t)) return true;
  if(run.haltStock){
    if(card.stock === run.haltStock) return true;
    if(t && card.target === 'asset' && t.id === run.haltStock) return true;
    if(t && card.target === 'position' && t.assetId === run.haltStock) return true;
  }
  return false;
}

/* 빌드 카운터가 막는 카드 → 'posCap' | 'levCap' | '' (UI 사유 툴팁도 이것을 읽는다) */
function bossBlockKind(card, t){
  const base = card.base || card.id;
  if(bossMod('positionCap', 0)){
    if(card.stock && overPositionCap(card.stock, run.pending.lev, run.pending.dir)) return 'posCap';
    if(base === 'hedge' && overPositionCap(HEDGE_STOCK, 1, 1)) return 'posCap';
    if(base === 'split' && overPositionCap('', 1, 1, (card.id === 'split' ? SPLIT_WAYS : SPLIT_WAYS_UP) - 1)) return 'posCap';
    if(POSITION_CAP_CARDS.indexOf(base) >= 0 && overPositionCap('', 1, 1)) return 'posCap';   // 무작위·되살리기 종목 = 새 포지션으로 본다
  }
  if(bossMod('levCap', 0) && base === 'levEtf' && t && t.lev * LEV_ETF_MULT > bossMod('levCap', 0)) return 'levCap';
  return '';
}
const POSITION_CAP_CARDS = ['ipo', 'chaseLimit', 'relist'];

function validTargetIds(handIdx){
  const inst = run.hand[handIdx];
  if(!inst) return [];
  const card = CARD_BY_ID[inst.id];
  if(card.target === 'position') return run.positions.filter(p => checkPlay(handIdx, p.id) === null).map(p => p.id);
  if(card.target === 'asset') return STOCKS.filter(s => checkPlay(handIdx, s.id) === null).map(s => s.id);
  return [];
}

function playCard(handIdx, targetId, opts){
  const reason = checkPlay(handIdx, targetId, opts);
  if(reason){ emit('cardRejected', {reason}); return false; }
  run.buyAmount = opts && opts.amount ? opts.amount : 0;   // 종목 카드: 입력한 금액 (play가 stockCost로 읽는다)
  const inst = run.hand[handIdx];
  const card = CARD_BY_ID[inst.id];
  const t = resolveTarget(card, targetId);
  run.ap -= cardCost(card);
  if(card.type === 'sell' && hasRelic('daytrader') && !run.sellDiscountUsed && cardCost(card) < card.ap) emit('relicTriggered', {id: 'daytrader', amount: card.ap - cardCost(card)});   // 연출용
  if(card.type === 'sell') run.sellDiscountUsed = true;   // 단타의 신: 하루 첫 매도 카드만
  run.hand.splice(handIdx, 1);
  if(card.exhaust) run.exhausted.push(inst); else run.discard.push(inst);
  card.play(t);
  if(card.type === 'stock' && run.week.antArmy) drawCards(ANT_ARMY_DRAW);   // 개미 군단 총공격
  run.buyAmount = 0;
  emit('cardPlayed', {card});
  const fssGain = card.upgraded && FSS_GAIN_UP[card.base] !== undefined ? FSS_GAIN_UP[card.base] : FSS_GAIN[card.base];
  if(fssGain) raiseFss(fssGain);
  checkBankruptcy();
  return true;
}

/* ── 더미: 뽑을 카드 / 버린 카드 / 소멸 ── */
function newCard(id){ return { uid: run.nextUid++, id }; }

/* 주 시작 (덱 순환 D6 · 슬레이 더 스파이어식): 드로우 더미는 순서 그대로 이어 간다.
   masterDeck과 맞춰 정리만 한다 — 남은 드로우 더미 중 덱에 있는 카드는 유지, 나머지(버린·소멸·손패·새로 얻은 카드)는 버린 더미로,
   덱에 없는 카드(트라우마·제거·강화 전 원본)는 사라진다. 드로우 더미가 비면 버린 더미를 섞는다 (첫 주 포함) */
function buildWeekPiles(){
  const want = run.masterDeck.slice();
  const take = id => { const i = want.indexOf(id); if(i < 0) return false; want.splice(i, 1); return true; };
  run.drawPile = run.drawPile.filter(c => take(c.id));
  run.discard = want.map(newCard);
  run.exhausted = [];
  run.hand = [];
  if(run.drawPile.length === 0){ run.drawPile = shuffle(run.discard); run.discard = []; }
}

function drawCards(n){
  let drawn = 0;
  for(let i = 0; i < n; i++){
    if(run.hand.length >= HAND_MAX) break;
    if(run.drawPile.length === 0){
      if(run.discard.length === 0) break;
      run.drawPile = shuffle(run.discard);
      run.discard = [];
      emit('reshuffle');
    }
    run.hand.push(run.drawPile.pop());
    drawn++;
  }
  return drawn;
}

/* ── 한 판 / 하루(장전 → 장중 → 장 마감) / 한 주 ── */
/* (N3) 섹터 레벨 — 상태 run.sectorLevel, 효과는 settleSteps 맨 앞(sectorBonus), 보상 가중은 tagWeight(topSectors) */
function newSectorLevels(){ const lv = {}; SECTORS.forEach(x => { lv[x.name] = 1; }); return lv; }
const sectorLevel = sec => (run && run.sectorLevel && run.sectorLevel[sec]) || 1;
function raiseSectorLevel(sec, n){
  run.sectorLevel[sec] = sectorLevel(sec) + n;
  emit('sectorLevelUp', {sector: sec, level: run.sectorLevel[sec]});
}
/* 포지션 p의 섹터 레벨 보너스 (순수): 레벨 2 이상이면 { chip, mult, label, level }, 아니면 null */
function sectorBonus(p){
  const sec = STOCK_BY_ID[p.assetId].sector, lv = sectorLevel(sec);
  if(!SECTOR_LEVELS_ON || lv <= 1) return null;
  return { chip: p.principal * SECTOR_LEVEL_CHIP_PCT * (lv - 1), mult: SECTOR_LEVEL_MULT * (lv - 1), level: lv,
           label: `📊 ${sec} Lv.${lv}` };
}
/* 보상 가중을 받는 섹터: 레벨이 가장 높은 섹터들 (최고 레벨 2 이상일 때만, 동률이면 전부) */
function topSectors(){
  if(!run || !SECTOR_LEVELS_ON) return [];
  const best = Math.max(...SECTORS.map(x => sectorLevel(x.name)));
  return best > 1 ? SECTORS.filter(x => sectorLevel(x.name) === best).map(x => x.name) : [];
}

function newRun(){
  return {
    phase: 'premarket',          // premarket | market | reward | shop | over
    round: 1, day: 1, tickInDay: 0,
    cash: START_CASH, realized: 0, interestPaid: 0, overdraft: 0,
    slush: SLUSH_START,   // 비자금 (암시장 전용, 순자산 제외)
    sectorLevel: newSectorLevels(),   // (N3) 섹터 이름 → 레벨 (1부터)
    liquidations: 0, peakEquity: START_CASH, weekPeak: START_CASH,   // 판 최고 · 이번 주 최고 순자산
    settledToday: 0, settledTotal: 0, lastDay: null, weekDays: [],   // 장 마감 정산: 오늘 보너스 · 누적 · 오늘 기록 · 이번 주 기록 (주간 체인용)
    maxSettleMult: 1, maxSettlePayout: 0,                               // 이번 판 최고 정산 배수 · 하루 최고 보너스
    buys: 0, finesPaid: 0, tipNet: 0,   // 누적: 카드로 매수한 횟수 · 금감원 과징금 · 찌라시 순자산 변화 (엔딩 판정용)
    weekStart: { equity: START_CASH, realized: 0, liquidations: 0, interestPaid: 0, buys: 0, finesPaid: 0, tipNet: 0 },   // 주간 결산 비교 기준
    lastLiquidation: { lev: 0, dir: 0, round: 0, day: 0 },   // 파산 원인 판정용
    misuDefault: false,   // 반대매매 미수를 현금으로 못 갚음 → 파산
    weeksCleared: 0, lastWeek: null, endCause: '',
    positions: [], nextPosId: 1, nextUid: 1,
    unlockBase: 1, heldCards: [],
    scalpSells: 0,   // ⚡ 단타 중독: 오늘 수익 매도 정산 횟수 (startDay에서 0)   // 온보딩: 판 시작 때 이미 도달해 본 최고 주차 · 해금 전까지 빼 둔 시작 카드
    masterDeck: STARTER_DECK.slice(), drawPile: [], hand: [], discard: [], exhausted: [],
    ap: AP_PER_DAY,
    pending: { lev: 1, dir: 1, principalMult: 1 },
    // 오늘만 유효한 효과 (startDay에서 초기화)
    forcedState: '', pumps: {}, noSellToday: false, allProtectedToday: false, interestFree: false,
    week: { antArmy: false, topSpotter: false, valueGod: false, sanctioned: false, futures: 1, cultAdds: 0, growthTarget: 0 },   // 이번 주 효과 (startNextRound에서 초기화)
    futuresNext: 1, timeLoopToday: 0, liqToday: 0, liquidated: [],   // 선물 만기일 다음 주 배수 · 타임 루프 · 오늘 반대매매 수 · 반대매매 기록(재상장)
    buyAmount: 0,                            // 종목 카드 입력 금액 (playCard 안에서만, 평소 0)
    lossGuardToday: false, shortFeeFreeToday: false, sellDiscountUsed: false, dayRoll: 0, circuitToday: false, circuitTripped: false, marketOpenEquity: 0,
    gapToday: [], gapNext: [],               // 작전 세력: 오늘 건 갭 → 다음 날 개장 때 적용
    marketCard: '', cardMarket: false,       // 오늘 쓴 시장 카드 (장이 열릴 때 판정) / 오늘 장세가 카드로 만들어졌는지
    revertDir: 0, revertTicksLeft: 0,        // 카드 장세 다음 날 되돌림 (지수 방향 ±1, 남은 틱)
    fss: 0, fssSanctions: 0, fssFines: 0, fssPeak: 0, buyBanNext: false, buyBanToday: false,   // 금감원 감시 게이지 · 제재
    pendingTip: null, tipsToday: 0, ticksSinceTip: 0, lastTipId: '', tipLog: [],
    eventTicksLeft: 0, ticksSinceEvent: 0,
    signals: {}, signalResults: {},          // 오늘 시그널 {shown, acc, revealed} / 어제 시그널 채점 {shown, actual, acc, hit}
    newsToday: '', newsTomorrow: '', newsActive: false, newsResolved: false,   // 뉴스: 오늘(개장에 판정) / 내일 예고
    rewardChoices: [], endReason: '', endEquity: 0,
    relics: [], relicChoices: [], rewardStep: '',
    relicState: {},                          // 성장형 유물 { id: {stacks, best} }
    combo: { up: 0, down: 0 }, comboPnl: {}, // 장중 콤보 (updateCombo) · 직전 틱 포지션별 평가손익
    shop: { singles: [], singlesBought: [], removed: 0, relics: [] },
    bossPlan: {}, boss: '', haltStock: '', bossesBeaten: [], endBoss: '', taxPaid: 0   // 보스 주간 (S9): 주차 → 보스 id · 이번 주 보스 · 거래정지 종목 · 통과한 보스 · 파산·미달 때 보스 · 거래세 누적
  };
}

function startNewRun(opts){
  eventLog.length = 0;
  marketState = 'NORMAL';
  marketPrice = 1000;
  initChartData();
  initAssets();
  initDayCharts();
  run = newRun();
  run.unlockBase = Math.max(1, (opts && opts.unlockWeek) || 1);
  run.targetGrowth = TARGET_GROWTH_ON || !!(opts && opts.targetGrowth);   // 목표 성장률 (실험)
  if(ONBOARDING_ON){   // 시작 덱의 잠긴 카드는 빼 두고 대체 카드로 (해금되는 주에 덱으로)
    run.masterDeck = run.masterDeck.map(id => { if(cardOpen(id)) return id; run.heldCards.push(id); return ONBOARDING_STARTER_SUBS[id] || ''; }).filter(Boolean);
  }
  run.bossPlan = rollBossPlan();   // 보스 일정 (1주차는 보스 없음)
  initRegimes();
  run.newsTomorrow = pickNews();
  buildWeekPiles();
  startDay();
}

function startDay(){
  run.phase = 'premarket';
  run.tickInDay = 0;
  run.ap = maxAp();
  run.forcedState = '';
  run.marketCard = '';
  run.cardMarket = false;
  run.lossGuardToday = false;
  run.shortFeeFreeToday = false;
  run.sellDiscountUsed = false;
  run.timeLoopToday = 0;
  run.liqToday = 0;
  run.scalpSells = 0;
  run.dayRoll = rand();                    // 오늘 시장 카드 판정용 난수 (타임머신이면 장전에 결과를 보여준다)
  if(run.day === 1 && relicStacks('compoundMonster') > 0){   // 복리 괴물
    const pay = Math.max(0, netEquity()) * COMPOUND_CASH_PER_STACK * relicStacks('compoundMonster');
    run.cash += pay;
    emit('relicTriggered', {id: 'compoundMonster', amount: pay, big: true});
  }
  if(run.day === 1 && hasRelic('payday')){ const pay = RELIC_PAYDAY_BASE * run.round; run.cash += pay; emit('relicTriggered', {id: 'payday', amount: pay}); }
  run.circuitToday = false;
  run.circuitTripped = false;
  run.buyBanToday = run.buyBanNext;
  run.buyBanNext = false;
  run.pumps = {};
  run.noSellToday = false;
  run.allProtectedToday = false;
  run.interestFree = false;
  run.tipsToday = 0;
  run.positions.forEach(p => { p.protectedToday = false; });
  run.newsToday = run.newsTomorrow;   // 어제 예고한 뉴스 → 오늘 (개장 때 사실·루머 판정)
  run.newsTomorrow = '';
  run.newsActive = false;
  run.newsResolved = false;
  rollSignals();
  drawCards(DRAW_PER_DAY);
  emit('dayStart', {round: run.round, day: run.day, buyBan: run.buyBanToday});
}

function startMarket(){
  if(!run || run.phase !== 'premarket') return false;
  run.phase = 'market';
  run.tickInDay = 0;
  let outcome = '';
  if(run.marketCard){
    outcome = rollMarketCard(run.marketCard);   // NORMAL = 시장이 무시 → 평소처럼 (랜덤 이벤트 가능)
    if(outcome !== 'NORMAL'){ run.forcedState = outcome; run.cardMarket = true; }
  }
  const bubbleUp = bossMod('bubbleUpDays', 0);   // 버블의 정점 (보스): 카드로 정한 장세가 없으면 앞 며칠 강세장 → 남은 날 약세장
  if(bubbleUp && !run.forcedState) run.forcedState = run.day <= bubbleUp ? 'BULL' : 'BEAR';
  const crash = bossMod('crashDay', 0) === run.day;   // 블랙 먼데이 (보스): 그날은 약세장 + 개장 폭락
  if(crash && !run.forcedState) run.forcedState = 'BEAR';
  run.marketOpenEquity = netEquity();
  if(run.newsToday){   // 뉴스 판정: 확정은 항상, 루머는 NEWS_RUMOR_CHANCE
    const n = NEWS_BY_ID[run.newsToday];
    run.newsActive = n.reliability === 'confirmed' || rand() < NEWS_RUMOR_CHANCE;
    run.newsResolved = true;
    emit('newsResolved', {id: n.id, active: run.newsActive});
  }
  openDayCharts();
  const gaps = run.gapNext;                         // 작전 세력 이탈: 개장 직후 갭
  run.gapNext = [];
  gaps.forEach(g => { shockStock(g.stockId, g.pct); emit('gapOpen', {stockId: g.stockId, pct: g.pct}); });
  if(crash){
    const pct = bossMod('crashPct', 0);
    STOCKS.filter(s => !bossHalt(s.id)).forEach(s => shockStock(s.id, s.beta > 0 ? -pct : pct));   // 인버스는 반대로
    emit('bossCrash', {id: run.boss, pct});
  }
  applyPriceLimits();
  if(run.forcedState){
    marketState = run.forcedState;
    run.eventTicksLeft = 0;
  }
  const pumps = STOCKS.filter(s => run.pumps[s.id]).map(s => ({ name: s.name, dir: run.pumps[s.id] }));
  emit('marketOpen', {forcedState: run.forcedState, marketCard: run.marketCard, outcome, pumps, reverting: run.revertTicksLeft > 0});
  return true;
}

function rollMarketCard(cardId){   // 오늘의 난수(run.dayRoll)로 판정 → 장전에 미리 알 수 있다 (타임머신)
  const odds = MARKET_CARD_ODDS[cardId];
  let roll = run.dayRoll;
  for(let i = 0; i < odds.length; i++){
    roll -= odds[i].chance;
    if(roll < 0) return odds[i].state;
  }
  return odds[odds.length - 1].state;
}


/* ══ 읽을 수 있는 시장: 종목 추세(regime) · 시그널 · 다음 날 뉴스 · 기대값 ══
   보여주는 확률은 전부 여기서 실제로 쓰는 값이다 (SIGNAL_ACCURACY·NEWS_RUMOR_CHANCE·REGIME_*). */
function pickWeighted(list){   // [{state, chance}] 중 하나 (chance 합 1)
  let roll = rand();
  for(let i = 0; i < list.length; i++){
    roll -= list[i].chance;
    if(roll < 0) return list[i].state;
  }
  return list[list.length - 1].state;
}
const hasRegime = s => s.beta > 0;   // 인버스는 추세 없음 (지수를 따른다)
function initRegimes(){
  STOCKS.forEach(s => {
    const a = assets[s.id];
    a.regime = hasRegime(s) ? pickWeighted(REGIME_START) : '';
    a.regimeDays = a.regime ? 1 : 0;
  });
}
/* 장 마감: 전이 행렬로 내일 추세. UP이 REGIME_UP_LONG_DAYS일 이상이면 UP_LONG 행(과열 확률 ↑) */
/* 내일 추세 전이표 (순수): 세력 매집이 포착된 종목은 UP 확률 +ACCUM_UP_BONUS, 나머지는 비율대로 줄인다 */
function transitionRow(a){
  const row = REGIME_TRANSITION[a.regime === 'UP' && a.regimeDays >= REGIME_UP_LONG_DAYS ? 'UP_LONG' : a.regime];
  if(!a.accumBonus) return row;
  const up = row.find(o => o.state === 'UP'), baseUp = up ? up.chance : 0;
  const newUp = Math.min(1, baseUp + a.accumBonus), scale = baseUp < 1 ? (1 - newUp) / (1 - baseUp) : 0;
  const out = row.filter(o => o.state !== 'UP').map(o => ({ state: o.state, chance: o.chance * scale }));
  out.unshift({ state: 'UP', chance: newUp });
  return out;
}
/* 화면에 보이는 '내일 매수세 전환 확률' = 판정에 쓰는 값 그대로 (순수) */
function accumUpChance(stockId){
  const a = assets[stockId], saved = a.accumBonus;
  a.accumBonus = ACCUM_UP_BONUS;
  const p = transitionRow(a).find(o => o.state === 'UP').chance;
  a.accumBonus = saved;
  return p;
}
/* 장중: 방금 캔들에 긴 아래꼬리(≥ 몸통 × ACCUM_TAIL_RATIO) + 추세 UP·FLAT → ACCUM_TRIGGER_CHANCE로 '세력 매집 포착' 찌라시.
   찌라시가 뜨면 그 종목은 내일 UP 전이 보너스 (고르는 선택지와 무관 — 신호는 사실이어야 한다) */
function maybeAccumTip(){
  if(run.pendingTip || run.tipsToday >= TIP_MAX_PER_DAY || tipChance() <= 0) return false;   // 찌라시를 꺼 두면(tipChance 0) 매집 찌라시도 없음
  const s = STOCKS.find(x => {
    const a = assets[x.id], c = a.candles[a.candles.length - 1];
    if(!c || ACCUM_REGIMES.indexOf(a.regime) < 0 || a.accumBonus) return false;
    const body = Math.abs(c.close - c.open), tail = Math.min(c.open, c.close) - c.low;
    return body > 0 && tail >= body * ACCUM_TAIL_RATIO;
  });
  if(!s || rand() >= ACCUM_TRIGGER_CHANCE) return false;
  assets[s.id].accumBonus = ACCUM_UP_BONUS;
  openTip('accum', s.id);
  return true;
}
function nextRegimes(){
  STOCKS.forEach(s => {
    const a = assets[s.id];
    if(!a.regime) return;
    const next = pickWeighted(transitionRow(a));
    a.accumBonus = 0;
    a.regimeDays = next === a.regime ? a.regimeDays + 1 : 1;
    a.regime = next;
  });
  if(hasRelic('contrarian'))   // 🐜 인간 역지표: 롱으로 가진 종목은 무조건 매도세 (전이 난수는 그대로 굴린 뒤 덮어쓴다)
    run.positions.forEach(p => { const a = assets[p.assetId]; if(p.dir > 0 && a.regime){ a.regimeDays = a.regime === 'DOWN' ? a.regimeDays : 1; a.regime = 'DOWN'; } });
}
/* 시그널 한 개: acc 확률로 실제 추세, 아니면 나머지 셋 중 하나(균등). 그날 고정 (run.signals) */
function rollSignal(stockId, acc){
  const actual = assets[stockId].regime;
  let shown = actual;
  if(rand() >= acc){
    const others = REGIMES.filter(r => r !== actual);
    shown = others[randInt(others.length)];
  }
  run.signals[stockId] = { shown, acc, revealed: acc >= 1 };
}
function rollSignals(){ const acc = SIGNAL_ACCURACY + bossMod('signalAccAdd', 0); STOCKS.filter(hasRegime).forEach(s => rollSignal(s.id, acc)); }   // 개미 털기 (보스): 적중률 −
/* 장 마감: 오늘 시그널이 맞았는지 (시세판 ✓/✗, 시뮬레이터 적중률 실측) — 추세가 바뀌기 전에 */
function resolveSignals(){
  run.signalResults = {};
  STOCKS.filter(hasRegime).forEach(s => {
    const sg = run.signals[s.id];
    if(!sg) return;
    const actual = assets[s.id].regime;
    run.signalResults[s.id] = { shown: sg.shown, actual, acc: sg.acc, hit: sg.shown === actual };
  });
  emit('signalsResolved', {results: run.signalResults});
}

const NEWS_BY_ID = {};
NEWS_EVENTS.forEach(n => { NEWS_BY_ID[n.id] = n; });
const NEWS_NEUTRAL = { volMult: 1, drift: 0, gapMult: 1 };
function newsTargetIds(n){
  if(n.target === 'market') return STOCKS.map(s => s.id);
  const i = n.target.indexOf(':'), kind = n.target.slice(0, i), v = n.target.slice(i + 1);
  if(kind === 'stock') return [v];
  return STOCKS.filter(s => s.sector === v).map(s => s.id);
}
/* 오늘 이 종목에 걸린 뉴스 효과 (개장 판정에서 사실로 확인된 경우만) */
function newsEffectFor(stockId){
  if(!run || !run.newsToday || !run.newsActive) return NEWS_NEUTRAL;
  const n = NEWS_BY_ID[run.newsToday];
  if(newsTargetIds(n).indexOf(stockId) < 0) return NEWS_NEUTRAL;
  const drift = n.target === 'market' ? n.effect.drift * Math.sign(STOCK_BY_ID[stockId].beta) : n.effect.drift;
  return { volMult: n.effect.volMult, drift, gapMult: n.effect.gapMult };
}
const newsChance = n => n.reliability === 'confirmed' ? 1 : NEWS_RUMOR_CHANCE;   // 표시·판정 같은 값
function pickNews(){   // 같은 뉴스 연속 금지
  const cands = NEWS_EVENTS.filter(n => n.id !== run.newsToday);
  return cands[randInt(cands.length)].id;
}

/* ── 기대값 (순수 함수: rand() 없음, 상태 안 바꿈). 만원 단위 ──
   expectedValue(card, target) → { ev, rate, note } | null   (rate = 보유 노출액 대비 기대 수익률, 대상이 없으면 ev 0)
   tipExpectedValue(choiceIdx) → { ev, slush, outcomes:[{chance, delta}] } — 지금 도착한 찌라시 선택지
   근사: 시장 카드·찌라시 장세 효과는 지수 기대 드리프트의 1차 전달(beta × IDX_SENS × 장세 배수)만 본다 (갭·되돌림·유물 손익 보정 제외) */
const heldExposure = stockId => run.positions.filter(p => p.assetId === stockId).reduce((sum, p) => sum + p.dir * exposure(p), 0);
function stateIndexRet(state, ticks){   // 장세별 지수 기대 로그수익률 (generateNextCandle과 같은 식의 평균)
  const st = INDEX_STATE[state] || INDEX_STATE.NORMAL;
  return ticks * (st.drift + (0.5 - INDEX_TICK_CENTER) * INDEX_TICK_RANGE * st.vol) / marketPrice;
}
function stateImpact(state, ticks){   // 그 장세가 ticks 동안 이어질 때 보유 포지션 기대 손익
  const idx = stateIndexRet(state, ticks), move = STOCK_MOVE_MULT[state] || 1;
  return run.positions.reduce((sum, p) => sum + p.dir * exposure(p) * (Math.exp(STOCK_BY_ID[p.assetId].beta * IDX_SENS * move * idx) - 1), 0);
}
function marketCardEv(cardId){   // 지금 대기 중인 시장 카드(없으면 평상시) 대비
  const avg = odds => odds.reduce((sum, o) => sum + o.chance * stateImpact(o.state, TICKS_PER_DAY), 0);
  return avg(MARKET_CARD_ODDS[cardId]) - avg(run.marketCard ? MARKET_CARD_ODDS[run.marketCard] : [{ state: 'NORMAL', chance: 1 }]);
}
const pumpChanceFor = card => card.upgraded ? Math.max(pumpUpChance(), PUMP_UP_CHANCE_UP) : pumpUpChance();   // 리딩방 찌라시(+) 급등 확률 (판정·표시 공용)
const manipEvRate = () => (1 + MANIP_PCT) * (1 + MANIP_GAP) - 1;   // 오늘 +20% 확정 → 내일 개장 −12% (이틀 보유)
function expectedValue(card, target){
  if(card.base === 'pump' || card.base === 'manip'){
    const up = pumpChanceFor(card);
    const rate = card.base === 'pump' ? up * PUMP_UP_PCT - (1 - up) * PUMP_DOWN_PCT : manipEvRate();
    const note = card.base === 'pump'
      ? `급등 ${pct(up)} × +${pct(PUMP_UP_PCT)} − 설거지 ${pct(1 - up)} × −${pct(PUMP_DOWN_PCT)}`
      : `오늘 +${pct(MANIP_PCT)} → 내일 −${pct(MANIP_GAP)} (이틀 보유)`;
    return { ev: target ? heldExposure(target.id) * rate : 0, rate, note };
  }
  if(MARKET_CARD_ODDS[card.id]) return { ev: marketCardEv(card.id), rate: 0, note: '보유 포지션 기준 오늘 예상 영향' };
  return null;
}
function tipExpectedValue(choiceIdx){
  const tip = run.pendingTip;
  if(!tip) return null;
  const choice = TIP_BY_ID[tip.eventId].choices[choiceIdx];
  const chances = tipChances(choiceIdx, choice);
  const remain = TICKS_PER_DAY - run.tickInDay;
  let ev = 0, slush = 0;
  const outcomes = choice.outcomes.map((o, k) => {
    let cash = run.cash, delta = 0;
    const held = {};   // 종목별 방향 × 노출액 (효과 순서대로 갱신)
    const h = id => (id in held ? held[id] : (held[id] = heldExposure(id)));
    o.effects.map(ef => tipBroEffect(ef, choiceIdx, k)).forEach(ef => {
      const st = tipStockId(tip, ef.stock || '');
      if(ef.kind === 'cash'){ delta += ef.amount * tipScale(); cash += ef.amount * tipScale(); }
      else if(ef.kind === 'slush') slush += chances[k] * ef.amount;
      else if(ef.kind === 'buy'){ const amt = Math.min(ef.amount * tipScale(), Math.max(0, cash)); if(amt >= 1){ cash -= amt; held[st] = h(st) + amt; } }
      else if(ef.kind === 'shock'){ delta += h(st) * ef.pct; held[st] = h(st) * (1 + ef.pct); }
      else if(ef.kind === 'pump') delta += h(st) * (Math.exp((ef.dir > 0 ? PUMP_UP_DRIFT : PUMP_DOWN_DRIFT) * remain) - 1);
      else if(ef.kind === 'market') delta += stateImpact(ef.state, remain) - stateImpact(marketState, remain);
      else if(ef.kind === 'sellStock') held[st] = 0;
    });
    ev += chances[k] * delta;
    return { chance: chances[k], delta };
  });
  return { ev, slush, outcomes };
}

/* 금감원 감시 게이지 */
function raiseFss(gain){
  const fssMult = bossMod('fssMult', 1);   // 금감원 특별 단속 (보스)
  if(fssMult !== 1) gain = Math.round(gain * fssMult);
  const rawGain = gain;   // 연출용: 유물이 덜어준 양
  if(hasRelic('fssconnect')) gain = Math.round(gain * (1 - RELIC_FSS_CONNECT_CUT));   // 금감원 인맥
  if(gain < rawGain) emit('relicTriggered', {id: 'fssconnect', amount: rawGain - gain});
  const before = run.fss;
  run.fss = Math.min(FSS_MAX, run.fss + gain);
  run.fssPeak = Math.max(run.fssPeak, run.fss);
  emit('fssRaised', {level: run.fss, warn: before < FSS_WARN && run.fss >= FSS_WARN && run.fss < FSS_MAX});
  if(run.fss >= FSS_MAX) sanctionFss();
}
/* 자연 감소 (장 마감·새 주). 전관 변호사는 배수 */
function decayFss(amount){
  const before = run.fss;
  run.fss = Math.max(0, run.fss - amount * (hasRelic('lawyer') ? RELIC_LAWYER_DECAY_MULT : 1));
  const extra = (before - run.fss) - Math.min(before, amount);   // 연출용: 전관 변호사가 더 줄여준 양
  if(extra > 0) emit('relicTriggered', {id: 'lawyer', amount: extra});
}
function sanctionFss(){
  run.fss = 0;
  run.fssSanctions++;
  run.week.sanctioned = true;   // 금감원 VIP
  const kinds = Object.keys(FSS_SANCTION_WEIGHTS);
  const total = kinds.reduce((sum, k) => sum + FSS_SANCTION_WEIGHTS[k], 0);
  let roll = rand() * total, kind = kinds[kinds.length - 1];
  for(let i = 0; i < kinds.length; i++){
    roll -= FSS_SANCTION_WEIGHTS[kinds[i]];
    if(roll < 0){ kind = kinds[i]; break; }
  }
  if(kind === 'liquidate' && run.positions.length === 0) kind = 'fine';   // 청산할 포지션이 없으면 과징금
  if(kind === 'fine'){
    const fine = Math.round(Math.max(0, netEquity()) * FSS_FINE_PCT);
    run.cash -= fine;
    run.fssFines++;
    run.finesPaid += fine;
    emit('fssSanction', {kind, amount: fine});
  } else if(kind === 'ban'){
    run.buyBanNext = true;
    emit('fssSanction', {kind});
  } else {
    const p = run.positions.slice().sort((a, b) => exposure(b) - exposure(a))[0];   // 가장 큰 포지션
    const pnl = closePosition(p, 0);
    emit('fssSanction', {kind, pos: p, pnl});
  }
}

function updateMarketEvent(){
  if(run.forcedState) return;   // 카드로 정한 장세가 우선
  if(run.eventTicksLeft > 0){
    run.eventTicksLeft--;
    if(run.eventTicksLeft === 0){ marketState = 'NORMAL'; emit('eventEnd'); }
    return;
  }
  run.ticksSinceEvent++;
  if(run.ticksSinceEvent >= EVENT_MIN_GAP && rand() < EVENT_CHANCE){
    const ev = MARKET_EVENTS[randInt(MARKET_EVENTS.length)];
    marketState = ev.state;
    run.eventTicksLeft = EVENT_DURATION;
    run.ticksSinceEvent = 0;
    emit('event', ev);
  }
}

/* ══ 찌라시: 장중 선택 이벤트. 도착하면 resolveTip()으로 고를 때까지 시장이 멈춘다 ══ */
const TIP_BY_ID = {};
TIP_EVENTS.forEach(e => { TIP_BY_ID[e.id] = e; });
function tipChance(){ if(!sysOpen('tips')) return 0; return TIP_EVENT_CHANCE * bossMod('tipChanceMult', 1); }   // 찌라시 폭탄 (보스)
const tipScale   = () => baseTarget() / ROUND_TARGETS[0];   // 금액을 주차 목표에 비례해 키운다
const tipStockId = (tip, stock) => stock === '$pick' ? tip.stockId : stock;

function maybeTriggerTip(){
  run.ticksSinceTip++;
  if(run.pendingTip || run.tipsToday >= bossMod('tipMaxPerDay', TIP_MAX_PER_DAY) || run.ticksSinceTip < TIP_MIN_GAP_TICKS) return;
  if(rand() >= tipChance()) return;
  const cands = TIP_EVENTS.filter(e => e.id !== run.lastTipId && !e.special);   // 같은 찌라시 연속 금지 · 조건형(세력 매집)은 제외
  openTip(cands[randInt(cands.length)].id);
}

function openTip(eventId, stockId){
  const ev = TIP_BY_ID[eventId];
  const pool = STOCKS.filter(s => s.beta > 0 && !bossHalt(s.id));   // 거래정지 종목은 찌라시 대상에서 뺀다
  run.pendingTip = { eventId, stockId: stockId || (ev.pick ? pool[randInt(pool.length)].id : ''), accumUp: 0 };
  if(eventId === 'accum') run.pendingTip.accumUp = accumUpChance(run.pendingTip.stockId);
  run.tipsToday++;
  run.ticksSinceTip = 0;
  run.lastTipId = eventId;
  emit('tipEvent', {tip: run.pendingTip});
  return run.pendingTip;
}

/* 갭: 종목마다 틱당 확률로 가격이 크게 튄다. 이번 틱 캔들에 합쳐 기록(candle.gap = ±1) */
const gapRisk   = s => s.volatility + Math.abs(s.beta) * GAP_BETA_WEIGHT;
const gapChance = s => gapRisk(s) * GAP_CHANCE_PER_RISK * (GAP_STATE_MULT[marketState] || 1);
/* 이번 틱 갭 확률 (상승·하락 따로): 뉴스 gapMult는 양쪽, 과열(HOT)은 하락 쪽만 GAP_HOT_MULT배 */
function gapOdds(s){
  const base = bossHalt(s.id) ? 0 : gapChance(s) * newsEffectFor(s.id).gapMult * bossGapMult();   // 보스: 개미 털기·블랙 먼데이·버블 / 거래정지는 갭 없음
  return { up: base * GAP_UP_SHARE, down: base * (1 - GAP_UP_SHARE) * (assets[s.id].regime === 'HOT' ? GAP_HOT_MULT : 1) };
}
function rollGaps(){
  STOCKS.forEach(s => {
    const odds = gapOdds(s), total = odds.up + odds.down;
    if(rand() >= total) return;
    const size = Math.min(GAP_SIZE_MAX, gapRisk(s) * GAP_SIZE_PER_RISK * (1 + rand()));
    const dir = rand() < odds.up / total ? 1 : -1;
    const a = assets[s.id], c = a.candles[a.candles.length - 1];
    a.price *= 1 + dir * size;
    c.close = a.price;
    c.high = Math.max(c.high, a.price);
    c.low = Math.min(c.low, a.price);
    c.gap = dir;
    a.history[a.history.length - 1] = a.price;
    emit('gap', { stockId: s.id, pct: dir * size });
  });
}

/* 종목 가격 즉시 변동 (갭 캔들 하나로 기록) */
function shockStock(stockId, pct){
  const a = assets[stockId], open = a.price;
  a.price *= 1 + pct;
  const cd = { open, close: a.price, high: Math.max(open, a.price), low: Math.min(open, a.price), gap: 0 };
  a.candles.push(cd);
  a.dayCandles.push(cd);
  if(a.candles.length > MAX_CANDLES) a.candles.shift();
  a.history.push(a.price);
  if(a.history.length > ASSET_HISTORY) a.history.shift();
}

function applyTipEffect(tip, ef){
  const stockId = tipStockId(tip, ef.stock || '');
  if(ef.kind === 'cash') run.cash += ef.amount * tipScale();
  else if(ef.kind === 'slush') run.slush += ef.amount;   // 비자금은 주차 배율 없이 고정 (암시장 가격이 고정이라)
  else if(ef.kind === 'buy'){
    const amount = Math.min(ef.amount * tipScale(), Math.max(0, run.cash));   // 현금이 모자라면 있는 만큼만
    if(amount >= 1){
      const fresh = !findSamePosition(stockId, 1, 1);   // 내가 산 포지션에 합쳐지면 그대로 내 포지션
      const p = openPosition(stockId, amount, 1, 1, true);
      if(fresh) p.viaTip = true;
    }
  }
  else if(ef.kind === 'shock') shockStock(stockId, ef.pct);
  else if(ef.kind === 'pump') run.pumps[stockId] = ef.dir;
  else if(ef.kind === 'market'){
    marketState = ef.state;
    if(run.forcedState) run.forcedState = ef.state; else run.eventTicksLeft = EVENT_DURATION;
  }
  else if(ef.kind === 'sellStock') run.positions.filter(p => p.assetId === stockId && canSell(p)).forEach(p => closePosition(p, 0));
  else if(ef.kind === 'protect') run.positions.forEach(p => { p.protectedToday = true; });
}

/* 🎰 찌라시 확신범: A(0번)의 대박(첫 결과)은 효과 × TIPBRO_JACKPOT_SCALE, 쪽박(나머지)은 효과를 뒤집는다 — 새 객체를 돌려준다 (CONFIG 불변) */
const TIPBRO_FLIP_STATE = { BULL: 'BEAR', BEAR: 'BULL' };
function tipBroEffect(ef, choiceIdx, outcomeIdx){
  if(!hasRelic('tipBro') || choiceIdx !== 0) return ef;
  const e = Object.assign({}, ef);
  if(outcomeIdx === 0){ if('amount' in e && e.kind !== 'slush') e.amount *= TIPBRO_JACKPOT_SCALE; if('pct' in e) e.pct *= TIPBRO_JACKPOT_SCALE; return e; }
  if(e.kind === 'cash') e.amount = -e.amount;
  else if(e.kind === 'shock') e.pct = -e.pct;
  else if(e.kind === 'pump') e.dir = -e.dir;
  else if(e.kind === 'market' && TIPBRO_FLIP_STATE[e.state]) e.state = TIPBRO_FLIP_STATE[e.state];
  return e;
}
const tipBroFlips = (choiceIdx, outcomeIdx) => hasRelic('tipBro') && choiceIdx === 0 && outcomeIdx > 0;
/* 선택 → 확률 판정 → 효과 적용. 결과(순자산 변화 포함)를 기록하고 알린다 */
/* 결과 확률. 개미 커뮤니티: A(0번)의 대박(첫 결과) +10%p, 나머지는 비율대로 줄인다 */
const tipCollectorBonus = () => Math.min(TIPCOL_MAX_BONUS, relicStacks('tipCollector') * TIPCOL_PER_STACK);
function tipChances(choiceIdx, choice){
  const base = choice.outcomes.map(o => o.chance);
  const bonus = (hasRelic('community') ? RELIC_COMMUNITY_BONUS : 0) + tipCollectorBonus();   // 개미 커뮤니티 + 찌라시 수집가
  if(choiceIdx !== 0 || bonus <= 0 || base.length < 2) return base;
  const first = Math.min(TIP_JACKPOT_CAP, base[0] + bonus), rest = 1 - base[0];
  return base.map((c, i) => i === 0 ? first : rest > 0 ? c * (1 - first) / rest : 0);
}

function resolveTip(choiceIdx){
  const tip = run ? run.pendingTip : null;
  if(!tip) return null;
  if(hasRelic('tipBro')) choiceIdx = 0;   // 🎰 찌라시 확신범: B를 고를 수 없다
  const ev = TIP_BY_ID[tip.eventId], choice = ev.choices[choiceIdx];
  if(!choice) return null;
  const chances = tipChances(choiceIdx, choice);
  let roll = rand(), outcomeIdx = choice.outcomes.length - 1;
  for(let i = 0; i < chances.length; i++){
    roll -= chances[i];
    if(roll < 0){ outcomeIdx = i; break; }
  }
  const eq0 = netEquity(), cash0 = run.cash, slush0 = run.slush;
  choice.outcomes[outcomeIdx].effects.forEach(ef => applyTipEffect(tip, tipBroEffect(ef, choiceIdx, outcomeIdx)));
  const result = { eventId: tip.eventId, stockId: tip.stockId, choiceIdx, outcomeIdx, flipped: tipBroFlips(choiceIdx, outcomeIdx),
                   delta: netEquity() - eq0, cashDelta: run.cash - cash0, slushDelta: run.slush - slush0 };
  run.tipNet += result.delta;
  run.tipLog.unshift(result);
  if(run.tipLog.length > TIP_LOG_SIZE) run.tipLog.pop();
  run.pendingTip = null;
  emit('tipResolved', result);
  if(choiceIdx === 0) growRelic('tipCollector', 1); else resetRelic('tipCollector', 'safeTip', 0);   // 결과 판정 뒤에 쌓는다
  checkBankruptcy();
  return result;
}

function tick(){
  if(!run || run.phase !== 'market' || run.pendingTip) return;   // 찌라시 대기 중엔 시장 정지
  let revert = 0;
  if(run.revertTicksLeft > 0){ revert = run.revertDir * REVERSION_DRIFT; run.revertTicksLeft--; }   // 차익실현 매물
  updateAssetPrices(pushNewCandle(revert), run.pumps, true);
  rollGaps();   // 반대매매·예약주문은 갭 이후 가격으로 체결
  applyPriceLimits();
  updateMarketEvent();
  checkOrders();
  checkMarginCalls();
  updateCombo();
  notePeak(netEquity());
  if(checkBankruptcy()) return;
  if(run.circuitToday && !run.circuitTripped && netEquity() <= run.marketOpenEquity * (1 - run.circuitToday)){
    run.circuitTripped = true;
    emit('circuitBreak', {eq: netEquity(), open: run.marketOpenEquity});
    endOfDay();
    return;
  }
  run.tickInDay++;
  if(run.tickInDay >= TICKS_PER_DAY) endOfDay();
  else if(!maybeAccumTip()) maybeTriggerTip();
}

function endOfDay(){
  run.discard = run.discard.concat(run.hand.filter(c => !CARD_BY_ID[c.id].retain));   // 쓰지 않은 손패는 버린다 (보유 retain 카드만 남는다)
  run.hand = run.hand.filter(c => CARD_BY_ID[c.id].retain);
  settleDay();   // 장 마감 정산 (존버의 인장은 오늘 전까지 넘긴 장 마감 수로 판정)
  run.positions.forEach(p => { p.daysHeld++; });   // 존버의 인장: 장 마감을 넘긴 횟수
  resetStreaks();   // 기록 리셋 (보스)
  const interest = dailyInterest();
  run.cash -= interest;
  run.interestPaid += interest;
  growRelic('diamondTree', run.positions.filter(p => p.daysHeld >= DTREE_DAYS).length);   // 존버 나무 (오늘 이자 계산 뒤)
  if(run.cardMarket && (run.forcedState === 'BULL' || run.forcedState === 'BEAR')){   // 카드로 만든 방향 장세 → 내일 개장 초반 되돌림
    run.revertDir = run.forcedState === 'BULL' ? -1 : 1;
    run.revertTicksLeft = REVERSION_TICKS;
  }
  if(run.forcedState){ marketState = 'NORMAL'; emit('eventEnd'); }
  closeDayCharts();
  STOCKS.forEach(s => { const a = assets[s.id]; a.lastDayChg = a.price / a.dayOpen - 1; a.dayOpen = a.price; });
  resolveSignals();   // 오늘 시그널 채점 → 추세 전이 → 내일 뉴스 예고
  nextRegimes();
  run.newsTomorrow = pickNews();
  if(run.week.valueGod){   // 가치투자의 신
    const pay = run.positions.filter(p => p.dir > 0 && p.daysHeld >= VALUE_GOD_DAYS).reduce((sum, p) => sum + p.principal * run.week.valueGod, 0);
    if(pay > 0){ run.cash += pay; emit('valueGodPaid', {amount: pay}); }
  }
  run.gapNext = run.gapNext.concat(run.gapToday);
  run.gapToday = [];
  decayFss(FSS_DAILY_DECAY);
  if(interest > 0 && hasRelic('capital')) emit('relicTriggered', {id: 'capital', amount: interest / capitalCut() - interest});   // 연출용: 할인된 이자
  emit('dayEnd', {day: run.day, interest, waived: run.interestFree, discounted: hasRelic('capital'), newsTomorrow: run.newsTomorrow});
  if(checkBankruptcy()) return;
  if(run.day >= DAYS_PER_ROUND){ endOfRound(); return; }
  run.day++;
  startDay();
}

/* 주말 결산: 다이아몬드 핸드 보너스 → 목표 판정 → 보상 선택. 포지션은 이월. */
function endOfRound(){
  let diamondBonus = 0;
  const diamondPaid = [];   // 결산 체인 연출용: 포지션별로 준 보너스 (계산은 위 합계와 같은 식)
  run.positions.forEach(p => {
    if(!p.diamond) return;
    const pnl = posPnl(p);
    if(pnl > 0){ diamondBonus += pnl * p.diamond; diamondPaid.push({ posId: p.id, amount: pnl * p.diamond }); }
    p.diamond = false;
  });
  run.cash += diamondBonus;
  if(loanDebt() > 0){   // 🏦 영끌 대출: 주말 결산 때 마이너스 현금의 이자 (목표 판정 전)
    const fee = loanDebt() * YOLO_LOAN_WEEKLY_RATE;
    run.cash -= fee;
    run.interestPaid += fee;
    emit('loanInterest', {amount: fee, debt: loanDebt()});
  }
  const target = currentTarget();
  let eq = netEquity();
  let bailout = 0;
  if(eq < target && hasRelic('parents')){   // 부모님 카드: 한 번만 부족분을 메워준다
    bailout = Math.ceil(target - eq);
    run.cash += bailout;
    loseRelic('parents');
    emit('relicTriggered', {id: 'parents', amount: bailout});
    eq = netEquity();
  }
  notePeak(eq);   // 틱 밖(카드·찌라시·결산 보너스)에서 오른 순자산도 최고 기록에 반영
  run.lastWeek = weekSummary(eq, target, diamondBonus, bailout);
  run.lastWeek.settlementChain = buildSettlementChain(diamondPaid);   // 연출용 기록 (값은 위에서 이미 확정)
  if(eq < target) return endRun('MISSED');
  if(eq >= target * (1 + COMPOUND_EXCESS)) growRelic('compoundMonster', 1);   // 복리 괴물
  else shrinkRelic('compoundMonster', 1, 'weakWeek');
  const auditTax = Math.max(0, eq - target) * bossMod('excessTax', 0);   // 국세청 세무조사 (보스, 정산 카운터): 목표 초과분 추징
  if(auditTax > 0){ run.cash -= auditTax; eq -= auditTax; run.lastWeek.auditTax = auditTax; emit('bossTax', {id: run.boss, amount: auditTax}); }
  run.lastWeek.slush = slushEarned(eq, target) + (run.boss ? BOSS_SLUSH_BONUS : 0);   // 보스 주 통과 보너스
  run.slush += run.lastWeek.slush;
  run.weeksCleared = run.round;
  if(run.boss){ run.bossesBeaten.push(run.boss); emit('bossBeaten', {id: run.boss, round: run.round, slush: BOSS_SLUSH_BONUS}); }
  if(run.round >= MAX_ROUND) return endRun('VICTORY');
  run.phase = 'reward';
  run.rewardStep = 'card';                                        // 카드 보상 → 유물 보상 → 암시장
  run.rewardChoices = rollRewardChoices();                       // 이미 덱에 있는 카드는 제외 (N3: 마지막 칸은 리포트)
  if(hasRelic('cashGang')){   // 🕳️ 무소유 투자법: 결산 유물 보상 대신 비자금
    run.relicChoices = [];
    run.slush += CASHGANG_SLUSH;
    run.lastWeek.slush += CASHGANG_SLUSH;
    emit('relicTriggered', {id: 'cashGang', amount: CASHGANG_SLUSH, slush: true});
  } else run.relicChoices = rollRelics(RELIC_REWARD_CHOICES + (run.boss ? BOSS_RELIC_CHOICE_BONUS : 0));   // 아직 없는 유물만 (보스 주 통과 +1)
  emit('roundClear', run.lastWeek);
}

/* 이번 주 요약 (결산·게임오버 화면용) */
function weekSummary(eq, target, diamondBonus, bailout){
  const ws = run.weekStart;
  return {
    round: run.round, eq, target, pct: eq / target,
    weekPnl: eq - ws.equity, weekReturn: ws.equity > 0 ? eq / ws.equity - 1 : 0,
    realized: run.realized - ws.realized, liquidations: run.liquidations - ws.liquidations,
    interest: run.interestPaid - ws.interestPaid, diamondBonus, bailout,
    positions: run.positions.length, unrealized: run.positions.reduce((sum, p) => sum + posPnl(p), 0),
    invested: eq > 0 ? run.positions.filter(p => !p.viaTip).reduce((sum, p) => sum + exposure(p), 0) / eq : 0,   // 직접 산 포지션 노출액 ÷ 순자산
    buys: run.buys - ws.buys, fines: run.finesPaid - ws.finesPaid, tipNet: run.tipNet - ws.tipNet, peak: run.weekPeak,
    settled: run.weekDays.reduce((sum, d) => sum + d.payout, 0),   // 이번 주 장 마감 정산 보너스 합계 (이미 현금)
    slush: 0,   // 이번 주 비자금 적립 (통과했을 때 endOfRound가 채움)
    boss: run.boss, nextBoss: nextBossId(), auditTax: 0,   // 이번 주 보스 · 다음 주 보스 예고 (보스 주간)
    settlementChain: [],   // 결산 체인 연출용 포지션별 단계 (endOfRound가 채움)
    progress: target > ws.equity ? (eq - ws.equity) / (target - ws.equity) : 1   // 이번 주 필요 상승분 중 번 비율
  };
}

function notePeak(eq){
  run.peakEquity = Math.max(run.peakEquity, eq);
  run.weekPeak = Math.max(run.weekPeak, eq);
}

/* 주간 결산 비자금 적립: 기본 + 목표 초과분 × 비율 (계좌 돈은 건드리지 않는다) */
const slushEarned = (eq, target) => Math.round(SLUSH_WEEKLY_BASE + Math.max(0, eq - target) * SLUSH_EXCESS_RATE);

function markWeekStart(){
  run.weekStart = { equity: netEquity(), realized: run.realized, liquidations: run.liquidations, interestPaid: run.interestPaid,
                    buys: run.buys, finesPaid: run.finesPaid, tipNet: run.tipNet };
  run.weekPeak = run.weekStart.equity;
  run.weekDays = [];   // 이번 주 장 마감 정산 기록 (주간 결산 체인 요약용)
}

/* 게임오버 원인: 파산은 직전 반대매매의 종류로, 목표 미달은 이번 주 내용으로 */
function classifyEnd(reason){
  if(reason === 'VICTORY') return 'VICTORY';
  if(reason === 'BANKRUPT'){
    const L = run.lastLiquidation;
    const recent = L.round === run.round && L.day === run.day;
    if(recent && L.dir < 0) return 'SHORT_SQUEEZE';
    if(recent && L.lev >= YOLO_LEV) return 'YOLO_BUST';
    if(recent) return 'MARGIN_CALL';
    return 'DEBT_SPIRAL';
  }
  const w = run.lastWeek;
  const big = loss => loss > 0 && loss >= (w.target - w.eq) * END_CAUSE_SHARE;   // 부족분의 큰 몫을 차지한 손실
  if(w.buys === 0 && w.invested < END_SIDELINE_INVESTED) return 'SIDELINED';
  if(w.peak >= w.target * (1 + END_ROUND_TRIP_OVER)) return 'ROUND_TRIP';
  if(w.weekPnl > 0 && w.pct >= END_NEAR_MISS_PCT && w.progress >= END_NEAR_MISS_PROGRESS) return 'NEAR_MISS';
  if(run.liquidations >= END_LIQ_ADDICT) return 'LIQ_ADDICT';
  if(big(w.fines)) return 'FSS_FINED';
  if(big(-w.tipNet)) return 'TIP_VICTIM';
  if(big(w.interest)) return 'INTEREST_DRAIN';
  if(big(-w.unrealized)) return 'HODL_FAIL';
  if(big(-w.realized)) return 'PANIC_SELL';
  if(w.weekPnl > 0) return 'TOO_SLOW';
  return 'SLOW_BLEED';
}

/* 희귀도 가중치로 서로 다른 카드 n장 (exclude에 있는 카드 id는 빼고, 모자라면 있는 만큼만) */
/* 등급을 먼저 뽑고(주차별 확률), 그 등급 안에서 카드를 균등하게. 후보가 없는 등급은 빼고 나머지로 다시 나눈다.
   exclude: 후보에서 뺄 카드 id (덱에 있는 카드). 덱에 신화가 한도만큼 있으면 신화 등급 전체가 빠진다. */
const rewardRarityWeights = () => REWARD_RARITY_BY_WEEK.find(b => run.round <= b.upTo).weights;
const mythicCount = () => run.masterDeck.filter(id => CARD_BY_ID[id].rarity === 'mythic').length;
const cardAllowed = id => !inDeck(id) && (CARD_BY_ID[id].rarity !== 'mythic' || mythicCount() < MYTHIC_DECK_LIMIT) && cardOpen(id);   // (온보딩) 잠긴 시스템 카드 제외
/* 빌드 태그: 내 덱(카드 + 유물)에서 가장 많이 나온 태그들 (동점이면 전부, 없으면 빈 배열) */
const cardTags = id => (CARD_BY_ID[id] && CARD_BY_ID[id].tags) || [];
function topTags(){
  if(!run) return [];
  const n = {};
  run.masterDeck.forEach(id => cardTags(id).forEach(t => { n[t] = (n[t] || 0) + 1; }));
  run.relics.forEach(id => RELIC_BY_ID[id].tags.forEach(t => { n[t] = (n[t] || 0) + 1; }));
  const best = Math.max(0, ...Object.keys(n).map(t => n[t]));
  return best > 0 ? Object.keys(TAGS).filter(t => n[t] === best) : [];
}
/* 후보(카드·유물 객체) 하나의 등급 안 가중치: 상위 태그를 하나라도 가지면 1 + TAG_BIAS */
const tagWeight = (x, top, secs) => (x.tags.some(t => top.indexOf(t) >= 0) ? 1 + TAG_BIAS : 1)
  + (x.sector && (secs || topSectors()).indexOf(x.sector) >= 0 ? SECTOR_BIAS : 0);   // (N3) 최고 레벨 섹터의 종목·리포트 카드 (유물은 sector 없음)
function pickTagged(list){   // 등급 안 가중 추첨 (rand() 한 번 — 가중치가 전부 1이면 균등)
  const top = topTags(), secs = topSectors(), w = list.map(x => tagWeight(x, top, secs)), total = w.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for(let i = 0; i < list.length; i++){ roll -= w[i]; if(roll < 0) return list[i]; }
  return list[list.length - 1];
}

function rollRarity(weights, cands){
  const tiers = RARITIES.filter(r => weights[r] > 0 && cands.some(c => c.rarity === r));
  if(tiers.length === 0) return '';
  const total = tiers.reduce((sum, r) => sum + weights[r], 0);
  let roll = rand() * total;
  for(let i = 0; i < tiers.length; i++){
    roll -= weights[tiers[i]];
    if(roll < 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}
function rollRewards(n, exclude = []){
  const picks = [];
  const pool = CARDS.filter(c => c.type !== 'status' && exclude.indexOf(c.id) < 0 && cardAllowed(c.id));
  while(picks.length < n){
    const cands = pool.filter(c => picks.indexOf(c.id) < 0);
    const rarity = rollRarity(rewardRarityWeights(), cands);
    if(!rarity) break;
    picks.push(pickTagged(cands.filter(c => c.rarity === rarity)).id);
  }
  return picks;
}

/* 결산 카드 보상 후보: 일반 칸 + (N3) 리포트 칸 SECTOR_REPORT_SLOTS개 (덱에 없는 리포트 중 최고 레벨 섹터 가중 pickTagged).
   리포트가 다 덱에 있으면 그 칸도 일반 카드. SECTOR_LEVELS_ON이 아니면 전과 같이 rollRewards(REWARD_CHOICES) 한 번 */
function rollRewardChoices(){
  if(!SECTOR_LEVELS_ON || SECTOR_REPORT_SLOTS <= 0) return rollRewards(REWARD_CHOICES, run.masterDeck);
  const picks = rollRewards(REWARD_CHOICES - SECTOR_REPORT_SLOTS, run.masterDeck);
  for(let k = 0; k < SECTOR_REPORT_SLOTS; k++){
    const cands = CARDS.filter(c => c.type === 'report' && picks.indexOf(c.id) < 0 && cardAllowed(c.id));
    picks.push(cands.length ? pickTagged(cands).id : rollRewards(1, run.masterDeck.concat(picks))[0]);
  }
  return picks.filter(Boolean);
}

/* 1단계 카드 보상 — kind: 'take'(카드 id) | 'remove'·'upgrade'(masterDeck 인덱스) | 'skip' */
function chooseReward(kind, value){
  if(!run || run.phase !== 'reward' || run.rewardStep !== 'card') return false;
  let cardId = '';
  if(kind === 'take'){
    if(run.rewardChoices.indexOf(value) < 0) return false;
    run.masterDeck.push(value);
    cardId = value;
  } else if(kind === 'remove'){
    if(run.masterDeck.length <= MIN_DECK_SIZE || value < 0 || value >= run.masterDeck.length) return false;
    cardId = run.masterDeck[value];
    run.masterDeck.splice(value, 1);
  } else if(kind === 'upgrade'){   // 카드 강화: masterDeck 인덱스
    if(value < 0 || value >= run.masterDeck.length || !canUpgrade(run.masterDeck[value])) return false;
    run.masterDeck[value] += '+';
    cardId = run.masterDeck[value];
  }
  emit('rewardChosen', {kind, cardId, deckSize: run.masterDeck.length});
  if(run.relicChoices.length){
    run.rewardStep = 'relic';
    emit('relicRewardOpen', {choices: run.relicChoices});
  } else finishReward();   // 유물을 다 모았으면 유물 단계는 건너뛴다
  return true;
}

/* 2단계 유물 보상 — relicId: 고른 유물, '' = 건너뛰기. 칸이 가득 차 있으면 replaceId(교체할 보유 유물)가 있어야 한다 */
function chooseRelicReward(relicId, replaceId){
  if(!run || run.phase !== 'reward' || run.rewardStep !== 'relic') return false;
  if(relicId && run.relicChoices.indexOf(relicId) < 0) return false;
  if(relicId && relicSlotsFull() && !(replaceId && hasRelic(replaceId))){ emit('relicSlotsFull', {id: relicId, source: 'reward'}); return false; }
  if(relicId && !gainRelic(relicId, 'reward', relicPrice(relicId), replaceId)) return false;
  emit('relicRewardChosen', {relicId});
  finishReward();
  return true;
}

function finishReward(){
  run.rewardStep = '';
  run.relicChoices = [];
  openShop();
}

/* ══ 암시장: phase 'shop' 동안만 거래 가능 ══ */
const SHOP_PACK_BY_ID = {};
SHOP_PACKS.forEach(pk => { SHOP_PACK_BY_ID[pk.id] = pk; });

/* 팩에서 나올 수 있는 카드: 팩 구성 중 지금 덱에 없는 것만 (종목 카드 포함, 신화는 덱 한도까지) */
const inDeck = id => !!run && run.masterDeck.some(x => CARD_BY_ID[x].base === id);   // 강화판(+)이 있어도 '덱에 있음'
function packPool(pk){
  const ids = pk.pool.length ? pk.pool : CARDS.filter(c => c.type !== 'status').map(c => c.id);
  return ids.filter(id => CARD_BY_ID[id] && CARD_BY_ID[id].type !== 'status' && pk.weights[CARD_BY_ID[id].rarity] > 0 && cardAllowed(id));   // 확률 0% 등급은 구성에 있어도 제외
}

/* 희귀도별 실제 확률 (풀에 없는 희귀도는 빼고 다시 나눈다) */
function packRarityOdds(pk){
  const pool = packPool(pk);
  const present = RARITIES.filter(r => pk.weights[r] > 0 && pool.some(id => CARD_BY_ID[id].rarity === r));
  const total = present.reduce((sum, r) => sum + pk.weights[r], 0);
  return present.map(r => ({ rarity: r, chance: pk.weights[r] / total }));   // 풀이 비면 빈 배열
}

/* 카드별 실제 확률 */
function packCardOdds(pk){
  const pool = packPool(pk);
  const out = [];
  const top = topTags();
  packRarityOdds(pk).forEach(o => {
    const ids = pool.filter(id => CARD_BY_ID[id].rarity === o.rarity);
    const secs = topSectors(), w = ids.map(id => tagWeight(CARD_BY_ID[id], top, secs)), total = w.reduce((a, b) => a + b, 0);
    ids.forEach((id, i) => out.push({ cardId: id, chance: o.chance * w[i] / total }));   // 상위 태그 카드는 TAG_BIAS만큼 더 (rollPack과 같은 계산)
  });
  return out;
}

function rollPack(pk){
  const odds = packRarityOdds(pk);
  let roll = rand(), rarity = odds[odds.length - 1].rarity;
  for(let i = 0; i < odds.length; i++){
    roll -= odds[i].chance;
    if(roll < 0){ rarity = odds[i].rarity; break; }
  }
  return pickTagged(packPool(pk).filter(id => CARD_BY_ID[id].rarity === rarity).map(id => CARD_BY_ID[id])).id;
}

/* 암시장 가격은 전부 여기서 (구매·화면 표시·시뮬레이터 공용) */
const shopInflation  = category => SHOP_INFLATION[category] * (run.round - 1);   // 1주차 대비 인상률 (0.12 = +12%)
const shopPrice      = (basePrice, category) => Math.round(basePrice * (1 + shopInflation(category)) / SHOP_PRICE_ROUND) * SHOP_PRICE_ROUND;
const packPrice      = pk => shopPrice(pk.price, 'pack');
const singlePrice    = id => shopPrice(SHOP_SINGLE_PRICE[CARD_BY_ID[id].rarity], 'single');
const relicPrice     = id => shopPrice(RELIC_PRICE[RELIC_BY_ID[id].rarity], 'relic');
/* 카드 제거 n번째(이번 주 이미 n번 제거) 비용 = (기본 + 주차당 증가) × 누진^n, 10만 단위 — 제거 비용 공식은 여기 한 곳 */
const removeCost     = n => shopPrice((SHOP_REMOVE_BASE + SHOP_REMOVE_PER_WEEK * (run.round - 1)) * Math.pow(SHOP_REMOVE_ESCALATION, n), 'remove');
const shopRemoveCost = () => removeCost(run.shop.removed);   // 다음 제거 비용 (run.shop.removed는 openShop에서 0)
/* 진열 새로고침 n번째(이번 주 그 종류를 이미 n번) 비용 — 새로고침 비용 공식은 여기 한 곳 */
const rerollCost     = (kind, n) => shopPrice(SHOP_REROLL_BASE[kind] * (1 + SHOP_REROLL_WEEK_GROWTH * (run.round - 1)) * Math.pow(SHOP_REROLL_ESCALATION, n), 'reroll');
const shopRerollCost = kind => rerollCost(kind, run.shop.rerolls[kind]);
/* 새로고침할 거리가 있는지 (순수 판정, rand 없음): 낱장 = 안 산 칸이 있고 새로 뽑을 카드가 있음 / 유물 = 진열에 없는 미보유 유물이 있음 */
function rerollAvailable(kind){
  const sh = run.shop;
  if(kind === 'single'){
    const bought = sh.singlesBought.map(i => sh.singles[i]);
    const open = sh.singles.length - sh.singlesBought.length;
    return open > 0 && CARDS.some(c => c.type !== 'status' && run.masterDeck.indexOf(c.id) < 0 && bought.indexOf(c.id) < 0 && cardAllowed(c.id));
  }
  return RELICS.some(r => !hasRelic(r.id) && sh.relics.indexOf(r.id) < 0);
}
const shopOpenNow    = () => !!run && run.phase === 'shop';

function openShop(){
  run.phase = 'shop';
  const count = SHOP_SINGLE_MIN + randInt(SHOP_SINGLE_MAX - SHOP_SINGLE_MIN + 1);
  run.shop = { singles: rollRewards(count, run.masterDeck), singlesBought: [], removed: 0, relics: rollRelics(RELIC_SHOP_COUNT, [], RELIC_SHOP_RARITY_WEIGHTS),   // 덱에 없는 카드만 진열
               rerolls: { single: 0, relic: 0 }, services: { upgrade: 0, transform: 0, duplicate: 0 } };   // 이번 주 새로고침 횟수 (다음 주 암시장에서 0)
  emit('shopOpen', {round: run.round});
}

function shopReject(reason){ emit('shopRejected', {reason}); return false; }

function buyPack(packId){
  const pk = SHOP_PACK_BY_ID[packId];
  if(!shopOpenNow() || !pk) return shopReject('phase');
  if(!packOpen(pk)) return shopReject('sysLocked');
  if(packPool(pk).length === 0) return shopReject('empty');
  const price = packPrice(pk);
  if(run.slush < price) return shopReject('slush');
  run.slush -= price;
  const cardId = rollPack(pk);
  run.masterDeck.push(cardId);
  emit('packOpened', {packId, cardId, price, deckSize: run.masterDeck.length});
  return cardId;
}

function buySingle(idx){
  if(!shopOpenNow()) return shopReject('phase');
  const cardId = run.shop.singles[idx];
  if(!cardId || run.shop.singlesBought.indexOf(idx) >= 0) return shopReject('sold');
  if(inDeck(cardId)) return shopReject('owned');   // 팩 등으로 이미 덱에 들어온 카드
  if(!cardAllowed(cardId)) return shopReject('mythic');   // 신화는 덱 전체 1장
  const price = singlePrice(cardId);
  if(run.slush < price) return shopReject('slush');
  run.slush -= price;
  run.shop.singlesBought.push(idx);
  run.masterDeck.push(cardId);
  emit('singleBought', {cardId, price, deckSize: run.masterDeck.length});
  return true;
}

function shopRemoveCard(deckIdx){
  if(!shopOpenNow()) return shopReject('phase');
  if(!sysOpen('shopTools')) return shopReject('sysLocked');
  if(run.masterDeck.length <= MIN_DECK_SIZE) return shopReject('deckMin');
  if(deckIdx < 0 || deckIdx >= run.masterDeck.length) return shopReject('none');
  const price = shopRemoveCost();
  if(run.slush < price) return shopReject('slush');
  run.slush -= price;
  const cardId = run.masterDeck[deckIdx];
  run.masterDeck.splice(deckIdx, 1);
  run.shop.removed++;
  emit('shopRemoved', {cardId, price, deckSize: run.masterDeck.length});
  return true;
}

/* replaceId: 칸이 가득 찼을 때 교체할 보유 유물 (없으면 'slots'로 거절) */
/* ── 덱 조작 (리모델링·변환·복제) — 비용 serviceCost(kind, n) = (기본 × 누진^n) 물가 반영, 이번 주 n번째 ── */
const serviceCost     = (kind, n) => shopPrice(SHOP_SERVICE_BASE[kind] * Math.pow(SHOP_SERVICE_ESCALATION, n), 'service');
const shopServiceCost = kind => serviceCost(kind, run.shop.services[kind]);
/* 변환 후보: 같은 등급의 다른 기본 카드 (덱에 없는 것, 신화 한도) — 순수 */
const transformPool = id => { const c = CARD_BY_ID[id]; return CARDS.filter(x => x.type !== 'status' && x.rarity === c.rarity && x.id !== c.base && cardAllowed(x.id)); };
function canService(kind, deckIdx){
  const id = run.masterDeck[deckIdx];
  if(!id) return false;
  if(kind === 'upgrade') return canUpgrade(id);
  if(kind === 'transform') return transformPool(id).length > 0;
  return CARD_BY_ID[id].rarity !== 'mythic';   // duplicate
}
function shopService(kind, deckIdx){
  if(!shopOpenNow()) return shopReject('phase');
  if(!sysOpen('shopTools')) return shopReject('sysLocked');
  if(!SHOP_SERVICE_BASE[kind]) return shopReject('none');
  if(!canService(kind, deckIdx)) return shopReject(kind === 'duplicate' ? 'mythic' : 'none');
  const price = shopServiceCost(kind);
  if(run.slush < price) return shopReject('slush');
  run.slush -= price;
  run.shop.services[kind]++;
  const from = run.masterDeck[deckIdx];
  let to = from;
  if(kind === 'upgrade'){ to = from + '+'; run.masterDeck[deckIdx] = to; }
  else if(kind === 'transform'){ to = pickTagged(transformPool(from)).id; run.masterDeck[deckIdx] = to; }
  else run.masterDeck.push(from);
  emit('shopServiced', {kind, from, to, price, deckSize: run.masterDeck.length});
  return true;
}

function buyRelic(id, replaceId){
  if(!shopOpenNow()) return shopReject('phase');
  if(run.shop.relics.indexOf(id) < 0) return shopReject('none');
  if(hasRelic(id)) return shopReject('sold');
  const price = relicPrice(id);
  if(run.slush < price) return shopReject('slush');
  if(relicSlotsFull() && !(replaceId && hasRelic(replaceId))) return shopReject('slots');
  run.slush -= price;
  gainRelic(id, 'shop', price, replaceId);
  return true;
}

/* 유물 판매 (암시장에서만): 얻을 때 값 × RELIC_SELL_RATE를 비자금으로 */
function sellRelic(id){
  if(!shopOpenNow()) return shopReject('phase');
  if(!hasRelic(id)) return shopReject('none');
  const price = relicSellPrice(id);
  run.slush += price;
  loseRelic(id);
  emit('relicSold', {id, price});
  return true;
}

/* 진열 새로고침 (kind: 'single' | 'relic'). 낱장은 안 산 칸만 새로 뽑는다(산 칸은 앞으로 모아 '구매 완료' 유지),
   유물은 진열 전체를 지금 진열·보유 유물을 빼고 다시 뽑는다. 무작위는 여기서만 */
function rerollShop(kind){
  if(!shopOpenNow()) return shopReject('phase');
  if(kind !== 'single' && kind !== 'relic') return shopReject('none');
  if(!rerollAvailable(kind)) return shopReject('empty');
  const cost = shopRerollCost(kind);
  if(run.slush < cost) return shopReject('slush');
  run.slush -= cost;
  run.shop.rerolls[kind]++;
  const sh = run.shop;
  if(kind === 'single'){
    const bought = sh.singlesBought.map(i => sh.singles[i]);
    const fresh = rollRewards(sh.singles.length - bought.length, run.masterDeck.concat(bought));
    sh.singles = bought.concat(fresh);
    sh.singlesBought = bought.map((_, i) => i);
  } else sh.relics = rollRelics(RELIC_SHOP_COUNT, sh.relics, RELIC_SHOP_RARITY_WEIGHTS);
  emit('shopRerolled', {kind, cost, n: sh.rerolls[kind]});
  return true;
}

function leaveShop(){
  if(!shopOpenNow()) return false;
  startNextRound();
  return true;
}

function startNextRound(){
  run.round++;
  run.week = { antArmy: false, topSpotter: false, valueGod: false, sanctioned: false, futures: run.futuresNext, cultAdds: 0, growthTarget: 0 };
  run.futuresNext = 1;
  decayFss(FSS_WEEKLY_DECAY);
  run.day = 1;
  run.rewardChoices = [];
  markWeekStart();
  run.week.growthTarget = growthTargetFor(run.round, run.weekStart.equity);   // 목표 성장률: 주 시작 순자산으로 이번 주 목표 확정
  unlockSystemsForRound();   // (온보딩) 이번 주에 열리는 시스템 → 빼 둔 시작 카드를 덱으로
  buildWeekPiles();
  emit('roundStart', {round: run.round, target: currentTarget()});
  startBossWeek();   // 보스 주간이면 보스·거래정지 종목 (bossStart)
  startDay();
}

function endRun(reason){
  run.phase = 'over';
  run.endReason = reason;
  run.endEquity = netEquity();
  run.peakEquity = Math.max(run.peakEquity, run.endEquity);
  run.endCause = classifyEnd(reason);
  run.endBoss = reason !== 'VICTORY' ? run.boss : '';   // 파산 기록 '사인': 보스 주에 끝났으면 그 보스
  emit('runOver', {reason});
  return true;
}

function checkBankruptcy(){
  if(run.phase !== 'over' && (netEquity() <= 0 || run.misuDefault)) return endRun('BANKRUPT');
  return false;
}
