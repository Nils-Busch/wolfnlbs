// Startseite: Die Stecktafel zeigt Datum, Stand der Tagesrätsel und ein
// Turnier, der Würfel steckt einen Spielvorschlag dazu. Das Regal zeigt die
// Rekorde der Einzelspiele; ein Pokal klappt seine Ehrentafel auf.
(function () {
  'use strict';
  const tafel = document.querySelector('.tafel');
  if (!tafel || typeof Daily === 'undefined') return;
  const line = (k) => tafel.querySelector(`[data-tafel="${k}"]`);
  const d = Daily.today();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Stecktafel ----------
  // Text in einzelne Buchstaben zerlegen (für Bildschirmleser bleibt der ganze Text lesbar)
  let i = 0;
  function set(el, text, fresh) {
    if (fresh) i = 0;
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'vh-sr';
    sr.textContent = text;
    const letters = document.createElement('span');
    letters.setAttribute('aria-hidden', 'true');
    // Wörter bleiben zusammen, damit die Zeile nur zwischen Wörtern umbricht
    text.split(' ').forEach((word, wi) => {
      if (wi) letters.append(' ');
      const w = document.createElement('span');
      w.className = 'wort';
      for (const ch of word) {
        const l = document.createElement('span');
        l.className = 'l';
        l.textContent = ch;
        l.style.setProperty('--i', i++);
        w.appendChild(l);
      }
      letters.appendChild(w);
    });
    el.append(sr, letters);
    if (fresh) {
      el.classList.remove('neu');
      void el.offsetWidth;
      el.classList.add('neu');
    }
  }

  // Wie viele der sechs Tagesrätsel heute schon fertig sind (gleiche Regeln wie auf /raetsel/)
  const g = (k) => Daily.store.get(k);
  const w = g('wordle-stats'), s = g('staedte-day'), c = g('conn-day'), n = g('nono-day'), j = g('jig-day'), su = g('sudoku-day');
  const solved = [
    w && w.lastCounted === d,
    s && s.date === d && s.guesses && s.guesses.length >= 5,
    c && c.date === d && c.over,
    n && n.date === d && n.done,
    j && j.date === d && j.done,
    su && su.date === d && su.done,
  ].filter(Boolean).length;
  const dateText = new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
  set(line('date'), dateText);
  set(line('daily'), solved === 6 ? 'Alle 6 Rätsel gelöst' : solved ? `Rätsel: ${solved} von 6 gelöst` : '6 neue Tagesrätsel');

  // Beim ersten Besuch am Tag werden die Buchstaben sichtbar gesteckt
  if (Daily.store.get('hub-tafel') !== d) {
    tafel.classList.add('stecken');
    Daily.store.set('hub-tafel', d);
  }

  // Turnier: läuft gerade, ist heute oder steht in den nächsten 14 Tagen an
  fetch('/api/tischtennis/tournaments').then((r) => (r.ok ? r.json() : [])).then((list) => {
    if (!Array.isArray(list)) return;
    const soon = new Date(Date.parse(d + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
    const running = list.find((t) => t.status === 'running');
    const next = list
      .filter((t) => t.status !== 'finished' && t.event_date && t.event_date >= d && t.event_date <= soon)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
    const t = running || next;
    if (!t) return;
    const el = line('turnier');
    let text = `${t.name} läuft`;
    if (!running) {
      text = t.event_date === d ? `Heute: ${t.name}`
        : `${t.name} am ${new Date(t.event_date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })}`;
    }
    el.href = `/tischtennis/#t=${t.id}`;
    set(el, text);
    el.hidden = false;
  }).catch(() => {});

  // ---------- Würfel: steckt einen Spielvorschlag auf die Tafel ----------
  const IDEEN = [
    ['WoWölfe', '/woelfe/', 'woelfe'], ['Party-Quiz', '/quiz/', 'quiz'],
    ['Kniffel', '/spiele/gruppe/', 'spiele'], ['Stadt-Land-Fluss', '/spiele/gruppe/', 'spiele'],
    ['Wer würde eher', '/spiele/gruppe/', 'spiele'], ['Montagsmaler', '/spiele/gruppe/?new=draw', 'spiele'],
    ['Agentenrunde', '/spiele/gruppe/?new=agent', 'spiele'], ['Erklärbär', '/spiele/gruppe/?new=explain', 'spiele'],
    ['Mäxchen', '/spiele/games/maexchen.html', 'spiele'], ['Vier gewinnt', '/spiele/games/connect4.html', 'spiele'],
    ['Reversi', '/spiele/games/reversi.html', 'spiele'], ['Snake', '/spiele/games/snake.html', 'spiele'],
    ['Blockfall', '/spiele/games/blockfall.html', 'spiele'], ['Wordle', '/spiele/games/wordle.html', 'raetsel'],
    ['Connections', '/raetsel/connections.html', 'raetsel'], ['Städteraten', '/raetsel/staedte.html', 'raetsel'],
    ['Sudoku', '/raetsel/sudoku.html', 'raetsel'], ['Patience', '/spiele/games/patience.html', 'spiele'],
    ['Superhirn', '/spiele/games/superhirn.html', 'spiele'], ['Steckhalma', '/spiele/games/steckhalma.html', 'spiele'],
  ];
  const btn = tafel.querySelector('.wuerfeln');
  const die = tafel.querySelector('.wuerfel');
  let last = -1, rolling = false;
  btn.addEventListener('click', () => {
    if (rolling) return;
    rolling = true;
    let pick;
    do { pick = Math.floor(Math.random() * IDEEN.length); } while (pick === last);
    last = pick;
    const [name, href, dep] = IDEEN[pick];
    const finish = () => {
      die.dataset.face = String(1 + Math.floor(Math.random() * 6));
      die.classList.remove('rollt');
      const el = line('vorschlag');
      el.href = href;
      el.hidden = false;
      set(el, `Wie wär's mit ${name}?`, true);
      const flag = document.querySelector(`.dep[data-dep="${dep}"]`);
      if (flag && window.VHWind) window.VHWind.kick(flag, 4);
      rolling = false;
    };
    if (reduced) return finish();
    die.classList.remove('rollt');
    void die.offsetWidth;
    die.classList.add('rollt');
    let ticks = 0;
    const shuffle = setInterval(() => {
      die.dataset.face = String(1 + Math.floor(Math.random() * 6));
      if (++ticks > 6) clearInterval(shuffle);
    }, 80);
    setTimeout(() => { clearInterval(shuffle); finish(); }, 650);
  });

  // ---------- Regal mit Pokalen und Ehrentafel ----------
  const shelf = document.getElementById('pokale');
  const board = document.getElementById('ehrentafel');
  const GAMES = [
    ['snake', 'Snake', 'snake', 'Pkt.'],
    ['blockfall', 'Blockfall', 'blockfall', 'Pkt.'],
    ['2048', '2048', '2048', 'Pkt.'],
    ['kloetzchen', 'Klötzchen', 'kloetzchen', 'Pkt.'],
    ['memory', 'Memory', 'memory', 'Züge'],
    ['mines9', 'Minesweeper', 'minesweeper', 's'],
    ['patience', 'Patience', 'patience', 'zeit'],
    ['superhirn', 'Superhirn', 'superhirn', 'versuche'],
    ['steckhalma', 'Steckhalma', 'steckhalma', 'stifte'],
  ];
  const CUPS = {
    // Henkelpokal (Mitte), Sternsäule und Schale
    henkel: '<path d="M27 28C9 28 9 58 35 62M73 28c18 0 18 30-8 34" fill="none" stroke="url(#messing)" stroke-width="5" stroke-linecap="round"/><path d="M24 22h52v8c0 26-12 40-26 42-14-2-26-16-26-42z" fill="url(#messing)"/><rect x="21" y="17" width="58" height="7" rx="3" fill="url(#messing)"/><path d="M45 72h10l-2 16h-6z" fill="url(#messing)"/><ellipse cx="50" cy="80" rx="8" ry="3.5" fill="url(#messing)"/><path d="M33 92h34l4 9H29z" fill="url(#messing)"/>',
    stern: '<path d="M50 6l6.5 13.5 14.8 2-10.8 10.4 2.6 14.7L50 39.6l-13.1 7 2.6-14.7-10.8-10.4 14.8-2z" fill="url(#messing)"/><rect x="45" y="46" width="10" height="38" rx="2" fill="url(#messing)"/><ellipse cx="50" cy="86" rx="11" ry="4" fill="url(#messing)"/><path d="M33 92h34l4 9H29z" fill="url(#messing)"/>',
    schale: '<path d="M14 42h72c0 20-15 32-36 32S14 62 14 42z" fill="url(#messing)"/><ellipse cx="50" cy="42" rx="36" ry="5" fill="#f6e3a3"/><path d="M45 74h10l-1 12h-8z" fill="url(#messing)"/><ellipse cx="50" cy="86" rx="11" ry="4" fill="url(#messing)"/><path d="M33 92h34l4 9H29z" fill="url(#messing)"/>',
  };
  const cup = (shape) => `<svg viewBox="0 0 100 106" aria-hidden="true"><g class="pokal-glanz">${CUPS[shape]}</g><rect x="25" y="101" width="50" height="5" fill="#2b211a"/></svg>`;
  const zeit = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Manche Spiele speichern zwei Werte in einer Zahl: Versuche bzw. Reststifte × 10000 + Sekunden
  const fmt = (score, unit) => {
    if (unit === 'zeit') return zeit(score);
    if (unit === 'versuche') return `${Math.floor(score / 10000)} Versuche`;
    if (unit === 'stifte') { const n = Math.floor(score / 10000); return `${n} ${n === 1 ? 'Stift' : 'Stifte'}`; }
    return `${Number(score).toLocaleString('de-DE')} ${unit}`;
  };
  let picks = [];

  function fillShelf(records) {
    picks = records.filter((r) => r.list.length).concat(records.filter((r) => !r.list.length)).slice(0, 3);
    const order = [[1, 'stern'], [0, 'henkel'], [2, 'schale']]; // bester Rekord in die Mitte
    shelf.innerHTML = order.map(([k, shape]) => {
      const r = picks[k];
      const [, label, , unit] = r.game;
      const top = r.list[0];
      const plate = top
        ? `<span>${esc(label)}</span><b>${fmt(top.score, unit)}</b><span>${esc(top.name)}</span>`
        : `<span>${esc(label)}</span><b>Noch frei</b><span>&nbsp;</span>`;
      return `<li class="pokal${top ? '' : ' frei'}"><button type="button" class="pokal-knopf" data-k="${k}" aria-expanded="false" aria-controls="ehrentafel">${cup(shape)}<span class="pokal-schild">${plate}</span><span class="vh-sr">Ehrentafel ${esc(label)} öffnen</span></button></li>`;
    }).join('');
  }

  function openBoard(k, button) {
    const r = picks[k];
    const [, label, page, unit] = r.game;
    const rows = r.list.slice(0, 5).map((e, idx) => `<li><span class="platz">${idx + 1}.</span><span class="wer">${esc(e.name)}</span><span class="wert">${fmt(e.score, unit)}</span></li>`).join('');
    board.innerHTML = `
      <div class="ehrentafel-kopf"><h3>Ehrentafel ${esc(label)}</h3><button type="button" class="ehrentafel-zu" aria-label="Ehrentafel schließen">×</button></div>
      ${rows ? `<ol>${rows}</ol>` : '<p class="ehrentafel-leer">Noch niemand eingetragen. Der erste Rekord bekommt den Pokal.</p>'}
      <a class="ehrentafel-los" href="/spiele/games/${page}.html">${esc(label)} spielen</a>`;
    shelf.querySelectorAll('.pokal-knopf').forEach((b) => b.setAttribute('aria-expanded', String(b === button)));
    board.hidden = false;
    board.classList.remove('auf');
    void board.offsetWidth;
    board.classList.add('auf');
    board.querySelector('.ehrentafel-zu').addEventListener('click', () => closeBoard(true));
  }
  function closeBoard(focusBack) {
    const open = shelf.querySelector('[aria-expanded="true"]');
    board.hidden = true;
    shelf.querySelectorAll('.pokal-knopf').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (focusBack && open) open.focus();
  }
  shelf.addEventListener('click', (e) => {
    const b = e.target.closest('.pokal-knopf');
    if (!b) return;
    if (b.getAttribute('aria-expanded') === 'true') closeBoard(false);
    else openBoard(+b.dataset.k, b);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !board.hidden) closeBoard(true); });
  document.addEventListener('click', (e) => {
    if (!board.hidden && !e.target.closest('.vitrine')) closeBoard(false);
  });

  Promise.all(GAMES.map((gm) => fetch('/api/spiele/scores/' + gm[0])
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => ({ game: gm, list: Array.isArray(list) ? list : [] }))
    .catch(() => ({ game: gm, list: [] }))))
    .then(fillShelf);
})();
