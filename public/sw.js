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

// Web Push: the sprint check-in nudge. Fires even with the tab closed.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const title = d.title || 'wiwo';
  const opts = {
    body: d.body || '',
    tag: d.tag || 'wiwo',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: d.data || { url: '/' },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

// Tapping the notification focuses (or opens) wiwo on the check-in.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) return w.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
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
