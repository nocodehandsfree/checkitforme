// ECHO'S WORDS. The earpiece hears sound; this is the piece that turns that sound into sentences.
//
// WHY IT EXISTS (owner 08-06, off his check 348). The only thing on a check that ever turned the
// store's voice into words was Charlie's own session, and Charlie is CLOSED the whole time Staff are
// away, because that is how his meter stops. So everything said while he was off was heard and never
// written down: "Yeah, we've got a few." died that way and the check came back Not in stock on a
// store that had some. Echo can say somebody is talking, when they stopped and when they came back.
// It has never had a single word in it.
//
// WHAT THIS IS. One socket to Deepgram, fed the SAME 20ms frames the phone line already sends us. No
// second stream, no second listener, no audio maths of its own (the ear owns all of that, spec gate
// 1). Text comes back and goes straight onto the record. Proved before a line of this was written:
// `scripts/deepgram-bench.mjs`, five of five word for word and each as ONE line, Spanish included,
// with the audio paced at real phone speed because a transcriber decides a sentence ended by hearing
// a real pause pass on a real clock.
//
// IT CAN NEVER END A CHECK (owner's rule 10). Every path here is wrapped, a failure to connect is a
// check that runs exactly as it does today, and nothing on the call ever waits on it.
//
// NO AUDIO EVER REACHES DISK (hard rule 3). Frames pass through this socket and are gone; text,
// seconds and events are the only things stored.
import WebSocket from "ws";

/** The settings the bench proved, and the only place they are written down. */
const DG_QUERY = {
  model: "nova-3",
  encoding: "mulaw",
  sample_rate: "8000",
  channels: "1",
  // We never know which language a store answers in until they speak, so we must never have to say
  // in advance. The bench proved Spanish comes back right with this on.
  language: "multi",
  smart_format: "true",
  punctuate: "true",
  // Half sentences are not lines. We write down what was finished.
  interim_results: "false",
};

export interface HeardLine {
  /** The finished sentence, in the store's own words. */
  text: string;
  /** Where it starts in the audio we have sent, in milliseconds. The caller turns this into a real
   *  moment, because the caller is the one that knows when the phone line's clock started. */
  atAudioMs: number;
  /** How long the sentence lasted, in milliseconds. */
  forMs: number;
}

export interface Transcriber {
  /** Feed one 20ms frame, exactly as the phone company sent it. Never throws. */
  send(payloadB64: string): void;
  /** Is the socket up and taking audio? A check must behave identically when this is false. */
  live(): boolean;
  /** Stop listening. Safe to call twice. */
  close(): void;
}

/**
 * Open one transcriber for one check.
 *
 * @param onLine  every finished sentence, in order, as it lands.
 * @param log     the bridge's own log, so a check's diary reads in one place.
 */
export function openTranscriber(onLine: (line: HeardLine) => void, log: (s: string) => void): Transcriber {
  const key = (process.env.DEEPGRAM_API_KEY || "").trim();
  const off: Transcriber = { send: () => {}, live: () => false, close: () => {} };
  if (!key) { log("transcriber: no DEEPGRAM_API_KEY, the check runs without one"); return off; }
  let ws: WebSocket | null = null;
  let ready = false;
  let closed = false;
  let sent = 0;
  try {
    ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${new URLSearchParams(DG_QUERY)}`,
      { headers: { Authorization: `Token ${key}` } });
  } catch (e) {
    log(`transcriber: could not open (${String(e).slice(0, 80)}), the check runs without one`);
    return off;
  }
  ws.on("open", () => { ready = true; log("transcriber: listening"); });
  ws.on("error", (e) => { ready = false; log(`transcriber: ${String(e).slice(0, 120)}`); });
  ws.on("close", () => { ready = false; if (!closed) log("transcriber: the socket closed"); });
  ws.on("message", (raw: Buffer) => {
    try {
      const m = JSON.parse(String(raw)) as {
        is_final?: boolean; start?: number; duration?: number;
        channel?: { alternatives?: Array<{ transcript?: string }> };
      };
      if (!m.is_final) return;
      const text = String(m.channel?.alternatives?.[0]?.transcript || "").trim();
      if (!text) return;
      // ONE FINISHED SENTENCE IS ONE LINE, and it arrives with its own place in the audio, which is
      // what puts it in the right spot on the check's own timeline.
      onLine({ text, atAudioMs: Math.round((m.start ?? 0) * 1000), forMs: Math.round((m.duration ?? 0) * 1000) });
    } catch { /* a message we cannot read is never worth a check */ }
  });
  return {
    send(payloadB64: string) {
      if (!ready || !ws || ws.readyState !== 1) return;
      try { ws.send(Buffer.from(payloadB64, "base64")); sent++; } catch { /* the socket went: the check carries on */ }
    },
    live() { return ready; },
    close() {
      if (closed) return;
      closed = true;
      // Tell it we are done so the last sentence still comes back, then let it go.
      try { ws?.send(JSON.stringify({ type: "CloseStream" })); } catch { /* already gone */ }
      setTimeout(() => { try { ws?.close(); } catch { /* already gone */ } }, 1500);
      log(`transcriber: closing after ${sent} frame(s)`);
    },
  };
}
