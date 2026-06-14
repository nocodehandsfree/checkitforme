// Validates the R2 SigV4 presigner. The signing-key chain is checked against AWS's PUBLISHED test
// vector (docs: "Examples of how to derive a signing key"), so we know the crypto is correct without
// a live R2 bucket. Plus structural + determinism checks on the presigned URL.
// Run: ./node_modules/.bin/tsx scripts/test-r2.ts
import { signingKeyHex, presignPut, photoKey, type R2Config } from "../src/r2";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  console.log("▶ SigV4 signing key — AWS published vector");
  const got = await signingKeyHex("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam");
  const want = "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9";
  ok(got === want, `signing key matches AWS vector${got === want ? "" : ` (got ${got})`}`);

  console.log("▶ presigned PUT URL structure");
  const cfg: R2Config = { accountId: "acct123", accessKeyId: "AKIATEST", secretAccessKey: "secretXYZ", bucket: "fungibles-media", publicBase: "https://media.fungibles.com", region: "auto" };
  const fixed = new Date("2026-06-10T08:00:00.000Z");
  const r = await presignPut("community/20260610/abc123.jpg", cfg, "image/jpeg", 600, fixed);
  ok(r.uploadUrl.startsWith("https://acct123.r2.cloudflarestorage.com/fungibles-media/community/20260610/abc123.jpg?"), "uploadUrl host + path-style bucket/key");
  ok(r.uploadUrl.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256"), "has X-Amz-Algorithm");
  ok(r.uploadUrl.includes("X-Amz-Credential=AKIATEST%2F20260610%2Fauto%2Fs3%2Faws4_request"), "credential scope is correct + uri-encoded");
  ok(r.uploadUrl.includes("X-Amz-Date=20260610T080000Z"), "amz date from injected clock");
  ok(r.uploadUrl.includes("X-Amz-Expires=600"), "expiry present");
  ok(r.uploadUrl.includes("X-Amz-SignedHeaders=host"), "signed headers = host");
  ok(/X-Amz-Signature=[0-9a-f]{64}(&|$)/.test(r.uploadUrl), "signature is 64 hex chars");
  ok(r.publicUrl === "https://media.fungibles.com/community/20260610/abc123.jpg", "public URL points at R2_PUBLIC_BASE");

  console.log("▶ determinism + sensitivity");
  const r2 = await presignPut("community/20260610/abc123.jpg", cfg, "image/jpeg", 600, fixed);
  ok(r.uploadUrl === r2.uploadUrl, "same inputs + clock → identical signature");
  const r3 = await presignPut("community/20260610/different.jpg", cfg, "image/jpeg", 600, fixed);
  const sig = (u: string) => u.split("X-Amz-Signature=")[1];
  ok(sig(r.uploadUrl) !== sig(r3.uploadUrl), "different key → different signature");

  console.log("▶ photoKey safety");
  const k = photoKey("JPG");
  ok(/^community\/\d{8}\/[0-9a-f]{16}\.jpg$/.test(k), "photoKey is namespaced, dated, random, lowercased");
  ok(photoKey("../../etc/passwd").endsWith(".jpg"), "bad extension falls back to .jpg");

  console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
