import { test, expect } from "@playwright/test";
import { LOGIN_CODE, UA, bearer, freshPhone, injectAuth, me } from "./helpers";

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
    await expect(page.locator("#coOverlay")).toHaveClass(/on/, { timeout: 20_000 });

    // Stripe Payment Element (test mode) — fill the 4242 card inside Stripe's iframe.
    const frame = page.frameLocator("#co_pay_el iframe").first();
    const cardNumber = frame.locator('input[name="number"]');
    if (!(await cardNumber.isVisible().catch(() => false))) {
      // accordion layout: expand the Card method first
      await frame.locator("text=Card").first().click({ timeout: 10_000 }).catch(() => {});
    }
    await cardNumber.fill("4242 4242 4242 4242", { timeout: 20_000 });
    await frame.locator('input[name="expiry"]').fill("12 / 34");
    await frame.locator('input[name="cvc"]').fill("123");
    const postal = frame.locator('input[name="postalCode"]');
    if (await postal.isVisible().catch(() => false)) await postal.fill("90210");

    await expect(page.locator("#co_cta")).toBeEnabled({ timeout: 20_000 });
    await page.click("#co_cta");

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
});
