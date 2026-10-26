// Kleine Bewegungs-Helfer für alle Seiten. Respektiert "Bewegung reduzieren".
//   VH.confetti({ colors, count })   – Konfetti in den vier Spielfarben
//   VH.countUp(el, to, ms)           – Zahl hochzählen (z. B. Punkte)
(function () {
  'use strict';
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#e23b3b', '#2d6be0', '#179e5e', '#f2b705'];

  function confetti({ colors = COLORS, count = 90 } = {}) {
    if (reduced()) return;
    const box = document.createElement('div');
    box.className = 'vh-confetti';
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--x', (Math.random() * 40 - 20) + 'vw');
      p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      p.style.setProperty('--d', (1.8 + Math.random() * 1.6).toFixed(2) + 's');
      p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4500);
  }

  function countUp(el, to, ms = 700) {
    if (!el) return;
    const from = Number(el.dataset.from || 0);
    if (reduced() || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  window.VH = { confetti, countUp, reduced };
})();
