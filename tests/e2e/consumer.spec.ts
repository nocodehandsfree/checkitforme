import { test, expect } from "@playwright/test";
import { UA, freshPhone, injectAuth, me, mintToken, withPeek } from "./helpers";

// Consumer render smoke — safe everywhere (@safe): these run against prod right after a promote.
// The write-path journeys live in journeys.spec.ts (staging) and local.spec.ts (dial side).

test("consumer home renders @safe", async ({ page }) => {
  const resp = await page.goto(withPeek("/"));
  expect(resp?.ok(), "homepage should return 2xx").toBeTruthy();
  await expect(page).toHaveTitle(/.+/); // page rendered with a real title
});

test("no uncaught console errors on home @safe", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(withPeek("/"));
  await page.waitForLoadState("networkidle");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

// Every brand skin renders from one codebase (?brand= override mirrors the subdomain routing).
for (const brand of ["pokemon", "onepiece", "toppsbasketball", "needoh"]) {
  test(`brand skin renders: ${brand} @safe`, async ({ page }) => {
    const resp = await page.goto(withPeek(`/?brand=${brand}`));
    expect(resp?.ok(), `${brand} skin should return 2xx`).toBeTruthy();
    await expect(page.locator("#findcard")).toBeVisible({ timeout: 15_000 });
  });
}

test("plans are served live @safe", async ({ page }) => {
  const r = await page.request.get("/pub/plans");
  expect(r.ok(), `/pub/plans → 200 (got ${r.status()})`).toBeTruthy();
  const j = await r.json();
  expect(Array.isArray(j.tiers) && j.tiers.length, "at least one plan tier").toBeTruthy();
});

test("nearby stores are served @safe", async ({ page }) => {
  const r = await page.request.get("/pub/stores/near?lat=34.05&lng=-118.24&radius=25");
  expect(r.ok(), `/pub/stores/near → 200 (got ${r.status()})`).toBeTruthy();
  const j = await r.json();
  expect(Array.isArray(j.stores), "stores array present").toBeTruthy();
});

// ── E2E path harness P0 (docs/specs/e2e-coverage/harness.md) — staging-only additions.
// Each test is independent + idempotent: throwaway accounts minted via the staging fixed code,
// nothing here can dial (sim result ids + the buy sheet stop short of any call path).
test.describe("P0 harness paths (staging)", () => {
  test.skip(process.env.E2E_TARGET === "prod", "mints accounts / uses staging sim — never on prod");

  // P0-1 (balance half — the signup UI walk lives in journeys.spec.ts): a brand-new account
  // lands with exactly the free-check balance the owner set in policy.
  test("P0-1: fresh account starts with pricing.freeChecks", async ({ request }) => {
    const base = new URL(test.info().project.use.baseURL as string).origin;
    const pol = await (await request.get(`${base}/pub/policy`, { headers: UA })).json();
    const token = await mintToken(request, base, freshPhone());
    const acct = await me(request, base, token);
    expect(acct.credits, `new account balance = policy freeChecks (${pol.freeChecks})`).toBe(pol.freeChecks);
  });

  // P0-4: the proof page — a finished result deep-link (/?call=<cid>) shows the verdict, the
  // product, and the transcript. Uses the staging sim result (sim_<ms>_in settles 22s after <ms>),
  // so no real call is ever placed and the test is fully repeatable.
  test("P0-4: proof page shows verdict + product + transcript", async ({ page }) => {
    const cid = `sim_${Date.now() - 60_000}_in`; // started a minute ago → completed
    await page.goto(`/?call=${cid}`);
    await expect(page.locator("#result"), "result screen renders").toBeVisible({ timeout: 20_000 });
    // Product detail (the verdict line) + the clerk's transcript line — both fixed strings in
    // src/staging-sim.ts, so this can't rot when the owner re-words status labels.
    await expect(page.locator("#result"), "verdict line carries the product").toContainText("3-pack blister", { timeout: 15_000 });
    await expect(page.locator("#result"), "transcript proof renders the clerk's answer").toContainText("on the shelf by the registers");
  });

  // P0-5: the plan sheet renders every tier + the PAYG mode, with prices straight from /pub/plans.
  test("P0-5: plan sheet renders all tiers + PAYG with live prices", async ({ page, request }) => {
    const base = new URL(test.info().project.use.baseURL as string).origin;
    const plans = await (await request.get(`${base}/pub/plans`, { headers: UA })).json();
    expect(plans.tiers?.length, "live /pub/plans serves tiers").toBeGreaterThan(0);
    const token = await mintToken(request, base, freshPhone());
    await injectAuth(page, token);
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 20_000 });
    await page.evaluate(() => (window as any).openBuy());
    await expect(page.locator("#buyOverlay")).toHaveClass(/on/);
    const tiles = page.locator("#buy_plans .plan");
    await expect(tiles, `one tile per published tier (${plans.tiers.length})`).toHaveCount(plans.tiers.length, { timeout: 15_000 });
    for (const t of plans.tiers) {
      const dollars = Math.floor((t.monthlyCents ?? t.priceCents ?? 0) / 100);
      await expect(page.locator("#buy_plans"), `${t.key} tile shows its live price ($${dollars})`).toContainText(`$${dollars}`);
    }
    // Pay-as-you-go is the second mode of the same sheet.
    await expect(page.locator("#buymode button").last(), "PAYG mode toggle present").toBeVisible();
  });
});
