// CREATE (or refresh) THE AGENT THAT JOINS A CONVERSATION ALREADY IN PROGRESS.
//
// Run: env ELEVENLABS_API_KEY=… ELEVENLABS_AGENT_ID=… ./node_modules/.bin/tsx scripts/make-midcall-agent.ts [--apply]
//   without --apply it prints what it WOULD do and touches nothing.
//
// WHY A SEPARATE AGENT AND NOT A PER-CALL OVERRIDE (spec: the live call runtime, section 5).
// Overriding the prompt or the first message on a single call once hung calls up, which is why every
// normal call sends no override at all. Building the new call shape on top of the one thing already
// known to break would be a choice to fail. So the joining behaviour is configured ONCE, on its own
// agent, and the runtime simply opens that agent instead.
//
// It is a faithful clone of the live restock agent — same voice, same turn-taking, same rules, same
// variables — with exactly one thing added: a standing instruction that the question has already
// been asked and it must wait, silently, for the answer.
//
// Re-running with --apply against an existing joining agent PATCHes it back into line with the live
// agent, so tuning the real agent and re-running keeps the two from drifting apart.
const API = "https://api.elevenlabs.io/v1/convai/agents";
const key = process.env.ELEVENLABS_API_KEY || "";
const source = process.env.ELEVENLABS_AGENT_ID || "";
const existing = process.env.ELEVENLABS_MIDCALL_AGENT_ID || "";
const apply = process.argv.includes("--apply");
if (!key || !source) { console.error("need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID"); process.exit(1); }

// THE JOINING INSTRUCTION LIVES IN ONE PLACE (owner 08-03). It used to be written out here as well
// as being pushed from the app, and the two drifted: this script's copy was the only one the joining
// agent had, frozen on 07-28, missing the whole wrong department section. Imported now, never copied.
import { JOINING_RULE, joiningPrompt } from "../src/voice/prompts";

type Cfg = Record<string, unknown>;
const get = (o: Cfg | undefined, k: string): Cfg | undefined => (o?.[k] as Cfg | undefined);

async function main() {
  const r = await fetch(`${API}/${source}`, { headers: { "xi-api-key": key } });
  if (!r.ok) { console.error("read source agent:", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const src = await r.json() as Cfg;
  const cc = JSON.parse(JSON.stringify(src.conversation_config ?? {})) as Cfg;

  const agent = get(cc, "agent") ?? {};
  const prompt = get(agent, "prompt") ?? {};
  const base = String(prompt.prompt ?? "");
  if (!base) { console.error("source agent has no prompt — refusing to build a joining agent without the rules"); process.exit(1); }
  // The joining rule goes FIRST so it is read before any instruction about opening the call, and
  // the store rules follow unchanged. Nothing else about the agent moves.
  prompt.prompt = joiningPrompt(base);
  agent.prompt = prompt;
  agent.first_message = "";      // it never speaks first. The clip already did.
  cc.agent = agent;

  const name = `${String(src.name ?? "Check")} — joining mid call`;
  // COPY platform_settings TOO, and this is not tidiness.
  //
  // It carries the ALLOW-LIST of what a call may override per-call, and the runtime sends a voice
  // override on every workflow call. A clone created without it is refused by the provider with
  // "Override for field 'voice_id' is not allowed by config" — which fails the WHOLE call, at the
  // moment a real person has just picked up. That happened on the owner's first live test
  // (2026-07-28) because the create call sent only conversation_config.
  const body = JSON.stringify({ name, conversation_config: cc, platform_settings: src.platform_settings });

  if (!apply) {
    console.log(`WOULD ${existing ? `PATCH ${existing}` : "CREATE"}: ${name}`);
    console.log(`  voice: ${String(get(cc, "tts")?.voice_id)}  ·  first message: (none)  ·  prompt: +${JOINING_RULE.length} chars of joining rules`);
    console.log(`  run again with --apply to write it`);
    return;
  }
  const res = existing
    ? await fetch(`${API}/${existing}`, { method: "PATCH", headers: { "xi-api-key": key, "content-type": "application/json" }, body })
    : await fetch(`${API}/create`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" }, body });
  const text = await res.text();
  if (!res.ok) { console.error(existing ? "patch" : "create", "failed:", res.status, text.slice(0, 300)); process.exit(1); }
  const out = JSON.parse(text) as { agent_id?: string };
  const id = out.agent_id || existing;
  console.log(`${existing ? "patched" : "created"}: ${id}`);
  console.log(`set ELEVENLABS_MIDCALL_AGENT_ID=${id} on the service, and the clip path turns on`);
}
void main();
