// Startseite: Der Würfel in der Mitte sucht ein Spiel aus.
// 1 = Wölfe, 2 = Quiz, 3 = Spielegalerie, 4 = Turniere, 5 und 6 = nochmal würfeln.
(function () {
  'use strict';
  const die = document.querySelector('.die');
  const msg = document.querySelector('.die-msg');
  if (!die || !msg) return;
  const homes = {
    1: document.querySelector('.home-red'),
    2: document.querySelector('.home-blue'),
    3: document.querySelector('.home-green'),
    4: document.querySelector('.home-yellow'),
  };
  const names = { 1: 'Was für Wölfe', 2: 'Party-Quiz', 3: 'die Spielegalerie', 4: 'ein Turnier' };
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
      if (face > 4) {
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
