// Service worker RETIRED (owner 07-07: "kill the workers, I just want one site").
// The site is now a plain, always-fresh website — no offline cache, no version dance.
//
// This build exists only to evict the old worker from clients that still have it: on activate it deletes
// every Cache Storage bucket, unregisters itself, and reloads any page it controls so the fresh (worker-
// less) HTML lands. With no fetch handler, the browser goes straight to the network for everything.
// /sw.js is served no-cache, so every client that still had the old worker fetches THIS and self-evicts.

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { const ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); })); } catch (_) { /* best-effort */ }
    try { await self.registration.unregister(); } catch (_) { /* best-effort */ }
    try { const cs = await self.clients.matchAll({ type: 'window' }); cs.forEach(function (c) { try { c.navigate(c.url); } catch (_) {} }); } catch (_) { /* best-effort */ }
  })());
});

// No 'fetch' handler on purpose: requests bypass the worker and hit the network directly. Always fresh.
