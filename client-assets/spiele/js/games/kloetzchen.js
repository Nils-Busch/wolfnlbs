/**
 * Klötzchen – Blöcke auf ein 8 × 8-Feld ziehen. Volle Reihen und Spalten
 * verschwinden. Wer in Folge abräumt, baut eine Kombo auf. Vorbei ist es,
 * wenn keiner der drei Blöcke mehr passt.
 */
(() => {
  'use strict';
  const N = 8;
  const $ = (id) => document.getElementById(id);
  const boardEl = $('kzBoard'), trayEl = $('kzTray'), fxEl = $('kzFx');
  const hs = Scores.panel($('scores'), 'kloetzchen', { unit: 'Pkt' });
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrate = (p) => { if (navigator.vibrate) try { navigator.vibrate(p); } catch {} };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- Blöcke ---------- */
  // [Zellen als "zeile,spalte"-Liste, Gewicht]
  const SHAPES = [
    ['0,0', 3],
    ['0,0 0,1', 6], ['0,0 1,0', 6],
    ['0,0 0,1 0,2', 6], ['0,0 1,0 2,0', 6],
    ['0,0 0,1 0,2 0,3', 4], ['0,0 1,0 2,0 3,0', 4],
    ['0,0 0,1 0,2 0,3 0,4', 2], ['0,0 1,0 2,0 3,0 4,0', 2],
    ['0,0 0,1 1,0 1,1', 7],
    ['0,0 0,1 0,2 1,0 1,1 1,2 2,0 2,1 2,2', 2],
    ['0,0 0,1 0,2 1,0 1,1 1,2', 3], ['0,0 0,1 1,0 1,1 2,0 2,1', 3],
    ['0,0 1,0 1,1', 5], ['0,1 1,0 1,1', 5], ['0,0 0,1 1,0', 5], ['0,0 0,1 1,1', 5],
    ['0,0 1,0 2,0 2,1', 3], ['0,1 1,1 2,1 2,0', 3], ['0,0 0,1 1,0 2,0', 3], ['0,0 0,1 1,1 2,1', 3],
    ['0,0 0,1 0,2 1,0', 3], ['0,0 0,1 0,2 1,2', 3], ['0,0 1,0 1,1 1,2', 3], ['0,2 1,0 1,1 1,2', 3],
    ['0,0 0,1 0,2 1,1', 4], ['0,1 1,0 1,1 1,2', 4], ['0,0 1,0 1,1 2,0', 4], ['0,1 1,0 1,1 2,1', 4],
    ['0,1 0,2 1,0 1,1', 3], ['0,0 0,1 1,1 1,2', 3], ['0,0 1,0 1,1 2,1', 3], ['0,1 1,0 1,1 2,0', 3],
    ['0,0 1,0 2,0 2,1 2,2', 2], ['0,2 1,2 2,0 2,1 2,2', 2], ['0,0 0,1 0,2 1,0 2,0', 2], ['0,0 0,1 0,2 1,2 2,2', 2],
    ['0,0 1,1', 2], ['0,1 1,0', 2],
  ].map(([s, w]) => ({ cells: s.split(' ').map((p) => p.split(',').map(Number)), w }));
  const COLORS = ['#ff5d73', '#ffb347', '#ffd84d', '#4fd08f', '#38c6d9', '#5b8cff', '#a77bff', '#ff7ac6'];
  const TOTAL_W = SHAPES.reduce((a, s) => a + s.w, 0);
  const size = (cells) => [Math.max(...cells.map((c) => c[0])) + 1, Math.max(...cells.map((c) => c[1])) + 1];

  function randomPiece() {
    let r = Math.random() * TOTAL_W;
    const sh = SHAPES.find((s) => (r -= s.w) < 0) || SHAPES[0];
    return { cells: sh.cells, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  }

  /* ---------- Zustand ---------- */
  let G = null; // { grid[N*N] = color|null, tray[3] = piece|null, score, combo, sinceClear, moves }
  const best = () => store.get('kz-best') || 0;

  function fits(grid, cells, r, c) {
    for (const [dr, dc] of cells) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || grid[rr * N + cc]) return false;
    }
    return true;
  }
  function anyFit(grid, cells) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(grid, cells, r, c)) return true;
    return false;
  }
  // Drei neue Blöcke – mindestens einer muss passen, solange das irgendwie möglich ist
  function newTray() {
    let tray;
    for (let i = 0; i < 40; i++) {
      tray = [randomPiece(), randomPiece(), randomPiece()];
      if (tray.some((p) => anyFit(G.grid, p.cells))) return tray;
    }
    return tray;
  }
  function linesFor(grid) {
    const rows = [], cols = [];
    for (let r = 0; r < N; r++) if ([...Array(N)].every((_, c) => grid[r * N + c])) rows.push(r);
    for (let c = 0; c < N; c++) if ([...Array(N)].every((_, r) => grid[r * N + c])) cols.push(c);
    return { rows, cols };
  }

  function newGame() {
    G = { grid: Array(N * N).fill(null), tray: [], score: 0, combo: 0, sinceClear: 0, moves: 0, over: false };
    G.tray = newTray();
    save();
    $('kzOverlay').hidden = true;
    hs.hide();
    renderBoard();
    renderTray(true);
    renderHud();
  }
  const save = () => store.set('kz-state', G);

  /* ---------- Darstellung ---------- */
  boardEl.innerHTML = Array.from({ length: N * N }, (_, i) => `<i class="kz-cell" data-i="${i}"></i>`).join('');
  const cellEls = [...boardEl.children];

  function renderBoard() {
    G.grid.forEach((col, i) => {
      const el = cellEls[i];
      el.classList.toggle('on', !!col);
      el.style.setProperty('--c', col || 'transparent');
    });
  }
  function pieceHtml(p, idx) {
    const [h, w] = size(p.cells);
    const set = new Set(p.cells.map(([r, c]) => r * 10 + c));
    let html = '';
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) html += `<i class="${set.has(r * 10 + c) ? 'b' : ''}"></i>`;
    return `<div class="kz-piece" data-idx="${idx}" style="--w:${w};--h:${h};--c:${p.color}">${html}</div>`;
  }
  function renderTray(fresh = false) {
    trayEl.innerHTML = G.tray.map((p, i) => `<button type="button" class="kz-slot ${fresh ? 'fresh' : ''} ${p && !anyFit(G.grid, p.cells) ? 'nofit' : ''}" data-idx="${i}" style="--d:${i * 70}ms" ${p ? '' : 'disabled'} aria-label="${p ? `Block ${i + 1} mit ${p.cells.length} Feldern` : 'leer'}">${p ? pieceHtml(p, i) : ''}</button>`).join('');
  }
  function renderHud() {
    $('kzScore').textContent = G.score.toLocaleString('de-DE');
    $('kzBest').textContent = Math.max(best(), G.score).toLocaleString('de-DE');
    $('kzCombo').textContent = G.combo > 1 ? `×${G.combo}` : '–';
    $('kzComboBox').classList.toggle('hot', G.combo > 1);
  }

  /* ---------- Ziehen ---------- */
  let drag = null; // { idx, piece, el, offX, offY, r, c }
  // Raster aus den echten Feldern messen (Innenabstand und Lücken eingerechnet)
  function geom() {
    const a = cellEls[0].getBoundingClientRect(), b = cellEls[1].getBoundingClientRect();
    const pitch = b.left - a.left;
    return { x: a.left - (pitch - a.width) / 2, y: a.top - (pitch - a.height) / 2, cs: pitch };
  }
  const cellSize = () => geom().cs;

  function clearPreview() {
    cellEls.forEach((el) => { el.classList.remove('ghost', 'bad', 'will'); el.style.removeProperty('--g'); });
  }
  function preview(r, c) {
    clearPreview();
    if (r == null) return;
    const ok = fits(G.grid, drag.piece.cells, r, c);
    for (const [dr, dc] of drag.piece.cells) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      const el = cellEls[rr * N + cc];
      el.classList.add(ok ? 'ghost' : 'bad');
      el.style.setProperty('--g', drag.piece.color);
    }
    if (!ok) return;
    const g = G.grid.slice();
    for (const [dr, dc] of drag.piece.cells) g[(r + dr) * N + c + dc] = drag.piece.color;
    const { rows, cols } = linesFor(g);
    rows.forEach((rr) => { for (let cc = 0; cc < N; cc++) cellEls[rr * N + cc].classList.add('will'); });
    cols.forEach((cc) => { for (let rr = 0; rr < N; rr++) cellEls[rr * N + cc].classList.add('will'); });
  }

  function startDrag(e, idx) {
    const piece = G.tray[idx];
    if (!piece || G.over) return;
    e.preventDefault();
    const cs = cellSize();
    const [h, w] = size(piece.cells);
    const el = document.createElement('div');
    el.className = 'kz-drag';
    el.innerHTML = pieceHtml(piece, idx);
    el.style.setProperty('--cs-board', cs + 'px');
    document.body.appendChild(el);
    // Am Handy schwebt der Block über dem Finger, damit man sieht, wo er landet
    const lift = e.pointerType === 'touch' ? cs * 1.6 : 0;
    drag = { idx, piece, el, offX: (w * cs) / 2, offY: h * cs / 2 + lift, r: null, c: null, pointerId: e.pointerId };
    trayEl.querySelector(`.kz-slot[data-idx="${idx}"]`)?.classList.add('lifted');
    moveDrag(e);
    vibrate(8);
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const x = e.clientX - drag.offX, y = e.clientY - drag.offY;
    drag.el.style.transform = `translate(${x}px, ${y}px)`;
    const g = geom();
    const c = Math.round((x - g.x) / g.cs), r = Math.round((y - g.y) / g.cs);
    const [h, w] = size(drag.piece.cells);
    const inside = r > -h && c > -w && r < N && c < N;
    if (inside && (r !== drag.r || c !== drag.c)) { drag.r = r; drag.c = c; preview(r, c); }
    else if (!inside && drag.r != null) { drag.r = drag.c = null; preview(null); }
  }
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    clearPreview();
    trayEl.querySelector(`.kz-slot[data-idx="${d.idx}"]`)?.classList.remove('lifted');
    if (d.r != null && fits(G.grid, d.piece.cells, d.r, d.c)) {
      d.el.remove();
      place(d.idx, d.r, d.c);
    } else {
      // zurück in die Ablage
      const slot = trayEl.querySelector(`.kz-slot[data-idx="${d.idx}"] .kz-piece`);
      if (slot && !reduced()) {
        const s = slot.getBoundingClientRect();
        d.el.classList.add('back');
        d.el.style.transform = `translate(${s.left}px, ${s.top}px) scale(.55)`;
        setTimeout(() => d.el.remove(), 260);
      } else d.el.remove();
    }
  }

  /* ---------- Setzen, Abräumen, Punkte ---------- */
  function place(idx, r, c) {
    const p = G.tray[idx];
    for (const [dr, dc] of p.cells) {
      const i = (r + dr) * N + c + dc;
      G.grid[i] = p.color;
      const el = cellEls[i];
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    G.tray[idx] = null;
    G.moves++;
    let gained = p.cells.length;
    const { rows, cols } = linesFor(G.grid);
    const n = rows.length + cols.length;
    renderBoard();
    if (n) {
      G.combo++;
      G.sinceClear = 0;
      const base = 80 * n * (n + 1) / 2;
      gained += base * G.combo;
      const clearSet = new Set();
      rows.forEach((rr) => { for (let cc = 0; cc < N; cc++) clearSet.add(rr * N + cc); });
      cols.forEach((cc) => { for (let rr = 0; rr < N; rr++) clearSet.add(rr * N + cc); });
      blast([...clearSet], r, c);
      clearSet.forEach((i) => (G.grid[i] = null));
      let label = n > 1 ? `${n} Reihen!` : '';
      if (G.combo > 1) label = `Kombo ×${G.combo}${label ? ' · ' + label : ''}`;
      if (G.grid.every((x) => !x)) { gained += 300; label = 'Alles weg! +300'; }
      if (label) banner(label);
      vibrate(n > 1 ? [30, 40, 60] : 35);
      if (n >= 2 && !reduced()) { boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake'); }
    } else if (++G.sinceClear >= 3) {
      G.combo = 0; // nach drei Zügen ohne Abräumen ist die Kombo vorbei
    }
    G.score += gained;
    floatScore(gained, r, c);
    if (G.tray.every((x) => !x)) { G.tray = newTray(); renderTray(true); } else renderTray();
    renderHud();
    if (!G.tray.some((x) => x && anyFit(G.grid, x.cells))) return setTimeout(gameOver, n ? 650 : 250);
    save();
  }

  function blast(indices, r0, c0) {
    for (const i of indices) {
      const el = cellEls[i];
      const r = Math.floor(i / N), c = i % N;
      const dist = Math.abs(r - r0) + Math.abs(c - c0);
      const color = G.grid[i];
      el.style.setProperty('--bc', color);
      el.style.setProperty('--bd', `${Math.min(dist, 10) * 22}ms`);
      el.classList.remove('boom'); void el.offsetWidth; el.classList.add('boom');
      setTimeout(() => el.classList.remove('boom'), 700 + dist * 22);
      if (!reduced() && Math.random() < 0.55) particle(i, color, dist);
    }
    setTimeout(renderBoard, 0);
  }
  function particle(i, color, dist) {
    const b = boardEl.getBoundingClientRect(), f = fxEl.getBoundingClientRect();
    const cs = b.width / N;
    const x = b.left - f.left + (i % N + 0.5) * cs, y = b.top - f.top + (Math.floor(i / N) + 0.5) * cs;
    const s = document.createElement('i');
    s.className = 'kz-spark';
    s.style.cssText = `left:${x}px;top:${y}px;--c:${color};--dx:${(Math.random() - 0.5) * 160}px;--dy:${-40 - Math.random() * 120}px;--rot:${(Math.random() - 0.5) * 540}deg;animation-delay:${dist * 22}ms`;
    fxEl.appendChild(s);
    setTimeout(() => s.remove(), 1100 + dist * 22);
  }
  function floatScore(pts, r, c) {
    const b = boardEl.getBoundingClientRect(), f = fxEl.getBoundingClientRect();
    const cs = b.width / N;
    const s = document.createElement('b');
    s.className = 'kz-float';
    s.textContent = `+${pts.toLocaleString('de-DE')}`;
    s.style.left = `${b.left - f.left + (c + 1) * cs}px`;
    s.style.top = `${b.top - f.top + r * cs}px`;
    fxEl.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
  function banner(text) {
    const el = $('kzBanner');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  function gameOver() {
    G.over = true;
    const isBest = G.score > best();
    if (isBest) store.set('kz-best', G.score);
    store.set('kz-state', null);
    renderHud();
    $('kzOvText').innerHTML = `${isBest && G.score ? 'Neuer Rekord! 🎉' : 'Kein Block passt mehr'}<small>${G.score.toLocaleString('de-DE')} Punkte · ${G.moves} Züge</small>`;
    $('kzOverlay').hidden = false;
    if (G.score > 0) hs.offer(G.score);
    if (isBest && window.VH && G.score) VH.confetti();
    trayEl.querySelectorAll('.kz-slot').forEach((s) => s.classList.add('nofit'));
  }

  /* ---------- Tastatur: 1–3 wählen, Pfeile schieben, Enter setzen ---------- */
  let kb = null; // { idx, r, c }
  function kbShow() {
    if (!kb) return clearPreview();
    drag = { piece: G.tray[kb.idx] };
    preview(kb.r, kb.c);
    drag = null;
  }
  document.addEventListener('keydown', (e) => {
    if (!G || G.over || e.target.closest('input, textarea')) return;
    if (['1', '2', '3'].includes(e.key) && G.tray[+e.key - 1]) { kb = { idx: +e.key - 1, r: 3, c: 3 }; kbShow(); e.preventDefault(); return; }
    if (!kb) return;
    const [h, w] = size(G.tray[kb.idx].cells);
    const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (mv) { kb.r = Math.max(0, Math.min(N - h, kb.r + mv[0])); kb.c = Math.max(0, Math.min(N - w, kb.c + mv[1])); kbShow(); e.preventDefault(); }
    else if (e.key === 'Enter' && fits(G.grid, G.tray[kb.idx].cells, kb.r, kb.c)) { const k = kb; kb = null; clearPreview(); place(k.idx, k.r, k.c); e.preventDefault(); }
    else if (e.key === 'Escape') { kb = null; clearPreview(); }
  });

  trayEl.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.kz-slot');
    if (slot && !slot.disabled) startDrag(e, +slot.dataset.idx);
  });
  window.addEventListener('pointermove', moveDrag, { passive: true });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  $('kzNew').onclick = () => { if (G.over || G.moves === 0 || confirm('Neues Spiel anfangen? Der aktuelle Stand geht verloren.')) newGame(); };
  $('kzAgain').onclick = newGame;

  /* ---------- Start: angefangenes Spiel fortsetzen ---------- */
  const saved = store.get('kz-state');
  if (saved && Array.isArray(saved.grid) && saved.grid.length === N * N && !saved.over) {
    G = saved;
    renderBoard();
    renderTray(true);
    renderHud();
    if (!G.tray.some((x) => x && anyFit(G.grid, x.cells))) gameOver();
  } else newGame();
})();
