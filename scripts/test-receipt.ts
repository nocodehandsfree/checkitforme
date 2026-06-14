// Unit test for the kiosk-receipt parser, against the real vendnovation sample.
// Run: ./node_modules/.bin/tsx scripts/test-receipt.ts
import { parseReceipt } from "../src/gmail-receipts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

// A realistic raw HTML body (quoted-printable wrap included) mirroring the sample the owner shared.
const sample = `Content-Transfer-Encoding: quoted-printable
<html><body>
<p>Hi Trainer,</p>
<table><tr><td>Order ID:</td><td>72410838</td></tr>
<tr><td>Approval Number:</td><td>848201</td></tr>
<tr><td>Machine ID:</td><td>Q00514</td></tr>
<tr><td>5/12/2026 7:49 PM</td></tr>
<tr><td>Payment: AMEX XXXX XXXX XXXX 6296</td></tr></table>
<p>Total Items Purchased: 1</p>
<table><tr><td>0196214150478</td><td>Mega Evolution-Perfect Order Booster Bundle (6 Pa=
cks)</td><td>$26.94</td></tr>
<tr><td>Subtotal:</td><td>$26.94</td></tr>
<tr><td>Tax:</td><td>$2.63</td></tr>
<tr><td>Total:</td><td>$29.57</td></tr></table>
</body></html>`;

console.log("▶ parse the vendnovation kiosk receipt");
const r = parseReceipt(sample);
ok(!!r, "parsed (non-null)");
ok(r?.machineId === "Q00514", `machineId = Q00514 (got ${r?.machineId})`);
ok(r?.orderId === "72410838", `orderId = 72410838 (got ${r?.orderId})`);
ok(r?.at === "5/12/2026 7:49 PM", `txn time parsed (got ${r?.at})`);
ok(r?.product === "Mega Evolution-Perfect Order Booster Bundle (6 Packs)", `product name (got ${r?.product})`);
ok(r?.total === "29.57", `total = 29.57 not the subtotal (got ${r?.total})`);

console.log("▶ junk is rejected");
ok(parseReceipt("Hello, this is a normal email with no receipt fields.") === null, "non-receipt → null");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
