# Data-lane tools (carried from the prior chat's scratchpad — reference implementations)

Rough working tools, preserved so they aren't lost in the repo migration. Adapt paths/token for this env.

**Runtime expectations (all scripts):**
- Admin API needs a **browser User-Agent** (Cloudflare blocks non-browser UA) + `x-admin-token` header.
- Token is read from a file path (was `/tmp/.atok`) — repoint to wherever the token lives now, or an env var.
- `BASE` = `https://staging.checkitforme.com` (source of truth) or `https://checkitforme.com` (prod).

**Hobby-hours wave machine** (resume the paused backfill):
- `hobby_nohours.py` — list hobby stores that still have NO hours (RE-DERIVE from the live DB — the old
  `hobby_done_ids.txt` progress file did NOT survive; query hobby chains' stores where `hours IS NULL`).
- `build_wave.py` — split the no-hours list into ~14 batches of ~30, sorted by state/city.
- `agg_hobby.py` — aggregate the 14 WebSearch-subagent JSON outputs → canonical hours → id-keyed
  `POST /api/stores/patch`. `--apply` to write; all-7-closed → deactivate; all-unknown → skip.
- Flow: `hobby_nohours.py` → `build_wave.py` → 14 free WebSearch subagents write id-keyed JSON → `agg_hobby.py --apply`.
- ⚠️ WebSearch subagents bill the ORG's monthly Claude spend (this is what paused the loop). Confirm reset first.
  NEVER use the server's OpenAI/Gemini hours lookup — that bills the owner (forbidden).

**Chain audit / reconcile** (staging↔prod mapping):
- `chain_diff.py` — diff chains staging vs prod (categorization fields).
- `named_state.py` — show current state of specific chains on both envs.
- `reconcile_apply.py` — apply categorization fixes (DRY default; `--stag`/`--prod`/`--apply`).
- `clean_direct_seconds.py` — null `avgTreeSeconds` on direct-ring chains (the silent-agent cleanup).
