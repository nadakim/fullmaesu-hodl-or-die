/* 풀매수 기원단: HODL or Die — 게임 엔진 (CONFIG + ENGINE). DOM·Canvas·타이머를 쓰지 않는다.
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
const ROUND_TARGETS     = [10200, 10800, 11500, 12300, 13200, 14300, 15600, 17100]; // 주차별 순자산 목표 (만원). 주간 +2% → +10%로 점점 가파르게. 방어형(무레버리지·저베타)·헤지·공매도·레버리지·작전 빌드가 모두 클리어 가능한 곡선 (sim/runner.js: 1주차 통과 전 전략 57%+, 클리어 18~30%)
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

// 시장 카드 — 장세를 확정하지 않고 확률을 기울인다. 결과는 장이 열릴 때 판정 (chance 합 1, NORMAL = 시장이 무시함)
const MARKET_CARD_ODDS = {
  dove:     [ { state:'BULL', chance:0.70 }, { state:'NORMAL', chance:0.20 }, { state:'BEAR', chance:0.10 } ],
  hawk:     [ { state:'BEAR', chance:0.70 }, { state:'NORMAL', chance:0.20 }, { state:'BULL', chance:0.10 } ],
  ceoTweet: [ { state:'VOLATILE', chance:0.70 }, { state:'BULL', chance:0.20 }, { state:'NORMAL', chance:0.10 } ]
};
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
const SHOP_INFLATION      = { pack: 0.12, single: 0.12, relic: 0.10, remove: 0.0, reroll: 0.0 };
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

/* 종목. 인버스 종목은 beta가 음수 → 같은 가격 공식으로 지수와 반대로 움직인다. */
const STOCKS = [
  { id:'semi',   name:'반도체전자', sector:'우량주',   cost:1000, beta: 1.0, volatility:0.02,  basePrice:72000, rarity:'common' },
  { id:'coin',   name:'대장코인',   sector:'암호화폐', cost:1500, beta: 2.5, volatility:0.08,  basePrice:95000, rarity:'uncommon' },
  { id:'sc',     name:'초전도체',   sector:'테마주',   cost:800,  beta: 3.8, volatility:0.12,  basePrice:12000, rarity:'rare' },
  { id:'gukbap', name:'국밥제약',   sector:'방어주',   cost:800,  beta: 0.4, volatility:0.01,  basePrice:8500,  rarity:'common' },
  { id:'meme',   name:'밈코인',     sector:'동전주',   cost:300,  beta: 5.0, volatility:0.20,  basePrice:420,   rarity:'rare' },
  { id:'inv',    name:'지수 인버스', sector:'인버스',  cost:800,  beta:-1.0, volatility:0.004, basePrice:5000,  rarity:'common' },
  { id:'inv2',   name:'곱버스',     sector:'인버스',   cost:600,  beta:-2.0, volatility:0.008, basePrice:3000,  rarity:'uncommon' }
];
const STOCK_BY_ID = {};
STOCKS.forEach(s => { STOCK_BY_ID[s.id] = s; });

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
const RELIC_PRICE                = { common:900, uncommon:1300, rare:1700, legendary:2200, mythic:3000 }; // 암시장 유물 가격 (비자금)
const RELIC_PAYDAY_BASE          = 60;    // 월급날: 매주 첫날 현금 +이만큼 × 주차. 200 → 60: 완만한 목표에서 카드 없이도 통과시키던 불로소득 (2~8주 합계 원금의 +70% → +21%)
const RELIC_INVERSE_DRAW         = 1;     // 인버스 장인: 인버스 종목을 살 때마다 드로우
const RELIC_COLD_WALLET_RATIO    = 0.20;  // 콜드월렛: 코인 종목 반대매매 기준 (기본 25%)
const RELIC_COLD_WALLET_STOCKS   = ['coin', 'meme'];
const RELIC_THEME_SECTORS        = ['테마주', '동전주'];   // 테마주 헌터 적용 섹터
const RELIC_THEME_BONUS          = 0.15;  // 테마주 헌터: 평가이익 +15%
const RELIC_COMMUNITY_BONUS      = 0.10;  // 개미 커뮤니티: 찌라시 A 선택의 대박 확률 +10%p
const RELIC_DAYTRADER_CUT        = 1;     // 단타의 신: 하루 첫 매도 카드 행동력 −1
const RELIC_FSS_CONNECT_CUT      = 0.5;   // 금감원 인맥: 게이지 상승량 50% 감소
/* 성장형 유물 (docs/design/GROWTH_RELICS.md) — 판이 진행될수록 스택이 쌓이고, 조건에 걸리면 초기화된다.
   상태 run.relicState[id] = { stacks, best, bank }. 평가이익 보정(떡상 적금·반대매매 생존자)은 %p를 합산한 뒤 한 번만 곱한다 */
