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
  # COUNTED, NOT PIPED INTO grep -q. With `set -o pipefail`, grep -q exits the moment it matches and
  # the grep feeding it dies of a broken pipe, so the whole pipeline reported failure EVEN WHEN THE
  # RECEIPT WAS THERE — a race that grew with the file and blocked a correct push (08-02). Counting
  # reads the stream to the end, so the answer cannot depend on how fast the match arrives.
  receipts=$(grep -v '^import\|^} from\|^  openReceipt,' "$f" | grep -c 'openReceipt(' || true)
  if [ "${receipts:-0}" -eq 0 ]; then
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

# ── 4. THE READER RULE IS NOT A CALLER'S CHOICE ───────────────────────────────────────────────
# "When the second reader disagrees with Charlie's status, the customer gets couldn't-tell and NO
# charge — never a wrong answer" (owner 07-29). The merge always had the rule. What broke it was
# each finalize path deciding for itself whether the reader was worth consulting: three of them
# passed `needSecond ? second : null`, and needSecond was false exactly when the live read had an
# opinion — so a reader disagreeing with a confirmed IN STOCK was thrown away and the customer was
# charged for a green nobody was sure of. Getting the second opinion is now consensusFor's job.
# A conditional handed to reconcile() means somebody has taken that decision back.
# Two shapes of the same mistake. The `needSecond` flag IS the decision that must not exist (it was
# spread over two lines in one of the three, so matching the reconcile() line alone missed it), and a
# reconcile() handed a conditional or a bare null on its own line is the flag under another name.
bad=$(grep -rn 'needSecond' src --include=*.ts | grep -v '^src/voice/verdict.ts:' || true)
bad="$bad
$(grep -rn 'reconcile(' src --include=*.ts | grep -v '^src/voice/verdict.ts:' | grep -E '\?[^:]*:\s*null|,\s*null\s*\)' || true)"
if [ -n "$(printf '%s' "$bad" | tr -d '[:space:]')" ]; then
  say "SPEC GATE 4 — the reader rule is being skipped: a caller decides whether to consult the second read."
  say "$bad" | grep -v '^$' | head -5
  say "             Call consensusFor() (src/voice/verdict.ts) instead — it always reconciles."
  fail=1
fi

if [ "$fail" = 0 ]; then echo "spec gates: ok"; fi
exit $fail
