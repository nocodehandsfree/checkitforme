// Unit test for the store-import normalizers. Run: ./node_modules/.bin/tsx scripts/test-storesimport.ts
import { regionForState, tzForState, normCarries, e164 } from "../src/stores-import";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m} (got ${JSON.stringify(a)})`);

console.log("▶ regionForState");
eq(regionForState("CA"), "West Coast", "CA → West Coast");
eq(regionForState("TX"), "Southwest", "TX → Southwest");
eq(regionForState("FL"), "Southeast", "FL → Southeast");
eq(regionForState("ny"), "Northeast", "lowercase ny → Northeast (case-folded)");
eq(regionForState(undefined), null, "missing state → null");
eq(regionForState(""), null, "empty state → null");
eq(regionForState("ZZ"), null, "unknown state → null");

console.log("▶ tzForState");
eq(tzForState("CA"), "America/Los_Angeles", "CA → Los_Angeles");
eq(tzForState("AZ"), "America/Phoenix", "AZ → Phoenix (no DST)");
eq(tzForState("TX"), "America/Chicago", "TX → Chicago");
eq(tzForState("HI"), "Pacific/Honolulu", "HI → Honolulu");
eq(tzForState("ny"), "America/New_York", "lowercase ny → New_York (case-folded)");
eq(tzForState(undefined), "America/Chicago", "missing state → Chicago default");
eq(tzForState("ZZ"), "America/Chicago", "unknown state → Chicago default");

console.log("▶ normCarries");
eq(normCarries(["Pokémon", " One Piece "]), "Pokémon,One Piece", "array is trimmed + comma-joined");
eq(normCarries("a, b ,c"), "a,b,c", "comma string is split + trimmed");
eq(normCarries("Pokemon"), "Pokemon", "single label passes through");
eq(normCarries([]), null, "empty array → null");
eq(normCarries(""), null, "empty string → null");
eq(normCarries([" ", ""]), null, "all-blank entries → null");
eq(normCarries(["a", 123]), "a,123", "non-string array entries are coerced");
eq(normCarries({ x: 1 }), null, "non-array/non-string → null");
eq(normCarries(null), null, "null → null");

console.log("▶ e164");
eq(e164("(555) 123-4567"), "+15551234567", "10-digit US number → +1…");
eq(e164("5551234567"), "+15551234567", "bare 10 digits → +1…");
eq(e164("15551234567"), "+15551234567", "11 digits starting with 1 → +…");
eq(e164("+1 (555) 123-4567"), "+15551234567", "already-+ number is cleaned, prefix kept");
eq(e164("+44 7555 123456"), "+447555123456", "international + number is preserved");
eq(e164(""), "", "empty input → empty string");
eq(e164("abc"), "", "no digits → empty string");
eq(e164("123"), "+123", "odd-length digits → bare + prefix (best effort)");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
