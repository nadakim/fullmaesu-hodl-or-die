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

/* 암시장 공통: 원하는 유물 → 원하는 낱장 순으로 비자금이 되는 만큼 산다 */
function shopByPriority(E, relics, cards){
  const s = E.run.shop;
  relics.forEach(id => { if(s.relics.indexOf(id) >= 0 && !E.hasRelic(id)) E.buyRelic(id); });
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

/* ── shortSeller: 매파 발언 → 공매도 + 고베타 종목 숏 → 숏 포지션에 존버. 찌라시 B ── */
const shortSeller = {
  premarket(E){
    for(;;){
      if(playOne(E, c => c.id === 'hawk')) continue;
      const shortable = E.run.hand.some((_, i) => isLongStock(E, card(E, i)) && canAfford(E, card(E, i)));
      if(E.run.pending.dir === 1 && shortable && playOne(E, c => c.id === 'short')) continue;
      if(E.run.pending.dir === -1 && playOne(E, c => isLongStock(E, c), c => betaOf(E, c))) continue;
      if(playOne(E, c => c.id === 'hodl' || c.id === 'marginTopup',
                 () => 0, ids => ids.find(id => posById(E, id).dir < 0))) continue;
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
const random = {
  premarket(E, rng){
    for(;;){
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
      else if(r < 0.5 && s.relics.length) E.buyRelic(pickRand(rng, s.relics));
      else if(r < 0.7) E.buyPack(pickRand(rng, E.SHOP_PACKS).id);
      else break;
    }
  }
};

module.exports = { allIn3x, inverseHedge, shortSeller, manipSpam, gukbapDefense, random };
