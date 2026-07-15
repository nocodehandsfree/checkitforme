import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Launch-gate E2E config — run via `bash scripts/launch-gate.sh` (the one command).
// Targets (E2E_TARGET):
//   staging (default) — full user journeys against staging.checkitforme.com. Writes are fine;
//                       NOTHING here may dial (staging runs STAGING_CALLS=1 → real calls).
//   local             — boots a throwaway server (calls hard-disabled) for the dial-side
//                       journeys: check → verdict (simulated), zone fire, schedules.
//   prod              — read-only @safe subset against checkitforme.com, run right after a promote.
// E2E_BASE_URL overrides the URL for any target. Admin specs need ADMIN_TOKEN (launch-gate.sh
// self-fetches it from Railway).
const TARGET = (process.env.E2E_TARGET || "staging") as "staging" | "prod" | "local";
const LOCAL_PORT = Number(process.env.E2E_LOCAL_PORT || 8798);
const BASE =
  process.env.E2E_BASE_URL ||
  (TARGET === "prod"
    ? "https://checkitforme.com"
    : TARGET === "local"
      ? `http://127.0.0.1:${LOCAL_PORT}`
      : "https://staging.checkitforme.com");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The journeys share one account serially (signup → pay → schedule → zone) — determinism
  // beats speed on a suite this small.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    geolocation: { latitude: 34.05, longitude: -118.24 }, // LA — matches the local seed + a dense real-store area
    permissions: ["geolocation"],
    // Agent sandboxes route HTTPS through a TLS-intercepting proxy whose MITM resets Chromium's
    // TLS 1.3 ClientHello — cap the browser at TLS 1.2 and hand it the proxy explicitly.
    // No-op outside those sandboxes (and for the local target, which never leaves 127.0.0.1).
    ...(process.env.HTTPS_PROXY && TARGET !== "local"
      ? { proxy: { server: process.env.HTTPS_PROXY }, ignoreHTTPSErrors: true }
      : {}),
  },
  grep: TARGET === "prod" ? /@safe/ : undefined,
  // local target runs ONLY the dial-side spec; live targets run everything except it.
  testMatch: TARGET === "local" ? ["**/local.spec.ts"] : undefined,
  testIgnore: TARGET === "local" ? undefined : ["**/local.spec.ts"],
  // Agent sandboxes pre-install Chromium at /opt/pw-browsers/chromium and pin a different
  // Playwright build number — point at the real binary instead of re-downloading (~150MB).
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          ...(process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`)
            ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
            : {}),
          ...(process.env.HTTPS_PROXY && TARGET !== "local" ? { args: ["--ssl-version-max=tls1.2"] } : {}),
        },
      },
    },
  ],
  webServer:
    TARGET === "local"
      ? {
          command: `env DATABASE_URL=file:./.t-gate.db PORT=${LOCAL_PORT} STAGING=1 SESSION_SECRET=e2e-local-gate-secret-0123456789abcdef ADMIN_TOKEN=${process.env.ADMIN_TOKEN || "e2e-local-admin"} ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/e2e-local-boot.ts`,
          url: `http://127.0.0.1:${LOCAL_PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 90_000,
        }
      : undefined,
});
