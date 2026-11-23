// Patience (Klondike, eine Karte ziehen). Karten liegen als feste Elemente auf
// dem Tisch und gleiten an ihren neuen Platz. Antippen legt eine Karte dorthin,
// wo sie passt; Ziehen mit Maus oder Finger geht auch.
// Bestenliste: Sekunden bis alle Karten abgelegt sind (weniger ist besser).
(() => {
  'use strict';
  const { patience: R } = SoloRegeln;
  const $ = (id) => document.getElementById(id);
  const board = $('board');
  const zeit = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const hs = Scores.panel($('scores'), 'patience', { title: 'Bestenliste (schnellste Zeit)', fmt: zeit });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const WERT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
  const WERT_LANG = ['Ass', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Bube', 'Dame', 'König'];
  const FARBE = ['Pik', 'Herz', 'Karo', 'Kreuz'];
  const SYM = [
    'M12 2C9 7 4 9.5 4 14a4 4 0 0 0 7 2.6V19l-2 3h6l-2-3v-2.4A4 4 0 0 0 20 14c0-4.5-5-7-8-12z',
    'M12 21C5 15.5 2.5 12 2.5 8.5A5 5 0 0 1 12 6a5 5 0 0 1 9.5 2.5C21.5 12 19 15.5 12 21z',
    'M12 2l8 10-8 10-8-10z',
    'M12 2.5a4.2 4.2 0 0 1 3.9 5.8A4.2 4.2 0 1 1 13.5 16v2.5l2 3.5h-7l2-3.5V16a4.2 4.2 0 1 1-2.4-7.7A4.2 4.2 0 0 1 12 2.5z',
  ];
  const sym = (f, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SYM[f]}"/></svg>`;

  let S, verlauf, zuege, start, uhr, vorbei, pos, autoTimer;
  const els = new Map();

  /* ---------- Karten-Elemente ---------- */
  function karteEl(id) {
    if (els.has(id)) return els.get(id);
    const k = R.karte(id);
    const el = document.createElement('div');
    el.className = `pa-karte${k.rot ? ' rot' : ''}`;
    el.dataset.id = id;
    const mitte = k.wert > 10 ? `<span class="pa-bild">${WERT[k.wert - 1]}</span>${sym(k.farbe, 'pa-bild-sym')}` : sym(k.farbe, 'pa-gross');
    el.innerHTML = `<div class="pa-dreh"><div class="pa-vorne"><span class="pa-ecke"><b>${WERT[k.wert - 1]}</b>${sym(k.farbe)}</span>${mitte}<span class="pa-ecke unten"><b>${WERT[k.wert - 1]}</b>${sym(k.farbe)}</span></div><div class="pa-hinten"></div></div>`;
    els.set(id, el);
    board.appendChild(el);
    return el;
  }
  const PLAETZE = ['stapel', 'ablage', 'ziel0', 'ziel1', 'ziel2', 'ziel3', 'reihe0', 'reihe1', 'reihe2', 'reihe3', 'reihe4', 'reihe5', 'reihe6'];
  function plaetzeBauen() {
    board.querySelectorAll('.pa-platz').forEach((p) => p.remove());
    for (const p of PLAETZE) {
      const el = document.createElement('div');
      el.className = `pa-platz ${p.replace(/\d/, '')}`;
      el.dataset.platz = p;
      if (p.startsWith('ziel')) el.innerHTML = '<span>A</span>';
      if (p === 'stapel') { el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', 'Stapel neu auflegen'); }
      board.prepend(el);
    }
  }

  /* ---------- Wo liegt welche Karte? ---------- */
  function finde(id) {
    let i = S.stapel.indexOf(id);
    if (i >= 0) return { typ: 'stapel', pos: i };
    i = S.ablage.indexOf(id);
    if (i >= 0) return { typ: 'ablage', pos: i };
    for (let z = 0; z < 4; z++) { i = S.ziel[z].indexOf(id); if (i >= 0) return { typ: 'ziel', i: z, pos: i }; }
    for (let r = 0; r < 7; r++) { i = S.reihen[r].findIndex((x) => x.id === id); if (i >= 0) return { typ: 'reihe', i: r, pos: i }; }
    return null;
  }
  // Karten, die zusammen bewegt werden (eine offene Folge oder die oberste Karte)
  function gruppe(q) {
    if (q.typ === 'reihe') return R.folgeOk(S.reihen[q.i], q.pos) ? S.reihen[q.i].slice(q.pos).map((x) => x.id) : null;
    if (q.typ === 'ablage') return q.pos === S.ablage.length - 1 ? [S.ablage[q.pos]] : null;
    if (q.typ === 'ziel') return q.pos === S.ziel[q.i].length - 1 ? [S.ziel[q.i][q.pos]] : null;
    return null;
  }

  /* ---------- Anordnung ---------- */
  function masse() {
    const W = board.clientWidth;
    const gap = Math.max(5, Math.round(W * 0.018));
    const cw = Math.floor((W - 6 * gap) / 7);
    const ch = Math.round(cw * 1.42);
    return { gap, cw, ch, x: (i) => i * (cw + gap), yReihen: ch + gap * 2, zu: Math.round(ch * 0.12), offen: Math.round(ch * 0.26) };
  }
  function anordnen() {
    const m = masse();
    board.style.setProperty('--cw', m.cw + 'px');
    board.style.setProperty('--ch', m.ch + 'px');
    pos = new Map();
    const setze = (id, x, y, z) => pos.set(id, { x, y, z });
    S.stapel.forEach((id, k) => setze(id, m.x(0), 0, 10 + k));
    S.ablage.forEach((id, k) => setze(id, m.x(1), 0, 10 + k));
    S.ziel.forEach((st, z) => st.forEach((id, k) => setze(id, m.x(3 + z), 0, 10 + k)));
    let hoehe = m.yReihen + m.ch;
    S.reihen.forEach((reihe, r) => {
      let y = m.yReihen;
      reihe.forEach((x, k) => { setze(x.id, m.x(r), y, 100 + k); if (k < reihe.length - 1) y += x.offen ? m.offen : m.zu; });
      hoehe = Math.max(hoehe, y + m.ch);
    });
    board.style.height = hoehe + 'px';
    // Plätze (leere Felder)
    board.querySelectorAll('.pa-platz').forEach((p) => {
      const n = p.dataset.platz;
      const x = n === 'stapel' ? m.x(0) : n === 'ablage' ? m.x(1) : n.startsWith('ziel') ? m.x(3 + +n.slice(4)) : m.x(+n.slice(5));
      const y = n.startsWith('reihe') ? m.yReihen : 0;
      p.style.transform = `translate(${x}px, ${y}px)`;
      p.classList.toggle('leer-stapel', n === 'stapel' && !S.stapel.length && S.ablage.length > 0);
    });
    // Karten
    for (const [id, p] of pos) {
      const el = karteEl(id);
      const q = finde(id);
      const offen = q.typ === 'reihe' ? S.reihen[q.i][q.pos].offen : q.typ !== 'stapel';
      el.classList.toggle('zu', !offen);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.style.zIndex = p.z;
      const g = gruppe(q);
      const beweglich = (offen && g) || (q.typ === 'stapel' && q.pos === S.stapel.length - 1);
      el.tabIndex = beweglich ? 0 : -1;
      el.setAttribute('role', beweglich ? 'button' : 'img');
      el.setAttribute('aria-label', offen ? `${FARBE[R.karte(id).farbe]} ${WERT_LANG[R.karte(id).wert - 1]}` : q.typ === 'stapel' ? 'Stapel: Karte ziehen' : 'verdeckte Karte');
    }
    $('moves').textContent = zuege;
    $('undo').disabled = !verlauf.length || vorbei;
  }

  /* ---------- Züge ---------- */
  function merken() {
    verlauf.push(JSON.stringify({ S, zuege }));
    if (verlauf.length > 300) verlauf.shift();
    if (!start) { start = Date.now(); uhr = setInterval(tick, 500); }
  }
  function sekunden() { return start ? Math.floor((Date.now() - start) / 1000) : 0; }
  function tick() { $('time').textContent = zeit(sekunden()); }

  function ziehen() {
    if (vorbei) return;
    if (!S.stapel.length && !S.ablage.length) return;
    merken();
    if (S.stapel.length) S.ablage.push(S.stapel.pop());
    else { S.stapel = S.ablage.reverse(); S.ablage = []; }
    zuege++;
    nachZug();
  }

  function verschieben(q, ziel) {
    const ids = gruppe(q);
    if (!ids) return false;
    if (ziel.typ === 'ziel') {
      if (ids.length !== 1 || (q.typ === 'ziel' && q.i === ziel.i) || !R.passtAufZiel(ids[0], S.ziel[ziel.i])) return false;
    } else {
      if (q.typ === 'reihe' && q.i === ziel.i) return false;
      const r = S.reihen[ziel.i];
      if (!R.passtAufReihe(ids[0], r.length ? r[r.length - 1].id : null)) return false;
    }
    merken();
    if (q.typ === 'reihe') {
      S.reihen[q.i].splice(q.pos);
      const oben = S.reihen[q.i][S.reihen[q.i].length - 1];
      if (oben && !oben.offen) oben.offen = true;
    } else if (q.typ === 'ablage') S.ablage.pop();
    else S.ziel[q.i].pop();
    if (ziel.typ === 'ziel') S.ziel[ziel.i].push(ids[0]);
    else S.reihen[ziel.i].push(...ids.map((id) => ({ id, offen: true })));
    zuege++;
    nachZug();
    return true;
  }

  // Antippen: zuerst auf einen Zielstapel, sonst auf die erste passende Reihe
  function automatisch(q) {
    const ids = gruppe(q);
    if (!ids) return false;
    if (ids.length === 1 && q.typ !== 'ziel') {
      for (let z = 0; z < 4; z++) if (R.passtAufZiel(ids[0], S.ziel[z])) return verschieben(q, { typ: 'ziel', i: z });
    }
    const reihen = [...Array(7).keys()].filter((r) => !(q.typ === 'reihe' && q.i === r));
    for (const r of reihen) if (S.reihen[r].length && verschieben(q, { typ: 'reihe', i: r })) return true;
    if (!(q.typ === 'reihe' && q.pos === 0)) for (const r of reihen) if (!S.reihen[r].length && verschieben(q, { typ: 'reihe', i: r })) return true;
    return false;
  }

  function nachZug() {
    anordnen();
    if (R.gewonnen(S)) return gewonnen();
    if (R.fertigLegbar(S) && !autoTimer) autoTimer = setTimeout(selbstAblegen, reduced() ? 0 : 260);
  }

  // Alles offen, Stapel leer: der Rest fliegt von allein auf die Zielstapel
  function selbstAblegen() {
    autoTimer = null;
    if (vorbei) return;
    let best = null;
    S.reihen.forEach((r, i) => {
      if (!r.length) return;
      const id = r[r.length - 1].id;
      for (let z = 0; z < 4; z++) if (R.passtAufZiel(id, S.ziel[z]) && (!best || R.karte(id).wert < R.karte(best.id).wert)) best = { id, i, z };
    });
    if (!best) return;
    verschieben({ typ: 'reihe', i: best.i, pos: S.reihen[best.i].length - 1 }, { typ: 'ziel', i: best.z });
  }

  function gewonnen() {
    vorbei = true;
    clearInterval(uhr);
    tick();
    const s = sekunden();
    $('ovText').textContent = `Geschafft in ${zeit(s)} mit ${zuege} Zügen!`;
    $('undo').disabled = true;
    setTimeout(() => {
      $('overlay').hidden = false;
      if (window.VH) VH.confetti();
      hs.offer(s);
    }, reduced() ? 0 : 500);
  }

  function wackeln(el) {
    if (!el || reduced()) return;
    const p = pos.get(+el.dataset.id);
    el.animate([0, -6, 6, -4, 0].map((dx) => ({ transform: `translate(${p.x + dx}px, ${p.y}px)` })), { duration: 280 });
  }

  /* ---------- Ziehen mit Maus und Finger ---------- */
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    if (vorbei || e.button > 0) return;
    const el = e.target.closest('.pa-karte');
    if (!el) {
      const p = e.target.closest('.pa-platz');
      if (p && p.dataset.platz === 'stapel') ziehen();
      return;
    }
    const id = +el.dataset.id;
    const q = finde(id);
    if (q.typ === 'stapel') { ziehen(); return; }
    const ids = gruppe(q);
    if (!ids) return;
    drag = { q, ids, sx: e.clientX, sy: e.clientY, moved: false, el };
    el.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.ids.forEach((id, k) => {
      const el = els.get(id), p = pos.get(id);
      el.classList.add('zieht');
      el.style.zIndex = 1000 + k;
      el.style.transform = `translate(${p.x + dx}px, ${p.y + dy}px)`;
    });
  });
  function treffer(cx, cy) {
    const m = masse(), r = board.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const spalte = Math.max(0, Math.min(6, Math.floor((x + m.gap / 2) / (m.cw + m.gap))));
    if (y < m.yReihen - m.gap) return spalte >= 3 ? { typ: 'ziel', i: spalte - 3 } : null;
    return { typ: 'reihe', i: spalte };
  }
  board.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ids.forEach((id) => els.get(id).classList.remove('zieht'));
    if (d.moved) {
      // Ziel nach der Mitte der obersten gezogenen Karte, nicht nach dem Finger
      const r = els.get(d.ids[0]).getBoundingClientRect();
      const ziel = treffer(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
      if (!ziel || !verschieben(d.q, ziel)) anordnen();
    } else if (!automatisch(d.q)) wackeln(d.el);
  });
  board.addEventListener('pointercancel', () => { if (drag) { drag.ids.forEach((id) => els.get(id).classList.remove('zieht')); drag = null; anordnen(); } });
  board.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.pa-karte, .pa-platz');
    if (!el) return;
    e.preventDefault();
    if (el.classList.contains('pa-platz')) { if (el.dataset.platz === 'stapel') ziehen(); return; }
    const q = finde(+el.dataset.id);
    if (q.typ === 'stapel') ziehen();
    else if (!automatisch(q)) wackeln(el);
    requestAnimationFrame(() => (els.get(+el.dataset.id) || el).focus());
  });

  /* ---------- Start ---------- */
  function neu() {
    clearInterval(uhr);
    clearTimeout(autoTimer);
    autoTimer = null;
    S = R.geben();
    verlauf = [];
    zuege = 0;
    start = null;
    vorbei = false;
    $('overlay').hidden = true;
    hs.hide();
    tick();
    // Austeilen: alle Karten starten auf dem Stapel und gleiten an ihren Platz
    board.classList.add('ohne-gleiten');
    els.forEach((el) => el.remove());
    els.clear();
    plaetzeBauen();
    const m = masse();
    [...Array(52).keys()].forEach((id) => { const el = karteEl(id); el.classList.add('zu'); el.style.transform = `translate(${m.x(0)}px, 0)`; });
    void board.offsetWidth;
    board.classList.remove('ohne-gleiten');
    anordnen();
    if (!reduced()) {
      let k = 0;
      S.reihen.forEach((r) => r.forEach((x) => { els.get(x.id).style.transitionDelay = `${(k++) * 22}ms`; }));
      setTimeout(() => els.forEach((el) => (el.style.transitionDelay = '')), 1200);
    }
  }
  $('undo').onclick = () => {
    if (!verlauf.length || vorbei) return;
    clearTimeout(autoTimer);
    autoTimer = null;
    const v = JSON.parse(verlauf.pop());
    S = v.S;
    zuege = v.zuege;
    anordnen();
  };
  $('newGame').onclick = neu;
  $('ovBtn').onclick = neu;
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { board.classList.add('ohne-gleiten'); anordnen(); requestAnimationFrame(() => board.classList.remove('ohne-gleiten')); }); });
  document.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('undo').click(); }
  });
  neu();
})();
