/* 헤드리스 시뮬레이터 전략 6종. 각 전략은 엔진(E)을 읽고 엔진 함수만 호출하는 정책이다.
   premarket(E, rng)  장전: 손패 카드를 쓴다 (checkPlay로 확인 후 playCard)
   tip(E, rng)        찌라시: 0 = A(고위험) / 1 = B(안전)
   cardPick / relicPick  보상 우선순위 (앞일수록 먼저). 카드는 목록에 있는 후보가 없으면 건너뛰고(덱 희석 방지), 유물은 첫 후보를 가져간다
   shop(E, rng)       암시장: 비자금으로 살 것 (leaveShop은 러너가 부른다)
   rng = 전략 전용 난수 (엔진 rand()와 별개 → 전략의 무작위가 게임 난수 흐름을 바꾸지 않는다) */

const card = (E, i) => E.CARD_BY_ID[E.run.hand[i].id];
const stockOf = (E, c) => (c.type === 'stock' ? E.STOCK_BY_ID[c.id.slice(4)] : null);
const posById = (E, id) => E.run.positions.find(p => p.id === id);

/* 조건에 맞는 손패 카드 중 score 높은 것부터 한 장 쓴다. target(ids, c) = 대상 고르기. 쓴 카드 id 또는 '' */
function playOne(E, match, score = () => 0, target = ids => ids[0]){
  const order = E.run.hand.map((_, i) => i).filter(i => match(card(E, i)))
    .sort((a, b) => score(card(E, b)) - score(card(E, a)));
  for(const i of order){
    const c = card(E, i);
    if(c.target){
      const ids = E.validTargetIds(i);
      const t = ids.length ? target(ids, c) : undefined;
      if(t !== undefined && E.playCard(i, t)) return c.id;
    } else if(E.checkPlay(i) === null && E.playCard(i)) return c.id;
  }
  return '';
}
const playAll = (E, match, score, target) => { let n = 0; while(playOne(E, match, score, target)) n++; return n; };

const isLongStock = (E, c) => { const s = stockOf(E, c); return !!s && s.beta > 0; };
const isInvStock  = (E, c) => { const s = stockOf(E, c); return !!s && s.beta < 0; };
const betaOf      = (E, c) => stockOf(E, c).beta;
const canAfford   = (E, c) => E.run.cash >= E.stockCost(stockOf(E, c));
const LEVER = ['yolo', 'fullBuy', 'credit'];

/* 유물 칸이 가득 찼을 때 (엔진에 RELIC_SLOTS가 있을 때만): 새 유물 id를 얻으려면 무엇을 교체할지.
   undefined = 칸 여유 있음(교체 없이 얻는다) · 보유 유물 id = 그걸 교체 · null = 포기.
   prio(우선순위 목록)가 있으면 보유 중 순위가 가장 낮은 것보다 새 유물이 높을 때만 교체. 없으면(무작위 전략) rng로 반반 */
function relicSwap(E, id, prio, rng){
  if(!hasFn(E, 'relicSlotsFull') || !E.relicSlotsFull()) return undefined;
  if(prio && prio.length){
    const rank = x => { const i = prio.indexOf(x); return i < 0 ? 999 : i; };
    const worst = E.run.relics.slice().sort((a, b) => rank(b) - rank(a))[0];
    return rank(id) < rank(worst) ? worst : null;
  }
  if(rng) return rng() < 0.5 ? pickRand(rng, E.run.relics) : null;
  return null;
}
function buyRelicFor(E, id, prio, rng){
  const r = relicSwap(E, id, prio, rng);
  return r === null ? false : E.buyRelic(id, r);
}
/* 칸 순서 정리 (엔진에 moveRelic이 있을 때만, 암시장에서): 칩 더하기 → 합산 배수 → 곱 배수 → 정산과 무관한 유물.
   정산 배수는 칸 순서대로 차례로 적용되므로 더하기를 앞에 둘수록 커진다 — 봇은 늘 최선의 순서로 둔다 */
const KIND_ORDER = { add: 0, mult: 1, xmult: 2, copy: 3 };
function arrangeRelics(E){
  if(!hasFn(E, 'moveRelic') || !E.SETTLE_EFFECTS) return;
  const key = id => { const fx = E.SETTLE_EFFECTS[id]; return fx ? KIND_ORDER[fx.kind] : 3; };
  const target = E.run.relics.map((id, i) => ({ id, i })).sort((a, b) => key(a.id) - key(b.id) || a.i - b.i).map(x => x.id);
  target.forEach((id, i) => { const from = E.run.relics.indexOf(id); if(from !== i) E.moveRelic(from, i); });
}

