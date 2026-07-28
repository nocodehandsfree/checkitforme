#!/usr/bin/env bash
# THE SPEC, ENFORCED BY A MACHINE.
#
# Written 07-28 after a night where every rule that got broken was one that was only written down,
# and every rule that held was one a hook stopped you from breaking. Three rules from
# docs/specs/live-call-runtime/ that used to live only in prose now live here.
#
# Run: bash scripts/spec-gates.sh   (also runs inside .claude/hooks/push-gate.sh)
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
say() { printf '%s\n' "$*" >&2; }

# ── 1. ONE EAR ────────────────────────────────────────────────────────────────────────────────
# "The two systems share one Ear. Mapper must not build a second listener or analyse live audio
# independently." Audio maths — decoding the line, measuring how loud it is, deciding whether a
# sound is a ring tone — may only be DEFINED in the two files that own it.
EAR_FILES="src/calls/listen-nav.ts src/voice/bridge.ts"
hits=$(grep -rln -E '^\s*(export )?(function|const|class) +(ulawByteToLinear|frameEnergy|toneShare|PromptDetector|ConversationEar|[A-Za-z]*Ear)\b' src --include=*.ts 2>/dev/null || true)
for f in $hits; do
  case " $EAR_FILES " in
    *" $f "*) ;;
    *) say "SPEC GATE 1 — a second listener: $f defines audio detection."
       say "             It belongs in src/calls/listen-nav.ts, shared. See the runtime spec, section 10."
       fail=1 ;;
  esac
done

# ── 2. EVERY CALL LEAVES A RECEIPT ────────────────────────────────────────────────────────────
# "Every path that dials a store runs this runtime. Customer checks, scheduled checks, zone sweeps,
# every Admin button, mapping calls, on staging and on production. No exceptions. A call that does
# not produce a receipt is a bug, not a special case."
for f in $(grep -rl 'Accounts/\${sid}/Calls\.json' src --include=*.ts 2>/dev/null || true); do
  # Only a POST to Calls.json places a call; a GET listing past ones does not. Look at the same
  # statement, not merely the same file — server.ts lists past calls and POSTs to other endpoints.
  grep -A3 'Accounts/\${sid}/Calls\.json' "$f" | grep -q 'method: *"POST"' || continue
  # The import alone is not a receipt — look for the call being made.
  if ! grep -v '^import\|^} from\|^  openReceipt,' "$f" | grep -q 'openReceipt('; then
    say "SPEC GATE 2 — a silent call: $f dials a store and never opens a receipt."
    say "             See the runtime spec, law 4."
    fail=1
  fi
done

# ── 3. THE WORDS THE OWNER READS ──────────────────────────────────────────────────────────────
# The Admin glossary (docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md): the person who answers at a
# store is Staff. These files write strings that land on the Chains screen, so they are admin copy
# even though they are TypeScript, and the copy hook only watches .html.
ADMIN_COPY="src/calls/mapgraph.ts src/calls/mapper.ts src/calls/sweep.ts src/calls/trainer-batch.ts src/calls/navigator.ts"
for f in $ADMIN_COPY; do
  [ -f "$f" ] || continue
  # Quoted strings only, so a comment explaining the rule does not trip it.
  bad=$(grep -n -E '"[^"]*\b([Cc]lerk|a person answers|the person answers)\b[^"]*"|`[^`]*\b([Cc]lerk|a person answers)\b[^`]*`' "$f" | grep -v '^\s*[0-9]*: *[*/]' || true)
  if [ -n "$bad" ]; then
    say "SPEC GATE 3 — say Staff, not clerk or 'a person', in $f:"
    say "$bad" | head -5
    fail=1
  fi
done

if [ "$fail" = 0 ]; then echo "spec gates: ok"; fi
exit $fail
