// Service Worker: macht das Vereinsheim installierbar und hält besuchte Seiten
// für den Notfall offline bereit. Immer zuerst das Netz fragen – so kommen Updates
// sofort an; der Zwischenspeicher springt nur ein, wenn keine Verbindung da ist.
// Online-Spiele, Konten und Bestenlisten (/api/…) laufen nie über den Speicher.
const CACHE = 'vereinsheim-v1';
const PRECACHE = ['/', '/offline.html', '/shared/vereinsheim.css', '/hub.css', '/spiele/', '/spiele/css/style.css', '/shared/fonts/figtree.woff2', '/shared/fonts/bricolage-grotesque.woff2', '/shared/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('/offline.html')) || Response.error();
      return Response.error();
    }
  })());
});
