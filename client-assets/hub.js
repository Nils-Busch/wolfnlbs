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
      void home.offsetWidth;
      home.classList.add('picked');
      if (!reduced) home.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, reduced ? 0 : 760);
  });
})();
