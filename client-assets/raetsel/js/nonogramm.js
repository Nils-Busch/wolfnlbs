/**
 * Nonogramm: Die Zahlen am Rand verraten, wie viele Felder am Stück in jeder
 * Zeile und Spalte gefüllt sind. Gelöst ist das Rätsel, sobald alle Zahlen passen.
 *   Tagesrätsel – 10 × 10, für alle gleich, Bestenliste nach Zeit
 *   Freies Spiel – 5 × 5, 10 × 10 oder 15 × 15
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, store } = Daily;
  const START = '2026-10-26';
  const today = Daily.today();
  const num = Daily.number(START, today);
  const lbKey = Daily.key('nono', today);

  let mode = 'daily';
  let size = +store.get('nono-size') || 10;
  let P = null; // { n, solution, cells, started, elapsed, done, submitted }
  let tool = 'fill';
  let timer = null;

  /* ---------- Rätsel bauen ---------- */
  function generate(n, rand) {
    // Zufällige Felder, dann geglättet, damit eher Formen als Rauschen entstehen
    let g = Array.from({ length: n * n }, () => rand() < 0.5);
    for (let pass = 0; pass < 2; pass++) {
      g = g.map((v, i) => {
        const r = Math.floor(i / n), c = i % n;
        let on = 0, all = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          all++; if (g[rr * n + cc]) on++;
        }
        const k = on / all;
        return k >= 0.75 ? true : k <= 0.25 ? false : v;
      });
    }
    // keine leeren Zeilen/Spalten
    for (let r = 0; r < n; r++) if (!g.slice(r * n, r * n + n).some(Boolean)) g[r * n + Math.floor(rand() * n)] = true;
    for (let c = 0; c < n; c++) if (!Array.from({ length: n }, (_, r) => g[r * n + c]).some(Boolean)) g[Math.floor(rand() * n) * n + c] = true;
    return g;
  }
  const runs = (arr) => {
    const out = [];
    let k = 0;
    for (const v of arr) { if (v) k++; else if (k) { out.push(k); k = 0; } }
    if (k) out.push(k);
    return out.length ? out : [0];
  };
  const rowOf = (g, n, r) => g.slice(r * n, r * n + n);
  const colOf = (g, n, c) => Array.from({ length: n }, (_, r) => g[r * n + c]);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  function newPuzzle(m, n) {
    mode = m;
    clearInterval(timer);
    if (m === 'daily') {
      n = 10;
      const solution = generate(n, Daily.rng('nono-' + today));
      const saved = store.get('nono-day');
      P = saved && saved.date === today
        ? { n, solution, cells: saved.cells, elapsed: saved.elapsed, started: null, done: saved.done, submitted: saved.submitted }
        : { n, solution, cells: Array(n * n).fill(0), elapsed: 0, started: null, done: false };
    } else {
      P = { n, solution: generate(n, Math.random), cells: Array(n * n).fill(0), elapsed: 0, started: null, done: false };
    }
    P.rows = Array.from({ length: n }, (_, r) => runs(rowOf(P.solution, n, r)));
    P.cols = Array.from({ length: n }, (_, c) => runs(colOf(P.solution, n, c)));
    build();
    if (P.done) finish(false);
    tick();
  }

  function save() {
    if (mode !== 'daily') return;
    store.set('nono-day', { date: today, cells: P.cells, elapsed: elapsed(), done: P.done, submitted: P.submitted || null });
  }
  const elapsed = () => P.elapsed + (P.started ? Math.floor((Date.now() - P.started) / 1000) : 0);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function tick() {
    $('nnTime').textContent = fmtTime(elapsed());
  }
  function startClock() {
    if (P.started || P.done) return;
    P.started = Date.now();
    timer = setInterval(() => { tick(); if (mode === 'daily' && elapsed() % 5 === 0) save(); }, 1000);
  }
  function stopClock() {
    if (!P.started) return;
    P.elapsed = elapsed();
    P.started = null;
    clearInterval(timer);
  }

  /* ---------- Brett ---------- */
  function build() {
    const n = P.n;
    const board = $('nnBoard');
    board.style.setProperty('--n', n);
    board.className = 'nn-board n' + n;
    let html = '<div class="nn-corner"></div>';
    for (let c = 0; c < n; c++) html += `<div class="nn-clue col" data-c="${c}">${P.cols[c].map((x) => `<span>${x}</span>`).join('')}</div>`;
    for (let r = 0; r < n; r++) {
      html += `<div class="nn-clue row" data-r="${r}">${P.rows[r].map((x) => `<span>${x}</span>`).join('')}</div>`;
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const edge = (c % 5 === 4 && c < n - 1 ? ' br' : '') + (r % 5 === 4 && r < n - 1 ? ' bb' : '');
        html += `<button class="nn-cell${edge}" data-i="${i}" aria-label="Zeile ${r + 1}, Spalte ${c + 1}"></button>`;
      }
    }
    board.innerHTML = html;
    paint();
    document.querySelectorAll('#nnModes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('nnSizes').hidden = mode !== 'free';
    document.querySelectorAll('#nnSizes [data-size]').forEach((b) => b.classList.toggle('on', +b.dataset.size === n));
    $('nnNum').textContent = mode === 'daily' ? `#${num}` : `${n} × ${n}`;
    $('nnDone').hidden = true;
    renderSide();
  }

  function paint() {
    const n = P.n;
    document.querySelectorAll('#nnBoard .nn-cell').forEach((b) => {
      const v = P.cells[+b.dataset.i];
      b.classList.toggle('on', v === 1);
      b.classList.toggle('x', v === 2);
      b.disabled = P.done;
    });
    const filled = P.cells.map((v) => v === 1);
    for (let r = 0; r < n; r++) document.querySelector(`.nn-clue.row[data-r="${r}"]`).classList.toggle('ok', same(runs(rowOf(filled, n, r)), P.rows[r]));
    for (let c = 0; c < n; c++) document.querySelector(`.nn-clue.col[data-c="${c}"]`).classList.toggle('ok', same(runs(colOf(filled, n, c)), P.cols[c]));
  }

  function solved() {
    const n = P.n, filled = P.cells.map((v) => v === 1);
    for (let r = 0; r < n; r++) if (!same(runs(rowOf(filled, n, r)), P.rows[r])) return false;
    for (let c = 0; c < n; c++) if (!same(runs(colOf(filled, n, c)), P.cols[c])) return false;
    return true;
  }

  // Ziehen über mehrere Felder setzt alle auf denselben Wert
  let dragVal = null;
  function setCell(i, val) {
    if (P.done || P.cells[i] === val) return;
    P.cells[i] = val;
    const b = document.querySelector(`.nn-cell[data-i="${i}"]`);
    if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }
  function onDown(e) {
    const b = e.target.closest('.nn-cell');
    if (!b || P.done) return;
    e.preventDefault();
    startClock();
    const i = +b.dataset.i;
    const want = e.button === 2 || tool === 'x' ? 2 : 1;
    dragVal = P.cells[i] === want ? 0 : want;
    setCell(i, dragVal);
    paint();
  }
  function onMove(e) {
    if (dragVal === null) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const b = t && t.closest && t.closest('.nn-cell');
    if (!b) return;
    const i = +b.dataset.i;
    if (P.cells[i] !== dragVal) { setCell(i, dragVal); paint(); }
  }
  function onUp() {
    if (dragVal === null) return;
    dragVal = null;
    save();
    if (solved()) finish(true);
  }

  function finish(fresh) {
    P.done = true;
    stopClock();
    // nicht gefüllte Felder leeren, Kreuze weg: das fertige Bild
    P.cells = P.cells.map((v) => (v === 1 ? 1 : 0));
    paint();
    tick();
    save();
    const t = elapsed();
    $('nnDone').hidden = false;
    $('nnDone').innerHTML = `<b>Gelöst in ${fmtTime(t)}!</b>${mode === 'daily' ? '' : ' <button id="nnAgain">Nächstes Rätsel</button>'}`;
    if ($('nnAgain')) $('nnAgain').onclick = () => newPuzzle('free', size);
    if (fresh) {
      document.querySelectorAll('#nnBoard .nn-cell').forEach((b) => {
        const i = +b.dataset.i;
        b.style.animationDelay = ((Math.floor(i / P.n) + (i % P.n)) * 28) + 'ms';
      });
      $('nnBoard').classList.add('solved');
      if (mode === 'daily') recordStats(t);
      if (window.VH) setTimeout(() => VH.confetti(), 500);
    } else {
      $('nnBoard').classList.add('solved', 'static');
    }
    renderSide();
  }

  function recordStats(t) {
    const st = store.get('nono-stats') || { played: 0, best: null, streak: 0, last: null };
    if (st.lastCounted === today) return;
    st.played++;
    st.best = st.best === null ? t : Math.min(st.best, t);
    st.streak = st.last && Daily.number(st.last, today) === 2 ? st.streak + 1 : 1;
    st.last = today;
    st.lastCounted = today;
    store.set('nono-stats', st);
  }

  /* ---------- Seitenleiste ---------- */
  function renderSide() {
    const side = $('side');
    if (mode !== 'daily') {
      side.innerHTML = `<div class="panel"><h2>🎲 Freies Spiel</h2><p class="muted">Neue Rätsel ohne Bestenliste. 5 × 5 zum Reinkommen, 15 × 15 für lange Abende.</p></div>`;
      return;
    }
    const st = store.get('nono-stats') || { played: 0, best: null, streak: 0 };
    side.innerHTML = `
      <div class="panel"><h2>🏆 Tagesbestenliste</h2><p class="muted st-date">${esc(Daily.longDate(today))}</p>
        <div id="nnForm"></div><div id="nnLb"><p class="muted">Lade …</p></div></div>
      <div class="panel st-stats"><h2>📊 Deine Statistik</h2>
        <div class="nums"><div><b>${st.played}</b><span>gelöst</span></div><div><b>${st.best === null ? '–' : fmtTime(st.best)}</b><span>Bestzeit</span></div><div><b>${st.streak}</b><span>Serie</span></div></div>
        <p class="hint">Nur Tagesrätsel, gespeichert auf diesem Gerät.</p></div>`;
    Daily.board($('nnLb'), lbKey, fmtTime, P.submitted || null);
    if (P.done && !P.submitted) {
      const t = elapsed();
      $('nnForm').innerHTML = `<form class="hs-form"><p>Deine Zeit: <b>${fmtTime(t)}</b></p><div class="row"><input name="n" maxlength="16" required placeholder="Dein Name" value="${esc(store.name())}"><button>Eintragen</button></div><p class="error"></p></form>`;
      const form = $('nnForm').querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.elements.n.value.trim();
        if (!name) return;
        store.setName(name);
        form.querySelector('button').disabled = true;
        try {
          const entries = await Daily.submit(lbKey, name, t);
          P.submitted = { name, score: t };
          save();
          $('nnForm').innerHTML = '';
          $('nnLb').innerHTML = Daily.table(entries, fmtTime, P.submitted);
        } catch (err) {
          form.querySelector('.error').textContent = err.message;
          form.querySelector('button').disabled = false;
        }
      };
    }
  }

  /* ---------- Start ---------- */
  const board = $('nnBoard');
  board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  document.querySelectorAll('#nnTools [data-tool]').forEach((b) => (b.onclick = () => {
    tool = b.dataset.tool;
    document.querySelectorAll('#nnTools [data-tool]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('#nnModes [data-mode]').forEach((b) => (b.onclick = () => newPuzzle(b.dataset.mode, size)));
  document.querySelectorAll('#nnSizes [data-size]').forEach((b) => (b.onclick = () => {
    size = +b.dataset.size;
    store.set('nono-size', size);
    newPuzzle('free', size);
  }));
  $('nnReset').onclick = () => {
    if (P.done) return;
    P.cells = P.cells.map(() => 0);
    paint();
    save();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && P && P.started) { stopClock(); save(); }
  });
  newPuzzle('daily', 10);
})();
