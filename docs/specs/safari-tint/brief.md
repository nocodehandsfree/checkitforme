# Safari tint + stale PWA — one chat, one mission
**What this is · who it's for:** Fable's diagnosis (2026-07-07) of the two owner-reported bugs. Fresh-eyes chat; owner verifies on device.

## Bug 1 — plain-Safari top doesn't tint (A2HS does)
**Root cause found in code:** TWO tint systems coexist and one is dead.
- `public/checkit.html` head comment: NO theme-color meta on purpose — iOS samples the page top per edge from the `html:has(body.rview.rv-*)` gradient, applied by the post-<body> boot script. (Right idea: per-edge sampling is the ONLY way to get green top + dark bottom in Compact Safari.)
- `src/server.ts` renderRunner (~L270): still replaces `content="#0C0C12" id="themeColor"` — **that meta no longer exists**, so the replace silently no-ops, and its comment FALSELY claims the color is "baked into the served HTML". Dead code + lying comment = why every agent loops.
- **Timing hole:** sampling only sees what's painted when Safari samples. The tone class arrives via script (and on result deep-links possibly after data fetch) → Safari sampled a dark page → top stays dark.

**Fix candidate (small, surgical):**
1. renderRunner: for `?tone=` deep-links, bake a CLASS on the html tag itself — replace `<html lang="en"` with `<html lang="en" class="tone-<tone>"` — plus static CSS `html.tone-in{background:linear-gradient(#266440 0,#266440 45%,#0C0C12 55%)}` (same for out/unk/soon). First paint = correct top color, zero JS dependency.
2. Keep the existing boot-script class path for in-page tone changes (Safari resamples on scroll).
3. DELETE the dead `id="themeColor"` replace in renderRunner + rewrite both comments to describe ONE system.
4. Do NOT reintroduce a theme-color meta (re-breaks: tints the bottom bar too).

**Verify (owner's device, no shortcuts):** /r?tone=in|out|unk|soon in plain Safari — top matches verdict, bottom bar stays dark; repeat in A2HS; repeat after a result arrives in-session (scroll once). All four tones.

## Bug 2 — installed A2HS app shows an OLD design
Stale service-worker shell (known trap). Fix: bump the SW cache version in `public/sw.js`, add skipWaiting + controllerchange→reload so installed apps self-update, and verify the owner's installed app updates without delete/reinstall. Check the precache list still matches current routes.

## Done when
Owner confirms on device: 4 tones tint to the top in plain Safari, bottom bar dark, A2HS unchanged, installed PWA shows current design after one relaunch.
