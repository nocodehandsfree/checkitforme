// EVERY NUMBER THE CALL RUNTIME GUESSES AT, IN ONE PLACE, TUNABLE WITHOUT A RELEASE.
//
// WHY (owner, 2026-07-28): these were invented by an engineer and scattered through the code. Every
// one of them has to be tuned against real calls anyway — a store that pauses for seven seconds, a
// clerk who talks fast, a menu that breathes oddly — and none of that can wait on a deploy. So they
// live in a setting the Admin reads, each with the reason it exists next to it.
//
// The runtime files that use these stay dependency-free on purpose (the ear's timing rules must be
// unit-testable without booting the app), so nothing here is imported by them. Values are resolved
// once when a call is placed and passed IN.
import { getSetting } from "../db/settings";

export interface CallTuning {
  // ---- is a person there, or is it a menu? ----
  personGreetingMaxMs: number;
  personWaitMs: number;
  // ---- they picked up: when have they FINISHED saying hello? ----
  greetingEndMs: number;
  greetingMaxWaitMs: number;
  greetingKeepMs: number;
  // ---- has the person gone away? ----
  holdQuietMs: number;
  holdMusicMs: number;
  musicWindowMs: number;
  musicVoicedFraction: number;
  newPersonAfterMs: number;
  transferToneMs: number;
  backVoiceMs: number;
  // ---- the recorded question ----
  prewarmLeadMs: number;
  clipSettleMs: number;
  clipBackstopMs: number;
  // ---- calling straight back after a broken call ----
  reconnectWindowMin: number;
}

/** The defaults, and WHY each one is that number. Anything here can be overridden from Admin with
 *  the `call_tuning` setting (a JSON object of just the keys you want to change). */
export const TUNING_DEFAULTS: CallTuning = {
  personGreetingMaxMs: 3500,
  personWaitMs: 2500,
  greetingEndMs: 600,
  greetingMaxWaitMs: 4000,
  greetingKeepMs: 3000,
  holdQuietMs: 6000,
  holdMusicMs: 6000,
  musicWindowMs: 3000,
  musicVoicedFraction: 0.96,
  newPersonAfterMs: 20000,
  transferToneMs: 600,
  backVoiceMs: 400,
  prewarmLeadMs: 2000,
  clipSettleMs: 250,
  clipBackstopMs: 4000,
  reconnectWindowMin: 2,
};

/** Plain-English reason for each, shown next to the value in Admin. Never a code identifier. */
export const TUNING_WHY: Record<keyof CallTuning, string> = {
  personGreetingMaxMs: "A greeting shorter than this is a person, not a menu. Menus read their options for longer.",
  personWaitMs: "…and then they wait for you. A menu pauses well under a second between phrases.",
  greetingEndMs: "A pause this long right after they pick up means they have finished saying hello and are waiting for us. Too short and our question talks over the end of their own sentence.",
  greetingMaxWaitMs: "…and if they simply never stop talking, ask anyway rather than listen forever.",
  greetingKeepMs: "How much of what Staff said BEFORE we were sure a person was there we keep and hand on, so their first words are never lost.",
  holdQuietMs: "Silence this long, mid conversation, and they have put the phone down and walked off.",
  holdMusicMs: "Unbroken sound this long is hold music. Real speech always has gaps in it.",
  musicWindowMs: "How much recent audio we look at to decide speech versus continuous sound.",
  musicVoicedFraction: "How solidly filled that window has to be before we call it music. Speech never fills it.",
  newPersonAfterMs: "A gap longer than this and whoever comes back may not be who left, so the agent is warned.",
  transferToneMs: "How long a phone has to be ringing before we say we were handed on. A real ring runs two seconds, so anything shorter was a voice that happened to sound like one.",
  backVoiceMs: "How much talking we need to hear before we say somebody is back. About one word. Less than this and a click or a gap in hold music ends a wait that never ended.",
  prewarmLeadMs: "How early the agent starts connecting, measured back from the end of the recorded question. He bills from the second he connects.",
  clipSettleMs: "A breath after the recorded question so the agent cannot clip its own tail.",
  clipBackstopMs: "If nothing confirms the question finished, hand over anyway this long after it should have. A clerk talking to silence is the worse failure.",
  reconnectWindowMin: "How long \"I just got disconnected\" still sounds true. Past this it is likely a different employee and a stranger saying it is worse than a normal greeting.",
};

/** Bounds, so a typo in Admin can never produce a call that hangs or a gate that never fires. */
const LIMITS: Record<keyof CallTuning, [number, number]> = {
  personGreetingMaxMs: [500, 15000], personWaitMs: [500, 15000],
  greetingEndMs: [200, 5000], greetingMaxWaitMs: [1000, 20000], greetingKeepMs: [0, 10000],
  holdQuietMs: [2000, 60000], holdMusicMs: [2000, 60000],
  musicWindowMs: [500, 10000], musicVoicedFraction: [0.5, 1],
  newPersonAfterMs: [5000, 300000],
  transferToneMs: [200, 5000], backVoiceMs: [100, 3000],
  prewarmLeadMs: [0, 10000], clipSettleMs: [0, 3000], clipBackstopMs: [500, 20000],
  reconnectWindowMin: [1, 120],
};

/** What this call should use. Admin overrides win where they are sane; anything out of bounds or
 *  unreadable falls back to the default rather than taking a live call down. */
export async function callTuning(): Promise<CallTuning> {
  const out = { ...TUNING_DEFAULTS };
  try {
    const raw = await getSetting("call_tuning");
    if (!raw) return out;
    const over = JSON.parse(raw) as Partial<CallTuning>;
    for (const k of Object.keys(TUNING_DEFAULTS) as Array<keyof CallTuning>) {
      const v = over[k];
      const [lo, hi] = LIMITS[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v;
    }
  } catch { /* unreadable → the defaults, which are always safe */ }
  return out;
}

/** For the Admin screen: every knob, its value now, its default, its bounds and its reason. */
export async function tuningForAdmin(): Promise<Array<{ key: string; value: number; def: number; min: number; max: number; why: string }>> {
  const now = await callTuning();
  return (Object.keys(TUNING_DEFAULTS) as Array<keyof CallTuning>).map((k) => ({
    key: k, value: now[k], def: TUNING_DEFAULTS[k], min: LIMITS[k][0], max: LIMITS[k][1], why: TUNING_WHY[k],
  }));
}
