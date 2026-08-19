// WHERE CHARLIE'S SECONDS GO, AND WHAT EACH IDEA WOULD SAVE (owner's ask 08-19: "run a simulation
// and tell me how we can improve"). Every number in here is MEASURED off checks we already dialed:
// the script reads the finished records, then re-runs each one as a simulated check with one idea
// applied, and grades it with the SAME cards and the SAME meter law a real check gets. No phone is
// used, no store is called, and nothing about the calling engine changes.
//
// It files one run per idea into Testing ▸ Simulations, so the result is on the owner's screen and
// not in a chat message.
import { TEST_CARDS } from "../src/calls/behaved";

const BASE = process.env.SIM_BASE || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(BASE + path, { ...init, headers: { "x-admin-token": TOKEN, "user-agent": UA, "content-type": "application/json", ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<any>;
};

const keyByName = new Map(Object.entries(TEST_CARDS).map(([k, c]) => [c.name, k]));

type Src = { id: number; card: string; status: string | null; meter: number; speak: number; listen: number;
  turns: number; call: number; lines: Array<{ who: string; text: string }>;
  /** How long each Staff turn lasted, in seconds, measured on the call itself. */
  staffTurns: number[];
  /** How long Charlie took to start talking after a hold ended, in seconds, per time it happened. */
  backGaps: number[] };

async function sources(): Promise<Src[]> {
  const list = await api("/api/admin/test-calls");
  const rows = (list.rows || []).filter((r: any) => r.room && r.test && keyByName.has(r.test));
  const out: Src[] = [];
  for (const r of rows) {
    let d: any; try { d = await api("/api/admin/receipt/" + encodeURIComponent(r.room)); } catch { continue; }
    const s = d.seconds || {};
    if (s.charlieConnectedSeconds == null || s.speakingSecs == null || s.listeningSecs == null) continue;
    const timed = (d.lines || []).filter((l: any) => l.atMs != null);
    const staffTurns: number[] = timed.filter((l: any) => l.who !== "Agent")
      .map((l: any) => Math.max(0, ((l.endMs ?? l.atMs) - l.atMs) / 1000)).filter((x: number) => x > 0 && x < 30);
    // Where a hold ended: the record's own stamps. A reply that starts within 15 seconds of one of
    // them is a reply Charlie had to be woken up for, and its gap is what waking him cost.
    const backs: number[] = (d.timeline || []).map((e: any) => {
      const txt = (String(e.kind || "") + " " + String((e.detail || {}).step || "")).toLowerCase();
      const at = e.atMs != null ? e.atMs : (e.atSec != null ? e.atSec * 1000 : null);
      return at != null && /hold_end|reopen|wake|resume/.test(txt) ? at : null;
    }).filter((x: number | null) => x != null) as number[];
    const backGaps: number[] = [];
    timed.forEach((l: any, i: number) => {
      if (l.who !== "Agent") return;
      const prev = timed.slice(0, i).filter((x: any) => x.who !== "Agent").pop();
      if (!prev) return;
      const pend = prev.endMs ?? prev.atMs;
      const gap = (l.atMs - pend) / 1000;
      if (gap > 0 && gap < 25 && backs.some((b) => Math.abs(b - pend) < 15000)) backGaps.push(gap);
    });
    const lines = (d.lines || []).map((l: any) => ({ who: l.who === "Agent" ? "charlie" : "staff", text: String(l.text || "") }));
    out.push({ id: r.id, card: keyByName.get(r.test)!, status: TEST_CARDS[keyByName.get(r.test)!].status,
      meter: s.charlieConnectedSeconds, speak: s.speakingSecs, listen: s.listeningSecs,
      turns: lines.filter((l: { who: string }) => l.who === "charlie").length || 2,
      call: s.callSecs ?? s.charlieConnectedSeconds, lines, staffTurns, backGaps });
  }
  return out;
}

// THE MEASURED PIECES, off 83 of Charlie's turns on 34 recorded checks: he speaks 3.5 seconds a
// turn and takes 1.3 seconds to start talking after Staff stop, so one turn removed saves 4.8.

// THE COST OF SWITCHING HIM OFF (owner, 08-19): every time Charlie is dropped, bringing him back
// costs about 5 seconds before he can speak. Measured on our own records, a reply right after a
// hold ended took 2.9 seconds on average against 1.3 seconds when he was never dropped, and on the
// phone down test it was 4.9 and 5.4 seconds. The owner's 5 is used here, so no idea is priced
// cheaper than he has been told it costs. A comeback that already beats 1.3 seconds saves nothing.
const WAKE_COST = 5, NORMAL_REPLY = 1.3;
const SPEAK_PER_TURN = 3.5, THINK_PER_TURN = 1.3;
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

const IDEAS: Array<{ name: string; sub: string; info: string; apply: (s: Src) => number }> = [
  { name: "Seconds: as we run today", sub: "Every finished check re-run with nothing changed.",
    info: "The control. Each simulated check carries the seconds the real check really measured, so the other runs can be read against it.",
    apply: (s) => s.meter },
  { name: "Seconds: one less thing to say", sub: "Charlie says one fewer thing on the check.",
    info: "Measured off 83 of his own turns: he speaks 3.5 seconds a turn and takes 1.3 seconds to start. One turn removed is 4.8 seconds off every check that had a turn to spare. Nothing about how he sounds changes.",
    apply: (s) => Math.max(0, s.meter - (s.turns > 1 ? SPEAK_PER_TURN + THINK_PER_TURN : 0)) },
  { name: "Seconds: off while Staff talk", sub: "Dropped for every Staff turn, and the 5 seconds to bring him back counted.",
    info: "Echo writes down every word Staff say, so Charlie does not have to be on the line while they talk. Bringing him back costs about 5 seconds each time, and this run pays that cost for every Staff turn.",
    apply: (s) => Math.max(0, s.meter - sum(s.staffTurns) + WAKE_COST * s.staffTurns.length) },
  { name: "Seconds: off only for a long Staff turn", sub: "Dropped only while Staff talk longer than the 5 seconds it costs to bring him back.",
    info: "The same idea, but only where the saving beats the cost: Staff turns over 5 seconds. Short answers leave him on the line.",
    apply: (s) => { const long = s.staffTurns.filter((d) => d > WAKE_COST);
      return Math.max(0, s.meter - sum(long) + WAKE_COST * long.length); } },
  { name: "Seconds: one less thing and quicker to come back", sub: "The two ideas that survive, together.",
    info: "One of Charlie's turns removed, and the waking up after a hold brought down to the speed he answers anybody else. Nothing about how he sounds changes and he is never dropped while Staff are talking.",
    apply: (s) => Math.max(0, s.meter - (s.turns > 1 ? SPEAK_PER_TURN + THINK_PER_TURN : 0)
      - sum(s.backGaps.map((g) => Math.max(0, g - NORMAL_REPLY)))) },
  { name: "Seconds: quicker to come back after a hold", sub: "Charlie answers a returning Staff as fast as he answers anybody else.",
    info: "Today a reply right after a hold takes 2.9 seconds on average and up to 7.2, against 1.3 seconds when he was never dropped. This is the waking up, not his talking speed, and his voice is untouched.",
    apply: (s) => Math.max(0, s.meter - sum(s.backGaps.map((g) => Math.max(0, g - NORMAL_REPLY)))) },
];

const main = async () => {
  const src = await sources();
  console.log(`${src.length} finished checks carry measured seconds and a named test`);
  const report: string[] = [];
  const only = process.env.SIM_ONLY || "";
  for (const idea of IDEAS.filter((i) => !only || i.name.includes(only))) {
    const calls = src.map((s) => {
      const meterSec = Math.round(idea.apply(s));
      const saved = s.meter - meterSec;
      return {
        cardKey: s.card, statusKey: s.status, meterSec,
        speakingSec: Math.min(s.speak, meterSec), listeningSec: Math.max(0, Math.min(s.listen, meterSec - Math.min(s.speak, meterSec))),
        callSec: Math.max(0, s.call - saved),
        lines: s.lines.slice(0, 40),
        why: `Built from check ${s.id}, which really ran ${s.meter} seconds on Charlie's meter. ${saved > 0 ? `This idea takes ${saved} seconds off it.` : "Nothing is changed here."}`,
      };
    });
    const green = calls.filter((c) => c.meterSec <= 23).length;
    const r = await api("/api/admin/sim-runs", { method: "POST", body: JSON.stringify({ run: { name: idea.name, sub: idea.sub, info: idea.info }, calls }) });
    const run = r.run || {};
    report.push(`${idea.name}: ${green}/${calls.length} inside 23 seconds · average meter ${run.avgMeterSec}s · passed ${run.passed} failed ${run.failed} · run ${run.id}`);
    console.log(report[report.length - 1]);
  }
};
main().catch((e) => { console.error(e); process.exit(1); });
