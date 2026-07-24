#!/usr/bin/env bash
# snapshot-truth.sh — snapshots every consumer page/state from STAGING into docs/design/truth/
# (REBUILD_PLAN 2026-07-22). The consumer site is FROZEN and these snapshots + the live site ARE
# the design reference for it — consumer comps are archived, the live site beats any comp.
# Re-run for a page right after an owner-named unlock task ships (part of the unlock flow).
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-https://staging.checkitforme.com}"
OUT="docs/design/truth"
mkdir -p "$OUT"
UA="Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0"

snap() { # name path
  local name="$1" path="$2" code
  code=$(curl -sL --max-time 30 -A "$UA" -o "$OUT/$name.html" -w '%{http_code}' "$BASE$path")
  if [ "$code" = "200" ]; then
    echo "  ✓ $name  ($path)"
  else
    rm -f "$OUT/$name.html"
    echo "  ✗ $name  ($path) → HTTP $code (not saved)"
  fi
}

echo "▶ snapshot-truth — $BASE → $OUT/"
# The four brand skins of the one storefront.
for brand in pokemon onepiece toppsbasketball needoh; do
  snap "$brand-home" "/?brand=$brand"
done
# The SPA states site-health walks (the shell is shared; server bakes brand + tone).
snap "home"       "/"
snap "home-v2"    "/?skin=v2"
snap "signup"     "/?skin=v2&show=signup"
snap "mychecks"   "/?skin=v2&show=mychecks"
snap "hobby"      "/?skin=v2&flow=hobby"
snap "result-in"  "/?skin=v2&call=sim_1700000000000_in"
snap "result-out" "/?skin=v2&call=sim_1700000000000_out"
# Verdict tone deep-links (server bakes the tone class onto <html>).
for tone in in out unk soon; do
  snap "tone-$tone" "/?tone=$tone"
done
# Top-level content pages.
for p in privacy terms faq about; do
  snap "page-$p" "/p/$p"
done
# The share landing.
snap "share" "/s"
echo "→ done. Truth lives in $OUT/ — the reference for the frozen consumer site."
