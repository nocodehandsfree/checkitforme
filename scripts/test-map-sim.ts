// THE WHOLE LIFE OF A STORE, SIMULATED — no phone, no money, one real database.
//
// The owner's ask before any store is dialled: prove the thing works end to end in a simulated
// environment, against the spec, not against a description of the spec. So this walks one chain from
// "we know nothing" to "we know it, we trust it, and we noticed when it changed", asserting at each
// step what the spec (docs/specs/live-call-runtime/README.md §10) says must be true.
//
// Run: env DATABASE_URL=file:./.t-mapsim.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test \
//      ELEVENLABS_PHONE_NUMBER_ID=test ./node_modules/.bin/tsx scripts/test-map-sim.ts
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { chains, retailers } from "../src/db/schema";
import { connectAtSecFor, recipeToDtmf } from "../src/calls/recipe";
import {
  proposeVersion, approveVersion, activeMap, versionsFor, chainDetail, graphFor, graphSummary,
  openUnknowns, recordCallPath, recordFailedAttempt, learnFromReceipt, reportCallDrift, resetChainHistory,
  addEvidence, navSecondsOf, reachedPctOf, scoreConfidence,
  type MapRecipe, type EvidenceCall,
} from "../src/calls/mapgraph";
import { lockRecipeToChain } from "../src/calls/trainer-batch";
import { greetingFrom, looksLikeDirectPickup, menuStillTalking, parseSpokenOptions, isMenuLine, parseMenuOptions, mergeMenu, looksLikeQuestion, isReprompt } from "../src/calls/navigator";
import { recipeFromCall } from "../src/calls/map-capture";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };
const now = () => Math.floor(Date.now() / 1000);
const pathSig = (r: MapRecipe) => (r.steps || []).map((x) => `${x.action}:${x.value}@${x.atSec}`).join(">");
const ev = (kind: string, atSec: number, detail?: Record<string, unknown>) => ({ kind, atSec, detail });

