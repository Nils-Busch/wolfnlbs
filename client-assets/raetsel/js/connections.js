/**
 * Connections: 16 Begriffe, vier versteckte Gruppen zu je vier.
 * Vier auswählen, prüfen. Vier Fehler sind erlaubt.
 *   Tagesrätsel – für alle gleich, Bestenliste (wenigste Fehler, dann Zeit)
 *   Freies Spiel – neue Mischung aus dem Gruppen-Pool
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, store } = Daily;
  const START = '2026-10-29';
  const MAX_MISTAKES = 4;
  const COLORS = { 1: 'y', 2: 'g', 3: 'b', 4: 'p' };
  const SQUARE = { 1: '🟨', 2: '🟩', 3: '🟦', 4: '🟪' };
  const today = Daily.today();
  const num = Daily.number(START, today);
  const lbKey = Daily.key('conn', today);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Rätsel bauen ---------- */
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pick(rand) {
    const used = new Set(), tags = new Set();
    const groups = [];
    for (const l of [1, 2, 3, 4]) {
      const pool = shuffle(window.CONN_GROUPS.filter((g) => g.l === l), rand);
      const g = pool.find((x) => !tags.has(x.tag) && x.words.every((w) => !used.has(w))) || pool[0];
      tags.add(g.tag);
      g.words.forEach((w) => used.add(w));
      groups.push(g);
    }
    return { groups, order: shuffle(groups.flatMap((g) => g.words), rand) };
  }

  /* ---------- Zustand ---------- */
  let mode = 'daily';
  let P = null; // { groups, order, solved:[idx], mistakes, guesses:[[levels]], sel:Set, started, elapsed, over, won, submitted }
  let timer = null;

  function newPuzzle(m) {
    mode = m;
    clearInterval(timer);
    const rand = m === 'daily' ? Daily.rng('conn-' + today) : Math.random;
    const { groups, order } = pick(rand);
    P = { groups, order, solved: [], mistakes: 0, guesses: [], sel: new Set(), started: null, elapsed: 0, over: false, won: false };
    if (m === 'daily') {
      const saved = store.get('conn-day');
      if (saved && saved.date === today) Object.assign(P, { ...saved, sel: new Set(), started: null });
    }
    render();
    if (P.over) showEnd(false);
  }

  const elapsed = () => P.elapsed + (P.started ? Math.floor((Date.now() - P.started) / 1000) : 0);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function startClock() {
    if (P.started || P.over) return;
    P.started = Date.now();
    timer = setInterval(() => ($('cnTime').textContent = fmtTime(elapsed())), 1000);
  }
  function stopClock() {
    if (!P.started) return;
    P.elapsed = elapsed();
    P.started = null;
    clearInterval(timer);
  }
  function save() {
    if (mode !== 'daily') return;
    const { groups, order, sel, started, ...rest } = P;
    store.set('conn-day', { ...rest, order, elapsed: elapsed(), date: today });
  }

  /* ---------- Anzeige ---------- */
  function render() {
    document.querySelectorAll('#cnModes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('cnNum').textContent = mode === 'daily' ? `#${num}` : '';
    $('cnTime').textContent = fmtTime(elapsed());

    const solvedHtml = P.solved.map((gi) => {
      const g = P.groups[gi];
      return `<div class="cn-row ${COLORS[g.l]}"><b>${esc(g.title)}</b><span>${g.words.map(esc).join(', ')}</span></div>`;
    }).join('');
    const solvedWords = new Set(P.solved.flatMap((gi) => P.groups[gi].words));
    const rest = P.order.filter((w) => !solvedWords.has(w));
    $('cnSolved').innerHTML = solvedHtml;
    $('cnGrid').innerHTML = rest.map((w, i) => `<button class="cn-tile ${P.sel.has(w) ? 'sel' : ''} ${w.length > 10 ? 'long' : ''} ${w.length > 13 ? 'xlong' : ''}" data-w="${esc(w)}" style="animation-delay:${i * 0.025}s" ${P.over ? 'disabled' : ''}>${esc(w)}</button>`).join('');
    $('cnMistakes').innerHTML = Array.from({ length: MAX_MISTAKES }, (_, i) => `<i class="${i < MAX_MISTAKES - P.mistakes ? '' : 'gone'}"></i>`).join('');
    $('cnSubmit').disabled = P.sel.size !== 4 || P.over;
    $('cnClear').disabled = P.sel.size === 0 || P.over;
    $('cnShuffle').disabled = P.over;
    $('cnControls').hidden = P.over;
  }

  function msg(text, ms = 1600) {
    const el = $('cnMsg');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(msg.t);
    msg.t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function toggle(w) {
    if (P.over) return;
    startClock();
    if (P.sel.has(w)) P.sel.delete(w);
    else if (P.sel.size < 4) P.sel.add(w);
    const btn = document.querySelector(`.cn-tile[data-w="${CSS.escape(w)}"]`);
    if (btn) btn.classList.toggle('sel', P.sel.has(w));
    $('cnSubmit').disabled = P.sel.size !== 4;
    $('cnClear').disabled = P.sel.size === 0;
  }

  function check() {
    if (P.sel.size !== 4 || P.over) return;
    const sel = [...P.sel];
    const levels = sel.map((w) => P.groups.find((g) => g.words.includes(w)).l);
    const key = sel.slice().sort().join('|');
    if (P.guesses.some((g) => g.key === key)) return msg('Schon probiert!');
    P.guesses.push({ key, levels });
    const gi = P.groups.findIndex((g) => g.words.every((w) => P.sel.has(w)));
    const tiles = sel.map((w) => document.querySelector(`.cn-tile[data-w="${CSS.escape(w)}"]`)).filter(Boolean);

    if (gi >= 0) {
      // richtig: Kacheln hüpfen nacheinander, dann wird die Reihe aufgedeckt
      tiles.forEach((t, i) => { t.style.animationDelay = `${i * 0.09}s`; t.classList.add('jump'); });
      setTimeout(() => {
        P.solved.push(gi);
        P.sel.clear();
        if (P.solved.length === 4) finish(true);
        save();
        render();
        const rows = document.querySelectorAll('.cn-row');
        rows[rows.length - 1]?.classList.add('fresh');
      }, reduced() ? 0 : 650);
      return;
    }

    // falsch
    P.mistakes++;
    const counts = {};
    levels.forEach((l) => (counts[l] = (counts[l] || 0) + 1));
    tiles.forEach((t) => { t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); });
    msg(Object.values(counts).includes(3) ? 'Eins daneben!' : P.mistakes >= MAX_MISTAKES ? 'Keine Versuche mehr' : 'Leider nicht');
    const dots = document.querySelectorAll('#cnMistakes i:not(.gone)');
    if (dots.length) dots[dots.length - 1].classList.add('gone');
    if (P.mistakes >= MAX_MISTAKES) {
      setTimeout(() => {
        // Lösung zeigen
        P.groups.forEach((g, i) => { if (!P.solved.includes(i)) P.solved.push(i); });
        P.sel.clear();
        finish(false);
        save();
        render();
      }, 900);
    }
    save();
  }

  function finish(won) {
    P.over = true;
    P.won = won;
    stopClock();
    if (mode === 'daily') recordStats();
    showEnd(true);
  }

  function recordStats() {
    const st = store.get('conn-stats') || { played: 0, won: 0, perfect: 0, streak: 0, last: null };
    if (st.lastCounted === today) return;
    st.played++;
    if (P.won) {
      st.won++;
      if (!P.mistakes) st.perfect++;
      st.streak = st.last && Daily.number(st.last, today) === 2 ? st.streak + 1 : 1;
      st.last = today;
    } else st.streak = 0;
    st.lastCounted = today;
    store.set('conn-stats', st);
  }

  function shareText() {
    const head = mode === 'daily' ? `Connections #${num}` : 'Connections';
    return `${head}\n${P.guesses.map((g) => g.levels.map((l) => SQUARE[l]).join('')).join('\n')}\n${location.origin}/raetsel/connections.html`;
  }

  function showEnd(fresh) {
    const end = $('cnEnd');
    end.hidden = false;
    const t = elapsed();
    end.innerHTML = `
      <p class="big">${P.won ? (P.mistakes === 0 ? 'Perfekt!' : P.mistakes === 1 ? 'Stark!' : 'Geschafft!') : 'Diesmal nicht.'}</p>
      <p class="muted">${P.won ? `${P.mistakes} Fehler, ${fmtTime(t)}` : 'So hätten die Gruppen ausgesehen.'}</p>
      <div class="cn-share">${P.guesses.map((g) => `<span>${g.levels.map((l) => SQUARE[l]).join('')}</span>`).join('')}</div>
      <div class="row"><button id="cnCopy" class="ghost">Ergebnis kopieren</button>${mode === 'daily' ? '' : '<button id="cnAgain">Neues Rätsel</button>'}</div>`;
    $('cnCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(shareText()); $('cnCopy').textContent = 'Kopiert ✓'; } catch { $('cnCopy').textContent = 'Kopieren nicht möglich'; }
    };
    if ($('cnAgain')) $('cnAgain').onclick = () => { $('cnEnd').hidden = true; newPuzzle('free'); };
    if (fresh && P.won && window.VH) setTimeout(() => VH.confetti(), 400);
    renderSide();
  }

  /* ---------- Seitenleiste ---------- */
  const fmtScore = (raw) => `${Math.floor(raw / 10000)} Fehler, ${fmtTime(raw % 10000)}`;
  function renderSide() {
    const side = $('side');
    if (mode !== 'daily') {
      side.innerHTML = '<div class="panel"><h2>🎲 Freies Spiel</h2><p class="muted">Neue Mischung aus dem Gruppen-Pool, ohne Bestenliste.</p></div>';
      return;
    }
    const st = store.get('conn-stats') || { played: 0, won: 0, perfect: 0, streak: 0 };
    side.innerHTML = `
      <div class="panel"><h2>🏆 Tagesbestenliste</h2><p class="muted st-date">${esc(Daily.longDate(today))}</p>
        <div id="cnForm"></div><div id="cnLb"><p class="muted">Lade …</p></div>
        <a class="side-lb-link" href="/raetsel/bestenliste.html">🏆 Ewige Bestenliste</a></div>
      <div class="panel st-stats"><h2>📊 Deine Statistik</h2>
        <div class="nums"><div><b>${st.played}</b><span>gespielt</span></div><div><b>${st.won}</b><span>gelöst</span></div><div><b>${st.perfect}</b><span>perfekt</span></div><div><b>${st.streak}</b><span>Serie</span></div></div>
        <p class="hint">Nur Tagesrätsel, gespeichert auf diesem Gerät.</p></div>`;
    Daily.board($('cnLb'), lbKey, fmtScore, P.submitted || null);
    if (P.over && P.won && !P.submitted) {
      const score = P.mistakes * 10000 + Math.min(9999, elapsed());
      $('cnForm').innerHTML = `<form class="hs-form"><p>Dein Ergebnis: <b>${fmtScore(score)}</b></p><div class="row"><input name="n" maxlength="16" required placeholder="Dein Name" value="${esc(store.name())}"><button>Eintragen</button></div><p class="error"></p></form>`;
      const form = $('cnForm').querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.elements.n.value.trim();
        if (!name) return;
        store.setName(name);
        form.querySelector('button').disabled = true;
        try {
          const entries = await Daily.submit(lbKey, name, score);
          const mine = entries.find((x) => x.score === score && x.name.toLowerCase() === name.toLowerCase()) || entries.find((x) => x.score === score);
          P.submitted = { name: mine ? mine.name : name, score };
          save();
          $('cnForm').innerHTML = '';
          $('cnLb').innerHTML = Daily.table(entries, fmtScore, P.submitted);
        } catch (err) {
          form.querySelector('.error').textContent = err.message;
          form.querySelector('button').disabled = false;
        }
      };
    }
  }

  /* ---------- Start ---------- */
  $('cnGrid').addEventListener('click', (e) => {
    const t = e.target.closest('.cn-tile');
    if (t) toggle(t.dataset.w);
  });
  $('cnSubmit').onclick = check;
  $('cnClear').onclick = () => { P.sel.clear(); render(); };
  $('cnShuffle').onclick = () => {
    startClock();
    const solvedWords = new Set(P.solved.flatMap((gi) => P.groups[gi].words));
    const rest = shuffle(P.order.filter((w) => !solvedWords.has(w)), Math.random);
    P.order = [...P.order.filter((w) => solvedWords.has(w)), ...rest];
    save();
    render();
  };
  document.querySelectorAll('#cnModes [data-mode]').forEach((b) => (b.onclick = () => { $('cnEnd').hidden = true; newPuzzle(b.dataset.mode); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !(e.target && e.target.tagName === 'INPUT')) check(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && P && P.started) { stopClock(); save(); } });
  newPuzzle('daily');
  renderSide();
})();
