// Local-first SQLite via libsql (prebuilt binaries — no native compile).
// In production this swaps to Cloudflare D1 via drizzle-orm/d1 — schema and queries are identical.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:local.db";

export const client = createClient({ url });
export const db = drizzle(client, { schema });
