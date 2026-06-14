// Unit test for the "best bet" scorer. Run: ./node_modules/.bin/tsx scripts/test-bestbet.ts
import { scoreBet, rankBets, type BetSignals } from "../src/best-bet";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

const base: BetSignals = { miles: 5, todayDow: 4 /*Thu*/, shipmentDow: null, confirms: 0, lastConfirmAgoHrs: null };

console.log("▶ shipment-day timing dominates");
const today = scoreBet({ ...base, shipmentDow: 4 });
const otherDay = scoreBet({ ...base, shipmentDow: 1 /*Mon*/ });
ok(today.score > otherDay.score, "restock-day-today scores higher than an off day");
ok(today.tag === "Restock day", "today gets the 'Restock day' tag");
ok(today.reasons.some((r) => /today/.test(r)), "reason mentions today");
const tomorrow = scoreBet({ ...base, shipmentDow: 5 /*Fri = today+1*/ });
ok(today.score > tomorrow.score && tomorrow.score > otherDay.score, "today > tomorrow > other day");

console.log("▶ recent confirmation is a strong, recency-weighted signal");
const hotNow = scoreBet({ ...base, confirms: 3, lastConfirmAgoHrs: 5 });
const staleHit = scoreBet({ ...base, confirms: 3, lastConfirmAgoHrs: 24 * 10 });
ok(hotNow.score > staleHit.score, "confirmed-today beats a 10-day-old confirm");
ok(hotNow.tag === "Hot", "fresh confirm earns the 'Hot' tag");

console.log("▶ proximity tilts ties, capped");
const near = scoreBet({ ...base, shipmentDow: 4, miles: 1 });
const far = scoreBet({ ...base, shipmentDow: 4, miles: 20 });
ok(near.score > far.score, "closer store scores higher, all else equal");
ok(near.reasons.some((r) => /minutes away/.test(r)), "very-near store notes the short trip");

console.log("▶ ranking filters weak candidates + caps to N");
const cands = [
  { id: 1, signals: { ...base, shipmentDow: 4, confirms: 2, lastConfirmAgoHrs: 3 } }, // strong
  { id: 2, signals: { ...base, miles: 24, shipmentDow: null, confirms: 0, lastConfirmAgoHrs: null } }, // weak/none
  { id: 3, signals: { ...base, shipmentDow: 5, confirms: 1, lastConfirmAgoHrs: 50 } }, // medium
];
const ranked = rankBets(cands, 3);
ok(ranked[0].id === 1, "strongest candidate ranks first");
ok(!ranked.some((r) => r.id === 2), "candidate with no signal is filtered out");
ok(rankBets(cands, 1).length === 1, "respects the top-N cap");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
