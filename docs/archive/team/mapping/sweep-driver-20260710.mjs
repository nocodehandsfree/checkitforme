// Mapping sweep driver — 2026-07-10 (owner order: start 9am ET, east→west as timezones open,
// ONE chain at a time: start → poll until locked/needs-review → next).
// Scope: locked keypad/voice chains only. navType:direct skipped (already instant). CVS excluded (owner).
// Meijer(64)/Menards(65): owner target "customer service" is set first so a verify-miss re-discovers
// toward the RIGHT desk. Engine's own gates (muted / no store line / daily cap) are trusted as-is.
// Usage: ADMIN_TOKEN=... node docs/team/mapping/sweep-driver-20260710.mjs
const API = process.env.ADMIN_API || "https://admin.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) { console.error("ADMIN_TOKEN required"); process.exit(1); }
const LOG = process.env.SWEEP_LOG || "sweep-log-20260710.jsonl";

import { appendFileSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const etNow = () => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
};
const line = (o) => { const rec = { at: new Date().toISOString(), ...o }; console.log(JSON.stringify(rec)); try { appendFileSync(LOG, JSON.stringify(rec) + "\n"); } catch {} };
const api = async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { "x-admin-token": TOKEN, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
};

// [id, name, beforeSecs, notBeforeET(min), prio] — prio 1 = owner's explicit re-map adds, run first in their wave.
const CHAINS = [
  [64, "Meijer", 75, 540, 1], [36, "Acme", 112, 540, 0], [45, "Costco", 97, 540, 0],
  [85, "BJ's Wholesale", 90, 540, 0], [78, "Star Market", 80, 540, 0], [75, "Shaw's", 73, 540, 0],
  [83, "Wegmans", 73, 540, 0], [23, "Kohl's", 67, 540, 0], [24, "Staples", 60, 540, 0],
  [41, "Books-A-Million", 60, 540, 0], [35, "Ace Hardware", 56, 540, 0], [33, "AAFES", 45, 540, 0],
  [21, "Marshalls", 44, 540, 0], [26, "Sam's Club", 44, 540, 0], [14, "Barnes & Noble", 37, 540, 0],
  [34, "Academy Sports", 36, 540, 0], [30, "GameStop", 36, 540, 0], [10, "Walgreens", 34, 540, 0],
  [20, "Dick's Sporting Goods", 24, 540, 0], [79, "TJ Maxx", 23, 540, 0], [1, "Target", 16, 540, 0],
  [7, "HomeGoods", 14, 540, 0], [2, "Walmart", 10, 540, 0],
  [65, "Menards", 94, 600, 1], [72, "Randalls", 70, 600, 0], [80, "Tom Thumb", 69, 600, 0],
  [58, "Jewel-Osco", 65, 600, 0], [74, "Scheels", 59, 600, 0], [40, "Blain's Farm & Fleet", 57, 600, 0],
  [47, "Fleet Farm", 57, 600, 0], [69, "Pick 'n Save", 20, 600, 0],
  [77, "Smith's", 62, 660, 0],
  [15, "Ralphs", 126, 720, 0], [73, "Safeway", 102, 720, 0], [31, "Vons", 87, 720, 0],
  [32, "Albertsons", 68, 720, 0], [48, "Food 4 Less", 55, 720, 0], [16, "Pavilions", 47, 720, 0],
  [11, "Big 5 Sporting Goods", 34, 720, 0],
].map(([id, name, before, notBefore, prio]) => ({ id, name, before, notBefore, prio, done: false }));

const RETARGET = new Set([64, 65]); // Meijer, Menards → aim at customer service before mapping
// Resume support: SKIP="64,36,..." marks chains already completed in a previous (killed) run.
for (const id of (process.env.SKIP || "").split(",").map(Number).filter(Boolean)) {
  const c = CHAINS.find((x) => x.id === id); if (c) c.done = true;
}
const CHAIN_TIMEOUT_MIN = 55;       // 12-call cap × (150s call + 75s gap) ≈ 45 min worst case
const HARD_STOP_ET = 22 * 60 + 30;  // 10:30pm ET — nothing is open past 8pm local anywhere by then

line({ event: "sweep-start", chains: CHAINS.length });
while (CHAINS.some((c) => !c.done)) {
  const now = etNow();
  if (now >= HARD_STOP_ET) break;
  const open = CHAINS.filter((c) => !c.done && c.notBefore <= now).sort((a, b) => b.prio - a.prio || b.before - a.before);
  if (!open.length) {
    const next = Math.min(...CHAINS.filter((c) => !c.done).map((c) => c.notBefore));
    line({ event: "waiting-for-wave", nextWaveET: next });
    await sleep(Math.max(60, (next - now) * 60) * 1000);
    continue;
  }
  const c = open[0];
  c.done = true;
  try {
    if (RETARGET.has(c.id)) {
      const t = await api("POST", "/api/admin/mapper/target", { chainId: c.id, target: "customer service" });
      line({ event: "retarget", chain: c.name, res: t });
    }
    const start = await api("POST", "/api/admin/mapper/start", { chainId: c.id });
    // "already mapping" = an orphaned run from a killed driver — adopt it (poll to completion) rather than skip.
    if (!start.started && !/already mapping/i.test(start.error || "")) { line({ event: "start-refused", chain: c.name, id: c.id, error: start.error }); continue; }
    line({ event: "chain-start", chain: c.name, id: c.id, before: c.before, benchmark: start.benchmark });
    const deadline = Date.now() + CHAIN_TIMEOUT_MIN * 60 * 1000;
    let last = null;
    while (Date.now() < deadline) {
      await sleep(20000);
      const st = await api("GET", "/api/admin/mapper/state");
      last = (st.runs || []).find((r) => r.chainId === c.id) || last;
      if (last && !last.running) break;
    }
    if (last?.running) { await api("POST", "/api/admin/mapper/stop", { chainId: c.id }); line({ event: "chain-timeout", chain: c.name, id: c.id, phase: last?.phase }); continue; }
    line({
      event: "chain-done", chain: c.name, id: c.id, phase: last?.phase, stopReason: last?.stopReason,
      before: c.before, after: last?.best?.seconds ?? null, calls: last?.callsToday,
      log: (last?.log || []).map((l) => `${l.phase}:${l.outcome}`),
    });
  } catch (e) {
    line({ event: "chain-error", chain: c.name, id: c.id, error: String(e).slice(0, 200) });
  }
}
line({ event: "sweep-end", ran: CHAINS.filter((c) => c.done).length, skipped: CHAINS.filter((c) => !c.done).map((c) => c.name) });
