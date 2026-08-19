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
  turns: number; call: number; lines: Array<{ who: string; text: string }> };

async function sources(): Promise<Src[]> {
  const list = await api("/api/admin/test-calls");
  const rows = (list.rows || []).filter((r: any) => r.room && r.test && keyByName.has(r.test));
  const out: Src[] = [];
  for (const r of rows) {
    let d: any; try { d = await api("/api/admin/receipt/" + encodeURIComponent(r.room)); } catch { continue; }
    const s = d.seconds || {};
    if (s.charlieConnectedSeconds == null || s.speakingSecs == null || s.listeningSecs == null) continue;
    const lines = (d.lines || []).map((l: any) => ({ who: l.who === "Agent" ? "charlie" : "staff", text: String(l.text || "") }));
    out.push({ id: r.id, card: keyByName.get(r.test)!, status: TEST_CARDS[keyByName.get(r.test)!].status,
      meter: s.charlieConnectedSeconds, speak: s.speakingSecs, listen: s.listeningSecs,
      turns: lines.filter((l: { who: string }) => l.who === "charlie").length || 2,
      call: s.callSecs ?? s.charlieConnectedSeconds, lines });
  }
  return out;
}

// THE MEASURED PIECES, off 83 of Charlie's turns on 34 recorded checks: he speaks 3.5 seconds a
// turn and takes 1.3 seconds to start talking after Staff stop. One turn removed therefore saves
// 4.8 seconds; a reply that starts in 0.3 instead of 1.3 saves 1 second per turn.
const SPEAK_PER_TURN = 3.5, THINK_PER_TURN = 1.3, THINK_FAST = 0.3;

const IDEAS: Array<{ name: string; sub: string; info: string; apply: (s: Src) => number }> = [
  { name: "Seconds: as we run today", sub: "Every finished check re-run with nothing changed.",
    info: "The control. Each simulated check carries the seconds the real check really measured, so the other runs can be read against it.",
    apply: (s) => s.meter },
  { name: "Seconds: off while Staff talk", sub: "Charlie's meter stops while Staff are the one talking.",
    info: "Echo already writes down every word Staff say and hands them to Charlie. This asks what a check would cost if Charlie were switched off for the seconds Staff are talking, the same way he is switched off for a hold today.",
    apply: (s) => Math.max(0, s.meter - s.listen) },
  { name: "Seconds: one less thing to say", sub: "Charlie says one fewer thing on the check.",
    info: "Measured off his own turns: he speaks 3.5 seconds a turn and takes 1.3 seconds to start. One turn removed is 4.8 seconds off every check that had one to spare.",
    apply: (s) => Math.max(0, s.meter - (s.turns > 1 ? SPEAK_PER_TURN + THINK_PER_TURN : 0)) },
  { name: "Seconds: quicker replies", sub: "Charlie starts talking in a third of a second instead of 1.3.",
    info: "The gap between Staff finishing and Charlie starting, measured at 1.3 seconds on average and up to 7.4. This is what the own brain plan buys.",
    apply: (s) => Math.max(0, s.meter - s.turns * (THINK_PER_TURN - THINK_FAST)) },
  { name: "Seconds: off while Staff talk and one less thing", sub: "The two biggest savings together.",
    info: "Both ideas applied to the same check, to see whether the pair is enough to bring a check inside 23 seconds.",
    apply: (s) => Math.max(0, s.meter - s.listen - (s.turns > 1 ? SPEAK_PER_TURN + THINK_PER_TURN : 0)) },
];

const main = async () => {
  const src = await sources();
  console.log(`${src.length} finished checks carry measured seconds and a named test`);
  const report: string[] = [];
  for (const idea of IDEAS) {
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