const MOON_COMBO_STEP        = 3;     // 떡상 적금: 상승 콤보 3·6·9…마다 +1스택
const MOON_PNL_PER_STACK     = 0.01;  //   스택당 평가이익 +1%
const MOON_RESET_DOWN        = 10;    //   하락 콤보가 이 값이 되는 순간 0스택
const TEARJAR_RATE           = 0.10;  // 개미의 눈물 저금통: 손실 청산액의 10% 적립
const TEARJAR_PAYOUT_COMBO   = 5;     //   상승 콤보가 이 값이 되면 전액 현금 지급
const TEARJAR_MARGIN_KEEP    = 0.5;   //   반대매매 당하면 이만큼만 남는다 (절반 증발)
const TRAUMA_PNL_PER_STACK   = 0.03;  // 반대매매 생존자: 스택당 레버리지·숏 포지션 평가이익 +3%
const TIPCOL_PER_STACK       = 0.02;  // 찌라시 수집가: 스택당 A 대박 확률 +2%p
const TIPCOL_MAX_BONUS       = 0.20;  //   최대 +20%p
const TIP_JACKPOT_CAP        = 0.95;  // 찌라시 A 대박 확률 상한 (개미 커뮤니티와 합산 후)
const DTREE_DAYS             = 3;     // 존버 나무: 장 마감을 이만큼 넘긴 포지션 1개당 +1스택
const DTREE_CUT_PER_STACK    = 0.01;  //   스택당 이자 −1%
const DTREE_MAX_CUT          = 0.60;  //   최대 −60%
const DTREE_SELL_KEEP        = 0.5;   //   그런 포지션을 직접 팔면 스택 절반
const COMPOUND_EXCESS        = 0.10;  // 복리 괴물: 결산에서 목표 대비 +10% 이상이면 +1스택, 아니면(통과는 했을 때) −1
const COMPOUND_CASH_PER_STACK = 0.01; //   주 첫날 현금 = 순자산 × 1% × 스택

const RELICS = [
  { id:'gukbap',   icon:'🍲', name:'국밥 정신',       rarity:'rare',
    desc:`${RELIC_GUKBAP_SECTORS.join('·')} 종목 포지션의 평가손실 ${Math.round(RELIC_GUKBAP_LOSS_CUT * 100)}% 감소. 청산·반대매매 계산에도 적용.`,
    flavor:'든든하게 한 그릇 말고 오면 손실도 반만 아프다.' },
  { id:'seal',     icon:'🔏', name:'존버의 인장',     rarity:'uncommon',
    desc:`장 마감을 ${RELIC_SEAL_DAYS}번 이상 넘긴 포지션은 평가이익 +${Math.round(RELIC_SEAL_BONUS * 100)}%.`,
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
    desc:`대장코인·밈코인 포지션의 반대매매 기준 증거금률 ${Math.round(MARGIN_CALL_RATIO * 100)}% → ${Math.round(RELIC_COLD_WALLET_RATIO * 100)}%.`,
    flavor:'시드 문구는 냉장고에 붙여 놨다.' },
  { id:'theme',    icon:'🔥', name:'테마주 헌터',     rarity:'uncommon',
    desc:`${RELIC_THEME_SECTORS.join('·')} 포지션의 평가이익 +${Math.round(RELIC_THEME_BONUS * 100)}%.`,
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
    desc:`상승 콤보 ${MOON_COMBO_STEP}·${MOON_COMBO_STEP * 2}·${MOON_COMBO_STEP * 3}…마다 +1스택. 스택당 모든 포지션 평가이익 +${Math.round(MOON_PNL_PER_STACK * 100)}%. 하락 콤보 ${MOON_RESET_DOWN}이면 강제 해지(0스택).`,
    reset:`하락 콤보 ${MOON_RESET_DOWN} → 0스택`,
    flavor:'"적금은 복리래." 이율은 차트가 정한다.' },
  { id:'tearJar', icon:'🐷', name:'개미의 눈물 저금통', rarity:'uncommon', growth:'money',
    desc:`손실로 청산할 때마다 손실액의 ${Math.round(TEARJAR_RATE * 100)}% 적립. 상승 콤보 ${TEARJAR_PAYOUT_COMBO}에 전액 현금 지급. 반대매매 당하면 절반 증발.`,
    reset:`반대매매 → 적립금 ${Math.round((1 - TEARJAR_MARGIN_KEEP) * 100)}% 증발`,
    flavor:'눈물 젖은 돼지. 배를 가르면 조금 덜 슬프다.' },
  { id:'traumaSurvivor', icon:'🩹', name:'반대매매 생존자', rarity:'legendary', growth:'count',
    desc:`반대매매를 당할 때마다 +1스택 (트라우마 카드는 그대로). 스택당 레버리지·숏 포지션 평가이익 +${Math.round(TRAUMA_PNL_PER_STACK * 100)}%.`,
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
    flavor:'아인슈타인이 말했다던 그것. 말한 적은 없다.' }
];

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
        { chance:1, tag:'확정', text:'"기특하네" 몰래 쓰라며 비상금 입금', effects:[{ kind:'slush', amount:TIP_SLUSH_SAFE }] } ] } ] }
];

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

/* 시작 덱 15장: 종목 8 + 증강 7 */
const STARTER_DECK = [
  'stk_semi', 'stk_semi', 'stk_gukbap', 'stk_coin', 'stk_sc', 'stk_meme', 'stk_inv', 'stk_inv2',
  'credit', 'short', 'stopLoss', 'takeProfit', 'hodl', 'marginTopup', 'indicators'
];

/* 지수(메인 캔들 차트) — 시장 전체 분위기 */
let marketPrice = 1000;
let marketState = 'NORMAL';


