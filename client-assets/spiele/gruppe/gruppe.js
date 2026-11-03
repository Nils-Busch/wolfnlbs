/**
 * Gruppenspiele: „Wer würde eher …?“, Stadt-Land-Fluss, Kniffel, Mäxchen online und Montagsmaler.
 *   /spiele/gruppe/                 Start: Spiel wählen oder mit Code beitreten
 *   /spiele/gruppe/?new=maexchen    Start mit hervorgehobenem Spiel
 *   /spiele/gruppe/#host=CODE       Bildschirm/Spielleitung (Fernseher oder Laptop)
 *   /spiele/gruppe/?room=CODE       Handy einer mitspielenden Person
 *
 * Neu gezeichnet wird mit einem kleinen DOM-Abgleich (morph): Was sich nicht ändert,
 * bleibt stehen – nichts ploppt bei jeder Aktualisierung neu auf, Eingaben und die
 * Zeichenfläche behalten ihren Zustand. Neue Elemente erscheinen mit ihrer Animation.
 */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const PALETTE = ['#e05252', '#3f7be0', '#22a06b', '#d99a00', '#8a5cf0', '#e0658f', '#1aa3a3', '#c4622d'];
  const colorFor = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const initials = (name) => { const p = name.trim().split(/\s+/); return (p.length > 1 ? [...p[0]][0] + [...p[p.length - 1]][0] : [...p[0]].slice(0, 2).join('')).toUpperCase(); };
  const av = (p, cls = '') => `<span class="gp-av ${cls}" style="--c:${colorFor(p.name)}">${esc(initials(p.name))}</span>`;
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrate = (p) => { if (navigator.vibrate) try { navigator.vibrate(p); } catch {} };
  const ICON = { wwe: '🫵', slf: '🔤', kniffel: '🎲', maexchen: '🥤', draw: '🖍️' };
  const SELF_HOST = new Set(['maexchen', 'draw']);

  /* ---------- DOM-Abgleich ---------- */
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-k') || n.id || '' : '');
  const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b);
  function patch(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
    for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
    if (a.tagName === 'INPUT' && (a.type === 'checkbox' || a.type === 'radio')) a.checked = b.hasAttribute('checked');
    if (a.tagName === 'CANVAS' || a.tagName === 'TEXTAREA') return;
    if (a.tagName === 'svg') { if (a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML; return; }
    morphChildren(a, b);
  }
  function morphChildren(from, to) {
    let cur = from.firstChild;
    for (const t of [...to.childNodes]) {
      if (cur && same(cur, t)) { patch(cur, t); cur = cur.nextSibling; continue; }
      let found = null;
      if (keyOf(t)) for (let n = cur; n; n = n.nextSibling) if (same(n, t)) { found = n; break; }
      if (found) { from.insertBefore(found, cur); patch(found, t); continue; }
      from.insertBefore(t, cur);
    }
    while (cur) { const nx = cur.nextSibling; from.removeChild(cur); cur = nx; }
  }
  function morph(root, html) {
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    morphChildren(root, tpl);
  }

  /* ---------- Würfel (Kniffel) ---------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const die = (v, { held = false, roll = false, i = 0, btn = false, dis = false, k = '' } = {}) => {
    const pips = Array.from({ length: 9 }, (_, n) => `<i class="${PIPS[v].includes(n) ? 'on' : ''}"></i>`).join('');
    const cls = `kn-die ${held ? 'held' : ''} ${roll ? 'roll' : ''}`;
    const st = roll ? ` style="--d:${(i * 0.06).toFixed(2)}s; --r:${[-28, 17, -9, 24, -19][i]}deg"` : '';
    return btn
      ? `<button class="${cls}" data-k="${k}" data-hold="${i}" ${dis ? 'disabled' : ''} aria-pressed="${held}" aria-label="Würfel ${v}${held ? ', gehalten' : ''}"${st}>${pips}</button>`
      : `<span class="${cls}" data-k="${k}" role="img" aria-label="Würfel ${v}${held ? ', gehalten' : ''}"${st}>${pips}</span>`;
  };
  // Welche Würfel beim letzten Wurf geworfen wurden, merken wir pro Wurf –
  // so rollt jeder Würfel genau einmal, egal wie oft danach neu gezeichnet wird.
  function knDice(kn, btn, canHold) {
    if (!G.knRolled || G.knRolled.id !== kn.rollId) G.knRolled = { id: kn.rollId, mask: kn.held.map((h) => !h) };
    const first = kn.rollsLeft === 3;
    return `<div class="kn-dice ${first ? 'idle' : ''}">${kn.dice.map((v, i) => die(v, { held: kn.held[i], roll: !first && G.knRolled.mask[i] && !reduced(), i, btn, dis: !canHold, k: `d${i}-${G.knRolled.mask[i] ? kn.rollId : 'h'}` })).join('')}</div>`;
  }
  const rollDots = (kn) => `<span class="kn-rolls" aria-label="Noch ${kn.rollsLeft} Würfe">${[0, 1, 2].map((k) => `<i class="${k < kn.rollsLeft ? 'on' : ''}"></i>`).join('')}</span>`;
  const KN_HINT = { three: 'Summe', four: 'Summe', full: '25', small: '30', large: '40', kniffel: '50', chance: 'Summe' };

  function toast(msg) {
    let t = document.getElementById('gpToast');
    if (!t) { t = document.createElement('div'); t.id = 'gpToast'; t.className = 'gp-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------- Verbindung ---------- */
  class Sock {
    constructor(code, h) { this.code = code; this.h = h; this.seq = 0; this.pending = new Map(); this.retry = 0; this.closed = false; this.open();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !this.closed && (!this.ws || this.ws.readyState > 1)) { this.retry = 0; this.open(); } }); }
    open() {
      clearTimeout(this.timer);
      const url = new URL(`/api/spiele/party/${this.code}/ws`, location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { if (this.ws !== ws) return; this.retry = 0; clearInterval(this.hb); this.hb = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000); this.h.onOpen(); };
      ws.onmessage = (e) => {
        if (this.ws !== ws || e.data === 'pong') return;
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'res') { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); clearTimeout(p.timer); p.resolve(m.res); } }
        else if (m.t === 'evt') m.event === 'state' ? this.h.onState(m.payload) : m.event === 'ink' ? inkEvent(m.payload) : this.h.onEvent && this.h.onEvent(m.event, m.payload);
      };
      ws.onclose = (e) => {
        if (this.ws !== ws) return;
        clearInterval(this.hb);
        for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'Verbindung unterbrochen.' }); }
        this.pending.clear();
        this.h.onClose && this.h.onClose();
        if (e.code === 4004) { this.closed = true; this.h.onGone && this.h.onGone(); return; }
        if (!this.closed) this.timer = setTimeout(() => this.open(), Math.min(8000, 500 * 2 ** this.retry++));
      };
    }
    emit(event, payload = {}) {
      return new Promise((resolve) => {
        if (!this.ws || this.ws.readyState !== 1) return resolve({ ok: false, error: 'Keine Verbindung.' });
        const id = ++this.seq;
        const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: 'Keine Antwort vom Server.' }); }, 10000);
        this.pending.set(id, { resolve, timer });
        this.ws.send(JSON.stringify({ id, event, payload }));
      });
    }
  }
  const clock = { off: 0, sync(n) { if (n) this.off = n - Date.now(); }, left(t) { return t ? Math.max(0, t - (Date.now() + this.off)) : 0; } };

  const G = { mode: null, code: null, sock: null, s: null, connected: false, tick: null, typing: null, lastPhaseKey: '', ink: { rev: -1, strokes: [] }, pen: { c: '#172036', w: 14 } };

  async function act(event, payload) {
    const r = await G.sock.emit(event, payload);
    if (!r.ok) toast(r.error || 'Fehler');
    return r;
  }

  /* ---------- Start ---------- */
  const GAME_CARDS = [
    ['wwe', 'Wer würde eher …?', 'Eine Frage, alle stimmen auf dem Handy ab, wer am ehesten passt. Der Bildschirm löst auf – mit Applaus oder Gelächter.', 'Fernseher + Handys'],
    ['slf', 'Stadt-Land-Fluss', 'Der Bildschirm würfelt einen Buchstaben, alle schreiben am Handy. Gleiche Antworten geben weniger Punkte, Unsinn wird gemeinsam rausgewählt.', 'Fernseher + Handys'],
    ['kniffel', 'Kniffel', 'Wer dran ist, würfelt am eigenen Handy, hält Würfel fest und trägt ein. Der Bildschirm zeigt die Würfel groß und den Block aller.', 'Fernseher + Handys'],
    ['maexchen', 'Mäxchen online', 'Jede Person würfelt verdeckt am eigenen Handy, sagt an und blufft. Glauben oder aufdecken? Geht auch über die Ferne.', 'Nur Handys'],
    ['draw', 'Montagsmaler', 'Eine Person zeichnet am Handy, alle anderen raten um die Wette. Wer schnell rät, bekommt mehr Punkte.', 'Nur Handys, Fernseher optional'],
  ];
  function renderStart(err = '') {
    G.mode = 'start';
    const name = (() => { try { return localStorage.getItem('gg-name') || ''; } catch { return ''; } })();
    const params = new URLSearchParams(location.search);
    const pre = normCode(params.get('room'));
    const want = params.get('new');
    app.className = 'gp gp-start';
    app.innerHTML = `
      <section class="hero"><h1>Gruppenspiele</h1><p>Alle spielen am eigenen Handy. Bei den meisten Spielen zeigt ein Fernseher oder Laptop das Geschehen groß, Mäxchen und Montagsmaler laufen auch ganz ohne.</p></section>
      <form class="panel gp-join" id="joinForm">
        <h2>Mitspielen</h2>
        <div class="row">
          <input name="code" maxlength="4" placeholder="CODE" autocomplete="off" aria-label="Raumcode" value="${esc(pre)}" class="gp-code-in">
          <input name="name" maxlength="16" placeholder="Dein Name" value="${esc(name)}" aria-label="Dein Name" autocomplete="nickname">
          <button>Beitreten</button>
        </div>
        <p class="error" id="startErr">${esc(err)}</p>
      </form>
      <h2 class="gp-sub">Neuen Raum eröffnen</h2>
      <div class="gp-games">${GAME_CARDS.map(([g, t, d, tag]) => `
        <article class="gp-game ${g} ${want === g ? 'want' : ''}" data-tilt>
          <span class="gp-icon">${ICON[g]}</span>
          <h2>${t}</h2>
          <p>${d}</p>
          <span class="gp-tag">${tag}</span>
          <button data-create="${g}">${SELF_HOST.has(g) ? 'Raum eröffnen & mitspielen' : 'Raum eröffnen'}</button>
        </article>`).join('')}</div>`;
    app.querySelectorAll('[data-create]').forEach((b) => (b.onclick = () => create(b.dataset.create)));
    app.querySelector('#joinForm').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const code = normCode(f.code.value), nm = f.name.value.trim();
      if (code.length !== 4) return renderStart('Bitte den 4-stelligen Code eingeben.');
      if (!nm) return renderStart('Bitte einen Namen eingeben.');
      try { localStorage.setItem('gg-name', nm); } catch {}
      store.set('gp-join-' + code, { name: nm });
      startPlayer(code);
    };
    if (pre) app.querySelector('[name=name]').focus();
    if (want) app.querySelector(`.gp-game.${CSS.escape(want)}`)?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  }

  async function create(game) {
    const nameIn = app.querySelector('#joinForm [name=name]');
    const nm = nameIn ? nameIn.value.trim() : '';
    if (SELF_HOST.has(game) && !nm) {
      const e = app.querySelector('#startErr');
      if (e) e.textContent = 'Du spielst mit – trag oben zuerst deinen Namen ein.';
      nameIn?.focus();
      nameIn?.scrollIntoView({ block: 'center' });
      return;
    }
    try {
      const r = await fetch('/api/spiele/party', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Raum konnte nicht erstellt werden.');
      store.set('gp-host-' + d.roomCode, d.hostKey);
      if (SELF_HOST.has(game)) {
        try { localStorage.setItem('gg-name', nm); } catch {}
        store.set('gp-join-' + d.roomCode, { name: nm, hostKey: d.hostKey });
        return startPlayer(d.roomCode);
      }
      location.hash = 'host=' + d.roomCode;
      startHost(d.roomCode);
    } catch (e) {
      renderStart(e.message);
    }
  }

  /* ---------- Bildschirm ---------- */
  function startHost(code, keyFromUrl) {
    G.mode = 'host';
    G.code = code;
    if (keyFromUrl) { store.set('gp-host-' + code, keyFromUrl); history.replaceState(null, '', '/spiele/gruppe/#host=' + code); }
    const key = store.get('gp-host-' + code);
    if (!key) return renderStart('Dieser Raum gehört einem anderen Gerät.');
    app.className = 'gp gp-host';
    app.innerHTML = '<p class="muted">Verbinde …</p>';
    G.sock = new Sock(code, {
      onOpen: async () => { G.connected = true; const r = await G.sock.emit('host', { hostKey: key }); if (!r.ok) { G.sock.closed = true; renderStart(r.error); } },
      onClose: () => { G.connected = false; },
      onState: (s) => { clock.sync(s.serverNow); G.s = s; renderHost(); },
      onGone: () => renderStart('Der Raum ist abgelaufen.'),
    });
  }

  const joinUrl = () => `${location.origin}/spiele/gruppe/?room=${G.code}`;
  function qr(text) {
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'QR-Code zum Mitspielen' });
  }
  const timerBar = () => `<div class="gp-timer"><i id="gpBar"></i><b id="gpLeft"></b></div>`;
  function runTimer() {
    clearInterval(G.tick);
    const s = G.s;
    if (!s.endsAt) return;
    const total = s.timerTotal || (s.settings.seconds || 30) * 1000;
    const step = () => {
      const left = clock.left(s.endsAt);
      const bar = document.getElementById('gpBar'), lab = document.getElementById('gpLeft');
      if (bar) bar.style.width = Math.min(100, (left / total) * 100) + '%';
      if (lab) lab.textContent = Math.ceil(left / 1000);
      document.querySelector('.gp-timer')?.classList.toggle('low', left < Math.min(10000, total / 3));
      if (!left) clearInterval(G.tick);
    };
    step();
    G.tick = setInterval(step, 200);
  }
  const byId = (s) => Object.fromEntries(s.players.map((p) => [p.id, p]));
  const sortScore = (s) => [...s.players].sort((a, b) => b.score - a.score);

  function renderHost() {
    const s = G.s;
    const key = `${s.phase}-${s.round}`;
    const fresh = key !== G.lastPhaseKey;
    G.lastPhaseKey = key;
    const bodyKey = s.game === 'kniffel' || s.game === 'maexchen' ? s.phase : s.game === 'draw' ? `${s.phase}-${s.dr?.turn || 0}` : key;
    const head = `<header class="gp-bar"><span class="t">${ICON[s.game] || ''} ${esc(s.gameName)}</span>${s.round && s.game !== 'maexchen' ? `<span class="r">Runde ${s.round} von ${s.settings.rounds}</span>` : ''}<span class="code">${esc(s.code)}</span>${G.connected ? '' : '<span class="warn">Verbindung unterbrochen …</span>'}</header>`;
    let body = '';
    let foot = '';
    if (s.phase === 'LOBBY') {
      body = `<div class="gp-lobby">
        <div class="gp-joininfo">
          <div class="gp-qr">${qr(joinUrl())}</div>
          <div><p class="muted">Am Handy öffnen:</p><p class="url">${esc(location.host)}/spiele/gruppe</p><p class="muted">Code eingeben:</p>
          <p class="gp-tiles">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</p></div>
        </div>
        <div class="gp-people">${s.players.length ? s.players.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'}" data-k="c${p.id}">${av(p)}<b>${esc(p.name)}</b><button class="x" data-kick="${p.id}" title="Entfernen">✕</button></span>`).join('') : '<p class="muted">Noch niemand da. Scannt den Code!</p>'}</div>
        ${settingsHtml(s)}
      </div>`;
      foot = `<button class="big" data-host="start" ${s.players.length < 2 ? 'disabled' : ''}>Los geht’s</button>`;
    } else if (s.game === 'wwe') {
      if (s.phase === 'QUESTION') {
        body = `<div class="wwe-q fresh"><p class="kick">Wer würde eher …</p><h2>${esc(s.question.replace(/^… ?/, ''))}</h2></div>${timerBar()}
          <div class="gp-voted">${s.players.map((p) => `<span class="${s.voted.includes(p.id) ? 'in' : ''}" data-k="v${p.id}">${av(p)}</span>`).join('')}</div>
          <p class="muted center">${s.voted.length} von ${s.players.filter((p) => p.connected).length} haben abgestimmt</p>`;
        foot = `<button data-host="next">Auflösen</button>`;
      } else if (s.phase === 'RESULT') {
        const r = s.result;
        const max = Math.max(1, ...r.ranking.map((x) => x.votes));
        body = `<div class="wwe-q small"><p class="kick">Wer würde eher …</p><h2>${esc(s.question.replace(/^… ?/, ''))}</h2></div>
          ${r.winners.length ? `<div class="wwe-win"><span class="crown">👑</span><b>${r.winners.map(esc).join(' & ')}</b></div>` : '<p class="center muted">Niemand hat abgestimmt.</p>'}
          <div class="wwe-bars">${r.ranking.map((x, i) => `<div class="b" style="--w:${(x.votes / max) * 100}%; animation-delay:${0.3 + i * 0.12}s">${av({ name: x.name })}<span class="n">${esc(x.name)}</span><span class="bar"><i></i></span><b>${x.votes}</b></div>`).join('')}</div>`;
        foot = `<button data-host="next">${s.round >= s.settings.rounds ? 'Zum Ergebnis' : 'Nächste Frage'}</button>`;
      } else if (s.phase === 'END') {
        const a = s.awards;
        body = `<div class="gp-end"><h2>Die Titel des Abends</h2>${podium(a.players)}
          <ol class="wwe-hist">${a.history.map((h) => `<li><span>Wer würde eher ${esc(h.q.replace(/^… ?/, ''))}</span><b>${h.winners.length ? h.winners.map(esc).join(' & ') : '–'}</b></li>`).join('')}</ol></div>`;
        foot = `<button data-host="restart">Nochmal spielen</button>`;
      }
    } else if (s.game === 'kniffel') {
      if (s.phase === 'PLAYING') {
        body = knHost(s);
        foot = `<button class="ghost" data-host="next" title="Trägt für die Person den besten freien Wert ein">Zug überspringen</button>`;
      } else if (s.phase === 'END') {
        body = `<div class="gp-end"><h2>Endstand</h2>${podium(sortScore(s).map((p) => ({ name: p.name, score: p.score })))}</div>`;
        foot = `<button data-host="restart">Nochmal spielen</button>`;
      }
    } else if (s.game === 'maexchen') {
      body = mxHtml(s, null);
      foot = s.phase === 'PLAYING' ? `<button class="ghost" data-host="next" title="Für eine Person entscheiden, die nicht reagiert">Zug überspringen</button>` : `<button data-host="restart">Nochmal spielen</button>`;
    } else if (s.game === 'draw') {
      body = drHost(s);
      foot = s.phase === 'END' ? `<button data-host="restart">Nochmal spielen</button>` : `<button class="ghost" data-host="next">${s.phase === 'CHOOSE' ? 'Wort automatisch wählen' : s.phase === 'DRAW' ? 'Runde beenden' : 'Weiter'}</button>`;
    } else {
      if (s.phase === 'WRITING') {
        body = `<div class="slf-letter spin" id="slfLetter"><span>${esc(s.letter)}</span></div>
          <p class="slf-cats">${s.settings.categories.map((c, i) => `<span style="animation-delay:${2.6 + i * 0.08}s">${esc(c)}</span>`).join('')}</p>${timerBar()}
          ${s.stoppedBy ? `<p class="slf-stop">✋ ${esc(s.stoppedBy)} ist fertig – noch 10 Sekunden!</p>` : ''}
          <div class="gp-voted">${s.players.map((p) => `<span class="${s.done.includes(p.id) ? 'in' : ''}" data-k="v${p.id}">${av(p)}</span>`).join('')}</div>`;
        foot = `<button data-host="next">Stopp – auswerten</button>`;
      } else if (s.phase === 'REVIEW' || s.phase === 'SCORES') {
        const auto = new Set(s.auto);
        const scores = s.roundScores;
        body = `<div class="slf-head"><span class="slf-mini">${esc(s.letter)}</span><p>${s.phase === 'REVIEW' ? 'Antworten prüfen: Am Handy könnt ihr Unsinn anzweifeln. Ab der Hälfte der Stimmen zählt die Antwort nicht.' : 'Punkte dieser Runde: 20 = als Einzige, 10 = eigene Idee, 5 = doppelt'}</p></div>
          <div class="slf-table-wrap"><table class="slf-table"><thead><tr><th></th>${s.settings.categories.map((c) => `<th>${esc(c)}</th>`).join('')}${scores ? '<th>Runde</th>' : ''}</tr></thead><tbody>
          ${s.players.map((p, i) => `<tr style="animation-delay:${i * 0.06}s" data-k="r${p.id}"><th>${av(p)} ${esc(p.name)}</th>${s.settings.categories.map((c) => {
            const v = s.answers[p.id]?.[c] || '';
            const k = `${p.id}|${c}`;
            const fl = (s.flags[k] || []).length;
            const pts = scores ? scores.detail[p.id]?.[c] ?? 0 : null;
            const bad = auto.has(k) || (scores && v && pts === 0);
            return `<td class="${bad ? 'bad' : ''} ${!v ? 'empty' : ''}">${v ? esc(v) : '–'}${fl ? `<small class="fl">👎 ${fl}</small>` : ''}${pts !== null ? `<em class="pts p${pts}">${pts}</em>` : ''}</td>`;
          }).join('')}${scores ? `<td class="sum">+${scores.scores[p.id] || 0}</td>` : ''}</tr>`).join('')}
          </tbody></table></div>
          ${scores ? `<div class="slf-rank">${sortScore(s).map((p, i) => `<span class="gp-chip" data-k="k${p.id}" style="animation-delay:${0.2 + i * 0.08}s">${i + 1}. ${av(p)}<b>${esc(p.name)}</b><em>${p.score}</em></span>`).join('')}</div>` : ''}`;
        foot = s.phase === 'REVIEW' ? `<button data-host="next">Punkte vergeben</button>` : `<button data-host="next">${s.round >= s.settings.rounds ? 'Zum Endstand' : 'Nächster Buchstabe'}</button>`;
      } else if (s.phase === 'END') {
        body = `<div class="gp-end"><h2>Endstand</h2>${podium(sortScore(s).map((p) => ({ name: p.name, score: p.score })))}</div>`;
        foot = `<button data-host="restart">Nochmal spielen</button>`;
      }
    }
    app.className = `gp gp-host g-${s.game}`;
    morph(app, `${head}<main class="gp-stage"><div class="gp-body" data-k="${bodyKey}">${body}</div></main><footer class="gp-foot">${foot}<button class="ghost" data-host="full" title="Vollbild">⛶</button></footer>`);
    bindHost();
    runTimer();
    afterRender(s, fresh);
    if (s.phase === 'END' && fresh && window.VH) setTimeout(() => VH.confetti(), 600);
    if (s.phase === 'RESULT' && fresh && s.result.winners.length && window.VH) setTimeout(() => VH.confetti({ count: 50 }), 500);
  }

  function podium(list) {
    const top = [list[1], list[0], list[2]];
    return `<div class="gp-podium">${top.map((p, i) => p ? `<div class="st p${[2, 1, 3][i]}">${av(p)}<b>${esc(p.name)}</b><span>${p.score} ${p.score === 1 ? 'Punkt' : 'Punkte'}</span><i>${[2, 1, 3][i]}</i></div>` : '<div></div>').join('')}</div>
      ${list.length > 3 ? `<ol class="gp-rest" start="4">${list.slice(3).map((p) => `<li>${esc(p.name)} <b>${p.score}</b></li>`).join('')}</ol>` : ''}`;
  }

  function settingsHtml(s) {
    if (s.game === 'kniffel') return `<p class="muted center">13 Runden, alle Felder einmal. Wer dran ist, würfelt am Handy bis zu drei Mal.</p>`;
    if (s.game === 'maexchen') {
      return `<form class="gp-settings" id="setForm"><label>Deckel pro Person <select name="lives">${[3, 5, 7].map((n) => `<option value="${n}" ${s.settings.lives === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label></form>`;
    }
    if (s.game === 'draw') {
      return `<form class="gp-settings" id="setForm"><label>Jede Person zeichnet <select name="rounds">${[1, 2, 3].map((n) => `<option value="${n}" ${s.settings.rounds === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label>
        <label>Zeit zum Zeichnen <select name="seconds">${[60, 80, 100, 120].map((n) => `<option value="${n}" ${s.settings.seconds === n ? 'selected' : ''}>${n} Sekunden</option>`).join('')}</select></label></form>`;
    }
    if (s.game === 'wwe') {
      return `<form class="gp-settings" id="setForm"><label>Fragen <input type="number" name="rounds" min="3" max="30" value="${s.settings.rounds}"></label>
        <label>Sekunden pro Frage <input type="number" name="seconds" min="10" max="90" value="${s.settings.seconds}"></label></form>`;
    }
    return `<form class="gp-settings" id="setForm"><label>Runden <input type="number" name="rounds" min="1" max="15" value="${s.settings.rounds}"></label>
      <label>Sekunden zum Schreiben <input type="number" name="seconds" min="30" max="300" step="15" value="${s.settings.seconds}"></label>
      <div class="cats">${s.categoriesAll.map((c) => `<label class="cat ${s.settings.categories.includes(c) ? 'on' : ''}"><input type="checkbox" name="cat" value="${esc(c)}" ${s.settings.categories.includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></form>`;
  }
  function bindSettings() {
    const f = document.getElementById('setForm');
    if (!f) return;
    f.onchange = () => {
      const settings = {};
      const cats = [];
      for (const [k, v] of new FormData(f)) { if (k === 'cat') cats.push(v); else settings[k] = +v; }
      if (G.s.game === 'slf') settings.categories = cats;
      act('settings', { settings });
    };
    f.onsubmit = (e) => e.preventDefault();
  }

  function bindHost() {
    app.querySelectorAll('[data-host]').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.host;
      if (a === 'full') { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} return; }
      b.disabled = true;
      await act(a);
      b.disabled = false;
    }));
    app.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => act('kick', { playerId: b.dataset.kick })));
    bindSettings();
  }

  /* ---------- Kniffel ---------- */
  function knHost(s) {
    const kn = s.kn;
    const P = byId(s);
    const cur = P[kn.current] || { name: '?' };
    const order = kn.order.filter((id) => P[id]);
    const lastP = kn.last && P[kn.last.player];
    const lastCat = kn.last && s.cats.find((c) => c.key === kn.last.key);
    const ranking = [...order].sort((a, b) => kn.totals[b].total - kn.totals[a].total);
    const top = Math.max(1, ...order.map((id) => kn.totals[id].total));
    const cell = (id, c) => {
      const v = kn.sheets[id]?.[c.key];
      const isCur = id === kn.current;
      const just = kn.last && kn.last.player === id && kn.last.key === c.key;
      if (v != null) return `<td class="${isCur ? 'cur' : ''} ${just ? 'just' : ''} ${v === 0 ? 'zero' : ''}" data-k="${id}-${c.key}-${v}">${v === 0 ? '–' : v}</td>`;
      const opt = isCur ? kn.options[c.key] : undefined;
      return `<td class="${isCur ? 'cur' : ''} open">${opt !== undefined ? `<span class="opt ${opt ? '' : 'z'}">${opt}</span>` : ''}</td>`;
    };
    const row = (c) => `<tr><th>${esc(c.name)}${KN_HINT[c.key] ? `<small>${KN_HINT[c.key]}</small>` : ''}</th>${order.map((id) => cell(id, c)).join('')}</tr>`;
    return `<div class="kn-host">
      <div class="kn-side">
        <section class="kn-board">
          <p class="kn-who">${av(cur)}<span><b>${esc(cur.name)}</b> ist dran</span>${rollDots(kn)}</p>
          ${knDice(kn, false, false)}
          <p class="kn-last" aria-live="polite">${lastP ? `${esc(lastP.name)} trägt <b>${kn.last.points}</b> bei ${esc(lastCat?.name || '')} ein` : kn.rollsLeft === 3 ? 'Am Handy auf „Würfeln“ tippen' : `Noch ${kn.rollsLeft} ${kn.rollsLeft === 1 ? 'Wurf' : 'Würfe'}`}</p>
        </section>
        <ol class="kn-rank">${ranking.map((id) => `<li data-k="rk${id}" class="${id === kn.current ? 'cur' : ''}">${av(P[id])}<span class="n">${esc(P[id].name)}</span><span class="bar"><i style="width:${(kn.totals[id].total / top) * 100}%"></i></span><b>${kn.totals[id].total}</b></li>`).join('')}</ol>
      </div>
      <div class="kn-sheet-wrap"><table class="kn-sheet">
        <thead><tr><th>Runde ${s.round} / 13</th>${order.map((id) => `<th class="${id === kn.current ? 'cur' : ''}">${av(P[id])}<span>${esc(P[id].name)}</span></th>`).join('')}</tr></thead>
        <tbody>
          <tr class="sec"><th colspan="${order.length + 1}">Oben</th></tr>
          ${s.cats.slice(0, 6).map(row).join('')}
          <tr class="sub"><th>Bonus <small>ab 63</small></th>${order.map((id) => { const t = kn.totals[id]; return `<td class="${id === kn.current ? 'cur' : ''}">${t.bonus ? '<em>+35</em>' : `<span class="prog" title="${t.upper} von 63"><i style="width:${Math.min(100, (t.upper / 63) * 100)}%"></i></span>`}</td>`; }).join('')}</tr>
          <tr class="sec"><th colspan="${order.length + 1}">Unten</th></tr>
          ${s.cats.slice(6).map(row).join('')}
          <tr class="total"><th>Gesamt</th>${order.map((id) => `<td class="${id === kn.current ? 'cur' : ''}">${kn.totals[id].total}</td>`).join('')}</tr>
        </tbody></table></div></div>`;
  }

  function knPhone(s) {
    const kn = s.kn;
    const mine = kn.current === s.me.id;
    const sheet = kn.sheets[s.me.id] || {};
    const tot = kn.totals[s.me.id] || { total: 0, upper: 0, bonus: 0 };
    const bonusBar = `<div class="kn-bonus"><span>Oben ${tot.upper} / 63</span><span class="prog"><i style="width:${Math.min(100, (tot.upper / 63) * 100)}%"></i></span><b>${tot.bonus ? '+35 ✓' : 'Bonus'}</b></div>`;
    if (mine) {
      const canHold = kn.rollsLeft > 0 && kn.rollsLeft < 3;
      const opts = kn.options;
      const best = Math.max(0, ...Object.values(opts));
      const opt = (c) => {
        const v = sheet[c.key];
        if (v != null) return `<div class="kn-opt done" data-k="o${c.key}d"><span>${esc(c.name)}</span><b>${v === 0 ? '–' : v}</b></div>`;
        const o = opts[c.key];
        return `<button class="kn-opt ${o !== undefined && o === best && best > 0 ? 'best' : ''} ${o === 0 ? 'zero' : ''}" data-k="o${c.key}" data-score="${c.key}" ${o === undefined ? 'disabled' : ''} ${o === 0 ? 'title="Feld mit 0 streichen"' : ''}><span>${esc(c.name)}${KN_HINT[c.key] && o === undefined ? `<small>${KN_HINT[c.key]}</small>` : ''}</span><b>${o === undefined ? '' : o}</b></button>`;
      };
      return `<div class="kn-turn-phone">
        <div class="kn-tray">
          <p class="kn-tray-h"><b>Du bist dran</b>${rollDots(kn)}</p>
          ${knDice(kn, true, canHold)}
          <p class="kn-tip">${kn.rollsLeft === 3 ? 'Los geht’s – würfeln!' : canHold ? 'Würfel antippen = festhalten' : 'Keine Würfe mehr – trag ein Ergebnis ein.'}</p>
          <button class="kn-roll" data-roll ${kn.rollsLeft ? '' : 'disabled'}>🎲 Würfeln${kn.rollsLeft && kn.rollsLeft < 3 ? ` <small>noch ${kn.rollsLeft}</small>` : ''}</button>
        </div>
        <h3 class="kn-h">Oben</h3>
        <div class="kn-opts">${s.cats.slice(0, 6).map(opt).join('')}</div>
        ${bonusBar}
        <h3 class="kn-h">Unten</h3>
        <div class="kn-opts">${s.cats.slice(6).map(opt).join('')}</div>
        <p class="kn-total">Gesamt <b>${tot.total}</b></p>
      </div>`;
    }
    const cur = s.players.find((p) => p.id === kn.current) || { name: '?' };
    const rank = [...kn.order].filter((id) => kn.totals[id]).sort((a, b) => kn.totals[b].total - kn.totals[a].total).indexOf(s.me.id) + 1;
    return `<div class="kn-wait">
      <div class="kn-tray small"><p class="kn-tray-h">${av(cur)}<b>${esc(cur.name)}</b> ist dran ${rollDots(kn)}</p>${knDice(kn, false, false)}</div>
      <div class="kn-mycard"><div><span>Deine Punkte</span><b>${tot.total}</b></div><div><span>Platz</span><b>${rank || '–'}</b></div><div><span>Runde</span><b>${s.round}/13</b></div></div>
      ${bonusBar}
      <div class="kn-opts mini">${s.cats.map((c) => `<div class="kn-opt ${sheet[c.key] != null ? 'done' : ''}"><span>${esc(c.name)}</span><b>${sheet[c.key] == null ? '' : sheet[c.key] === 0 ? '–' : sheet[c.key]}</b></div>`).join('')}</div>
    </div>`;
  }

  /* ---------- Mäxchen ---------- */
  const MX_DIE = (n, k) => `<span class="mx-die" data-face="${n}" data-k="${k}">${'<i></i>'.repeat(7)}</span>`;
  const CUP_SVG = `<svg class="mx-cupsvg" viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="108" rx="44" ry="8" fill="rgba(0,0,0,.28)"/>
    <path d="M22 104 L32 22 Q60 12 88 22 L98 104 Q60 116 22 104 Z" fill="#8b4a22"/>
    <path d="M22 104 L32 22 Q60 12 88 22 L98 104 Q60 116 22 104 Z" fill="url(#mxShadeO)"/>
    <ellipse cx="60" cy="22" rx="28" ry="7" fill="#6e3818"/>
    <path d="M26 72 Q60 82 94 72" stroke="#c9873f" stroke-width="5" fill="none"/>
    <path d="M28 88 Q60 98 92 88" stroke="#c9873f" stroke-width="5" fill="none"/>
    <defs><linearGradient id="mxShadeO" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".35" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient></defs></svg>`;
  function mxVal([a, b]) { return a === b ? a * 11 : (a === 1 && b === 2) || (a === 2 && b === 1) ? 21 : Math.max(a, b) * 10 + Math.min(a, b); }

  function mxHtml(s, me) {
    const mx = s.mx;
    const P = byId(s);
    const name = (id) => P[id]?.name || '?';
    if (s.phase === 'END') {
      const ranking = [...(mx?.order || [])].filter((id) => P[id]).sort((a, b) => (P[b].score || 0) - (P[a].score || 0));
      return `<div class="gp-end mx-end"><p class="kick">Mäxchen</p><h2>${mx?.winner ? `${esc(name(mx.winner))} gewinnt!` : 'Spielende'}</h2>
        <ol class="gp-rest">${ranking.map((id, i) => `<li>${i + 1}. ${esc(name(id))}${id === mx.winner ? ' 🏆' : ''}</li>`).join('')}</ol></div>`;
    }
    const isMe = me && mx.cur === me.id;
    const coasters = (id) => Array.from({ length: mx.maxLives }, (_, k) => `<i class="${k < (mx.lives[id] || 0) ? '' : 'gone'}"></i>`).join('');
    const players = `<ul class="mx-players">${mx.order.map((id) => `<li data-k="mp${id}" class="${id === mx.cur ? 'turn' : ''} ${(mx.lives[id] || 0) <= 0 ? 'out' : ''} ${me && id === me.id ? 'me' : ''}">
        <span class="nm">${esc(name(id))}${P[id] && !P[id].connected ? ' 💤' : ''}</span><span class="lives" aria-label="${mx.lives[id] || 0} Deckel">${coasters(id)}</span></li>`).join('')}</ul>`;
    let said;
    if (mx.step === 'reveal' && mx.reveal) {
      const r = mx.reveal;
      said = `<small>${esc(name(r.by))} hatte</small><b class="${r.truth ? 'ok' : 'lie'}" data-k="rv${mx.rollId}">${esc(r.actualLabel)}</b><small>angesagt: ${esc(r.saidLabel)} – ${r.truth ? 'stimmt!' : 'gelogen!'} ${esc(name(r.loser))} verliert ${r.amount === 2 ? 'zwei Deckel' : 'einen Deckel'}.</small>`;
    } else if (mx.prev) {
      said = `<small>${esc(name(mx.prev.by))} sagt</small><b data-k="pv${mx.prev.value}-${mx.prev.by}">${esc(mx.prev.label)}</b>`;
    } else {
      said = '<small>Neue Runde</small><b data-k="nr">–</b>';
    }
    const peek = isMe && mx.step === 'rolled' && G.mxPeek === mx.rollId;
    const showDice = mx.step === 'reveal' && mx.reveal ? mx.reveal.dice : peek ? mx.myDice : null;
    const cupCls = `mx-cup ${showDice ? 'lifted' : ''} ${isMe && mx.step === 'rolled' ? 'can-peek' : ''}`;
    const table = `<div class="mx-table">
      <div class="mx-said" aria-live="polite">${said}</div>
      <button class="${cupCls}" id="mxCupO" type="button" aria-label="${showDice ? `Würfel: ${showDice.join(' und ')}` : isMe && mx.step === 'rolled' ? 'Becher antippen, um heimlich zu schauen' : 'Würfelbecher'}">
        <span class="mx-dice">${showDice ? showDice.map((n, i) => MX_DIE(n, `md${mx.rollId}-${i}-${mx.step}`)).join('') : ''}</span>${CUP_SVG}
      </button></div>`;
    let status = '', actions = '';
    if (!me) {
      status = mx.step === 'reveal' ? 'Aufgedeckt!' : `${esc(name(mx.cur))} ist dran`;
    } else if (mx.step === 'reveal') {
      status = 'Aufgedeckt!';
    } else if (!isMe) {
      status = (mx.lives[me.id] || 0) <= 0 ? 'Du bist raus – schau zu, wer gewinnt.' : `${esc(name(mx.cur))} ist dran …`;
    } else if (mx.step === 'decide') {
      status = 'Du bist dran!';
      if (!mx.prev) actions = '<button data-mx="roll">🎲 Würfeln</button>';
      else if (mx.prev.value === 21) actions = '<button data-mx="reveal">Aufdecken!</button><button class="ghost" data-mx="believe">Aufgeben (1 Deckel)</button>';
      else actions = '<button data-mx="reveal">Aufdecken!</button><button class="ghost" data-mx="believe">Glauben &amp; würfeln</button>';
    } else if (mx.step === 'rolled') {
      const val = mx.myDice ? mxVal(mx.myDice) : null;
      const minIdx = mx.prev ? mx.ladder.findIndex((x) => x.v === mx.prev.value) + 1 : 0;
      const valIdx = mx.ladder.findIndex((x) => x.v === val);
      const canTruth = valIdx >= minIdx;
      status = peek ? (canTruth ? `Du hast <b>${esc(mx.ladder[valIdx].label)}</b>. Was sagst du an?` : `Nur <b>${esc(mx.ladder[valIdx].label)}</b> – das reicht nicht. Bluffen!`) : 'Tippe auf den Becher, um heimlich zu schauen.';
      actions = `<div class="mx-say" role="group" aria-label="Ansage wählen">${mx.ladder.slice(minIdx).map((x) => `<button class="ghost ${peek && x.v === val ? 'truth' : ''}" data-say="${x.v}">${esc(x.label)}</button>`).join('')}</div>`;
    }
    return `<div class="mx-online ${me ? 'phone' : 'screen'}">${players}${table}
      <p class="mx-status" role="status">${status}</p><div class="mx-actions">${actions}</div>
      <ol class="mx-log">${[...mx.log].reverse().map((l, i) => `<li data-k="lg${mx.log.length - i}-${esc(l).length}">${esc(l)}</li>`).join('')}</ol></div>`;
  }

  /* ---------- Montagsmaler ---------- */
  const W = 1000, H = 750;
  const canvasHtml = (k, cls = '') => `<div class="dr-paper ${cls}"><canvas class="dr-canvas" data-k="${k}" width="${W}" height="${H}" aria-label="Zeichenfläche"></canvas></div>`;
  const maskHtml = (dr) => dr.word ? `<span class="dr-word">${esc(dr.word)}</span>` : dr.mask ? `<span class="dr-mask" aria-label="${dr.mask.filter((c) => c === '_').length} Buchstaben">${dr.mask.map((c) => (c === ' ' ? '<i class="sp"></i>' : `<i class="${c === '_' ? '' : 'hint'}">${c === '_' ? '' : esc(c)}</i>`)).join('')}</span>` : '';
  const feedHtml = (dr) => `<ul class="dr-feed">${dr.feed.map((f, i) => `<li data-k="f${dr.turn}-${i}" class="${f.ok ? 'ok' : ''}"><b>${esc(f.n)}</b> ${f.ok ? `hat es erraten! <em>+${f.pts}</em>` : esc(f.t)}</li>`).join('')}</ul>`;
  function drScores(s) {
    const dr = s.dr;
    return `<ol class="dr-scores">${sortScore(s).map((p) => `<li data-k="ds${p.id}" class="${p.id === dr.drawer ? 'drawer' : ''} ${dr.guessed.includes(p.id) ? 'got' : ''}">${av(p)}<span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('')}</ol>`;
  }
  function drHost(s) {
    const dr = s.dr;
    const P = byId(s);
    if (s.phase === 'END') return `<div class="gp-end"><h2>Endstand</h2>${podium(sortScore(s).map((p) => ({ name: p.name, score: p.score })))}</div>`;
    const drawer = P[dr.drawer] || { name: '?' };
    let top;
    if (s.phase === 'CHOOSE') top = `<p class="dr-top">${av(drawer)} <b>${esc(drawer.name)}</b> sucht sich ein Wort aus …</p>`;
    else if (s.phase === 'DRAW') top = `<p class="dr-top">${av(drawer)} <b>${esc(drawer.name)}</b> zeichnet ${maskHtml(dr)}</p>`;
    else top = `<p class="dr-top reveal">Das Wort war <b>${esc(dr.last?.word || dr.word || '')}</b> · ${dr.last?.guessed || 0} ${dr.last?.guessed === 1 ? 'Person hat' : 'Personen haben'} es erraten</p>`;
    return `<div class="dr-host"><div class="dr-main">${top}${timerBar()}${canvasHtml('cv-host')}</div>
      <aside class="dr-side"><h3>Raten</h3>${feedHtml(dr)}<h3>Punkte</h3>${drScores(s)}<p class="muted small">Zeichnung ${dr.turn} von ${dr.turns}</p></aside></div>`;
  }
  function drPhone(s) {
    const dr = s.dr;
    const P = byId(s);
    const meDraw = dr.drawer === s.me.id;
    const drawer = P[dr.drawer] || { name: '?' };
    if (s.phase === 'CHOOSE') {
      if (meDraw) return `<div class="dr-choose"><p class="kick">Du zeichnest!</p><h2>Such dir ein Wort aus</h2>${timerBar()}
        <div class="dr-choices">${(dr.choices || []).map((w, i) => `<button data-choose="${i}" style="animation-delay:${i * 0.07}s">${esc(w)}</button>`).join('')}</div></div>`;
      return `<div class="gp-wait"><p class="kick">Zeichnung ${dr.turn} von ${dr.turns}</p>${av(drawer, 'big-av')}<p class="big">${esc(drawer.name)} wählt ein Wort …</p>${timerBar()}</div>`;
    }
    if (s.phase === 'DRAW') {
      if (meDraw) {
        return `<div class="dr-phone draw"><div class="dr-head"><span>Zeichne:</span> ${maskHtml(dr)}</div>${timerBar()}
          ${canvasHtml('cv-me', 'can-draw')}
          <div class="dr-tools" role="toolbar" aria-label="Stift">
            <div class="dr-colors">${dr.colors.map((c) => `<button class="sw ${G.pen.c === c ? 'on' : ''} ${c === '#ffffff' ? 'eraser' : ''}" data-pen-c="${c}" style="--c:${c}" aria-label="${c === '#ffffff' ? 'Radiergummi' : 'Farbe'}">${c === '#ffffff' ? '🧽' : ''}</button>`).join('')}</div>
            <div class="dr-widths">${dr.widths.map((w) => `<button class="wd ${G.pen.w === w ? 'on' : ''}" data-pen-w="${w}" aria-label="Strichstärke ${w}"><i style="--s:${Math.max(4, w / 2.2)}px"></i></button>`).join('')}
              <button class="ghost" data-undo aria-label="Rückgängig">↶</button><button class="ghost" data-clear aria-label="Alles löschen">🗑</button></div>
          </div>
          <p class="muted small center">${dr.guessed.length} von ${s.players.length - 1} haben es erraten</p></div>`;
      }
      const got = dr.gotPts;
      return `<div class="dr-phone guess"><div class="dr-head">${av(drawer)}<span>${esc(drawer.name)} zeichnet</span> ${maskHtml(dr)}</div>${timerBar()}
        ${canvasHtml('cv-me')}
        ${got ? `<p class="dr-got">Richtig! <b>+${got}</b></p>` : `<form class="dr-guess" id="drGuess"><input name="g" data-k="gin" maxlength="40" autocomplete="off" autocapitalize="sentences" placeholder="Was ist das?" aria-label="Dein Tipp"><button>Raten</button></form>`}
        ${feedHtml(dr)}</div>`;
    }
    if (s.phase === 'REVEAL') {
      const mine = dr.gotPts;
      return `<div class="dr-phone"><div class="dr-head reveal">Das Wort war <b>${esc(dr.last?.word || dr.word || '')}</b></div>${canvasHtml('cv-me')}
        <p class="center">${meDraw ? `${dr.last?.guessed || 0} ${dr.last?.guessed === 1 ? 'Person hat' : 'Personen haben'} es erraten.` : mine ? `Du hattest es! +${mine}` : 'Diesmal nicht erraten.'}</p>${drScores(s)}</div>`;
    }
    return endPhone(sortScore(s));
  }

  // --- Tinte: Striche zeichnen, empfangen, synchronisieren ---
  function ctxOf(cv) { const c = cv.getContext('2d'); c.lineCap = 'round'; c.lineJoin = 'round'; return c; }
  function paintStroke(ctx, st, from = 0) {
    const p = st.p;
    if (p.length < 2) return;
    ctx.strokeStyle = st.c;
    ctx.fillStyle = st.c;
    ctx.lineWidth = st.w;
    if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0], p[1], st.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
    const start = Math.max(0, from - 2);
    ctx.beginPath();
    ctx.moveTo(p[start], p[start + 1]);
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }
  function redrawAll() {
    document.querySelectorAll('.dr-canvas').forEach((cv) => {
      const ctx = ctxOf(cv);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      for (const st of G.ink.strokes) paintStroke(ctx, st);
      cv.dataset.painted = String(G.ink.rev);
    });
  }
  function inkEvent(p) {
    if (!p || p.rev !== G.ink.rev) return;
    let st = G.ink.strokes[G.ink.strokes.length - 1];
    let from = 0;
    if (st && st.sid === p.sid) { from = st.p.length; st.p.push(...p.pts); }
    else { st = { sid: p.sid, c: p.c, w: p.w, p: p.pts.slice() }; G.ink.strokes.push(st); }
    document.querySelectorAll('.dr-canvas').forEach((cv) => paintStroke(ctxOf(cv), st, from));
  }
  async function inkSync(s) {
    if (!s.dr) return;
    const want = s.dr.inkRev;
    if (G.ink.rev === want) {
      document.querySelectorAll('.dr-canvas').forEach((cv) => { if (cv.dataset.painted !== String(want)) redrawAll(); });
      return;
    }
    G.ink = { rev: want, strokes: [] };
    redrawAll();
    const r = await G.sock.emit('strokes');
    if (r.ok && r.rev === want && G.ink.rev === want) {
      // was in der Zwischenzeit schon live ankam, nicht verlieren
      const extra = G.ink.strokes.filter((m) => !r.strokes.some((x) => x.sid === m.sid));
      G.ink = { rev: want, strokes: r.strokes.concat(extra) };
      redrawAll();
    }
  }
  const pen = { st: null, buf: [], timer: null, n: 0 };
  function flushInk() {
    if (!pen.st || !pen.buf.length) return;
    G.sock.emit('ink', { sid: pen.st.sid, c: pen.st.c, w: pen.st.w, pts: pen.buf.splice(0, 600), rev: G.ink.rev });
  }
  function bindCanvas() {
    const cv = app.querySelector('.can-draw .dr-canvas');
    if (!cv || cv.dataset.bound) return;
    cv.dataset.bound = '1';
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)]; };
    const canDraw = () => G.s && G.s.game === 'draw' && G.s.phase === 'DRAW' && G.s.dr.drawer === G.s.me?.id;
    cv.addEventListener('pointerdown', (e) => {
      if (!canDraw()) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch {}
      const [x, y] = pos(e);
      pen.st = { sid: `${Date.now().toString(36)}${++pen.n}`, c: G.pen.c, w: G.pen.w, p: [x, y] };
      G.ink.strokes.push(pen.st);
      pen.buf = [x, y];
      document.querySelectorAll('.dr-canvas').forEach((c) => paintStroke(ctxOf(c), pen.st));
      clearInterval(pen.timer);
      pen.timer = setInterval(flushInk, 60);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pen.st) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const from = pen.st.p.length;
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = pos(ev);
        const lx = pen.st.p[pen.st.p.length - 2], ly = pen.st.p[pen.st.p.length - 1];
        if (Math.abs(x - lx) + Math.abs(y - ly) < 3) continue;
        pen.st.p.push(x, y);
        pen.buf.push(x, y);
      }
      if (pen.st.p.length > from) document.querySelectorAll('.dr-canvas').forEach((c) => paintStroke(ctxOf(c), pen.st, from));
    });
    const end = () => { if (!pen.st) return; clearInterval(pen.timer); flushInk(); pen.st = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  /* ---------- Nach jedem Zeichnen ---------- */
  function afterRender(s, fresh) {
    if (s.game === 'draw') {
      inkSync(s);
      bindCanvas();
      if (fresh && s.phase === 'REVEAL' && window.VH && s.dr?.last?.guessed) VH.confetti({ count: 40 });
    }
    if (s.game === 'maexchen' && s.mx) {
      const cup = document.getElementById('mxCupO');
      if (cup && G.mxShook !== s.mx.rollId && s.mx.step === 'rolled') {
        G.mxShook = s.mx.rollId;
        cup.classList.remove('shake'); void cup.offsetWidth; cup.classList.add('shake');
      }
      if (s.phase === 'END' && fresh && window.VH) VH.confetti();
    }
    if (s.game === 'kniffel' && s.kn?.last && s.kn.last.key === 'kniffel' && s.kn.last.points === 50 && G.knParty !== s.kn.rollId && window.VH) { G.knParty = s.kn.rollId; VH.confetti({ count: 80 }); }
  }

  /* ---------- Handy ---------- */
  function startPlayer(code) {
    G.mode = 'player';
    G.code = code;
    app.className = 'gp gp-player';
    app.innerHTML = '<p class="muted center">Verbinde …</p>';
    G.sock = new Sock(code, {
      onOpen: async () => {
        G.connected = true;
        const j = store.get('gp-join-' + code) || {};
        const r = await G.sock.emit('join', { name: j.name, token: j.token, hostKey: j.hostKey });
        if (!r.ok) { G.sock.closed = true; store.del('gp-join-' + code); history.replaceState(null, '', '/spiele/gruppe/?room=' + code); return renderStart(r.error); }
        store.set('gp-join-' + code, { name: j.name, token: r.token, hostKey: j.hostKey });
        history.replaceState(null, '', '/spiele/gruppe/?room=' + code);
      },
      onClose: () => { G.connected = false; },
      onState: (s) => { clock.sync(s.serverNow); const prev = G.s; G.s = s; renderPlayer(prev); },
      onEvent: (e) => { if (e === 'kicked') { G.sock.closed = true; store.del('gp-join-' + code); renderStart('Du wurdest aus dem Raum entfernt.'); } },
      onGone: () => renderStart('Der Raum ist abgelaufen.'),
    });
  }

  function selfHostLobby(s) {
    const host = s.me.host;
    const P = s.players;
    const key = store.get('gp-host-' + s.code) || '';
    return `<div class="sh-lobby">
      <p class="kick">${ICON[s.game]} ${esc(s.gameName)}</p>
      <div class="sh-code"><span class="muted">Raumcode</span><p class="gp-tiles small">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</p></div>
      ${host ? `<div class="sh-invite"><div class="gp-qr small">${qr(joinUrl())}</div>
        <div><p class="muted small">Freunde scannen den QR-Code oder öffnen <b>${esc(location.host)}/spiele/gruppe</b> und geben den Code ein.</p>
        <button class="ghost small" data-share>📨 Einladung teilen</button></div></div>` : '<p class="muted">Gleich geht’s los – die Spielleitung startet.</p>'}
      <div class="gp-people">${P.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'}" data-k="c${p.id}">${av(p)}<b>${esc(p.name)}</b>${p.id === s.hostPlayer ? ' 👑' : ''}${host && p.id !== s.me.id ? `<button class="x" data-kick="${p.id}" title="Entfernen">✕</button>` : ''}</span>`).join('')}</div>
      ${host ? `${settingsHtml(s)}<button class="big" data-host="start" ${P.length < 2 ? 'disabled' : ''}>${P.length < 2 ? 'Warte auf Mitspielende …' : 'Los geht’s'}</button>
        ${key ? `<p class="muted small center"><a href="/spiele/gruppe/#host=${esc(s.code)}&k=${encodeURIComponent(key)}" target="_blank" rel="noopener">📺 Zusätzlich auf einem Fernseher zeigen</a></p>` : ''}` : ''}
    </div>`;
  }

  function renderPlayer(prev) {
    const s = G.s;
    if (!s.me) return;
    const key = `${s.phase}-${s.round}`;
    const fresh = key !== G.lastPhaseKey;
    // Beim Schreiben nicht neu zeichnen, solange man tippt (sonst springt der Cursor)
    if (!fresh && s.phase === 'WRITING' && document.querySelector('.slf-form')) {
      const btn = document.getElementById('slfStop');
      if (btn) btn.disabled = !!s.stoppedBy;
      const st = document.getElementById('slfStopped');
      if (st) st.textContent = s.stoppedBy ? `✋ ${s.stoppedBy} ist fertig – noch 10 Sekunden!` : '';
      return;
    }
    G.lastPhaseKey = key;
    const bodyKey = s.game === 'kniffel' || s.game === 'maexchen' ? s.phase : s.game === 'draw' ? `${s.phase}-${s.dr?.turn || 0}` : key;
    const top = `<header class="gp-me">${av(s.me)}<b>${esc(s.me.name)}</b>${s.me.host ? '<span class="crown" title="Spielleitung">👑</span>' : ''}<span class="pts">${s.game === 'maexchen' ? `${s.mx?.lives?.[s.me.id] ?? s.settings.lives} Deckel` : `${s.me.score} Pkt`}</span><span class="code">${esc(s.code)}</span></header>`;
    let body = '';
    if (s.phase === 'LOBBY') {
      body = s.selfHost ? selfHostLobby(s) : `<div class="gp-wait"><p class="big">Du bist drin!</p><p class="muted">Gleich geht’s los. Schau auf den Bildschirm.</p><div class="gp-people">${s.players.map((p) => `<span class="gp-chip" data-k="c${p.id}">${av(p)}<b>${esc(p.name)}</b></span>`).join('')}</div></div>`;
    } else if (s.game === 'wwe') {
      if (s.phase === 'QUESTION') {
        body = s.myVote
          ? `<div class="gp-wait"><p class="big">Abgestimmt ✓</p><p class="muted">Du hast ${esc(s.players.find((p) => p.id === s.myVote)?.name || '')} gewählt. Warte auf die anderen …</p></div>`
          : `<p class="kick">Wer würde eher …</p><h2 class="wwe-phone-q">${esc(s.question.replace(/^… ?/, ''))}</h2>${timerBar()}
            <div class="gp-pick">${s.players.map((p, i) => `<button data-vote="${p.id}" data-k="p${p.id}" style="animation-delay:${i * 0.04}s">${av(p)}<b>${esc(p.name)}</b></button>`).join('')}</div>`;
      } else if (s.phase === 'RESULT') {
        const mine = s.result.ranking.find((r) => r.id === s.me.id);
        body = `<div class="gp-wait"><p class="kick">Ergebnis</p><p class="big">${s.result.winners.length ? s.result.winners.map(esc).join(' & ') : 'Niemand'}</p>
          <p class="muted">${mine ? `Für dich gab es ${mine.votes} ${mine.votes === 1 ? 'Stimme' : 'Stimmen'}.` : 'Für dich hat niemand gestimmt.'}</p></div>`;
      } else {
        body = endPhone(s.awards.players);
      }
    } else if (s.game === 'kniffel') {
      body = s.phase === 'PLAYING' ? knPhone(s) : endPhone(sortScore(s));
      // Hinweis, wenn man an die Reihe kommt
      if (s.phase === 'PLAYING' && s.kn.current === s.me.id && prev?.kn && prev.kn.current !== s.me.id) { vibrate([60, 60, 60]); toast('Du bist dran! 🎲'); }
    } else if (s.game === 'maexchen') {
      body = mxHtml(s, s.me);
      if (s.phase === 'PLAYING' && s.mx.cur === s.me.id && s.mx.step === 'decide' && prev?.mx && (prev.mx.cur !== s.me.id || prev.mx.step !== 'decide')) vibrate([60, 60, 60]);
    } else if (s.game === 'draw') {
      body = drPhone(s);
      if (s.phase === 'CHOOSE' && s.dr.drawer === s.me.id && fresh) vibrate([60, 60, 60]);
    } else {
      if (s.phase === 'WRITING') {
        const vals = s.myAnswers || {};
        const final = s.done && s.done.includes(s.me.id);
        body = final
          ? `<div class="gp-wait"><div class="slf-letter small"><span>${esc(s.letter)}</span></div><p class="big">Abgegeben ✓</p><p class="muted">Warte, bis die Zeit um ist …</p></div>`
          : `<div class="slf-top"><div class="slf-letter small spin"><span>${esc(s.letter)}</span></div>${timerBar()}</div>
            <p class="slf-stop" id="slfStopped">${s.stoppedBy ? `✋ ${esc(s.stoppedBy)} ist fertig – noch 10 Sekunden!` : ''}</p>
            <form class="slf-form" id="slfForm">${s.settings.categories.map((c) => `<label>${esc(c)}<input name="${esc(c)}" value="${esc(vals[c] || '')}" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="${esc(s.letter)} …"></label>`).join('')}
            <div class="row"><button type="button" class="ghost" id="slfStop" ${s.stoppedBy ? 'disabled' : ''}>✋ Stopp!</button><button>Abgeben</button></div></form>`;
      } else if (s.phase === 'REVIEW') {
        const auto = new Set(s.auto);
        body = `<p class="kick">Buchstabe ${esc(s.letter)} – Antworten prüfen</p><p class="muted small">Tippe auf eine Antwort, die nicht zählen soll. Nochmal tippen nimmt es zurück.</p>
          ${s.settings.categories.map((c) => `<div class="slf-cat"><h3>${esc(c)}</h3><div class="slf-ans">${s.players.map((p) => {
            const v = s.answers[p.id]?.[c] || '';
            const k = `${p.id}|${c}`;
            const fl = s.flags[k] || [];
            const mine = p.id === s.me.id;
            const flagged = fl.includes(s.me.id);
            return `<button class="a ${mine ? 'mine' : ''} ${flagged ? 'flagged' : ''} ${auto.has(k) ? 'auto' : ''} ${!v ? 'empty' : ''}" ${mine || !v || auto.has(k) ? 'disabled' : ''} data-flag="${p.id}" data-cat="${esc(c)}"><small>${esc(p.name)}</small>${v ? esc(v) : '–'}${fl.length ? ` <em>👎 ${fl.length}</em>` : ''}</button>`;
          }).join('')}</div></div>`).join('')}`;
      } else if (s.phase === 'SCORES') {
        const pts = s.roundScores.scores[s.me.id] || 0;
        const rank = sortScore(s).findIndex((p) => p.id === s.me.id) + 1;
        body = `<div class="gp-wait"><p class="kick">Runde ${s.round}</p><p class="big pop">+${pts}</p><p class="muted">Gesamt ${s.me.score} Punkte, Platz ${rank} von ${s.players.length}</p>
          <ul class="slf-mine">${s.settings.categories.map((c) => `<li><span>${esc(c)}</span><b>${esc(s.answers[s.me.id]?.[c] || '–')}</b><em class="p${s.roundScores.detail[s.me.id]?.[c] ?? 0}">${s.roundScores.detail[s.me.id]?.[c] ?? 0}</em></li>`).join('')}</ul></div>`;
      } else {
        body = endPhone(sortScore(s));
      }
    }
    if (s.me.host && s.selfHost && s.phase !== 'LOBBY') {
      body += s.phase === 'END'
        ? `<div class="sh-ctl"><button data-host="restart">🔁 Nochmal spielen</button></div>`
        : `<details class="sh-ctl"><summary>Spielleitung</summary><button class="ghost small" data-host="next">${s.game === 'draw' ? (s.phase === 'DRAW' ? 'Runde beenden' : 'Weiter') : 'Zug überspringen'}</button><button class="ghost small" data-host="restart">Zurück in den Warteraum</button></details>`;
    }
    app.className = `gp gp-player g-${s.game}`;
    morph(app, `${top}<main class="gp-phone"><div class="gp-body" data-k="${bodyKey}">${body}</div></main>${G.connected ? '' : '<p class="warn center">Verbindung unterbrochen …</p>'}`);
    bindPlayer();
    runTimer();
    afterRender(s, fresh);
    if (s.phase === 'WRITING' && fresh) setTimeout(() => document.querySelector('#slfForm input')?.focus(), reduced() ? 0 : 2900);
    if (s.phase === 'END' && fresh && s.game !== 'maexchen') {
      const list = s.game === 'wwe' ? s.awards.players : sortScore(s);
      if (list[0] && list[0].name === s.me.name && window.VH) VH.confetti();
    }
  }

  function endPhone(list) {
    const i = list.findIndex((p) => p.name === G.s.me.name);
    return `<div class="gp-wait"><p class="kick">Spielende</p><p class="big">${i === 0 ? 'Platz 1! 🎉' : `Platz ${i + 1}`}</p><p class="muted">${list[i] ? `${list[i].score} ${list[i].score === 1 ? 'Punkt' : 'Punkte'}` : ''}</p>
      <ol class="gp-rest">${list.map((p) => `<li>${esc(p.name)} <b>${p.score}</b></li>`).join('')}</ol></div>`;
  }

  function bindPlayer() {
    app.querySelectorAll('[data-vote]').forEach((b) => (b.onclick = async () => {
      app.querySelectorAll('[data-vote]').forEach((x) => (x.disabled = true));
      b.classList.add('chosen');
      vibrate(30);
      const r = await act('vote', { targetId: b.dataset.vote });
      if (!r.ok) app.querySelectorAll('[data-vote]').forEach((x) => (x.disabled = false));
    }));
    const f = document.getElementById('slfForm');
    if (f) {
      const values = () => Object.fromEntries([...f.querySelectorAll('input')].map((i) => [i.name, i.value]));
      f.oninput = () => { clearTimeout(G.typing); G.typing = setTimeout(() => G.sock.emit('answers', { values: values() }), 700); };
      f.onsubmit = async (e) => { e.preventDefault(); clearTimeout(G.typing); G.lastPhaseKey = ''; await act('answers', { values: values(), final: true }); };
      document.getElementById('slfStop').onclick = async () => {
        clearTimeout(G.typing);
        await G.sock.emit('answers', { values: values() });
        await act('stop');
      };
    }
    app.querySelectorAll('[data-flag]').forEach((b) => (b.onclick = () => act('flag', { playerId: b.dataset.flag, cat: b.dataset.cat })));
    // Kniffel
    app.querySelectorAll('[data-hold]').forEach((b) => (b.onclick = () => {
      b.classList.toggle('held');
      vibrate(15);
      act('hold', { index: +b.dataset.hold });
    }));
    const rb = app.querySelector('[data-roll]');
    if (rb) rb.onclick = async () => {
      rb.disabled = true;
      app.querySelectorAll('.kn-die:not(.held)').forEach((d) => d.classList.add('shake'));
      vibrate([20, 40, 20]);
      const r = await act('roll');
      if (!r.ok) { rb.disabled = false; app.querySelectorAll('.kn-die.shake').forEach((d) => d.classList.remove('shake')); }
    };
    app.querySelectorAll('[data-score]').forEach((b) => (b.onclick = async () => {
      app.querySelectorAll('[data-score]').forEach((x) => (x.disabled = true));
      b.classList.add('chosen');
      const r = await act('score', { key: b.dataset.score });
      if (!r.ok) app.querySelectorAll('[data-score]').forEach((x) => (x.disabled = false));
    }));
    // Mäxchen
    app.querySelectorAll('[data-mx]').forEach((b) => (b.onclick = async () => {
      app.querySelectorAll('[data-mx]').forEach((x) => (x.disabled = true));
      const r = await act('mx', { action: b.dataset.mx });
      if (!r.ok) app.querySelectorAll('[data-mx]').forEach((x) => (x.disabled = false));
    }));
    app.querySelectorAll('[data-say]').forEach((b) => (b.onclick = async () => {
      if (G.mxPeek !== G.s.mx.rollId && !confirm('Du hast noch nicht unter den Becher geschaut. Trotzdem ansagen?')) return;
      app.querySelectorAll('[data-say]').forEach((x) => (x.disabled = true));
      const r = await act('mx', { action: 'say', value: +b.dataset.say });
      if (!r.ok) app.querySelectorAll('[data-say]').forEach((x) => (x.disabled = false));
    }));
    const cup = document.getElementById('mxCupO');
    if (cup) cup.onclick = () => {
      const mx = G.s.mx;
      if (!(mx && mx.cur === G.s.me?.id && mx.step === 'rolled')) return;
      G.mxPeek = G.mxPeek === mx.rollId ? -1 : mx.rollId;
      vibrate(10);
      renderPlayer(G.s);
    };
    // Spielleitung am Handy (Mäxchen, Montagsmaler)
    app.querySelectorAll('[data-host]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      await act(b.dataset.host);
      b.disabled = false;
    }));
    app.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => act('kick', { playerId: b.dataset.kick })));
    bindSettings();
    const share = app.querySelector('[data-share]');
    if (share) share.onclick = async () => {
      const url = joinUrl();
      const text = `Spiel mit: ${G.s.gameName} – Code ${G.code}`;
      try { if (navigator.share) await navigator.share({ title: G.s.gameName, text, url }); else { await navigator.clipboard.writeText(url); toast('Link kopiert'); } } catch {}
    };
    // Montagsmaler
    app.querySelectorAll('[data-choose]').forEach((b) => (b.onclick = () => { app.querySelectorAll('[data-choose]').forEach((x) => (x.disabled = true)); act('choose', { index: +b.dataset.choose }); }));
    app.querySelectorAll('[data-pen-c]').forEach((b) => (b.onclick = () => { G.pen.c = b.dataset.penC; if (G.pen.c === '#ffffff' && G.pen.w < 30) G.pen.w = 30; renderPlayer(G.s); }));
    app.querySelectorAll('[data-pen-w]').forEach((b) => (b.onclick = () => { G.pen.w = +b.dataset.penW; renderPlayer(G.s); }));
    const ub = app.querySelector('[data-undo]');
    if (ub) ub.onclick = () => { flushInk(); act('undo'); };
    const cb = app.querySelector('[data-clear]');
    if (cb) cb.onclick = () => { if (confirm('Ganze Zeichnung löschen?')) act('clear'); };
    const gf = document.getElementById('drGuess');
    if (gf) gf.onsubmit = async (e) => {
      e.preventDefault();
      const v = gf.g.value.trim();
      if (!v) return;
      gf.g.value = '';
      const r = await act('guess', { text: v });
      if (r.ok && r.correct) { vibrate([40, 30, 80]); if (window.VH) VH.confetti({ count: 50 }); }
      else if (r.ok && r.close) { toast('Ganz knapp daneben!'); vibrate(20); }
      document.querySelector('#drGuess input')?.focus();
    };
  }

  /* ---------- Einstieg ---------- */
  const hash = (location.hash || '').match(/host=([A-Z0-9]{4})(?:&k=([^&]+))?/i);
  const room = normCode(new URLSearchParams(location.search).get('room'));
  if (hash) startHost(normCode(hash[1]), hash[2] ? decodeURIComponent(hash[2]) : null);
  else if (room && store.get('gp-join-' + room)?.token) startPlayer(room);
  else renderStart();
})();
