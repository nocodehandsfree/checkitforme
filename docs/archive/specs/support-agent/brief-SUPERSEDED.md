# Support agent — owner's intent (2026-07-09)
**What this is · who it's for:** the owner's spec seed for the customer-service agent. Support lane turns this into a contract before building.

## The idea (owner's words, condensed)
A support agent with all the company knowledge that answers questions in a live chat on the website
AND in Discord (paid customers get a channel with direct access). Designed for maximum cost-efficiency.

## The ladder (cheapest first)
1. **Cheap model + the book** (readme.com content) answers everything it can.
2. Can't answer → **escalate to a more expensive model** to troubleshoot.
3. Still stuck → **email to support@checkitforme.com** (human, the owner).

## The knowledge loop (the compounding part)
Successfully answered questions feed BACK into the knowledge base (RAG — the qdrant service already
runs in our Railway project) so the KB compounds: the more questions answered well, the smarter tier 1
gets and the fewer escalations happen. Copper keeps the book as the canonical source; the RAG layer
indexes the book + the approved Q&A history.

## Constraints
- Cost-effective above all: tier 1 must handle the bulk on a cheap model.
- The book is the single source of truth — the agent never invents policy.
- GTM items this closes: `support-agent`, `discord-support` (+ feeds `readme-copy`).
