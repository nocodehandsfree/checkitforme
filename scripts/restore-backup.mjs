// Restore + verify an off-box DB backup written by src/ops-watch.ts (backupTick).
// The R2 object is gzip → AES-256-GCM (layout: 12-byte IV | ciphertext | 16-byte auth tag).
//
// Usage:
//   BACKUP_ENC_KEY=<64-hex> node scripts/restore-backup.mjs --env production --slot mon [--out /tmp/restored.db]
//   slots: mon…sun (rolling dailies) or YYYY-MM (monthly). Default --out: ./restored-<env>-<slot>.db
//   Verifies with PRAGMA integrity_check + table row counts. To actually swap it into a service,
//   stop the service, copy the file over the volume's DB path, start the service.
import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const env = arg("env", "production"), slot = arg("slot", "");
const out = arg("out", `./restored-${env}-${slot}.db`);
const encKey = process.env.BACKUP_ENC_KEY || "";
const base = (process.env.R2_PUBLIC_BASE || "https://logos.fungibles.com").replace(/\/$/, "");
if (!/^[0-9a-f]{64}$/i.test(encKey)) { console.error("BACKUP_ENC_KEY missing/not 64-hex"); process.exit(1); }
if (!slot) { console.error("--slot required (mon…sun or YYYY-MM)"); process.exit(1); }

const url = `${base}/backups/${env}/db-${slot}.db.gz.enc`;
console.log("downloading", url);
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
