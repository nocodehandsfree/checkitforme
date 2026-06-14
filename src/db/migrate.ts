// Apply generated migrations (./drizzle) to the local libsql database.
//   pnpm db:generate   # write SQL from schema.ts
//   pnpm db:migrate    # apply it
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, client } from "./client";

await migrate(db, { migrationsFolder: "./drizzle" });
client.close();
console.log("Migrations applied.");
