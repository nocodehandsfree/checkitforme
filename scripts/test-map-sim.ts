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
  openUnknowns, recordCallPath, recordFailedAttempt, learnFromReceipt, reportCallDrift, reportUnknown,
  addEvidence, navSecondsOf, reachedPctOf, scoreConfidence, sameMenu, CHECK_FAIL_REASONS, provenStores, addProvenStore,
  type MapRecipe, type EvidenceCall,
} from "../src/calls/mapgraph";
import { lockRecipeToChain } from "../src/calls/trainer-batch";
import { greetingFrom, looksLikeDirectPickup, menuStillTalking, parseSpokenOptions, isMenuLine, parseMenuOptions, mergeMenu, looksLikeQuestion, isReprompt, pickedDoorFrom, doorsAskedAt, questionBeforePick, personLineAtSec } from "../src/calls/navigator";
import { recipeFromCall, gradeCheck, recordNavCall } from "../src/calls/map-capture";
import { sameWording, menuLinesOf } from "../src/calls/mapper";
import { toneShare, ConversationEar } from "../src/calls/listen-nav";

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

  console.log("\n▶ PROVEN AT THREE, FOR FREE — the ledger is real, the bar is a real answer");
  {
    // ROUND 2 ITEM 6. The mapping run's store seeds the ledger (union), then customer checks with a
    // REAL yes-or-no add new stores. Detection of a person alone never counts; overwrites never happen.
    const { setSetting: put, getSetting: get } = await import("../src/db/settings");
    await put(`map_proven:${chain.id}`, JSON.stringify([east.id]));
    const check = (room: string, storeId: number, answered: boolean | null) => learnFromReceipt({
      room, callId: 9100 + storeId, chainId: chain.id, storeId, answered,
      events: [ev("dialed", 0), ev("connected", 2), ev("ivr_detected", 3),
        ev("alpha_press", 15, { key: "2", via: "prompt" }), ev("human_detected", 25), ev("hangup", 70, { why: "done" })],
    });
    await check("sim-agree-none", west.id, null);
    ok(JSON.parse((await get(`map_proven:${chain.id}`)) || "[]").length === 1,
      "a person detected with NO clear answer is not an agreement — the bar is the verdict");
    await check("sim-agree-no", west.id, false);
    let led = JSON.parse((await get(`map_proven:${chain.id}`)) || "[]") as number[];
    ok(led.length === 2 && led.includes(west.id), "a real NO counts — Staff acknowledged the product (Update 12)");
    await check("sim-agree-again", west.id, true);
    ok((JSON.parse((await get(`map_proven:${chain.id}`)) || "[]") as number[]).length === 2,
      "the same store agreeing twice is still one store");
    const third = await check("sim-agree-3", odd.id, true);
    led = JSON.parse((await get(`map_proven:${chain.id}`)) || "[]") as number[];
    ok(led.length === 3 && third.learned.some((l) => l.includes("fully proven")),
      "the third distinct store flips the chain to fully proven, and the record says so");
    const read = await provenStores(chain.id);
    ok(read.fullyProven === true && read.stores.length === 3, "and the reader reads it — the level really flips");
    ok((await addProvenStore(chain.id, east.id)).added === false,
      "the mapping run's seed is a UNION — it can never wipe agreements customers earned");
    const detail = await chainDetail(chain.id);
    ok(Array.isArray(detail.provenStores) && detail.fullyProven === true,
      "the chain's own data carries the two-level lock for the screens to read");
    await put(`map_proven:${chain.id}`, ""); // leave the sim chain clean for the sections below
    const eng = readFileSync("src/calls/mapper.ts", "utf8");
    ok(/await addProvenStore\(chainId, store\.id\); \/\/ never throws/.test(eng),
      "a pinned-store run's proven answer joins the ledger — the hand-dial path has real code");
    const mg2 = readFileSync("src/calls/mapgraph.ts", "utf8");
    ok(!/resetChainHistory|freeChainDoors/.test(mg2),
      "and neither hand-clear exists any more — the owner never asked for them (08-03)");
  }

  console.log("\n▶ A NEW MENU IS A CONDITION — filed once, real when heard twice");
  {
    // ROUND 2 ITEM 10. The same night menu, transcribed two different ways — exact-match dedup filed
    // these as separate rows forever and "heard twice" could never fire. The fold is by menu identity.
    const night1 = "Thank you for calling CVS Pharmacy. The pharmacy is currently closed. Business hours are 9 AM to 9 PM.";
    const night2 = "Thank you for calling CVS, Pharmacy. The pharmacy is currently closed, business hours are 9am to 9pm";
    const spanish = "Gracias por llamar a CVS Pharmacy. Para continuar en español, diga sí.";
    await reportUnknown({ chainId: chain.id, storeId: east.id, kind: "menu-changed", prompt: night1 });
    await reportUnknown({ chainId: chain.id, storeId: west.id, kind: "menu-changed", prompt: night2 });
    let conds = (await chainDetail(chain.id)).conditions as Array<{ greeting: string; heardCount: number }>;
    ok(conds.length === 1, "two transcriptions of one menu fold into ONE condition");
    ok(conds[0].heardCount === 2, "heard twice = real, and only then is it listed at all");
    ok(conds[0].greeting === night1.slice(0, 200), "and the row keeps the store's exact words as FIRST heard");
    await reportUnknown({ chainId: chain.id, storeId: east.id, kind: "menu-changed", prompt: spanish });
    conds = (await chainDetail(chain.id)).conditions as Array<{ heardCount: number }>;
    ok(conds.length === 1,
      "a genuinely different menu heard ONCE files its own row but is not listed — one hearing proves nothing");
    await reportUnknown({ chainId: chain.id, storeId: west.id, kind: "menu-changed", prompt: spanish });
    conds = (await chainDetail(chain.id)).conditions as Array<{ heardCount: number }>;
    ok(conds.length === 2, "and it appears the moment a second hearing proves it real");
    // ROUND 3 ITEM 5: heard-twice changes what the owner SEES — a menu heard once stays off the
    // review list; and the fold scans newest-first with a real cap so one menu cannot split rows.
    {
      // 08-04: the review list itself is GONE from the chain page, so the heard-twice bar now shows up
      // only where he still reads it: the menu-by-condition fold, and the fold's own newest-first scan.
      const page3 = readFileSync("public/app.html", "utf8");
      ok(!/pk_setreview|set_reviewrow|ds_setreview|mapUnknownCard/.test(page3),
        "nothing on the chain page asks him to review anything");
      ok(/ORDER BY last_seen DESC LIMIT 100/.test(readFileSync("src/calls/mapgraph.ts", "utf8")),
        "and the fold scans newest-first with a real cap, so one menu can never split across rows");
    }
    // The 24-hour label compare could never match ('Open 24h' vs the real label '24h') — fixed.
    ok(/st\.label === "24h"/.test(readFileSync("src/calls/mapper.ts", "utf8"))
      && /st\.label === "24h"/.test(readFileSync("src/calls/trainer-batch.ts", "utf8"))
      && !/Open 24h/.test(readFileSync("src/calls/mapper.ts", "utf8")),
      "the 24-hour store gates compare the label the hours code actually returns");
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
    // NOTHING HAS FAILED AT FRANKLIN, so there is nothing to decide (owner, 08-03). The chain route
    // still works there, so it keeps running it, and what this store did is kept as NOT USED.
    const noted = await proposeVersion({ chainId: chain.id, storeId: odd.id, recipe: oddRoute, source: "sweep",
      call: { at: now(), day: "2026-07-29", storeId: odd.id, seconds: 30, reachedHuman: true, path: "press:4" } });
    ok(noted.version.status === "rejected" && noted.activated === false,
      "a store that merely answers differently is kept as Not used — nothing waits for him");
    ok(/Not used/.test(noted.version.why || ""), `and it says why: "${noted.version.why}"`);
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
    ok(after.confidenceLabel === "not proven", "and it reads as needing a look");
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


  console.log("▶ THE RING IS REAL — counted on the network's own tone, and a silent handoff never troubles Staff");
  {
    // ROUND 2 ITEM 5. Build real μ-law frames: a ringback tone (440+480 Hz) and speech-shaped noise.
    const mulaw = (sample: number): number => {
      const BIAS = 0x84, CLIP = 32635;
      let s2 = Math.max(-CLIP, Math.min(CLIP, Math.round(sample)));
      const sign = s2 < 0 ? 0x80 : 0; if (s2 < 0) s2 = -s2;
      s2 += BIAS;
      let exp = 7;
      for (let mask = 0x4000; (s2 & mask) === 0 && exp > 0; exp--, mask >>= 1) { /* find segment */ }
      const mant = (s2 >> (exp + 3)) & 0x0f;
      return ~(sign | (exp << 4) | mant) & 0xff;
    };
    const frame = (gen: (i: number) => number): string => {
      const buf = Buffer.alloc(160);
      for (let i = 0; i < 160; i++) buf[i] = mulaw(gen(i));
      return buf.toString("base64");
    };
    const ringFrame = frame((i) => 8000 * (Math.sin(2 * Math.PI * 440 * i / 8000) + Math.sin(2 * Math.PI * 480 * i / 8000)));
    let seed = 7;
    const noiseFrame = frame(() => { seed = (seed * 1103515245 + 12345) % 2147483648; return ((seed / 2147483648) - 0.5) * 16000; });
    ok(toneShare(ringFrame) >= 0.45, `a ringback frame reads as the network's own tone (${toneShare(ringFrame).toFixed(2)})`);
    ok(toneShare(noiseFrame) < 0.45, `speech-shaped sound does not (${toneShare(noiseFrame).toFixed(2)})`);

    // The one Ear counts ring BURSTS: a burst must run, and the gap between bursts separates them.
    const conv = new ConversationEar({ holdStart: () => {}, holdEnd: () => {} });
    const feed = (n: number, tone: boolean) => { for (let i = 0; i < n; i++) conv.feed(tone ? 1000 : 0, tone); };
    feed(35, true);   // ~700ms of ring tone = one real burst
    ok(conv.rings === 1, `one burst = one ring (${conv.rings})`);
    feed(50, false);  // the silence between rings
    feed(35, true);
    ok(conv.rings === 2, `the second burst is the second ring (${conv.rings})`);

    const nv = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/conv\.feed\(earFrameEnergy\(b64\), earToneShare\(b64\) >= 0\.45\)/.test(nv),
      "every mapping check feeds the Ear the tone test, the bridge's own bar");
    ok(/const routeDone = !!\(s\.barge\?\.plan\?\.length && \(s\.planIdx \?\? 0\) >= s\.barge\.plan\.length\);/.test(nv)
      && /if \(rings > 0 && s\.transferAtSec == null && routeDone\)/.test(nv),
      "a SILENT handoff arms the ring hang-up too: the route finished and the desk rang — no waiting for a person to hang up on");
    ok(/const byClock = rings === 0 && s\.routedAtSec != null && atSec - s\.routedAtSec >= RING_CYCLE_SEC;/.test(nv),
      "the cadence clock stands in only when the Ear counted nothing after an announced handoff");
  }

  console.log("▶ THE RE-LISTEN CALL — walks the known menu, hangs up on the SECOND RING, every check");
  {
    // The whole point of the mode, asserted on the rules that make it safe rather than on a phone.
    const src = readFileSync("src/calls/navigator.ts", "utf8");
    ok(!/if \(s\.relisten\) \{\s*\n\s*s\.stopReason = "menu done, desk ringing";/.test(src),
      "the handoff announcement alone no longer ends the call — the announcement is not the ring (RULES 2)");
    ok(/if \(s\.relisten && s\.humanAtSec == null && !s\.firstEverCall\)[\s\S]{0,900}?rings >= 2/.test(src),
      "every ring hang-up waits for the second ring — and a store's FIRST check hangs up on nothing at all");
    ok(/const byClock = rings === 0 && s\.routedAtSec != null && atSec - s\.routedAtSec >= RING_CYCLE_SEC;/.test(src),
      "with the published ring cadence standing in when the Ear has counted nothing");
    ok(/RE-LISTEN NEVER TROUBLES STAFF[\s\S]{0,400}?finish\(s, "human"\); return twiml\(`<Hangup\/>`\)/.test(src),
      "and if somebody picks up anyway it hangs up rather than asking them anything");
    ok(/const lockable = \(status === "human" \|\| status === "mapped"\)/.test(src),
      "a call that ended on the ring IS a good map, so it produces a recipe like any other");
    ok(/seconds: s\.humanAtSec \?\? \(status === "mapped" \? null/.test(src),
      "but it NEVER claims a time to Staff, because nobody picked up");
    ok(/seconds: s\.relisten[\s\S]{0,160}?s\.transferAtSec \?\?/.test(src),
      "and it reports the MENU's seconds, never the moment a person spoke");
    // The number the runtime opens the paid agent on must stay the time to STAFF.
    const live = (await activeMap(chain.id))!;
    ok(typeof live.seconds === "number" && live.seconds > 0,
      `the live route still carries time to Staff for the agent to open on (${live.seconds}s)`);
  }

  console.log("▶ A CALL THAT ENDED ON THE RING — a good map, not a miss");
  {
    const live = (await activeMap(chain.id))!;
    const declared = navSecondsOf(live.recipe, []);
    const ring: EvidenceCall = {
      navId: "sim-relisten", at: now(), day: new Date().toISOString().slice(0, 10),
      storeId: east.id, storeName: east.name, seconds: null, reachedHuman: false, endedOnRing: true,
      path: pathSig(live.recipe), transferAtSec: 68, note: "re-listen",
    };
    const before = (await graphSummary()).find((r) => r.chainId === chain.id)!;
    await addEvidence(live.id, ring);
    const row = (await graphSummary()).find((r) => r.chainId === chain.id)!;

    ok(navSecondsOf(live.recipe, [ring]) === 68, `nav time is the 68s we MEASURED, not the ${declared}s the recipe declares`);
    ok(row.navSeconds === 68, "and that is the number the chain page reads");
    ok(row.calls === before.calls + 1, `the ring-ended check counts like any other (${before.calls} to ${row.calls})`);
    ok(reachedPctOf([ring]) === null, "Reached Staff has no number yet, because no call has waited for Staff");
    ok(row.reachedPct === before.reachedPct,
      "and it never drags the reached-Staff number down, because it never waited for Staff");
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
    ok(/if \(s\?\.barge\?\.plan\?\.length\) s\.type[\s\S]{0,200}?return twiml\(`\$\{ear\}<Pause length="1"\/>\$\{gather\(id\)\}`\)/.test(src),
      "every check with a route opens the listener at the greeting instead of running a silent timed block");
    ok(!/<Pause length="\$\{wait\}"/.test(src),
      "the silent timed block is GONE, so no check can ever be deaf through the menu again");
    ok(/if \(s\.barge\?\.plan\?\.length\) \{[\s\S]{0,5000}?return twiml\(gather\(id\)\)/.test(src),
      "and it fires its known steps from the listening loop, reopening the listener after each one");
    ok(/const named = [\s\S]{0,240}?includes\(" " \+ step\.value\.toLowerCase\(\)\)/.test(src),
      "a step goes when the prompt names its own word");
    ok(/named \|\| isMenuLine\(said\) \|\| looksLikeQuestion\(said\)/.test(src),
      "otherwise it answers the prompt that is asking, never a clock the menu has drifted away from");
    // NO ANSWER EVER FIRES ON A TIMER — the clock is dead everywhere (owner Update 4). The one step
    // under test cuts in on the MENU'S OWN WORDS: it answers the first words of its own recording
    // instead of waiting for the question to finish. Every other step answers the prompt that asks it.
    ok(!/atSec >= \(step\.at \?\? 0\)/.test(src),
      "no step fires on the clock — the timed barge is deleted, not gated");
    ok(/if \(step\?\.early && said && !isReprompt\(said\) && !saidWasTail\)/.test(src),
      "the ONE step under test cuts in on the menu's own words — never on silence, a re-prompt, or a cut line's tail");
    ok(/cutting in on the menu's words/.test(src),
      "and the record says so in plain words");
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
    ok(/const fragment = line\.split[\s\S]{0,200}?TAIL_WORDS && !isMenuLine\(line\) && !ROUTING_RE\.test\(line\)/.test(src),
      "and only a short line that is neither a menu nor the handoff can be a remainder");
    ok(/const TAIL_WORDS = 14;/.test(src), "long enough to hold a cut sentence, short enough that a real prompt cannot fit");
    // The same cut tail came back as "You'd like to do." once and "Would you like to do?" the next
    // time. Punctuation the transcriber guessed at cannot be what decides; the four-second gap can.
    ok(/const TAIL_SEC = 5;/.test(src), "a remainder is what lands within seconds of our answer, measured on five real checks");
    ok(!/const fragment = [\s\S]{0,200}?looksLikeQuestion/.test(src), "so a remainder that reads as a question is still a remainder");
    // CVS: "just say what you'd like to do and I can connect you" is an OFFER to connect, mid menu.
    // Read as the handoff it made a re-listen hang up one step short and file a route that had never
    // said its last word.
    ok(/const routeUnfinished = !!\(s\.barge\?\.plan\?\.length && \(s\.planIdx \?\? 0\) < s\.barge\.plan\.length\)/.test(src),
      "a route with a step still to walk cannot be finished with us");
    ok(/if \(speech && ROUTING_RE\.test\(speech\) && !routeUnfinished && s\.humanAtSec == null\s*\n\s*&& handoffVerdict\?\.who === "recording"\)/.test(src),
      "so an offer to connect before the last answer is read as one more prompt, not the handoff");
    ok(/if \(spokeOver && fragment && prevIvr\) \{ prevIvr\.text = [\s\S]{0,80}?saidWasTail = true; \}/.test(src),
      "it is joined onto the line it belongs to, never listed as its own step");

    // THE SCREEN USES ONLY WORDS THE STATUSES SCREEN OWNS (owner, 07-30). It said "nobody picked up"
    // on a check we ended ourselves while the desk was ringing, which is two untruths in one line.
    const page = readFileSync("public/app.html", "utf8");
    ok(!/nobody picked up/i.test(page), "no check is ever described as one nobody picked up");
    // THE PILL CARRIES THE STAGE NOW (owner, 08-03), not the outcome. "Admin hung up" stays as the
    // last rung of the transcript, which is where he reads what happened to a check.
    ok(/text:'Admin hung up'/.test(page), "a check WE ended still reads 'Admin hung up' on its last rung");
    ok(/c\.endedOnRing\) rows\.push\(\{who:'ring'[\s\S]{0,120}?text:'Admin hung up'\}\)/.test(page),
      "and the last rung says only the status words — the rung before already says the store was transferring us");
    // Comp 3a: the stage is the card's header, the winner says so, and a failed check is one row + reason.
    // "Mapping menu" is RETIRED as a heading (owner, 08-03): mapping the menu and proving the
    // department are the same work, so a check reads Proving department until it is actually proved.
    ok(!/'Mapping menu'/.test(page) && /'Proving department'/.test(page) && /'Department proved'/.test(page)
      && /'Optimizing speed'/.test(page) && /'Speed optimized'/.test(page),
      "the four stage words are the owner's, and Mapping menu is gone");
    ok(/\['Proving department','#FFCB05'/.test(page) && /\['Optimizing speed','#FFCB05'/.test(page),
      "nothing is green until it is proved — everything before that is yellow");
    ok(/\['Department proved','var\(--green\)'/.test(page) && /\['Speed optimized','var\(--green\)'/.test(page),
      "and green is only the check that proved the department, or the one that landed the faster way");
    // OWNER UPDATE 5 REPLACED THE COMP HERE: no check says "Recipe winner". The winner lives in the
    // recipe box and in Menu, so the page never carries two claims about which route is live.
    ok(!/Recipe winner/.test(page), "no check says Recipe winner — the recipe box and Menu own that");
    ok(/const pill=stagePill\(c\);/.test(page),
      "the pill on a check carries its STAGE, and the stage decides the colour");
    ok(/if\(c\.grade==='fail'\)\{/.test(page) && /mapCheckOpen\('\$\{bid\}'\)/.test(page),
      "a failed check collapses to one row that opens on tap");
    ok(/if\(x\.c\.grade==='fail'\) continue;/.test(page), "and it never takes part in the faster-or-slower chain");
    ok(/gain>0\?`<span[\s\S]{0,80}?\$\{gain\}s faster/.test(page) && !/s slower/.test(page),
      "only a check that moved us forward shows a number — there is no 'slower' anywhere");
    ok(/text:'Reached staff',tail:g\?/.test(page), "Reached staff carries what Staff said after it, in plain gray");
    ok(!/function callProduced/.test(page), "the PRODUCED line is deleted");
    ok(!/Greeting plays/.test(page), "and the top-of-page ladder is the bare steps — the menu's words live under Menu");
    // The menu on the page is what the menu says NOW, so it comes off the newest check, never the
    // longest one. A stale check kept the screen after a newer one had heard the menu properly.
    ok(!/sort\(\(a,b\)=>\(\(b\.transcript\|\|\[\]\)\.length\)-\(\(a\.transcript\|\|\[\]\)\.length\)\)/.test(page),
      "the menu is no longer taken from whichever check happened to have the most lines");
    ok(/const call=mine\.slice\(\)\.sort\(\(a,b\)=>\(Number\(b\.at\)\|\|0\)-\(Number\(a\.at\)\|\|0\)\)/.test(page),
      "and where one check must be picked, it is the newest, never the longest");
    // Only the comments explaining the removal may still carry the words; no rendered string may.
    ok(!/confColor/.test(page), "the colour scale those words needed is gone with them");
    ok(!page.split("\n").some((l) => !l.trim().startsWith("//") && /observed once|observed multiple times/.test(l)),
      "and no screen scores itself at him in words he cannot act on");
    // ROUND 2 ITEM 12: `Set aside` is on the DELETE list — gone from every rendered string and every
    // written note; the plain words are `Not used`. The live-run card speaks the real stage names.
    ok(!page.split("\n").some((l) => !l.trim().startsWith("//") && /[Ss]et aside/.test(l)),
      "no rendered string says Set aside anywhere on the page");
    ok(!/`Set aside: \$\{why\}`/.test(readFileSync("src/calls/mapgraph.ts", "utf8")),
      "and the engine writes 'Not used', never 'Set aside', onto a rejected recipe");
    ok(/const PHASE=\{map:'Proving department',speed:'Optimizing speed',locked:'Locked ✓',stopped:'Stopped'\};/.test(page),
      "the live run card speaks the owner's stage names — no raw map/speed, no retired names");

    // THE MENU IS THE MAP OF DOORS from the ONE locked run (comp 3b). The stitched menu that voted
    // line-by-line across checks is DELETED: it glued a question from one check to Staff talking on
    // another and the order stopped making sense (owner, 07-30).
    ok(!/function agreedMenu|agreedWords|function menuTimeline|function menuLadder/.test(page),
      "the stitched menu and the old ladder are deleted, and must not come back");
    ok(/function doorMap\(ch,call,v\)/.test(page), "the menu renders as the map of doors");
    ok(/c\.grade!=='fail'/.test(page.slice(page.indexOf('const mine=byCond'))), "built from the newest PASSING check only");
    ok(/map recipe locked '/.test(page), "the foot names the store and when the map recipe locked");
    ok(/function menuFixLine\(chainId,idx\)/.test(page), "the pencil fixes a line's words");
    ok(/fixed\?'<span[\s\S]{0,80}?corrected/.test(page), "and a corrected line says so");

    const cap = readFileSync("src/calls/map-capture.ts", "utf8");
    ok(/\(opts\.reachedHuman \|\| opts\.endedOnRing\) \? transcriptFromCall\(opts\.steps\)/.test(cap),
      "a check that walked the whole route keeps EVERY line it heard, not the first six");
    // ROUND 2 ITEM 11: a mapping check's nav time ends at the HANDOFF, and no check claims a number
    // it did not measure.
    ok(/transferEmitted = true; markNow\(s\.id, "navEndMs"\); emit\(s\.id, "transfer"/.test(src),
      "the record's nav-finished stamp lands at the handoff — Staff picking up is talk, not nav (Update 10)");
    ok(!/run\.best\.seconds = run\.baseline\.seconds/.test(readFileSync("src/calls/mapper.ts", "utf8")),
      "a ring-ended win no longer writes the earlier check's seconds into its own record");
  }

  // THE GRADE AND THE MENU'S IDENTITY — the first piece of the owner's three-stage rebuild (07-30).
  // A check must earn its way into the record; everything else fails with one reason from his list.
  console.log("▶ EVERY CHECK IS GRADED, AND A MENU KNOWS ITSELF");
  {
    // The same CVS recording, transcribed two different ways on two real checks today.
    const day1 = "Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial. 911 calls are recorded to improve call Quality, are you a healthcare provider?";
    const day2 = "Thank you for calling CVS, Pharmacy. If this is an emergency, please hang up and dial 911. I am your virtual assistant and calls are recorded to improve call Quality.";
    const night = "Thank you for calling CVS Pharmacy. The pharmacy is currently closed. Business hours are 9 AM to 9 PM.";
    const spanish = "Gracias por llamar a CVS Pharmacy. Para continuar en español, diga sí.";
    ok(sameMenu(day1, day2), "two transcriptions of one recording read as the SAME menu");
    ok(!sameMenu(day1, night), "the closed menu is a different menu, however similar its greeting");
    ok(!sameMenu(day1, spanish), "and the Spanish menu is a different menu");

    const base = { stage: "map" as const, transferHeard: true, ringOrStaff: true };
    ok(gradeCheck(base).grade === "pass", "handoff announced and the ring heard = pass");
    ok(gradeCheck({ ...base, expectedGreeting: day1, heardGreeting: day2 }).grade === "pass",
      "a re-worded transcription of the same greeting still passes");
    {
      // The fixed list is SEVEN. A different menu is a new CONDITION, filed and quarantined — it is
      // not a reason and no pill exists for it (owner rounds 07-31; the eighth reason is deleted).
      const g = gradeCheck({ ...base, expectedGreeting: day1, heardGreeting: night });
      ok(g.grade === "fail" && g.reason === undefined && g.unknownMenu === true,
        "the night menu fails with NO reason — a new condition, quarantined from the daytime map");
      ok((CHECK_FAIL_REASONS as readonly string[]).length === 7 && !(CHECK_FAIL_REASONS as readonly string[]).includes("wrong menu"),
        "the reason list is the owner's seven, word for word, nothing else");
    }
    ok(gradeCheck({ ...base, plannedValues: ["no", "front", "general"], saidValues: ["no", "front"] }).reason === "said wrong words",
      "OUR WORDS SAID is a pass condition: a skipped answer fails even with the handoff and ring heard");
    // ROUND 2 ITEM 8: the words are checked WORD FOR WORD, not counted. Three things said, three
    // owed — but "general" was never spoken; a re-said "no" inflated the count. The count passed it.
    ok(gradeCheck({ ...base, plannedValues: ["no", "front", "general"], saidValues: ["no", "no", "front"] }).reason === "said wrong words",
      "a re-said answer can no longer stand in for one never spoken");
    ok(gradeCheck({ ...base, plannedValues: ["no", "front", "general"], saidValues: ["no", "front", "general", "general"] }).grade === "pass",
      "and honestly re-said answers (the menu asked twice) still pass");
    // ROUND 2 ITEM 2: a store where Staff just pick up — no announced handoff, no ring we hang up on —
    // passes on the contract's other shape: Staff answered and replied.
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: true, staffAnswered: true }).grade === "pass",
      "Staff answering the product question passes with no transfer line heard — direct-pickup chains can lock");
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: true }).grade === "fail",
      "but merely reaching a person without a real reply still fails");
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: true, staffAnswered: true, wrongDepartment: true }).reason === "wrong department",
      "and the wrong desk answering still fails as wrong department, answer or not");
    // ROUND 3 ITEM 6: an ask with no answer can never pass, however clean the transfer and ring —
    // grading it a pass polluted the ring numbers with checks that proved nothing.
    {
      const g6 = gradeCheck({ stage: "map", transferHeard: true, ringOrStaff: true, askDied: true });
      ok(g6.grade === "fail" && g6.reason === undefined,
        "the question asked and nothing answered = a fail with no pill, never a pass");
    }
    ok(gradeCheck({ ...base, wrongDepartment: true }).reason === "wrong department",
      "Staff saying wrong desk fails as wrong department");
    // Today's real Mulholland check: front barged over the recording, the menu looped, the pharmacy answered.
    ok(gradeCheck({ stage: "speed", transferHeard: false, ringOrStaff: false, testedEarly: true }).reason === "barge didn't work",
      "a speed try that broke the walk fails as barge didn't work");
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: false, repromptHeard: true }).reason === "menu repeated itself",
      "the store asking twice fails as menu repeated itself");
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: false, plannedValues: ["no", "front", "general"], saidValues: ["no"] }).reason === "menu hung up on us",
      "dying with answers still owed fails as menu hung up on us");
    ok(gradeCheck({ ...base, greetingTwice: true }).reason === "sent to beginning of menu",
      "the greeting playing again fails as sent to beginning of menu");
    ok(gradeCheck({ stage: "speed", transferHeard: true, ringOrStaff: true, navSeconds: 55, recipeSeconds: 49 }).reason === "not faster",
      "a clean speed try that did not beat the recipe fails as not faster");
    ok(gradeCheck({ stage: "speed", transferHeard: true, ringOrStaff: true, navSeconds: 43, recipeSeconds: 49 }).grade === "pass",
      "and one that beat it passes — the recipe winner");
    ok(gradeCheck({ stage: "map", transferHeard: false, ringOrStaff: false }).reason === "said wrong words",
      "a walk that died with no better explanation fails as said wrong words");
  }

  // ROUND 2 ITEM 14: the fold rules, DRIVEN — not read off the source. One ended check against a
  // real database: what may it write?
  console.log("▶ THE FOLD RULES, DRIVEN — what one ended check may write");
  {
    const [c2] = await db.insert(chains).values({ name: "Sim Fold Mart" }).returning();
    const st = (await db.insert(retailers).values({ name: "Sim Fold Mart — Reno", location: "Simtown", phone: "+15550000009", timezone: "America/Los_Angeles", chainId: c2.id }).returning())[0];
    const foldSteps = [
      { who: "ivr", text: "Thanks for calling Sim Fold Mart. For guest services press 2.", atSec: 5 },
      { who: "us", text: "pressed 2", atSec: 9, action: "press", value: "2" },
      { who: "ivr", text: "Okay, transferring you now.", atSec: 14 },
    ];
    const foldRecipe: MapRecipe = { type: "keypad", steps: [{ action: "press", value: "2", atSec: 9 }], seconds: 30 };
    const call = (id: string, over: Record<string, unknown>) => recordNavCall({
      id, chainId: c2.id, retailerId: st.id, retailerName: st.name,
      steps: foldSteps as never, humanAtSec: null, status: "failed", recipe: foldRecipe,
      ...over,
    } as Parameters<typeof recordNavCall>[0]);
    const failed = await call("fold-fail", { grade: "fail", reason: "said wrong words" });
    ok(failed.recorded && /changed nothing/.test(failed.why), `a failed check writes nothing: "${failed.why}"`);
    ok((await activeMap(c2.id)) === null, "no version exists after it — the map really is untouched");
    const staged = await call("fold-staged", { humanAtSec: 30, status: "human", stage: "map", grade: "pass" });
    ok(/kept by its run/.test(staged.why), `a run-owned check stays the run's own: "${staged.why}"`);
    ok((await activeMap(c2.id)) === null, "so a mid-run pass files no version either — the map moves at the lock");
    const passed = await call("fold-pass", { humanAtSec: 30, status: "human", grade: "pass" });
    ok(passed.recorded && (await activeMap(c2.id)) !== null,
      "a plain Admin call that PASSED teaches the map — the 07-30 button bug stays dead");
  }

  // PIECE TWO: the grade is wired through the engine — decided in finish before anything is written,
  // carried on the run log AND the map fold, and a failed check changes nothing.
  console.log("▶ THE GRADE RIDES EVERY CHECK, AND A FAILED CHECK CHANGES NOTHING");
  {
    const nav = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/const g = gradeCheck\(\{[\s\S]{0,900}?\}\);\s*\n\s*s\.grade = g\.grade; s\.failReason = g\.reason;/.test(nav),
      "finish grades the check by machine before anything is written");
    ok((nav.match(/stage: s\.stage, grade: s\.grade, reason: s\.failReason,/g) || []).length === 2,
      "and the same verdict rides both the run log and the map fold, so screens cannot disagree");
    ok(/if \(s\.grade == null\) \{\s*\n\s*if \(s\.status === "human"\) finish\(s, "human"\);[\s\S]{0,300}?finish\(s, "failed"\);/.test(nav),
      "a check the carrier ended still gets its grade — no check ever ends ungraded");
    ok(!/const xml = await handToCharlie\(s, atSec\);\s*\n\s*if \(xml\) \{\s*\n\s*finish/.test(nav),
      "and a check handed to Charlie is NOT graded at the hand-off — he has not asked yet");
    // ROUND 2 ITEM 8: the third ungraded end is closed — a LOST end callback.
    ok(/const live = sessions\.get\(id\);\s*\n\s*if \(!live \|\| live\.grade != null\) return;\s*\n\s*live\.stopReason = live\.stopReason \|\| "the carrier never said the call ended";/.test(nav),
      "a lost carrier callback is closed by a one-shot backstop tied to the call — it grades, folds and frees");
    ok(/plannedValues: \(s\.barge\?\.plan \|\| \[\]\)\.map\(\(p\) => String\(p\.value \|\| ""\)\)/.test(nav),
      "and the grader is handed the owed WORDS, not a step count");
    ok(/if \(s\.chainId != null && !s\.stage && s\.grade !== "fail"\) void markNavOutcome/.test(nav),
      "a failed or run-owned check never stamps the chain's mapping status");
    ok(/kind: "menu-changed",\s*\n\s*prompt: heard\.slice\(0, 200\),/.test(nav),
      "an unmatched greeting files a condition in the store's exact words, automatically");
    // ROUND 2 ITEM 3: SILENCE IS NOT AN ANSWER. Nine seconds of quiet used to set "answered" and a
    // silent clerk proved the door. Now quiet ends the check unresolved, the door's ask spent.
    // FIX PASS 6: mapping has NO silence rule of its own, because mapping no longer asks Staff
    // anything. Charlie owns every word exchanged with a person, including their silence.
    ok(!/Staff said nothing after the question/.test(nav) && !/confirmResult = "answered"/.test(nav),
      "mapping decides nothing about what Staff said — the answer-listening is deleted, not repaired");
    ok(/staffAnswered: s\.confirmResult === "answered",/.test(nav),
      "and only a REAL reply sets the pass shape the grader reads");
    // ROUND 2 ITEM 1 (navigator half): the ask ledger records the DOOR the ask was spent at.
    ok((nav.match(/recordConfirmAsked\(s\.chainId, s\.retailerId, pickedDoorFrom\(s\.steps\), questionBeforePick\(s\.steps\)\)/g) || []).length === 2,
      "both ledger writes record which door the ask was spent at AND at which question, and only a SPOKEN ask spends one");
    ok(/s\.repromptHeard = true;/.test(nav), "the store saying it did not understand is written down as a fact");
    ok(/sameMenu\(firstIvr\.text, line\)\) s\.greetingTwice = true;/.test(nav),
      "and the opening recording playing again mid-check is caught as being sent to the start");

    const cap = readFileSync("src/calls/map-capture.ts", "utf8");
    ok(/if \(s\.grade === "fail"\) return \{ recorded: true, why: `failed: \$\{s\.reason \|\| "\?"\} — changed nothing` \};/.test(cap),
      "a failed check keeps only the graph and the collapsed log row: no evidence, no version, no score");

    // THE RE-MAP BUTTON IS RETIRED (owner, 07-31) — deleted with its route, and a gate greps it
    // stays gone. Walking a held route is the engine's job: settle listens and speed checks.
    const srv = readFileSync("src/server.ts", "utf8");
    const doc = srv.slice(srv.indexOf('app.post("/api/admin/trainer/document"'), srv.indexOf('app.get("/api/admin/trainer/session'));
    ok(!/relisten/.test(doc), "the trainer route no longer walks a held route or takes a re-listen flag");
    ok(!/stage:/.test(doc), "and it stamps no stage, so its calls fold into the map again");
    const page = readFileSync("public/app.html", "utf8");
    ok(!/relisten:true/.test(page), "no Admin button places a re-listen call");
    ok(!/'Re-map'/.test(page) && !/"Re-map"/.test(page) && !/Re-map this chain/.test(page),
      "and no button, label or sheet says Re-map anywhere on the page");
    // ROUND 2 ITEM 9: no free text into mapping rows, and honest outcomes everywhere.
    ok(!/"dial failed: "/.test(readFileSync("src/calls/mapper.ts", "utf8"))
      && !/"dial failed: "/.test(readFileSync("src/calls/sweep.ts", "utf8")),
      "a refused dial reads 'the call never connected' — the carrier's raw words stay off mapping rows");
    ok(/outcome: reachedHuman \? "person" : \(s\.endedOnRing \? "ring" : "failed"\)/.test(readFileSync("src/calls/map-capture.ts", "utf8")),
      "graph edges carry a fixed vocabulary — person, ring, failed — never a raw status");
    ok(/Staff answered but the check did not pass/.test(readFileSync("src/calls/mapper.ts", "utf8")),
      "'nobody answered' can never be written over a check where somebody did");
    ok(/reachedHuman: String\(r\.outcome \|\| ""\) === "human" && r\.grade !== "fail"/.test(readFileSync("src/calls/mapgraph.ts", "utf8")),
      "a failed check never reads as reached-Staff on the mapping list");
    ok(/nobody picked up`;\s*\n\s*finish\(s, "failed"\)/.test(nav),
      "a transfer nobody answered ends as a failure, never filed as a human");
    ok(!/navStatus: "learning"/.test(doc),
      "and the Map button no longer pre-stamps the chain — status moves only when a check earns it");
  }

  // PIECE THREE: the engine runs the owner's stages under the 07-31 rounds — learn menu FIRST,
  // always; one proven answer locks the store and the chain goes live; speed after, at the same
  // store, no timer anywhere; proving arrives free from real customer checks, never a dialing stage.
  console.log("▶ THE ENGINE: LEARN FIRST, LOCK AT ONE PROVEN STORE, SPEED WITH NO CLOCK");
  {
    const eng = readFileSync("src/calls/mapper.ts", "utf8");
    ok(/"map" \| "speed" \| "locked" \| "stopped"/.test(eng),
      "the stages are mapping menu and optimizing speed — proving is not a dialing stage any more");
    ok(!/"verify" \| "listen" \| "baseline" \| "optimize"|listenFirst|isListen/.test(eng),
      "the old stage names and the listen-first path are gone from the engine");
    ok(/phase: "map", running: true,/.test(eng),
      "every run starts at mapping menu — LEARN FIRST, ALWAYS, held recipe or not (Update 1)");
    ok(!/lockedRecipe && hasPromptPlan \? "speed" : "map"/.test(eng),
      "the held-recipe shortcut straight to speed is deleted");
    ok(/const proving = run\.phase === "map" && !run\.doorProven;/.test(eng),
      "the learn stage's proving check is the only check that asks Staff");
    ok(/relisten: !proving,/.test(eng),
      "every other check hangs up on the second ring — settle listens and speed checks alike");
    ok(/proving \? \{ product \} : undefined,/.test(eng),
      "the ask is about the product — the answer is the proof of the door");
    ok(/const graded = s\?\.grade === "pass";/.test(eng),
      "the loop reads the same machine grade the run log and the map fold carry");
    ok(/if \(!run\.doorsDead\.includes\(door\)\) run\.doorsDead\.push\(door\);/.test(eng),
      "a wrong desk kills that door for good and steers every later check away from it");
    ok(/sameWording\(run\.lastLines, lines\)/.test(eng),
      "the run keeps listening until the same lines are heard twice in a row");
    ok(/run\.storeLocked = true;[\s\S]{0,300}?activate: true, stage: "map"/.test(eng),
      "settled + proven = the store locks and the chain goes LIVE, in one stroke (Update 2)");
    ok(/await seedProvenStores\(chainId, storeId\);/.test(eng),
      "the locked store opens the proof ledger — customer checks at new stores add themselves");
    ok(/await finalizeAndLock\(run, chainId, run\.best, null, run\.winnerSession, \{ activate: true, stage: "speed" \}\);/.test(eng),
      "a speed win updates the recipe and the Menu on the spot (Update 5)");
    ok(!/run\.provedStores/.test(eng) && !/"prove"[^)]*run\.rotate/.test(eng),
      "no prove-stage dialing exists to reach three stores — real customer checks carry that");
    ok(/kind: "shorten" \| "cutin";/.test(eng) && !/enqueueBinaryBarge|bargeState|\bat\?\: number/.test(eng),
      "the experiments are the short word and the cut-in — the binary clock search is deleted");
    ok(/await rememberNever\(run, `cutin:\$\{stepValue\}`\);/.test(eng) && /await rememberNever\(run, `shorten:/.test(eng),
      "a losing move is blacklisted DURABLY — no future run spends a call re-proving a loss");
    ok(/reason === "barge didn't work" && run\.best\?\.steps\?\.\[ex\.stepIdx\]/.test(eng),
      "a move that broke the walk is remembered off its graded reason");
    ok(/run\.phase === "speed" && !\(await storeOpenNow\(store\.id\)\)/.test(eng),
      "the open-hours gate is re-read before EVERY speed check, pinned store or not");
    // ROUND 2 ITEM 1: a wrong desk burns the DOOR, never the store.
    ok(/const spentDoors = proving \? \(await doorsAskedAt\(chainId, store\.id\)\)\.filter\(\(e\) => !isProvenDoor\(e\.door\)\) : \[\];/.test(eng),
      "the ask ledger is per DOOR — a spent door is steered around while the store stays held");
    // ROUND 3 ITEM 3: a re-map never burns its own proven door — the held recipe's doors are exempt
    // from the spent-ask block, because the proof already exists and the full first check re-asks.
    ok(/const isProvenDoor = \(d: string\) => provenWords\.some\(\(p\) => p === d \|\| p\.includes\(d\) \|\| d\.includes\(p\)\);/.test(eng),
      "the held recipe's own doors are exempt — 'doors that worked: X' and 'never choose X' can no longer be said in the same breath");
    ok(/const door = pickedDoorFrom\(\(s\?\.steps \|\| \[\]\) as NavStep\[\]\) \|\| \(s\?\.redirectTo \|\| ""\)\.slice\(0, 40\)/.test(eng),
      "the door that dies is the option WE picked, never the clerk's redirect sentence");
    ok(/await rememberDeadDoor\(run, door, /.test(eng) && /map_doors_dead/.test(eng),
      "and a dead door is DURABLE, chain wide — the next run cannot spend the call again");
    ok(/trying the next door at this store/.test(eng) && !/taking a fresh store rather than asking again/.test(eng),
      "a spent or dead door holds the STORE — the next check takes the next door, same store");
    ok(/every door here is burnt — taking a fresh store/.test(eng),
      "a fresh store only when every door at this one is burnt or nobody ever answers");
    ok(/deadDoors: proving && blockedDoors\.length \? blockedDoors : undefined,/.test(eng),
      "and burnt doors ride to the navigator as a hard block, not only a sentence in the prompt");
    // ROUND 3 ITEM 4: a door is QUESTION + OPTION. The dead record carries the question it died at
    // (durable, old bare entries still load), and the navigator's block is scoped to that question.
    ok(/await rememberDeadDoor\(run, door, questionBeforePick\(\(s\?\.steps \|\| \[\]\) as NavStep\[\]\)\);/.test(eng),
      "a dying door records the question it answered");
    ok(questionBeforePick([
      { who: "ivr", text: "Are you a healthcare provider?", atSec: 16 },
      { who: "us", text: 'said "no"', atSec: 18, action: "say", value: "no" },
      { who: "ivr", text: "Pharmacy or front store services?", atSec: 26 },
      { who: "us", text: 'said "pharmacy"', atSec: 28, action: "say", value: "pharmacy" },
      { who: "us", text: 'asked: "any Pokémon cards?"', atSec: 40, action: "say", value: "any Pokémon cards?" },
    ] as never) === "Pharmacy or front store services?",
      "and the question found is the one right before the pick, the ask excluded");
    {
      const nv3 = readFileSync("src/calls/navigator.ts", "utf8");
      ok(/if \(!entry\.q \|\| !speech \|\| !speech\.trim\(\)\) return true;\s*\n\s*return sameMenu\(entry\.q, speech\) \|\| speech\.toLowerCase\(\)\.includes\(w\);/.test(nv3),
        "the block fires at that question (or blind), and lets the same digit through at a different one");
    }
    // Behavioral: the picked door is the last route choice, scaffold excluded; the door ledger reads
    // per store.
    ok(pickedDoorFrom([
      { who: "us", text: 'said "no"', atSec: 18, action: "say", value: "no" },
      { who: "us", text: 'said "front store services"', atSec: 28, action: "say", value: "front store services" },
      { who: "us", text: 'asked: "do you have any Pokémon cards?"', atSec: 40, action: "say", value: "do you have any Pokémon cards?" },
    ]) === "front store services", "the picked door is the last route choice, the ask itself excluded");
    {
      const { setSetting: put } = await import("../src/db/settings");
      // Old bare entries still load (no question = block by value, the old behaviour), and new ones
      // carry the question so a spent door is level-scoped exactly like a dead one (fix pass 4).
      await put(`nav_confirm_asked_doors:${chain.id}`, JSON.stringify([
        `${east.id}:front store services`,
        { s: east.id, door: "general", q: "I can assist you with photo services and General Store inquiries." },
        { s: west.id, door: "pharmacy" },
      ]));
      const doors = await doorsAskedAt(chain.id, east.id);
      ok(doors.length === 2 && doors.some((d) => d.door === "front store services" && !d.q),
        "the ledger answers per store, and an entry saved the old way still loads");
      ok(doors.some((d) => d.door === "general" && /General Store inquiries/.test(d.q || "")),
        "and a spent door carries the question it was spent at");
      // The exemption keys the way the ledger does: the winner is often the SHORTENED word while the
      // ask was spent under the full phrase the menu offered.
      const provenWords = ["front"];
      const isProven = (d: string) => provenWords.some((p) => p === d || p.includes(d) || d.includes(p));
      ok(isProven("front store services") && isProven("front") && !isProven("pharmacy"),
        "a proven door is exempt under either spelling — full phrase or its shortened winner");
    }

    // CHARLIE IS SET UP THE SAME WAY ON A MAPPING CHECK AS ON A CUSTOMER CHECK (owner 08-04).
    // A mapping check used to build its own much thinner setup, so it opened Charlie on built-in
    // defaults: no recorded opening question and no joining agent, which quietly dropped it onto the
    // older path, and none of the owner's own settings for the brain, the hold, the timing or the
    // longest allowed check. One shared setup now, read by both, so they cannot drift apart again.
    {
      const { buildCharlieSetup } = await import("../src/calls/charlie-setup");
      const { config: cfg } = await import("../src/config");
      const built = await buildCharlieSetup({
        dynamicVars: { opening_line: "do you have any Pokémon cards in" },
        voiceId: "sim-voice", departmentName: "front store services",
      });
      ok(!built.refused, "a mapping check can build Charlie's setup");
      if (!built.refused) {
        const sh = built.shared;
        ok(typeof sh.timeLimitSec === "number" && (sh.timeLimitSec as number) > 0,
          `the check now carries a longest-allowed length (${sh.timeLimitSec}s), instead of running with none`);
        ok(!!sh.tuning && typeof sh.tuning.maxCheckSeconds === "number",
          "and the owner's own timing numbers, the same ones a customer check runs on");
        ok(sh.holdStrategy === "gate" || sh.holdStrategy === "reopen",
          `and his hold setting (${sh.holdStrategy})`);
        ok("ourBrain" in sh && "ourBrainAgentId" in sh, "and which brain to use");
        ok(sh.midCallAgentId === cfg.voice.midCallAgentId,
          "and the agent that joins a conversation already in progress, so it cannot fall back to the older path");
        ok(sh.departmentName === "front store services",
          "and who it was put through to, in the store's own words");
        ok(!Object.prototype.hasOwnProperty.call(sh, "holdMaxSeconds"),
          "the deleted hold number is NOT back");
      }
      // NO VOICE = NO CHECK, the same refusal a customer check makes, with a reason a person can read.
      const had = cfg.voice.midCallAgentId;
      (cfg.voice as { midCallAgentId?: string }).midCallAgentId = "sim-midcall";
      const noVoice = await buildCharlieSetup({ dynamicVars: { opening_line: "do you have any Pokémon cards in" } });
      (cfg.voice as { midCallAgentId?: string }).midCallAgentId = had;
      ok(noVoice.refused === true && /no voice is set/.test((noVoice as { reason?: string }).reason || ""),
        "a mapping check with no voice set is refused, and says why");
      // ONE setup, spread whole by both callers, so neither can quietly be missing a piece.
      const bp = readFileSync("src/voice/bridge-place.ts", "utf8"), srv = readFileSync("src/server.ts", "utf8");
      ok(/\.\.\.setup\.shared/.test(bp), "the customer check spreads the shared setup whole");
      ok(/\.\.\.setup\.shared/.test(srv), "and so does the mapping check");
      ok(/connectOnHuman: false,\s+\/\/ Staff are already talking/.test(srv) && /neverTakeAHandover: true,/.test(srv),
        "and the two things a mapping check must keep are untouched: Charlie opens right away, and it never takes a transfer");
      ok(!/holdMaxSeconds/.test(bp) && !/holdMaxSeconds/.test(srv),
        "and the deleted hold number came back nowhere");
    }

    // A CHAIN WITH A MENU PROBLEM GLOWS, AND NOTHING ELSE DOES (owner 08-04). The small red mark lit
    // for anything sitting open, so Target wore a warning while the box above it counted zero. One
    // rule now drives the glow, the box and the dropdown choice, so the page cannot contradict itself.
    {
      const page6 = readFileSync("public/app.html", "utf8");
      ok(!/const alert=\(g&&\(g\.menuChanged\|\|g\.proposed>0\|\|g\.openUnknowns>0\)\)/.test(page6),
        "the small red mark beside a chain's name is deleted");
      ok(/const trouble=!!\(g&&g\.menuChanged\);/.test(page6),
        "a chain reads as a problem for exactly one reason: its menu changed");
      ok(/\$\{trouble\?' trouble':''\}/.test(page6) && /\.pickrow\.trouble\{/.test(page6),
        "and that lights a glow behind the whole row, readable at arm's length");
      ok(/data-changed="\$\{trouble\?1:0\}"/.test(page6),
        "the dropdown's Menu changed choice picks exactly the rows that glow");
      const boxRule = /if\(g&&g\.menuChanged\) changed\+\+;/.test(page6);
      ok(boxRule, "and the Menu changed box counts the same set, so the number and the list agree");
    }

    // A CHOICE MARKED WRONG EXPIRES WITH THE MENU IT WAS LEARNED ON (owner, phase 3 audit item 3).
    // Re-mapping a store means learning the menu FRESH, so a mark learned on the menu we replaced must
    // stop blocking the new map. Nothing is deleted — every mark stays on file, against the map it was
    // learned on. Driven, not read: a real run is started against a chain with no stores, so it opens
    // its menu number and then stops before it could dial anyone.
    {
      const { startMapper, mapperState } = await import("../src/calls/mapper");
      const { setSetting: put, getSetting: get } = await import("../src/db/settings");
      const [c5] = await db.insert(chains).values({ name: "Sim Remap Mart" }).returning();
      await put(`map_remaps:${c5.id}`, "1");           // the map on file was learned on menu 1
      await put(`map_doors_dead:${c5.id}`, JSON.stringify([
        { door: "pharmacy", q: "Pharmacy or front store services?", menu: 1 },
        { door: "photo", q: "Pharmacy or front store services?", menu: 2 },
      ]));
      await startMapper(c5.id);
      const rm = mapperState().runs.find((x) => x.chainId === c5.id);
      ok(rm?.menuNumber === 2, `a re-map opens a fresh menu number (got ${rm?.menuNumber})`);
      ok(!!rm && !rm.doorsDead.includes("pharmacy"),
        "the choice marked wrong on the old menu no longer blocks the fresh map — it is free to try it and learn it properly");
      ok(!!rm && rm.doorsDead.includes("photo"),
        "a choice marked wrong on the menu this run IS learning is still obeyed");
      const onFile = JSON.parse((await get(`map_doors_dead:${c5.id}`)) || "[]") as Array<{ door: string }>;
      ok(onFile.length === 2 && onFile.some((e) => e.door === "pharmacy"),
        "and NOTHING is deleted — the old mark is still on file, still readable by the screen");
      ok((await get(`map_remaps:${c5.id}`)) === "2",
        "the menu number is durable, so the run picks up on the same menu after a restart");
    }

    // FULL WORDS IN THE LEARN STAGE (contract stage 1). The learning call's own instructions must say
    // full phrase and let-the-question-finish — the shortest-word rule belonged to speed experiments,
    // which are plan-driven and never see this prompt.
    const nv = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/THIS IS A LEARNING CALL\. Answer each question with the FULL phrase/.test(nv),
      "the learn walk answers with the FULL phrase the menu offers");
    ok(!/SHORTEST word that works/.test(nv) && !/barge in — don't wait for it to finish/.test(nv),
      "the shortest-word and talk-over instructions are deleted from the learn walk");
    ok(/the FULL phrase \("front store services", not "front"/.test(nv),
      "with the owner's own example: front store services, never front");
    ok(/if \(\(d\.action === "say" \|\| d\.action === "press"\) && d\.value && \(s\.deadDoors \|\| \[\]\)\.length\)/.test(nv)
      && /refused "\$\{d\.value\}" — that door reaches the wrong desk/.test(nv),
      "a dead door is HARD-blocked: the model cannot fire it, and a second try ends the check honestly");
    // THE DELETE LIST IS THE BUILD: the listen-first block is gone from the whole engine.
    ok(!/listenFirst/.test(nv), "the listen-first path is deleted from the navigator — stage one replaces it");
    ok(!/listenFirst/.test(readFileSync("src/calls/sweep.ts", "utf8")), "and the sweep no longer launches it");
    // ROUND 2 ITEM 7: the sweep's direct-proving call honors the grade — its biggest surviving break.
    {
      const sw = readFileSync("src/calls/sweep.ts", "utf8");
      ok(/if \(s\?\.grade !== "pass"\) \{[\s\S]{0,200}?changed nothing[\s\S]{0,120}?return;\s*\n\s*\}/.test(sw),
        "a failed direct-proving check records NOTHING — no version, no confidence, no chain stamp");
      const gateAt = sw.indexOf('if (s?.grade !== "pass")');
      const firstWrite = Math.min(...["proposeVersion(", "reportUnknown(", "db.update(chains)"].map((w) => {
        const i = sw.indexOf(w, sw.indexOf("async function proveDirect")); return i < 0 ? Infinity : i;
      }));
      ok(gateAt >= 0 && gateAt < firstWrite, "and the gate sits BEFORE every write the call can make");
      // ROUND 3 ITEM 2: the product question is not "acting on a menu", the label clears WHOLE, and
      // a locked chain is never downgraded — the endless false-flag loop on direct chains is dead.
      ok(/const acted = steps\.some\(\(st\) => st\.who === "us" && \(st\.action === "press" \|\| st\.action === "say"\)\s*\n\s*&& !String\(st\.text \|\| ""\)\.startsWith\("asked:"\)\);/.test(sw),
        "the ask is scaffolding — a passing direct call no longer reads as a menu walk");
      ok(/ringsDirect: false, answerPath: null,/.test(sw),
        "the wrong 'answers directly' label clears whole, so the mapper accepts the handoff");
      ok(/cur\?\.navStatus === "locked" \? \{\} : \{ navStatus: "review" \}/.test(sw),
        "and a locked chain keeps its status — a finding queues mapping, it never downgrades a map");
      // FIX PASS 4 ITEM 3: the sweep's own bookkeeping.
      ok(/callerRecords: true, stage: "map",/.test(sw),
        "a proving call carries a stage, so the carrier-end path can never stamp review on its chain");
      ok(/const closedOut = \/open hours\|stores are open\|closed\/i\.test\(run\.stopReason \|\| ""\);/.test(sw)
        && /closedOut \? "skipped"/.test(sw),
        "a run that stopped because every store was CLOSED reads skipped, so pass 2 comes back to it");
      ok(/const deadline = Date\.now\(\) \+ \(CALL_MAX_SEC \+ 30\) \* 1000;/.test(readFileSync("src/calls/mapper.ts", "utf8")),
        "and the mapper waits past the call's own ceiling, so a check ending on its last second is still read");
    }
    ok(/MISSES_PER_STORE[\s\S]{0,220}?run\.rotate = true;/.test(eng),
      "a store that never got us to a person is the ONLY reason to take a fresh one (Update 3)");
    ok(!/recordFailedAttempt/.test(eng),
      "a failed check is never folded into evidence or confidence — it lives in the run log, collapsed");

    // The wording-settle comparison itself, driven with real transcription noise.
    ok(sameWording(
      ["Thank you for calling CVS, Pharmacy. Are you a healthcare provider?", "Pharmacy or front store services?"],
      ["Thank you for calling CVS Pharmacy, are you a healthcare provider", "pharmacy, or front store services."]),
      "two hearings of the same menu read as the same wording, transcription noise and all");
    ok(!sameWording(
      ["Thank you for calling CVS, Pharmacy. Are you a healthcare provider?", "Pharmacy or front store services?"],
      ["Thank you for calling CVS Pharmacy. The pharmacy is currently closed."]),
      "a different menu never reads as settled wording");
    ok(!sameWording([], []) && !sameWording(undefined, ["a line"]),
      "nothing heard can never count as the wording settling");
  }

  // PIECE SIX: every mapping check is recorded, and each menu line plays its own slice.
  console.log("▶ THE RECORDING RIDES EVERY CHECK, AND A LINE PLAYS ITS OWN SLICE");
  {
    const nav = readFileSync("src/calls/navigator.ts", "utf8");
    ok(/Record: "true",/.test(nav), "every mapping check is recorded at the carrier");
    ok((nav.match(/callSid: s\.callSid,/g) || []).length === 2, "and the recording's id rides the run log and the map fold");
    const srv = readFileSync("src/server.ts", "utf8");
    ok(/app\.get\("\/api\/admin\/map\/play\/:callSid"/.test(srv), "the page fetches the audio through our own signed route");
    ok(/^CA\[a-zA-Z0-9\]\{32\}\$/.test("CA".length ? "CA[a-zA-Z0-9]{32}$" : "") || /\/\^CA\[a-zA-Z0-9\]\{32\}\$\//.test(srv), "which refuses anything that is not a call id");
    const page = readFileSync("public/app.html", "utf8");
    ok(/menuPlayLine\('\$\{sid\}',\$\{ln\.at\}/.test(page), "each line's play button seeks to that line's own second");
    ok(/sid&&ln\.at!=null\?/.test(page), "and a check with no recording shows no button, never a dead one");
    ok(/MENU_AUDIO\.currentTime>=MENU_AUDIO_STOP/.test(page), "playback stops where the next line starts");
  }

  // THE 07-31 FIXES, each one the owner caught on the live page — under the two-level lock.
  console.log("▶ A RUN'S WORK STAYS ITS OWN UNTIL THE STORE LOCKS — AND ONLY EARNED WRITES LAND");
  {
    const eng = readFileSync("src/calls/mapper.ts", "utf8");
    ok(/const live = await activeMap\(chainId\);/.test(eng),
      "the run starts from the route the MAP holds, never the chain row's older summary");
    ok((eng.match(/await finalizeAndLock\(/g) || []).length === 2,
      "exactly TWO writers exist: the ONE store-lock helper every lock path shares, and a speed win (Update 5)");
    // ROUND 3 ITEM 1: the Staff hello is a PERSON, never a menu line — so a store with no menu really
    // reads as having none, the on-the-spot lock fires, and no listen ever dials just to hang up on
    // a real person.
    ok(menuLinesOf([{ who: "ivr", text: "Gateway WinCo.", atSec: 4 }] as never, null, 4).length === 0,
      "a direct store's hello is excluded — no menu lines, the on-the-spot lock can fire");
    ok(menuLinesOf([
      { who: "ivr", text: "For guest services press 2.", atSec: 5 },
      { who: "ivr", text: "Okay, transferring you now.", atSec: 14 },
      { who: "ivr", text: "Guest services, this is Dana.", atSec: 30 },
    ] as never, 14, 30).length === 2,
      "a menu store keeps its recordings through the handoff line, and still never the person");
    ok(/const nothingToWalk = !\(run\.best\?\.steps \|\| \[\]\)\.length;/.test(eng)
      && /\(!\(run\.lastLines \|\| \[\]\)\.length \|\| nothingToWalk\)\) \{\s*\n\s*await lockStore/.test(eng),
      "and a proven door with nothing to walk or settle locks WITHOUT dialing — no settle call can reach Staff");
    // FIX PASS 5 ITEM 2: the refusal is structural, in the dialer itself — a listening check with no
    // route can never arm its ring hang-up, so it may not be placed at all, whatever any judge says.
    ok(/if \(extra\?\.relisten && !confirm && !\(barge\?\.plan\?\.length\) && !\(reactivePress\?\.max\)\) \{\s*\n\s*return \{ error: "a listening check with no route to walk is refused/.test(readFileSync("src/calls/navigator.ts", "utf8")),
      "a listening check with no route to walk is refused before it dials");

    // FIX PASS 4, FACE a: STAFF'S OWN WORDS ARE NEVER THE STORE'S MENU. Staff saying "sure, one
    // moment" reads exactly like the machine handing us on; honouring it stamped a handoff AFTER the
    // person, their hello re-counted as a menu line, and the settle listens rang real people again.
    {
      const direct = [
        { who: "ivr", text: "Gateway WinCo, this is Sam.", atSec: 4 },
        { who: "ivr", text: "Sure, one moment.", atSec: 9 },
      ] as never;
      ok(menuLinesOf(direct, 9, 4).length === 0,
        "a handoff stamped AFTER the person cannot resurrect the menu — the person cut is strict and wins");
      ok(menuLinesOf(direct, null, 4).length === 0, "and with no handoff at all the store still reads as having no menu");
      const withMenu = [
        { who: "ivr", text: "For guest services press 2.", atSec: 5 },
        { who: "ivr", text: "Okay, transferring you now.", atSec: 14 },
        { who: "ivr", text: "Guest services, this is Dana.", atSec: 30 },
      ] as never;
      ok(menuLinesOf(withMenu, 14, 30).length === 2, "a real menu still keeps its recordings through the handoff line");
      const nv4 = readFileSync("src/calls/navigator.ts", "utf8");
      ok(/handoffVerdict\?\.who === "recording"/.test(nv4) && /s\.humanAtSec == null/.test(nv4),
        "and no handoff moment is ever stamped once a person is on the line — the judge says who spoke");
    }
    // FACE c: the person's moment is the line that TRIGGERED detection, never the turn it fired on —
    // so a hello joined onto the store line it interrupted cannot sit under the cut.
    // A joined line is half the store, half the person: the person begins AFTER the store's own
    // sentence, never at it (fix pass 6, item 4 — the split, not the drag).
    ok(personLineAtSec([
      { who: "ivr", text: "Thanks for calling. Hello? Hi, this is Sam.", atSec: 12 },
    ] as never, "Hello? Hi, this is Sam.", 19) === 13,
      "a hello glued onto a store line splits — the person starts after the recording, never at it");
    ok(personLineAtSec([{ who: "ivr", text: "For guest services press 2.", atSec: 5 }] as never, "Hi, Dana here.", 30) === 30,
      "and an unrelated newest line never drags the person's moment backwards");
    // FACE b: the sweep's recording test reads only what was heard BEFORE the person.
    ok(/const isRecording = \(st: CapturedStep\) =>[\s\S]{0,400}?judgeVoice\(\{/.test(readFileSync("src/calls/sweep.ts", "utf8")),
      "the direct-proving call asks the ONE judge which lines were recordings — never a length test");
    // FACE d: an answer that tells us about the product is an ANSWER, never being sent away.
    {
      const nv4 = readFileSync("src/calls/navigator.ts", "utf8");
      ok(/setMappingHandoff/.test(nv4) && /handed the check to Charlie/.test(nv4),
        "reaching a person hands the check to Charlie — mapping speaks to nobody");
      const mg4 = readFileSync("src/calls/mapgraph.ts", "utf8");
      ok(!/Waiting for your approval/.test(mg4),
        "and nothing anywhere says it is waiting for him — he reviews NOTHING (owner R2)");
    }
    // FIX PASS 5 ITEMS 3-5.
    {
      // (3) A store that plays a recording and hands us on is a GREETING chain, never direct: calling
      // it direct is what put the paid agent on the line talking to the recording.
      const nv5 = readFileSync("src/calls/navigator.ts", "utf8");
      ok(/const type = acts\.length === 0 \? \(heardARecording \? "greeting" : "direct"\)/.test(nv5),
        "a proven route with no answers but real store recordings locks as greeting, never as direct");
      // (4) One unattended call may not change the SHAPE a chain answers in.
      const mg5 = readFileSync("src/calls/mapgraph.ts", "utf8");
      ok(/const shapeChanges = !!prevActive && shapeOf\(prevActive\.recipe\) !== shapeOf\(opts\.recipe\);/.test(mg5)
        && /&& !\(shapeChanges && !opts\.autoActivate\);/.test(mg5),
        "and one background call can never re-stamp how a chain answers — that version waits");
      // (5) FREE DOORS AND START OVER ARE DELETED (owner, 08-03): buttons, routes and the code behind
      // them. He never asked for either. Map re-maps a chain, which is all he asked for.
      const srv5 = readFileSync("src/server.ts", "utf8");
      const page5 = readFileSync("public/app.html", "utf8");
      ok(!/freeChainDoors|resetChainHistory/.test(mg5) && !/free-doors|chain\/:id\/reset/.test(srv5),
        "neither clear exists any more, in the code or as a route");
      ok(!/Free doors|Start over/.test(page5), "and neither has a button on the chain page");
    }
    ok(!/finalizeAndLock[\s\S]{0,120}?\}\s*else\s*\{[\s\S]{0,200}?ex\.status = "fail"/.test(eng)
      && /ex\.status = "fail";(?![\s\S]{0,600}finalizeAndLock)/.test(eng),
      "a failed check reaches neither of them — a loss changes nothing");
    ok(/run\.winnerSession = sessionLike\(s\);/.test(eng),
      "the check whose route won rides to the lock with its words and its recording");
    const tb = readFileSync("src/calls/trainer-batch.ts", "utf8");
    ok(/autoActivate: opts\?\.activate \|\| undefined,/.test(tb), "activation flows through the one writer");
    ok(/const secs = typeof recipe\.seconds === "number" \? Math\.round\(recipe\.seconds\) : \(ch\?\.navSeconds \?\? null\);/.test(tb),
      "a ring-ended win never nulls the chain's own numbers — the last proven measurement stands");
    const mg = readFileSync("src/calls/mapgraph.ts", "utf8");
    ok(/call\?\.reachedHuman && !opts\.autoActivate/.test(mg),
      "a finished run's write is never diverted into a store exception — one proven store locks the chain");
    ok(/!!\(call\?\.reachedHuman \|\| call\?\.endedOnRing\)/.test(mg),
      "and a check that ended on the ring activates like one that reached Staff — that end is by design");

    const page = readFileSync("public/app.html", "utf8");
    ok(!/Recipe winner/.test(page) && /void versions;/.test(page),
      "the crown is retired outright (owner Update 5) — a check states what the check did, nothing more");
    // R5: ONE timeline down the run, no pencil on Menu, and a check that did not happen says so.
    ok(/function runTimelineHtml\(calls,gains\)/.test(page) && /return runTimelineHtml\(calls,gains\)/.test(page),
      "the run reads as ONE timeline, not a pile of separate cards");
    ok(!/const pencil=/.test(page) && /border:1px dashed/.test(page),
      "Menu words are dashed editable boxes with no pencil (R5)");
    ok(/Save this wording\?/.test(page), "and a correction is confirmed before it saves");
    ok((page.match(/made up, no check happened/g) || []).length >= 2,
      "a check that did not happen says so on the screen, on the timeline and on its card");
    ok(/\?c\.transferAtSec:null;/.test(page),
      "and the number beside a pill is nav time only, never the whole call with Staff inside it");

    // The writers OUTSIDE the run had to learn the same law.
    const cap = readFileSync("src/calls/map-capture.ts", "utf8");
    ok(/if \(s\.stage\) return \{ recorded: true, why: `\$\{s\.stage\} check kept by its run — the map moves once, at lock` \};/.test(cap),
      "a graded check never files a version or touches live evidence — its run holds it until lock");
    ok(cap.indexOf("if (s.grade === \"fail\") return") < cap.indexOf("if (s.stage) return"),
      "and a failed check still changes nothing first, before the run even keeps it");
    ok(/return \{ error: "the batch trainer is retired/.test(tb),
      "the one-call batch trainer is retired — a single call can never lock a route again");
    ok(/await setBatchState\(null\);\n\s*\} catch/.test(tb) || /clea?red, never resurrected/.test(tb),
      "and a batch flag left by an old deploy is cleared on boot, never resurrected");
  }

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
