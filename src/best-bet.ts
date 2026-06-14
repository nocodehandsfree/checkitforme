// "Best bet near you": rank nearby open stores by how likely a check pays off RIGHT NOW, using the
// compounding restock data — known shipment day, confirmation history/recency, and proximity. Pure,
// deterministic scorer (unit-tested); the endpoint just gathers signals and calls it. This turns the
// database into a recommendation so a user never wastes a check guessing which store to call.

export interface BetSignals {
  miles: number | null;          // distance from the user (null = unknown)
  todayDow: number;              // 0=Sun … 6=Sat, in the STORE's local time
  shipmentDow: number | null;    // the store's known shipment weekday (null = unknown)
  confirms: number;              // # of confirmed in-stock results for this store+category (all time)
  lastConfirmAgoHrs: number | null; // hours since the most recent confirm (null = never)
}
export interface BetScore { score: number; reasons: string[]; tag: string | null }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Score a candidate store. Higher = better bet. Reasons explain the "why" to the user. */
export function scoreBet(s: BetSignals): BetScore {
  let score = 0;
  const reasons: string[] = [];
  let tag: string | null = null;

  // Shipment-day timing — the strongest signal. Today is gold; tomorrow still good.
  if (s.shipmentDow != null) {
    if (s.shipmentDow === s.todayDow) { score += 45; reasons.push(`usually restocks today (${DAYS[s.shipmentDow]})`); tag = "Restock day"; }
    else if (s.shipmentDow === (s.todayDow + 1) % 7) { score += 22; reasons.push(`restocks tomorrow (${DAYS[s.shipmentDow]})`); tag = tag || "Restocks soon"; }
    else { score += 6; reasons.push(`restocks ${DAYS[s.shipmentDow]}s`); }
  }

  // Confirmation history — proven to get product, weighted by recency.
  if (s.confirms > 0) {
    score += Math.min(s.confirms, 6) * 4;
    if (s.lastConfirmAgoHrs != null) {
      if (s.lastConfirmAgoHrs <= 24) { score += 25; reasons.push("confirmed in stock today"); tag = tag || "Hot"; }
      else if (s.lastConfirmAgoHrs <= 72) { score += 14; reasons.push("confirmed in the last few days"); }
      else if (s.lastConfirmAgoHrs <= 24 * 14) { score += 6; reasons.push(`${s.confirms} recent confirmed hit${s.confirms > 1 ? "s" : ""}`); }
    } else {
      reasons.push(`${s.confirms} confirmed hit${s.confirms > 1 ? "s" : ""}`);
    }
  }

  // Proximity — closer is a better bet (diminishing, capped). Unknown distance is neutral.
  // Cap at 30 so ranking still separates stores across a typical 25-mile search radius.
  if (s.miles != null) {
    score += Math.max(0, 30 - s.miles);
    if (s.miles <= 3) reasons.push("just minutes away");
  }

  return { score: Math.round(score), reasons: reasons.slice(0, 2), tag };
}

/** Pick the top N candidates with a positive, meaningful score. */
export function rankBets<T extends { signals: BetSignals }>(candidates: T[], n = 3): Array<T & { bet: BetScore }> {
  return candidates
    .map((c) => ({ ...c, bet: scoreBet(c.signals) }))
    .filter((c) => c.bet.score > 8 && c.bet.reasons.length > 0)
    .sort((a, b) => b.bet.score - a.bet.score)
    .slice(0, n);
}
