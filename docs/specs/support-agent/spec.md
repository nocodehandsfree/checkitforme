# Support agent — spec & contract (v1, awaiting owner sign-off)
**What this is · who it's for:** the contract for the tiered support agent, written by Support from
`brief.md`. Owner approves this BEFORE any build. Numbers are per-answer costs at today's list prices.

## The end state (planned backwards)
A visitor on any brand site — or a paid customer in Discord — asks a question and gets a correct,
book-grounded answer in seconds for about half a cent. Hard questions silently ride up to a smarter
model. Truly stuck ones land in the owner's inbox with the full transcript. Every well-answered
question gets reviewed, approved, and folded back into the knowledge base, so tier 1 keeps getting
smarter and escalations keep shrinking.

## Contract — "done" means all of these are true
1. Site chat: visitor asks "how do stock checks work" on any brand domain → correct book-grounded answer in under 5 seconds.
2. Discord: paid customer asks the same in their support channel → same brain, same quality answer.
3. Tier 1 can't answer (confidence gate fails) → conversation auto-escalates to the expensive model; the user never sees tier machinery.
4. Tier 2 still stuck → full transcript emails support@checkitforme.com and the user is told a human will follow up.
5. The agent never invents policy: every answer is grounded in retrieved book/KB passages; no grounding → escalate, never guess.
6. Every resolved conversation lands in an Admin review queue; approved Q&As are embedded into qdrant and tier 1 uses them on the next ask.
7. Repeat questions measurably stop escalating (the compounding loop works — visible in the dashboard).
8. English and Spanish both work end to end (site copy ships both per copy law).
9. Admin shows a support dashboard: volume, tier used, cost per answer, escalation rate.
10. GTM items `support-agent` and `discord-support` close.

## The ladder — model + cost per answer
All calls route through the existing `src/llm.ts` gateway (Helicone), same as everything else, so
cost tracking is automatic. Anthropic provider is already wired in the admin agent.

| Tier | What | Model | Cost per answer |
|---|---|---|---|
| 1 | Chat + Discord, RAG over book/KB | Claude Haiku 4.5 ($1 in / $5 out per MTok) | **≈ $0.005** (~4K in incl. retrieved context, ~300 out; cached system prompt cuts it further) |
| 2 | Escalated troubleshooting, multi-turn | Claude Sonnet 4.6 ($3/$15) | **≈ $0.15** per escalated conversation (~3 exchanges). Opus 4.8 option ($5/$25): ≈ $0.40 |
| 3 | Email to support@ (human = owner) | none | **$0** model cost |
| — | Embeddings + qdrant lookup | small embedding model; qdrant already on Railway | < $0.001/query, effectively free |
| — | Knowledge loop (nightly digest of resolved convos → draft KB entries for review) | Haiku via Batch API (50% off) | pennies per day |

**Blended:** if tier 1 handles 90% of volume (the design goal), average ≈ **$0.02 per answered question**.
1,000 questions/month ≈ $20. The loop pushes this DOWN over time as tier 1 recall improves.

## How it works (one paragraph per piece)
- **Retrieval:** the book (readme.com source, branch `v1.0`) is chunked and embedded into qdrant.
  Approved Q&A history is a second collection. Tier 1 retrieves top passages, answers ONLY from them.
- **Confidence gate:** tier 1 self-reports whether the retrieved passages actually answer the
  question. No → tier 2 with the same context. Tier 2 stuck or user asks for a human → tier 3 email.
- **Surfaces:** one chat backend, two fronts — site widget (Webbie places it) and a Discord bot in
  the paid-customers channel (Pops owns the bot token + hosting). Same session store, same ladder.
- **Knowledge loop:** resolved conversations queue in Admin. Owner (or Copper) approves → embedded
  into qdrant immediately. Recurring themes get flagged to Copper as candidates for the book itself —
  the book stays canonical; the Q&A collection is the fast-moving layer on top.
- **Guardrails:** paid-customer Discord only (per brief); site chat is public but rate-limited per
  IP; no account actions in v1 (answers + escalation only — no refunds, no plan changes by the bot).

## Coordination
- **Copper** — owns the book; approves KB entries that touch policy wording; gets flagged themes.
- **Pops** — Discord bot + token, support@ email routing, qdrant service care, any new Railway vars.
- **Webbie** — where the chat widget lives on the site; widget follows STYLE_GUIDE.

## Build order (after owner sign-off)
1. RAG pipeline: book → chunks → qdrant + retrieval endpoint (testable alone).
2. Tier 1 answer engine + confidence gate behind one internal API.
3. Site chat widget (EN/ES) → 4. Discord bot → 5. Email escalation → 6. Review queue + dashboard → 7. Loop live.

## Open decisions (owner)
- Tier 2 model: Sonnet (~$0.15/escalation) or Opus (~$0.40) — spec assumes Sonnet.
- Review queue approver: owner only, or Copper can approve non-policy entries too?
