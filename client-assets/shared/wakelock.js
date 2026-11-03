// Bildschirm bleibt während der Spiele an (Screen Wake Lock), solange die Seite
// sichtbar ist. Wird vom Browser nicht unterstützt? Dann passiert einfach nichts.
(function () {
  'use strict';
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  async function grab() {
    if (lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { lock = null; }
  }
  document.addEventListener('visibilitychange', grab);
  // Manche Browser (Safari) verlangen dafür eine Berührung
  document.addEventListener('pointerdown', grab, { passive: true });
  grab();
})();
