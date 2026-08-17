// THE REPLAY RUN — try an idea against every recorded real check, no phone, no acting.
// (docs/specs/self-improving-charlie/README.md, the fast lane; owner's ask 08-16 late:
// "how do we optimize faster ... and not just having a call every time and waste a bunch of money")
//
// Run: ADMIN_TOKEN=… ./node_modules/.bin/tsx scripts/replay.ts [howMany]
//
// It reads finished checks off the live staging site (GET only — reading deploys nothing and can
// never touch a check in the air), re-prices each one from its own recorded seconds through the
// SAME pricer the receipts use (src/calls/cost.ts, one source of rates, never a copy), and then
// applies MOVES — cut waiting, shorten Charlie's talking — and prices what each check WOULD have
// cost. The 60 second cliff (the carrier bills whole minutes) falls out of the same arithmetic.
//
// HONESTY GATE: a check the rebuild cannot reproduce within a cent of its recorded cost is
// EXCLUDED and counted out loud. Predictions are only made where reproduction held, so every cent
// this prints is arithmetic on a real check's own measured seconds, never a guess.
//
// WHAT A MOVE CANNOT KNOW: cutting seconds assumes the conversation still lands the same answer.
// That is exactly why a replay win only earns a real dial at the robot store to confirm — real
// calls confirm winners, they never explore.
import { costCall, MEASURED_RATES, USD, money } from "../src/calls/cost";

const HOST = process.env.REPLAY_HOST || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
const N = Math.max(5, Math.min(200, Number(process.argv[2]) || 80));
if (!TOKEN) { console.error("need ADMIN_TOKEN"); process.exit(1); }