/* ══════════════════════════════════════════════════════════
   MAIN GAME CANDLESTICK CHART (원본 보존)
══════════════════════════════════════════════════════════ */
const MAX_CANDLES = 22;
let candleData = [];

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
                     regime: '', regimeDays: 0 };   // 숨은 추세 (인버스는 '' = 지수를 따른다). initRegimes에서 정한다
  });
  // 시작 시 차트가 비어 보이지 않도록 과거 시세를 미리 만들어 둔다
  for(let i = 0; i < ASSET_HISTORY; i++) updateAssetPrices(gauss() * 0.01, {});
  STOCKS.forEach(s => { assets[s.id].dayOpen = assets[s.id].price; });
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
    a.price *= Math.exp(r);
    const wick = move * s.volatility * IDIO_SCALE * nf.volMult * CANDLE_WICK_SCALE;
    a.candles.push({
      open, close: a.price,
      high: Math.max(open, a.price) * (1 + Math.abs(gauss()) * wick),
      low:  Math.min(open, a.price) * (1 - Math.abs(gauss()) * wick),
      gap: 0
    });
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
RELICS.forEach(r => { RELIC_BY_ID[r.id] = r; });
const hasRelic = id => !!run && run.relics.indexOf(id) >= 0;

function gainRelic(id, source){
  if(!RELIC_BY_ID[id] || hasRelic(id)) return false;
  run.relics.push(id);
  run.relicState[id] = { stacks: 0, best: 0 };
  emit('relicGained', {id, source});
  return true;
}
function loseRelic(id){ run.relics = run.relics.filter(x => x !== id); }

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
/* 성장형 평가이익 보정 %p (합산 후 relicAdjustedPnl에서 한 번 곱한다) */
const moonPct   = () => relicStacks('moonSavings') * MOON_PNL_PER_STACK;
const traumaPct = p => (p.lev > 1 || p.dir < 0) ? relicStacks('traumaSurvivor') * TRAUMA_PNL_PER_STACK : 0;

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
    const cands = RELICS.filter(r => !hasRelic(r.id) && picks.indexOf(r.id) < 0 && exclude.indexOf(r.id) < 0);
    const rarity = rollRarity(weights, cands);
    if(!rarity) break;
    const tier = cands.filter(r => r.rarity === rarity);
    picks.push(tier[randInt(tier.length)].id);
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
  const shorts = hasRelic('shortpro') ? 0 : run.positions.filter(p => p.dir < 0).reduce((s, p) => s + posBorrowed(p), 0);
  return (credit * interestRate() + shorts * shortBorrowRate()) * (1 - dtreeCut());
}
const dtreeCut = () => Math.min(DTREE_MAX_CUT, relicStacks('diamondTree') * DTREE_CUT_PER_STACK);   // 존버 나무
const gukbapApplies = p => hasRelic('gukbap') && RELIC_GUKBAP_SECTORS.indexOf(STOCK_BY_ID[p.assetId].sector) >= 0;
const sealApplies   = p => hasRelic('seal') && p.daysHeld >= RELIC_SEAL_DAYS;

/* 가격만으로 계산한 손익 → 유물 보정 (국밥 정신: 손실 감소 / 존버의 인장: 이익 증가) */
const rawPnl = p => p.dir * (exposure(p) - p.entryExposure);
function relicAdjustedPnl(p, pnl){
  if(pnl < 0 && gukbapApplies(p)) return pnl * (1 - RELIC_GUKBAP_LOSS_CUT);
  let out = pnl;
  if(pnl > 0 && sealApplies(p))   out *= 1 + RELIC_SEAL_BONUS;
  if(pnl > 0 && hasRelic('theme') && RELIC_THEME_SECTORS.indexOf(STOCK_BY_ID[p.assetId].sector) >= 0) out *= 1 + RELIC_THEME_BONUS;
  if(pnl > 0) out *= 1 + moonPct() + traumaPct(p);   // 성장형: %p 합산 후 한 번
  return out;
}
const posEquity    = p => p.principal + relicAdjustedPnl(p, rawPnl(p));

/* 결산 체인 (연출용 기록) — relicAdjustedPnl과 같은 조건·순서·연산으로 유물 보정을 한 단계씩 다시 적는다.
   값은 아무것도 바꾸지 않는다 (rand() 없음, 상태 변경 없음). UI가 주간 결산 때 이 순서대로 '재생'만 한다.
   step = { label, kind: 'base'|'mult'|'add', value, runningTotal, source: 'base'|유물 id|'diamond' }
   마지막 runningTotal === relicAdjustedPnl(p, rawPnl(p)). relicAdjustedPnl을 고치면 여기도 같이 고친다. */
