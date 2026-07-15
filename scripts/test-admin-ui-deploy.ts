// Smoke test for the decoupled admin-UI ship path: POST /api/admin/ui-deploy swaps the served
// app.html atomically (volume override), rollback restores the previous version, and a missing or
// corrupt override always falls back to the repo-bundled copy. Consumer routing is untouched.
// Run: env DATABASE_URL=file:./.t-uidep2.db PORT=8792 ADMIN_TOKEN=t RAILWAY_VOLUME_MOUNT_PATH=./.t-vol \
//      ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
//      ./node_modules/.bin/tsx scripts/test-admin-ui-deploy.ts
import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { bootstrap } from "../src/db/bootstrap";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  rmSync("./.t-vol", { recursive: true, force: true });
  await bootstrap();
  await import("../src/server");
  const base = `http://127.0.0.1:${process.env.PORT || "8792"}`;
  await new Promise((r) => setTimeout(r, 400));
  const H = { "x-admin-token": "t" };
  // Node fetch drops a spoofed Host header, so lean on rootHandler's own routing instead: with
  // STAGING unset, a localhost (brand "runner") host serves the ADMIN shell, and ?brand= forces
  // the CONSUMER path — both sides of the fork are reachable without Host tricks.
  const adminHome = async () => (await fetch(`${base}/`)).text();
  const real = readFileSync("public/app.html", "utf8");
  const MARK = "<!-- e2e-admin-ui-deploy-marker -->";

  console.log("▶ before any deploy: the bundled repo copy serves");
  ok((await adminHome()).includes("grpnav"), "admin shell renders from the bundle");
  const v0 = await (await fetch(`${base}/api/admin/ui-version`, { headers: H })).json() as any;
  ok(v0.source === "bundled" && v0.archived === 0, `version reports bundled (got ${v0.source})`);

  console.log("▶ auth + sanity gates");
  ok((await fetch(`${base}/api/admin/ui-deploy`, { method: "POST", body: real })).status === 401, "no token → 401");
  const junk = await fetch(`${base}/api/admin/ui-deploy`, { method: "POST", headers: H, body: "<h1>not the shell</h1>" });
  ok(junk.status === 400, "a page that isn't the admin shell → 400");

  console.log("▶ deploy v1 → served immediately; consumer untouched");
  const v1html = real.replace("</html>", `${MARK}</html>`);
  const dep = await fetch(`${base}/api/admin/ui-deploy`, { method: "POST", headers: { ...H, "x-commit": "e2etest1" }, body: v1html });
  ok(dep.status === 200, `deploy → 200 (got ${dep.status})`);
  ok((await adminHome()).includes(MARK), "admin serves the new shell (marker present)");
  const consumer = await (await fetch(`${base}/?brand=pokemon`)).text();
  ok(!consumer.includes("grpnav") && !consumer.includes(MARK), "consumer site is not the admin shell and untouched");
  const v1 = await (await fetch(`${base}/api/admin/ui-version`, { headers: H })).json() as any;
  ok(v1.source === "override" && v1.meta?.commit === "e2etest1", "version reports the override + its commit");

  console.log("▶ deploy v2 then rollback → v1 restored");
  const v2html = real.replace("</html>", `${MARK}v2</html>`);
  await fetch(`${base}/api/admin/ui-deploy`, { method: "POST", headers: H, body: v2html });
  ok((await adminHome()).includes(`${MARK}v2`), "v2 live");
  const rb = await fetch(`${base}/api/admin/ui-rollback`, { method: "POST", headers: H });
  ok(rb.status === 200, `rollback → 200 (got ${rb.status})`);
  const afterRb = await adminHome();
  ok(afterRb.includes(MARK) && !afterRb.includes(`${MARK}v2`), "previous version serves after rollback");

  console.log("▶ corrupt override → bundled fallback (never a broken Admin)");
  mkdirSync("./.t-vol/admin-ui", { recursive: true });
  writeFileSync("./.t-vol/admin-ui/app.html", "<html>truncated");
  const fb = await adminHome();
  ok(fb.includes("grpnav") && fb.includes("</html>"), "corrupt override is ignored — bundled copy serves");

  rmSync("./.t-vol", { recursive: true, force: true });
  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
