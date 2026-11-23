/**
 * Sudoku: In jede Zeile, Spalte und jeden Block gehören die Ziffern 1 bis 9.
 *   Tagesrätsel – Stufe „Mittel“, für alle gleich, Tagesbestenliste nach Zeit
 *   Freies Spiel – Leicht, Mittel oder Schwer, Bestenliste je Stufe (sudoku1/2/3)
 * Fortschritt bleibt im Browser: Tagesrätsel unter „sudoku-day“, freies Spiel unter „sudoku-frei“.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, store } = Daily;
  const C = SudokuCore;
  const START = '2026-11-23';
  const today = Daily.today();
  const num = Daily.number(START, today);
  const lbKey = Daily.key('sudoku', today);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);

  let mode = params.get('modus') === 'frei' ? 'free' : 'daily';
  let level = +store.get('sudoku-level') || 2;
  let P = null; // { raetsel, loesung, werte, notizen, sel, elapsed, started, done, submitted, verlauf }
  let notizMode = false;
  let timer = null;

  /* ---------- Rätsel laden oder erzeugen ---------- */
  function laden(m, lv) {
    mode = m;
    stopClock();
    if (m === 'daily') {
      const { raetsel, loesung } = C.erzeugen(Daily.rng('sudoku-' + today), 2);
      const s = store.get('sudoku-day');
      P = s && s.date === today
        ? { raetsel, loesung, werte: s.werte, notizen: s.notizen, elapsed: s.elapsed, done: s.done, submitted: s.submitted }
        : { raetsel, loesung, werte: Array(81).fill(0), notizen: Array(81).fill(0), elapsed: 0, done: false };
    } else {
      level = lv || level;
      store.set('sudoku-level', level);
      const s = store.get('sudoku-frei');
      if (s && s.level === level && !s.done && !lv) P = { ...s };
      else {
        const { raetsel, loesung } = C.erzeugen(Math.random, level);
        P = { level, raetsel, loesung, werte: Array(81).fill(0), notizen: Array(81).fill(0), elapsed: 0, done: false };
      }
    }
    P.started = null;
    P.verlauf = [];
    P.sel = P.raetsel.findIndex((d) => !d);
    bauen();
    if (P.done) fertig(false);
    tick();
    save();
  }

  function save() {
    const data = { werte: P.werte, notizen: P.notizen, elapsed: elapsed(), done: P.done };
    if (mode === 'daily') store.set('sudoku-day', { date: today, ...data, submitted: P.submitted || null });
    else store.set('sudoku-frei', { level, raetsel: P.raetsel, loesung: P.loesung, ...data });
  }
  const elapsed = () => P.elapsed + (P.started ? Math.floor((Date.now() - P.started) / 1000) : 0);
  function tick() { $('sdTime').textContent = fmtTime(elapsed()); }
  function startClock() {
    if (P.started || P.done) return;
    P.started = Date.now();
    timer = setInterval(() => { tick(); if (elapsed() % 5 === 0) save(); }, 1000);
  }
  function stopClock() {
    if (!P || !P.started) return;
    P.elapsed = elapsed();
    P.started = null;
    clearInterval(timer);
  }

  /* ---------- Brett ---------- */
  const wert = (i) => P.raetsel[i] || P.werte[i];
  function bauen() {
    let html = '';
    for (let i = 0; i < 81; i++) {
      const r = C.zeile(i), c = C.spalte(i);
      const kanten = (c % 3 === 2 && c < 8 ? ' kr' : '') + (r % 3 === 2 && r < 8 ? ' ku' : '');
      html += `<button type="button" class="sd-zelle${kanten}" data-i="${i}" role="gridcell"></button>`;
    }
    $('sdBoard').innerHTML = html;
    $('sdPad').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-d="${d}"><b>${d}</b><small></small></button>`).join('');
    document.querySelectorAll('#sdModes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('sdLevels').hidden = mode !== 'free';
    document.querySelectorAll('#sdLevels [data-level]').forEach((b) => b.classList.toggle('on', +b.dataset.level === level));
    $('sdNum').textContent = mode === 'daily' ? `#${num}` : C.STUFEN[level].name;
    $('sdDone').hidden = true;
    $('sdBoard').classList.remove('geloest', 'still');
    malen();
    seite();
  }

  function konflikt(i) {
    const d = wert(i);
    return d && C.NACHBARN[i].some((j) => wert(j) === d);
  }

  function malen() {
    const sel = P.sel, sd = sel >= 0 ? wert(sel) : 0;
    const zaehler = Array(10).fill(0);
    for (let i = 0; i < 81; i++) zaehler[wert(i)]++;
    document.querySelectorAll('#sdBoard .sd-zelle').forEach((b) => {
      const i = +b.dataset.i, d = wert(i), vorgabe = !!P.raetsel[i];
      b.classList.toggle('vorgabe', vorgabe);
      b.classList.toggle('wahl', i === sel);
      b.classList.toggle('bereich', sel >= 0 && i !== sel && (C.zeile(i) === C.zeile(sel) || C.spalte(i) === C.spalte(sel) || C.block(i) === C.block(sel)));
      b.classList.toggle('gleich', !!sd && d === sd && i !== sel);
      b.classList.toggle('fehler', !vorgabe && konflikt(i));
      if (d) b.innerHTML = `<span class="sd-ziffer">${d}</span>`;
      else if (P.notizen[i]) b.innerHTML = `<span class="sd-notizen">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<i>${P.notizen[i] & (1 << n) ? n : ''}</i>`).join('')}</span>`;
      else b.innerHTML = '';
      b.setAttribute('aria-label', `Zeile ${C.zeile(i) + 1}, Spalte ${C.spalte(i) + 1}: ${d ? d + (vorgabe ? ' (vorgegeben)' : '') : 'leer'}`);
      b.setAttribute('aria-selected', String(i === sel));
      b.tabIndex = i === sel || (sel < 0 && i === 0) ? 0 : -1;
    });
    document.querySelectorAll('#sdPad [data-d]').forEach((b) => {
      const d = +b.dataset.d, rest = 9 - zaehler[d];
      b.querySelector('small').textContent = rest > 0 ? rest : '';
      b.classList.toggle('voll', rest <= 0);
      b.disabled = P.done;
    });
    $('sdNotes').setAttribute('aria-pressed', String(notizMode));
    $('sdNotes').classList.toggle('on', notizMode);
    ['sdNotes', 'sdErase', 'sdUndo'].forEach((id) => ($(id).disabled = P.done));
    $('sdUndo').disabled = P.done || !P.verlauf.length;
  }

  /* ---------- Eingaben ---------- */
  function merken() {
    P.verlauf.push({ werte: P.werte.slice(), notizen: P.notizen.slice() });
    if (P.verlauf.length > 200) P.verlauf.shift();
  }
  function setzen(d) {
    const i = P.sel;
    if (P.done || i < 0 || P.raetsel[i]) return;
    startClock();
    merken();
    if (notizMode && !P.werte[i]) {
      P.notizen[i] ^= 1 << d;
    } else {
      P.werte[i] = P.werte[i] === d ? 0 : d;
      if (P.werte[i]) {
        P.notizen[i] = 0;
        for (const j of C.NACHBARN[i]) P.notizen[j] &= ~(1 << d); // passende Notizen der Nachbarn wegräumen
      }
    }
    malen();
    const b = document.querySelector(`#sdBoard [data-i="${i}"]`);
    if (b && P.werte[i]) { b.classList.remove('neu'); void b.offsetWidth; b.classList.add('neu'); }
    save();
    if (P.werte.every((v, k) => (P.raetsel[k] || v) === P.loesung[k])) fertig(true);
  }
  function loeschen() {
    const i = P.sel;
    if (P.done || i < 0 || P.raetsel[i] || (!P.werte[i] && !P.notizen[i])) return;
    merken();
    P.werte[i] = 0;
    P.notizen[i] = 0;
    malen();
    save();
  }
  function zurueck() {
    if (P.done || !P.verlauf.length) return;
    const v = P.verlauf.pop();
    P.werte = v.werte;
    P.notizen = v.notizen;
    malen();
    save();
  }
  function waehlen(i) {
    P.sel = i;
    malen();
    document.querySelector(`#sdBoard [data-i="${i}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- Gelöst ---------- */
  function fertig(frisch) {
    stopClock();
    P.done = true;
    P.sel = -1;
    malen();
    tick();
    save();
    const t = elapsed();
    $('sdDone').hidden = false;
    $('sdDone').innerHTML = `<b>Gelöst in ${fmtTime(t)}!</b>${mode === 'daily' ? '' : ' <button id="sdAgain">Nächstes Sudoku</button>'}`;
    if ($('sdAgain')) $('sdAgain').onclick = () => laden('free', level);
    const board = $('sdBoard');
    if (frisch && !reduced()) {
      board.querySelectorAll('.sd-zelle').forEach((b) => {
        const i = +b.dataset.i;
        b.style.animationDelay = (C.zeile(i) + C.spalte(i)) * 30 + 'ms';
      });
      board.classList.add('geloest');
      if (mode === 'daily') statistik(t);
      if (window.VH) setTimeout(() => VH.confetti(), 500);
    } else {
      board.classList.add('geloest', 'still');
      if (frisch && mode === 'daily') statistik(t);
    }
    seite();
  }

  function statistik(t) {
    const st = store.get('sudoku-stats') || { played: 0, best: null, streak: 0, last: null };
    if (st.lastCounted === today) return;
    st.played++;
    st.best = st.best === null ? t : Math.min(st.best, t);
    st.streak = st.last && Daily.number(st.last, today) === 2 ? st.streak + 1 : 1;
    st.last = today;
    st.lastCounted = today;
    store.set('sudoku-stats', st);
  }

  /* ---------- Seitenleiste: Bestenliste ---------- */
  function seite() {
    const side = $('side');
    const key = mode === 'daily' ? lbKey : 'sudoku' + level;
    if (mode === 'daily') {
      const st = store.get('sudoku-stats') || { played: 0, best: null, streak: 0 };
      side.innerHTML = `
        <div class="panel"><h2>Tagesbestenliste</h2><p class="muted st-date">${esc(Daily.longDate(today))}</p>
          <div id="sdForm"></div><div id="sdLb"><p class="muted">Lade …</p></div><a class="side-lb-link" href="/raetsel/bestenliste.html">Ewige Bestenliste</a></div>
        <div class="panel st-stats"><h2>Deine Statistik</h2>
          <div class="nums"><div><b>${st.played}</b><span>gelöst</span></div><div><b>${st.best === null ? '–' : fmtTime(st.best)}</b><span>Bestzeit</span></div><div><b>${st.streak}</b><span>Serie</span></div></div>
          <p class="hint">Nur Tagesrätsel, gespeichert auf diesem Gerät.</p></div>`;
    } else {
      side.innerHTML = `
        <div class="panel"><h2>Bestenliste ${esc(C.STUFEN[level].name)}</h2><p class="muted st-date">Schnellste Zeiten im freien Spiel</p>
          <div id="sdForm"></div><div id="sdLb"><p class="muted">Lade …</p></div></div>
        <div class="panel"><p class="muted" style="margin:0">Jedes Mal ein neues Rätsel mit genau einer Lösung. Leicht hat ${C.STUFEN[1].vorgaben}, Schwer nur etwa ${C.STUFEN[3].vorgaben} vorgegebene Ziffern.</p>
          <p style="margin:.7rem 0 0"><button class="ghost" id="sdNew">Neues Rätsel</button></p></div>`;
      $('sdNew').onclick = () => laden('free', level);
    }
    Daily.board($('sdLb'), key, fmtTime, P.submitted || null);
    if (P.done && !P.submitted) {
      const t = elapsed();
      $('sdForm').innerHTML = `<form class="hs-form"><p>Deine Zeit: <b>${fmtTime(t)}</b></p><div class="row"><input name="n" maxlength="16" required placeholder="Dein Name" value="${esc(store.name())}"><button>Eintragen</button></div><p class="error"></p></form>`;
      const form = $('sdForm').querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.elements.n.value.trim();
        if (!name) return;
        store.setName(name);
        form.querySelector('button').disabled = true;
        try {
          const entries = await Daily.submit(key, name, t);
          P.submitted = { name, score: t };
          if (mode === 'daily') save();
          $('sdForm').innerHTML = '';
          $('sdLb').innerHTML = Daily.table(entries, fmtTime, P.submitted);
        } catch (err) {
          form.querySelector('.error').textContent = err.message;
          form.querySelector('button').disabled = false;
        }
      };
    }
  }

  /* ---------- Bedienung ---------- */
  $('sdBoard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b && !P.done) waehlen(+b.dataset.i);
  });
  $('sdPad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (b) setzen(+b.dataset.d);
  });
  $('sdNotes').onclick = () => { notizMode = !notizMode; malen(); };
  $('sdErase').onclick = loeschen;
  $('sdUndo').onclick = zurueck;
  document.addEventListener('keydown', (e) => {
    if (typeof typingIn === 'function' ? typingIn(e) : /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (P.done) return;
    if (e.key >= '1' && e.key <= '9') { setzen(+e.key); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); loeschen(); return; }
    if (e.key === 'n' || e.key === 'N') { notizMode = !notizMode; malen(); return; }
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zurueck(); return; }
    const pfeile = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (pfeile[e.key] != null) {
      e.preventDefault();
      const i = P.sel < 0 ? 0 : P.sel;
      const r = C.zeile(i), c = C.spalte(i);
      const nr = (r + (e.key === 'ArrowUp' ? 8 : e.key === 'ArrowDown' ? 1 : 0)) % 9;
      const nc = (c + (e.key === 'ArrowLeft' ? 8 : e.key === 'ArrowRight' ? 1 : 0)) % 9;
      waehlen(nr * 9 + nc);
    }
  });
  document.querySelectorAll('#sdModes [data-mode]').forEach((b) => (b.onclick = () => laden(b.dataset.mode, b.dataset.mode === 'free' ? null : 2)));
  document.querySelectorAll('#sdLevels [data-level]').forEach((b) => (b.onclick = () => laden('free', +b.dataset.level)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && P && P.started) { stopClock(); save(); }
  });
  laden(mode, mode === 'free' ? null : 2);
})();
