(() => {
  'use strict';
  const SYMBOLS = ['🍎', '🚀', '🎸', '🐙', '🌵', '⚽', '🎲', '🦊'];
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const hs = Scores.panel($('scores'), 'memory', { unit: 'Züge', title: '🏆 Bestenliste (wenigste Züge)' });

  let cards, open, moves, found, locked, startTime, clock;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function start() {
    cards = shuffle([...SYMBOLS, ...SYMBOLS]).map((s) => ({ s, state: 'closed' }));
    open = []; moves = 0; found = 0; locked = false; startTime = null;
    clearInterval(clock);
    $('time').textContent = '0:00';
    hs.hide();
    $('overlay').hidden = true;
    build();
    hud();
  }

  function build() {
    boardEl.innerHTML = '';
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'mcard';
      b.setAttribute('aria-label', `Karte ${i + 1}`);
      b.innerHTML = `<div class="inner"><div class="face front"></div><div class="face back">${c.s}</div></div>`;
      b.onclick = () => flip(i);
      c.el = b;
      boardEl.appendChild(b);
    });
  }

  function paint(c) {
    c.el.classList.toggle('open', c.state === 'open');
    c.el.classList.toggle('done', c.state === 'done');
    c.el.disabled = c.state !== 'closed';
  }

  function hud() {
    $('moves').textContent = moves;
    $('pairs').textContent = `${found}/${SYMBOLS.length}`;
  }

  function tick() {
    const s = Math.floor((Date.now() - startTime) / 1000);
    $('time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function flip(i) {
    const c = cards[i];
    if (locked || c.state !== 'closed') return;
    if (!startTime) { startTime = Date.now(); clock = setInterval(tick, 500); }
    c.state = 'open';
    paint(c);
    open.push(c);
    if (open.length < 2) return;

    moves++;
    const [a, b] = open;
    open = [];
    if (a.s === b.s) {
      a.state = b.state = 'done';
      paint(a); paint(b);
      found++;
      hud();
      if (found === SYMBOLS.length) finish();
    } else {
      hud();
      locked = true;
      setTimeout(() => {
        a.state = b.state = 'closed';
        paint(a); paint(b);
        locked = false;
      }, 850);
    }
  }

  function finish() {
    clearInterval(clock);
    tick();
    $('ovText').textContent = `Geschafft in ${moves} Zügen (${$('time').textContent}) 🎉`;
    setTimeout(() => {
      $('overlay').hidden = false;
      $('ovBtn').focus();
    }, 500);
    hs.offer(moves);
  }

  $('ovBtn').onclick = start;
  $('newGame').onclick = start;
  start();
})();
