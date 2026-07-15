import { test, expect } from "@playwright/test";
import { UA } from "./helpers";

// Admin backend smoke — read-only, token-header auth (the same surface app.html rides). Safe on
// any env (@safe), so the post-promote prod run proves the operator dashboard's data feeds too.
// ADMIN_TOKEN comes from the env launch-gate.sh targets (it self-fetches from Railway).

const TOKEN = process.env.ADMIN_TOKEN || "";
const H = { ...UA, "x-admin-token": TOKEN };

test.describe("admin API smoke @safe", () => {
  test("health endpoint is open and green", async ({ request }) => {
    const r = await request.get("/api/health", { headers: UA });
    expect(r.ok(), `/api/health → 200 (got ${r.status()})`).toBeTruthy();
  });

  test("admin wall: no token → 401", async ({ request }) => {
    const r = await request.get("/api/policy", { headers: UA });
    expect(r.status()).toBe(401);
  });

  test.describe("with token", () => {
    test.skip(!TOKEN, "set ADMIN_TOKEN (launch-gate.sh fetches it from Railway)");

    test("policy serves the call-behavior contract", async ({ request }) => {
      const r = await request.get("/api/policy", { headers: H });
      expect(r.ok(), `/api/policy → 200 (got ${r.status()})`).toBeTruthy();
      const j = await r.json();
      expect(j.flags, "policy has flags").toBeTruthy();
      expect(j.pricing, "policy has pricing").toBeTruthy();
    });

    test("calls feed serves rows", async ({ request }) => {
      const r = await request.get("/api/results?limit=5", { headers: H });
      expect(r.ok(), `/api/results → 200 (got ${r.status()})`).toBeTruthy();
      const j = await r.json();
      expect(Array.isArray(j.rows), "results feed has a rows array").toBeTruthy();
    });

    test("statuses registry serves", async ({ request }) => {
      const r = await request.get("/api/statuses", { headers: H });
      expect(r.ok(), `/api/statuses → 200 (got ${r.status()})`).toBeTruthy();
    });

    test("admin overview serves", async ({ request }) => {
      const r = await request.get("/api/admin/overview", { headers: H });
      expect(r.ok(), `/api/admin/overview → 200 (got ${r.status()})`).toBeTruthy();
    });
  });
});
