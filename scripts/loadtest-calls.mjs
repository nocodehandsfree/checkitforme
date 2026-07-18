#!/usr/bin/env node
// PHASE-2 concurrency load test (owner ask 2026-07-16). HOLD — runs ONLY on the owner's explicit go.
//
// Two modes:
//   --calls  Ramp N simultaneous REAL checks (5→10→25→50→100) and find where the pool breaks.
//            EVERY call is aimed at ONE owner-controlled store (Fun/MVP) — never a real store. The
//            script REFUSES to run unless the target is verified ownerOnly, and unless the confirm
//            phrase is passed. It reads /api/concurrency to report observed peak concurrency, how
//            many were served vs queued-out ("busy"), and the wall-clock, per ramp step.
//   --web    Web-tier load: hammer the cheap read paths (/pub/stores/near, /pub/plans) with calls
//            HARD OFF. No telephony. Safe. Reports p50/p95 latency + error rate under load.
//
// Usage (calls mode — the owner runs this, with money in the Twilio+EL accounts):
//   LOADTEST_CONFIRM="i-will-not-hit-real-stores" \
//   BASE=https://staging.checkitforme.com ADMIN_TOKEN=<staging admin token> \
//   node scripts/loadtest-calls.mjs --calls --target <ownerOnly retailerId> --token <a comp session JWT>
//
// Usage (web mode — safe anytime):
//   BASE=https://staging.checkitforme.com node scripts/loadtest-calls.mjs --web

const BASE = (process.env.BASE || "https://staging.checkitforme.com").replace(/\/$/, "");
const UA = "check-loadtest";
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const RAMPS = (val("--ramps", "5,10,25,50,100")).split(",").map(Number);

async function jget(path, headers = {}) {
  const r = await fetch(BASE + path, { headers: { "user-agent": UA, ...headers } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function webMode() {
  console.log(`▶ WEB-TIER load test vs ${BASE} (no calls — cheap read paths only)`);
  const paths = ["/pub/stores/near?lat=34.05&lng=-118.24&radius=25", "/pub/plans", "/api/health"];
  for (const conc of RAMPS) {
    const lat = [];
    let errs = 0;
    const t0 = Date.now();
    await Promise.all(Array.from({ length: conc * 5 }, async () => {
      const p = paths[Math.floor(lat.length % paths.length)];
      const s = Date.now();
      try { const r = await fetch(BASE + p, { headers: { "user-agent": UA } }); if (!r.ok) errs++; }
      catch { errs++; }
      lat.push(Date.now() - s);
    }));
    lat.sort((a, b) => a - b);
    const p = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))];
    console.log(`  ${String(conc).padStart(3)}x → ${lat.length} reqs in ${Date.now() - t0}ms · p50 ${p(0.5)}ms · p95 ${p(0.95)}ms · errors ${errs}`);
  }
  console.log("✓ web-tier done. If p95 stays flat as concurrency climbs, the web tier holds.");
}

async function callsMode() {
  const confirm = process.env.LOADTEST_CONFIRM;
  const token = val("--token", process.env.SESSION_TOKEN || "");
  const target = Number(val("--target", "0"));
  const adminTok = process.env.ADMIN_TOKEN || "";
  if (confirm !== "i-will-not-hit-real-stores") {
    console.error("✗ REFUSING: set LOADTEST_CONFIRM=\"i-will-not-hit-real-stores\" — this places REAL calls."); process.exit(2);
  }
  if (!target || !token || !adminTok) { console.error("✗ need --target <ownerOnly retailerId>, --token <session JWT>, and ADMIN_TOKEN env."); process.exit(2); }

  // SAFETY GATE: the target MUST be an owner-only store (Fun/MVP). Verify via the admin API; a real
  // store fails this check and the test aborts — we can NEVER ramp calls at a real store.
  const s = await jget(`/api/retailers`, { "x-admin-token": adminTok });
  const store = (Array.isArray(s.body) ? s.body : s.body.rows || []).find((r) => r.id === target);
  const own = await jget(`/pub/store/${target}`, { Authorization: `Bearer ${token}` });
  const ownerOnly = own.body?.ownerOnly === true || /^(fun|mvp)\b/i.test(store?.name || "");
  if (!ownerOnly) { console.error(`✗ REFUSING: retailer ${target} is not an owner-only Fun/MVP store. Point at your test store only.`); process.exit(2); }
  console.log(`▶ CALLS load test vs ${BASE} — target #${target} (${store?.name || "owner store"}), ramps ${RAMPS.join("/")}`);
  console.log("  (make sure Twilio + ElevenLabs have balance; each call costs real money)\n");

  const cat = 1; // pokemon
  let brokeAt = null;
  for (const conc of RAMPS) {
    const t0 = Date.now();
    const results = await Promise.all(Array.from({ length: conc }, async () => {
      try {
        const r = await fetch(`${BASE}/app/check`, {
          method: "POST", headers: { "user-agent": UA, "content-type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ retailerId: target, categoryId: cat }),
        });
        const b = await r.json().catch(() => ({}));
        if (r.ok && b.providerCallId) return "placed";
        if (b.error === "calls_busy") return "busy";
        return "err:" + (b.error || r.status);
      } catch (e) { return "throw"; }
    }));
    const placed = results.filter((x) => x === "placed").length;
    const busy = results.filter((x) => x === "busy").length;
    const errs = results.filter((x) => x.startsWith("err") || x === "throw");
    // Peak concurrency the governor SAW (read right after the burst).
    const conc2 = await jget(`/api/concurrency`, { "x-admin-token": adminTok });
    console.log(`  ${String(conc).padStart(3)} at once → placed ${placed} · busy/queued ${busy} · errors ${errs.length} · pool ${conc2.body?.totalUsed}/${conc2.body?.totalCap} · ${Date.now() - t0}ms`);
    if (errs.length && !brokeAt) { brokeAt = conc; console.log(`    ↑ first hard errors here: ${[...new Set(errs)].slice(0, 4).join(", ")}`); }
    await new Promise((r) => setTimeout(r, 15_000)); // let calls drain before the next ramp
  }
  console.log(`\n✓ done. Break point (first hard errors): ${brokeAt ? conc + "" : "none in this ramp"}. "busy" means the governor QUEUED overflow gracefully (good).`);
  console.log("  Cost = (calls placed) × your per-call rate. Check Twilio+EL balances after.");
}

if (has("--web")) await webMode();
else if (has("--calls")) await callsMode();
else { console.error("specify --web (safe) or --calls (real calls; owner-only target, gated)."); process.exit(2); }
