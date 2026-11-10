/**
 * Tagespuzzle: jeden Tag ein neues, selbst gemaltes Bild in 24 Teilen.
 * Teile auf den Rahmen ziehen – liegt eins nah genug an seinem Platz, rastet es ein.
 *   Tagespuzzle – 6 × 4 Teile, für alle gleich, Bestenliste nach Zeit
 *   Freies Puzzle – 12, 24 oder 54 Teile, jedes Mal ein neues Bild
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, store } = Daily;
  const START = '2026-11-10';
  const today = Daily.today();
  const num = Daily.number(START, today);
  const lbKey = Daily.key('jig', today);
  const IW = 1200, IH = 800; // Bildgröße in Bild-Einheiten
  const SIZES = { 12: [4, 3], 24: [6, 4], 54: [9, 6] };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrate = (p) => { if (navigator.vibrate) try { navigator.vibrate(p); } catch {} };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const table = $('jgTable'), frame = $('jgFrame'), ghost = $('jgGhost');
  let mode = 'daily';
  let freeSize = +store.get('jig-size') || 24;
  let P = null; // Puzzle-Zustand
  let L = null; // Layout: { scale, fx, fy, fw, fh, tw, th }
  let timer = null;
  let zTop = 10;

  /* ---------- Teile schneiden ---------- */
  // Kante zwischen zwei Teilen als Liste von Linien/Bezier-Stücken in Bild-Koordinaten.
  // nx/ny: Richtung, in die die Nase zeigt. jit: kleine Unterschiede, damit nicht alle Nasen gleich aussehen.
  function edge(x0, y0, x1, y1, nx, ny, jit) {
    if (!nx && !ny) return [{ L: [x1, y1] }];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const k = jit.k, cu = 0.5 + jit.sh;
    const P2 = (u, v) => [x0 + dx * u + nx * len * v, y0 + dy * u + ny * len * v];
    return [
      { L: P2(cu - 0.12 * k, 0) },
      { C: [P2(cu - 0.08 * k, 0), P2(cu - 0.05 * k, 0.05 * k), P2(cu - 0.1 * k, 0.11 * k)] },
      { C: [P2(cu - 0.16 * k, 0.19 * k), P2(cu - 0.09 * k, 0.27 * k), P2(cu, 0.27 * k)] },
      { C: [P2(cu + 0.09 * k, 0.27 * k), P2(cu + 0.16 * k, 0.19 * k), P2(cu + 0.1 * k, 0.11 * k)] },
      { C: [P2(cu + 0.05 * k, 0.05 * k), P2(cu + 0.08 * k, 0), P2(cu + 0.12 * k, 0)] },
      { L: [x1, y1] },
    ];
  }
  // Rückwärts ablaufen (für das Nachbarteil)
  function reverse(segs, start) {
    const pts = [start, ...segs.map((s) => (s.L ? s.L : s.C[2]))];
    const out = [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i], to = pts[i];
      out.push(s.L ? { L: to } : { C: [s.C[1], s.C[0], to] });
    }
    return out;
  }
  function trace(path, segs) {
    for (const s of segs) {
      if (s.L) path.lineTo(s.L[0], s.L[1]);
      else path.bezierCurveTo(s.C[0][0], s.C[0][1], s.C[1][0], s.C[1][1], s.C[2][0], s.C[2][1]);
    }
  }
  function cut(cols, rows, rand) {
    const cw = IW / cols, ch = IH / rows;
    const jit = () => ({ k: 0.92 + rand() * 0.16, sh: (rand() - 0.5) * 0.1 });
    const H = [], V = []; // H[r][c]: Kante oben an Zeile r; V[r][c]: Kante links an Spalte c
    for (let r = 0; r <= rows; r++) {
      H[r] = [];
      for (let c = 0; c < cols; c++) {
        const s = r === 0 || r === rows ? 0 : rand() < 0.5 ? 1 : -1;
        H[r][c] = edge(c * cw, r * ch, (c + 1) * cw, r * ch, 0, s, jit());
      }
    }
    for (let r = 0; r < rows; r++) {
      V[r] = [];
      for (let c = 0; c <= cols; c++) {
        const s = c === 0 || c === cols ? 0 : rand() < 0.5 ? 1 : -1;
        V[r][c] = edge(c * cw, r * ch, c * cw, (r + 1) * ch, s, 0, jit());
      }
    }
    const pieces = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const path = new Path2D();
        path.moveTo(c * cw, r * ch);
        trace(path, H[r][c]);
        trace(path, V[r][c + 1]);
        trace(path, reverse(H[r + 1][c], [c * cw, (r + 1) * ch]));
        trace(path, reverse(V[r][c], [c * cw, r * ch]));
        path.closePath();
        const edgePiece = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
        pieces.push({ i: pieces.length, r, c, path, edge: edgePiece, x: 0, y: 0, placed: false, el: null });
      }
    return { cw, ch, pad: Math.max(cw, ch) * 0.3, pieces };
  }

  /* ---------- Puzzle anlegen ---------- */
  function seedFor() {
    return mode === 'daily' ? 'jig-' + today : 'jig-free-' + (store.get('jig-free-seed') || Date.now());
  }
  function build(saved) {
    stopClock();
    table.querySelectorAll('.jg-piece').forEach((e) => e.remove());
    const [cols, rows] = mode === 'daily' ? SIZES[24] : SIZES[freeSize];
    const rand = Daily.rng(seedFor());
    const img = document.createElement('canvas');
    img.width = IW; img.height = IH;
    const title = PuzzleArt.paint(img.getContext('2d'), IW, IH, rand);
    const cutRand = Daily.rng(seedFor() + '-schnitt');
    const C = cut(cols, rows, cutRand);
    P = { cols, rows, img, title, ...C, started: null, elapsed: 0, done: false, submitted: null, moves: 0 };
    if (saved && saved.pos && saved.pos.length === P.pieces.length) {
      saved.pos.forEach((p, i) => Object.assign(P.pieces[i], { x: p[0], y: p[1], placed: !!p[2] }));
      Object.assign(P, { elapsed: saved.elapsed || 0, done: !!saved.done, submitted: saved.submitted || null, moves: saved.moves || 0 });
    }
    ghost.width = IW / 4; ghost.height = IH / 4;
    ghost.getContext('2d').drawImage(img, 0, 0, ghost.width, ghost.height);
    $('jgFinal').hidden = true;
    frame.classList.remove('done');
    frame.classList.remove('shine');
    ['jgPeek', 'jgEdges', 'jgShuffle'].forEach((id) => ($(id).disabled = false));
    layout(true);
    // Neu verteilen, wenn nichts gespeichert ist oder lose Teile außerhalb des Tisches liegen (anderes Gerät)
    const outside = P.pieces.some((p) => {
      if (p.placed) return false;
      const [sx, sy] = toScreen(p.x, p.y);
      return sx < -20 || sy < -20 || sx > L.tw - 10 || sy > L.th - 10;
    });
    if (!saved || !saved.pos || outside) scatter(false);
    for (const p of P.pieces) makePieceEl(p);
    render();
    $('jgNum').textContent = mode === 'daily' ? `#${num}` : '';
    $('jgTitle').textContent = P.done ? P.title : '';
    tick();
    updateCount();
    if (P.done) finish(false);
    renderSide();
  }

  /* ---------- Layout: Rahmen oben/mittig, lose Teile ringsum ---------- */
  function layout(force) {
    const tw = table.clientWidth;
    const wide = tw > 900;
    // Rahmen so groß wie möglich, aber der ganze Tisch soll auf den Bildschirm passen,
    // damit man Teile ziehen kann, ohne zu scrollen
    const maxH = Math.max(420, window.innerHeight - 170);
    let fw = Math.min(wide ? tw * 0.52 : tw - 8, 760);
    let geo = null;
    for (let k = 0; k < 14; k++) {
      geo = slotsFor(tw, fw);
      if (geo.th <= maxH || fw < 260) break;
      fw *= 0.93;
    }
    const sig = `${Math.round(tw)}|${Math.round(geo.fw)}`;
    const changed = !L || L.sig !== sig;
    L = { ...geo, tw, sig };
    table.style.height = L.th + 'px';
    Object.assign(frame.style, { left: L.fx + 'px', top: L.fy + 'px', width: L.fw + 'px', height: L.fh + 'px' });
    return changed && !force;
  }
  // Plätze für lose Teile: Raster über die ganze Fläche, ohne den Rahmen
  function slotsFor(tw, fw) {
    const scale = fw / IW, fh = IH * scale;
    const fx = (tw - fw) / 2, fy = 8;
    const slot = Math.max(P.cw, P.ch) * scale * 1.32;
    const slots = [];
    const cols = Math.max(1, Math.floor(tw / slot));
    const ox = (tw - cols * slot) / 2;
    let rowsY = 0;
    for (let row = 0; slots.length < P.pieces.length && row < 200; row++) {
      const y = 4 + row * slot;
      for (let col = 0; col < cols; col++) {
        const x = ox + col * slot;
        const overlap = x + slot > fx - 10 && x < fx + fw + 10 && y < fy + fh + 14;
        if (!overlap) slots.push([x + slot / 2, y + slot / 2]);
      }
      rowsY = y + slot;
    }
    return { scale, fw, fh, fx, fy, slot, slots, th: Math.max(fh + fy + 20, rowsY + 6) };
  }
  // Bild-Koordinaten (links oben des Teils, relativ zum Rahmen) ↔ Bildschirm
  const toScreen = (x, y) => [L.fx + x * L.scale, L.fy + y * L.scale];
  function scatter(edgesFirst) {
    const loose = P.pieces.filter((p) => !p.placed);
    const order = loose.slice().sort(() => Math.random() - 0.5);
    if (edgesFirst) order.sort((a, b) => b.edge - a.edge);
    const slots = L.slots.slice(0, order.length);
    order.forEach((p, k) => {
      const [sx, sy] = slots[k] || [L.tw / 2, L.th - L.slot / 2];
      const jx = (Math.random() - 0.5) * L.slot * 0.12, jy = (Math.random() - 0.5) * L.slot * 0.12;
      p.x = (sx + jx - L.fx) / L.scale - P.cw / 2;
      p.y = (sy + jy - L.fy) / L.scale - P.ch / 2;
    });
  }

  function makePieceEl(p) {
    const cv = document.createElement('canvas');
    cv.className = 'jg-piece';
    cv.setAttribute('aria-hidden', 'true');
    p.el = cv;
    table.appendChild(cv);
    paintPiece(p);
  }
  function paintPiece(p) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = L.scale * dpr;
    const w = (P.cw + 2 * P.pad), h = (P.ch + 2 * P.pad);
    const cv = p.el;
    cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
    cv.style.width = w * L.scale + 'px';
    cv.style.height = h * L.scale + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(P.pad - p.c * P.cw, P.pad - p.r * P.ch);
    ctx.save();
    ctx.clip(p.path);
    ctx.drawImage(P.img, 0, 0);
    // Prägung: Licht oben links, Schatten unten rechts
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.translate(2, 2); ctx.stroke(p.path);
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.translate(-4, -4); ctx.stroke(p.path);
    ctx.restore();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.stroke(p.path);
  }
  function position(p) {
    const [sx, sy] = toScreen(p.x - P.pad, p.y - P.pad);
    p.el.style.transform = `translate(${sx}px, ${sy}px)`;
  }
  function render() {
    for (const p of P.pieces) {
      position(p);
      p.el.classList.toggle('placed', p.placed);
      if (p.placed) p.el.style.zIndex = 1;
    }
  }

  /* ---------- Ziehen ---------- */
  const hitCtx = document.createElement('canvas').getContext('2d');
  function pieceAt(clientX, clientY) {
    const b = table.getBoundingClientRect();
    const ix = (clientX - b.left - L.fx) / L.scale, iy = (clientY - b.top - L.fy) / L.scale;
    const loose = P.pieces.filter((p) => !p.placed).sort((a, b2) => (+b2.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
    for (const p of loose) {
      const lx = ix - p.x + p.c * P.cw, ly = iy - p.y + p.r * P.ch;
      if (hitCtx.isPointInPath(p.path, lx, ly)) return p;
    }
    return null;
  }
  let drag = null;
  table.addEventListener('pointerdown', (e) => {
    if (!P || P.done) return;
    const p = pieceAt(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    try { table.setPointerCapture(e.pointerId); } catch {}
    startClock();
    p.el.style.zIndex = ++zTop;
    p.el.classList.add('lift');
    drag = { p, id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y };
  });
  table.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = drag.p;
    p.x = drag.x0 + (e.clientX - drag.sx) / L.scale;
    p.y = drag.y0 + (e.clientY - drag.sy) / L.scale;
    // in der Tischfläche bleiben
    const minX = -L.fx / L.scale - P.cw * 0.3, maxX = (L.tw - L.fx) / L.scale - P.cw * 0.7;
    const minY = -L.fy / L.scale - P.ch * 0.3, maxY = (L.th - L.fy) / L.scale - P.ch * 0.7;
    p.x = Math.max(minX, Math.min(maxX, p.x));
    p.y = Math.max(minY, Math.min(maxY, p.y));
    position(p);
    const near = Math.hypot(p.x - p.c * P.cw, p.y - p.r * P.ch) < Math.min(P.cw, P.ch) * 0.22;
    frame.classList.toggle('near', near);
  });
  function drop(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const p = drag.p;
    drag = null;
    frame.classList.remove('near');
    p.el.classList.remove('lift');
    P.moves++;
    const tx = p.c * P.cw, ty = p.r * P.ch;
    if (Math.hypot(p.x - tx, p.y - ty) < Math.min(P.cw, P.ch) * 0.22) {
      p.x = tx; p.y = ty; p.placed = true;
      p.el.classList.add('snap', 'placed');
      p.el.style.zIndex = 1;
      setTimeout(() => p.el.classList.remove('snap'), 500);
      position(p);
      vibrate(18);
      updateCount();
      if (P.pieces.every((q) => q.placed)) finish(true);
    }
    save();
  }
  table.addEventListener('pointerup', drop);
  table.addEventListener('pointercancel', drop);

  /* ---------- Uhr, Speichern ---------- */
  const elapsed = () => P.elapsed + (P.started ? Math.floor((Date.now() - P.started) / 1000) : 0);
  function tick() { $('jgTime').textContent = fmtTime(elapsed()); }
  function startClock() {
    if (P.started || P.done) return;
    P.started = Date.now();
    clearInterval(timer);
    timer = setInterval(() => { tick(); if (elapsed() % 5 === 0) save(); }, 1000);
  }
  function stopClock() {
    if (!P || !P.started) return;
    P.elapsed = elapsed();
    P.started = null;
    clearInterval(timer);
  }
  function save() {
    const data = { pos: P.pieces.map((p) => [Math.round(p.x), Math.round(p.y), p.placed ? 1 : 0]), elapsed: elapsed(), done: P.done, submitted: P.submitted, moves: P.moves };
    if (mode === 'daily') store.set('jig-day', { date: today, ...data });
    else store.set('jig-free', { size: freeSize, seed: store.get('jig-free-seed'), ...data });
  }
  function updateCount() {
    const n = P.pieces.filter((p) => p.placed).length;
    $('jgCount').textContent = `${n} / ${P.pieces.length}`;
    $('jgBar').style.width = (n / P.pieces.length) * 100 + '%';
  }

  /* ---------- Fertig ---------- */
  function finish(fresh) {
    P.done = true;
    stopClock();
    tick();
    save();
    const fin = $('jgFinal');
    fin.width = IW; fin.height = IH;
    fin.getContext('2d').drawImage(P.img, 0, 0);
    fin.hidden = false;
    frame.classList.add('done');
    if (fresh && !reduced()) frame.classList.add('shine');
    table.querySelectorAll('.jg-piece').forEach((e) => e.classList.add('gone'));
    $('jgTitle').textContent = P.title;
    $('jgDone').hidden = false;
    $('jgDone').innerHTML = `<b>Fertig in ${fmtTime(elapsed())}!</b>${mode === 'daily' ? ' Morgen gibt es ein neues Bild.' : ' <button id="jgAgain">Nächstes Bild</button>'}`;
    ['jgPeek', 'jgEdges', 'jgShuffle'].forEach((id) => ($(id).disabled = true));
    if ($('jgAgain')) $('jgAgain').onclick = () => newFree();
    // nach dem Fertigstellen braucht der Tisch keine Fläche mehr für lose Teile
    table.style.height = L.fh + L.fy + 20 + 'px';
    if (fresh) {
      if (mode === 'daily') recordStats(elapsed());
      if (window.VH) setTimeout(() => VH.confetti({ count: 120 }), 400);
      vibrate([30, 50, 80]);
    }
    renderSide();
  }
  function recordStats(t) {
    const st = store.get('jig-stats') || { played: 0, best: null, streak: 0, last: null };
    if (st.lastCounted === today) return;
    st.played++;
    st.best = st.best === null ? t : Math.min(st.best, t);
    st.streak = st.last && Daily.number(st.last, today) === 2 ? st.streak + 1 : 1;
    st.last = today;
    st.lastCounted = today;
    store.set('jig-stats', st);
  }

  /* ---------- Seitenleiste ---------- */
  function renderSide() {
    const side = $('side');
    if (mode !== 'daily') {
      side.innerHTML = `<div class="panel"><h2>🎲 Freies Puzzle</h2><p class="muted">Jedes Mal ein neues Bild, ohne Bestenliste. 12 Teile für zwischendurch, 54 für lange Abende.</p></div>`;
      return;
    }
    const st = store.get('jig-stats') || { played: 0, best: null, streak: 0 };
    side.innerHTML = `
      <div class="panel"><h2>🏆 Tagesbestenliste</h2><p class="muted st-date">${esc(Daily.longDate(today))}</p>
        <div id="jgForm"></div><div id="jgLb"><p class="muted">Lade …</p></div><a class="side-lb-link" href="/raetsel/bestenliste.html">🏆 Ewige Bestenliste</a></div>
      <div class="panel st-stats"><h2>📊 Deine Statistik</h2>
        <div class="nums"><div><b>${st.played}</b><span>gelöst</span></div><div><b>${st.best === null ? '–' : fmtTime(st.best)}</b><span>Bestzeit</span></div><div><b>${st.streak}</b><span>Serie</span></div></div>
        <p class="hint">Nur Tagespuzzle, gespeichert auf diesem Gerät.</p></div>`;
    Daily.board($('jgLb'), lbKey, fmtTime, P.submitted || null);
    if (P.done && !P.submitted) {
      const t = elapsed();
      $('jgForm').innerHTML = `<form class="hs-form"><p>Deine Zeit: <b>${fmtTime(t)}</b></p><div class="row"><input name="n" maxlength="16" required placeholder="Dein Name" value="${esc(store.name())}"><button>Eintragen</button></div><p class="error"></p></form>`;
      const form = $('jgForm').querySelector('form');
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
          $('jgForm').innerHTML = '';
          $('jgLb').innerHTML = Daily.table(entries, fmtTime, P.submitted);
        } catch (err) {
          form.querySelector('.error').textContent = err.message;
          form.querySelector('button').disabled = false;
        }
      };
    }
  }

  /* ---------- Steuerung ---------- */
  function setMode(m) {
    if (P && !P.done) save();
    mode = m;
    document.querySelectorAll('#jgModes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('jgSizes').hidden = m !== 'free';
    $('jgDone').hidden = true;
    if (m === 'daily') {
      const s = store.get('jig-day');
      build(s && s.date === today ? s : null);
    } else {
      const s = store.get('jig-free');
      if (!store.get('jig-free-seed')) store.set('jig-free-seed', Date.now());
      build(s && s.size === freeSize && s.seed === store.get('jig-free-seed') && !s.done ? s : null);
    }
  }
  function newFree() {
    store.set('jig-free-seed', Date.now());
    store.set('jig-free', null);
    $('jgDone').hidden = true;
    build(null);
  }
  document.querySelectorAll('#jgModes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll('#jgSizes button').forEach((b) => {
    b.classList.toggle('on', +b.dataset.size === freeSize);
    b.onclick = () => {
      freeSize = +b.dataset.size;
      store.set('jig-size', freeSize);
      document.querySelectorAll('#jgSizes button').forEach((x) => x.classList.toggle('on', x === b));
      newFree();
    };
  });
  $('jgPeek').onclick = () => {
    const on = frame.classList.toggle('peek');
    $('jgPeek').setAttribute('aria-pressed', String(on));
  };
  $('jgEdges').onclick = () => {
    if (P.done) return;
    scatter(true);
    for (const p of P.pieces) if (!p.placed) { p.el.classList.add('fly'); position(p); setTimeout(() => p.el.classList.remove('fly'), 600); }
    save();
  };
  $('jgShuffle').onclick = () => {
    if (P.done) return;
    scatter(false);
    for (const p of P.pieces) if (!p.placed) { p.el.classList.add('fly'); position(p); setTimeout(() => p.el.classList.remove('fly'), 600); }
    save();
  };
  // Bei anderer Fensterbreite neu anordnen und Teile schärfer zeichnen
  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (!P) return;
      const changed = layout(false);
      if (changed && !P.done) scatter(false);
      for (const p of P.pieces) paintPiece(p);
      render();
      if (P.done) table.style.height = L.fh + L.fy + 20 + 'px';
    }, 200);
  });
  document.addEventListener('visibilitychange', () => { if (P && document.visibilityState === 'hidden') save(); });

  setMode('daily');
})();