const UA = { "x-admin-token": TOKEN, "User-Agent": "Mozilla/5.0 (iPhone; replay reader)" };
const get = async (path: string) => {
  const r = await fetch(HOST + path, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

interface Rec {
  id: number; status: string;
  callSecs: number; meterSecs: number; speak: number; listen: number; wait: number;
  billedMin: number; forkUsd: number; clipsUsd: number; readUsd: number;
  recordedUsd: number; rebuiltUsd: number;
}

/** Price a check's variable pieces from seconds; fork rides along proportional to line time
 *  (its recorded dollars are real, its exact stream count is not re-derived here). */
function price(r: Rec, callSecs: number, meterSecs: number) {
  const c = costCall({ callSecs, charlieSecs: meterSecs, avoidableSecs: 0, forkSecs: [] }, MEASURED_RATES);
  const fork = r.callSecs > 0 ? Math.round(r.forkUsd * (callSecs / r.callSecs)) : r.forkUsd;
  return { totalUsd: c.lineUsd + c.charlieUsd + c.sttUsd + fork + r.clipsUsd + r.readUsd, billedMin: c.billedMinutes };
}

async function main() {
  const list = (await get(`/api/admin/test-calls?limit=200`)).rows as Array<{ id: number; room: string | null }>;
  const rooms = list.filter((r) => r.room).slice(0, N);
  const recs: Rec[] = [];
  let noCost = 0, noReproduce = 0;
  for (const row of rooms) {
    let d: any;
    try { d = await get(`/api/admin/receipt/${row.room}`); } catch { continue; }
    const s = d.seconds || {}; const cost = d.cost || null; const v2 = d.v2 || {};
    if (!cost || cost.totalUsd == null || !s.callSecs) { noCost++; continue; }
    const meter = s.charlieConnectedSeconds ?? 0;
    const speak = s.speakingSecs ?? 0, listen = s.listeningSecs ?? 0;
    const readUsd = Math.max(0, (v2.totalUsd ?? cost.totalUsd) - cost.totalUsd);
    const rec: Rec = {
      id: row.id, status: d.call?.statusKey || "", callSecs: s.callSecs, meterSecs: meter,
      speak, listen, wait: Math.max(0, meter - speak - listen),
      billedMin: s.billedMinutes ?? Math.ceil(s.callSecs / 60),
      forkUsd: cost.forkUsd ?? 0, clipsUsd: cost.clipsUsd ?? 0, readUsd,
      recordedUsd: (v2.totalUsd ?? cost.totalUsd), rebuiltUsd: 0,
    };
    rec.rebuiltUsd = price(rec, rec.callSecs, rec.meterSecs).totalUsd;
    // The honesty gate: reproduce the recorded total within one cent or sit out.
    if (Math.abs(rec.rebuiltUsd - rec.recordedUsd) > 0.01 * USD) { noReproduce++; continue; }
    recs.push(rec);
  }
  console.log(`\nTHE LIBRARY: ${recs.length} checks reproduced within a cent · ${noReproduce} could not be reproduced and sit out · ${noCost} carried no cost\n`);

  const PRICE = 0.25 * USD; // the headline per-check price the profit tiles use
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
  const profit = (usd: number) => Math.round(((PRICE - usd) / PRICE) * 100);

  interface Move { name: string; apply: (r: Rec) => { callSecs: number; meterSecs: number } }
  const cutBoth = (r: Rec, cut: number) => ({ callSecs: Math.max(1, r.callSecs - cut), meterSecs: Math.max(0, r.meterSecs - cut) });
  const moves: Move[] = [
    { name: "cap Charlie's waiting at 6s", apply: (r) => cutBoth(r, Math.max(0, r.wait - 6)) },
    { name: "cap Charlie's waiting at 3s", apply: (r) => cutBoth(r, Math.max(0, r.wait - 3)) },
    { name: "no waiting at all (the floor)", apply: (r) => cutBoth(r, r.wait) },
    { name: "talk 2s shorter (tighter goodbye)", apply: (r) => cutBoth(r, Math.min(2, r.speak)) },
    { name: "talk 4s shorter", apply: (r) => cutBoth(r, Math.min(4, r.speak)) },
    { name: "wait capped 3s AND talk 4s shorter", apply: (r) => cutBoth(r, Math.max(0, r.wait - 3) + Math.min(4, r.speak)) },
  ];

  console.log("MOVE".padEnd(38) + "SAVED/CHECK  TOTAL SAVED  UNDER-60 WINS  AVG PROFIT →");
  for (const mv of moves) {
    let saved: number[] = [], cliff = 0, after: number[] = [];
    for (const r of recs) {
      const m = mv.apply(r);
      const p = price(r, m.callSecs, m.meterSecs);
      saved.push(r.rebuiltUsd - p.totalUsd); after.push(p.totalUsd);
      if (p.billedMin < r.billedMin) cliff++;
    }
    console.log(mv.name.padEnd(40) + money(Math.round(avg(saved))).padEnd(13) + money(Math.round(sum(saved))).padEnd(13)
      + String(cliff).padEnd(15) + `${profit(avg(recs.map((r) => r.rebuiltUsd)))}% → ${profit(avg(after))}%`);
  }

  // The 60 second cliff: who is close enough that a small cut skips a whole billed minute?
  const near = recs.filter((r) => r.callSecs % 60 !== 0 && r.callSecs % 60 <= 12 && r.callSecs > 60)
    .sort((a, b) => (a.callSecs % 60) - (b.callSecs % 60));
  console.log(`\nTHE MINUTE CLIFF: ${near.length} of ${recs.length} checks sit within 12s of dropping a whole billed minute`);
  for (const r of near.slice(0, 8)) {
    console.log(`  check ${r.id} · ${r.callSecs}s (${r.callSecs % 60}s past the minute) · waiting ${r.wait}s · ${money(r.rebuiltUsd)}`);
  }

  // The biggest single wasters, where a dial to confirm would be spent first.
  const fat = [...recs].sort((a, b) => (b.wait) - (a.wait)).slice(0, 6);
  console.log(`\nTHE BIGGEST WAITERS (Charlie on the clock, nobody talking):`);
  for (const r of fat) console.log(`  check ${r.id} · ${r.wait}s waiting of ${r.meterSecs}s meter · ${money(r.rebuiltUsd)} · ${r.status}`);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