const relicStepLabel = id => RELIC_BY_ID[id].icon + ' ' + RELIC_BY_ID[id].name;
function buildSettlementSteps(p){
  const pnl = rawPnl(p);
  const steps = [{ label: '평가손익', kind: 'base', value: pnl, runningTotal: pnl, source: 'base' }];
  if(pnl < 0 && gukbapApplies(p)){
    steps.push({ label: relicStepLabel('gukbap'), kind: 'mult', value: 1 - RELIC_GUKBAP_LOSS_CUT,
                 runningTotal: pnl * (1 - RELIC_GUKBAP_LOSS_CUT), source: 'gukbap' });
    return steps;
  }
  let out = pnl;
  if(pnl > 0 && sealApplies(p)){
    out *= 1 + RELIC_SEAL_BONUS;
    steps.push({ label: relicStepLabel('seal'), kind: 'mult', value: 1 + RELIC_SEAL_BONUS, runningTotal: out, source: 'seal' });
  }
  if(pnl > 0 && hasRelic('theme') && RELIC_THEME_SECTORS.indexOf(STOCK_BY_ID[p.assetId].sector) >= 0){
    out *= 1 + RELIC_THEME_BONUS;
    steps.push({ label: relicStepLabel('theme'), kind: 'mult', value: 1 + RELIC_THEME_BONUS, runningTotal: out, source: 'theme' });
  }
  if(pnl > 0){   // 성장형: relicAdjustedPnl과 같은 값(합산 %p × 한 번) — 표시만 유물별 add 단계로 나눈다
    const base = out, mp = moonPct(), tp = traumaPct(p);
    if(mp > 0){ out = out + base * mp; steps.push({ label: `${relicStepLabel('moonSavings')} ×${relicStacks('moonSavings')}스택 +${Math.round(mp * 100)}%`, kind: 'add', value: base * mp, runningTotal: out, source: 'moonSavings' }); }
    if(tp > 0){ out = out + base * tp; steps.push({ label: `${relicStepLabel('traumaSurvivor')} ×${relicStacks('traumaSurvivor')}스택 +${Math.round(tp * 100)}%`, kind: 'add', value: base * tp, runningTotal: out, source: 'traumaSurvivor' }); }
    if(mp > 0 || tp > 0) steps[steps.length - 1].runningTotal = base * (1 + mp + tp);   // 마지막 값은 relicAdjustedPnl과 같은 식으로 (부동소수까지 일치)
  }
  return steps;
}
/* 이번 결산의 포지션별 체인. diamondPaid = endOfRound가 이미 계산해 현금으로 준 다이아몬드 보너스 [{ posId, amount }] */
function buildSettlementChain(diamondPaid){
  return run.positions.map(p => {
    const steps = buildSettlementSteps(p);
    const paid = diamondPaid.find(d => d.posId === p.id);
    if(paid){
      const prev = steps[steps.length - 1].runningTotal;
      steps.push({ label: '💎 다이아몬드 핸드', kind: 'add', value: paid.amount, runningTotal: prev + paid.amount, source: 'diamond' });
    }
    return { posId: p.id, posName: p.name, assetId: p.assetId, dir: p.dir, lev: p.lev,
             steps, finalPnl: steps[steps.length - 1].runningTotal };
  });
}
const marginCallRatio = p => hasRelic('coldwallet') && RELIC_COLD_WALLET_STOCKS.indexOf(p.assetId) >= 0 ? RELIC_COLD_WALLET_RATIO : MARGIN_CALL_RATIO;
const posPnl       = p => posEquity(p) - p.principal;
const posReturn    = p => posPnl(p) / p.principal;
const avgPrice     = p => p.entryExposure / p.shares;
const marginRatio  = p => { const e = exposure(p); return e > 0 ? posEquity(p) / e : 1; };
const isMarginable = p => p.lev > 1 || p.dir < 0;          // 반대매매 대상
const posLoan      = p => p.dir > 0 ? Math.max(0, p.entryExposure - p.principal) : 0;
const posBorrowed  = p => p.dir > 0 ? posLoan(p) : exposure(p); // 이자가 붙는 금액: 신용대출 / 빌린 주식 전액
const canSell      = p => !p.diamond && !run.noSellToday;
const isProtected  = p => p.protectedToday || run.allProtectedToday;
const isLosing     = p => posPnl(p) < 0;
const isWinning    = p => posPnl(p) > 0;

const totalBorrowed = () => run.positions.reduce((s, p) => s + posBorrowed(p), 0) + run.overdraft;
const netEquity     = () => run.cash + run.positions.reduce((s, p) => s + posEquity(p), 0) - run.overdraft;
const currentTarget = () => ROUND_TARGETS[run.round - 1];
const longExposure  = () => run.positions
  .filter(p => p.dir > 0 && STOCK_BY_ID[p.assetId].beta > 0)
  .reduce((s, p) => s + exposure(p), 0);
const hedgeAmount   = () => Math.round(Math.min(longExposure() * HEDGE_RATIO, run.cash));

/* 기존 포지션에 추가 매수: 원금·수량·진입노출액을 더해 평단이 자연히 섞인다 */
function addToPosition(p, principal){
  const exp = principal * p.lev;
  p.principal += principal;
  p.shares += exp / assets[p.assetId].price;
  p.entryExposure += exp;
}

/* 같은 종목·방향·레버리지 포지션이 이미 있으면 거기에 합친다 (레버리지·방향이 다르면 별도 포지션) */
const findSamePosition = (stockId, lev, dir) =>
  run.positions.find(p => p.assetId === stockId && p.lev === lev && p.dir === dir) || null;

function openPosition(stockId, principal, lev, dir, payCash){
  const s = STOCK_BY_ID[stockId];
  const exp = principal * lev;
  if(payCash) run.cash -= principal;
  const same = findSamePosition(stockId, lev, dir);
  if(same){
    addToPosition(same, principal);
    emit('bought', {pos: same, merged: true, added: principal});
    return same;
  }
  const p = {
    id: run.nextPosId++, assetId: stockId, name: s.name, dir, lev,
    principal, shares: exp / assets[stockId].price, entryExposure: exp,
    stopLoss: false, takeProfit: false, trailing: false, trailPeak: 0,
    protectedToday: false, diamond: false, daysHeld: 0, viaTip: false
  };
  run.positions.push(p);
  emit('bought', {pos: p, merged: false, added: principal});
  return p;
}

/* 청산: 포지션순자산이 현금으로 (음수면 미수). penalty = 반대매매 투매 손실 */
function closePosition(p, penalty){
  const proceeds = posEquity(p) - penalty;
  const pnl = proceeds - p.principal;
  run.cash += proceeds;
  run.realized += pnl;
  run.positions = run.positions.filter(x => x !== p);
  if(pnl < 0) growRelic('tearJar', -pnl * TEARJAR_RATE);   // 개미의 눈물 저금통
  return pnl;
}

