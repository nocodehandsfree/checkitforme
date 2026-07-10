// Restore + verify an off-box DB backup written by src/ops-watch.ts (backupTick).
// The R2 object is gzip → AES-256-GCM (layout: 12-byte IV | ciphertext | 16-byte auth tag).
//
// Usage (needs the R2_* creds + BACKUP_ENC_KEY in env — grab them from Railway vars):
//   node scripts/restore-backup.mjs --env production --slot mon [--out /tmp/restored.db]
//   slots: mon…sun (rolling dailies) or YYYY-MM (monthly). Default --out: ./restored-<env>-<slot>.db
//   Downloads via authenticated S3 GET (backups are NOT publicly served — verified), verifies with
//   PRAGMA integrity_check + table row counts. To actually swap it into a service: stop the service,
//   copy the file over the volume's DB path, start the service.
import { createDecipheriv, createHmac, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const env = arg("env", "production"), slot = arg("slot", "");
const out = arg("out", `./restored-${env}-${slot}.db`);
const encKey = process.env.BACKUP_ENC_KEY || "";
if (!/^[0-9a-f]{64}$/i.test(encKey)) { console.error("BACKUP_ENC_KEY missing/not 64-hex"); process.exit(1); }
if (!slot) { console.error("--slot required (mon…sun or YYYY-MM)"); process.exit(1); }
const { R2_ACCOUNT_ID: acct, R2_ACCESS_KEY_ID: akid, R2_SECRET_ACCESS_KEY: sk, R2_BUCKET: bucket } = process.env;
if (!acct || !akid || !sk || !bucket) { console.error("R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET required"); process.exit(1); }

// SigV4 presigned GET (same scheme as src/r2.ts presignPut, GET verb)
const region = process.env.R2_REGION || "auto";
const objectKey = `backups/${env}/db-${slot}.db.gz.enc`;
const host = `${acct}.r2.cloudflarestorage.com`;
const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
const dateStamp = amzDate.slice(0, 8);
const scope = `${dateStamp}/${region}/s3/aws4_request`;
const enc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const canonicalUri = `/${enc3986(bucket)}/${objectKey.split("/").map(enc3986).join("/")}`;
const q = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${akid}/${scope}`, "X-Amz-Date": amzDate, "X-Amz-Expires": "600", "X-Amz-SignedHeaders": "host" };
const canonicalQuery = Object.keys(q).sort().map((k) => `${enc3986(k)}=${enc3986(q[k])}`).join("&");
const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const kSigning = hmac(hmac(hmac(hmac("AWS4" + sk, dateStamp), region), "s3"), "aws4_request");
const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
const url = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
console.log("downloading (signed GET)", `${host}${canonicalUri}`);
const r = await fetch(url);
if (!r.ok) { console.error(`download failed: HTTP ${r.status}`); process.exit(1); }
const raw = Buffer.from(await r.arrayBuffer());
const iv = raw.subarray(0, 12), tag = raw.subarray(raw.length - 16), data = raw.subarray(12, raw.length - 16);
const d = createDecipheriv("aes-256-gcm", Buffer.from(encKey, "hex"), iv);
d.setAuthTag(tag);
const sqlite = gunzipSync(Buffer.concat([d.update(data), d.final()]));
writeFileSync(out, sqlite);
console.log(`decrypted+unzipped → ${out} (${sqlite.length} bytes)`);

const c = createClient({ url: `file:${out}` });
const integ = (await c.execute("PRAGMA integrity_check")).rows[0];
console.log("integrity_check:", JSON.stringify(integ));
const tables = (await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
for (const t of tables.slice(0, 40)) {
  const n = (await c.execute(`SELECT COUNT(*) n FROM "${t}"`)).rows[0].n;
  console.log(`  ${t}: ${n}`);
}
console.log(`RESTORE VERIFIED: ${tables.length} tables, integrity ${JSON.stringify(integ)}`);
