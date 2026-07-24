# Publishing the book to ReadMe (Copy lane)

**The rule:** internal notes stay in `git` (staging). **Anything public — customers learning what we
do — is the book** on ReadMe (project "Checkitforme", hub `checkitforme.readme.io`).

## ⚡ The one true workflow (2026-07-10)
ReadMe has **bi-directional GitHub sync with branch `v1.0`**. That branch IS the book.

1. `git worktree add /tmp/book v1.0` (never merge v1.0 with anything).
2. Edit `docs/<Category>/<slug>.md` (frontmatter: `title:`). Page order = the category's
   `_order.yaml`; category order = `docs/_order.yaml`. Images go in `assets/` and are referenced as
   `https://raw.githubusercontent.com/nocodehandsfree/checkitforme/v1.0/assets/<file>`.
3. Push `v1.0`. ReadMe ingests it within a minute or two. Done.
4. ReadMe also pushes BACK to `v1.0` (it normalizes frontmatter), so always `git pull --rebase`
   before pushing.

⚠️ **Do NOT create pages with the v2 API anymore.** The API races the git sync and you get
duplicate pages with `-1` slugs (happened 2026-07-10; had to delete 6 dupes). The API is still fine
for deletes and one-off reads.

## Verify after publishing
`curl -s https://checkitforme.readme.io/llms.txt` lists every live page in nav order. Check it
matches your `_order.yaml`s.

## Book style (owner, 2026-07-10)
- Most readers are on phones. Short pages. Page titles ~20 chars max or the left/right nav wraps.
- Real book flow: every page ends with `Next: [Title](doc:slug)`; last page closes the book.
- 4 categories: Start Here · The Stores · Under the Hood · Plans & Billing.
- Images the reader actually needs: real app screenshots (in `assets/book-*.png`), chain logos,
  the two admin peeks. Nothing decorative.
- Plans truth = live `/pub/plans` (checkitforme.com/pub/plans) which mirrors Admin → God View →
  Plans and Stripe. Re-check it before touching any pricing page.
- Copy rules apply to the book too: `docs/design/copy/COPY_STYLE_GUIDE.md` (no em dashes, friend
  voice, ELI5).

## API access (fallback / deletes)
`README_API_KEY` lives in Railway variables (self-serve, see boot doc). ReadMe API v2:
`https://api.readme.com/v2`, `Authorization: Bearer $KEY`, docs branch = `1.0`.
- List categories: `GET /v2/branches/1.0/categories/guides`
- Read a page: `GET /v2/branches/1.0/guides/<slug>`
- Delete a page: `DELETE /v2/branches/1.0/guides/<slug>`
- ⚠️ `curl` only. Python/urllib/WebFetch 403 through the proxy and look like ReadMe is down.

## Screenshots for the book (how 2026-07-10's were made)
Playwright chromium can't reach the internet directly from the agent box (TLS reset). Trick: route
every request through `curl` via `context.route()`. Mobile viewport 390×844 @2x. Anonymous
browsing only — never tap CHECK THIS STORE (it places a real call).
