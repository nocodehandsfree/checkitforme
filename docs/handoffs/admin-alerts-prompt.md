# Admin build: customer Alerts (SMS + Email) — message store, sending, metering, tracking

Website will wire the consumer front end to this; you own the message store, the senders, the
per-plan limits, and the tracking UI. Everything customer-facing runs through the Copy Style Guide
(`docs/style-guide/COPY_STYLE_GUIDE.md`) — no em-dashes, friend voice, "check" is the unit.

## 1. Channels & rules (owner-set)
- **SMS (Twilio):** restock alerts, and any alert the owner marks SMS-eligible.
- **Email (branded, from Bravo/whatever ESP):** store-added notify, waitlist "your area is live",
  receipts, and anything else. **Store-added and waitlist are EMAIL-ONLY — never SMS.**
- Emails must be **Check It For Me branded** (logo, colors per `BRAND.md`), copy-guide reviewed.
  (Owner is having the email HTML designed separately; you own the send + template slots.)

## 2. Editable message templates (Admin UI)
A table of message templates the owner can edit live (no deploy), keyed by event:
`restock_alert`, `store_added`, `waitlist_live`, `signup_welcome`, (add as needed).
Each template: channel (sms|email), subject (email), body with tokens
(`{store} {product} {city} {name} {checksLeft}`), enabled on/off. Persist like policy_json.
Expose read to the sender; expose edit in Admin. Run each default through the copy guide.

## 3. Per-plan SMS metering (COGS control)
- Each plan tier has a **monthly SMS-alert cap** (e.g. Family = 5). Store on the plan
  (`plans.tiers[].smsAlertsPerMonth`) so it's editable in the plans editor.
- Track sends per account per month; **stop sending SMS once the cap is hit** (email has no cap unless
  you want one). Expose the remaining count so the consumer can show "N alerts left this month".
- Comp/owner = unlimited.

## 4. Sending API (what Website calls)
- `POST /app/alerts/subscribe { event, channel, target }` — opt an account into an alert
  (e.g. restock for a store+product). Enforce entitlement + channel rules server-side.
- `GET /app/alerts/me` — the account's active subscriptions + `smsAlertsLeft`.
- Server-side send happens on the trigger (restock detected, store approved, area goes live) —
  render the template, meter, send via Twilio/ESP, and LOG it.

## 5. Tracking (Admin UI)
- A **Messages** dashboard: total sent by event/channel/day, and per-customer:
  who is subscribed to what, how many they've received, remaining cap.
- A log table (account, event, channel, sent_at, status) so we can audit deliverability.

## 6. Coordination with Website
- Website wires: restock-alert opt-in (already a "watch" form), waitlist form, and the
  store-added path to call the subscribe/send API; enforces email-only where specified; shows
  "alerts left" + subscription state in the consumer UI.
- Give Website the exact endpoint shapes + the entitlement/limit fields on `/app/me` (add
  `smsAlertsLeft`, `smsAlertsCap`) so the front end can display and gate.

## Not in this build
Scheduled-checks scheduler, Restock-Intel page, call scripts/voice — separate tracks.
