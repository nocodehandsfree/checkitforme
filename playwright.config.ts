import { defineConfig, devices } from "@playwright/test";

// E2E path tests for Check — the consumer site (public/checkit.html) and the admin (public/app.html).
// One environment now (no staging): runs against the live site by default. Override with E2E_BASE_URL.
// These specs are READ-path only; for anything that places a call/writes data, use the owner-only Fun
// store from Admin → Testing (never real-store write paths). Admin specs need ADMIN_TOKEN (pull it from
// Railway — see docs/handoffs/devops.md). See tests/e2e/README.md.
const BASE = process.env.E2E_BASE_URL || "https://checkitforme.com";

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
