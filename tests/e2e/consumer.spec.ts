import { test, expect } from "@playwright/test";

// Consumer site (public/checkit.html), brand-injected per subdomain. These start as smoke tests;
// the goal before launch is one assertion PER user-facing path (see tests/e2e/README.md).

test("consumer home renders", async ({ page }) => {
  const resp = await page.goto("/");
  expect(resp?.ok(), "homepage should return 2xx").toBeTruthy();
  await expect(page).toHaveTitle(/.+/); // page rendered with a real title
});

test("no uncaught console errors on home", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

// TODO(team): the core money path — find a store → press "Check …" → assert the verdict screen
// resolves to one of in / out / unclear / soon. Fill the selectors from the live staging DOM.
// test("find store → check → verdict", async ({ page }) => { ... });
