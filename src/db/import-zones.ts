// CLI: import zones + stores from a JSON file, then geocode for the map.
//   pnpm db:import-zones [path]   (default: ./data/zones.json)
import { readFileSync } from "node:fs";
import { db, client } from "./client";
import { retailers } from "./schema";
import { isNull } from "drizzle-orm";
import { importZonesData, geocodeMissing, type InFile } from "./import-data";

const path = process.argv[2] ?? "./data/zones.json";
const data: InFile = JSON.parse(readFileSync(path, "utf8"));

const counts = await importZonesData(data);
console.log(`Imported: ${counts.zones} zones, ${counts.stores} stores, ${counts.links} links.`);

// Geocode any stores still missing coordinates (≤1/sec).
let remaining = (await db.select().from(retailers).where(isNull(retailers.lat))).filter((r) => r.address).length;
console.log(`Geocoding ${remaining} stores…`);
while (remaining > 0) {
  await geocodeMissing(1);
  await new Promise((r) => setTimeout(r, 1100));
  remaining--;
}
console.log("Done.");
client.close();
