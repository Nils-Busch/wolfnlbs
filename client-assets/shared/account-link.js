// Zeigt oben rechts in der Kopfzeile, ob man angemeldet ist ("Anmelden" bzw.
// der eigene Name). Admins sehen zusätzlich, wie viele Konten auf
// Freischaltung warten. Der Knopf steht fest im HTML; der Name kommt sofort
// aus dem Zwischenspeicher, damit die Kopfzeile beim Seitenwechsel nicht springt.
(function () {
  'use strict';
  const KEY = 'vh-me';
  // Handy: aktiven Menüpunkt in die sichtbare Leiste scrollen
  const active = document.querySelector('.vh-header nav a.is-active');
  if (active && active.parentElement.scrollWidth > active.parentElement.clientWidth) {
    const nav = active.parentElement;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }
  const header = document.querySelector('.vh-header');
  if (!header || document.body.classList.contains('vh-guest')) return; // Turnier-Gast: kein Konto-Knopf

  let a = header.querySelector('.vh-account');
  if (!a) {
    a = document.createElement('a');
    a.className = 'vh-account';
    a.href = '/konto/';
    a.textContent = 'Anmelden';
    header.appendChild(a);
  }

  const H = window.VHHead;
  const cached = H ? H.cache() : null;
  if (H) H.show(a, cached); // ist meist schon per VHHead() passiert – schadet nicht

  fetch('/api/konto/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      const v = me && me.user ? { name: me.user.display_name, pending: me.pendingCount || 0 } : null;
      if (me && me.user && window.VHLook) window.VHLook.sync(me.user.prefs && me.user.prefs.look); // Aussehen vom Konto
      if (!H) return;
      H.cache(v);
      if (JSON.stringify(v) !== JSON.stringify(cached)) H.show(a, v);
    })
    .catch(() => {}); // offline: Zwischenspeicher bleibt stehen
})();
