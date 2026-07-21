import { test, expect } from "@playwright/test";

// Admin UI smoke — drives THE Admin (admin.checkitforme.com; there is only one, it reads live prod
// data). Read-only: log in, open the main tabs, assert each section actually rendered. Runs when
// E2E_ADMIN_UI=1 (launch-gate.sh sets it on the prod pass) — the staging pass covers the same
// backend via admin-api.spec.ts instead, because app.html is only served on admin.* hosts.

const TOKEN = process.env.ADMIN_TOKEN || "";
const ADMIN_URL = process.env.E2E_ADMIN_URL || "https://admin.checkitforme.com";
const ENABLED = process.env.E2E_ADMIN_UI === "1";

test.describe("admin UI @safe", () => {
  test.skip(!ENABLED || !TOKEN, "set E2E_ADMIN_UI=1 + ADMIN_TOKEN to drive the Admin UI");

  test("token login → shell + main tabs render", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin-login?token=${encodeURIComponent(TOKEN)}`);
    const resp = await page.goto(`${ADMIN_URL}/`);
    expect(resp?.ok(), "admin shell should load after login").toBeTruthy();
    await expect(page).toHaveTitle(/.+/);

    // Deep-link the core tabs; each section must gain .active and show its distinctive content.
    // Matches the redesigned grouped nav (Calls group: results/feedback/statuses/trees/settings;
    // Testing lives under the Voice group). Markers are the static content containers in each section.
    const tabs: Array<[string, string]> = [
      ["results", "#res_count"], // Calls group: calls feed
      ["feedback", "#fb_list"], // Calls group: verdict feedback
      ["statuses", "#st_list"], // Calls group: statuses editor
      ["trees", "#tr_progress"], // Calls group: chains / mapping (was #tr_stats)
      ["settings", "#set_call"], // Calls group: app settings
      ["testing", "#testing_log"], // Voice group: Fun-store test calls
    ];
    for (const [tab, marker] of tabs) {
      await page.goto(`${ADMIN_URL}/${tab}`);
      await expect(page.locator(`section#${tab}`), `${tab} section active`).toHaveClass(/active/, { timeout: 20_000 });
      await expect(page.locator(marker), `${tab} content rendered`).toBeAttached({ timeout: 20_000 });
    }
  });
});
