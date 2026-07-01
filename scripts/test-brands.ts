// Unit test for the white-label brand registry. Run: ./node_modules/.bin/tsx scripts/test-brands.ts
import { resolveBrand, allBrandKeys, brandForPath, brandSwitcher } from "../src/brands";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

console.log("▶ resolveBrand: subdomain → brand");
ok(resolveBrand("pokemon.fungibles.com").key === "poke", "pokemon.* resolves to poke");
ok(resolveBrand("onepiece.fungibles.com").key === "onepiece", "onepiece.* resolves to onepiece");
ok(resolveBrand("toppsbasketball.fungibles.com").key === "topps", "toppsbasketball.* resolves to topps");

console.log("▶ resolveBrand: robustness");
ok(resolveBrand("www.pokemon.fungibles.com").key === "poke", "leading www. is ignored");
ok(resolveBrand("POKEMON.fungibles.com").key === "poke", "host is case-insensitive");
ok(resolveBrand("pokemon.fungibles.com:8080").key === "poke", "port is stripped");
ok(resolveBrand("pokefinder.runnr.com").key === "poke", "marketing aliases (pokefinder) resolve");
ok(resolveBrand("onepeice.x.com").key === "onepiece", "common typo alias (onepeice) resolves");

console.log("▶ resolveBrand: override + fallback");
ok(resolveBrand("pokemon.x.com", "onepiece").key === "onepiece", "?brand= override beats the subdomain");
ok(resolveBrand("nope.example.com").key === "runner", "unknown host falls back to the default brand");
ok(resolveBrand("").key === "runner", "empty host falls back to the default brand");

console.log("▶ allBrandKeys");
const keys = allBrandKeys();
ok(keys.includes("runner") && keys.includes("poke") && keys.includes("topps"), "lists the default + verticals");
ok(new Set(keys).size === keys.length, "keys are unique");

console.log("▶ brandForPath: path-segment routing");
ok(brandForPath("pokemon")?.key === "poke", "/pokemon → poke");
ok(brandForPath("pokefinder")?.key === "poke", "/pokefinder (alias) → poke");
ok(brandForPath("needoh")?.key === "needoh", "/needoh → needoh");
ok(brandForPath("app") === null, "the default brand is not a path vertical (/app → null)");
ok(brandForPath("runner") === null, "/runner → null");
ok(brandForPath("totally-unknown") === null, "non-brand path → null");
ok(brandForPath("") === null, "empty path → null");

console.log("▶ brandSwitcher");
const sw = brandSwitcher();
ok(!sw.some((b) => b.key === "runner"), "switcher excludes the default 'all products' brand");
ok(sw.length === allBrandKeys().length - 1, "switcher = every vertical except the default");
ok(sw.find((b) => b.key === "topps")?.tag === "NBA", "topps carries the 'NBA' qualifier tag");
ok(!("tag" in (sw.find((b) => b.key === "poke") || {})), "poke has no tag (logo doesn't need a qualifier)");
ok(sw.every((b) => typeof b.logoUrl === "string"), "every entry has a (possibly empty) logoUrl string");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
