// Unit test for the shared geo math (distance + bounding box). Run: ./node_modules/.bin/tsx scripts/test-geo.ts
import { haversineMi, bboxAround } from "../src/geo";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

console.log("▶ haversineMi: distance basics");
ok(haversineMi(40.0, -75.0, 40.0, -75.0) === 0, "distance from a point to itself is 0");
ok(near(haversineMi(0, 0, 1, 0), 69.09, 0.1), "one degree of latitude is ~69 miles");
ok(haversineMi(40.0, -75.0, 40.0, -75.0) >= 0, "distance is never negative");

console.log("▶ haversineMi: symmetry + a known city pair");
const nyc = [40.7128, -74.006] as const, la = [34.0522, -118.2437] as const;
const ab = haversineMi(nyc[0], nyc[1], la[0], la[1]);
const ba = haversineMi(la[0], la[1], nyc[0], nyc[1]);
ok(near(ab, ba, 1e-6), "distance is symmetric (a→b equals b→a)");
ok(near(ab, 2445, 25), "NYC→LA great-circle distance is ~2445 miles");

console.log("▶ haversineMi: longitude degree shrinks with latitude");
const atEquator = haversineMi(0, 0, 0, 1);   // 1° lng at equator
const atMidLat = haversineMi(60, 0, 60, 1);  // 1° lng at 60°N
ok(atEquator > atMidLat, "a degree of longitude is shorter at higher latitude");
ok(near(atMidLat, atEquator * Math.cos((60 * Math.PI) / 180), 0.5), "lng degree scales by cos(lat)");

console.log("▶ bboxAround: box is centered on the point");
const b = bboxAround(40, -75, 10);
ok(b.latMin < 40 && b.latMax > 40, "point latitude is inside the box");
ok(b.lngMin < -75 && b.lngMax > -75, "point longitude is inside the box");
ok(near((b.latMin + b.latMax) / 2, 40, 1e-9), "box is vertically centered on the point");
ok(near((b.lngMin + b.lngMax) / 2, -75, 1e-9), "box is horizontally centered on the point");
ok(near(b.latMax - 40, 10 / 69, 1e-9), "latitude delta is radiusMi/69");

console.log("▶ bboxAround: fully contains the search radius");
// A point exactly radiusMi due north must not fall outside the box.
const r = 25, c = bboxAround(34.05, -118.24, r);
const dueNorth = 34.05 + r / 69;
ok(dueNorth <= c.latMax + 1e-9, "a point radiusMi due north stays within latMax");
// The east edge of the box must sit at least radiusMi away (box contains circle).
const edgeDist = haversineMi(34.05, -118.24, 34.05, c.lngMax);
ok(edgeDist + 1e-6 >= r, "east edge of the box is at least radiusMi from center");

console.log("▶ bboxAround: shrink-proof near the poles");
const polar = bboxAround(89, 0, 10);
ok(isFinite(polar.lngMin) && isFinite(polar.lngMax), "longitude bounds stay finite near the pole");
ok(polar.lngMax - 89 !== Infinity && (polar.lngMax - polar.lngMin) <= (10 / (69 * 0.2)) * 2 + 1e-9, "lng delta is clamped (cos floored at 0.2)");
ok((polar.lngMax - polar.lngMin) / 2 >= 10 / 69, "clamped polar box is at least as wide as an equatorial one");

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
