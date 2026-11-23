(() => {
  'use strict';
  // Acht gezeichnete Motive, jedes zweimal im Spiel
  const SYMBOLS = [
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40C11 31 6 25 6 18a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 7-5 13-18 22z" fill="#e23b3b"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5l5.6 11.6 12.8 1.8-9.3 9 2.2 12.7L24 34.2l-11.3 5.9 2.2-12.7-9.3-9 12.8-1.8z" fill="#f2b705"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 6a18 18 0 1 0 12 30A15 15 0 1 1 30 6z" fill="#5b8de0"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40C8 18 22 8 42 8c0 20-10 34-32 34z" fill="#179e5e"/><path d="M10 38L32 16" stroke="#0c5a36" stroke-width="2.5" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c8 11 14 18 14 25a14 14 0 0 1-28 0c0-7 6-14 14-25z" fill="#0fa3a3"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4L9 27h13l-4 17 21-25H26z" fill="#ff8a3d"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l17 20-17 20L7 24z" fill="#a979d8"/></svg>',
    '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="#e0457b"><circle cx="24" cy="12" r="8"/><circle cx="36" cy="24" r="8"/><circle cx="24" cy="36" r="8"/><circle cx="12" cy="24" r="8"/></g><circle cx="24" cy="24" r="6" fill="#f2c230"/></svg>',
  ];
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const hs = Scores.panel($('scores'), 'memory', { unit: 'Züge', title: 'Bestenliste (wenigste Züge)' });

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
    $('ovText').textContent = `Geschafft in ${moves} Zügen (${$('time').textContent})`;
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
