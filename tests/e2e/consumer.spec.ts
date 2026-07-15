import { test, expect } from "@playwright/test";
import { withPeek } from "./helpers";

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
