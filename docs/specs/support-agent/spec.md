# Support agent — spec & contract (v2, owner-approved ladder, building now)
**What this is · who it's for:** the contract for the tiered support agent. v2 reflects the owner's
decisions (2026-07-10): cheap tiers thoroughly vet before money is spent · NO emails from users —
an escalation FORM sends the transcript to support@checkitforme.com · Discord deferred until Pops
builds it · trouble-ticket system later.

## The end state (planned backwards)
A visitor on any brand site asks a question and gets a correct, book-grounded answer in seconds —
usually for free, never for more than pennies. Hard questions silently ride up the ladder, each
rung vetting before the next spends more. If even the top model can't fix it, the user fills out a
short form; the transcript lands at support@checkitforme.com and in Admin. Every well-answered
question gets reviewed, approved, and folded back into the knowledge base, so the free tiers keep
absorbing more volume and the paid tiers keep shrinking.

## Contract — "done" means all of these are true
1. Site chat: visitor asks "how do stock checks work" on any brand domain → correct book-grounded answer in seconds.
2. Repeat of an approved question → served from the qdrant answer cache, $0, no model call.
3. Ladder order holds: cache → free model → cheap paid → expensive; each rung runs only when the one below failed its confidence gate. User never sees tier machinery.
4. Ladder exhausted (or user asks for a human) → short form (name · email · what's wrong) → full transcript emails support@checkitforme.com. No email address is ever shown; nobody can email us directly.
5. The agent never invents policy: answers grounded in retrieved book/KB passages; no grounding → escalate, never guess.
6. Every resolved conversation lands in an Admin review queue; approved Q&As embed into qdrant and serve as tier 0 on the next ask.
7. English and Spanish both work end to end (all widget strings ship both, same commit).
8. Admin endpoint reports: volume, tier that answered, cost per answer, escalation rate.
9. Discord: ladder is exposed as one internal function so the Discord bot (Pops) plugs in later without rework.
10. GTM item `support-agent` closes (`discord-support` stays open for the bot).

## The ladder — model + cost per answer
All calls route through the existing `src/llm.ts` gateway (Helicone) — cost tracking automatic.
Models are env-configurable (`SUPPORT_MODEL_FREE/CHEAP/BIG`); defaults below run on keys funded TODAY.
Anthropic key isn't on Railway yet, so the big tier defaults to GPT-4o and flips to Claude Opus by
changing one env var once Anthropic is funded ("dial in the price piece" = tune this without code).

| Rung | What | Default model | Cost per answer |
|---|---|---|---|
| 0 | Answer cache (approved Q&As in qdrant) | none | **$0** |
| 1 | Free model + RAG | gemini-2.5-flash-lite (free tier; already our call workhorse) | **≈ $0** |
| 2 | Cheap paid retry + self-check | gpt-4o-mini ($0.15/$0.60 per MTok) — or claude-haiku-4-5 | **≈ $0.002** |
| 3 | Big-model troubleshoot, multi-turn | gpt-4o today → claude-opus-4-8 when funded | **≈ $0.10–0.40** per escalated conversation |
| 4 | Escalation form → email to support@ + Admin queue | none | **$0** |
| — | Embeddings (index + per-query) | text-embedding-3-small ($0.02/MTok) via Helicone | < $0.001/query |

**Per customer per month** (from the modeling the owner approved): typical ≈ **2–5¢**, heavy user with
one gnarly issue ≈ **20¢**. Blended ≈ **$0.02 per answered question** at a 90% sub-big-tier hit rate,
trending DOWN as the answer cache compounds.

## How it works (one paragraph per piece)
- **Retrieval:** the book (branch `v1.0`, public) is fetched from GitHub, chunked per section, and
  embedded into qdrant (`http://qdrant.railway.internal:6333`, already running — new `QDRANT_URL`
  env var). Approved Q&A history is a second collection doubling as the tier-0 answer cache.
- **Confidence gate:** each rung answers ONLY from retrieved passages and self-reports whether they
  actually answer the question. Fail → next rung, same context. Big model fails or user asks for a
  human → escalation form.
- **Escalation form (no raw email):** name · email · description, prefilled context; submit sends
  the transcript to support@checkitforme.com via Brevo (existing alerts pattern) and stores a ticket
  row — the hook for the future trouble-ticket system.
- **Surfaces:** one internal `answerSupport()` ladder; site widget now, Discord bot later (Pops).
- **Knowledge loop:** resolved conversations queue in Admin; approve → embedded into qdrant
  immediately. The book stays canonical; the Q&A collection is the fast-moving layer on top.
- **Guardrails:** site chat public but rate-limited per IP; answers + escalation only — no account
  actions, no refunds, no plan changes by the bot.

## Coordination
- **Copper** — owns the book; approves KB entries that touch policy wording; gets flagged themes.
- **Pops** — Discord bot (later), qdrant service care, `QDRANT_URL` + (staging) `BREVO_API_KEY` vars.
- **Webbie** — chat widget placement; widget follows STYLE_GUIDE.

## Build order (in flight)
1. RAG pipeline: book → chunks → qdrant + retrieval (admin reindex endpoint). 2. Ladder behind one
internal function + public chat API. 3. Site widget EN/ES + escalation form → Brevo. 4. Review
queue + stats endpoints. 5. Verify on staging against this contract.
