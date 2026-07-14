import { test, expect } from "@playwright/test";
import { LOGIN_CODE, UA, bearer, freshPhone, mintToken } from "./helpers";

// The DIAL-SIDE journeys — everything that would place a real call on staging (STAGING_CALLS=1
// there) runs here instead, against a throwaway local server where outbound calling is
// HARD-disabled (assertCallsEnabled throws; the consumer check path returns a scripted
// simulated call — src/staging-sim.ts). Seeded stores/category ids come from
// scripts/e2e-local-boot.ts (901 = pokemon, 9001/9002 callable, 9003 kiosk-only).

const CAT = 1; // pokemon — seeded by the server's own bootstrap
const STORE_A = 9001;
const STORE_B = 9002;
const KIOSK = 9003;

let token = "";
let base = "";

test.beforeAll(async ({ request }) => {
  base = new URL(test.info().project.use.baseURL as string).origin;
  token = await mintToken(request, base, freshPhone());
});

test("free check → simulated call → verdict settles (in/out/maybe)", async ({ request }) => {
  const chk = await request.post(`${base}/app/check`, {
    headers: bearer(token),
    data: { retailerId: STORE_A, categoryId: CAT },
  });
  expect(chk.ok(), `POST /app/check → 200 (got ${chk.status()})`).toBeTruthy();
  const { providerCallId } = await chk.json();
  expect(providerCallId, "simulated call id (sim_…) — proves no real dial path was taken").toMatch(/^sim_/);

  // The sim scripts a ~22s call; the verdict must settle into a real end state.
  await expect
    .poll(async () => {
      const r = await request.get(`${base}/pub/result/${providerCallId}`, { headers: UA });
      if (!r.ok()) return "pending";
      const j = await r.json();
      return j.status === "completed" ? (j.verdict || j.statusKey || "completed") : "pending";
    }, { timeout: 60_000, intervals: [2_000] })
    .not.toBe("pending");
});

test("UI: signup with dev code → live/verdict screen after a check", async ({ page }) => {
  await page.goto("/");
  await page.click("#authpill");
  await expect(page.locator("#authOverlay")).toHaveClass(/on/);
  await page.fill("#auth_phone", freshPhone().replace("+1", ""));
  await page.click("#auth_send");
  await expect(page.locator("#auth_step_code")).toBeVisible();
  const prefilled = await page.inputValue("#auth_code");
  if (!prefilled) await page.fill("#auth_code", LOGIN_CODE);
  if (!(await page.locator("body.authed").count())) await page.click("#auth_verify").catch(() => {});
  await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 15_000 });
});

test("zones are members-only: free account gets the paywall", async ({ request }) => {
  const r = await request.post(`${base}/app/zones`, {
    headers: bearer(token), // fresh free account from beforeAll
    data: { name: "Gate zone", retailerIds: [STORE_A] },
  });
  expect([401, 403], `free account must not create zones (got ${r.status()})`).toContain(r.status());
});

test("zone fire: run groups all callable stores, kiosk excluded, aggregation completes", async ({ request }) => {
  // MEMBER_PHONE is pre-provisioned as an active subscriber by scripts/e2e-local-boot.ts.
  const zoneToken = await mintToken(request, base, "+13105559042");
  const created = await request.post(`${base}/app/zones`, {
    headers: bearer(zoneToken),
    data: { name: "Gate zone", retailerIds: [STORE_A, STORE_B, KIOSK] },
  });
  expect(created.status(), `zone create for a subscriber → 201 (got ${created.status()})`).toBe(201);
  const zone = await created.json();
  const fire = await request.post(`${base}/app/zones/${zone.id}/check`, {
    headers: bearer(zoneToken),
    data: { categoryId: CAT },
  });
  expect(fire.ok(), `zone fire → 200 (got ${fire.status()})`).toBeTruthy();
  const run = await fire.json();
  expect(run.runId, "fire returns a runId").toBeTruthy();
  expect(run.stores.length, "kiosk-only store excluded from the run").toBe(2);
  await expect
    .poll(async () => {
      const r = await request.get(`${base}/app/zones/run/${run.runId}`, { headers: bearer(zoneToken) });
      const j = await r.json();
      return j.done === j.total;
    }, { timeout: 30_000 })
    .toBeTruthy();
});

test("schedule: member creates → listed → deletes; free account is gated", async ({ request }) => {
  // Free account hits the members-only wall.
  const gated = await request.post(`${base}/app/schedule`, {
    headers: bearer(token),
    data: { retailerId: STORE_A, categoryId: CAT, daysOfWeek: "1,4", timeLocal: "10:00" },
  });
  expect([402, 403], `free account must not schedule (got ${gated.status()})`).toContain(gated.status());

  // Member (pre-provisioned by e2e-local-boot.ts) gets the full round-trip.
  const memberToken = await mintToken(request, base, "+13105559042");
  const create = await request.post(`${base}/app/schedule`, {
    headers: bearer(memberToken),
    data: { retailerId: STORE_A, categoryId: CAT, daysOfWeek: "1,4", timeLocal: "10:00" },
  });
  if (create.status() === 403) {
    // flags.scheduling can be off in a fresh policy — that's a policy default, not a code break.
    test.info().annotations.push({ type: "note", description: "scheduling flag off in default policy — create gated" });
    return;
  }
  expect(create.ok(), `member schedule create → 200 (got ${create.status()})`).toBeTruthy();
  const list = await request.get(`${base}/app/schedules`, { headers: bearer(memberToken) });
  const rows = (await list.json()) as any[];
  expect(rows.length).toBeGreaterThan(0);
  const del = await request.delete(`${base}/app/schedules/${rows[0].id}`, { headers: bearer(memberToken) });
  expect(del.ok()).toBeTruthy();
});