async function main() {
  await bootstrap();

  // One chain, three of its stores. Timezones are real so the local-hour stamp is real.
  const [chain] = await db.insert(chains).values({ name: "Sim Card Mart" }).returning();
  const mk = async (name: string, tz: string, phone: string) =>
    (await db.insert(retailers).values({ name, location: "Simtown", phone, timezone: tz, chainId: chain.id }).returning())[0];
  const east = await mk("Sim Card Mart — Newark", "America/New_York", "+15550000001");
  const west = await mk("Sim Card Mart — Fresno", "America/Los_Angeles", "+15550000002");
  const odd = await mk("Sim Card Mart — Franklin", "America/Chicago", "+15550000003");

  console.log("\n▶ DAY ONE — we know nothing about this chain");
  {
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(!row.navRecipe && !row.dtmfShortcut, "no route, nothing to press");
    ok(connectAtSecFor(row) === null, "and the agent is given no join time, so it waits for a voice");
    ok((await activeMap(chain.id)) === null, "the map has nothing to hand a call");
  }

  console.log("\n▶ THE FIRST MAPPING CALL — a menu, learned and locked");
  {
    // What the navigator heard and did: greeting, options, we press 2, a person.
    await recordCallPath({
      chainId: chain.id, storeId: east.id, reachedHuman: true, seconds: 26, outcome: "person",
      prompts: [
        { text: "Thank you for calling Sim Card Mart, para español oprima nueve", atSec: 0 },
        { text: "For the pharmacy press 1, for guest services press 2", atSec: 11 },
      ],
      actions: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }],
    });
    await lockRecipeToChain(chain.id,
      { type: "keypad", seconds: 26, steps: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }] },
      null,
      { at: now(), day: "2026-07-28", storeId: east.id, storeName: east.name, seconds: 26,
        reachedHuman: true, path: "press:2", greeting: "Guest services, this is Dana", language: "mixed" });

    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "2@15", `live calls now press ${row.dtmfShortcut} — timed, not a bare digit`);
    ok(connectAtSecFor(row) === 26, "the agent is told to open at 26s, when the person answered");
    ok(row.ringsDirect === false, "and the chain is not marked as answering directly");

    const live = (await activeMap(chain.id))!;
    ok(live.confidence === 45 && live.confidenceLabel === "observed once", "one call = observed once, never 'verified'");
    ok(live.recipe.steps[0].afterPrompt === 2, "the step waits for the SECOND recording, not a stopwatch");
    ok(live.evidence.calls[0].greeting === "Guest services, this is Dana", "who answered is kept as proof of the desk");
    ok(live.evidence.calls[0].language === "mixed", "the menu's language is on the record from call one");
    ok(typeof live.evidence.calls[0].hourLocal === "number" || live.evidence.calls[0].hourLocal === null, "with the store's own hour");

    const g = await graphFor(chain.id, east.id);
    ok(g.nodes.length === 2 && g.edges.length === 1, "the graph holds both prompts and the step between them");
    ok(g.nodes.some((n) => n.language === "mixed" || n.language === "es"), "and knows one of them speaks Spanish");
  }

  console.log("\n▶ A SECOND STORE AGREES — trust climbs, the route does not churn");
  {
    await lockRecipeToChain(chain.id,
      { type: "keypad", seconds: 24, steps: [{ action: "press", value: "2", atSec: 15, afterPrompt: 2 }] },
      null,
      { at: now(), day: "2026-07-29", storeId: west.id, storeName: west.name, seconds: 24, reachedHuman: true, path: "press:2" });
    const live = (await activeMap(chain.id))!;
    ok(live.confidence === 80, `two stores agreeing = 80 (${live.confidence})`);
    ok(live.seconds === 24, "the faster measurement is the one we ship");
    ok((await versionsFor(chain.id, 0)).length === 1, "still ONE version — agreement is not a change");
  }

  console.log("\n▶ AN ORDINARY CUSTOMER CHECK — free proof, no mapping call");
  {
    const before = (await activeMap(chain.id))!.confidence;
    const res = await learnFromReceipt({
      room: "sim-clean", callId: 9001, chainId: chain.id, storeId: west.id,
      events: [ev("dialed", 0), ev("connected", 2), ev("ivr_detected", 3),
        ev("alpha_press", 15, { key: "2", via: "prompt" }), ev("human_detected", 25), ev("hangup", 70, { why: "done" })],
    });
    ok(res.learned.some((l) => l.includes("matches the map")), `the check confirms the route: "${res.learned[0]}"`);
    ok((await activeMap(chain.id))!.confidence >= before, "a clean check never lowers trust");
    const obs = (await chainDetail(chain.id)).observations as Array<Record<string, unknown>>;
    ok(obs.some((o) => o.callId === 9001), "and it is on the record with the receipt's call id");
  }

  console.log("\n▶ THE MENU MOVES — a check notices before anybody does");
  {
    const res = await learnFromReceipt({
      room: "sim-drift", callId: 9002, chainId: chain.id, storeId: west.id,
      events: [ev("dialed", 0), ev("connected", 2), ev("ivr_detected", 3),
        ev("alpha_press", 41, { key: "2", via: "clock" }), ev("hangup", 90, { why: "nobody answered" })],
    });
    ok(res.learned.some((l) => l.includes("drifted")), `the check reports drift: "${res.learned.find((l) => l.includes("drifted"))}"`);
    const live = (await activeMap(chain.id))!;
    ok(live.confidence < 80, `trust drops on drift (${live.confidence})`);
    ok(live.recipe.steps[0].value === "2", "but the route is untouched — a check never rewrites a map");
    ok((await openUnknowns(400)).some((u) => u.chainId === chain.id && u.kind === "drift"), "it is queued for review with the call attached");
  }

  console.log("\n▶ ONE ODD STORE — Franklin answers differently");
  {
    const oddRoute: MapRecipe = { type: "keypad", seconds: 30, steps: [{ action: "press", value: "4", atSec: 9, afterPrompt: 1 }] };
    // Nothing has failed at Franklin yet, so it must WAIT for the owner.
    const waiting = await proposeVersion({ chainId: chain.id, storeId: odd.id, recipe: oddRoute, source: "sweep",
      call: { at: now(), day: "2026-07-29", storeId: odd.id, seconds: 30, reachedHuman: true, path: "press:4" } });
    ok(waiting.version.status === "proposed" && waiting.activated === false, "a store that merely differs waits for approval");
    ok((await activeMap(chain.id, odd.id))!.recipe.steps[0].value === "2", "and keeps running the chain route meanwhile");

    // Now the chain route actually fails there. Waiting would only keep it broken.
    await recordFailedAttempt({ chainId: chain.id, storeId: odd.id, reason: "pressed 2, nobody came" });
    const live = await proposeVersion({ chainId: chain.id, storeId: odd.id, recipe: oddRoute, source: "sweep",
      call: { at: now(), day: "2026-07-30", storeId: odd.id, seconds: 30, reachedHuman: true, path: "press:4" } });
    ok(live.activated === true && live.version.status === "active", "once the route is proven broken there, its own route goes live");
    ok((await activeMap(chain.id, odd.id))!.recipe.steps[0].value === "4", "Franklin presses 4 now");
    ok((await activeMap(chain.id))!.recipe.steps[0].value === "2", "every other store still presses 2");
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "2@15", "the chain row 500 stores read was never touched");
  }

  console.log("\n▶ THE ROUTE STARTS FAILING EVERYWHERE — it stops looking healthy");
  {
    const before = (await activeMap(chain.id))!.confidence;
    for (const why of ["nobody answered", "menu changed", "line was busy"]) {
      await recordFailedAttempt({ chainId: chain.id, storeId: east.id, reason: why });
    }
    const after = (await activeMap(chain.id))!;
    ok(after.confidence < before, `trust falls with a run of failures (${before} → ${after.confidence})`);
    ok(after.confidenceLabel === "needs review", "and it reads as needing a look");
    ok(after.recipe.steps[0].value === "2", "the route STILL is not rewritten by failures");
    ok((await openUnknowns(400)).some((u) => u.chainId === chain.id && u.kind === "route-failing"), "with a review item explaining why");
  }

  console.log("\n▶ A BETTER ROUTE IS FOUND — you decide, not the machine");
  {
    const faster: MapRecipe = { type: "keypad", seconds: 18, steps: [{ action: "press", value: "3", atSec: 6, afterPrompt: 1 }] };
    const p = await proposeVersion({ chainId: chain.id, recipe: faster, source: "sweep",
      call: { at: now(), day: "2026-07-30", storeId: east.id, seconds: 18, reachedHuman: true, path: "press:3" } });
    ok(p.version.status === "proposed", "a changed route waits for you, however good it looks");
    ok(p.version.summary.startsWith("Route changed"), `and says what changed: "${p.version.summary}"`);
    ok((await db.select().from(chains).where(eq(chains.id, chain.id)))[0].dtmfShortcut === "2@15", "live calls keep the old route until you say yes");

    await approveVersion(p.version.id, "owner");
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "3@6", `on your yes, live calls switch (${row.dtmfShortcut})`);
    ok(connectAtSecFor(row) === 18, "and the agent opens 8 seconds earlier than before");
    const all = await versionsFor(chain.id, 0);
    ok(all.length === 2 && all.some((v) => v.status === "retired"), "the old route is retired with its evidence, not deleted");
  }

  console.log("\n▶ THE DASHBOARD ROW — what the owner actually sees");
  {
    const row = (await graphSummary()).find((r) => r.chainId === chain.id)!;
    ok(row.route === "press 3", `the route in plain words: ${row.route}`);
    ok(row.seconds === 18 && typeof row.confidence === "number", "seconds and how much we trust it");
    ok(row.drift30d >= 1, "drift seen in the last 30 days");
    ok(row.promptTriggered === true, "and it shows the steps fire on the recording, not a stopwatch");
    ok(row.hammer === false, "not key-hammering");
  }

  console.log("\n▶ WHO ANSWERED — the greeting has to be this person, on this turn");
  {
    // Straight off the 07-28 CVS Mulholland call: the machine says it is transferring at 57s, then
    // 27 seconds of hold music, then we book a person at 84s. The newest line in the log is still the
    // machine's, and it was being filed as the desk that answered.
    const log = [
      { who: "ivr" as const, text: "To better assist you, pharmacy or front door services?", atSec: 32 },
      { who: "us" as const, text: 'said "front"', atSec: 33 },
      { who: "ivr" as const, text: "Okay, transferring you now.", atSec: 57 },
    ];
    ok(greetingFrom(log, 84) === undefined, "a transfer announcement 27s old is not the person who answered");
    ok(greetingFrom(log, 58) === undefined, "and it is not the person even on the very next second");
    const answered = [...log, { who: "ivr" as const, text: "CVS Mulholland, this is Dana, how can I help?", atSec: 84 }];
    ok(greetingFrom(answered, 84) === "CVS Mulholland, this is Dana, how can I help?", "what they actually said is the greeting");
    ok(greetingFrom(answered, 85) === "CVS Mulholland, this is Dana, how can I help?", "a second of lag still counts as this turn");
    ok(greetingFrom([], 84) === undefined, "nothing said, nothing claimed");
  }


  console.log("▶ A STORE THAT ALREADY PLAYED US A RECORDING DOES NOT ANSWER DIRECT");
  {
    const ivr = (text: string, atSec: number) => ({ who: "ivr" as const, text, atSec });
    // 07-28 CVS Tarzana: sixteen seconds of recording ending "…are you a healthcare provider?", and
    // the speech-to-text handed back the tail of it. Three words, no menu language, turn 2.
    const afterRecording = [
      ivr("Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial 911. I am your virtual assistant and calls are recorded to improve call Quality.", 16),
      ivr("A healthcare provider.", 20),
    ];
    ok(!looksLikeDirectPickup(afterRecording, 2, "A healthcare provider."),
      "a fragment of the recording is not a person picking up");
    // The real thing: they answer, and it is the first and only thing on the line.
    ok(looksLikeDirectPickup([ivr("Gateway WinCo.", 4)], 1, "Gateway WinCo."),
      "a store that just says its name on the first line does answer direct");
    ok(looksLikeDirectPickup([ivr("Bakery, this is Sam", 5)], 2, "Bakery, this is Sam"),
      "and so does a person giving their name");
    ok(!looksLikeDirectPickup([ivr("Press 2 for pharmacy", 4)], 1, "Press 2 for pharmacy"),
      "a menu is still a menu");
    ok(!looksLikeDirectPickup([ivr("Thank you for calling, please listen to the following options carefully", 4)], 1,
      "Thank you for calling, please listen to the following options carefully"), "and so is a long opening line");
  }

  console.log("▶ THE MODEL'S WORD IS NOT PROOF EITHER — the Tarzana call that became a false recipe");
  {
    const ivr = (text: string, atSec: number) => ({ who: "ivr" as const, text, atSec });
    const us = (text: string, atSec: number) => ({ who: "us" as const, text, atSec });
    // Verbatim from the call. Both lines are the same recording; the transcriber split it and handed
    // back the tail on its own line, and the brain answered "human" at 20 seconds.
    const tarzana = [
      ivr("Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial 911. I am your virtual assistant and calls are recorded to improve call Quality.", 16),
      ivr("A healthcare provider.", 20),
    ];
    ok(menuStillTalking({ steps: tarzana, turns: 2 }, "A healthcare provider."),
      "the recording's own tail is vetoed, whatever the model called it");

    // It must NOT be able to silence a real person. Every exit is checked.
    ok(!menuStillTalking({ steps: tarzana, turns: 2 }, "CVS Tarzana, this is Dana"),
      "words that read like a person are never vetoed");
    ok(!menuStillTalking({ steps: tarzana, turns: 2, routingSeen: true }, "A healthcare provider."),
      "a store that announced a handoff is exempt: the next voice is the desk");
    ok(!menuStillTalking({ steps: tarzana, turns: 2 }, "Okay, transferring you now."),
      "and so is the handoff line itself");
    ok(!menuStillTalking({ steps: [...tarzana, us('said "no"', 21)], turns: 3 }, "Yeah?"),
      "once we have acted even once, the read is trusted again");
    ok(!menuStillTalking({ steps: [ivr("Gateway WinCo.", 4)], turns: 1 }, "Gateway WinCo."),
      "a cold pickup has one recording behind it, so it is never vetoed");
    ok(!menuStillTalking({ steps: [], turns: 1 }, "Hello?"),
      "and neither is a line that answers before it plays anything");
  }


  console.log("▶ THE MENU A STORE SPEAKS OUT LOUD — the one we were throwing away");
  {
    // Both lines are verbatim from the 07-28 CVS calls, speech-to-text commas and all.
    const asked = "To better assist. You please let me know if you are calling in for pharmacy or front door services.";
    const listed = "Just a moment. Please, I'm looking up the information for you for this store. I can assist you with beauty and fragrance OTC, Health photo services, and General Store, inquiries.";

    ok(isMenuLine(asked), "a store asking which department you want IS a menu");
    ok(isMenuLine(listed), "and a store reading its departments out loud IS a menu");
    const a = parseSpokenOptions(asked).map((o) => o.label);
    ok(a.includes("pharmacy") && a.some((l) => /front door/i.test(l)), `both choices captured: ${a.join(" · ")}`);
    const b = parseSpokenOptions(listed).map((o) => o.label);
    ok(b.some((l) => /general store/i.test(l)), `and the one we actually want is in the list: ${b.join(" · ")}`);
    ok(b.some((l) => /beauty and fragrance/i.test(l)), "a department whose own name contains 'and' is not cut in half");
    ok(parseSpokenOptions(asked).every((o) => o.say && !o.digit), "a spoken choice records the WORD to say, not a key to press");

    // The keypad menus that already worked must keep working, and the two kinds must live together.
    const keypad = "For the pharmacy press 1, for guest services press 2";
    ok(isMenuLine(keypad), "a press-a-number menu is still a menu");
    ok(parseSpokenOptions(keypad).length === 0, "and it is never read as a spoken one");
    const both = mergeMenu(parseMenuOptions(keypad), parseSpokenOptions(listed));
    ok(both.filter((o) => o.digit).length === 2 && both.filter((o) => o.say).length >= 2,
      `pressed and spoken choices sit side by side (${both.length} in all)`);
    ok(!isMenuLine("Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial 911."),
      "a plain greeting is not a menu");
  }


  console.log("▶ THE EAR COUNTS THE RECORDINGS, NOT THE TRANSCRIBER");
  {
    // The 07-28 CVS problem in one shape: the store plays ONE long recording and the transcriber
    // hands it back as two lines. Counting those lines says two recordings; the Ear heard one, and
    // the Ear is what a live call fires on.
    const split = [
      { who: "ivr", text: "Thank you for calling CVS, Pharmacy.", atSec: 10 },
      { who: "ivr", text: "Are you a healthcare provider?", atSec: 16 },
      { who: "us", text: 'said "no"', atSec: 18, action: "say", value: "no", earPrompts: 1 },
      { who: "ivr", text: "Pharmacy or front door services?", atSec: 26 },
      { who: "us", text: 'said "front"', atSec: 28, action: "say", value: "front", earPrompts: 2 },
    ];
    const r = recipeFromCall(split, 60);
    ok(r.steps[0].afterPrompt === 1, `the first word waits for recording 1, not 2 (got ${r.steps[0].afterPrompt})`);
    ok(r.steps[1].afterPrompt === 2, `and the second waits for 2, not 3 (got ${r.steps[1].afterPrompt})`);

    // No fork on the call — nothing stamped — and the old counting still works exactly as before.
    const noEar = split.map(({ earPrompts, ...rest }) => rest);
    const r2 = recipeFromCall(noEar, 60);
    ok(r2.steps[0].afterPrompt === 2 && r2.steps[1].afterPrompt === 3,
      "with no Ear on the call it falls back to counting lines, unchanged");
    ok(r.steps[0].value === "no" && r2.steps[0].value === "no", "and the route itself is the same either way");
  }


  console.log("▶ WHAT THE OWNER SEES: not just where we are, but that it is getting better");
  {
    const row = (await graphSummary()).find((r) => r.chainId === chain.id)!;
    ok(typeof row.calls === "number" && row.calls >= 2, `how many calls stand behind the route (${row.calls})`);
    ok(row.stores >= 2, `and how many different stores agree (${row.stores})`);
    ok(row.firstSeconds !== null && row.bestSeconds !== null,
      `where we started and the best we have ever done (${row.firstSeconds}s → ${row.bestSeconds}s)`);
    ok((row.savedSeconds ?? 0) > 0, `and the improvement in plain seconds (${row.savedSeconds}s faster)`);
    ok(typeof row.menuOptions === "number", "plus how much of the store's own menu we captured");

    const one = (await graphSummary()).find((r) => r.calls === 1);
    if (one) ok(one.savedSeconds === null, "one call is a measurement, not a trend — no improvement is claimed");
    else ok(true, "no single-call chain in this run to check the null case against");

    const vs = await versionsFor(chain.id, 0);
    ok(vs.every((v) => v.label.startsWith("Chain v")), `a chain route is labelled by scope: "${vs[0].label}"`);
    const store = (await versionsFor(chain.id, odd.id)).filter((v) => v.storeId === odd.id);
    ok(store.every((v) => v.label.startsWith("This store v")),
      `and one store's own route can never read as the chain's: "${store[0]?.label}"`);
  }
  console.log("\n▶ THREE STORES AGREE — the chain route swaps itself and files the note");
  {
    // Franklin already runs press:4 as its own route (above). Two more stores walking the same new
    // route is the whole bar: at three, waiting for a tap only means every check in between runs a
    // route we already know is stale.
    const oddRoute: MapRecipe = { type: "keypad", seconds: 30, steps: [{ action: "press", value: "4", atSec: 9, afterPrompt: 1 }] };
    const call = (storeId: number, day: string) =>
      ({ at: now(), day, storeId, seconds: 30, reachedHuman: true, path: "press:4" });
    // Whatever the chain runs by now, after everything above. The bar is what matters, not the digit.
    const before = (await activeMap(chain.id))!.recipe.steps[0].value;

    // Store two. Whatever happens to its OWN route, two stores is still a coincidence, so the thing
    // that must not move is the chain.
    const two = await proposeVersion({ chainId: chain.id, storeId: east.id, recipe: oddRoute, source: "sweep", call: call(east.id, "2026-07-31") });
    ok(two.version.storeId === east.id, "store two is filed against that store, never against the chain");
    ok((await activeMap(chain.id))!.recipe.steps[0].value === before, `and at two stores the chain still presses ${before}`);

    const swap = await proposeVersion({ chainId: chain.id, storeId: west.id, recipe: oddRoute, source: "sweep", call: call(west.id, "2026-08-02") });
    ok(swap.activated === true && swap.version.status === "active" && swap.version.storeId === 0,
      "at three stores the CHAIN route swaps itself, with nobody asked");
    ok((await activeMap(chain.id))!.recipe.steps[0].value === "4", "every store runs the new route now");
    const row = (await db.select().from(chains).where(eq(chains.id, chain.id)))[0];
    ok(row.dtmfShortcut === "4@9", `and the row 500 stores read moved with it (${row.dtmfShortcut})`);

    const note = (await openUnknowns(400)).find((u) => u.chainId === chain.id && u.kind === "route-swapped");
    ok(!!note, "a note is filed, because a swap is never silent");
    ok(!!note && /Swapped automatically/.test(note.prompt) && /3 stores agree/.test(note.prompt),
      `and it says what happened and why: "${note?.prompt.slice(0, 60)}"`);
    ok(!!note && !!(note.evidence as Record<string, unknown> | null)?.versionId, "with the route it swapped to attached");
  }


  console.log("▶ THE RE-LISTEN CALL — walks the known menu, hangs up the instant the desk rings");
  {
    // The whole point of the mode, asserted on the rules that make it safe rather than on a phone.
    const src = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/if \(s\.relisten\) \{[\s\S]{0,240}?finish\(s, "mapped"\); return twiml\(`<Hangup\/>`\)/.test(src),
      "an announced handoff ends the call on the spot, with no wait for a person");
    ok(/RE-LISTEN NEVER TROUBLES STAFF[\s\S]{0,400}?finish\(s, "human"\); return twiml\(`<Hangup\/>`\)/.test(src),
      "and if somebody picks up anyway it hangs up rather than asking them anything");
    ok(/const lockable = \(status === "human" \|\| status === "mapped"\)/.test(src),
      "a call that ended on the ring IS a good map, so it produces a recipe like any other");
    ok(/seconds: s\.humanAtSec \?\? \(status === "mapped" \? null/.test(src),
      "but it NEVER claims a time to Staff, because nobody picked up");
    ok(/if \(s\.relisten && s\.routedAtSec != null && s\.humanAtSec == null\)[\s\S]{0,400}?rings >= 2/.test(src),
      "and it hangs up on the second REAL ring, counted by the Ear, not on a stopwatch");
    ok(/seconds: s\.relisten[\s\S]{0,160}?s\.transferAtSec \?\?/.test(src),
      "and it reports the MENU's seconds, never the moment a person spoke");
    // The number the runtime opens the paid agent on must stay the time to STAFF.
    const live = (await activeMap(chain.id))!;
    ok(typeof live.seconds === "number" && live.seconds > 0,
      `the live route still carries time to Staff for the agent to open on (${live.seconds}s)`);
  }

  console.log("▶ STARTING A CHAIN OVER — the history goes, the route stays");
  {
    const before = (await activeMap(chain.id))!;
    const res = await resetChainHistory(chain.id);
    const after = (await activeMap(chain.id))!;
    ok(res.keptRecipe !== null, `the route it runs is kept: "${res.keptRecipe}"`);
    ok(pathSig(after.recipe) === pathSig(before.recipe), "and it is the SAME route, step for step, so real checks are untouched");
    ok(after.evidence.calls.length === 0, "its evidence is emptied, so the next call is genuinely its first");
    ok(after.version === 1, `and it is back to v1 (${after.version})`);
    ok(after.confidence === 0, "with no trust yet, because nothing has proved it since");
    ok((await versionsFor(chain.id)).length === 1, "every retired and set-aside recipe is gone");
    ok(((await chainDetail(chain.id)).calls as unknown[]).length === 0, "the mapping calls list is empty");
    ok(((await chainDetail(chain.id)).unknowns as unknown[]).length === 0, "and nothing is left waiting in Review");
    ok(!(await openUnknowns(400)).some((u) => u.chainId === chain.id), "including in the queue every chain shares");
  }

  // A RE-LISTEN IS NOT A FAILED CALL. It walks the menu, the store announces the handoff, and we hang
  // up on the ring on purpose. Every number on the chain page used to read that as a miss: nav time
  // fell back to the recipe's own declared timings, "Reached Staff" printed 0%, the call count showed
  // zero, and trust stayed "unknown" — all for a call that worked perfectly.
  console.log("▶ A CALL THAT ENDED ON THE RING — a good map, not a miss");
  {
    const live = (await activeMap(chain.id))!;
    const declared = navSecondsOf(live.recipe, []);
    const ring: EvidenceCall = {
      navId: "sim-relisten", at: now(), day: new Date().toISOString().slice(0, 10),
      storeId: east.id, storeName: east.name, seconds: null, reachedHuman: false, endedOnRing: true,
      path: pathSig(live.recipe), transferAtSec: 68, note: "re-listen",
    };
    await addEvidence(live.id, ring);
    const row = (await graphSummary()).find((r) => r.chainId === chain.id)!;

    ok(navSecondsOf(live.recipe, [ring]) === 68, `nav time is the 68s we MEASURED, not the ${declared}s the recipe declares`);
    ok(row.navSeconds === 68, "and that is the number the chain page reads");
    ok(row.calls === 1 && row.stores === 1, `the call counts: ${row.calls} call, ${row.stores} store`);
    ok(reachedPctOf([ring]) === null, "Reached Staff has no number yet, because no call has waited for Staff");
    ok(row.reachedPct === null, "so the page shows no percentage rather than a false 0%");
    ok(scoreConfidence({ calls: [ring] }).label === "observed once", "and it counts toward trust like any call that walked the route");

    // The percentage still tells the truth once calls DO wait for Staff, and the ring call never
    // dilutes it in either direction.
    const stayed = { ...ring, navId: "sim-stayed", endedOnRing: undefined, reachedHuman: true, seconds: 84 } as EvidenceCall;
    const missed = { ...ring, navId: "sim-missed", endedOnRing: undefined, reachedHuman: false } as EvidenceCall;
    ok(reachedPctOf([ring, stayed]) === 100, "one ring call plus one that reached Staff reads 100%, not 50%");
    ok(reachedPctOf([ring, stayed, missed]) === 50, "and a call that genuinely missed Staff still drags it down");

    // NAV TIME IS THE TYPICAL MENU, NOT THE LUCKIEST RUN (owner, 07-30). A menu does not run at one
    // speed, and the fastest time we ever caught is the one number guaranteed not to happen again.
    const slow = { ...ring, navId: "sim-slow", transferAtSec: 80 } as EvidenceCall;
    const quick = { ...ring, navId: "sim-quick", transferAtSec: 62 } as EvidenceCall;
    ok(navSecondsOf(live.recipe, [ring, slow, quick]) === 70, "three checks at 68s, 80s and 62s average to 70s");
    ok(navSecondsOf(live.recipe, [ring, quick]) === 65, "a faster check NUDGES the number down to 65s, it does not overwrite it with 62s");
    ok(navSecondsOf(live.recipe, [ring, slow]) === 74, "and a slower one pulls it up, which the fastest-wins rule could never do");
  }

  // THE MENU IN THE STORE'S OWN WORDS is the reason a re-listen exists. It used to fire every step on
  // one silent timer and open its listener only at the end, so a four line menu arrived as one line.
  console.log("▶ THE MENU IS WRITTEN DOWN, LINE BY LINE");
  {
    const src = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/s\?\.relisten && s\.barge\?\.plan\?\.length[\s\S]{0,400}?return twiml\(`\$\{ear\}<Pause length="1"\/>\$\{gather\(id\)\}`\)/.test(src),
      "a re-listen opens the listener at the greeting instead of running a silent timed block");
    ok(/if \(s\.relisten && s\.barge\?\.plan\?\.length\) \{[\s\S]{0,3000}?return twiml\(gather\(id\)\)/.test(src),
      "and it fires its known steps from the listening loop, reopening the listener after each one");
    ok(/const named = [\s\S]{0,240}?includes\(" " \+ step\.value\.toLowerCase\(\)\)/.test(src),
      "a step goes when the prompt names its own word");
    ok(/named \|\| isMenuLine\(said\) \|\| looksLikeQuestion\(said\)/.test(src),
      "otherwise it answers the prompt that is asking, never a clock the menu has drifted away from");
    ok(!/atSec >= \(step\.at \?\? 0\)/.test(src),
      "the clock cannot walk the route ahead of the menu at all");
    ok(/if \(said && isReprompt\(said\)\)[\s\S]{0,400}?said "\$\{last\.value\}" again/.test(src),
      "a re-prompt repeats the SAME answer instead of spending the next one");
    ok(looksLikeQuestion("are you a healthcare provider?"), "a question with no options in it is still a cue to answer");
    ok(!looksLikeQuestion("Thank you for calling CVS Pharmacy."), "but a greeting is not");
    ok(isReprompt("Sorry, I'm not understanding please confirm"), "and CVS's own re-prompt is read as one");

    // THE TAIL OF A LINE WE SPOKE OVER IS NOT A NEW LINE. CVS's "…photo services and General Store
    // inquiries" ran on into "tell me what you'd like to do", and the page printed "You'd like to do."
    // as a menu step of its own.
    ok(/const spokeOver = [\s\S]{0,200}?atSec - \(last\.atSec \?\? 0\) <= TAIL_SEC/.test(src),
      "a store line arriving right after our own answer is tested as the remainder of what we cut");
    ok(/const fragment = line\.split[\s\S]{0,140}?!isMenuLine\(line\) && !looksLikeQuestion\(line\)/.test(src),
      "and only a short line that is neither a menu nor a question can be a remainder");
    ok(/if \(spokeOver && fragment && prevIvr\) prevIvr\.text = /.test(src),
      "it is joined onto the line it belongs to, never listed as its own step");

    const cap = readFileSync("src/calls/map-capture.ts", "utf8");
    ok(/\(opts\.reachedHuman \|\| opts\.endedOnRing\) \? transcriptFromCall\(opts\.steps\)/.test(cap),
      "a check that walked the whole route keeps EVERY line it heard, not the first six");
  }

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
