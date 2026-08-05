// BOTH CHARLIES, PULLED BACK FROM ELEVENLABS AND COMPARED WORD FOR WORD (owner 08-05).
//
// Run: env ELEVENLABS_API_KEY=… ELEVENLABS_AGENT_ID=… ELEVENLABS_MIDCALL_AGENT_ID=… \
//        ./node_modules/.bin/tsx scripts/verify-charlie-words.ts
//
// WHY THIS EXISTS. A deploy pushes the canonical words to both agents at boot (applyVoiceTuning
// -> midCallAgentPatch, src/calls/service.ts), and a push that fails is logged but never blocks
// serving. So "we deployed" is not "he is running the new words": on 08-03 the joining Charlie had
// been a frozen copy since 07-28, missing a whole section, and nothing on our side said so. The only
// honest proof is to READ BACK what the provider is actually holding and compare it to the one
// source, character for character.
//
// It reads. It never writes. A failure here means the deploy did not take and the words on the phone
// are not the words in the repo; re-push the tuning (PATCH /api/voice-tuning with pushPrompt) and run
// this again.
import { RESTOCK_PROMPT, joiningPrompt } from "../src/voice/prompts";

const API = "https://api.elevenlabs.io/v1/convai/agents";
const key = process.env.ELEVENLABS_API_KEY || "";
const original = process.env.ELEVENLABS_AGENT_ID || "";
const joining = process.env.ELEVENLABS_MIDCALL_AGENT_ID || "";
if (!key || !original) { console.error("need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID"); process.exit(2); }

type Cfg = Record<string, unknown>;
const get = (o: Cfg | undefined, k: string): Cfg | undefined => (o?.[k] as Cfg | undefined);

async function promptOf(agentId: string): Promise<string> {
  const r = await fetch(`${API}/${agentId}`, { headers: { "xi-api-key": key } });
  if (!r.ok) throw new Error(`read agent ${agentId}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  const d = await r.json() as Cfg;
  return String(get(get(get(d, "conversation_config"), "agent"), "prompt")?.prompt ?? "");
}

/** The first place the two strings differ, in the words around it, because "they differ" is useless
 *  when the difference is one clause inside four thousand characters. */
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const at = Math.max(0, i - 60);
  return `at character ${i}\n    ours:   …${JSON.stringify(a.slice(at, i + 60))}\n    theirs: …${JSON.stringify(b.slice(at, i + 60))}`;
}

async function main() {
  let fail = 0;
  const check = (label: string, ours: string, theirs: string) => {
    if (ours === theirs) {
      console.log(`  ✓ ${label}: word for word, ${theirs.length} characters`);
    } else {
      fail++;
      console.log(`  ✗ ${label}: DIFFERENT (ours ${ours.length} chars, theirs ${theirs.length})`);
      console.log(`    ${firstDifference(ours, theirs)}`);
    }
  };

  console.log("▶ the original Charlie");
  check("the original is running the repo's words", RESTOCK_PROMPT, await promptOf(original));

  if (!joining) {
    console.log("\n▶ the joining Charlie");
    console.log("  ! no ELEVENLABS_MIDCALL_AGENT_ID on this environment, so there is no joining Charlie to compare");
  } else {
    console.log("\n▶ the joining Charlie (the one every new style check actually talks to)");
    const theirs = await promptOf(joining);
    check("the joining copy is the joining note plus the same words", joiningPrompt(RESTOCK_PROMPT), theirs);
    // The fault this whole one-source arrangement was built for: the two copies drifting apart. Worth
    // saying out loud even when both already matched the repo, because it is the thing that broke.
    check("…and the two copies differ by the joining note and nothing else",
      joiningPrompt(await promptOf(original)), theirs);
  }

  console.log(fail ? `\nFAILED: ${fail}. The words on the phone are NOT the words in the repo.`
                   : "\nBoth Charlies are running the repo's words.");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
