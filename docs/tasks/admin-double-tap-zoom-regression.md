# Admin: double-tap zooms the page again (regression)

**What:** On the owner's phone, double-tapping anywhere in Admin zooms the page in. This was fixed
once and has come back — something re-introduced it. Find the commit that carried the original fix
(`git log` on `public/app.html` for the viewport/touch handling), find what overwrote it, restore it.
Never re-introduce a reverted fix (LAW 3); note the culprit commit in this file when closing.

**Done-when:** Double-tap anywhere in Admin on an iPhone does nothing. Driven on a real phone or
reported as the one blind spot ("pushed, check your phone"). `ship-admin.sh` output pasted here.

**Timing (owner, 08-01 night):** fix in the MORNING, after the logo work lands and BEFORE the
owner starts his Echo test day — Admin ships live in seconds and must not move mid-test.

**System:** admin · **Status:** active

**Related, no work needed:** the owner's last Fun-store test row (id 227) has a slide-up that opens
nothing — it predates the 08-01 website-check fix (row carries no name to open with). Old rows stay
that way; every new check writes its name before dialing. Voice PM confirms on the morning check.
