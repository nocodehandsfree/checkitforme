// Mapping sweep driver — 2026-07-11 (day 2): finish the "call tomorrow" list with the no-downgrade
// guard live. One chain at a time (start → poll mapper/state until done → next). The engine's own
// daytime gate handles open-hours (east opens first, west later), so a chain that reports "no store
// open" is re-queued and retried on a later pass instead of skipped. Muted / national-call-center /
// CVS are excluded from the list AND refused by engine gates. Thrift chains INCLUDED (owner).
// Usage: ADMIN_TOKEN=... node docs/team/mapping/sweep-driver-20260711.mjs
import { appendFileSync } from "node:fs";
const API = process.env.ADMIN_API || "https://admin.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error("ADMIN_TOKEN required"); process.exit(1); }
const LOG = process.env.SWEEP_LOG || "sweep-log-20260711.jsonl";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = (o) => { const rec = { at: new Date().toISOString(), ...o }; console.log(JSON.stringify(rec)); try { appendFileSync(LOG, JSON.stringify(rec) + "\n"); } catch {} };
const api = async (m, p, b) => (await fetch(API + p, { method: m, headers: { "x-admin-token": TOKEN, "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined })).json();
const etHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date()));

// [id, name] — thrift first (owner), then needs-a-hand + retry-for-speed, then still-unmapped hobby/other.
const QUEUE = [
  [116,"Goodwill"],[130,"Habitat ReStore"],[117,"Salvation Army"],[118,"Savers"],[119,"Unique"],
  [35,"Ace Hardware"],[67,"Office Depot / OfficeMax"],
  [2,"Walmart"],[1,"Target"],[73,"Safeway"],[32,"Albertsons"],[40,"Blain's Farm & Fleet"],
  [26,"Sam's Club"],[10,"Walgreens"],[58,"Jewel-Osco"],[47,"Fleet Farm"],[48,"Food 4 Less"],
  [20,"Dick's Sporting Goods"],[23,"Kohl's"],
  [27,"Burlington"],[28,"Family Dollar"],[62,"Macy's (Toys R Us shop-in-shop)"],[70,"Publix"],
  [66,"Micro Center"],[124,"Cards and Coffee"],[129,"Comic Book Shop"],[128,"Independent Card Shop"],
  [123,"PokeMall TCG"],
].map(([id, name]) => ({ id, name, tries: 0 }));

// SKIP_IDS (comma list) — chains to hold out this run. Used when the no-downgrade guard isn't live on
// prod yet: skip the already-locked "retry for speed" chains so an unlucky re-call can't downgrade them.
const SKIP = new Set((process.env.SKIP_IDS || "").split(",").map((s) => Number(s.trim())).filter(Boolean));
if (SKIP.size) { for (let i = QUEUE.length - 1; i >= 0; i--) if (SKIP.has(QUEUE[i].id)) QUEUE.splice(i, 1); }

const CHAIN_TIMEOUT_MIN = 55, HARD_STOP_ET = 21;  // stop new chains after 9pm ET (stores closing)
line({ event: "day2-start", chains: QUEUE.length });
const requeue = [];
for (let pass = 0; pass < 3 && (pass === 0 ? QUEUE : requeue.splice(0)).length; pass++) {
  const work = pass === 0 ? QUEUE : requeue.splice(0);
  for (const c of work) {
    if (etHour() >= HARD_STOP_ET) { line({ event: "hard-stop-et", skipped: c.name }); requeue.push(c); continue; }
    c.tries++;
    const start = await api("POST", "/api/admin/mapper/start", { chainId: c.id });
    if (start.error) {
      const openLater = /no store|daytime|hours/i.test(start.error);
      line({ event: "start-refused", chain: c.name, id: c.id, error: start.error, requeue: openLater });
      if (openLater && c.tries < 3) requeue.push(c);   // west-coast not open yet → try later pass
      continue;
    }
    line({ event: "chain-start", chain: c.name, id: c.id, benchmark: start.benchmark });
    const deadline = Date.now() + CHAIN_TIMEOUT_MIN * 60000;
    let last = null;
    while (Date.now() < deadline) {
      await sleep(20000);
      const st = await api("GET", "/api/admin/mapper/state");
      last = (st.runs || []).find((r) => r.chainId === c.id) || last;
      if (last && !last.running) break;
    }
    if (last?.running) { await api("POST", "/api/admin/mapper/stop", { chainId: c.id }); line({ event: "chain-timeout", chain: c.name, id: c.id }); continue; }
    line({ event: "chain-done", chain: c.name, id: c.id, phase: last?.phase, stopReason: last?.stopReason,
           after: last?.best?.seconds ?? null, calls: last?.callsToday,
           log: (last?.log || []).map((l) => `${l.phase}:${l.outcome}`) });
    await sleep(5000);
  }
  if (requeue.length) { line({ event: "pass-done", pass, requeued: requeue.map((c) => c.name) }); await sleep(20 * 60000); } // wait for later timezones
}
line({ event: "day2-end", leftover: requeue.map((c) => c.name) });