/* 유물 새로고침 (엔진에 rerollShop이 있을 때만): 진열에 선호 유물이 없고, 새로고침 + 가장 싼 미보유 선호 유물 값을 낼 수 있으면 새로고침 → 나오면 산다 */
const hasFn = (E, name) => { try { return typeof E[name] === 'function'; } catch(e){ return false; } };
function rerollForRelics(E, relics){
  if(!hasFn(E, 'rerollShop')) return;
  for(let guard = 0; guard < 30; guard++){
    const want = relics.filter(id => E.RELIC_BY_ID[id] && !E.hasRelic(id));   // 옛 엔진(비교용)에 없는 유물은 건너뛴다
    if(!want.length || E.run.shop.relics.some(id => want.indexOf(id) >= 0) || !E.rerollAvailable('relic')) return;
    const cheapest = Math.min.apply(null, want.map(id => E.relicPrice(id)));
    if(E.run.slush < E.shopRerollCost('relic') + cheapest || !E.rerollShop('relic')) return;
    want.forEach(id => { if(E.run.shop.relics.indexOf(id) >= 0) buyRelicFor(E, id, relics); });
  }
}

/* 암시장 공통: 원하는 유물 → (없으면 새로고침) → 원하는 낱장 순으로 비자금이 되는 만큼 산다 */
function shopByPriority(E, relics, cards){
  const s = E.run.shop;
  relics.forEach(id => { if(s.relics.indexOf(id) >= 0 && !E.hasRelic(id)) buyRelicFor(E, id, relics); });
  rerollForRelics(E, relics);
  cards.forEach(id => { const i = s.singles.indexOf(id); if(i >= 0) E.buySingle(i); });
}

