#!/usr/bin/env bash
# THE STOP BUTTON (owner 07-20). Kills every orphaned test process the suites can leave behind —
# tsx test runners, the headless browsers, and any local test server squatting on ports 8788-8799 —
# then clears the throwaway .t-*.db files. Safe: it only targets test artifacts, never a real dev
# server or unrelated work. Run it any time compute feels stuck: `bash scripts/kill-tests.sh`.
cd "$(dirname "$0")/.."
echo "▶ clearing orphaned test processes…"

# 1) tsx runners executing a test/qa script, and the qa shell scripts themselves.
pkill -f 'node_modules/.bin/tsx .*scripts/(test|qa)-' 2>/dev/null && echo "  · killed tsx test runners"
pkill -f 'scripts/(qa|test)-.*\.(sh|mjs)' 2>/dev/null && echo "  · killed qa/test shell+node scripts"

# 2) headless browsers spawned by the page/glass/live-view suites.
pkill -f '(chromium|chrome|headless_shell).*(--headless|--remote-debugging|pw-browsers)' 2>/dev/null && echo "  · killed headless browsers"

# 3) anything still holding a test port (the smoke servers).
for p in 8788 8791 8792 8793 8794 8795 8798 8799; do
  pid=$(lsof -ti tcp:$p 2>/dev/null)
  [ -n "$pid" ] && kill -9 $pid 2>/dev/null && echo "  · freed port $p (pid $pid)"
done

# 4) throwaway test databases + volumes.
rm -f .t-*.db 2>/dev/null; rm -rf .t-vol 2>/dev/null
echo "✓ done. Nothing test-related should be running now."
