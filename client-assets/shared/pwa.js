// Gemeinsam für alle Seiten: App-Installation (Service Worker) und die
// Fußzeile mit Impressum und Datenschutz.
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  // „App installieren“-Knopf (nur dort, wo die Seite einen Platz dafür hat: [data-install])
  let promptEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptEvent = e;
    document.querySelectorAll('[data-install]').forEach((b) => { b.hidden = false; });
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-install]');
    if (!b || !promptEvent) return;
    promptEvent.prompt();
    try { await promptEvent.userChoice; } catch {}
    promptEvent = null;
    b.hidden = true;
  });
  // Rechtliche Links unten auf normalen Seiten (nicht auf Spielbildschirmen)
  function legal() {
    const body = document.body;
    if (!body || !body.classList.contains('vh-body') || body.classList.contains('no-legal') || document.querySelector('.vh-legal')) return;
    const f = document.createElement('p');
    f.className = 'vh-legal';
    f.innerHTML = '<a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a>';
    body.appendChild(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', legal); else legal();
})();
