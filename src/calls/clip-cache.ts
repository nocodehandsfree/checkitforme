// OUR OWN VOICE, IN PHONE FORMAT, SYNTHESIZED ONCE.
//
// Two jobs, and they are the same job:
//
//  1. Delta's opening question has to go down the Twilio media stream, and that stream only carries
//     μ-law 8kHz. The MP3 the rest of the app synthesizes physically cannot ride it, so a clip
//     destined for the bridge is asked for in `ulaw_8000` and arrives ready to send.
//  2. Every clip we play is our own script in our own voice. Re-recording the identical line on
//     every call was measured at roughly 7¢ a call — more than a whole check costs — so a clip is
//     synthesized once and reused.
//
// THE AUDIO RULE AND ITS ONE EXCEPTION (spec `docs/specs/live-call-runtime/README.md`, rule 3).
// Live call audio is NEVER persisted: not the clerk, not the conversation, not to disk, not to logs,
// not to object storage. That rule does not bend. What is cached here is the opposite thing — audio
// WE generated from OUR script before the phone ever rang. It contains no store audio and no customer
// audio. Anyone tidying this cache away in the name of privacy is deleting the wrong thing: the
// privacy rule lives in the bridge, which drops every inbound frame the moment it has been relayed.
//
// The cache is keyed by exactly what makes a clip sound different: the voice, the words and the
// tuning. It can never serve a stale clip, because a changed line is a different key.
//
// AND IT SURVIVES A RESTART (owner, 08-17 evening: "clips must be stable"). It used to live only in
// memory, so every deploy re-recorded every line, and the provider renders the same sentence at a
// different length each time it is asked: check 372 played our question in 4.2 seconds and check
// 373 played the identical words in 5.6, with the hold reply drifting 1.6 to 1.8 the same way. The
// bytes are kept on the service's own disk now, so the same words in the same voice are the SAME
// recording tomorrow, and a re-record costs nothing because it never happens.
import { config } from "../config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** μ-law 8kHz: one byte per sample, 8000 samples a second — so bytes and milliseconds are the same
 *  arithmetic everywhere in the call path. The bridge's playout clock uses this identity too. */
export const ULAW_BYTES_PER_MS = 8;

/** One 20ms Twilio media frame. */
export const ULAW_FRAME_BYTES = 160;

export interface PhoneClip {
  /** Raw μ-law 8kHz bytes, ready to be chunked into media frames. */
  audio: Buffer;
  /** Exactly how long it plays for. Not an estimate — bytes ÷ 8. This is one of the three signals
   *  that tells the runtime the clip has finished. */
  ms: number;
  /** The words, kept for the transcript and the receipt. Never the audio. */
  text: string;
  voiceId: string;
}

/** How many distinct clips we keep. Each is a few seconds of 8kHz audio (~8KB/second), so a
 *  hundred of them is well under 10MB and covers every opener × voice combination in use. */
const MAX_CLIPS = 100;
const cache = new Map<string, PhoneClip>();

/** WHERE A CLIP LIVES BETWEEN RESTARTS. The service's own mounted disk, the same one the Admin
 *  shell is served from; with no disk mounted (a test box, a laptop) the cache is memory-only and
 *  behaves exactly as it always did. Only audio WE generated from OUR script is ever written here:
 *  the live-call rule against persisting a store's voice is untouched. */
const CLIP_DIR = process.env.CLIP_CACHE_DIR
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "clips") : "");
const fileFor = (key: string) => join(CLIP_DIR, createHash("sha1").update(key).digest("hex") + ".bin");
function fromDisk(key: string): Buffer | null {
  if (!CLIP_DIR) return null;
  try { const f = fileFor(key); return existsSync(f) ? readFileSync(f) : null; } catch { return null; }
}
function toDisk(key: string, audio: Buffer): void {
  if (!CLIP_DIR) return;
  try { mkdirSync(CLIP_DIR, { recursive: true }); writeFileSync(fileFor(key), audio); }
  catch (e) { console.error("[clip] keep", e); }   // a disk that will not take it never breaks a check
}

/** Test/ops visibility: how many clips are held and roughly how much memory they use. */
export function clipCacheStats(): { clips: number; bytes: number } {
  let bytes = 0;
  for (const c of cache.values()) bytes += c.audio.length;
  return { clips: cache.size, bytes };
}

/** Test-only: empty the cache. */
export function _resetClipCache(): void { cache.clear(); }

function keyFor(voiceId: string, text: string, tuning: Record<string, unknown>): string {
  // The tuning keys that actually change the sound. Everything else on a workflow (its name, its
  // openers list) does not, and must not split the cache.
  const t = ["stability", "similarity_boost", "similarity", "style", "speed", "modelId"]
    .map((k) => `${k}=${String(tuning?.[k] ?? "")}`).join("&");
  return `${voiceId}|${t}|${text.trim()}`;
}

/** Voice settings, identical to the ones the MP3 path uses, so a cached phone clip and a rehearsal
 *  clip of the same line are the same performance. */
function voiceSettings(tuning: Record<string, unknown>): Record<string, number> {
  const vs: Record<string, number> = {
    stability: typeof tuning.stability === "number" ? tuning.stability : 0.4,
    similarity_boost: typeof tuning.similarity_boost === "number" ? tuning.similarity_boost
      : (typeof tuning.similarity === "number" ? tuning.similarity : 0.85),
  };
  if (typeof tuning.style === "number") vs.style = tuning.style;
  if (typeof tuning.speed === "number" && tuning.speed >= 0.7 && tuning.speed <= 1.2 && tuning.speed !== 1) vs.speed = tuning.speed;
  return vs;
}

