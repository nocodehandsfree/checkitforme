# START HERE — what every doc is, in one glance

**One line per doc: what it is · who it's for.** If you're an agent, find your row under "Team" and
go to that file. If you're the owner, the "For you" section is the plain-English stuff. Anything
marked ⚠️ is being reorganized (see the plan at the bottom).

---

## 🧭 For you (owner) — plain English, no code
| Doc | What it is |
|---|---|
| `GUIDEBOOK.md` | The whole business explained without code. Start here to understand Check. |
| `business/ROADMAP.md` | The product backlog / what's planned and why. |
| `finance/COST_MODEL.md` | ⚠️ Older cost math (superseded by `CALL_ECONOMICS.md` on the prod branch). |
| `finance/CHEAP_NAV_ARCHITECTURE.md` | Why we keep the expensive AI off the call until a human answers. |
| `finance/model-calculator.html` | The cost calculator page. |

## 👥 Team — each agent's home (your handoff + lane live here)
| Doc | Who it's for |
|---|---|
| `handoffs/devops.md` | **DevOps** — backend, infra, security, deploys, API contract. |
| `handoffs/website.md` | **Website** — the consumer site (`checkit.html`) + `/pub`. |
| `handoffs/admin.md` | **Admin** — the admin dashboard (`app.html`) + `/api`. |
| `handoffs/data.md` | **Data** — store rows, importer, chain/store data. |
| `handoffs/copy.md` | **Copy** — every word a customer reads (site + admin). |
| `KICKOFFS.md` | ⚠️ The one-line "You are Check-X, go" starters for Design & QA (no handoff file). |

## 📖 Shared — everyone reads these
| Doc | What it is |
|---|---|
| `AGENT_RULES.md` | How to write code in this repo. Read before touching code. |
| `ARCHITECTURE.md` | Repo layout + stack. |
| `API_CONTRACT.md` | The frozen front⇄back API every lane builds against. |
| `STOCK_AND_GEO_API.md` | Deeper API detail for the stock + geo rails. |
| `RUNBOOK.md` | How to run and deploy the service. |
| `GOTCHAS.md` | Non-obvious traps that cost real time. Read before debugging something weird. |
| `PUBLISHING_TO_README.md` | How public-facing docs get published to ReadMe (Copy lane). |

## 🎨 Design & brand — all in `design/` *(currently `style-guide/`)*
| Doc | What it is |
|---|---|
| `style-guide/README.md` | Index of the whole brand/design/copy system. |
| `style-guide/BRAND.md` | The Check logo, the brandmark, the colors. |
| `style-guide/STYLE_GUIDE.md` | The look: type, spacing, components. |
| `style-guide/COPY_STYLE_GUIDE.md` | The voice: how we write. |
| `style-guide/NEW_CHECK_COMPS.html` | The approved design board (the comps). |
| `STORE_LOGOS.md` | ⚠️ The **retail-chain** logos (Target/Walmart) — this is store *data*, belongs with Data. |
| `handoffs/email-design-brief.md` | ⚠️ Temp brief for Design on alert emails (retires when emails ship). |

## 🧱 Specs — things being built (or built)
| Doc | What it is |
|---|---|
| `specs/admin-user-view.md` | Spec: per-customer admin view. **Active — being built.** |
| `specs/manage-zones.md` | Spec: Zones. **DONE — shipped.** → archive. |
| `handoffs/admin-alerts-prompt.md` | Spec: the Alerts (SMS/email) module. |
| `handoffs/CHECKOUT_STATUS.md` | Status: on-site Stripe checkout (Website→DevOps). |
| `handoffs/PRICE_CONTRACT.md` | Spec: the cheapest-price display field (Website→DevOps). |

## 🗄️ Data reference — store data structure + samples (owned by Data)
| Doc | What it is |
|---|---|
| `DATA_PROVENANCE.md` | Where all store data comes from (one source of truth). |
| `specs/store-data-schema.md` | How a store row is structured. |
| `specs/scoring.md` | The Fungibles Score rubric (how store tiers work). |
| `specs/existing-chains.md` | The 80 exact chain names (match these to avoid duplicates). |
| `specs/sample-stores-import.json` | A sample import file (data, not a doc). |
| `ops/AGENT_TUNING.md` | ⚠️ ElevenLabs voice-tuning source of truth (voice = Website lane). |

## 🔁 Loops — overnight automation protocols (not actively used)
| Doc | What it is |
|---|---|
| `../loops/site-redesign/*` | The overnight redesign loop. Redesign is basically done → archive. |
| `../loops/test-coverage/*` | The overnight test-coverage loop. Unused → archive. |

---

## The rules (so this never rots again)
- **Agent needs docs? Go to your file under "Team."** That's your only starting point.
- **Every doc opens with one line: "What this is · Who it's for."** Every folder gets a README.
- **Finished work goes in the git commit, not a new doc.** A superseded doc → `archive/`.
- **Temp docs have no home of their own** — they live inside their feature's spec folder and get
  archived with the feature when it ships. DevOps prunes; the owner never hunts for temp.
- **All design lives in one place** (`design/`); the Check logo is in `design/brand/`.

## The reorg (⚠️ rows above) — what's moving, once, carefully
`docs/` root empties into: `shared/` (rules, architecture, API, runbook, gotchas, guidebook),
`team/<role>/` (each agent's handoff + gotchas + checkpoint), `design/` (brand + comps + copy),
`specs/<feature>/` (active builds), `data/` (store-data reference + samples), `archive/` (done/dead).
DevOps owns this move and fixes every link so nothing breaks.
