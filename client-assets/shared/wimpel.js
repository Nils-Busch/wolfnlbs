// Wimpel wehen im „Wind“ der Maus: Bewegung über einem [data-wind]-Element
// gibt dem Tuch einen Schubs, eine Feder bringt es zurück in die Ruhe.
// window.VHWind.kick(el, stärke) lässt einen Wimpel auch von außen wehen.
(function () {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const springs = new WeakMap();

  function spring(el) {
    if (springs.has(el)) return springs.get(el);
    const cloth = el.querySelector('.w-tuch');
    let a = 0, v = 0, raf = 0;
    function step() {
      v += -a * 0.11;
      v *= 0.87;
      a += v;
      a = Math.max(-7, Math.min(7, a));
      if (Math.abs(a) < 0.03 && Math.abs(v) < 0.03) {
        a = v = 0; raf = 0; cloth.style.transform = '';
        return;
      }
      const stretch = 1 + Math.min(Math.abs(a), 9) * 0.005;
      cloth.style.transform = `skewY(${a.toFixed(2)}deg) scaleX(${stretch.toFixed(3)})`;
      raf = requestAnimationFrame(step);
    }
    const kick = (f) => {
      if (reduced || !cloth) return;
      v += f;
      if (!raf) raf = requestAnimationFrame(step);
    };
    springs.set(el, kick);
    return kick;
  }

  // Ereignisse am Dokument: funktioniert auch für Wimpel, die erst später eingefügt werden
  let last = null, lx = 0, ly = 0;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest('[data-wind]');
    if (el && el === last) {
      const f = (e.clientY - ly) * 0.22 + (e.clientX - lx) * 0.06;
      spring(el)(Math.max(-2.2, Math.min(2.2, f)));
    }
    last = el; lx = e.clientX; ly = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('[data-wind]');
    if (el) spring(el)(-3);
  }, { passive: true });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-wind]');
    if (el) spring(el)(3);
  });

  window.VHWind = { kick: (el, f = 3) => el && spring(el)(f) };
})();
