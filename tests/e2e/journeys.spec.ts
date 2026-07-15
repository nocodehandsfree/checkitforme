import { test, expect } from "@playwright/test";
import { LOGIN_CODE, UA, bearer, freshPhone, injectAuth, me, mintToken, payWithTestCard } from "./helpers";

// The live-staging user journeys — one fresh account carried through signup → store find →
// upgrade+pay (Stripe TEST 4242) → scheduled check → zone. Serial by design: each step is the
// setup for the next, exactly like a real user's first session.
//
// ⚠️ NO test in this file may place a call. Staging currently runs with STAGING_CALLS=1 (the owner
// tests real calls there), so pressing the final Check button WOULD dial a real store. The dial-side
// journeys (check → verdict, zone fire) are covered in local.spec.ts against a server where calling
// is hard-disabled. Schedules created here are deleted in the same test so the scheduler tick can
// never fire them for real.

test.describe.configure({ mode: "serial" });

const PHONE = freshPhone();
let token = "";

test.describe("consumer journeys (staging)", () => {
  test.skip(!!process.env.E2E_TARGET && process.env.E2E_TARGET === "prod", "write journeys never run on prod");

  test("signup: phone → staging code → logged in", async ({ page }) => {
    await page.goto("/");
    await page.click("#authpill");
    await expect(page.locator("#authOverlay")).toHaveClass(/on/);
    await page.fill("#auth_phone", PHONE.replace("+1", ""));
    await page.click("#auth_send");
    await expect(page.locator("#auth_step_code")).toBeVisible();
    // Staging prefills the dev code; if the prefill's oninput already auto-verified, skip the click.
    const prefilled = await page.inputValue("#auth_code");
    if (!prefilled) await page.fill("#auth_code", LOGIN_CODE);
    if (!(await page.locator("body.authed").count())) {
      await page.click("#auth_verify").catch(() => {});
    }
    await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 15_000 });
    token = (await page.evaluate(() => localStorage.getItem("cifm_token"))) || "";
    expect(token, "session token stored in localStorage").toBeTruthy();
  });

  test("find a store: search → list → call sheet opens (stop before the dial)", async ({ page }) => {
    await injectAuth(page, token);
    await page.goto("/");
    await page.fill("#search", "Los Angeles, CA");
    await page.press("#search", "Enter");
    const rows = page.locator("#storelist .store:not(.shut):not(.coming)");
    await expect(rows.first(), "store list should render open stores").toBeVisible({ timeout: 30_000 });
    await rows.first().click();
    // The call sheet with the primary Check button IS the end of this journey — pressing it on
    // staging would place a REAL call (STAGING_CALLS=1). local.spec.ts drives the dial safely.
    await expect(page.locator("#csheet")).toHaveClass(/on/, { timeout: 15_000 });
    await expect(page.locator("#cs_call")).toBeVisible();
  });

  test("A1: PAYG pack (4242) → credits land, premium features STAY locked", async ({ page, request }) => {
    test.skip(!token, "needs the signup journey's account");
    const base = new URL(test.info().project.use.baseURL as string).origin;
    await injectAuth(page, token);
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 20_000 });
    const before = await me(request, base, token);
    // Buy sheet → Pay-as-you-go mode → CONTINUE → Elements 4242.
    await page.evaluate(() => (window as any).openBuy());
    await expect(page.locator("#buyOverlay")).toHaveClass(/on/);
    const paygTab = page.locator("#buymode button").last();
    await expect(paygTab, "packs toggle renders (v2 buy sheet)").toBeVisible({ timeout: 15_000 });
    await paygTab.click();
    await page.click("#buy_cta");
    await payWithTestCard(page);
    // payment_intent.succeeded webhook grants PAYG credits; no subscription is created.
    await expect
      .poll(async () => (await me(request, base, token)).payg, { timeout: 90_000, intervals: [3_000] })
      .toBeGreaterThan(before.payg);
    const after = await me(request, base, token);
    expect(after.subscription, "PAYG must NOT flip the subscription").toBe("none");
    expect(Object.values(after.features).every((v) => v === false), "PAYG gets ZERO premium features").toBeTruthy();
    // A5 (locked half): the gated backends upsell/deny, not error, for a PAYG-only account.
    const zone = await request.post(`${base}/app/zones`, { headers: bearer(token), data: { name: "x", retailerIds: [1] } });
    expect([401, 403], `zones locked for PAYG (got ${zone.status()})`).toContain(zone.status());
    const sched = await request.post(`${base}/app/schedule`, { headers: bearer(token), data: { retailerId: 1, categoryId: 1, daysOfWeek: "1", timeLocal: "10:00" } });
    expect([402, 403], `schedules locked for PAYG (got ${sched.status()})`).toContain(sched.status());
  });

  test("upgrade + pay: plan tile → Stripe Elements 4242 → subscription active", async ({ page, request }) => {
    test.skip(!token, "needs the signup journey's account");
    await injectAuth(page, token);
    await page.goto("/");
    // Wait for the session to actually load (pill flips from anon) before driving the account sheet.
    await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 20_000 });
    await expect(page.locator("#authpill")).not.toHaveClass(/anon/, { timeout: 20_000 });
    // openBuy() is exactly what the account sheet's plan row calls (closeAccount();openBuy()) —
    // invoking it directly skips a flaky sheet-to-sheet animation race, not any real logic.
    await page.evaluate(() => (window as any).openBuy());
    await expect(page.locator("#buyOverlay")).toHaveClass(/on/);
    const tile = page.locator("#buy_plans .plan").first();
    await expect(tile, "plan tiles render from live /pub/plans").toBeVisible({ timeout: 15_000 });
    await tile.click();
    // v2 skin: tap selects, CONTINUE buys. v1: the tap itself starts checkout.
    const cta = page.locator("#buy_cta");
    if (await cta.isVisible().catch(() => false)) await cta.click();
    await payWithTestCard(page);

    // Entitlement lands via the Stripe TEST webhook → /app/me flips. This asserts the whole
    // billing pipe: intent → confirm → webhook → plan on the account.
    const base = new URL(test.info().project.use.baseURL as string).origin;
    await expect
      .poll(async () => (await me(request, base, token)).subscription ?? "none", {
        timeout: 90_000,
        intervals: [3_000],
      })
      .toBe("active");
  });

  test("scheduled check: create → listed → delete (never left live)", async ({ page, request }) => {
    test.skip(!token, "needs the signup journey's account");
    const base = new URL(test.info().project.use.baseURL as string).origin;
    await injectAuth(page, token);
    await page.goto("/");
    // A schedule needs a selected store: re-run the pick, then open the schedule sheet.
    await page.fill("#search", "Los Angeles, CA");
    await page.press("#search", "Enter");
    const rows = page.locator("#storelist .store:not(.shut):not(.coming)");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await rows.first().click();
    await expect(page.locator("#csheet")).toHaveClass(/on/, { timeout: 15_000 });
    await page.evaluate(() => (window as any).openSchedule());
    await expect(page.locator("#scheduleOverlay")).toHaveClass(/on/);
    // pick two days + leave the default time, then submit
    await page.locator("#sch_days .chip").nth(1).click();
    await page.locator("#sch_days .chip").nth(4).click();
    await page.click("#sch_btn");

    let schedId: number | null = null;
    try {
      await expect
        .poll(async () => {
          const r = await request.get(`${base}/app/schedules`, { headers: bearer(token) });
          const list = r.ok() ? await r.json() : [];
          schedId = list?.[0]?.id ?? null;
          return Array.isArray(list) ? list.length : 0;
        }, { timeout: 15_000 })
        .toBeGreaterThan(0);
    } finally {
      // ALWAYS delete — staging places real calls, a leftover schedule would dial a real store later.
      if (schedId != null) {
        const del = await request.delete(`${base}/app/schedules/${schedId}`, { headers: bearer(token) });
        expect(del.ok(), "schedule cleanup delete succeeds").toBeTruthy();
      }
    }
    const after = await request.get(`${base}/app/schedules`, { headers: bearer(token) });
    expect(((await after.json()) as any[]).length, "no schedule left behind").toBe(0);
  });

  test("zones: sheet opens for a member + create/quote/delete round-trip", async ({ page, request }) => {
    test.skip(!token, "needs the signup journey's account");
    const base = new URL(test.info().project.use.baseURL as string).origin;
    await injectAuth(page, token);
    await page.goto("/");
    // UI: the zones sheet renders for a paying member (paywall card would show otherwise).
    await page.evaluate(() => (window as any).openZones());
    await expect(page.locator("#zones")).toHaveClass(/on/);
    await expect(page.locator("#zmodal")).toBeVisible();

    // Backend round-trip (create → listed → quote → delete). Zone FIRE is deliberately absent —
    // on staging it would dial real stores; local.spec.ts proves the fire path.
    const near = await request.get(`${base}/pub/stores/near?lat=34.05&lng=-118.24&radius=25`, { headers: UA });
    expect(near.ok(), "stores/near serves the zone candidates").toBeTruthy();
    const stores = ((await near.json()).stores || []).slice(0, 2);
    expect(stores.length, "at least 2 nearby stores to build a zone from").toBeGreaterThanOrEqual(2);
    const ids = stores.map((s: any) => s.id);

    const created = await request.post(`${base}/app/zones`, {
      headers: bearer(token),
      data: { name: "Launch-gate zone", retailerIds: ids },
    });
    expect(created.status(), "zone create → 201").toBe(201);
    const zone = await created.json();
    try {
      const list = await request.get(`${base}/app/zones`, { headers: bearer(token) });
      expect(((await list.json()) as any[]).some((z) => z.id === zone.id), "zone appears in the list").toBeTruthy();
      const quote = await request.get(`${base}/app/zones/quote?retailerIds=${ids.join(",")}`, { headers: bearer(token) });
      expect(quote.ok()).toBeTruthy();
      expect((await quote.json()).checks, "quote counts the callable stores").toBeGreaterThan(0);
    } finally {
      const del = await request.delete(`${base}/app/zones/${zone.id}`, { headers: bearer(token) });
      expect(del.ok(), "zone cleanup delete succeeds").toBeTruthy();
    }
  });

  test("A3: subscriber tops up PAYG → both pools live on the account", async ({ page, request }) => {
    test.skip(!token, "needs the signup journey's account");
    const base = new URL(test.info().project.use.baseURL as string).origin;
    const before = await me(request, base, token);
    expect(before.subscription, "still subscribed from the pay journey").toBe("active");
    expect(before.quota, "tier quota pool present").toBeGreaterThan(0);
    expect(before.payg, "A1's PAYG credits survived subscribing").toBeGreaterThan(0);
    // Top up again WHILE subscribed — quota untouched, payg grows.
    await injectAuth(page, token);
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/authed/, { timeout: 20_000 });
    await page.evaluate(() => (window as any).openBuy());
    await expect(page.locator("#buyOverlay")).toHaveClass(/on/);
    const paygTab = page.locator("#buymode button").last();
    await expect(paygTab).toBeVisible({ timeout: 15_000 });
    await paygTab.click();
    await page.click("#buy_cta");
    await payWithTestCard(page);
    await expect
      .poll(async () => (await me(request, base, token)).payg, { timeout: 90_000, intervals: [3_000] })
      .toBeGreaterThan(before.payg);
    const after = await me(request, base, token);
    expect(after.quota, "quota pool unchanged by a PAYG top-up").toBe(before.quota);
    expect(after.credits, "displayed balance = quota + payg").toBe(after.quota + after.payg);
  });

  test("A7: annual checkout price matches the published annual price", async ({ request }) => {
    const base = new URL(test.info().project.use.baseURL as string).origin;
    const plans = await (await request.get(`${base}/pub/plans`, { headers: UA })).json();
    const tier = plans.tiers.find((t: any) => t.annualCents > 0) ?? plans.tiers[0];
    // Fresh throwaway account so the intent's incomplete Stripe sub never touches the journey account.
    const t7 = await mintToken(request, base, freshPhone());
    const r = await request.post(`${base}/app/checkout-intent`, {
      headers: bearer(t7),
      data: { kind: tier.key, annual: true },
    });
    expect(r.ok(), `annual checkout-intent → 200 (got ${r.status()})`).toBeTruthy();
    const intent = await r.json();
    expect(intent.amountCents, `charged annual price = published ${tier.annualCents}¢ for ${tier.key}`).toBe(tier.annualCents);
  });

  test("A4: cancel the subscription → entitlements drop, PAYG credits survive", async ({ request }) => {
    test.skip(!token, "needs the signup journey's account");
    const SK = process.env.E2E_STRIPE_SK || "";
    test.skip(!SK, "set E2E_STRIPE_SK (launch-gate fetches the staging test key) to run the cancel journey");
    const base = new URL(test.info().project.use.baseURL as string).origin;
    const before = await me(request, base, token);
    expect(before.subscription).toBe("active");
    const paygBefore = before.payg;

    // Find our Stripe TEST customer by the metadata the server stamps at intent creation.
    const q = encodeURIComponent(`metadata['clerkUserId']:'phone:${PHONE}'`);
    const found = await request.get(`https://api.stripe.com/v1/customers/search?query=${q}`, {
      headers: { Authorization: `Bearer ${SK}` },
    });
    expect(found.ok(), `stripe customer search → 200 (got ${found.status()})`).toBeTruthy();
    const customer = (await found.json()).data?.[0]?.id;
    expect(customer, "journey account has a Stripe customer").toBeTruthy();
    const subs = await (await request.get(`https://api.stripe.com/v1/subscriptions?customer=${customer}&status=active`, {
      headers: { Authorization: `Bearer ${SK}` },
    })).json();
    expect(subs.data?.length, "one active test subscription to cancel").toBeGreaterThan(0);
    for (const s of subs.data) {
      const del = await request.delete(`https://api.stripe.com/v1/subscriptions/${s.id}`, {
        headers: { Authorization: `Bearer ${SK}` },
      });
      expect(del.ok(), `cancel ${s.id} → 200 (got ${del.status()})`).toBeTruthy();
    }
    // customer.subscription.deleted webhook → entitlements off; PAYG pool must survive.
    await expect
      .poll(async () => (await me(request, base, token)).subscription, { timeout: 90_000, intervals: [3_000] })
      .toBe("none");
    const after = await me(request, base, token);
    expect(after.payg, "PAYG credits survive cancellation").toBe(paygBefore);
    expect(Object.values(after.features).every((v) => v === false), "premium features off after cancel").toBeTruthy();
    // A5 (post-cancel half): the gates lock again.
    const zone = await request.post(`${base}/app/zones`, { headers: bearer(token), data: { name: "x", retailerIds: [1] } });
    expect([401, 403], `zones locked post-cancel (got ${zone.status()})`).toContain(zone.status());
  });
});
