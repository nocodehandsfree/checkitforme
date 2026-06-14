// Global app settings (key/value), with sane defaults.
import { eq } from "drizzle-orm";
import { db } from "./client";
import { settings } from "./schema";

const DEFAULTS: Record<string, string> = {
  voicemail_hangup: "true", // master toggle: detect voicemail and hang up without leaving a message
};

export async function getSetting(key: string): Promise<string | null> {
  const row = (await db.select().from(settings).where(eq(settings.key, key)))[0];
  return row?.value ?? DEFAULTS[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function allSettings(): Promise<Record<string, string>> {
  const map: Record<string, string> = { ...DEFAULTS };
  for (const r of await db.select().from(settings)) map[r.key] = r.value;
  return map;
}
