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
import { setAskLine } from "../voice/prompts";
import { DEFAULT_OPENER_ES } from "./service";
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
  /** The chain's own record says this phone rings straight to a person (fix 4, owner box 08-16). */
  directPickup?: boolean;
}

/** THE HOLD REPLY'S WORDS — Charlie's own line from checks 368 and 371, and its Spanish beside it
 *  (every spoken string rides with its Spanish, same as the opening question). */
export const HOLD_ACK_LINE = "No worries, take your time!";
export const HOLD_ACK_LINE_ES = "No se preocupe, tómese su tiempo.";

/** THE OPENING SHAVE (fix 4, owner box 08-16, off check 368: line answered at 3, greeting done near
 *  6.5, the question at 8). The last stretch is the person test waiting `personWaitMs` of quiet to
 *  be sure a person stopped for us rather than a recording pausing for breath. On a chain whose own
 *  record says the phone rings straight to a person, that wait drops to 1500ms: recorded greetings
 *  pause well under 1.2 seconds between their sentences, so 1.5 still refuses a voicemail's mid
 *  greeting pause, and the two real voicemail nets are untouched — the greeting length test
 *  (`personGreetingMaxMs`) and the words test on the store's first line. Never below the saved
 *  number when the owner has already tuned it lower. */
export function personWaitForStore(baseMs: number, directPickup: boolean): number {
  return directPickup ? Math.min(baseMs, 1500) : baseMs;
}

/** The shared half of the setup: everything both callers must have, and nothing either decides. */
export type CharlieShared = Pick<BridgeContext,
  | "agentId" | "apiKey" | "dynamicVars" | "onConversationId" | "openingClip" | "openingClipEs" | "midCallAgentId"
  | "departmentName" | "ourBrain" | "ourBrainAgentId" | "holdStrategy" | "tuning" | "timeLimitSec"
  | "holdAckClip" | "holdAckClipEs" | "setAskClip"
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
  // The per-check copy is adjusted, never the saved setting: Admin stays the record of truth and a
  // store that is not known-direct keeps the owner's number exactly.
  tuning.personWaitMs = personWaitForStore(tuning.personWaitMs, !!input.directPickup);
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
  let openingClipEs: BridgeContext["openingClipEs"];
  let holdAckClip: BridgeContext["holdAckClip"];
  let holdAckClipEs: BridgeContext["holdAckClipEs"];
  let setAskClip: BridgeContext["setAskClip"];
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
    // THE SAME QUESTION IN SPANISH, RECORDED BESIDE IT (owner 08-07). The sentence and an approved
    // reference recording of it have both existed for a while and nothing could ever reach them,
    // because the question is recorded BEFORE we dial and the store has not spoken yet. So both are
    // recorded before the dial and the bridge picks between them at the moment it asks, off the
    // WORDS of the store's own first line.
    //
    // It costs nothing after the first check on a workflow: `phoneClip` records a line ONCE and
    // keeps it. Best effort on purpose, and never a reason to fail a check: with no Spanish clip the
    // check is exactly what it is today, which works.
    if (openingClip) {
      const es = DEFAULT_OPENER_ES.replace(/\{category\}/g, input.dynamicVars.category || "cartas");
      const cEs = await phoneClip(input.voiceId, es, input.voiceTuning || {}, input.apiKey).catch(() => null);
      if (cEs) openingClipEs = { audio: cEs.audio, ms: cEs.ms, text: cEs.text };
      else console.log("[charlie] no Spanish recording for this check, so a Spanish store hears the English question");
      // THE HOLD REPLY, RECORDED BESIDE THE QUESTION (owner box 08-16 late, off check 371: the
      // spoken version of "No worries, take your time!" cost 8 metered seconds while the outside
      // voice service thought it up). Recorded ONCE per voice, cached like the question, played by
      // our own system the moment Staff announce a hold. Best effort: with no recording the check
      // runs exactly as it does today.
      const ack = await phoneClip(input.voiceId, HOLD_ACK_LINE, input.voiceTuning || {}, input.apiKey).catch(() => null);
      if (ack) holdAckClip = { audio: ack.audio, ms: ack.ms, text: ack.text };
      const ackEs = await phoneClip(input.voiceId, HOLD_ACK_LINE_ES, input.voiceTuning || {}, input.apiKey).catch(() => null);
      if (ackEs) holdAckClipEs = { audio: ackEs.audio, ms: ackEs.ms, text: ackEs.text };
      // THE SET QUESTION, RECORDED TOO (owner, 08-19). It is the only line left that the outside
      // voice service still thought up mid check, and thinking it up costs 2 to 7 metered seconds
      // every time. Recorded ONCE per voice and per category's set example, cached exactly like the
      // opening question, and played by our own system the instant the engine knows both pieces are
      // still missing. Best effort, and never a reason to fail a check: with no recording Charlie
      // asks it himself, which is what every check does today.
      const setAsk = setAskLine(input.dynamicVars.set_example);
      const sc = await phoneClip(input.voiceId, setAsk, input.voiceTuning || {}, input.apiKey).catch(() => null);
      if (sc) setAskClip = { audio: sc.audio, ms: sc.ms, text: sc.text };
      else console.log("[charlie] no recording of the set question for this check, so Charlie asks it himself");
    }
  }

  return {
    shared: {
      agentId: input.agentId || config.voice.agentId,
      apiKey: input.apiKey || undefined,
      dynamicVars: input.dynamicVars,
      onConversationId: input.onConversationId,
      openingClip,
      openingClipEs,
      holdAckClip,
      holdAckClipEs,
      setAskClip,
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
