# Alerts can't actually send — launch blocker

**What:** Alert delivery is stubbed: SMS is logged-not-sent until the Twilio number clears A2P 10DLC,
and email needs the Brevo key set. So no customer alert (restock, auto-check, store-added, waitlist,
confirm-email) can actually reach a customer at launch — the whole Alerts feature is non-functional
until the providers are live. Track on the GTM checklist as a launch-critical blocker.
**Done when:** Twilio A2P cleared + Brevo key set; a real test alert is received on a real phone/inbox.
**Lane:** Ops
**Tag:** cut
**Status:** open (launch-critical)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
