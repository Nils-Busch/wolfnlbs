/* Wordle auf Deutsch. Der Server kennt das Lösungswort und wertet jeden Versuch
   aus; im Browser landet die Lösung erst, wenn die Runde vorbei ist. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const ROWS = 6;
  const KEYS = ['QWERTZUIOP', 'ASDFGHJKL', '⏎YXCVBNM⌫'];
  const RANK = { b: 1, y: 2, g: 3 };

  const W = { mode: 'daily', game: null, typed: '', busy: false, submittedName: null };

  async function api(path, body) {
    const r = await fetch('/api/spiele/wordle' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'Fehler'), { status: r.status });
    return data;
  }

  /* ---------- Anzeige ---------- */
  function msg(text, isErr = false, ms = 2200) {
    const el = $('msg');
    el.textContent = text;
    el.className = 'wd-msg' + (isErr ? ' err' : '');
    clearTimeout(msg.t);
    if (text && ms) msg.t = setTimeout(() => (el.textContent = ''), ms);
  }

  function buildKeyboard() {
    $('kb').innerHTML = KEYS.map((row) => `<div class="r">${[...row].map((k) => {
      if (k === '⏎') return '<button class="wide" data-k="ENTER">Raten</button>';
      if (k === '⌫') return '<button class="wide" data-k="BACK" aria-label="Löschen">⌫</button>';
      return `<button data-k="${k}">${k}</button>`;
    }).join('')}</div>`).join('');
  }

  function render(animateLast = false) {
    const g = W.game;
    const guesses = g ? g.guesses : [];
    let html = '';
    for (let r = 0; r < ROWS; r++) {
      const done = guesses[r];
      const isCurrent = !done && r === guesses.length && g && g.status === 'playing';
      const letters = done ? done.word : isCurrent ? W.typed.padEnd(5) : '     ';
      const cls = done ? (animateLast && r === guesses.length - 1 ? '' : ' static') : '';
      html += `<div class="wd-row${cls}" data-row="${r}">${[...letters].map((ch, i) => {
        const st = done ? done.pattern[i] : ch.trim() ? 'filled' : '';
        return `<div class="wd-cell ${st}">${ch.trim() ? esc(ch) : ''}</div>`;
      }).join('')}</div>`;
    }
    $('grid').innerHTML = html;

    // Tastatur einfärben (beste bekannte Info pro Buchstabe)
    const best = {};
    for (const x of guesses) [...x.word].forEach((ch, i) => {
      const p = x.pattern[i];
      if (!best[ch] || RANK[p] > RANK[best[ch]]) best[ch] = p;
    });
    document.querySelectorAll('#kb button[data-k]').forEach((b) => {
      b.className = (b.classList.contains('wide') ? 'wide ' : '') + (best[b.dataset.k] || '');
    });

    $('label').textContent = !g ? '…' : g.mode === 'daily' ? `#${g.number}` : 'frei';
    renderEnd();
  }

  function shareText() {
    const g = W.game;
    const rows = g.guesses.map((x) => [...x.pattern].map((p) => (p === 'g' ? '🟩' : p === 'y' ? '🟨' : '⬛')).join(''));
    const head = g.mode === 'daily' ? `Vereinsheim-Wordle #${g.number}` : 'Vereinsheim-Wordle (frei)';
    return `${head} ${g.status === 'won' ? g.guesses.length : 'X'}/6\n\n${rows.join('\n')}`;
  }

  function renderEnd() {
    const g = W.game;
    const el = $('end');
    if (!g || g.status === 'playing') { el.hidden = true; return; }
    el.hidden = false;
    const won = g.status === 'won';
    const canSubmit = won && g.mode === 'daily' && !g.submitted;
    el.innerHTML = `
      <div class="big">${won ? ['Genial!', 'Großartig!', 'Stark!', 'Gut gemacht!', 'Geschafft!', 'Puh, knapp!'][g.guesses.length - 1] : 'Leider nicht geschafft.'}</div>
      ${won ? `<div>${g.guesses.length}/6 Versuche in ${fmtTime(g.seconds)}</div>` : `<div>Gesucht war:</div><div class="sol">${esc(g.solution)}</div>`}
      ${canSubmit ? `<form id="submitForm"><input name="n" maxlength="16" placeholder="Dein Name" required value="${esc(store.get('gg-name') || '')}"><button>In die Bestenliste</button></form>` : ''}
      <div class="row">
        <button class="ghost" id="shareBtn" type="button">📋 Ergebnis kopieren</button>
        ${g.mode === 'free' ? '<button id="againBtn" type="button">Neues Wort</button>' : '<button class="ghost" id="toFree" type="button">Noch eins (frei)</button>'}
      </div>`;
    const f = $('submitForm');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const name = f.elements.n.value.trim();
      if (!name) return;
      store.set('gg-name', name);
      f.querySelector('button').disabled = true;
      try {
        const r = await api('/submit', { sessionId: g.sessionId, name });
        g.submitted = true;
        W.submittedName = name;
        renderBoard(r.board, name, r.date);
        renderEnd();
        msg('Eingetragen!');
      } catch (err) {
        msg(err.message, true);
        f.querySelector('button').disabled = false;
      }
    };
    $('shareBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(shareText()); msg('In die Zwischenablage kopiert.'); }
      catch { prompt('Zum Kopieren markieren:', shareText()); }
    };
    const again = $('againBtn');
    if (again) again.onclick = () => newFree();
    const toFree = $('toFree');
    if (toFree) toFree.onclick = () => setMode('free');
  }

  const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`);

  function renderBoard(board, mark, date) {
    const el = $('board');
    const today = date ? new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Heute';
    el.innerHTML = `<h2>🏆 Tagesrätsel</h2><p class="muted" style="margin-top:-.4rem">${esc(today)}</p>${
      board.length
        ? `<ol class="wd-board">${board.map((e) => `<li class="${mark && e.name === mark ? 'me' : ''}"><span>${esc(e.name)}</span><b>${e.attempts}/6</b><small>${fmtTime(e.seconds)}</small></li>`).join('')}</ol>`
        : '<p class="muted">Heute hat es noch niemand gelöst – sei die oder der Erste!</p>'
    }`;
  }

  async function loadBoard() {
    try {
      const r = await api('/board');
      renderBoard(r.board, W.submittedName, r.date);
    } catch {
      $('board').innerHTML = '<h2>🏆 Tagesrätsel</h2><p class="muted">Bestenliste gerade nicht erreichbar.</p>';
    }
  }

  /* ---------- Statistik (nur auf diesem Gerät) ---------- */
  function recordStats(g) {
    if (g.mode !== 'daily') return;
    const st = store.get('wordle-stats') || { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], last: null };
    if (st.lastCounted === g.date) return;
    st.played++;
    if (g.status === 'won') {
      st.won++;
      st.dist[g.guesses.length - 1]++;
      st.streak = st.last && daysBetween(st.last, g.date) === 1 ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
      st.last = g.date;
    } else {
      st.streak = 0;
    }
    st.lastCounted = g.date;
    store.set('wordle-stats', st);
  }
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

  function renderStats() {
    const st = store.get('wordle-stats') || { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] };
    const max = Math.max(1, ...st.dist);
    const mine = W.game && W.game.mode === 'daily' && W.game.status === 'won' ? W.game.guesses.length - 1 : -1;
    $('stats').innerHTML = `<h2>📊 Deine Statistik</h2>
      <div class="nums"><div><b>${st.played}</b><span>gespielt</span></div><div><b>${st.played ? Math.round((st.won / st.played) * 100) : 0}%</b><span>gelöst</span></div>
      <div><b>${st.streak}</b><span>Serie</span></div><div><b>${st.best}</b><span>Rekord</span></div></div>
      <div class="wd-dist">${st.dist.map((n, i) => `<div><span>${i + 1}</span><i class="${i === mine ? 'me' : ''}" style="width:${Math.max(8, (n / max) * 100)}%">${n}</i></div>`).join('')}</div>
      <p class="hint" style="margin:.6rem 0 0">Nur Tagesrätsel, gespeichert auf diesem Gerät.</p>`;
  }

  /* ---------- Runden ---------- */
  async function loadDaily() {
    const saved = store.get('wordle-daily');
    let g = null;
    if (saved?.sessionId) {
      try { g = await api('/session/' + saved.sessionId); } catch { g = null; }
    }
    // Neue Runde, wenn keine da ist oder sie von einem anderen Tag stammt.
    const board = await api('/board').catch(() => null);
    if (!g || (board && g.date !== board.date)) {
      g = await api('/start', { mode: 'daily' });
      store.set('wordle-daily', { sessionId: g.sessionId, date: g.date });
    }
    return g;
  }

  async function loadFree(forceNew = false) {
    const saved = store.get('wordle-free');
    if (!forceNew && saved?.sessionId) {
      try {
        const g = await api('/session/' + saved.sessionId);
        if (g.status === 'playing') return g;
      } catch {}
    }
    const g = await api('/start', { mode: 'free' });
    store.set('wordle-free', { sessionId: g.sessionId });
    return g;
  }

  async function setMode(mode) {
    W.mode = mode;
    $('modeDaily').classList.toggle('on', mode === 'daily');
    $('modeFree').classList.toggle('on', mode === 'free');
    W.typed = '';
    W.game = null;
    render();
    try {
      W.game = mode === 'daily' ? await loadDaily() : await loadFree();
    } catch (e) {
      msg('Server nicht erreichbar. Bitte später nochmal versuchen.', true, 0);
    }
    render();
    renderStats();
  }

  async function newFree() {
    W.typed = '';
    W.game = await loadFree(true);
    render();
  }

  async function submitGuess() {
    const g = W.game;
    if (!g || g.status !== 'playing' || W.busy) return;
    if (W.typed.length < 5) {
      shake();
      return msg('Zu wenige Buchstaben.', true);
    }
    W.busy = true;
    try {
      const res = await api('/guess', { sessionId: g.sessionId, word: W.typed });
      W.game = res;
      W.typed = '';
      render(true);
      if (res.status !== 'playing') {
        recordStats(res);
        setTimeout(renderStats, 600);
        if (res.mode === 'daily') loadBoard();
      }
    } catch (e) {
      shake();
      msg(e.message, true);
    } finally {
      W.busy = false;
    }
  }

  function shake() {
    const row = document.querySelector(`.wd-row[data-row="${W.game ? W.game.guesses.length : 0}"]`);
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }

  function press(k) {
    const g = W.game;
    if (!g || g.status !== 'playing') return;
    if (k === 'ENTER') return submitGuess();
    if (k === 'BACK') W.typed = W.typed.slice(0, -1);
    else if (/^[A-Z]$/.test(k) && W.typed.length < 5) W.typed += k;
    else return;
    render();
  }

  /* ---------- Eingabe ---------- */
  $('kb').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) press(b.dataset.k);
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'Enter') { e.preventDefault(); press('ENTER'); }
    else if (e.key === 'Backspace') press('BACK');
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
    else if (/^[äöüßÄÖÜ]$/.test(e.key)) msg('Umlaute und ß kommen in den Wörtern nicht vor.', true);
  });
  $('modeDaily').onclick = () => W.mode !== 'daily' && setMode('daily');
  $('modeFree').onclick = () => W.mode !== 'free' && setMode('free');

  buildKeyboard();
  setMode('daily');
  loadBoard();
})();
