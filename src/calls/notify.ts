// Hands-free alerts — tell the owner the moment a store confirms a product is in.
// Channels: "email" (Brevo, works now, includes a deep link), "call" (Twilio voice),
// or "sms" (Twilio — blocked by US carriers until A2P 10DLC registration). Best-effort.
import { config } from "../config";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

export async function notifyInStock(store: string, category: string, retailerId: number, shipmentDay?: string | null) {
  const { channel, ownerPhone, fromNumber, twilioSid, twilioToken, ownerEmail, brevoApiKey, senderEmail } = config.alerts;
  const line = `${store} just confirmed ${category} is in stock${shipmentDay ? `, they restock ${shipmentDay}` : ""}.`;
  const link = `${config.appUrl}/?store=${retailerId}`;

  try {
    if (channel === "email") {
      if (!ownerEmail || !brevoApiKey) return;
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "CheckIt", email: senderEmail },
          to: [{ email: ownerEmail }],
          subject: `🟢 In stock: ${store} — ${category}`,
          htmlContent: `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:520px">
            <h2 style="color:#16a34a;margin:0 0 8px">${esc(store)} — ${esc(category)} is IN 🟢</h2>
            <p style="font-size:15px">${esc(line)}</p>
            <p><a href="${link}" style="display:inline-block;background:#22C55E;color:#06210f;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:700">See the call &amp; transcript →</a></p>
            <p style="color:#999;font-size:12px">CheckIt</p></div>`,
          textContent: `${line}\nSee the call: ${link}`,
        }),
      });
      return;
    }

    // Twilio channels
    if (!ownerPhone || !fromNumber || !twilioSid || !twilioToken) return;
    const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
    const base = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}`;
    const headers = { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" };

    if (channel === "sms") {
      await fetch(`${base}/Messages.json`, { method: "POST", headers,
        body: new URLSearchParams({ From: fromNumber, To: ownerPhone, Body: `🟢 ${line}\nSee the call: ${link}` }) });
    } else {
      const twiml = `<Response><Say voice="Polly.Matthew-Neural">Heads up. ${esc(line)} Again. ${esc(line)}</Say></Response>`;
      await fetch(`${base}/Calls.json`, { method: "POST", headers,
        body: new URLSearchParams({ From: fromNumber, To: ownerPhone, Twiml: twiml }) });
    }
  } catch (e) {
    console.error("alert failed:", e);
  }
}

/** Notify an arbitrary CUSTOMER (restock watch). Email via Brevo, SMS via Twilio. Best-effort. */
export async function notifyContact(channel: "email" | "sms", contact: string, subject: string, body: string, link?: string) {
  const { fromNumber, twilioSid, twilioToken, brevoApiKey, senderEmail } = config.alerts;
  try {
    if (channel === "email") {
      if (!brevoApiKey || !contact.includes("@")) return;
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Runnr", email: senderEmail },
          to: [{ email: contact }],
          subject,
          htmlContent: `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:520px">
            <p style="font-size:15px">${esc(body)}</p>
            ${link ? `<p><a href="${link}" style="display:inline-block;background:#22C55E;color:#06210f;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:700">Check it now →</a></p>` : ""}
            <p style="color:#999;font-size:12px">Runnr · you asked us to watch this.</p></div>`,
          textContent: `${body}${link ? `\n${link}` : ""}`,
        }),
      });
    } else {
      if (!fromNumber || !twilioSid || !twilioToken) return;
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: fromNumber, To: contact, Body: `${body}${link ? `\n${link}` : ""}` }),
      });
    }
  } catch (e) { console.error("watch notify failed:", e); }
}
