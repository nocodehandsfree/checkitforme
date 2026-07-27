# Call/log investigation — transcript comes back cut off

**What:** A real Fun-store check came back with its transcript cut off in the call log — it showed the
opener ("about to call… sit tight") then jumped to a fragment ("…help.") with the middle missing. Looks
like a call-engine capture gap, not a display bug. Investigate where the transcript/step capture drops
lines between the live call and the saved call log. `src/voice/` is FROZEN — this is investigation +
design only; no engine change ships without the owner's explicit word.
**Done when:** The capture gap is root-caused (which stage drops lines, and why), written up in the
voice-calls checkpoint / GOTCHAS, with a proposed fix boxed for the owner. If a safe display-side fix
exists, drive it on staging and paste verify-live.
**Lane:** voice-calls
**Status:** active (owner work stream — the call/log investigation)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
