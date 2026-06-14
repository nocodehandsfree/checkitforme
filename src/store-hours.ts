// Store hours: looked up per store via Gemini (Google Search grounding), stored as JSON, and
// turned into a live open/closed state in the store's own timezone. Powers the hours display and
// the "don't let anyone call a closed store" gate.

export type DayHours = [string, string] | "24h" | null; // [open,close] "HH:MM" | open 24h | closed
export type Hours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;
const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Look up a single store's weekly hours via Gemini + Google Search grounding. Returns a validated
 *  JSON string ready to store, or null if we couldn't get usable hours. */
export async function fetchStoreHours(name: string, address: string): Promise<string | null> {
  const oai = process.env.OPENAI_API_KEY;
  const gem = process.env.GEMINI_API_KEY;
  const prompt = `What are the current regular weekly opening hours for this exact store: ${name}, ${address}? `
    + `Respond with ONLY a JSON object (no markdown, no prose) with keys mon,tue,wed,thu,fri,sat,sun. `
    + `Each value is ["HH:MM","HH:MM"] in 24-hour LOCAL time as [open,close], or "24h" if open 24 hours, `
    + `or null if closed that day. If you cannot find this exact location, use the typical hours for this chain.`;
  try {
    let text = "";
    // Primary: OpenAI web-search model (paid, no daily wall, accurate).
    if (oai) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${oai}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-search-preview", messages: [{ role: "user", content: prompt }] }),
      });
      if (r.ok) {
        const d = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
        text = d.choices?.[0]?.message?.content ?? "";
      }
    }
    // Fallback: Gemini grounded (free tier; used if OpenAI missing or returned nothing).
    if (!text && gem) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${gem}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
      });
      if (r.ok) {
        const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        text = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as Record<string, unknown>;
    // Models vary in format — normalize ["09:00","21:00"], "09:00-21:00", "24h"/"open 24 hours",
    // "closed"/null all to our canonical DayHours.
    const pad = (t: string) => t.padStart(5, "0");
    const norm = (v: unknown): DayHours => {
      if (v === null) return null;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (/(^|\b)(24\s*h|24\s*hours|open\s*24)/.test(s)) return "24h";
        if (s === "" || s === "closed" || s === "null") return null;
        const m2 = s.match(/(\d{1,2}:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2})/);
        return m2 ? [pad(m2[1]), pad(m2[2])] : null;
      }
      if (Array.isArray(v) && v.length === 2 && /^\d{1,2}:\d{2}$/.test(String(v[0])) && /^\d{1,2}:\d{2}$/.test(String(v[1]))) {
        return [pad(String(v[0])), pad(String(v[1]))];
      }
      return null;
    };
    const clean: Partial<Hours> = {};
    for (const k of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const) clean[k] = norm(parsed[k]);
    if (!Object.values(clean).some((x) => x !== null)) return null; // all-closed = bad lookup
    return JSON.stringify(clean);
  } catch { return null; }
}

function toMin(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function fmt(min: number): string {
  let h = Math.floor(min / 60) % 24; const m = min % 60;
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`;
}

/** Current local clock in a timezone → day-of-week (0=Sun) + minutes since midnight. */
function localNow(tz: string, at: Date): { dow: number; min: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    let hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    if (hh === 24) hh = 0;
    const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return { dow: idx < 0 ? 1 : idx, min: hh * 60 + mm };
  } catch { return { dow: new Date().getDay(), min: at.getHours() * 60 + at.getMinutes() }; }
}

export interface OpenState {
  known: boolean;     // do we have hours data at all
  open: boolean;      // open right now
  label: string;      // short badge, e.g. "Open · till 9 PM", "Closed · opens 10 AM", "Open 24h"
}

/** Is this store open right now? Handles 24h, closed days, and hours that cross midnight. */
export function openState(hoursJson: string | null | undefined, tz: string, at: Date = new Date()): OpenState {
  let h: Hours | null = null;
  try { if (hoursJson) h = JSON.parse(hoursJson); } catch { /* ignore */ }
  if (!h || typeof h !== "object") return { known: false, open: true, label: "" };
  const { dow, min } = localNow(tz || "America/Los_Angeles", at);
  const today = h[DOW_KEYS[dow]];
  const yest = h[DOW_KEYS[(dow + 6) % 7]];

  // Spillover: yesterday's hours that cross midnight into now (e.g. open till 1 AM).
  if (Array.isArray(yest) && toMin(yest[1]) <= toMin(yest[0]) && min < toMin(yest[1])) {
    return { known: true, open: true, label: `Open · till ${fmt(toMin(yest[1]))}` };
  }
  if (today === "24h") return { known: true, open: true, label: "Open 24h" };
  if (Array.isArray(today)) {
    const o = toMin(today[0]); let c = toMin(today[1]);
    const crosses = c <= o; if (crosses) c += 24 * 60; // closes after midnight
    if (min >= o && min < c) return { known: true, open: true, label: `Open · till ${fmt(toMin(today[1]))}` };
    if (min < o) return { known: true, open: false, label: `Closed · opens ${fmt(o)}` };
    return { known: true, open: false, label: "Closed" }; // after close
  }
  // today is null = closed; find the next day that opens
  for (let i = 1; i <= 7; i++) {
    const nxt = h[DOW_KEYS[(dow + i) % 7]];
    if (nxt === "24h") return { known: true, open: false, label: "Closed today" };
    if (Array.isArray(nxt)) return { known: true, open: false, label: `Closed · opens ${fmt(toMin(nxt[0]))} ${i === 1 ? "tomorrow" : DOW_KEYS[(dow + i) % 7]}` };
  }
  return { known: true, open: false, label: "Closed" };
}
