# Data-lane tools (carried from the prior chat's scratchpad — reference implementations)

Rough working tools, preserved so they aren't lost in the repo migration. Adapt paths/token for this env.

**Runtime expectations (all scripts):**
- Admin API needs a **browser User-Agent** (Cloudflare blocks non-browser UA) + `x-admin-token` header.
- Token: `ADMIN_TOKEN` env var, else a `.atok` file in cwd (fetch from Railway staging vars; keep in
  scratchpad, never commit).
- `BASE` = `https://staging.checkitforme.com` (source of truth) or `https://checkitforme.com` (prod).
- ⚠️ **curl subprocess ONLY** in this env — python urllib/requests are blocked by the agent proxy
  (fails looking like the site is down). `hobby_nohours.py`/`agg_hobby.py` converted 2026-07-10.
- ⚠️ **Headless Chromium is proxy-blocked too** (verified 2026-07-10: ERR_CONNECTION_RESET even on
  example.com, with and without proxy config — org egress policy, don't route around). Direct
  Google/Bing/DDG via curl all serve bot-check interstitials. So free scraping from THIS env is dead;
  the WebSearch-subagent wave (org-billed) or the owner's local consumer machine are the only paths.

**Hours wave machine** (hobby, thrift, any category):
- `hobby_nohours.py [Type]` — list active stores of a chain type with NO hours, re-derived from the
  live DB (never trust old counts/progress files) → `<type>_nohours.csv`.
- `build_wave.py [src.csv]` — split the no-hours list into ~14 batches of ~30, sorted by state/city.
- `agg_hobby.py` — aggregate the WebSearch-subagent JSON outputs (`$OUT/hb*.json`) → canonical hours →
  id-keyed `POST /api/stores/patch`. `--apply` to write; all-7-closed → deactivate; all-unknown → skip.
- Flow: `hobby_nohours.py` → `build_wave.py` → 14 WebSearch subagents write id-keyed JSON → `agg_hobby.py --apply`.
- `hobby_done_ids.txt` (committed here) = every id already attempted by a wave, including the
  all-unknown skips. Copy it into your working dir before `build_wave.py` so waves never re-pay for a
  store that already came back empty. APPEND this wave's attempted ids and re-commit after each wave.
- Wave-1 reality check (2026-07-10): 420 tail stores → 11 hours + 4 permanently-closed + 3 fake "24/7"
  blocked; 402 all-unknown. The no-hours tail is mostly home-based online sellers with no Google hours
  panel — do NOT keep burning waves on it; it's owner's-local-machine territory. Thrift is the opposite:
  all chains (Goodwill/Salvation Army/Savers), and their locator sites answer plain curl — harvest
  hours FREE from locators before any WebSearch spend.
- ⚠️ WebSearch subagents bill the ORG's monthly Claude spend (this is what paused the loop). Confirm reset first.
  NEVER use the server's OpenAI/Gemini hours lookup — that bills the owner (forbidden).

**Chain audit / reconcile** (staging↔prod mapping):
- `chain_diff.py` — diff chains staging vs prod (categorization fields).
- `named_state.py` — show current state of specific chains on both envs.
- `reconcile_apply.py` — apply categorization fixes (DRY default; `--stag`/`--prod`/`--apply`).
- `clean_direct_seconds.py` — null `avgTreeSeconds` on direct-ring chains (the silent-agent cleanup).
