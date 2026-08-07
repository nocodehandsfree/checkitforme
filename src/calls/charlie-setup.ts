// ONE PLACE THAT BUILDS CHARLIE'S SETUP, read by every caller that opens him (owner 08-04).
//
// Charlie used to be set up twice. A customer check built the full thing in bridge-place.ts, and a
// mapping check built a much thinner one of its own in server.ts, so a mapping check opened Charlie
// on built-in defaults instead of the owner's settings: no recorded opening question, no joining
// agent (which quietly dropped it onto the older path), no department name, no brain choice, no hold
// handling, none of the owner's timing numbers, and no time limit. Two setups for one agent is how
// they drift, and this one had already drifted a long way.
//
// So the shared half lives here and both callers read it. What stays with each caller is only what
// genuinely differs between them: whether to wait for a human before opening Charlie, the menu steps
// to walk, and whether a hand-over may be taken. Everything else is the same agent doing the same
// job, and it is now impossible for one caller to have it and the other not.
import { config } from "../config";
import { getPolicy } from "../policy";
import { callTuning } from "./tuning";
import { warnIfCapTooLow } from "./check-life";
import { phoneClip } from "./clip-cache";
import type { BridgeContext } from "../voice/bridge";

/** What the caller knows about ITS OWN check. Everything else is read from the owner's settings. */
export interface CharlieSetupInput {
  dynamicVars: Record<string, string>;
  voiceId?: string | null;
  voiceTuning?: Record<string, unknown> | null;
  apiKey?: string;
  /** The workflow's own agent, when the caller carries one; otherwise the configured agent. */
  agentId?: string;
  onConversationId?: (id: string) => void;
  /** Who the route put us through to, in the store's own words. Absent on a direct dial. */
  departmentName?: string;
  /** When the ear may open, counted from the moment the bridge starts. */
  earFromSec?: number;
  /** A store carrying its own cost cap wins; everything else takes the owner's number. */
  timeLimitSec?: number;
}

/** The shared half of the setup: everything both callers must have, and nothing either decides. */
export type CharlieShared = Pick<BridgeContext,
  | "agentId" | "apiKey" | "dynamicVars" | "onConversationId" | "openingClip" | "midCallAgentId"
  | "departmentName" | "ourBrain" | "ourBrainAgentId" | "holdStrategy" | "tuning" | "timeLimitSec"
  | "giveUpSeconds" | "earFromSec" | "voiceId" | "voiceTuning">;

export type CharlieSetup =
  /** NO VOICE = NO CHECK (owner, 07-28). The caller writes this on its own record and refuses. */
  | { refused: true; reason: string; fault: "no-voice" }
  /** Built. `clipFailed` means we HAVE a voice but could not record the opening question, so this
   *  check runs the older way — the caller says so on its own record, the way it always has. */
  | { refused?: false; shared: CharlieShared; clipFailed?: boolean };

export async function buildCharlieSetup(input: CharlieSetupInput): Promise<CharlieSetup> {
  const pol = await getPolicy();
  // Every number the runtime would otherwise guess at, resolved once from the setting Admin reads.
  const tuning = await callTuning();
  // HOW LONG A WHOLE CHECK MAY RUN. One of the owner's own numbers, living in call_tuning with the
  // rest, so production copying its policy down onto staging every sixty seconds cannot stomp it.
  const timeLimitSec = input.timeLimitSec && input.timeLimitSec > 0 ? Math.floor(input.timeLimitSec) : tuning.maxCheckSeconds;
  // Shout if the longest allowed check ever gets near the gatekeeper's backstop, because a check
  // outliving the backstop reads as finished while it is still live.
  warnIfCapTooLow(timeLimitSec);
  // WHAT TO DO ON A HOLD. A setting rather than an environment variable, so it can be killed from a
  // phone mid incident without a deploy. The default keeps the agent open, which cannot change what
  // the store hears.
  const holdStrategy = pol.flags?.closeAgentOnHold ? "reopen" as const : "gate" as const;

  // THE OPENING QUESTION, RECORDED BEFORE THE PHONE IS ANSWERED. Staff should hear it the moment
  // they say hello, so it cannot be made at pickup. Two conditions, both deliberate: a joining agent
  // has to be configured, or there is nobody to hand the answer to; and the check has to carry a
  // voice, so the recording and the agent are the same person rather than two.
  let openingClip: BridgeContext["openingClip"];
  let clipFailed = false;
  const question = input.dynamicVars.opening_line || "";
  // DELTA SWITCHED OFF ON PURPOSE (owner 08-07, the Delta: failed card). Nothing could ever make the
  // recording fail, so the fallback where Charlie asks the question himself had never been tested on
  // purpose. This is the ONE door that decides whether a recording is made, so this is where the
  // switch belongs: with it on there is simply no clip, and every path downstream takes the same
  // route it already takes when the recording could not be made. Not a second code path, which is
  // the only way this proves anything about the real one. OFF except for that one check.
  if (pol.flags?.deltaOff) {
    console.log("[charlie] Delta is switched OFF for this check: the question will not be recorded, so Charlie asks it himself");
    clipFailed = true;
  } else if (config.voice.midCallAgentId && question) {
    if (!input.voiceId) {
      return { refused: true, fault: "no-voice", reason: "no voice is set for this store's workflow, so the check was refused. Set one in Admin, Voice, Workflows." };
    }
    const c = await phoneClip(input.voiceId, question, input.voiceTuning || {}, input.apiKey);
    if (c) openingClip = { audio: c.audio, ms: c.ms, text: c.text };
    else clipFailed = true;
  }

  return {
    shared: {
      agentId: input.agentId || config.voice.agentId,
      apiKey: input.apiKey || undefined,
      dynamicVars: input.dynamicVars,
      onConversationId: input.onConversationId,
      openingClip,
      midCallAgentId: config.voice.midCallAgentId,
      departmentName: input.departmentName,
      ourBrain: !!pol.flags?.ourBrain,
      ourBrainAgentId: config.voice.ourBrainAgentId,
      holdStrategy,
      tuning,
      timeLimitSec,
      // The give-up cap is bail's job and exists only when bail is switched on in Admin.
      giveUpSeconds: pol.bail.enabled && pol.bail.ringMaxSeconds > 0 ? pol.bail.ringMaxSeconds : undefined,
      earFromSec: input.earFromSec,
      voiceId: input.voiceId || undefined,
      voiceTuning: input.voiceTuning || undefined,
    },
    clipFailed,
  };
}