/**
 * The opening clip in phone format, from the cache when we have already said this exact line in this
 * exact voice. Returns null when synthesis fails — every caller must treat that as "no clip" and
 * fall back to the behaviour that does not need one, never as a reason to drop the call.
 */
export async function phoneClip(voiceId: string, text: string, tuning: Record<string, unknown> = {}, apiKey?: string): Promise<PhoneClip | null> {
  const words = (text || "").trim();
  if (!voiceId || !words) return null;
  const key = keyFor(voiceId, words, tuning);
  const hit = cache.get(key);
  if (hit) {
    // Freshen: re-inserting moves it to the end of the map's order, so the oldest UNUSED clip is
    // the one that falls out when we hit the ceiling, not simply the oldest one.
    cache.delete(key); cache.set(key, hit);
    return hit;
  }
  // The same words in the same voice, kept from an earlier run: play those exact bytes rather than
  // paying to have them said again at a different length.
  const kept = fromDisk(key);
  if (kept && kept.length) {
    const clip: PhoneClip = { audio: kept, ms: Math.round(kept.length / ULAW_BYTES_PER_MS), text: words, voiceId };
    cache.set(key, clip);
    while (cache.size > MAX_CLIPS) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
    return clip;
  }
  const modelId = tuning.modelId === "eleven_flash_v2" ? "eleven_flash_v2" : "eleven_turbo_v2";
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`, {
      method: "POST",
      headers: { "xi-api-key": apiKey || config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: words, model_id: modelId, voice_settings: voiceSettings(tuning) }),
    });
    if (!r.ok) { console.error("[clip] synth", r.status, (await r.text()).slice(0, 120)); return null; }
    const audio = Buffer.from(await r.arrayBuffer());
    if (!audio.length) return null;
    const clip: PhoneClip = { audio, ms: Math.round(audio.length / ULAW_BYTES_PER_MS), text: words, voiceId };
    cache.set(key, clip);
    toDisk(key, audio);
    while (cache.size > MAX_CLIPS) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
    return clip;
  } catch (e) { console.error("[clip] synth", e); return null; }
}

/**
 * THE SAME CACHE, IN THE FORMAT `<Play>` WANTS.
 *
 * A clip that goes down the media stream has to be μ-law; a clip Twilio FETCHES with `<Play>` has to
 * be an ordinary audio file. Same words, same voice, same money — so the same cache holds both, keyed
 * by format so one can never be served where the other belongs.
 *
 * The robot store rides this: its lines are fixed and it says them on every run, so paying to
 * re-record them per call is the 7¢ mistake this file was written to stop.
 */
export async function mp3Clip(voiceId: string, text: string, tuning: Record<string, unknown> = {}, apiKey?: string): Promise<Buffer | null> {
  const words = (text || "").trim();
  if (!voiceId || !words) return null;
  const key = "mp3|" + keyFor(voiceId, words, tuning);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit.audio; }
  // The same words in the same voice, kept from an earlier run. The ms is the μ-law identity and
  // means nothing for an MP3, so it stays zero here exactly as it does on a fresh recording.
  const kept = fromDisk(key);
  if (kept && kept.length) {
    cache.set(key, { audio: kept, ms: 0, text: words, voiceId });
    while (cache.size > MAX_CLIPS) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
    return kept;
  }
  const modelId = tuning.modelId === "eleven_flash_v2" ? "eleven_flash_v2" : "eleven_turbo_v2";
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey || config.voice.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: words, model_id: modelId, voice_settings: voiceSettings(tuning) }),
    });
    if (!r.ok) { console.error("[clip] mp3 synth", r.status, (await r.text()).slice(0, 120)); return null; }
    const audio = Buffer.from(await r.arrayBuffer());
    if (!audio.length) return null;
    // ms is the μ-law identity (bytes ÷ 8) and means nothing for an MP3, so it is left at zero rather
    // than filled with a number that would be wrong wherever it was read.
    cache.set(key, { audio, ms: 0, text: words, voiceId });
    toDisk(key, audio);
    while (cache.size > MAX_CLIPS) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
    return audio;
  } catch (e) { console.error("[clip] mp3 synth", e); return null; }
}

/** HOW LONG AN MP3 CLIP PLAYS FOR, off the bytes we are really going to play. `mp3Clip` asks for
 *  `mp3_44100_64`, which is a fixed 64 kilobits a second, so the length is the byte count and nothing
 *  else — no decoding, no guessing, and it moves if the words do. It lives here because this file is
 *  where that format is chosen; reading it anywhere else would be a second opinion about the same
 *  bytes. Anything that is not really a 64 kbps mp3 comes back 0, never a made-up number. */
export function mp3Seconds(audio: Buffer | null | undefined): number {
  const bytes = audio?.length ?? 0;
  return bytes > 0 ? (bytes * 8) / 64_000 : 0;
}

/**
 * Split a clip into 20ms media frames, base64 as Twilio wants them. Pure, so the framing is provable
 * without a phone call. A trailing part-frame is sent as-is rather than padded: μ-law silence is not
 * a zero byte, so padding would put a click on the end of every line we say.
 */
export function toMediaFrames(audio: Buffer): string[] {
  const out: string[] = [];
  for (let i = 0; i < audio.length; i += ULAW_FRAME_BYTES) {
    out.push(audio.subarray(i, Math.min(i + ULAW_FRAME_BYTES, audio.length)).toString("base64"));
  }
  return out;
}
