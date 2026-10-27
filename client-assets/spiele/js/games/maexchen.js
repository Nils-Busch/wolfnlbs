/**
 * Mäxchen (Meiern) – das Kneipen-Würfelspiel.
 * 2–6 Plätze am selben Gerät: Menschen reichen das Handy weiter, Computer-Spieler
 * würfeln, bluffen und decken selbst auf.
 *
 * Werte: höherer Würfel zuerst (5 + 3 = 53). Reihenfolge von klein nach groß:
 * 31, 32, 41 … 65, dann die Päsche 11 … 66, ganz oben Mäxchen (21).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 150) : ms));

  /* ---------- Werte ---------- */
  const ORDER = [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21];
  const rank = (v) => ORDER.indexOf(v);
  const valueOf = ([a, b]) => (a === b ? a * 11 : Math.max(a, b) * 10 + Math.min(a, b));
  const label = (v) => (v === 21 ? 'Mäxchen' : v % 11 === 0 ? `${v / 11}er-Pasch` : String(v));
  const chance = (v) => (v === 21 || v % 11 !== 0 ? 2 : 1) / 36;
  // Wahrscheinlichkeit, dass ein frischer Wurf mindestens v ist
  const pAtLeast = (v) => ORDER.slice(rank(v)).reduce((s, x) => s + chance(x), 0);
  const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const LEVELS = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
  const BOT_NAMES = ['Kalle', 'Uschi', 'Bernd', 'Heike', 'Jupp', 'Gabi', 'Rudi', 'Moni'];

  /* ---------- Zustand ---------- */
  let seats = [];      // { name, bot, lives, out }
  let level = store.get('mx-level') || 'medium';
  let lives = 3;
  let G = null;        // laufendes Spiel
  let busy = false;    // Computer oder Animation läuft

  function defaultSeats() {
    const me = store.get('gg-name') || 'Du';
    return [
      { name: me, bot: false },
      { name: BOT_NAMES[0], bot: true },
      { name: BOT_NAMES[1], bot: true },
    ];
  }

  /* ---------- Einrichtung ---------- */
  function renderSetup() {
    $('mxSetup').hidden = false;
    $('mxGame').hidden = true;
    $('mxSeats').innerHTML = seats.map((s, i) => `
      <li class="${s.bot ? 'bot' : 'human'}">
        <span class="seat-ico" aria-hidden="true">${s.bot ? '🤖' : '🙂'}</span>
        ${s.bot ? `<span class="seat-name">${esc(s.name)}</span>` :
          `<input value="${esc(s.name)}" maxlength="14" data-i="${i}" aria-label="Name von Platz ${i + 1}">`}
        <button class="ghost seat-x" data-x="${i}" ${seats.length <= 2 ? 'disabled' : ''} aria-label="Platz entfernen">✕</button>
      </li>`).join('');
    $('mxAddHuman').disabled = $('mxAddBot').disabled = seats.length >= 6;
    $('mxStart').disabled = seats.length < 2;
    document.querySelectorAll('#mxLevels [data-level]').forEach((b) => b.classList.toggle('on', b.dataset.level === level));
    document.querySelectorAll('#mxLives [data-lives]').forEach((b) => b.classList.toggle('on', +b.dataset.lives === lives));
    $('mxLevelRow').hidden = !seats.some((s) => s.bot);
  }

  function bindSetup() {
    $('mxSeats').addEventListener('input', (e) => {
      const i = e.target.dataset.i;
      if (i !== undefined) seats[+i].name = e.target.value;
    });
    $('mxSeats').addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]');
      if (!x || seats.length <= 2) return;
      seats.splice(+x.dataset.x, 1);
      renderSetup();
    });
    $('mxAddHuman').onclick = () => { seats.push({ name: `Spieler ${seats.filter((s) => !s.bot).length + 1}`, bot: false }); renderSetup(); };
    $('mxAddBot').onclick = () => {
      const used = new Set(seats.map((s) => s.name));
      seats.push({ name: BOT_NAMES.find((n) => !used.has(n)) || 'Computer', bot: true });
      renderSetup();
    };
    document.querySelectorAll('#mxLevels [data-level]').forEach((b) => (b.onclick = () => { level = b.dataset.level; store.set('mx-level', level); renderSetup(); }));
    document.querySelectorAll('#mxLives [data-lives]').forEach((b) => (b.onclick = () => { lives = +b.dataset.lives; renderSetup(); }));
    $('mxStart').onclick = startGame;
    $('mxQuit').onclick = () => { G = null; busy = false; renderSetup(); };
    $('mxAgain').onclick = startGame;
    $('mxCup').onclick = () => { if (G && G.phase === 'rolled' && !cur().bot) { G.peek = !G.peek; renderTable(); } };
  }

  /* ---------- Spielablauf ---------- */
  const cur = () => G.players[G.cur];
  const alive = () => G.players.filter((p) => !p.out);
  const humans = () => G.players.filter((p) => !p.bot);
  function nextAlive(i) {
    for (let k = 1; k <= G.players.length; k++) {
      const j = (i + k) % G.players.length;
      if (!G.players[j].out) return j;
    }
    return i;
  }
  // "Du" bekommt die passende Verbform: "Du sagst" statt "Du sagt"
  const v = (p, er, du) => (p.name === 'Du' ? du : er);
  function log(html) {
    G.log.unshift(html);
    G.log = G.log.slice(0, 6);
  }

  function startGame() {
    busy = false;
    seats.forEach((s) => (s.name = (s.name || '').trim().slice(0, 14) || (s.bot ? 'Computer' : 'Spieler')));
    const me = seats.find((s) => !s.bot);
    if (me && me.name !== 'Du') store.set('gg-name', me.name);
    G = {
      id: Math.random(),
      players: seats.map((s) => ({ name: s.name, bot: s.bot, lives, out: false })),
      cur: Math.floor(Math.random() * seats.length),
      prev: null,        // { value, by, dice }
      dice: null,
      phase: 'decide',   // decide | rolled | reveal | over
      peek: false,
      reveal: null,
      log: [],
      handoff: null,
    };
    log(`<b>${esc(cur().name)}</b> ${v(cur(), 'fängt', 'fängst')} an.`);
    $('mxSetup').hidden = true;
    $('mxGame').hidden = false;
    turnStart();
  }

  function turnStart() {
    G.phase = 'decide';
    G.dice = null;
    G.peek = false;
    // Mehrere Menschen: Handy weitergeben
    G.handoff = !cur().bot && humans().length > 1 ? cur().name : null;
    renderTable();
    if (cur().bot) botTurn();
  }

  function doRoll() {
    G.dice = roll();
    G.phase = 'rolled';
    G.peek = !cur().bot && humans().length === 1;
    shakeCup();
    renderTable();
  }

  function announce(value) {
    const p = cur();
    G.prev = { value, by: G.cur, dice: G.dice };
    log(`<b>${esc(p.name)}</b> ${v(p, 'sagt', 'sagst')} <b>${label(value)}</b>`);
    G.cur = nextAlive(G.cur);
    G.dice = null;
    turnStart();
  }

  function believe() {
    const p = cur();
    if (G.prev.value === 21) {
      // Mäxchen kann man nicht überbieten – wer glaubt, gibt auf
      log(`<b>${esc(p.name)}</b> ${v(p, 'glaubt', 'glaubst')} das Mäxchen und ${v(p, 'gibt', 'gibst')} auf.`);
      loseLives(G.cur, 1);
      return;
    }
    log(`<b>${esc(p.name)}</b> ${v(p, 'glaubt', 'glaubst')} es.`);
    doRoll();
    if (p.bot) botAnnounce();
  }

  function reveal() {
    const p = cur();
    const prev = G.prev;
    const actual = valueOf(prev.dice);
    const truth = rank(actual) >= rank(prev.value);
    const loser = truth ? G.cur : prev.by;
    const amount = prev.value === 21 ? 2 : 1;
    G.phase = 'reveal';
    G.reveal = { dice: prev.dice, actual, said: prev.value, truth, loser, amount, by: prev.by };
    log(`<b>${esc(p.name)}</b> ${v(p, 'deckt', 'deckst')} auf: ${label(actual)}, angesagt war ${label(prev.value)} – ${truth ? 'stimmt' : 'gelogen'}!`);
    G.handoff = null;
    renderTable();
    busy = true;
    const id = G.id;
    setTimeout(() => {
      if (!G || G.id !== id) return;
      busy = false;
      if (G.phase === 'reveal') loseLives(loser, amount);
    }, reduced() ? 600 : 2600);
  }

  // Verlorene Deckel fliegen sichtbar vom Platz weg
  function flyCoasters(i, n) {
    if (reduced()) return;
    const dots = [...document.querySelectorAll(`#mxPlayers li:nth-child(${i + 1}) .lives i:not(.gone)`)].slice(-n);
    dots.forEach((d, k) => {
      const r = d.getBoundingClientRect();
      const c = document.createElement('i');
      c.className = 'mx-fly';
      c.style.left = r.left + 'px';
      c.style.top = r.top + 'px';
      document.body.appendChild(c);
      const dx = (Math.random() - 0.5) * 160;
      c.animate([
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px,-70px) rotate(${dx > 0 ? 200 : -200}deg) scale(1.8)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,40px) rotate(${dx > 0 ? 420 : -420}deg) scale(.6)`, opacity: 0 },
      ], { duration: 950, delay: k * 120, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' }).finished.then(() => c.remove(), () => c.remove());
    });
  }

  function loseLives(i, n) {
    flyCoasters(i, Math.min(n, G.players[i].lives));
    const p = G.players[i];
    p.lives = Math.max(0, p.lives - n);
    log(`<b>${esc(p.name)}</b> ${v(p, 'verliert', 'verlierst')} ${n === 2 ? 'zwei Deckel' : 'einen Deckel'}${p.lives ? '' : ` und ${v(p, 'ist', 'bist')} raus`}.`);
    if (!p.lives) p.out = true;
    G.prev = null;
    G.reveal = null;
    if (alive().length === 1) {
      G.phase = 'over';
      G.winner = G.players.indexOf(alive()[0]);
      renderTable();
      if (!G.players[G.winner].bot && window.VH) VH.confetti();
      return;
    }
    G.cur = p.out ? nextAlive(i) : i; // wer verliert, fängt die neue Runde an
    turnStart();
  }

  /* ---------- Computer ---------- */
  async function botTurn() {
    const id = G.id;
    busy = true;
    renderTable();
    await wait(700 + Math.random() * 700);
    if (!G || G.id !== id || !cur().bot) return;
    busy = false;
    if (!G.prev) {
      doRoll();
      return botAnnounce();
    }
    const v = G.prev.value;
    const pTrue = pAtLeast(v);
    let doubt;
    if (v === 21) doubt = Math.random() < { easy: 0.55, medium: 0.75, hard: 0.85 }[level];
    else if (level === 'easy') doubt = Math.random() < 0.65 - pTrue * 0.5;
    else {
      const pBeat = rank(v) + 1 < ORDER.length ? pAtLeast(ORDER[rank(v) + 1]) : 0;
      const t = level === 'hard' ? 0.36 + (pBeat < 0.3 ? 0.12 : 0) : 0.3;
      doubt = pTrue + (Math.random() - 0.5) * 0.12 < t;
    }
    doubt ? reveal() : believe();
  }

  async function botAnnounce() {
    const id = G.id;
    busy = true;
    renderTable();
    await wait(900 + Math.random() * 600);
    if (!G || G.id !== id || G.phase !== 'rolled') return;
    busy = false;
    const actual = valueOf(G.dice);
    const min = G.prev ? rank(G.prev.value) + 1 : 0;
    const legal = ORDER.slice(min);
    let say;
    if (rank(actual) >= min) {
      const lieUp = { easy: 0.05, medium: 0.12, hard: 0.22 }[level];
      const r = rank(actual);
      // Schwacher, aber erlaubter Wurf: manchmal leicht aufpolieren
      say = Math.random() < lieUp && r < 12 ? ORDER[Math.min(r + 1 + Math.floor(Math.random() * 2), 19)] : actual;
    } else if (level === 'easy') {
      say = legal[Math.floor(Math.random() * Math.min(5, legal.length))];
    } else {
      const step = level === 'hard' && Math.random() < 0.3 ? 1 : 0;
      say = legal[Math.min(step, legal.length - 1)];
    }
    announce(say);
  }

  /* ---------- Darstellung ---------- */
  function dieHtml(n, cls = '') {
    return `<span class="mx-die ${cls}" data-face="${n}" aria-label="${n}">${'<i></i>'.repeat(7)}</span>`;
  }
  function coasters(p) {
    return Array.from({ length: lives }, (_, k) => `<i class="${k < p.lives ? '' : 'gone'}"></i>`).join('');
  }

  function shakeCup() {
    const cup = $('mxCup');
    cup.classList.remove('shake');
    void cup.offsetWidth;
    cup.classList.add('shake');
  }

  function renderTable() {
    if (!G) return;
    const p = cur();
    $('mxPlayers').innerHTML = G.players.map((q, i) => `
      <li class="${i === G.cur && G.phase !== 'over' ? 'turn' : ''} ${q.out ? 'out' : ''} ${G.phase === 'over' && i === G.winner ? 'champ' : ''}">
        <span class="nm">${q.bot ? '🤖 ' : ''}${esc(q.name)}</span>
        <span class="lives" aria-label="${q.lives} Deckel">${coasters(q)}</span>
      </li>`).join('');

    // Ansage in der Mitte
    const said = $('mxSaid');
    if (G.phase === 'reveal') {
      const r = G.reveal;
      said.innerHTML = `<small>${esc(G.players[r.by].name)} ${v(G.players[r.by], 'hatte', 'hattest')}</small><b class="${r.truth ? 'ok' : 'lie'}">${label(r.actual)}</b><small>angesagt: ${label(r.said)} – ${r.truth ? 'stimmt!' : 'gelogen!'}</small>`;
    } else if (G.prev) {
      said.innerHTML = `<small>${esc(G.players[G.prev.by].name)} ${v(G.players[G.prev.by], 'sagt', 'sagst')}</small><b>${label(G.prev.value)}</b>`;
    } else if (G.phase === 'over') {
      said.innerHTML = `<small>Gewonnen hat</small><b>${esc(G.players[G.winner].name)}</b>`;
    } else {
      said.innerHTML = '<small>Neue Runde</small><b>–</b>';
    }

    // Becher und Würfel
    const cup = $('mxCup');
    const showDice = G.phase === 'reveal' ? G.reveal.dice : G.phase === 'rolled' && (G.peek && !p.bot) ? G.dice : null;
    cup.classList.toggle('lifted', !!showDice);
    cup.classList.toggle('can-peek', G.phase === 'rolled' && !p.bot);
    $('mxDice').innerHTML = showDice ? showDice.map((n) => dieHtml(n)).join('') : '';
    cup.setAttribute('aria-label', showDice ? `Würfel: ${showDice.join(' und ')}` : 'Würfelbecher');

    // Aktionen
    const act = $('mxActions');
    const status = $('mxStatus');
    if (G.phase === 'over') {
      status.textContent = G.players[G.winner].bot ? `${G.players[G.winner].name} gewinnt.` : G.players[G.winner].name === 'Du' ? 'Du gewinnst! 🎉' : `${G.players[G.winner].name} gewinnt! 🎉`;
      act.innerHTML = '';
      $('mxAgain').hidden = false;
    } else {
      $('mxAgain').hidden = true;
      if (p.bot || busy) {
        status.textContent = G.phase === 'reveal' ? 'Aufgedeckt!' : p.name === 'Du' ? 'Moment …' : `${p.name} ist dran …`;
        act.innerHTML = '';
      } else if (G.handoff) {
        status.textContent = `${p.name} ist dran`;
        act.innerHTML = `<button id="mxHandoff">Handy an ${esc(p.name)} – los geht’s</button>`;
        $('mxHandoff').onclick = () => { G.handoff = null; renderTable(); };
      } else if (G.phase === 'decide') {
        status.textContent = p.name === 'Du' ? 'Du bist dran' : `${p.name}, du bist dran`;
        if (!G.prev) act.innerHTML = '<button id="mxRoll">🎲 Würfeln</button>';
        else if (G.prev.value === 21) act.innerHTML = '<button id="mxReveal">Aufdecken!</button><button id="mxBelieve" class="ghost">Aufgeben (1 Deckel)</button>';
        else act.innerHTML = '<button id="mxReveal">Aufdecken!</button><button id="mxBelieve" class="ghost">Glauben &amp; würfeln</button>';
        if ($('mxRoll')) $('mxRoll').onclick = doRoll;
        if ($('mxReveal')) $('mxReveal').onclick = reveal;
        if ($('mxBelieve')) $('mxBelieve').onclick = believe;
      } else if (G.phase === 'rolled') {
        const actual = valueOf(G.dice);
        const min = G.prev ? rank(G.prev.value) + 1 : 0;
        const canTruth = rank(actual) >= min;
        status.textContent = G.peek ? (canTruth ? `Du hast ${label(actual)}. Was sagst du an?` : `Nur ${label(actual)} – das reicht nicht. Bluffen!`) : 'Tippe auf den Becher, um heimlich zu schauen.';
        act.innerHTML = `<div class="mx-say" role="group" aria-label="Ansage wählen">${ORDER.slice(min).map((v) =>
          `<button class="ghost ${G.peek && v === actual ? 'truth' : ''}" data-say="${v}">${label(v)}</button>`).join('')}</div>`;
        act.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => announce(+b.dataset.say)));
      } else {
        status.textContent = '';
        act.innerHTML = '';
      }
    }
    $('mxLog').innerHTML = G.log.map((l) => `<li>${l}</li>`).join('');
  }

  /* ---------- Start ---------- */
  seats = defaultSeats();
  bindSetup();
  renderSetup();
})();
