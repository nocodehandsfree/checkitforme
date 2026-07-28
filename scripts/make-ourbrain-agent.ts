// CREATE (or refresh) THE AGENT WHOSE THINKING RUNS ON OUR OWN ACCOUNT.
//
// Run: env ELEVENLABS_API_KEY=… ELEVENLABS_AGENT_ID=… BRAIN_URL=… BRAIN_API_KEY=… \
//        ./node_modules/.bin/tsx scripts/make-ourbrain-agent.ts [--apply]
//
// Section 7 of the runtime spec. Measured on 2026-07-24: voice is 323 credits a minute and the BRAIN
// is 400. The brain is the overage, and it is the half we can buy far more cheaply ourselves.
//
// A SWITCH, NOT A MIGRATION. This is a faithful clone of the live agent — same voice, same rules,
// same variables — with one thing changed: it is pointed at our own endpoint for its thinking. The
// runtime chooses between this agent and the normal one per call, from a setting, so the whole thing
// is killed from a phone by flipping that setting back. Off is exactly today's behaviour and always
// works.
//
// THE KEY NEVER APPEARS IN A CHAT OR A COMMIT. It is read from the environment here and stored on
// the provider's side; Railway holds the copy our server checks against.
const API = "https://api.elevenlabs.io/v1/convai/agents";
const key = process.env.ELEVENLABS_API_KEY || "";
const source = process.env.ELEVENLABS_AGENT_ID || "";
const existing = process.env.ELEVENLABS_OURBRAIN_AGENT_ID || "";
const brainUrl = process.env.BRAIN_URL || "";
const brainKey = process.env.BRAIN_API_KEY || "";
const apply = process.argv.includes("--apply");
if (!key || !source || !brainUrl || !brainKey) {
  console.error("need ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, BRAIN_URL and BRAIN_API_KEY");
  process.exit(1);
}

type Cfg = Record<string, unknown>;
const get = (o: Cfg | undefined, k: string): Cfg | undefined => (o?.[k] as Cfg | undefined);

const SECRET_NAME = "check_brain_key";

/** The shared secret, stored once on the provider's side and referenced by id. Re-running is safe:
 *  an existing secret of this name is reused rather than duplicated. */
async function ensureSecret(): Promise<string> {
  const list = await fetch("https://api.elevenlabs.io/v1/convai/secrets", { headers: { "xi-api-key": key } });
  if (list.ok) {
    const d = await list.json() as { secrets?: Array<{ secret_id?: string; name?: string }> };
    const found = d.secrets?.find((s) => s.name === SECRET_NAME);
    if (found?.secret_id) return found.secret_id;
  }
  const r = await fetch("https://api.elevenlabs.io/v1/convai/secrets", {
    method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ type: "new", name: SECRET_NAME, value: brainKey }),
  });
  if (!r.ok) { console.error("could not store the brain secret:", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  return (await r.json() as { secret_id: string }).secret_id;
}

async function main() {
  const r = await fetch(`${API}/${source}`, { headers: { "xi-api-key": key } });
  if (!r.ok) { console.error("read source agent:", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const src = await r.json() as Cfg;
  const cc = JSON.parse(JSON.stringify(src.conversation_config ?? {})) as Cfg;

  const agent = get(cc, "agent") ?? {};
  const prompt = get(agent, "prompt") ?? {};
  if (!String(prompt.prompt ?? "")) { console.error("source agent has no prompt — refusing to clone an empty one"); process.exit(1); }
  // The ONLY change. Everything else about how this agent behaves is the live agent's, so a tuning
  // change over there is one re-run away from being true over here too.
  // The key is stored ONCE with the provider as a named secret and referenced by id from here, so it
  // never rides in an agent definition, a commit or a chat. `--apply` creates it if it is missing.
  const secretId = await ensureSecret();
  prompt.llm = "custom-llm";
  prompt.custom_llm = { url: brainUrl, model_id: "check-brain", api_key: { secret_id: secretId } };
  agent.prompt = prompt;
  cc.agent = agent;

  const name = `${String(src.name ?? "Check")} — our own brain`;
  const body = JSON.stringify({ name, conversation_config: cc });

  if (!apply) {
    console.log(`WOULD ${existing ? `PATCH ${existing}` : "CREATE"}: ${name}`);
    console.log(`  thinking → ${brainUrl}   ·   voice unchanged (${String(get(cc, "tts")?.voice_id)})`);
    console.log(`  run again with --apply to write it`);
    return;
  }
  const res = existing
    ? await fetch(`${API}/${existing}`, { method: "PATCH", headers: { "xi-api-key": key, "content-type": "application/json" }, body })
    : await fetch(`${API}/create`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" }, body });
  const text = await res.text();
  if (!res.ok) { console.error(existing ? "patch" : "create", "failed:", res.status, text.slice(0, 400)); process.exit(1); }
  const out = JSON.parse(text) as { agent_id?: string };
  const id = out.agent_id || existing;
  console.log(`${existing ? "patched" : "created"}: ${id}`);
  console.log(`set ELEVENLABS_OURBRAIN_AGENT_ID=${id} on the service, then flip the brain switch in Admin`);
}
void main();
