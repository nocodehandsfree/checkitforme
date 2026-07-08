// Check It For Me — service worker.
// Goal: instant cold-start (esp. the "My Checks" section) without ever serving a stale deploy.
//  - HTML document   → network-first (3.5s timeout) → cache fallback. Deploys ALWAYS land when online.
//  - /app/history + a few STATIC config endpoints → stale-while-revalidate. The checks/statuses paint
//    instantly from cache, then refresh in the background. (LIVE-call endpoints — /pub/live, /pub/bridge,
//    /pub/result, /pub/check-live — are deliberately NOT cached, so real-time call data is never stale.)
//  - /logos/*, images, fonts → cache-first (they're stable/versioned).
//  - everything else  → left to the browser.
// Defensive throughout: any error falls back to the network, so the SW can never white-screen the app.
const VERSION = 'cifm-v6'; // v6: retire the v2 preview flag (redesign is now the ONLY render) + fresh-first HTML so a slow network can't serve the old design
const SHELL = VERSION + '-shell';
const DATA = VERSION + '-data';
const STATIC = VERSION + '-static';
// ONLY these GETs are stale-while-revalidated. Everything else under /pub/ (live transcript, bridge,
// result polling, call start) goes straight to the network so a call is never served stale data.
const SWR_PATHS = ['/app/history', '/pub/statuses', '/pub/categories', '/pub/policy'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try { const c = await caches.open(SHELL); await c.addAll(['/', '/pokemon', '/onepiece', '/toppsbasketball', '/needoh']); } catch (_) { /* precache best-effort */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    } catch (_) { /* cleanup best-effort */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // same-origin only

  if (req.mode === 'navigate' || req.destination === 'document') { e.respondWith(networkFirst(req)); return; }
  if (SWR_PATHS.includes(url.pathname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (url.pathname.startsWith('/logos/') || /\.(png|webp|svg|jpe?g|woff2?)$/i.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  // else: browser default
});

function timeout(ms) { return new Promise((resolve) => setTimeout(() => resolve(null), ms)); }

async function networkFirst(req) {
  // Fresh-first for HTML: when ONLINE the newest page always wins — no "serve the cached page after
  // 1.2s" race, which is what kept showing the OLD design on a slightly slow connection (owner 07-07:
  // "staging is exactly how it'll look, always"). We wait up to 6s for the network; only a truly stalled
  // or offline connection falls back to the cached shell so the app still opens. The network response
  // always refreshes the cache for next time.
  let cached = null; try { cached = await caches.match(req); } catch (_) {}
  const net = fetch(req).then((r) => {
    if (r && r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {}); }
    return r;
  }).catch(() => null);
  try {
    const fresh = await Promise.race([net, timeout(6000)]);
    if (fresh) return fresh;
  } catch (_) { /* fall through */ }
  return cached || (await caches.match('/')) || net.then((r) => r || fetch(req));
}

async function staleWhileRevalidate(req) {
  try {
    const cache = await caches.open(DATA);
    const cached = await cache.match(req);
    const fetching = fetch(req).then((res) => { if (res && res.ok) { try { cache.put(req, res.clone()); } catch (_) {} } return res; }).catch(() => null);
    return cached || (await fetching) || fetch(req);
  } catch (_) { return fetch(req); }
}

async function cacheFirst(req) {
  try {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) { try { (await caches.open(STATIC)).put(req, res.clone()); } catch (_) {} }
    return res;
  } catch (_) { return fetch(req); }
}
