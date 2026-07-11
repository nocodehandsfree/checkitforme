# Support ⇄ Admin — panel contract (what the Admin Support tab expects)
**What this is · who it's for:** the exact response shapes the Admin → Support tab (built by Addie,
2026-07-11) reads from the Support lane's endpoints. Support: build to this or ping Addie's chat
BEFORE diverging — the panel is already live on staging and degrades to an "APIs aren't live yet"
empty state until these exist.

## GET /api/support/stats?range=today|7d|30d
```jsonc
{
  "total": 42,
  "selfServed": 35,
  "escalated": 7,
  "escalationRate": 17,          // percent; optional — panel derives from escalated/total if absent
  "avgMessages": 4.2,
  "ticketsEmailed": 3,
  "byCategory": { "technical": 12, "bug": 6, "billing": 9, "partnerships": 1, "how_checks_work": 10, "other": 4 },
  "topQuestions": [ { "q": "How do credits work?", "n": 6 } ]   // also accepts {question,count}
}
```

## GET /api/support/chats?category=&account=all|members|guests&since=&until=&q=
`since`/`until` are unix seconds. Response: an array (or `{chats:[...]}`), newest first:
```jsonc
[{
  "id": "chat_ab12",
  "account": { "email": "x@y.com", "phone": "+1…", "label": "…" } | null,   // null = guest
  "category": "technical|bug|billing|partnerships|how_checks_work|other",
  "lastMessage": "snippet of the last message…",   // also accepts `snippet`
  "tier": 1 | 2 | 3,          // 1 cheap model · 2 smart model · 3 human email ("human"/"smart" strings also accepted)
  "status": "open" | "escalated" | "resolved",
  "createdAt": 1783700000      // unix seconds; `created_at` also accepted
}]
```

## GET /api/support/chats/:id
Everything above for the one chat, plus:
```jsonc
{
  "transcript": [ { "role": "user"|"assistant", "text": "…" } ],  // `messages` / `content` also accepted; role "customer" = user side
  "screenshotUrl": "/path/or/https…",                             // `screenshot` also accepted; omit if none
  "debug": { "ua": "…", "page": "…", "cid": "…" },                // object or string; rendered as-is in a <pre>
  "account": { "email": "…", "phone": "…", "subscription": "…", "credits": 12, "callsMade": 30 } | null
}
```

## Auth
The panel calls with the standard admin auth (admin_session cookie / x-admin-token) — mount the
routes under `/api/*` so the existing admin wall covers them; nothing extra needed.
