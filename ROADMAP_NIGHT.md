# Build Roadmap — live working list (do not stop until done)

Status key: [ ] todo · [~] in progress · [x] done

## 1. i18n / Spanish — make it truly modular (EVERY user-facing string)
The i18n system only translates elements with `data-i18n` + an ES entry in `I18N.es`.
Most newer UI has neither, so Spanish mode leaks English. Fix systematically.
- [x] Earn module ("Share what you scored", "Add your store", "Earn free calls")
- [x] Result page CTAs ("Check another store", "Sign up & keep checking", verdict titles/notes)
- [x] Footer: "Logros 🏆" → "Logros" (drop trophy); keep Scores/Logros in sync everywhere
- [x] All buttons (Pick a store, Verify, Continue, Post it, Watch this store, etc.)
- [x] All input placeholders (search, email, code, store, product)
- [x] All error/toast messages
- [x] Demo body ("Llamando a Target" lines) — translate per language
- [x] Transcript: render Fungie/Clerk + any narration in ES when lang=es
- [x] Modals (buy, lead, watch, schedule, receipt, kiosk, refer, success)
- [x] Status registry labels (pulled from admin) — ES variants
- [x] Sweep: grep every literal string in runner.html, ensure data-i18n + es

## 2. Checks/history page polish (frog)
- [x] Store name bold, address below, category+time smaller/grayer
- [x] Status icons bigger (were same size as text)
- [x] Remove confusing "Saved on this device. Tap any check to replay it."
- [x] Tighten alignment on transcript + store/status rows everywhere

## 3. Navigation bug
- [x] Back from transcript/history goes to wrong vertical (one piece, not the
      pokemon page you were on). The call deep-link history.replaceState pollutes
      browser history. Fix in-app back + avoid polluting history across verticals.

## 4. Pricing → MINUTES model (was per-call credits)- [ ] Buy MINUTES, not checks. Charge by the minute (call duration).
- [ ] Monthly sub includes a minute allotment.
- [ ] Volume discount: more minutes = cheaper per minute.
- [ ] Cost control: phone-tree navigation must be FAST (don't linger on calls).
- [ ] Migrate credits→minutes across: account model, packs, sub, call charging,
      zone quote (minutes per store est.), header pill, low-balance reminder.
- [ ] Profit floor: per-minute price must exceed EL(~$0.10/min)+Twilio(~$0.014/min)+LLM.

## 5. Admin
- [ ] Why Clerk for admin? → moving admin to admin.fungibles.com + username/password
      (Clerk was the inherited gate; u/p is the plan). Needs first-login test w/ owner.
- [x] Admin frog pass round 1 (components ported; expect owner feedback round).
- [ ] Voice studio is built (select + record-to-clone). "Jared (owner)" cloned.
- [ ] Scalability refactor: extract shared components/modules; reduce runner.html size.

## 6. Owner-gated (do together / needs keys)
- [ ] admin.fungibles.com DNS + u/p first login
- [ ] Set live voice (Jared vs Branson)
- [ ] User-facing zones go-live (credit/minute guard already wired)
- [ ] Clerk production keys + cross-domain (tomorrow)

## 7. From the business-model session (owner-approved, build in this order)
- [ ] BAIL LIBRARY (rules engine): proactive call cutoffs (got answer->instant hangup,
      voicemail, IVR>90s, hold>60s, ring>N, closed). Max cap 180s. Per-rule toggles in admin.
- [ ] TIERED AGENT HANDOFF (see KNOWLEDGE_TRANSFER "Handoff architecture"): bridge-first
      cheap navigation (Twilio+light STT), EL agent joins ONLY when human detected.
      EL minutes only burn on human conversation. Phase-1 cost ~$0.03/min.
- [x] Chain classification on data structure: answerPath (direct_human|simple_ivr|deep_ivr),
      avgTreeSeconds, repackOnly flag -> UI on/off/mute per chain + save customers wasted calls.
- [ ] Post-miss hook: ONE free restock alert (email/SMS) -> drives them back + upgrade ask.
- [x] Live-call chat bubbles: real-time turn-by-turn bubbles on the live page (wow factor).
- [ ] Speed flex copy: "Done in 1:12 — faster than you could've" + AI-future framing.
- [ ] AI CALL SUPERVISOR: watchdog agent over all live calls, enforces bail rules,
      auto-hangup + email-why + show-on-live-page + Discord bot credit flow (later).
- [ ] Stores-to-fix actions: mute-all / reverify-zone (cheap-mode calls).
- [ ] Bad-number feedback loop: customer flags -> free check credit; bad# call costs ~$0.
- [ ] NATIONAL HUNT premium: out-of-area zones ranked by demand-pressure + distributor +
      restock day; pairs with runner/Uber loop. HIGH PRIORITY after 95K import.
- [ ] Zone-gated launch: cap users per zone, launch zones by community VOTE (marketing game).
- [ ] SMS gate decision: email for free check, SMS required at sub (phone powers alerts +
      future decentralized calling). Clerk SMS needs paid plan; Twilio Verify alt ~$0.05/v.
- [ ] COOK-GROUP INGEST (owner idea, 2026-06-12): we subscribe to 4 cook groups whose Discord
      monitors post restocks (e.g. Micro Center per-store stock embeds — see "misc-sites" channel).
      Owner wires the bot to watch channel IDs and append to a log in the repo; we parse embeds into
      restock intel (store, product, stock state) — zero scraping-API cost, covers site-only chains
      like Micro Center. PLAN ONLY for now — owner does the Discord wiring first.
- [ ] New-product onboarding recipe (Magic etc): brands.ts entry + logo PNG + DEMO_SCRIPTS
      line + ES hero line + category/products in catalog + KNOWN_CARRIES allowlist. Nothing else.
- [ ] CONTENT MODERATION for the Scores wall (owner, 2026-06-13: "someone writes PENIS and posts
      their cock — humans are insane"). Infra already half-built: posts carry `approved` +
      policy.flags.communityAutoApprove. TODAY's mitigation: flip communityAutoApprove OFF in admin
      policy → every post is hidden until approved in admin. BUILD NEXT: AI screen on upload
      (vision NSFW + caption profanity) auto-approves clean posts so the wall stays instant;
      report button on posts; admin queue w/ one-tap approve/nuke + ban-by-IP/email.
- [ ] Referral/share outbound copy: the share-sheet message users text to friends — write per-language
      templates (EN+ES table like DEMO_SCRIPTS); links already unfurl with og:image cards on X/iMessage.
