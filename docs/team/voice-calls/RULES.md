# VOICE-CALLS — NEVER-BREAK RULES (exempt from all size caps: ADD, never delete to fit)
Read EVERY line EVERY session before touching code. One line per rule: the rule, then the failure
that made it law. A rule leaves this file only when the owner himself retires it.

1. Cut-in is PER WORD: "general" MAY be spoken while the store is still talking; "front" NEVER —
   wait for quiet. A timed "front" hit the wrong question, the menu looped, pharmacy Staff answered (07-30).
2. Hang-up-on-the-second-ring applies to EVERY mapping check — re-listen AND speed-up alike. It was
   wired to re-listens only and real Staff picked up three times (07-30).
3. The Menu screen shows the LOCKED recipe, never the newest try. Broken tries rendered as CVS's menu (07-30).
4. The menu keeps the STORE's exact words even when misheard ("front store services" stays as heard;
   never print our word over theirs — that fakes the record. Corrected by hand once, in Admin).
5. CVS's locked route stays: no → front → general. Its nav time is the AVERAGE of its checks — a new
   check NUDGES the number, never overwrites it. A check we ended reads "Admin hung up", never "nobody answered".
6. A ring moment must NEVER become the agent's start timer: ring-ended checks write no timer on purpose,
   so the agent waits for a voice instead of joining a ringing desk.
7. Auto-nav failing to parse a menu is NEVER "no human at this chain" — press-test before calling a chain dead.
8. Screen words come from Statuses, nowhere else; "the check failing IS the report" — a scorecard row
   exists only if a WORKING check could hide the problem from the owner.
9. A mapping run's memory must NEVER live only in the process: it is saved (`mapper_run:<chain>` in
   settings) after every attempt and resumed on boot, 90s delayed so old and new never dial together.
   A stop stays stopped; the call in flight at the restart is logged as not-evidence. Two runs died
   to teammates' deploys before this (07-30). Proof: `scripts/test-mapper-resume.ts`.
10. ADMIN IS THE RECORD OF TRUTH for voice tuning: a setting changed anywhere (the provider's own
    dashboard included) is written back to Admin the same session. Workflows/routing live at
    Admin → Voice → Workflows (`vt_workflows`); "the beat" = the pause before the agent takes its
    turn, owned by the workflow (see `elevenlabs.ts` turn-taking notes). Two known lies: code
    comments claim a `call_tuning` Admin screen that DOES NOT EXIST, and Designer/Workflows write
    PROD voice config (no environment picker shipped) — "just tuning" can touch the real site.
11. A FIX COVERS THE WHOLE FAMILY, never the one door. Found a caller reading the wrong source of
    truth? Grep out EVERY caller of that source and fix all of them in ONE commit, listed in the fix
    note. Runs 1-3 on 08-01 were one fault fixed three times through three doors, at the cost of
    three of the owner's live calls.
12. THE OWNER'S PHONE NEVER RE-FINDS AN OLD FAULT. Before inviting him to dial again, replay every
    prior recorded run against the fixed engine on the rig; he dials only after all replay clean.
    His calls prove new ground only. And on ANY live fault, the engine's own log is read FIRST,
    before any code is opened (08-01: it showed each fault exactly, and was reached third).
