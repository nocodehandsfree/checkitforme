// ONE SET OF RECIPES, ONE PLACE (owner 07-26): "staging and production should be using the exact same
// recipes… powered from the Admin and the mapping section. That should be the ultimate source of truth,
// like the store data API."
//
// So the map has an AUTHORITY, exactly like store data does:
//   • PRODUCTION holds the record. Admin reads and writes it there, and production calls read it there.
//   • STAGING is a follower. When a mapping call on staging learns something, it does not keep a private
//     copy — it writes to the authority and then reads the result back, so both environments end up
//     running the identical recipe. Same for approving or rejecting a version.
//
// Identity across environments is by NAME for a chain and by PHONE for a store — the same keys
// store-sync already uses, because ids are per-database and would silently cross-wire.
//
// If the authority cannot be reached, the call is NEVER lost: the write lands locally and is flagged
// for review, so a network blip costs us a sync, not a mapping call.
import { config } from "../config";

export interface AuthorityTarget { url: string; token: string }

/** Where the record lives, or null when THIS environment is the record (production) or the link is
 *  not configured. Same two variables the store-data pipe already uses. */
export function mapAuthority(): AuthorityTarget | null {
  if (!config.staging.on) return null;                     // production IS the authority
  const url = process.env.STORE_SYNC_URL, token = process.env.STORE_SYNC_TOKEN;
  if (!url || !token) return null;                          // unlinked env (local, preview) → keeps its own
  return { url: url.replace(/\/$/, ""), token };
}
export const isMapFollower = () => !!mapAuthority();

async function call(path: string, body: unknown, timeoutMs = 20_000): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const a = mapAuthority();
  if (!a) return { ok: false, error: "no authority" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(a.url + path, {
      method: "POST", signal: ctl.signal,
      headers: { "x-admin-token": a.token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: `authority ${r.status} ${text.slice(0, 160)}` };
    try { return { ok: true, data: JSON.parse(text) }; } catch { return { ok: true } as const; }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  } finally { clearTimeout(timer); }
}

/** Send a learned route to the record. Returns the authority's resulting ACTIVE map for the chain, so
 *  the follower can stamp itself with exactly what production will run. */
export function pushVersion(payload: {
  chainName: string; storePhone?: string | null; storeName?: string | null;
  recipe: unknown; source: string; call?: unknown; why?: string;
}) {
  return call("/api/admin/map/ingest", payload);
}

/** Approving or rejecting is a decision about the record, so it happens on the record. */
export function pushDecision(payload: { chainName: string; version: number; decision: "approve" | "reject"; by: string; why?: string }) {
  return call("/api/admin/map/decide", payload);
}
