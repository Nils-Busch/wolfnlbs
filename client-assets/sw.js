// Service Worker: macht das Vereinsheim installierbar und hält besuchte Seiten
// für den Notfall offline bereit. Zuerst das Netz fragen – so kommen Updates
// sofort an; der Zwischenspeicher springt nur ein, wenn keine Verbindung da ist.
// Ausnahme: Schriften und Icons kommen zuerst aus dem Speicher (ändern sich nie).
// Online-Spiele, Konten und Bestenlisten (/api/…) laufen nie über den Speicher.
const CACHE = 'vereinsheim-v3';
const PRECACHE = ['/', '/offline.html', '/shared/vereinsheim.css', '/hub.css', '/hub.js', '/shared/wimpel.js', '/spiele/', '/spiele/css/galerie.css', '/spiele/css/style.css', '/shared/fonts/barlow-500.woff2', '/shared/fonts/barlow-600.woff2', '/shared/fonts/barlow-700.woff2', '/shared/fonts/barlow-condensed-600.woff2', '/shared/fonts/barlow-condensed-700.woff2', '/shared/fonts/barlow-condensed-800.woff2', '/shared/icons/favicon.svg', '/shared/icons/icon-192.png'];

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
  // Schriften und Icons: erst aus dem Speicher, sie ändern sich nie
  if (url.pathname.startsWith('/shared/fonts/') || url.pathname.startsWith('/shared/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
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
