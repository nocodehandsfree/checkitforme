// Brevo contact sync — push opt-in emails (set by the user in the You section) to our newsletter /
// alert list so email is decoupled from auth (Brevo owns email; phone owns identity).
const key = () => process.env.BREVO_API_KEY;
const listId = () => { const v = Number(process.env.BREVO_LIST_ID); return Number.isFinite(v) && v > 0 ? v : undefined; };

/** Create/update a Brevo contact (and add to our list if configured). Fire-and-forget; never throws. */
export async function brevoUpsertContact(email: string, attributes?: Record<string, unknown>): Promise<boolean> {
  const k = key();
  if (!k || !email) return false;
  try {
    const body: Record<string, unknown> = { email, updateEnabled: true };
    if (attributes) body.attributes = attributes;
    const list = listId();
    if (list) body.listIds = [list];
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": k, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    return r.ok || r.status === 204; // 201 created · 204 updated
  } catch (e) { console.error("[brevo] upsert", e); return false; }
}
