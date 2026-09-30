/* 빌드 카운터 보스 점검 공용 (sim/boss-check.js·boss-counter-check.js): 보스 주에 들어간 판을 '표적'(보스 주 시작 때 표적 유물 보유 = BOSSES[].targets)과
   '비표적'으로 나눠 생존율을 대조군(보스 끔, 같은 전략·같은 주차·같은 표적 여부)과 비교한다.
   생존 = 그 주 결산 통과 (weeksCleared ≥ 주차). 대조는 보스가 나온 (전략, 주차) 분포대로 가중 평균 */
const heldAt = (g, w) => (g.weekRelics && g.weekRelics[w - 1]) || [];   // w주차 시작 때 가진 유물
const isTarget = (g, w, targets) => heldAt(g, w).some(id => targets.indexOf(id) >= 0);

/* A = 보스 켬 결과, B = 보스 끔 결과 (null 가능), boss = BOSSES 항목, strategies = 볼 전략 (생략 = A 전부) */
function targetSplit(A, B, boss, strategies){
  const sts = strategies || A.meta.strategies, targets = boss.targets || [];
  const acc = { t: { in: 0, pass: 0, base: 0, baseW: 0 }, n: { in: 0, pass: 0, base: 0, baseW: 0 } };
  const baseCache = {};
  const baseRate = (st, w, tgt) => {   // 대조: 보스 없이 w주에 들어간 판 중 표적 여부가 같은 판의 통과율
    const k = st + '|' + w + '|' + tgt;
    if(k in baseCache) return baseCache[k];
    let r = null;
    if(B && B.games[st]){
      const gs = B.games[st].filter(g => g.weeksCleared >= w - 1 && isTarget(g, w, targets) === tgt);
      r = gs.length ? gs.filter(g => g.weeksCleared >= w).length / gs.length : null;
    }
    return (baseCache[k] = r);
  };
  sts.forEach(st => (A.games[st] || []).forEach(g => {
    Object.keys(g.bossPlan || {}).forEach(ws => {
      const w = +ws;
      if(g.bossPlan[ws] !== boss.id || g.weeksCleared < w - 1) return;
      const tgt = isTarget(g, w, targets), c = tgt ? acc.t : acc.n;
      c.in++;
      if(g.weeksCleared >= w) c.pass++;
      const r = baseRate(st, w, tgt);
      if(r !== null){ c.base += r; c.baseW++; }
    });
  }));
  const fin = c => ({ n: c.in, surv: c.in ? c.pass / c.in : null, base: c.baseW ? c.base / c.baseW : null });
  const t = fin(acc.t), n = fin(acc.n);
  t.diff = t.surv !== null && t.base !== null ? t.surv - t.base : null;
  n.diff = n.surv !== null && n.base !== null ? n.surv - n.base : null;
  return { target: t, other: n };
}
module.exports = { targetSplit, isTarget, heldAt };
