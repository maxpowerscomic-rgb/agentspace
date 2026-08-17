// wiwo service worker — conservative by design.
//
// wiwo talks to a LIVE server (your dev machine), so freshness matters more than
// offline. Strategy:
//   • /api/*        → always network, never cached (stale data would mislead)
//   • navigations   → network-first, fall back to the cached shell if offline
//   • static assets → network-first, update the cache on success
// This gives installability + an offline-openable shell without ever serving a
// stale bundle when the server is reachable.
const CACHE = 'wiwo-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return; // only GETs are cacheable
  if (url.pathname.startsWith('/api/') || url.pathname === '/api/events') return; // live data, no SW

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/');
        throw new Error('offline and uncached');
      }),
  );
});
