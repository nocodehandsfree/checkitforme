#!/usr/bin/env node
// PROMOTE: copy config from STAGING → PROD. Run automatically by CI on a push to the prod branch
// (i.e. whenever you promote code staging→prod) so DATA rides along with the deploy — no button.
//
// What it moves: the config tables (chains/mappings/personas/settings, retailers, categories,
// products, statuses, kiosks) + the ElevenLabs restock-agent persona. What it NEVER moves: prod's
// live state (call results, accounts). Prod-side apply is upsert-atomic with a 50% safety floor, so a
// broken/empty staging can't wipe prod.
//
// Env: RAILWAY_API_TOKEN (to fetch each service's ADMIN_TOKEN). --dry to preview without writing.
const TOKEN = process.env.RAILWAY_API_TOKEN;
if (!TOKEN) { console.error("set RAILWAY_API_TOKEN"); process.exit(1); }
const DRY = process.argv.includes("--dry");
const PROJECT = "889e332c-30fe-46e9-a18e-d8de4f7523aa", ENV = "7cbf9327-357a-415e-9031-d1609aead2b4";
const PROD = { svc: "d363a982-e918-4433-b175-defe8faf0ec9", url: "https://checkitforme.com" };
const STG  = { svc: "8165df7a-3bdf-41a5-bdce-24883633a096", url: "https://staging.checkitforme.com" };
const TABLES = ["categories", "chains", "products", "retailers", "statuses", "kiosks", "settings"];

const j = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { "user-agent": "curl/8", ...(opts.headers || {}) } });
  const t = await res.text();
  try { return { ok: res.ok, status: res.status, body: JSON.parse(t) }; }
  catch { return { ok: res.ok, status: res.status, body: t.slice(0, 200) }; }
};
const adminToken = async (svc) => {
  const q = `{ variables(projectId: "${PROJECT}", environmentId: "${ENV}", serviceId: "${svc}") }`;
  const r = await j("https://backboard.railway.app/graphql/v2", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  return r.body?.data?.variables?.ADMIN_TOKEN;
};

// Pull a whole table from one service (paginated).
const dumpAll = async (svc, name) => {
  let rows = [], offset = 0;
  for (;;) {
    const d = await j(`${svc.url}/api/admin/table-dump?name=${name}&limit=20000&offset=${offset}`, { headers: { "x-admin-token": svc.admin } });
    if (!d.ok) throw new Error(`dump ${name} from ${svc.url} -> ${d.status} ${JSON.stringify(d.body)}`);
    rows.push(...d.body.rows); offset += d.body.count;
    if (d.body.count < 20000) break;
  }
  return rows;
};

const tok = await Promise.all([adminToken(PROD.svc), adminToken(STG.svc)]);
PROD.admin = tok[0]; STG.admin = tok[1];
if (!PROD.admin || !STG.admin) {
  // surface WHY (the GitHub-secret RAILWAY_API_TOKEN must be a Railway token with project access)
  const probe = await j("https://backboard.railway.app/graphql/v2", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ variables(projectId: "${PROJECT}", environmentId: "${ENV}", serviceId: "${PROD.svc}") }` }),
  });
  console.error("could not fetch admin tokens — Railway responded:", probe.status, JSON.stringify(probe.body).slice(0, 300));
  process.exit(1);
}

const CHUNK = 3000; // Cloudflare caps the POST body — chunk big tables (retailers) under the limit.
let failed = false;
for (const name of TABLES) {
  let rows;
  try { rows = await dumpAll(STG, name); }
  catch (e) { console.error(`  ${name}:`, e.message); failed = true; continue; }

  // settings is a key/value store where PROD legitimately holds EXTRA keys (runtime nav state). A
  // wholesale replace would wipe those, so MERGE: prod's rows as the base, staging overrides by key.
  if (name === "settings") {
    try {
      const prod = await dumpAll(PROD, "settings");
      const byKey = new Map(prod.map((r) => [r.key, r]));
      for (const r of rows) byKey.set(r.key, r);
      rows = [...byKey.values()];
    } catch (e) { console.error(`  settings merge:`, e.message); failed = true; continue; }
  }
  if (DRY) { console.log(`  ${name}: ${rows.length} rows (dry-run, not applied)`); continue; }

  // chunk 0 = replace (carries `total` for the floor); the rest = append.
  let ok = true;
  for (let i = 0; i < rows.length || i === 0; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r = await j(`${PROD.url}/api/admin/promote-apply`, {
      method: "POST", headers: { "x-admin-token": PROD.admin, "Content-Type": "application/json" },
      body: JSON.stringify({ name, rows: chunk, mode: i === 0 ? "replace" : "append", total: rows.length }),
    });
    if (!r.ok) { console.error(`  ${name}: PROD apply ${r.status}`, JSON.stringify(r.body).slice(0, 200)); ok = false; failed = true; break; }
  }
  if (ok) console.log(`  ${name}: promoted ${rows.length}`);
}

// ElevenLabs restock-agent persona: staging agent → prod agent (config lives in EL cloud, not the DB).
// Best-effort: needs ELEVENLABS_API_KEY + both agent ids. Logged, never fails the promote.
console.log("note: ElevenLabs persona promote runs in the agent step (EL API) — see promote.yml");

if (failed) { console.error("PROMOTE had errors"); process.exit(1); }
console.log(DRY ? "dry-run complete" : "promote complete");
