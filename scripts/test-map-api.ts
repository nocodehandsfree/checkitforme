// Drives the MAP admin endpoints against a really-running server — the same calls Admin's dashboard
// will make. Boots the app, hits every endpoint, kills it. Nothing is left running.
// Run: env DATABASE_URL=file:./.t-mapapi.db PORT=8798 ADMIN_TOKEN=t ELEVENLABS_API_KEY=test \
//      ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-map-api.ts
import { spawn } from "node:child_process";

const PORT = process.env.PORT || "8798";
const BASE = `http://localhost:${PORT}`;
const H = { "x-admin-token": process.env.ADMIN_TOKEN || "t", "content-type": "application/json" };
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const srv = spawn("./node_modules/.bin/tsx", ["src/server.ts"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  srv.stdout.on("data", (d) => { out += String(d); });
  srv.stderr.on("data", (d) => { out += String(d); });
  try {
    let up = false;
    // A fresh database seeds the whole catalog on first boot, which takes well over a minute — the
    // old 60-second wait passed only because a previous run had left a seeded file behind.
    for (let i = 0; i < 240 && !up; i++) {
      await wait(1000);
      up = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
    }
    if (!up) { console.error(out.slice(-2000)); throw new Error("server never came up"); }

    const rows0 = await fetch(`${BASE}/api/admin/map/graph`, { headers: H }).then((r) => r.json()) as { rows: Array<Record<string, unknown>> };
    ok(Array.isArray(rows0.rows) && rows0.rows.length > 0, `the map screen loads ${rows0.rows?.length} chain rows`);
    // A brand-new database has chains but no routes yet. Learn one the way the other environment does,
    // so this test stands on its own instead of on whatever a previous run happened to leave behind.
    if (!rows0.rows.some((r) => r.mapped)) {
      await fetch(`${BASE}/api/admin/map/ingest`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          chainName: rows0.rows[0].chain,
          recipe: { type: "keypad", seconds: 24, steps: [{ action: "press", value: "2", atSec: 8, afterPrompt: 1 }] },
          source: "test-setup",
          call: { at: Math.floor(Date.now() / 1000), day: "2026-07-27", seconds: 24, reachedHuman: true, path: "press:2" },
        }),
      });
      const again = await fetch(`${BASE}/api/admin/map/graph`, { headers: H }).then((r) => r.json()) as { rows: Array<Record<string, unknown>> };
      rows0.rows = again.rows;
    }
    const mapped = rows0.rows.filter((r) => r.mapped);
    ok(mapped.length > 0, `${mapped.length} of them carry a route`);
    ok(mapped.every((r) => typeof r.confidence === "number" && typeof r.confidenceLabel === "string"), "every mapped row shows how much we trust it");

    const one = mapped[0];
    const detail = await fetch(`${BASE}/api/admin/map/chain/${one.chainId}`, { headers: H }).then((r) => r.json()) as Record<string, unknown[]>;
    ok(Array.isArray(detail.versions) && detail.versions.length > 0, "the chain page shows its version history");
    ok(Array.isArray(detail.observations), "…its observations");
    ok(Array.isArray(detail.unknowns), "…and its open questions");

    const unk = await fetch(`${BASE}/api/admin/map/unknowns`, { headers: H }).then((r) => r.json()) as { unknowns: Array<Record<string, unknown>> };
    ok(Array.isArray(unk.unknowns), `the review queue loads (${unk.unknowns.length} open)`);
    if (unk.unknowns.length) {
      const id = unk.unknowns[0].id;
      const res = await fetch(`${BASE}/api/admin/map/unknown/${id}`, { method: "POST", headers: H, body: JSON.stringify({ status: "dismissed", note: "test" }) }).then((r) => r.json()) as { ok?: boolean };
      ok(res.ok === true, "an item can be closed from the dashboard");
      const after = await fetch(`${BASE}/api/admin/map/unknowns`, { headers: H }).then((r) => r.json()) as { unknowns: unknown[] };
      ok(after.unknowns.length === unk.unknowns.length - 1, "and it leaves the queue");
    }

    const queue = await fetch(`${BASE}/api/admin/map/sweep/queue`, { headers: H }).then((r) => r.json()) as { queue: Array<Record<string, unknown>> };
    ok(Array.isArray(queue.queue), `the sweep queue builds (${queue.queue.length} chains with stores on file)`);
    const ranks = queue.queue.map((q) => Number(q.rank));
    ok(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), "east coast chains are queued before west coast ones");

    const status = await fetch(`${BASE}/api/admin/map/sweep`, { headers: H }).then((r) => r.json()) as { running: boolean };
    ok(status.running === false, "no sweep is running until somebody starts one");

    const badApprove = await fetch(`${BASE}/api/admin/map/version/999999/approve`, { method: "POST", headers: H }).then((r) => r.json()) as { ok: boolean };
    ok(badApprove.ok === false, "approving a version that does not exist fails cleanly");

    // The shared-map endpoints: what the other environment posts when a mapping call learns a route.
    const ingest = await fetch(`${BASE}/api/admin/map/ingest`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        chainName: one.chain, recipe: { type: "keypad", seconds: 18, steps: [{ action: "press", value: "7", atSec: 6, afterPrompt: 1 }] },
        source: "follower", call: { at: Math.floor(Date.now() / 1000), day: "2026-07-26", seconds: 18, reachedHuman: true, path: "press:7" },
      }),
    }).then((r) => r.json()) as { ok?: boolean; version?: number; status?: string };
    ok(ingest.ok === true && typeof ingest.version === "number", `a route from the other environment is accepted (v${ingest.version}, ${ingest.status})`);
    const graph = await fetch(`${BASE}/api/admin/map/graph/${one.chainId}`, { headers: H }).then((r) => r.json()) as { nodes: unknown[]; edges: unknown[] };
    ok(Array.isArray(graph.nodes) && Array.isArray(graph.edges), "the graph behind a chain loads (prompts + what we did)");

    const unknownChain = await fetch(`${BASE}/api/admin/map/ingest`, {
      method: "POST", headers: H, body: JSON.stringify({ chainName: "No Such Chain Anywhere", recipe: { type: "direct", steps: [], seconds: 0 } }),
    });
    ok(unknownChain.status === 404, "a chain the record has never heard of is refused, not invented");

    // A STORE THAT TOOK ITSELF OFF THE WEBSITE IS OFF IT EVERYWHERE A CUSTOMER CAN REACH IT — the
    // list already drops it, and a link straight to that one store has to answer the same way.
    // Driven against the real endpoints, muting and unmuting through the real control.
    // One store of our own, so this stands on its own instead of on whatever the seed happens to hold.
    await fetch(`${BASE}/api/stores/import`, {
      method: "POST", headers: H,
      body: JSON.stringify({ stores: [{ name: "Mute Test Store", location: "Testville", address: "1 Test St", phone: "+15557770001", lat: 34.05, lng: -118.24, state: "CA", timezone: "America/Los_Angeles", chain: "Mute Test Chain" }] }),
    });
    const all = await fetch(`${BASE}/pub/stores`, { headers: H }).then((r) => r.json()) as Array<{ id: number; name: string; lat?: number | null; lng?: number | null }> | { stores?: Array<{ id: number; name: string }> };
    const rows = Array.isArray(all) ? all : (all.stores || []);
    const withLoc = rows.find((r) => r.name === "Mute Test Store") as { id: number; lat: number; lng: number } | undefined;
    const sid = withLoc?.id;
    if (!sid) { ok(false, `there is a store to mute (${rows.length} stores on file)`); }
    else {
      const before = await fetch(`${BASE}/pub/store/${sid}`);
      ok(before.status === 200, "a reachable store's own page loads");
      const m = await fetch(`${BASE}/api/stores/mute`, { method: "POST", headers: H, body: JSON.stringify({ id: sid, muted: true, reason: "menu changed" }) }).then((r) => r.json()) as { muted?: boolean };
      ok(m.muted === true, "muting one store by hand takes");
      const during = await fetch(`${BASE}/pub/store/${sid}`);
      ok(during.status === 404, `its own page is not found while it is off the website (${during.status})`);
      const stock = await fetch(`${BASE}/pub/stock/store/${sid}`);
      ok(stock.status === 404, `and neither is its stock history (${stock.status})`);
      const list = await fetch(`${BASE}/pub/stores/near?lat=${withLoc!.lat}&lng=${withLoc!.lng}&radius=25`).then((r) => r.json()) as { stores?: Array<{ id: number }> };
      ok(!(list.stores || []).some((x) => x.id === sid), "and it is gone from the list a customer sees");
      await fetch(`${BASE}/api/stores/mute`, { method: "POST", headers: H, body: JSON.stringify({ id: sid, muted: false }) });
      const after = await fetch(`${BASE}/pub/store/${sid}`);
      ok(after.status === 200, "and the moment it is back, so is its page");
    }
  } finally {
    srv.kill("SIGKILL");
  }
  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