function closePart(p, frac){   // 포지션의 frac만큼 시장가 매도
  const pnl = posPnl(p) * frac;
  run.cash += posEquity(p) * frac;
  run.realized += pnl;
  p.principal *= 1 - frac;
  p.shares *= 1 - frac;
  p.entryExposure *= 1 - frac;
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
const stockCost = s => s.cost * run.pending.principalMult;
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
    if(p.diamond) return;
    const r = posReturn(p);
    if(p.trailing) p.trailPeak = Math.max(p.trailPeak, r);
    let kind = '';
    if(p.stopLoss && r <= STOP_LOSS_PCT) kind = 'stop';
    else if(p.takeProfit && r >= TAKE_PROFIT_PCT) kind = 'take';
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
    .filter(p => isMarginable(p) && !isProtected(p) && marginCallRatio(p) < MARGIN_CALL_RATIO && marginRatio(p) < MARGIN_CALL_RATIO && marginRatio(p) >= marginCallRatio(p))
    .forEach(p => emit('relicTriggered', {id: 'coldwallet', amount: 0, posId: p.id}));
  run.positions
    .filter(p => isMarginable(p) && !isProtected(p) && marginRatio(p) < marginCallRatio(p))
    .forEach(p => {
      const fullPenalty = exposure(p) * LIQUIDATION_PENALTY;
      const saved = hasRelic('hotline') ? fullPenalty * RELIC_HOTLINE_PENALTY_CUT : 0;
      const penalty = fullPenalty - saved;
      const pnl = closePosition(p, penalty);
      const refund = run.lossGuardToday && pnl < 0 ? -pnl * LOSS_GUARD_REFUND : 0;   // 손실 보전 약정
      run.cash += refund;
      run.liquidations++;
      run.lastLiquidation = { lev: p.lev, dir: p.dir, round: run.round, day: run.day };
      // 미수: 갭으로 포지션 순자산이 0 아래에서 체결됐는데 현금으로 못 갚으면 → 미수 동결 = 파산
      const deficit = pnl + p.principal < 0 && run.cash < MISU_CASH_FLOOR;
      if(deficit) run.misuDefault = true;
      run.discard.push(newCard('trauma'));   // 반대매매 트라우마: 덱 오염
      emit('marginCall', {pos: p, pnl, penalty, saved, refund, deficit});
      resetRelic('tearJar', 'marginCall', TEARJAR_MARGIN_KEEP);
      growRelic('traumaSurvivor', 1);
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
  const c = { id, name, type, ap, rarity, target, exhaust, desc, valid, play, stock: '' };
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
  p.shares = eq / assets[p.assetId].price;
  p.entryExposure = eq;
  p.lev = 1;
}

/* 종목 카드 (행동력 1 + 현금) */
STOCKS.forEach(s => {
  const c = defCard('stk_' + s.id, s.name, 'stock', 1, s.rarity, null, false,
    `${s.sector} · β ${s.beta}`,
    () => run.cash >= stockCost(s),
    () => { buyStock(s.id); resetPending(); });
  c.stock = s.id;
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
  p => isLosing(p) && run.cash >= p.principal * AVG_DOWN_RATIO,
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
      if(run.cash < stockCost(s)) return;   // 현금이 모자라면 손패에 남긴다
      buyStock(s.id);
      run.pending.principalMult = 1;          // 영끌 원금 배수는 첫 종목에만
      run.hand.splice(run.hand.indexOf(inst), 1);
      run.discard.push(inst);
    });
    resetPending();
  });

defCard('chaseLimit', '상한가 따라잡기', 'buy', 1, 'rare', null, false,
  `전날 등락률 1위 종목 ₩${CHASE_AMOUNT}만 매수. 전날 +${pct(CHASE_HOT_PCT)} 이상이면 ${CHASE_HOT_LEV}x.`,
  () => run.cash >= CHASE_AMOUNT,
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
  p => { p.stopLoss = true; });
defCard('takeProfit', '익절 예약', 'sell', 0, 'common', 'position', false,
  `+${pct(TAKE_PROFIT_PCT)} 수익에 닿으면 자동 매도.`,
  p => !p.diamond && !p.takeProfit,
  p => { p.takeProfit = true; });
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
  p => { p.diamond = true; p.stopLoss = false; p.takeProfit = false; p.trailing = false; });
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
  () => { run.week.valueGod = true; });

/* 행동 */
defCard('pump', '리딩방 찌라시', 'action', 1, 'uncommon', 'asset', false,
  `오늘 작전: ${pct(PUMP_UP_CHANCE)} 급등(+${pct(PUMP_UP_PCT)}) / ${pct(1 - PUMP_UP_CHANCE)} 설거지(−${pct(PUMP_DOWN_PCT)}). 개장 때 공개. 금감원 +${FSS_GAIN.pump}.`,
  s => !run.pumps[s.id],
  s => { run.pumps[s.id] = rand() < pumpUpChance() ? 1 : -1; });
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
  () => { run.lossGuardToday = true; });
defCard('circuit', '서킷브레이커', 'defense', 1, 'mythic', null, true,
  `오늘 순자산 −${pct(CIRCUIT_DROP)}(개장 대비)면 즉시 장 마감. 반대매매 면제. 소멸.`,
  () => !run.circuitToday,
  () => { run.circuitToday = true; run.allProtectedToday = true; });

/* 상태 (보상 풀에 나오지 않음) */
defCard('trauma', '반대매매 트라우마', 'status', 0, 'common', null, false,
  '사용 불가. 손패 자리만 차지한다. 주간 결산 때 사라진다.',
  () => false,
  () => {});

