// Kiosk receipt verification: read receipts that shoppers email to our inbox (restocktimer@gmail.com),
// parse the vendor's confirmation (machine id, time, product), and turn each into VERIFIED kiosk intel
// + a free-call reward. Gmail over IMAP using an app password (GMAIL_USER / GMAIL_APP_PASSWORD).
// The parser is pure + unit-tested; the IMAP fetch is gated on creds and degrades to no-op.
import { ImapFlow } from "imapflow";
import { db } from "./db/client";
import { kioskReceipts } from "./db/schema";
import { getPolicy } from "./policy";

export interface ParsedReceipt { machineId: string | null; product: string | null; total: string | null; orderId: string | null; at: string | null }

/** Decode quoted-printable (email bodies wrap lines with =\n and encode bytes as =XX). */
function decodeQP(s: string): string {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
/** Strip HTML tags + collapse whitespace so regexes see clean text. */
function plain(raw: string): string {
  return decodeQP(raw).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Parse a vendnovation-style kiosk receipt from raw email source (or already-plain text). */
export function parseReceipt(raw: string): ParsedReceipt | null {
  const t = plain(raw);
  const machineId = (t.match(/Machine\s*ID:?\s*([A-Z0-9]{3,})/i) || [])[1] || null;
  const orderId = (t.match(/Order\s*ID:?\s*([0-9]{4,})/i) || [])[1] || null;
  const at = (t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*[AP]M)/i) || [])[1] || null;
  // "Total" but not "Subtotal" (guard the preceding char) and not "Total Items".
  const total = (t.match(/(?:^|[^a-z])Total:?\s*\$\s*([0-9]+\.\d{2})/i) || [])[1] || null;
  // Product: a line-item is "<SKU 10+ digits> <name> $price" (10+ avoids the 8-digit Order ID).
  let product: string | null = null;
  const m = t.match(/\b\d{10,}\s+(.+?)\s+\$\s*\d+\.\d{2}/);
  if (m) product = m[1].trim();
  // Require at least a machine id or a product+total to count as a real receipt.
  if (!machineId && !(product && total)) return null;
  return { machineId, product, total, orderId, at };
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export interface FetchedReceipt extends ParsedReceipt { messageId: string; internalDate: number }

/** Connect to Gmail and parse receipts received in the last `maxAgeMs`. Returns [] if not configured. */
export async function fetchRecentReceipts(maxAgeMs = 30 * 60_000): Promise<FetchedReceipt[]> {
  if (!isGmailConfigured()) return [];
  const client = new ImapFlow({
    host: "imap.gmail.com", port: 993, secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    logger: false,
  });
  // A dropped Gmail socket emits 'error' OUTSIDE the await chain; with no listener that unhandled
  // event kills the whole process (took prod down 2026-07-09). Contain it: log, never crash.
  client.on("error", (e: unknown) => console.error("gmail imap error (contained):", String(e).slice(0, 150)));
  const out: FetchedReceipt[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - maxAgeMs);
    for await (const msg of client.fetch({ since }, { envelope: true, source: true, internalDate: true })) {
      const src = msg.source ? msg.source.toString("utf8") : "";
      const parsed = parseReceipt(src);
      if (!parsed) continue;
      out.push({ ...parsed, messageId: msg.envelope?.messageId || `uid-${msg.uid}`, internalDate: (msg.internalDate ? new Date(msg.internalDate).getTime() : Date.now()) });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return out;
}

/** Admin diagnostic (read-only): recent inbox emails + what the parser does with each, incl. rejects. */
export interface InboxDebugRow { from: string; subject: string; date: number; stored: boolean; parsed: ParsedReceipt | null; snippet: string }
export async function debugRecentInbox(maxAgeMs = 3 * 86400_000): Promise<InboxDebugRow[]> {
  if (!isGmailConfigured()) return [];
  const client = new ImapFlow({
    host: "imap.gmail.com", port: 993, secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    logger: false,
  });
  client.on("error", (e: unknown) => console.error("gmail imap error (contained):", String(e).slice(0, 150)));
  const out: InboxDebugRow[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - maxAgeMs);
    for await (const msg of client.fetch({ since }, { envelope: true, source: true, internalDate: true })) {
      const src = msg.source ? msg.source.toString("utf8") : "";
      const parsed = parseReceipt(src);
      out.push({
        from: (msg.envelope?.from || []).map((a) => a.address || "").join(","),
        subject: msg.envelope?.subject || "(no subject)",
        date: msg.internalDate ? new Date(msg.internalDate).getTime() : Date.now(),
        stored: !!parsed, parsed, snippet: plain(src).slice(0, 400),
      });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  out.sort((a, b) => b.date - a.date);
  return out;
}

let running = false;
/** Background ingest: pull new receipts from Gmail into kiosk_receipts. Gated by flag + creds. */
export async function gmailReceiptTick(): Promise<number> {
  if (running) return 0;
  const pol = await getPolicy();
  if (!pol.flags.kioskReceipts || !isGmailConfigured()) return 0;
  running = true;
  let added = 0;
  try {
    const fresh = await fetchRecentReceipts(30 * 60_000);
    for (const r of fresh) {
      const res = await db.insert(kioskReceipts).values({
        messageId: r.messageId, machineId: r.machineId, product: r.product, total: r.total,
        orderId: r.orderId, txnAt: r.at,
      }).onConflictDoNothing().returning();
      if (res.length) added++;
    }
  } catch (e) { console.error("gmailReceiptTick:", e); } finally { running = false; }
  return added;
}
