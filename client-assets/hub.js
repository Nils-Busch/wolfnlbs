// Startseite: Der Würfel in der Mitte sucht ein Spiel aus.
// 1 = Wölfe, 2 = Quiz, 3 = Spielegalerie, 4 = Turniere, 5 = Tagesrätsel, 6 = nochmal würfeln.
(function () {
  'use strict';
  // Tagesrätsel: Rätselnummer und wie viele heute schon gelöst sind
  const today = document.getElementById('hubDaily');
  if (today && typeof Daily !== 'undefined') {
    const d = Daily.today();
    const w = Daily.store.get('wordle-stats'), s = Daily.store.get('staedte-day'), n = Daily.store.get('nono-day');
    const solved = [w && w.lastCounted === d, s && s.date === d && s.guesses.length >= 5, n && n.date === d && n.done].filter(Boolean).length;
    today.textContent = solved === 3 ? 'Heute alle gelöst' : solved ? `Heute ${solved} von 3 gelöst` : `${Daily.longDate(d)}`;
  }
  const die = document.querySelector('.die');
  const msg = document.querySelector('.die-msg');
  if (!die || !msg) return;
  const homes = {
    1: document.querySelector('.home-red'),
    2: document.querySelector('.home-blue'),
    3: document.querySelector('.home-green'),
    4: document.querySelector('.home-yellow'),
    5: document.querySelector('.cards'),
  };
  const names = { 1: 'Was für Wölfe', 2: 'Party-Quiz', 3: 'die Spielegalerie', 4: 'ein Turnier', 5: 'die Tagesrätsel' };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy = false;

  // Eine Spielfigur hüpft vom Würfel Feld für Feld zum ausgewählten Bereich.
  const PAWN = '<svg viewBox="0 0 40 52" aria-hidden="true"><ellipse cx="20" cy="49" rx="15" ry="3" fill="rgba(0,0,0,.25)"/><path d="M14 23h12l-1.5 5.5C30 34 33 40 34 47H6c1-7 4-13 9.5-18.5z" fill="var(--c)" stroke="var(--c-deep)" stroke-width="1.5"/><circle cx="20" cy="12" r="9.5" fill="var(--c)" stroke="var(--c-deep)" stroke-width="1.5"/><circle cx="16.5" cy="8.5" r="3" fill="rgba(255,255,255,.55)"/></svg>';
  function hopTo(home, steps) {
    const from = die.getBoundingClientRect();
    const spot = home.querySelector('.spot:nth-child(2)') || home.querySelector('.cards-stack') || home;
    const to = spot.getBoundingClientRect();
    const runner = document.createElement('span');
    runner.className = 'runner';
    runner.innerHTML = PAWN;
    const cs = getComputedStyle(home);
    runner.style.setProperty('--c', cs.getPropertyValue('--c') || '#fff');
    runner.style.setProperty('--c-deep', cs.getPropertyValue('--c-deep') || '#000');
    document.body.appendChild(runner);
    const W = 34, H = 44;
    const x0 = from.left + from.width / 2 - W / 2 + scrollX, y0 = from.top + scrollY - H * 0.55;
    const x1 = to.left + to.width / 2 - W / 2 + scrollX, y1 = to.top + to.height / 2 + scrollY - H * 0.8;
    const hops = Math.max(3, Math.min(6, steps + 2));
    const frames = [];
    for (let i = 0; i <= hops; i++) {
      const t = i / hops;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      frames.push({ transform: `translate(${x}px, ${y}px) scale(1, 1)`, offset: i / hops, easing: 'ease-in' });
      if (i < hops) {
        const tm = (i + 0.5) / hops;
        frames.push({ transform: `translate(${x0 + (x1 - x0) * tm}px, ${y0 + (y1 - y0) * tm - 46}px) scale(.96, 1.06)`, offset: tm, easing: 'ease-out' });
      }
    }
    frames[frames.length - 1].transform = `translate(${x1}px, ${y1}px) scale(1.15, .85)`;
    const anim = runner.animate(frames, { duration: 260 * hops, fill: 'forwards' });
    return anim.finished.then(() => runner.animate(
      [{ transform: `translate(${x1}px, ${y1}px) scale(1.15, .85)` }, { transform: `translate(${x1}px, ${y1 - 10}px) scale(1, 1)`, opacity: 1 }, { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 0 }],
      { duration: 420, easing: 'ease-out', fill: 'forwards' }
    ).finished).then(() => runner.remove()).catch(() => runner.remove());
  }

  die.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    Object.values(homes).forEach((h) => h && h.classList.remove('picked'));
    die.classList.remove('rolling');
    void die.offsetWidth;
    die.classList.add('rolling');
    msg.textContent = 'Rollt …';
    // Während des Rollens wechseln die Augen
    let ticks = 0;
    const shuffle = setInterval(() => {
      die.dataset.face = String(1 + Math.floor(Math.random() * 6));
      if (++ticks > 6) clearInterval(shuffle);
    }, 90);
    setTimeout(() => {
      clearInterval(shuffle);
      const face = 1 + Math.floor(Math.random() * 6);
      die.dataset.face = String(face);
      die.classList.remove('rolling');
      busy = false;
      if (face > 5) {
        msg.textContent = `${face} – nochmal würfeln!`;
        return;
      }
      const home = homes[face];
      msg.innerHTML = `${face} – heute: <a href="${home.getAttribute('href')}">${names[face]}</a>`;
      const land = () => {
        void home.offsetWidth;
        home.classList.add('picked');
      };
      if (reduced) return land();
      busy = true;
      home.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      hopTo(home, face).then(() => { busy = false; land(); });
    }, reduced ? 0 : 760);
  });
})();