/* ── 카드 사용 ── */
function resolveTarget(card, targetId){
  if(card.target === 'position') return run.positions.find(p => p.id === targetId) || null;
  if(card.target === 'asset') return STOCK_BY_ID[targetId] || null;
  return null;
}

/* 이 카드를 지금 쓰는 데 드는 행동력 (이번 주 효과 반영) */
/* 표시용 카드 설명 — 유물로 확률이 바뀌는 카드는 지금 실제 값으로 (리딩방 VIP) */
function cardDesc(card){
  if(card.id === 'pump' && run && pumpUpChance() !== PUMP_UP_CHANCE)
    return `오늘 작전: ${pct(pumpUpChance())} 급등(+${pct(PUMP_UP_PCT)}) / ${pct(1 - pumpUpChance())} 설거지(−${pct(PUMP_DOWN_PCT)}). 개장 때 공개. 금감원 +${FSS_GAIN.pump}.`;
  return card.desc;
}

function cardCost(card){
  if(card.type === 'stock' && run.week.antArmy) return 0;
  if(run.week.topSpotter && (card.id === 'takeProfit' || card.id === 'trailing')) return 0;
  if(card.type === 'sell' && hasRelic('daytrader') && !run.sellDiscountUsed) return Math.max(0, card.ap - RELIC_DAYTRADER_CUT);
  return card.ap;
}

/* 사용 불가 이유 코드 (null = 사용 가능) */
function checkPlay(handIdx, targetId){
  if(!run || run.phase !== 'premarket') return 'phase';
  const inst = run.hand[handIdx];
  if(!inst) return 'none';
  const card = CARD_BY_ID[inst.id];
  if(card.type === 'status') return 'unplayable';
  if(run.buyBanToday && FSS_BAN_TYPES.indexOf(card.type) >= 0) return 'banned';
  if(run.ap < cardCost(card)) return 'ap';
  const t = resolveTarget(card, targetId);
  if(card.target && !t) return 'target';
  if(!card.valid(t)) return 'invalid';
  return null;
}

function validTargetIds(handIdx){
  const inst = run.hand[handIdx];
  if(!inst) return [];
  const card = CARD_BY_ID[inst.id];
  if(card.target === 'position') return run.positions.filter(p => checkPlay(handIdx, p.id) === null).map(p => p.id);
  if(card.target === 'asset') return STOCKS.filter(s => checkPlay(handIdx, s.id) === null).map(s => s.id);
  return [];
}

function playCard(handIdx, targetId){
  const reason = checkPlay(handIdx, targetId);
  if(reason){ emit('cardRejected', {reason}); return false; }
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
  emit('cardPlayed', {card});
  if(FSS_GAIN[card.id]) raiseFss(FSS_GAIN[card.id]);
  checkBankruptcy();
  return true;
}

/* ── 더미: 뽑을 카드 / 버린 카드 / 소멸 ── */
function newCard(id){ return { uid: run.nextUid++, id }; }

