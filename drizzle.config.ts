import { defineConfig } from "drizzle-kit";

// Local-first: SQLite file. Swaps to Cloudflare D1 (same SQLite dialect) for prod.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "file:./local.db" },
});
