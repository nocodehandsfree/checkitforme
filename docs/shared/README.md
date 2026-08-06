# shared/ — the docs every agent may need. Open ONLY when your task calls for it.
| Doc | What it is |
|---|---|
| `ADMIN_RULES.md` | The rules for touching the Admin, what happens behind the screen, and the live surfaces with no buttons. **The live Admin is the truth for how it looks** — this doesn't describe screens |
| `WEBSITE_RULES.md` | The same for the consumer site: the rules (it's LOCKED), what happens behind the screen, what it may ask the server for. **The live site is the truth for how it looks** |
| `SYSTEM_MANUAL.md` | The backend machinery end to end — product, the life of a check, money, data, every scheduled process (this is also the runbook) |
| `AGENT_RULES.md` | How to write code in this repo — read before touching code |
| `ARCHITECTURE.md` | Repo layout + stack |
| `API_CONTRACT.md` | The frozen front⇄back API everyone builds against |
| `STOCK_AND_GEO_API.md` | Deeper API detail: stock + geo rails |
| `GOTCHAS.md` | Traps that cost real time — read before debugging something weird — the ONE trap file (the known-problems skill was folded in here 2026-08-05) |