/* ── allIn3x: 최고 레버리지(영끌 > 풀매수 > 신용)로 고베타 롱. 예약주문 없음. 찌라시 A ── */
const allIn3x = {
  premarket(E){
    for(;;){
      const buyable = () => E.run.hand.some((_, i) => isLongStock(E, card(E, i)) && canAfford(E, card(E, i)));
      if(E.run.pending.lev === 1 && buyable()) playOne(E, c => LEVER.indexOf(c.id) >= 0, c => -LEVER.indexOf(c.id));
      if(playOne(E, c => isLongStock(E, c), c => betaOf(E, c))) continue;
      // 남은 카드: 매도·공매도·청산류 빼고 전부 (행동력 소진)
      if(playOne(E, c => c.type !== 'sell' && c.id !== 'short' && c.type !== 'defense' && !isInvStock(E, c))) continue;
      break;
    }
  },
  tip: () => 0,
  cardPick: ['yolo', 'fullBuy', 'credit', 'chaseLimit', 'stk_meme', 'stk_sc', 'stk_coin', 'antArmy', 'coffee'],
  relicPick: ['talisman', 'hotline', 'capital', 'daytrader', 'coldwallet'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── inverseHedge: 롱(무레버리지)을 사고, 인버스 노출을 순자산의 HEDGE_TARGET 이상으로 유지.
      모든 포지션에 손절 예약. 찌라시 B ── */
const HEDGE_TARGET = 0.3;
const inverseHedge = {
  premarket(E){
    const invExp = () => E.run.positions.filter(p => E.STOCK_BY_ID[p.assetId].beta < 0).reduce((s, p) => s + E.exposure(p), 0);
    for(;;){
      if(invExp() < E.netEquity() * HEDGE_TARGET
         && playOne(E, c => isInvStock(E, c) || c.id === 'hedge', c => (c.id === 'hedge' ? 0 : -betaOf(E, c)))) continue;
      if(playOne(E, c => c.id === 'stopLoss')) continue;
      if(playOne(E, c => isLongStock(E, c) && betaOf(E, c) <= 1, c => -betaOf(E, c))) continue;
      break;
    }
  },
  tip: () => 1,
  cardPick: ['stk_inv2', 'stk_inv', 'hedge', 'stopLoss', 'cutLoss', 'stk_gukbap', 'stk_semi'],
  relicPick: ['inverse', 'gukbap', 'seal', 'capital'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── shortSeller: 매파 발언 → 공매도 + 고베타 종목 숏(최우선) → 숏 포지션에 존버 → 남은 종목은 저베타 롱. 찌라시 B ── */
const shortSeller = {
  premarket(E){
    for(;;){
      if(playOne(E, c => c.id === 'hawk')) continue;
      const shortable = E.run.hand.some((_, i) => isLongStock(E, card(E, i)) && canAfford(E, card(E, i)));
      if(E.run.pending.dir === 1 && shortable && playOne(E, c => c.id === 'short')) continue;
      if(E.run.pending.dir === -1 && playOne(E, c => isLongStock(E, c), c => betaOf(E, c))) continue;
      if(playOne(E, c => c.id === 'hodl' || c.id === 'marginTopup',
                 () => 0, ids => ids.find(id => posById(E, id).dir < 0))) continue;
      // 공매도는 '최우선'이지 전부가 아니다: 숏을 다 친 뒤 남은 종목 카드는 저베타부터 롱 (숏과 반대 방향 = 헤지)
      if(E.run.pending.dir === 1 && !E.run.hand.some(h => h.id === 'short')
         && playOne(E, c => isLongStock(E, c), c => -betaOf(E, c))) continue;
      break;
    }
  },
  tip: () => 1,
  cardPick: ['short', 'hodl', 'hawk', 'marginTopup', 'stk_meme', 'stk_sc', 'stk_coin', 'interestFree'],
  relicPick: ['shortpro', 'hotline', 'capital', 'coldwallet'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── manipSpam: 게이지가 FSS_WARN 이상이면 자진 신고 → 작전 세력·리딩방을 최우선(손패 최고 베타 롱 종목에) →
      그 종목 매수 → 나머지 카드 전부. 찌라시 A ── */
const manipSpam = {
  premarket(E){
    let aim = '';
    const pickAim = ids => {
      const best = E.run.hand.map(h => E.CARD_BY_ID[h.id]).filter(c => isLongStock(E, c) && ids.indexOf(c.id.slice(4)) >= 0)
        .sort((a, b) => betaOf(E, b) - betaOf(E, a))[0];
      aim = best ? best.id.slice(4) : ids.find(id => E.STOCK_BY_ID[id].beta > 0) || ids[0];
      return aim;
    };
    for(;;){
      if(E.run.fss >= E.FSS_WARN && playOne(E, c => c.id === 'confess')) continue;
      if(playOne(E, c => c.id === 'manip' || c.id === 'pump', c => (c.id === 'manip' ? 1 : 0), pickAim)) continue;
      if(aim && playOne(E, c => c.id === 'stk_' + aim)) continue;
      if(playOne(E, c => c.id !== 'short' && !isInvStock(E, c))) continue;
      break;
    }
  },
  tip: () => 0,
  cardPick: ['manip', 'pump', 'confess', 'stk_meme', 'stk_sc', 'credit', 'coffee'],
  relicPick: ['vip', 'lawyer', 'fssconnect', 'talisman'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── gukbapDefense: 방어주(국밥제약) → 우량주만 무레버리지 매수, 모든 포지션에 손절·익절 예약. 찌라시 B ── */
const DEFENSIVE = ['stk_gukbap', 'stk_semi'];
const gukbapDefense = {
  premarket(E){
    for(;;){
      if(playOne(E, c => c.id === 'stopLoss' || c.id === 'takeProfit')) continue;
      if(playOne(E, c => DEFENSIVE.indexOf(c.id) >= 0, c => -DEFENSIVE.indexOf(c.id))) continue;
      if(playOne(E, c => ['dividend', 'compound', 'indicators', 'interestFree'].indexOf(c.id) >= 0)) continue;
      break;
    }
  },
  tip: () => 1,
  cardPick: ['stk_gukbap', 'stk_semi', 'stopLoss', 'takeProfit', 'dividend', 'compound'],
  relicPick: ['gukbap', 'seal', 'parents', 'talisman'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── random: 대조군. 쓸 수 있는 (카드, 대상) 중 무작위로 행동력이 남는 동안. 찌라시·보상·암시장도 무작위 ── */
const pickRand = (rng, xs) => xs[Math.floor(rng() * xs.length)];
/* 시뮬레이터 안전장치: 덱이 아주 얇으면 0 행동력 드로우 카드(보조지표 42개·테마 순환매)가 계속 손패로 돌아와 무한히 쓸 수 있다
   (게임 규칙상 가능한 무한 루프 — docs/design/SHOP_ECONOMY.md). 봇이 멈추도록 하루 사용 수를 자른다. 보통 판은 10장 안팎이라 닿지 않는다 */
const SIM_MAX_PLAYS_PER_DAY = 60;
const random = {
  premarket(E, rng){
    for(let plays = 0; plays < SIM_MAX_PLAYS_PER_DAY; plays++){
      const moves = [];
      E.run.hand.forEach((_, i) => {
        const c = card(E, i);
        if(c.target) E.validTargetIds(i).forEach(t => moves.push([i, t]));
        else if(E.checkPlay(i) === null) moves.push([i]);
      });
      if(!moves.length) break;
      const m = pickRand(rng, moves);
      E.playCard(m[0], m[1]);
    }
  },
  tip: (E, rng) => (rng() < 0.5 ? 0 : 1),
  randomPicks: true,
  shop(E, rng){
    const s = E.run.shop;
    for(let tries = 0; tries < 6; tries++){
      const r = rng();
      if(r < 0.3) E.buySingle(Math.floor(rng() * s.singles.length));
      else if(r < 0.5 && s.relics.length) buyRelicFor(E, pickRand(rng, s.relics), null, rng);
      else if(r < 0.7) E.buyPack(pickRand(rng, E.SHOP_PACKS).id);
      else break;
    }
  }
};

/* ── nothing: 대조군 2. 카드를 하나도 안 쓰고 찌라시만 무작위로 고른다. 클리어율이 0%에 가까워야 정상
      (아무것도 안 하고 이긴다면 목표가 찌라시 보상만으로 닿을 만큼 낮다는 뜻) ── */
const nothing = {
  premarket(){},
  tip: (E, rng) => (rng() < 0.5 ? 0 : 1),
  cardPick: [], relicPick: [],
  shop(){}
};

/* ── signalFollower: 읽을 수 있는 시장 검증용. 시그널(📈 매수세·🔥 과열 = 롱, 📉 매도세 = 숏)과 오늘 뉴스 드리프트를 점수로 합쳐
      보조지표(적중률 +20%p)·애널리스트 리포트(100% 공개)를 먼저 쓰고, 점수와 반대인 포지션은 팔고, 점수 방향으로 산다.
      찌라시는 tipExpectedValue가 높은 쪽. 레버리지는 추세가 100% 공개된 매수세 종목에만 ── */
const SIGNAL_SCORE = { UP: 1, HOT: 0.5, FLAT: 0, DOWN: -1 };
function signalScore(E, id){
  const sg = E.run.signals[id];
  let sc = sg ? SIGNAL_SCORE[sg.shown] * (sg.revealed ? 2 : 1) : 0;
  if(E.run.newsToday){
    const n = E.NEWS_BY_ID[E.run.newsToday];
    if(n.target !== 'market' && E.newsTargetIds(n).indexOf(id) >= 0 && n.effect.drift) sc += Math.sign(n.effect.drift) * E.newsChance(n);
  }
  return sc;
}
const signalFollower = {
  premarket(E){
    const score = id => signalScore(E, id);
    const inHand = id => E.run.hand.some(h => h.id === id);
    // 0) 정보부터: 보조지표 → 손패에 카드가 있는 종목 중 가장 애매한 것에 리포트
    while(playOne(E, c => c.id === 'indicators'));
    playOne(E, c => c.id === 'analyst', () => 0, ids => ids.filter(id => inHand('stk_' + id)).sort((a, b) => Math.abs(score(a)) - Math.abs(score(b)))[0]);
    // 1) 점수와 반대 방향 포지션 정리 (인버스는 지수용이라 둔다)
    E.run.positions.slice().forEach(p => {
      if(E.STOCK_BY_ID[p.assetId].beta < 0) return;
      const sc = score(p.assetId);
      if(sc * p.dir < 0) E.sellPosition(p.id);
    });
    // 2) 점수 방향으로 매수 (강한 신호부터)
    const stockIds = E.run.hand.map(h => E.CARD_BY_ID[h.id]).filter(c => isLongStock(E, c)).map(c => c.id.slice(4))
      .filter((id, i, a) => a.indexOf(id) === i).sort((a, b) => Math.abs(score(b)) - Math.abs(score(a)));
    stockIds.forEach(id => {
      const sc = score(id);
      if(sc === 0 || !inHand('stk_' + id)) return;
      if(sc < 0 && !inHand('short')) return;
      if(sc < 0) playOne(E, c => c.id === 'short');
      else if(sc >= 2 && E.run.pending.lev === 1) playOne(E, c => c.id === 'credit');
      if(!playOne(E, c => c.id === 'stk_' + id)) E.resetPending();
    });
    // 3) 리딩방 찌라시는 매수세로 보유한 종목에 (기대값 +)
    playOne(E, c => c.id === 'pump', () => 0, ids => ids.filter(id => score(id) > 0).sort((a, b) => E.heldExposure(b) - E.heldExposure(a))[0]);
    while(playOne(E, c => c.id === 'stopLoss'));
  },
  tip(E){ const a = E.tipExpectedValue(0), b = E.tipExpectedValue(1); return a.ev > b.ev ? 0 : 1; },
  cardPick: ['analyst', 'indicators', 'short', 'credit', 'stk_semi', 'stk_coin', 'stk_sc', 'stk_gukbap', 'pump', 'stk_meme'],
  relicPick: ['talisman', 'capital', 'shortpro', 'hotline', 'seal'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── growthFirst: 성장형 유물 폭주 확인용. 플레이는 random과 같고, 유물 보상·암시장에서 성장형 유물을 최우선으로 ── */
const GROWTH_RELICS = ['compoundMonster', 'traumaSurvivor', 'moonSavings', 'tipCollector', 'tearJar', 'diamondTree'];
const growthFirst = {
  premarket: random.premarket, tip: random.tip, randomPicks: true, relicFirst: GROWTH_RELICS,
  shop(E, rng){
    const s = E.run.shop;
    GROWTH_RELICS.forEach(id => { if(s.relics.indexOf(id) >= 0) buyRelicFor(E, id, GROWTH_RELICS); });
    rerollForRelics(E, GROWTH_RELICS);
    random.shop(E, rng);
  }
};

/* ── deckThinner: 덱 압축 극단 확인용. 플레이는 random과 같고, 암시장에서 비자금이 되는 만큼(규칙이 허락하는 만큼) 약한 카드부터 제거 ──
   제거 순서: 트라우마(상태) → 쓸모가 적은 시작 카드. 남는 비자금으로 낱장·유물 무작위 */
const THIN_ORDER = ['trauma', 'stk_inv', 'stk_inv2', 'marginTopup', 'short', 'indicators', 'takeProfit', 'stopLoss', 'hodl', 'stk_gukbap'];
const deckThinner = {
  premarket: random.premarket, tip: random.tip, randomPicks: true,
  shop(E, rng){
    for(let guard = 0; guard < 40; guard++){
      if(E.run.slush < E.shopRemoveCost()) break;
      const idx = THIN_ORDER.map(id => E.run.masterDeck.indexOf(id)).find(i => i >= 0);
      if(idx === undefined || !E.shopRemoveCard(idx)) break;
    }
    random.shop(E, rng);
  }
};

/* ── S4 배수 빌드 2종 (docs/design/MULTIPLIERS.md): '10번 중 1번 대박'이 나오는지 보는 용도 ── */
const MULT_ALWAYS = ['futures', 'timeLoop'];   // 대상 없는 정산 배수 카드는 보이면 쓴다
/* levTowerBuild: 레버리지 탑 중심. 신용·영끌로 고베타 롱 → 레버리지 ETF를 가장 큰 포지션에 → 선물·타임 루프. 찌라시 A */
const levTowerBuild = {
  premarket(E){
    const biggest = ids => ids.slice().sort((a, b) => E.exposure(posById(E, b)) - E.exposure(posById(E, a)))[0];
    for(let plays = 0; plays < SIM_MAX_PLAYS_PER_DAY; plays++){   // 무한 루프 안전장치 (위와 같음)
      const buyable = () => E.run.hand.some((_, i) => isLongStock(E, card(E, i)) && canAfford(E, card(E, i)));
      if(E.run.pending.lev === 1 && buyable()) playOne(E, c => LEVER.indexOf(c.base || c.id) >= 0, c => -LEVER.indexOf(c.base || c.id));
      if(playOne(E, c => isLongStock(E, c), c => betaOf(E, c))) continue;
      if(playOne(E, c => (c.base || c.id) === 'levEtf' || (c.base || c.id) === 'relist', () => 0, biggest)) continue;
      if(playOne(E, c => MULT_ALWAYS.indexOf(c.base || c.id) >= 0)) continue;
      if(playOne(E, c => ['coffee', 'indicators', 'marginTopup', 'hodl'].indexOf(c.base || c.id) >= 0)) continue;
      break;
    }
  },
  tip: () => 0,
  cardPick: ['levEtf', 'relist', 'timeLoop', 'futures', 'credit', 'yolo', 'stk_meme', 'stk_sc', 'stk_coin', 'coffee', 'marginTopup'],
  relicPick: ['levTower', 'phoenix', 'traumaSurvivor', 'limitUp', 'rerun', 'infinity', 'hotline', 'coldwallet'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};
/* antFlagBuild: 개미 군단 깃발 중심. 무레버리지로 서로 다른 종목을 많이 → 주식 분할로 포지션 수 늘리기 → 선물·타임 루프. 찌라시 B */
const antFlagBuild = {
  premarket(E){
    const held = id => E.run.positions.some(p => p.assetId === id);
    for(let plays = 0; plays < SIM_MAX_PLAYS_PER_DAY; plays++){   // 드로우 카드 + 행동력 0 카드가 손패를 계속 채우면 끝나지 않으므로 하루 사용 수를 자른다 (random과 같은 안전장치)
      if(playOne(E, c => isLongStock(E, c) && !held(stockOf(E, c).id), c => -betaOf(E, c))) continue;
      if(playOne(E, c => (c.base || c.id) === 'split', () => 0, ids => ids.slice().sort((a, b) => E.exposure(posById(E, b)) - E.exposure(posById(E, a)))[0])) continue;
      if(playOne(E, c => MULT_ALWAYS.indexOf(c.base || c.id) >= 0 || ['antArmy', 'rotation', 'dividend', 'ipo', 'fullBuy'].indexOf(c.base || c.id) >= 0)) continue;
      if(playOne(E, c => isLongStock(E, c), c => -betaOf(E, c))) continue;
      break;
    }
  },
  tip: () => 1,
  cardPick: ['split', 'timeLoop', 'futures', 'ipo', 'fullBuy', 'antArmy', 'rotation', 'dividend', 'stk_semi', 'stk_gukbap', 'stk_coin'],
  relicPick: ['antFlag', 'sectorSet', 'ccompound', 'dopamine', 'moonSavings', 'infinity', 'seal'],
  shop(E){ shopByPriority(E, this.relicPick, this.cardPick); }
};

/* ── (N3) sectorAllIn: 한 섹터(암호화폐)에 올인. 리포트로 섹터 레벨을 올리고, 신용으로 그 섹터 종목만 산다 → 정산 맨 앞의 섹터 칩·배수.
   보상은 그 섹터 리포트·종목 카드 먼저, 암시장은 원하는 낱장 → 리서치 팩. 찌라시 B. 리포트가 없는 엔진(SECTOR_LEVELS_ON=false)이면 그냥 코인 올인 ── */
const ALLIN_SECTOR = '암호화폐', ALLIN_REPORT = 'rpt_crypto';
const inSector = (E, c) => { const s = stockOf(E, c); return !!s && s.sector === ALLIN_SECTOR; };
const sectorAllIn = {
  premarket(E){
    for(let plays = 0; plays < SIM_MAX_PLAYS_PER_DAY; plays++){
      if(playOne(E, c => c.type === 'report', c => (c.sector === ALLIN_SECTOR ? 1 : 0))) continue;   // 리포트: 올인 섹터 먼저
      const buyable = () => E.run.hand.some((_, i) => inSector(E, card(E, i)) && canAfford(E, card(E, i)));
      if(E.run.pending.lev === 1 && buyable()) playOne(E, c => (c.base || c.id) === 'credit');
      if(playOne(E, c => inSector(E, c))) continue;
      if(playOne(E, c => MULT_ALWAYS.indexOf(c.base || c.id) >= 0 || ['coffee', 'indicators'].indexOf(c.base || c.id) >= 0)) continue;
      break;
    }
  },
  tip: () => 1,
  cardPick: [ALLIN_REPORT, 'stk_coin', 'credit', 'timeLoop', 'futures', 'coffee'],
  relicPick: ['coldwallet', 'hotline', 'capital', 'moonSavings', 'seal', 'talisman'],
  shop(E){
    shopByPriority(E, this.relicPick, this.cardPick);
    const pk = E.SHOP_PACK_BY_ID && E.SHOP_PACK_BY_ID.research;
    for(let k = 0; pk && k < 3 && E.run.slush >= E.packPrice(pk) && E.packPool(pk).length; k++) E.buyPack('research');
  }
};

module.exports = { sectorAllIn, levTowerBuild, antFlagBuild, allIn3x, inverseHedge, shortSeller, manipSpam, gukbapDefense, signalFollower, random, growthFirst, deckThinner, nothing, GROWTH_RELICS,
                   relicSwap, arrangeRelics };