function buildWeekPiles(){ // 주 시작: 소멸·트라우마 정리, 덱 전체를 섞는다
  run.drawPile = shuffle(run.masterDeck.map(newCard));
  run.discard = [];
  run.exhausted = [];
  run.hand = [];
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
function newRun(){
  return {
    phase: 'premarket',          // premarket | market | reward | shop | over
    round: 1, day: 1, tickInDay: 0,
    cash: START_CASH, realized: 0, interestPaid: 0, overdraft: 0,
    slush: SLUSH_START,   // 비자금 (암시장 전용, 순자산 제외)
    liquidations: 0, peakEquity: START_CASH, weekPeak: START_CASH,   // 판 최고 · 이번 주 최고 순자산
    buys: 0, finesPaid: 0, tipNet: 0,   // 누적: 카드로 매수한 횟수 · 금감원 과징금 · 찌라시 순자산 변화 (엔딩 판정용)
    weekStart: { equity: START_CASH, realized: 0, liquidations: 0, interestPaid: 0, buys: 0, finesPaid: 0, tipNet: 0 },   // 주간 결산 비교 기준
    lastLiquidation: { lev: 0, dir: 0, round: 0, day: 0 },   // 파산 원인 판정용
    misuDefault: false,   // 반대매매 미수를 현금으로 못 갚음 → 파산
    weeksCleared: 0, lastWeek: null, endCause: '',
    positions: [], nextPosId: 1, nextUid: 1,
    masterDeck: STARTER_DECK.slice(), drawPile: [], hand: [], discard: [], exhausted: [],
    ap: AP_PER_DAY,
    pending: { lev: 1, dir: 1, principalMult: 1 },
    // 오늘만 유효한 효과 (startDay에서 초기화)
    forcedState: '', pumps: {}, noSellToday: false, allProtectedToday: false, interestFree: false,
    week: { antArmy: false, topSpotter: false, valueGod: false },   // 이번 주 효과 (startNextRound에서 초기화)
    lossGuardToday: false, sellDiscountUsed: false, dayRoll: 0, circuitToday: false, circuitTripped: false, marketOpenEquity: 0,
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
    shop: { singles: [], singlesBought: [], removed: 0, relics: [] }
  };
}

function startNewRun(){
  eventLog.length = 0;
  marketState = 'NORMAL';
  marketPrice = 1000;
  initChartData();
  initAssets();
  run = newRun();
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
  run.sellDiscountUsed = false;
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
  run.marketOpenEquity = netEquity();
  if(run.newsToday){   // 뉴스 판정: 확정은 항상, 루머는 NEWS_RUMOR_CHANCE
    const n = NEWS_BY_ID[run.newsToday];
    run.newsActive = n.reliability === 'confirmed' || rand() < NEWS_RUMOR_CHANCE;
    run.newsResolved = true;
    emit('newsResolved', {id: n.id, active: run.newsActive});
  }
  const gaps = run.gapNext;                         // 작전 세력 이탈: 개장 직후 갭
  run.gapNext = [];
  gaps.forEach(g => { shockStock(g.stockId, g.pct); emit('gapOpen', {stockId: g.stockId, pct: g.pct}); });
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
function nextRegimes(){
  STOCKS.forEach(s => {
    const a = assets[s.id];
    if(!a.regime) return;
    const row = a.regime === 'UP' && a.regimeDays >= REGIME_UP_LONG_DAYS ? 'UP_LONG' : a.regime;
    const next = pickWeighted(REGIME_TRANSITION[row]);
    a.regimeDays = next === a.regime ? a.regimeDays + 1 : 1;
    a.regime = next;
  });
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
function rollSignals(){ STOCKS.filter(hasRegime).forEach(s => rollSignal(s.id, SIGNAL_ACCURACY)); }
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
const pumpEvRate = () => pumpUpChance() * PUMP_UP_PCT - (1 - pumpUpChance()) * PUMP_DOWN_PCT;
const manipEvRate = () => (1 + MANIP_PCT) * (1 + MANIP_GAP) - 1;   // 오늘 +20% 확정 → 내일 개장 −12% (이틀 보유)
function expectedValue(card, target){
  if(card.id === 'pump' || card.id === 'manip'){
    const rate = card.id === 'pump' ? pumpEvRate() : manipEvRate();
    const note = card.id === 'pump'
      ? `급등 ${pct(pumpUpChance())} × +${pct(PUMP_UP_PCT)} − 설거지 ${pct(1 - pumpUpChance())} × −${pct(PUMP_DOWN_PCT)}`
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
    o.effects.forEach(ef => {
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
function tipChance(){ return TIP_EVENT_CHANCE; }
const tipScale   = () => currentTarget() / ROUND_TARGETS[0];   // 금액을 주차 목표에 비례해 키운다
const tipStockId = (tip, stock) => stock === '$pick' ? tip.stockId : stock;

function maybeTriggerTip(){
  run.ticksSinceTip++;
  if(run.pendingTip || run.tipsToday >= TIP_MAX_PER_DAY || run.ticksSinceTip < TIP_MIN_GAP_TICKS) return;
  if(rand() >= tipChance()) return;
  const cands = TIP_EVENTS.filter(e => e.id !== run.lastTipId);   // 같은 찌라시 연속 금지
  openTip(cands[randInt(cands.length)].id);
}

function openTip(eventId){
  const ev = TIP_BY_ID[eventId];
  const pool = STOCKS.filter(s => s.beta > 0);
  run.pendingTip = { eventId, stockId: ev.pick ? pool[randInt(pool.length)].id : '' };
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
  const base = gapChance(s) * newsEffectFor(s.id).gapMult;
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
  a.candles.push({ open, close: a.price, high: Math.max(open, a.price), low: Math.min(open, a.price), gap: 0 });
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
  const ev = TIP_BY_ID[tip.eventId], choice = ev.choices[choiceIdx];
  if(!choice) return null;
  const chances = tipChances(choiceIdx, choice);
  let roll = rand(), outcomeIdx = choice.outcomes.length - 1;
  for(let i = 0; i < chances.length; i++){
    roll -= chances[i];
    if(roll < 0){ outcomeIdx = i; break; }
  }
  const eq0 = netEquity(), cash0 = run.cash, slush0 = run.slush;
  choice.outcomes[outcomeIdx].effects.forEach(ef => applyTipEffect(tip, ef));
  const result = { eventId: tip.eventId, stockId: tip.stockId, choiceIdx, outcomeIdx,
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
  updateMarketEvent();
  checkOrders();
  checkMarginCalls();
  updateCombo();
  notePeak(netEquity());
  if(checkBankruptcy()) return;
  if(run.circuitToday && !run.circuitTripped && netEquity() <= run.marketOpenEquity * (1 - CIRCUIT_DROP)){
    run.circuitTripped = true;
    emit('circuitBreak', {eq: netEquity(), open: run.marketOpenEquity});
    endOfDay();
    return;
  }
  run.tickInDay++;
  if(run.tickInDay >= TICKS_PER_DAY) endOfDay();
  else maybeTriggerTip();
}

function endOfDay(){
  run.discard = run.discard.concat(run.hand);   // 쓰지 않은 손패는 전부 버린다
  run.hand = [];
  run.positions.forEach(p => { p.daysHeld++; });   // 존버의 인장: 장 마감을 넘긴 횟수
  const interest = dailyInterest();
  run.cash -= interest;
  run.interestPaid += interest;
  growRelic('diamondTree', run.positions.filter(p => p.daysHeld >= DTREE_DAYS).length);   // 존버 나무 (오늘 이자 계산 뒤)
  if(run.cardMarket && (run.forcedState === 'BULL' || run.forcedState === 'BEAR')){   // 카드로 만든 방향 장세 → 내일 개장 초반 되돌림
    run.revertDir = run.forcedState === 'BULL' ? -1 : 1;
    run.revertTicksLeft = REVERSION_TICKS;
  }
  if(run.forcedState){ marketState = 'NORMAL'; emit('eventEnd'); }
  STOCKS.forEach(s => { const a = assets[s.id]; a.lastDayChg = a.price / a.dayOpen - 1; a.dayOpen = a.price; });
  resolveSignals();   // 오늘 시그널 채점 → 추세 전이 → 내일 뉴스 예고
  nextRegimes();
  run.newsTomorrow = pickNews();
  if(run.week.valueGod){   // 가치투자의 신
    const pay = run.positions.filter(p => p.dir > 0 && p.daysHeld >= VALUE_GOD_DAYS).reduce((sum, p) => sum + p.principal * VALUE_GOD_PCT, 0);
    if(pay > 0){ run.cash += pay; emit('valueGodPaid', {amount: pay}); }
  }
  run.gapNext = run.gapNext.concat(run.gapToday);
  run.gapToday = [];
  decayFss(FSS_DAILY_DECAY);
  if(interest > 0 && hasRelic('capital')) emit('relicTriggered', {id: 'capital', amount: interest / capitalCut() - interest});   // 연출용: 할인된 이자
  if(run.day < DAYS_PER_ROUND){   // 연출용: 평가손익 보정 유물 (결산 체인과 같은 계산을 읽기만)
    const bySource = {};
    run.positions.forEach(p => buildSettlementSteps(p).forEach((st, k, steps) => {
      if(k > 0) bySource[st.source] = (bySource[st.source] || 0) + (st.runningTotal - steps[k - 1].runningTotal);
    }));
    ['gukbap', 'seal', 'theme', 'moonSavings', 'traumaSurvivor'].forEach(id => { if(bySource[id]) emit('relicTriggered', {id, amount: bySource[id]}); });
  }
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
    if(pnl > 0){ diamondBonus += pnl * DIAMOND_BONUS; diamondPaid.push({ posId: p.id, amount: pnl * DIAMOND_BONUS }); }
    p.diamond = false;
  });
  run.cash += diamondBonus;
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
  run.lastWeek.slush = slushEarned(eq, target);
  run.slush += run.lastWeek.slush;
  run.weeksCleared = run.round;
  if(run.round >= MAX_ROUND) return endRun('VICTORY');
  run.phase = 'reward';
  run.rewardStep = 'card';                                        // 카드 보상 → 유물 보상 → 암시장
  run.rewardChoices = rollRewards(REWARD_CHOICES, run.masterDeck); // 이미 덱에 있는 카드는 제외
  run.relicChoices = rollRelics(RELIC_REWARD_CHOICES);             // 아직 없는 유물만
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
    slush: 0,   // 이번 주 비자금 적립 (통과했을 때 endOfRound가 채움)
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
const cardAllowed = id => !inDeck(id) && (CARD_BY_ID[id].rarity !== 'mythic' || mythicCount() < MYTHIC_DECK_LIMIT);
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
    const tier = cands.filter(c => c.rarity === rarity);
    picks.push(tier[randInt(tier.length)].id);
  }
  return picks;
}

/* 1단계 카드 보상 — kind: 'take'(카드 id) | 'remove'(masterDeck 인덱스) | 'skip' */
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
  }
  emit('rewardChosen', {kind, cardId, deckSize: run.masterDeck.length});
  if(run.relicChoices.length){
    run.rewardStep = 'relic';
    emit('relicRewardOpen', {choices: run.relicChoices});
  } else finishReward();   // 유물을 다 모았으면 유물 단계는 건너뛴다
  return true;
}

/* 2단계 유물 보상 — relicId: 고른 유물, '' = 건너뛰기 */
function chooseRelicReward(relicId){
  if(!run || run.phase !== 'reward' || run.rewardStep !== 'relic') return false;
  if(relicId && (run.relicChoices.indexOf(relicId) < 0 || !gainRelic(relicId, 'reward'))) return false;
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
const inDeck = id => !!run && run.masterDeck.indexOf(id) >= 0;
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
  packRarityOdds(pk).forEach(o => {
    const ids = pool.filter(id => CARD_BY_ID[id].rarity === o.rarity);
    ids.forEach(id => out.push({ cardId: id, chance: o.chance / ids.length }));
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
  const ids = packPool(pk).filter(id => CARD_BY_ID[id].rarity === rarity);
  return ids[randInt(ids.length)];
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
               rerolls: { single: 0, relic: 0 } };   // 이번 주 새로고침 횟수 (다음 주 암시장에서 0)
  emit('shopOpen', {round: run.round});
}

function shopReject(reason){ emit('shopRejected', {reason}); return false; }

function buyPack(packId){
  const pk = SHOP_PACK_BY_ID[packId];
  if(!shopOpenNow() || !pk) return shopReject('phase');
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

function buyRelic(id){
  if(!shopOpenNow()) return shopReject('phase');
  if(run.shop.relics.indexOf(id) < 0) return shopReject('none');
  if(hasRelic(id)) return shopReject('sold');
  const price = relicPrice(id);
  if(run.slush < price) return shopReject('slush');
  run.slush -= price;
  gainRelic(id, 'shop');
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
  run.week = { antArmy: false, topSpotter: false, valueGod: false };
  decayFss(FSS_WEEKLY_DECAY);
  run.day = 1;
  run.rewardChoices = [];
  markWeekStart();
  buildWeekPiles();
  emit('roundStart', {round: run.round, target: currentTarget()});
  startDay();
}

function endRun(reason){
  run.phase = 'over';
  run.endReason = reason;
  run.endEquity = netEquity();
  run.peakEquity = Math.max(run.peakEquity, run.endEquity);
  run.endCause = classifyEnd(reason);
  emit('runOver', {reason});
  return true;
}

function checkBankruptcy(){
  if(run.phase !== 'over' && (netEquity() <= 0 || run.misuDefault)) return endRun('BANKRUPT');
  return false;
}
