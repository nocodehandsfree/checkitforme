import { defineConfig, devices } from "@playwright/test";

// E2E path tests for Check — the consumer site (public/checkit.html) and the admin (public/app.html).
// Runs against STAGING by default (never prod for write paths). Override with E2E_BASE_URL. For anything
// that places a call, use the owner-only Fun store from Admin → Testing. Admin specs need ADMIN_TOKEN
// (pull it from Railway — see docs/team/devops/handoff.md). See tests/e2e/README.md.
const BASE = process.env.E2E_BASE_URL || "https://staging.checkitforme.com";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
