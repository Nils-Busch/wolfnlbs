// Zeigt oben rechts in der Kopfzeile, ob man angemeldet ist ("Anmelden" bzw.
// der eigene Name). Admins sehen zusätzlich, wie viele Konten auf
// Freischaltung warten.
(function () {
  'use strict';
  // Handy: aktiven Menüpunkt in die sichtbare Leiste scrollen
  const active = document.querySelector('.vh-header nav a.is-active');
  if (active && active.parentElement.scrollWidth > active.parentElement.clientWidth) {
    const nav = active.parentElement;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }
  const header = document.querySelector('.vh-header');
  if (!header || header.querySelector('.vh-account')) return;
  const a = document.createElement('a');
  a.className = 'vh-account';
  a.href = '/konto/';
  a.textContent = '👤 Anmelden';
  header.appendChild(a);
  fetch('/api/konto/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      if (!me || !me.user) return;
      a.textContent = '👤 ' + me.user.display_name;
      a.title = 'Mein Konto';
      if (me.pendingCount > 0) {
        a.href = '/konto/#users';
        const b = document.createElement('span');
        b.className = 'vh-badge';
        b.textContent = String(me.pendingCount);
        b.title = me.pendingCount + ' Konto/Konten warten auf Freischaltung';
        a.appendChild(b);
      }
    })
    .catch(() => {});
})();
