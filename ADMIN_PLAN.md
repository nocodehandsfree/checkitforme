# Admin redesign — plan of action (frog pass)

Bar = the consumer front end: minimal, drawn marks only where they earn it, strong hierarchy,
room to breathe, copy cut to the essential line. Work top-traffic first. Ship per page, validate
(tsc + node --check the big script), poll the admin marker.

## Global (applies to every page)
- [x] Kill generic header icons → clean bold titles + green tick-bar anchor
- [x] Body copy softened (#cdcdd8); only section headers bright
- [x] Dropdown/select text → light gray
- [x] Unified range sliders (match consumer radius slider)
- [x] Header = check + "Admin" (dropped "Caller")
- [x] Refresh no longer flashes God view (restore tab before loads)
- [x] White logo tiles → dark
- [x] Drawn verdict marks (green check / red X / gold truck), no raw emoji
- [ ] Collapsible heavy cards — long sections collapse (details/summary) so pages aren't walls
- [ ] Tiny unreadable stat tiles — set a min size + readable number/label type ramp
- [ ] Nav: decide final treatment (keep minimal line-icons or go text-only) — get owner's eye
- [ ] Consistent chip system (verified / type / product / day) — one size, one radius, one weight
- [ ] Card rhythm pass: header→meta→body spacing identical on every card

## God view (dash)
- [x] Palette cut to green/red/neutral, drawn marks, live pulse dot
- [ ] Money & cost tiles: align, readable, no truncation on mobile
- [ ] Actions row: tighten, label the buttons clearly
- [ ] Live/recent lists: consistent row height + spacing

## Stores
- [x] Store Intel panel (total/callable/states/chains/per-product) — /api/admin/store-intel
- [x] Search-first (no 100k / no "W" dump) — type to pull stores
- [ ] Store card polish: name/branch/meta hierarchy, chip row, action row spacing
- [ ] "Look up all hours" — confirm it still makes sense at 100k (probably scope to search results)

## Calls
- [x] Drawn verdict pills + restock-incoming
- [ ] Card spacing + transcript (details) polish; tighten the summary line

## Playbook
- [x] Phone Trees copy cut; sub-nav no wrap; option emojis gone
- [x] All Chains + Statuses intro copy cut to one line
- [ ] All Chains list: row density (avg/confirms/mute/repack) — make scannable, not noisy
- [ ] Statuses editor: tighten the row, the drawn-icon preview is in — verify alignment

## Growth
- [ ] Copy spacing pass (owner flagged) — funnel stats + the moderation/requests/waitlist cards

## Business
- [ ] Margins/credits cards: align, label, breathe

## Map (admin)
- [ ] Match the consumer map exactly (dark CartoDB, no +/- control, clean pins)

## Schedules
- [x] Empty-state padding tightened
- [ ] Day-toggle grid spacing; new-schedule form rhythm

## Zones — reference page (already clean). Mirror its density elsewhere.

## Catalog
- [x] Too empty — now shows each tracked category with its real store count (from store-intel)

## Labs
- [x] Voice pickers (Talk + Bench), clone test
- [ ] Section rhythm + collapse the less-used tools

## Settings
- [x] Flag labels cleaned to plain text
- [ ] Group flags logically, tighten toggles, label sections

## Backend tie-ins already done
- [x] 48h stock freshness (green expires)
- [x] /api/retailers server-filtered + capped (no 100k dump, no 6s poll)
- [x] best-bet bbox (no whole-table in RAM)
