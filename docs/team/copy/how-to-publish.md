# Publishing public docs to ReadMe (Copy lane)

**The rule:** internal notes stay in `git` (this repo). **Anything meant for the public — customers
learning what we do, or new hires — goes to ReadMe**, our human-facing docs site (project
"Checkitforme"). When the owner says "document this for public consumption," it goes here.

## Access
You need the **ReadMe API key** (`rdme_…`) — the owner provides it (Configuration → API Key in
ReadMe). Keep it in memory; never commit it. Export it for the session:
```bash
export README_KEY="rdme_…"
```

## API basics (ReadMe v2 — `https://api.readme.com/v2`, Bearer auth)
- Auth: `-H "Authorization: Bearer $README_KEY"`. Confirm with `GET /v2/projects/me`.
- The docs version is a **branch**: ours is `1.0` → paths are `/v2/branches/1.0/...`.
- **Category** (a section): `POST /v2/branches/1.0/categories` `{ "title": "...", "type": "guide" }`
  → returns a `uri` like `/branches/1.0/categories/guides/<slug>`.
- **Create a page:** `POST /v2/branches/1.0/guides`
  ```json
  { "title": "Plans", "category": { "uri": "<category uri>" }, "content": { "body": "# Markdown…" } }
  ```
- **Update a page:** `PATCH /v2/branches/1.0/guides/<slug>` with the same body shape.
- **Read a page:** `GET /v2/branches/1.0/guides/<slug>`. Pages are public by default.
- Content is **Markdown** in `content.body`. Cross-link with `[text](doc:<slug>)`.

## What's already published
Category **Plans & Pricing** → pages: `plans`, `premium-features`, `pay-as-you-go`,
`how-billing-works`. Source of truth for their *content* is `docs/owner/GUIDEBOOK.md` §2 — if plans change
there, update the matching ReadMe page.

## How to work
1. Owner asks to document something public → draft it in the brand voice (`docs/design/copy/COPY_STYLE_GUIDE.md`).
2. Publish/update the page via the API above (create the category first if it's a new section).
3. Note what you published in your handoff so the next chat knows it's live.

Optional (owner-authorized): a GitHub Action can auto-sync a docs folder to ReadMe on every push, so
you'd only edit markdown in the repo. Ask the owner if they want it wired (needs `README_API_KEY` as a
repo/Railway secret).
