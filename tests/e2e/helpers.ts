import { APIRequestContext, Page, expect } from "@playwright/test";

// Shared helpers for the launch-gate E2E suite (see README.md in this folder).

// Staging fixed login code (src/auth.ts STAGING_LOGIN_CODE) — no real SMS is sent on staging.
export const LOGIN_CODE = process.env.E2E_LOGIN_CODE || "000000";

// The admin API wants a browser-looking UA or Cloudflare can 1010 it (see docs/team/devops/checkpoint.md).
export const UA = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

/** Fresh fictional US number (555-01xx style block) — one account per gate run.
 *  On staging /auth/phone/check accepts the fixed code with NO prior /start, so minting accounts
 *  this way never touches Twilio and never trips the `lead` 8/hr rate limit. */
export function freshPhone(): string {
  const n = String(Date.now() % 10_000_000).padStart(7, "0");
  return `+1310${n.slice(0, 3)}${n.slice(3)}`;
}

/** Mint a session token straight from the API (staging/local only — prod would need a real SMS). */
export async function mintToken(request: APIRequestContext, base: string, phone: string): Promise<string> {
  const r = await request.post(`${base}/auth/phone/check`, {
    headers: UA,
    data: { phone, code: LOGIN_CODE },
  });
  expect(r.ok(), `POST /auth/phone/check should mint a session (got ${r.status()})`).toBeTruthy();
  const j = await r.json();
  expect(j.token, "phone/check returns a token").toBeTruthy();
  return j.token as string;
}

/** GET /app/me for a token — the account truth (credits, subscription, features). */
export async function me(request: APIRequestContext, base: string, token: string): Promise<any> {
  const r = await request.get(`${base}/app/me`, { headers: { ...UA, Authorization: `Bearer ${token}` } });
  expect(r.ok(), `GET /app/me should be 200 (got ${r.status()})`).toBeTruthy();
  return r.json();
}

/** Log the browser in before page load (the site boots its session from localStorage cifm_token). */
export async function injectAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => {
    localStorage.setItem("cifm_token", t as string);
    localStorage.setItem("runnr_authed", "1");
  }, token);
}

/** Bearer + UA headers for /app/* API calls. */
export function bearer(token: string): Record<string, string> {
  return { ...UA, Authorization: `Bearer ${token}` };
}

/** Append the prod peek code (E2E_PEEK) so the gate can walk prod while the splash is up (A8).
 *  First hit sets the peek cookie for the whole browser context; no-op when E2E_PEEK is unset. */
export function withPeek(path: string): string {
  const peek = process.env.E2E_PEEK;
  if (!peek) return path;
  return path + (path.includes("?") ? "&" : "?") + "peek=" + encodeURIComponent(peek);
}

/** Fill Stripe's Payment Element with the 4242 test card and submit via #co_cta. The checkout
 *  overlay (#coOverlay) must already be open. Shared by the subscription + PAYG pay journeys. */
export async function payWithTestCard(page: Page): Promise<void> {
  await expect(page.locator("#coOverlay")).toHaveClass(/on/, { timeout: 20_000 });
  const frame = page.frameLocator("#co_pay_el iframe").first();
  const cardNumber = frame.locator('input[name="number"]');
  if (!(await cardNumber.isVisible().catch(() => false))) {
    await frame.locator("text=Card").first().click({ timeout: 10_000 }).catch(() => {});
  }
  await cardNumber.fill("4242 4242 4242 4242", { timeout: 20_000 });
  await frame.locator('input[name="expiry"]').fill("12 / 34");
  await frame.locator('input[name="cvc"]').fill("123");
  const postal = frame.locator('input[name="postalCode"]');
  if (await postal.isVisible().catch(() => false)) await postal.fill("90210");
  await expect(page.locator("#co_cta")).toBeEnabled({ timeout: 20_000 });
  await page.click("#co_cta");
}
