import { test, expect } from "@playwright/test";

// Admin (public/app.html). Needs ADMIN_TOKEN to mint the admin_session cookie via /admin-login.
// Pull ADMIN_TOKEN from Railway (command in docs/team/devops/handoff.md), then: ADMIN_TOKEN=… npm run e2e
const TOKEN = process.env.ADMIN_TOKEN || "";

test.describe("admin", () => {
  test.skip(!TOKEN, "set ADMIN_TOKEN to run admin E2E");

  test("token login → admin shell loads", async ({ page }) => {
    await page.goto(`/admin-login?token=${encodeURIComponent(TOKEN)}`);
    const resp = await page.goto("/");
    expect(resp?.ok(), "admin shell should load after login").toBeTruthy();
    await expect(page).toHaveTitle(/.+/);
  });
});

// TODO(team): per-tab smoke (Calls, Stores, Chains, Statuses) + the trainer Map / Confirm-stock flow
// + the statuses editor. One assertion per admin path before launch.
