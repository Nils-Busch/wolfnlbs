// Gemeinsam für alle Seiten: App-Installation (Service Worker) und die
// Fußzeile mit dem Datenschutz-Hinweis. (Kein Impressum: Das Vereinsheim ist
// eine private, nur für Freunde und Familie zugängliche Seite – siehe README.)
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
  // Hinweis und Datenschutz-Link unten auf normalen Seiten (nicht auf Spielbildschirmen)
  function legal() {
    const body = document.body;
    if (!body || !body.classList.contains('vh-body') || body.classList.contains('no-legal') || document.querySelector('.vh-legal')) return;
    const f = document.createElement('p');
    f.className = 'vh-legal';
    f.innerHTML = '<span>Privat – nur für Freunde und Familie</span><a href="/datenschutz">Datenschutz</a>';
    body.appendChild(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', legal); else legal();

  // Aussehen: Pinsel-Knopf in der Kopfzeile, die Auswahl (/shared/look.js) kommt erst beim Antippen
  function lookButton() {
    const header = document.querySelector('.vh-header');
    if (!header || !window.VHLook || header.querySelector('.vh-look-btn')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vh-look-btn';
    b.title = 'Aussehen';
    b.setAttribute('aria-label', 'Aussehen ändern');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span aria-hidden="true">🎨</span>';
    header.insertBefore(b, header.querySelector('.vh-account, .vh-guest-pill'));
    b.addEventListener('click', () => {
      if (window.VHLookUI) return window.VHLookUI.toggle(b);
      const s = document.createElement('script');
      s.src = '/shared/look.js';
      s.onload = () => window.VHLookUI && window.VHLookUI.toggle(b);
      document.head.appendChild(s);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lookButton); else lookButton();
})();
