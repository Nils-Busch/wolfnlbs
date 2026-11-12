/**
 * Gruppenspiele: „Wer würde eher …?“, Stadt-Land-Fluss, Kniffel, Mäxchen online, Montagsmaler
 * und die Teamspiele Agentenrunde und Erklärbär.
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
  const ICON = { wwe: '🫵', slf: '🔤', kniffel: '🎲', maexchen: '🥤', draw: '🖍️', agent: '🕵️', explain: '🐻' };
  const SELF_HOST = new Set(['maexchen', 'draw', 'agent', 'explain']);
  const TEAM_GAMES = new Set(['agent', 'explain']);
  const TEAM = ['Rot', 'Blau'];

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
    ['agent', 'Agentenrunde', 'Team Rot gegen Team Blau: 25 Wörter, je Team ein Funker mit Geheimkarte. Ein Wort als Hinweis, das Team tippt die passenden Karten an.', 'Teams ab 4 Personen'],
    ['explain', 'Erklärbär', 'Begriffe gegen die Uhr erklären, ohne die fünf verbotenen Wörter zu sagen. Das andere Team liest mit und drückt „Verboten!“.', 'Teams ab 4 Personen'],
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
    if (window.VH && VH.sound) VH.sound.toggleButton();
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
  const pname = (p) => `${p.bot ? '🤖 ' : ''}${esc(p.name)}`;

  /* ---------- Spieleabend ---------- */
  const GAME_LIST = ['wwe', 'slf', 'kniffel', 'maexchen', 'draw', 'agent', 'explain'];
  function gamePicker(s, label = 'Spiel wählen') {
    return `<div class="ev-pick"><p class="muted small">${label}</p><div class="ev-games">${GAME_LIST.map((g) => `<button type="button" class="ev-game ${g === s.game ? 'on' : ''}" data-switch="${g}" ${g === s.game && s.phase === 'LOBBY' ? 'aria-pressed="true"' : ''}>${ICON[g]} ${esc(s.games?.[g] || g)}</button>`).join('')}</div></div>`;
  }
  function eveningTable(s) {
    const ev = s.evening;
    if (!ev) return '';
    return `<section class="ev-table"><h3>🏆 Spieleabend <span>${ev.played.length} ${ev.played.length === 1 ? 'Spiel' : 'Spiele'}</span></h3>
      <ol>${ev.ranking.map((r, i) => `<li data-k="ev${r.id}" class="${G.s?.me?.id === r.id ? 'me' : ''}"><span class="pl">${i + 1}</span><span class="n">${esc(r.name)}</span><span class="w" title="${r.wins} Siege">${'🥇'.repeat(Math.min(r.wins, 3))}</span><b>${r.points}</b></li>`).join('')}</ol>
      <p class="muted small">Platz 1 bekommt 10 Abendpunkte, Platz 2 sieben, dann 5, 3, 2 und 1.</p></section>`;
  }
  function finaleHtml(s) {
    const ev = s.evening;
    if (!ev) return '<p class="muted center">Noch kein Spiel beendet.</p>';
    return `<div class="ev-finale">
      <p class="kick">Siegerehrung</p><h2>Der Spieleabend</h2>
      ${podium(ev.ranking.map((r) => ({ name: r.name, score: r.points })))}
      ${ev.titles.length ? `<ul class="ev-titles">${ev.titles.map((t, i) => `<li style="animation-delay:${1.2 + i * 0.15}s"><span class="ic">${ICON[t.game]}</span><b>${esc(t.title)}</b><span>${esc(t.name)}${t.times > 1 ? ` · ${t.times}×` : ''}</span></li>`).join('')}</ul>` : ''}
      <p class="ev-played">${ev.played.map((r) => `<span>${ICON[r.game]} ${esc(r.name)}${r.winner ? `: ${esc(r.winner)}` : ''}</span>`).join('')}</p>
      ${galleryHtml(s)}
    </div>`;
  }

  /* ---------- Bilder des Abends (Montagsmaler) ---------- */
  function galleryHtml(s) {
    const list = s.galleryMeta || [];
    if (!list.length) return '';
    return `<section class="gal"><h3>🖍️ Bilder des Abends</h3><div class="gal-grid">${list.map((m) => `<figure class="gal-it" data-k="g${m.i}-${esc(m.word)}"><canvas class="gal-cv" data-gal="${m.i}" width="400" height="300" aria-label="Zeichnung: ${esc(m.word)}"></canvas>
      <figcaption><b>${esc(m.word)}</b> <span>von ${esc(m.drawer)}</span></figcaption><button type="button" class="ghost small" data-dl="${m.i}">⬇ Bild speichern</button></figure>`).join('')}</div></section>`;
  }
  G.gal = {};
  async function galleryLoad() {
    for (const cv of document.querySelectorAll('canvas[data-gal]')) {
      const i = cv.dataset.gal;
      if (cv.dataset.loaded === '1') continue;
      cv.dataset.loaded = '1';
      if (!G.gal[i]) { const r = await G.sock.emit('galleryItem', { i: +i }); if (!r.ok) continue; G.gal[i] = r; }
      const ctx = ctxOf(cv);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 300);
      ctx.save(); ctx.scale(0.4, 0.4);
      for (const st of G.gal[i].strokes) paintStroke(ctx, st);
      ctx.restore();
    }
  }
  function galleryDownload(i) {
    const g = G.gal[i];
    if (!g) return;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H + 70;
    const ctx = ctxOf(cv);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (const st of g.strokes) paintStroke(ctx, st);
    ctx.fillStyle = '#172036'; ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(`${g.word} – gezeichnet von ${g.drawer}`, 24, H + 46);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `montagsmaler-${g.word.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Schlüssel der Hülle: Animationen laufen nur, wenn er sich ändert
  function phaseKey(s, key) {
    if (s.game === 'kniffel' || s.game === 'maexchen') return s.phase;
    if (s.game === 'draw') return `${s.phase}-${s.dr?.turn || 0}`;
    if (s.game === 'agent') return `${s.phase === 'BOARD' ? 'PLAYING' : s.phase}-${s.ag?.match || 0}`;
    if (s.game === 'explain') return `${s.phase}-${s.ex?.turnNo || 0}`;
    return key;
  }

  function renderHost() {
    const s = G.s;
    const key = `${s.phase}-${s.round}`;
    const fresh = key !== G.lastPhaseKey;
    G.lastPhaseKey = key;
    const bodyKey = phaseKey(s, key);
    const head = `<header class="gp-bar"><span class="t">${s.phase === 'FINALE' ? '🏆 Spieleabend' : `${ICON[s.game] || ''} ${esc(s.gameName)}`}</span>${s.round && s.game !== 'maexchen' && !TEAM_GAMES.has(s.game) && s.phase !== 'FINALE' && s.phase !== 'LOBBY' ? `<span class="r">Runde ${s.round} von ${s.settings.rounds}</span>` : ''}${s.game === 'agent' && s.ag && s.settings.rounds > 1 && s.phase !== 'LOBBY' && s.phase !== 'FINALE' ? `<span class="r">Partie ${s.ag.match} von ${s.settings.rounds}</span>` : ''}${s.game === 'explain' && s.ex && !['LOBBY', 'FINALE', 'END'].includes(s.phase) ? `<span class="r">Zug ${Math.min(s.ex.turnNo + 1, s.ex.total)} von ${s.ex.total}</span>` : ''}<span class="code">${esc(s.code)}</span>${G.connected ? '' : '<span class="warn">Verbindung unterbrochen …</span>'}</header>`;
    let body = '';
    let foot = '';
    if (s.phase === 'LOBBY') {
      body = `<div class="gp-lobby">
        <div class="gp-joininfo">
          <div class="gp-qr">${qr(joinUrl())}</div>
          <div><p class="muted">Am Handy öffnen:</p><p class="url">${esc(location.host)}/spiele/gruppe</p><p class="muted">Code eingeben:</p>
          <p class="gp-tiles">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</p></div>
        </div>
        ${TEAM_GAMES.has(s.game) && s.players.length ? teamsHtml(s, { canMove: true, kick: true }) : `<div class="gp-people">${s.players.length ? s.players.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'}" data-k="c${p.id}">${av(p)}<b>${pname(p)}</b><button class="x" data-kick="${p.id}" title="Entfernen">✕</button></span>`).join('') : '<p class="muted">Noch niemand da. Scannt den Code!</p>'}</div>`}
        ${gamePicker(s)}
        ${settingsHtml(s)}
        ${eveningTable(s)}
      </div>`;
      foot = `<button class="big" data-host="start" ${s.players.length < (TEAM_GAMES.has(s.game) ? 4 : 2) ? 'disabled' : ''}>${ICON[s.game]} ${esc(s.gameName)} starten</button>${s.evening ? '<button class="ghost" data-host="finale">🏆 Siegerehrung</button>' : ''}`;
    } else if (s.phase === 'FINALE') {
      body = finaleHtml(s);
      foot = `<button data-host="restart">Weiter spielen</button>`;
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
    } else if (s.game === 'agent') {
      body = agHost(s);
      foot = s.phase === 'PLAYING' ? `<button class="ghost" data-host="next" title="Wenn jemand nicht reagiert">Zug beenden</button>` : s.phase === 'BOARD' ? `<button data-host="next">Nächste Partie</button>` : '';
    } else if (s.game === 'explain') {
      body = exHost(s);
      foot = s.phase === 'READY' ? `<button data-host="next">Runde starten</button>` : s.phase === 'PLAY' ? `<button class="ghost" data-host="next">Runde beenden</button>` : '';
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
    if (s.phase === 'END') {
      body += `<div class="ev-after">${s.game === 'draw' ? galleryHtml(s) : ''}${gamePicker(s, 'Als Nächstes spielen')}${eveningTable(s)}</div>`;
      foot = `<button data-host="restart">🔁 Nochmal ${esc(s.gameName)}</button><button class="ghost" data-host="finale">🏆 Siegerehrung</button>`;
    }
    app.className = `gp gp-host g-${s.game}`;
    morph(app, `${head}<main class="gp-stage"><div class="gp-body" data-k="${bodyKey}">${body}</div></main><footer class="gp-foot">${foot}<button class="ghost" data-host="full" title="Vollbild">⛶</button></footer>`);
    bindHost();
    runTimer();
    afterRender(s, fresh);
    hostSounds(G.prevHost, s);
    G.prevHost = s;
    if ((s.phase === 'END' || s.phase === 'FINALE') && fresh && window.VH) setTimeout(() => VH.confetti({ count: s.phase === 'FINALE' ? 160 : 90 }), 600);
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
      return `<form class="gp-settings" id="setForm"><label>Deckel pro Person <select name="lives">${[3, 5, 7].map((n) => `<option value="${n}" ${s.settings.lives === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Computer spielen <select name="botLevel">${[['easy', 'Leicht'], ['medium', 'Mittel'], ['hard', 'Schwer']].map(([k, l]) => `<option value="${k}" ${s.settings.botLevel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button type="button" class="ghost small" data-addbot>🤖 Computer dazuholen</button></form>`;
    }
    if (s.game === 'draw') {
      return `<form class="gp-settings" id="setForm"><label>Jede Person zeichnet <select name="rounds">${[1, 2, 3].map((n) => `<option value="${n}" ${s.settings.rounds === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label>
        <label>Zeit zum Zeichnen <select name="seconds">${[60, 80, 100, 120].map((n) => `<option value="${n}" ${s.settings.seconds === n ? 'selected' : ''}>${n} Sekunden</option>`).join('')}</select></label>
        ${s.wordsText != null ? `<details class="dr-own" ${s.settings.wordCount ? 'open' : ''}><summary>Eigene Wörter${s.settings.wordCount ? ` (${s.settings.wordCount})` : ''}</summary>
          <textarea name="words" rows="4" maxlength="6000" placeholder="Ein Wort pro Zeile, z. B. Vereinsheim, Trainer Heinz, Grillfest">${esc(s.wordsText)}</textarea>
          <label>Wörter verwenden <select name="wordMode">${[['mix', 'gemischt mit den eingebauten'], ['only', 'nur eigene Wörter'], ['off', 'nur eingebaute']].map(([k, l]) => `<option value="${k}" ${s.settings.wordMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">Die anderen sehen die Liste nicht.</p></details>` : ''}</form>`;
    }
    if (s.game === 'agent') {
      return `<form class="gp-settings" id="setForm"><label>Partien <select name="rounds">${[1, 2, 3].map((n) => `<option value="${n}" ${s.settings.rounds === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Zeit pro Zug <select name="seconds">${[[0, 'ohne Zeitlimit'], [60, '1 Minute'], [90, '1½ Minuten'], [120, '2 Minuten'], [180, '3 Minuten']].map(([n, l]) => `<option value="${n}" ${s.settings.seconds === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${s.wordsText != null ? `<details class="dr-own" ${s.settings.wordCount ? 'open' : ''}><summary>Eigene Wörter${s.settings.wordCount ? ` (${s.settings.wordCount})` : ''}</summary>
          <textarea name="words" rows="4" maxlength="6000" placeholder="Ein Wort pro Zeile, z. B. Vereinsheim, Grillfest, Sauna">${esc(s.wordsText)}</textarea>
          <label>Wörter verwenden <select name="wordMode">${[['mix', 'gemischt (bis zu 10 eigene)'], ['only', 'nur eigene (mind. 25)'], ['off', 'nur eingebaute']].map(([k, l]) => `<option value="${k}" ${s.settings.wordMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">Die anderen sehen die Liste nicht.</p></details>` : ''}</form>`;
    }
    if (s.game === 'explain') {
      return `<form class="gp-settings" id="setForm"><label>Runden pro Team <select name="rounds">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${s.settings.rounds === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Zeit pro Runde <select name="seconds">${[45, 60, 90].map((n) => `<option value="${n}" ${s.settings.seconds === n ? 'selected' : ''}>${n} Sekunden</option>`).join('')}</select></label>
        ${s.cardsText != null ? `<details class="dr-own" ${s.settings.cardCount ? 'open' : ''}><summary>Eigene Karten${s.settings.cardCount ? ` (${s.settings.cardCount})` : ''}</summary>
          <textarea name="cards" rows="5" maxlength="12000" placeholder="Eine Karte pro Zeile: Begriff: verboten, verboten, …&#10;Vereinsheim: Verein, Haus, Treffen, Feier, Bier">${esc(s.cardsText)}</textarea>
          <label>Karten verwenden <select name="cardMode">${[['mix', 'gemischt mit den eingebauten'], ['only', 'nur eigene (mind. 5)'], ['off', 'nur eingebaute']].map(([k, l]) => `<option value="${k}" ${s.settings.cardMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">Die anderen sehen die Karten erst im Spiel.</p></details>` : ''}</form>`;
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
      for (const [k, v] of new FormData(f)) { if (k === 'cat') cats.push(v); else settings[k] = /^\d+$/.test(v) ? +v : v; }
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
    bindCommon();
  }
  // Knöpfe, die Bildschirm und Handy der Spielleitung gemeinsam haben
  function bindCommon() {
    app.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => act('team', { playerId: b.dataset.move, team: +b.dataset.to })));
    app.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => act('team', { team: +b.dataset.team })));
    app.querySelectorAll('[data-switch]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.switch === G.s.game && G.s.phase === 'LOBBY') return;
      app.querySelectorAll('[data-switch]').forEach((x) => (x.disabled = true));
      await act('switchGame', { game: b.dataset.switch });
      app.querySelectorAll('[data-switch]').forEach((x) => (x.disabled = false));
    }));
    const ab = app.querySelector('[data-addbot]');
    if (ab) ab.onclick = () => act('addBot');
    app.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => galleryDownload(b.dataset.dl)));
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
        <span class="nm">${P[id] ? pname(P[id]) : '?'}${P[id] && !P[id].connected ? ' 💤' : ''}</span><span class="lives" aria-label="${mx.lives[id] || 0} Deckel">${coasters(id)}</span></li>`).join('')}</ul>`;
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


  /* ---------- Teamspiele: Agentenrunde und Erklärbär ---------- */
  const teamOf = (s, id) => s.teams?.[id];
  const teamTag = (t) => (t === 0 || t === 1 ? `<span class="tm-tag t${t}">Team ${TEAM[t]}</span>` : '');
  function teamsHtml(s, { canMove = false, kick = false } = {}) {
    const P = s.players.filter((p) => !p.bot);
    const me = s.me?.id;
    const col = (t) => {
      const list = P.filter((p) => teamOf(s, p.id) === t);
      return `<section class="tm-col t${t}" data-k="tc${t}"><h3>Team ${TEAM[t]} <span>${list.length}</span></h3>
        <div class="tm-list">${list.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'} ${p.id === me ? 'me' : ''}" data-k="tm${p.id}">${av(p)}<b>${esc(p.name)}</b>${p.id === s.hostPlayer ? ' 👑' : ''}${canMove ? `<button class="x" data-move="${p.id}" data-to="${1 - t}" title="Ins Team ${TEAM[1 - t]}" aria-label="${esc(p.name)} ins Team ${TEAM[1 - t]}">⇄</button>` : ''}${kick && p.id !== me ? `<button class="x" data-kick="${p.id}" title="Entfernen">✕</button>` : ''}</span>`).join('') || '<p class="muted small">Noch niemand</p>'}</div>
        ${me && teamOf(s, me) !== t && !canMove ? `<button type="button" class="ghost small" data-team="${t}">Ins Team ${TEAM[t]}</button>` : ''}</section>`;
    };
    const short = [0, 1].some((t) => P.filter((p) => teamOf(s, p.id) === t).length < 2);
    return `<div class="tm-teams"><div class="tm-cols">${col(0)}${col(1)}</div>
      ${canMove ? `<p class="center"><button type="button" class="ghost small" data-host="shuffleTeams">🔀 Teams neu mischen</button></p>` : ''}
      ${short ? '<p class="muted small center">Jedes Team braucht mindestens 2 Personen.</p>' : ''}</div>`;
  }
  // Punktestand beider Teams
  function teamScore(s, labels) {
    const sc = s.game === 'agent' ? s.ag?.wins || [0, 0] : s.ex?.scores || [0, 0];
    const turn = s.game === 'agent' ? s.ag?.turn : s.ex?.team;
    const live = s.phase === 'PLAYING' || s.phase === 'READY' || s.phase === 'PLAY';
    return `<div class="tm-score">${[0, 1].map((t) => `<div class="tm-side t${t} ${live && turn === t ? 'on' : ''}" data-k="ts${t}"><span class="n">Team ${TEAM[t]}</span><b class="v" data-v="${sc[t]}">${sc[t]}</b>${labels ? `<small>${labels[t]}</small>` : ''}</div>`).join('<span class="tm-vs">:</span>')}</div>`;
  }
  function teamWinner(s) {
    const sc = s.game === 'agent' ? s.ag?.wins || [0, 0] : s.ex?.scores || [0, 0];
    return sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1;
  }
  function teamFinal(s) {
    const w = teamWinner(s);
    const names = (t) => s.players.filter((p) => teamOf(s, p.id) === t).map((p) => esc(p.name)).join(', ');
    return `<div class="tm-final ${w == null ? '' : `t${w}`}"><p class="kick">Spielende</p><h2>${w == null ? 'Unentschieden!' : `Team ${TEAM[w]} gewinnt!`}</h2>${teamScore(s)}
      <p class="muted">${w == null ? `${names(0)} · ${names(1)}` : names(w)}</p></div>`;
  }
  function teamEnd(s) {
    const w = teamWinner(s);
    const my = teamOf(s, s.me.id);
    return `<div class="gp-wait tm-final ${w == null ? '' : `t${w}`}"><p class="kick">Spielende</p><p class="big">${w == null ? 'Unentschieden!' : w === my ? 'Gewonnen! 🎉' : 'Knapp verloren'}</p>${teamScore(s)}</div>`;
  }

  // Agentenrunde
  const AG_K = { 0: 'r', 1: 'b', n: 'n', x: 'x' };
  function agBoard(s, phone) {
    const ag = s.ag;
    const my = s.me ? teamOf(s, s.me.id) : null;
    const canTap = phone && s.phase === 'PLAYING' && ag.step === 'guess' && my === ag.turn && !ag.iSpy;
    return `<div class="ag-board ${canTap ? 'can' : ''} ${ag.iSpy && s.phase === 'PLAYING' ? 'spy' : ''}">${ag.cards.map((c, i) => {
      const k = c.k == null ? '' : `k-${AG_K[c.k]}`;
      return `<div class="ag-card ${k} ${c.open ? 'open' : ''} ${c.mine ? 'mine' : ''} ${c.marks.length && !c.open ? 'marked' : ''}" data-k="ag${i}" ${canTap && !c.open ? `data-tap="${i}" role="button" tabindex="0" aria-label="${esc(c.w)}${c.mine ? ', nochmal tippen zum Aufdecken' : ''}"` : ''}>
        <span class="w">${esc(c.w)}</span>${c.open && c.k === 'x' ? '<span class="ic" aria-hidden="true">💣</span>' : ''}${c.open && c.by && !phone ? `<span class="by">${esc(c.by)}</span>` : ''}${c.marks.length && !c.open ? `<span class="mk">${c.marks.map((n) => `<i title="${esc(n)}">${esc(initials(n))}</i>`).join('')}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }
  function agStatus(s) {
    const ag = s.ag;
    const t = ag.turn;
    if (s.phase !== 'PLAYING') {
      const why = ag.reason === 'trap' ? `Team ${TEAM[1 - ag.winner]} hat den Doppelagenten erwischt.` : `Team ${TEAM[ag.winner]} hat alle Agenten gefunden.`;
      return `<div class="ag-status over t${ag.winner}"><b>Team ${TEAM[ag.winner]} gewinnt die Partie!</b><span>${why}</span></div>`;
    }
    if (ag.step === 'clue') return `<div class="ag-status t${t}" data-k="st-c${t}"><b>Team ${TEAM[t]} ist dran.</b><span>${ag.spyNames[t] ? `${esc(ag.spyNames[t])} überlegt sich einen Hinweis …` : 'Kein Funker da – die Spielleitung kann den Zug beenden.'}</span></div>`;
    const left = ag.clue.n + 1 - ag.guesses;
    return `<div class="ag-status t${t}" data-k="st-g${t}"><span class="ag-clue" data-k="clue-${esc(ag.clue.word)}">${esc(ag.clue.word)} <em>${ag.clue.n}</em></span><span>Team ${TEAM[t]} rät · noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}</span></div>`;
  }
  const agLeftLabels = (s) => [0, 1].map((t) => `noch ${s.ag.left[t]} ${s.ag.left[t] === 1 ? 'Agent' : 'Agenten'}`);
  function agLog(s) {
    const log = (s.ag.log || []).slice().reverse();
    if (!log.length) return '';
    const sym = { r: '🟥', b: '🟦', n: '⬜', x: '💣' };
    return `<ul class="ag-log">${log.map((l, i) => `<li class="t${l.team}" data-k="lg${log.length - i}"><b>${l.word ? `${esc(l.word)} ${l.n}` : 'kein Hinweis'}</b>${l.picks.map((p) => `<span>${sym[AG_K[p.k]]} ${esc(p.w)}</span>`).join('')}</li>`).join('')}</ul>`;
  }
  function agHost(s) {
    if (s.phase === 'END') return teamFinal(s) + agBoard(s, false);
    const ag = s.ag;
    return `<div class="ag-host">${s.settings.rounds > 1 ? teamScore(s) : ''}
      <div class="ag-left">${[0, 1].map((t) => `<span class="t${t} ${s.phase === 'PLAYING' && ag.turn === t ? 'on' : ''}" data-k="al${t}">Team ${TEAM[t]}: <b>${ag.left[t]}</b></span>`).join('')}</div>
      ${agStatus(s)}${s.phase === 'PLAYING' && s.endsAt ? timerBar() : ''}${agBoard(s, false)}${agLog(s)}</div>`;
  }
  function agPhone(s) {
    if (s.phase === 'END') return teamEnd(s) + agBoard(s, true);
    const ag = s.ag;
    const my = teamOf(s, s.me.id);
    let top = '';
    if (s.phase === 'PLAYING') {
      if (ag.iSpy && ag.step === 'clue' && ag.turn === my) {
        top = `<form class="ag-clueform" id="agClue" data-k="cf${ag.match}-${ag.log.length}"><p class="kick">Du bist Funker – gib deinem Team einen Hinweis</p>
          <input name="word" maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ein Wort" aria-label="Hinweiswort">
          <div class="ag-nums" role="radiogroup" aria-label="Wie viele Karten">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<label><input type="radio" name="n" value="${n}" ${n === (G.agN || 2) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
          <button>Hinweis geben</button><p class="muted small">Farbig umrandet: deine Agenten. 💣 = Doppelagent, unbedingt vermeiden.</p></form>`;
      } else if (ag.iSpy) {
        top = `<p class="ag-me t${my}">Du bist Funker für Team ${TEAM[my]}. ${ag.turn === my ? 'Dein Team rät gerade – du darfst nichts sagen!' : 'Das andere Team ist dran.'}</p>`;
      } else if (ag.step === 'guess' && ag.turn === my) {
        top = `<p class="ag-me t${my}">Einmal tippen markiert, nochmal tippen deckt auf.</p>`;
      }
    }
    const canPass = s.phase === 'PLAYING' && ag.step === 'guess' && ag.turn === my && !ag.iSpy && ag.guesses > 0;
    const ownClue = s.phase === 'PLAYING' && ag.iSpy && ag.step === 'clue' && ag.turn === my;
    return `<div class="ag-phone">${ownClue ? '' : agStatus(s)}${s.phase === 'PLAYING' && s.endsAt ? timerBar() : ''}${top}${agBoard(s, true)}
      ${canPass ? '<button type="button" class="ghost" data-pass>Zug beenden</button>' : ''}
      <div class="ag-left small">${[0, 1].map((t) => `<span class="t${t}" data-k="al${t}">Team ${TEAM[t]}: <b>${ag.left[t]}</b></span>`).join('')}</div>
      ${s.phase === 'BOARD' && s.me.host ? '<button type="button" data-host="next">Nächste Partie</button>' : s.phase === 'BOARD' ? '<p class="muted small center">Gleich geht es mit der nächsten Partie weiter.</p>' : ''}</div>`;
  }

  // Erklärbär
  const EX_SYM = { ok: '✅', skip: '⏭️', buzz: '🚫' };
  function exLog(log, cls = '') {
    if (!log || !log.length) return '';
    return `<ul class="ex-log ${cls}">${log.map((l, i) => `<li class="${l.r}" data-k="xl${i}"><span>${EX_SYM[l.r]}</span>${esc(l.t)}${l.r === 'buzz' && l.by ? ` <small>(${esc(l.by)})</small>` : ''}</li>`).join('')}</ul>`;
  }
  const exPts = (log) => (log || []).reduce((a, l) => a + (l.r === 'ok' ? 1 : l.r === 'buzz' ? -1 : 0), 0);
  function exLast(s) {
    const L = s.ex.last;
    if (!L) return '';
    return `<section class="ex-last"><p class="muted small">Letzte Runde: ${esc(L.name)} für Team ${TEAM[L.team]}, <b>${L.pts >= 0 ? '+' : ''}${L.pts}</b></p>${exLog(L.log, 'small')}</section>`;
  }
  function exHost(s) {
    if (s.phase === 'END') return teamFinal(s) + exLast(s);
    const ex = s.ex;
    if (s.phase === 'READY') {
      return `<div class="ex-host">${teamScore(s)}<div class="ex-next t${ex.team}"><p class="kick">Als Nächstes</p><h2>${esc(ex.explainerName || '?')}</h2><p>erklärt für <b>Team ${TEAM[ex.team]}</b></p><p class="muted">Am Handy auf „Los“ tippen.</p></div>${exLast(s)}</div>`;
    }
    const n = ex.log.filter((l) => l.r === 'ok').length;
    return `<div class="ex-host">${teamScore(s)}${timerBar()}<div class="ex-next t${ex.team} live"><p class="kick">Team ${TEAM[ex.team]} rät</p><h2>${esc(ex.explainerName || '?')} erklärt</h2><p class="ex-count"><b data-v="${n}">${n}</b> erraten</p></div>${exLog(ex.log.slice().reverse())}</div>`;
  }
  function exPhone(s) {
    if (s.phase === 'END') return teamEnd(s);
    const ex = s.ex;
    const my = teamOf(s, s.me.id);
    if (s.phase === 'READY') {
      if (ex.iExplain) return `<div class="gp-wait ex-wait t${my}">${teamScore(s)}<p class="kick">Du bist dran!</p><p class="big">Du erklärst</p><p class="muted">Dein Team rät, das andere Team passt auf verbotene Wörter auf. Bereit?</p><button type="button" class="big" data-go>Los!</button>${exLast(s)}</div>`;
      return `<div class="gp-wait ex-wait t${ex.team}">${teamScore(s)}<p class="kick">Als Nächstes</p><p class="big">${esc(ex.explainerName || '?')} erklärt</p><p class="muted">${my === ex.team ? 'Du rätst mit – ruf laut, was dir einfällt!' : 'Du liest mit und passt auf verbotene Wörter auf.'}</p>${exLast(s)}</div>`;
    }
    const card = ex.card;
    const cardHtml = card ? `<div class="ex-card t${ex.team}" data-k="card${ex.pos}"><h2>${esc(card.t)}</h2><p class="muted small">Verboten:</p><ul>${card.f.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '';
    if (ex.iExplain) {
      return `<div class="ex-phone">${timerBar()}${cardHtml}<div class="ex-btns"><button type="button" class="ghost" data-mark="skip" data-pos="${ex.pos}">Überspringen</button><button type="button" class="ok" data-mark="ok" data-pos="${ex.pos}">✓ Erraten</button></div><p class="muted small center">Diese Runde: ${exPts(ex.log) >= 0 ? '+' : ''}${exPts(ex.log)}</p></div>`;
    }
    if (my !== ex.team && card) {
      return `<div class="ex-phone">${timerBar()}<p class="ex-who">${esc(ex.explainerName || '?')} erklärt für Team ${TEAM[ex.team]}</p>${cardHtml}<button type="button" class="ex-buzz" data-mark="buzz" data-pos="${ex.pos}">🚫 Verboten!</button></div>`;
    }
    return `<div class="gp-wait ex-wait t${ex.team}">${timerBar()}<p class="kick">Rate laut!</p><p class="big">${esc(ex.explainerName || '?')} erklärt</p><p class="ex-count"><b data-v="${ex.log.filter((l) => l.r === 'ok').length}">${ex.log.filter((l) => l.r === 'ok').length}</b> erraten</p>${exLog(ex.log.slice().reverse(), 'small')}</div>`;
  }

  /* ---------- Geräusche am Bildschirm (abschaltbar, /shared/sound.js) ---------- */
  function hostSounds(a, b) {
    const S = window.VH && VH.sound;
    if (!S || !a || !b) return;
    if (b.players.length > a.players.length) S.play('pop');
    if (a.phase !== b.phase) {
      if (b.phase === 'END' || b.phase === 'FINALE') S.play('fanfare');
      else if (b.phase === 'RESULT' || b.phase === 'REVEAL' || b.phase === 'SCORES') S.play('reveal');
      else if (b.phase !== 'LOBBY') S.play('start');
    }
    if (b.game === 'kniffel' && a.kn && b.kn) {
      if (b.kn.rollId !== a.kn.rollId) S.play('roll');
      if (b.kn.last && (!a.kn.last || a.kn.last.key !== b.kn.last.key || a.kn.last.player !== b.kn.last.player)) S.play(b.kn.last.key === 'kniffel' && b.kn.last.points ? 'fanfare' : 'ding');
    }
    if (b.game === 'maexchen' && a.mx && b.mx) {
      if (b.mx.rollId !== a.mx.rollId) S.play('shake');
      if (b.mx.step === 'reveal' && a.mx.step !== 'reveal' && b.mx.reveal) S.play(b.mx.reveal.truth ? 'ding' : 'fail');
    }
    if (b.game === 'draw' && a.dr && b.dr && b.dr.guessed.length > (a.dr.guessed?.length || 0)) S.play('ding');
    if (b.game === 'agent' && a.ag && b.ag) {
      const opened = b.ag.cards.filter((c, i) => c.open && !a.ag.cards[i]?.open);
      if (opened.length) S.play(opened.some((c) => c.k === 'x') ? 'fail' : opened.some((c) => c.k === a.ag.turn) ? 'ding' : 'tick');
      if (b.ag.step === 'guess' && a.ag.step !== 'guess') S.play('pop');
    }
    if (b.game === 'explain' && a.ex && b.ex && b.ex.log.length > a.ex.log.length) {
      const l = b.ex.log[b.ex.log.length - 1];
      S.play(l.r === 'ok' ? 'ding' : l.r === 'buzz' ? 'fail' : 'tick');
    }
    if ((b.game === 'wwe' && b.voted && a.voted && b.voted.length > a.voted.length) || (b.done && a.done && b.done.length > a.done.length)) S.play('tick');
  }

  /* ---------- Nach jedem Zeichnen ---------- */
  function afterRender(s, fresh) {
    if (document.querySelector('canvas[data-gal]')) galleryLoad();
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
    if (s.game === 'agent' && s.phase === 'BOARD' && s.ag && s.ag.winner != null && G.agParty !== s.ag.match && window.VH) {
      G.agParty = s.ag.match;
      if (G.mode === 'host' || teamOf(s, s.me?.id) === s.ag.winner) VH.confetti({ count: 70 });
    }
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
      ${!host && s.evening ? `<p class="muted small">Als Nächstes: <b>${ICON[s.game]} ${esc(s.gameName)}</b></p>` : ''}
      ${host ? `<div class="sh-invite"><div class="gp-qr small">${qr(joinUrl())}</div>
        <div><p class="muted small">Freunde scannen den QR-Code oder öffnen <b>${esc(location.host)}/spiele/gruppe</b> und geben den Code ein.</p>
        <button class="ghost small" data-share>📨 Einladung teilen</button></div></div>` : '<p class="muted">Gleich geht’s los – die Spielleitung startet.</p>'}
      ${TEAM_GAMES.has(s.game) ? teamsHtml(s, { canMove: host, kick: host }) : `<div class="gp-people">${P.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'}" data-k="c${p.id}">${av(p)}<b>${pname(p)}</b>${p.id === s.hostPlayer ? ' 👑' : ''}${host && p.id !== s.me.id ? `<button class="x" data-kick="${p.id}" title="Entfernen">✕</button>` : ''}</span>`).join('')}</div>`}
      ${host ? `${gamePicker(s)}${settingsHtml(s)}<button class="big" data-host="start" ${P.length < (TEAM_GAMES.has(s.game) ? 4 : 2) ? 'disabled' : ''}>${P.length < (TEAM_GAMES.has(s.game) ? 4 : 2) ? 'Warte auf Mitspielende …' : `${ICON[s.game]} ${esc(s.gameName)} starten`}</button>
        ${s.evening ? '<button class="ghost" data-host="finale">🏆 Siegerehrung</button>' : ''}
        ${key ? `<p class="muted small center"><a href="/spiele/gruppe/#host=${esc(s.code)}&k=${encodeURIComponent(key)}" target="_blank" rel="noopener">📺 Zusätzlich auf einem Fernseher zeigen</a></p>` : ''}` : ''}
      ${eveningTable(s)}
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
    const bodyKey = phaseKey(s, key);
    const top = `<header class="gp-me">${av(s.me)}<b>${esc(s.me.name)}</b>${s.me.host ? '<span class="crown" title="Spielleitung">👑</span>' : ''}${TEAM_GAMES.has(s.game) ? teamTag(s.me.team) : ''}<span class="pts">${s.game === 'maexchen' ? `${s.mx?.lives?.[s.me.id] ?? s.settings.lives} Deckel` : TEAM_GAMES.has(s.game) ? '' : `${s.me.score} Pkt`}</span><span class="code">${esc(s.code)}</span></header>`;
    let body = '';
    if (s.phase === 'LOBBY') {
      body = s.selfHost || s.me.host ? selfHostLobby(s) : `<div class="gp-wait"><p class="big">Du bist drin!</p><p class="muted">Als Nächstes: <b>${ICON[s.game]} ${esc(s.gameName)}</b></p><p class="muted">Gleich geht’s los. Schau auf den Bildschirm.</p><div class="gp-people">${s.players.map((p) => `<span class="gp-chip" data-k="c${p.id}">${av(p)}<b>${pname(p)}</b></span>`).join('')}</div>${eveningTable(s)}</div>`;
    } else if (s.phase === 'FINALE') {
      const mine = s.evening?.ranking.findIndex((r) => r.id === s.me.id);
      body = `<div class="gp-wait ev-me"><p class="kick">Siegerehrung</p><p class="big">${mine === 0 ? 'Sieg des Abends! 🏆' : mine >= 0 ? `Platz ${mine + 1} am Abend` : 'Spieleabend'}</p>
        ${(s.evening?.titles || []).filter((t) => t.name === s.me.name).map((t) => `<p class="ev-mytitle">${ICON[t.game]} ${esc(t.title)}</p>`).join('')}</div>${eveningTable(s)}${galleryHtml(s)}`;
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
    } else if (s.game === 'agent') {
      body = agPhone(s);
      if (s.phase === 'PLAYING' && prev?.ag && s.ag.turn === s.me.team && prev.ag.turn !== s.me.team) vibrate([60, 60, 60]);
    } else if (s.game === 'explain') {
      body = exPhone(s);
      if (s.phase === 'READY' && s.ex.iExplain && fresh) vibrate([60, 60, 60]);
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
    if (s.phase === 'END' && !s.me.host) body += `${s.game === 'draw' ? galleryHtml(s) : ''}${eveningTable(s)}<p class="muted small center">Die Spielleitung wählt das nächste Spiel.</p>`;
    if (s.me.host && s.phase !== 'LOBBY') {
      body += s.phase === 'END'
        ? `<div class="sh-ctl open">${s.game === 'draw' ? galleryHtml(s) : ''}<button data-host="restart">🔁 Nochmal ${esc(s.gameName)}</button>${gamePicker(s, 'Oder ein anderes Spiel')}<button class="ghost" data-host="finale">🏆 Siegerehrung</button>${eveningTable(s)}</div>`
        : s.phase === 'FINALE'
        ? `<div class="sh-ctl open"><button data-host="restart">Weiter spielen</button></div>`
        : `<details class="sh-ctl"><summary>Spielleitung</summary><button class="ghost small" data-host="next">${s.game === 'draw' ? (s.phase === 'DRAW' ? 'Runde beenden' : 'Weiter') : s.game === 'agent' ? (s.phase === 'BOARD' ? 'Nächste Partie' : 'Zug beenden') : s.game === 'explain' ? (s.phase === 'READY' ? 'Runde starten' : 'Runde beenden') : 'Zug überspringen'}</button><button class="ghost small" data-host="restart">Zurück in den Warteraum</button></details>`;
    }
    app.className = `gp gp-player g-${s.game}`;
    morph(app, `${top}<main class="gp-phone"><div class="gp-body" data-k="${bodyKey}">${body}</div></main>${G.connected ? '' : '<p class="warn center">Verbindung unterbrochen …</p>'}`);
    bindPlayer();
    runTimer();
    afterRender(s, fresh);
    if (s.phase === 'WRITING' && fresh) setTimeout(() => document.querySelector('#slfForm input')?.focus(), reduced() ? 0 : 2900);
    if (s.phase === 'FINALE' && fresh && s.evening?.ranking[0]?.id === s.me.id && window.VH) VH.confetti({ count: 140 });
    if (s.phase === 'END' && fresh && TEAM_GAMES.has(s.game)) {
      if (teamWinner(s) === s.me.team && window.VH) VH.confetti();
    } else if (s.phase === 'END' && fresh && s.game !== 'maexchen') {
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
    bindCommon();
    const share = app.querySelector('[data-share]');
    if (share) share.onclick = async () => {
      const url = joinUrl();
      const text = `Spiel mit: ${G.s.gameName} – Code ${G.code}`;
      try { if (navigator.share) await navigator.share({ title: G.s.gameName, text, url }); else { await navigator.clipboard.writeText(url); toast('Link kopiert'); } } catch {}
    };
    // Agentenrunde
    app.querySelectorAll('[data-tap]').forEach((b) => (b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } }));
    app.querySelectorAll('[data-tap]').forEach((b) => (b.onclick = async () => {
      if (b.classList.contains('pressed')) return;
      vibrate(12);
      b.classList.add('pressed');
      const r = await act('tap', { index: +b.dataset.tap });
      b.classList.remove('pressed');
      if (r.ok && r.revealed != null) vibrate(r.revealed === 'x' ? [80, 50, 200] : r.revealed === G.s.me.team ? [30, 30, 60] : 40);
    }));
    const cf = document.getElementById('agClue');
    if (cf) {
      cf.onchange = (e) => { if (e.target.name === 'n') G.agN = +e.target.value; };
      cf.onsubmit = async (e) => {
        e.preventDefault();
        const word = cf.word.value.trim();
        if (!word) { toast('Bitte ein Wort eingeben.'); cf.word.focus(); return; }
        const btn = cf.querySelector('button');
        btn.disabled = true;
        const r = await act('clue', { word, n: +(new FormData(cf).get('n') || 1) });
        btn.disabled = false;
        if (!r.ok) cf.word.select();
      };
    }
    const ps = app.querySelector('[data-pass]');
    if (ps) ps.onclick = () => { ps.disabled = true; act('pass'); };
    // Erklärbär
    const go = app.querySelector('[data-go]');
    if (go) go.onclick = () => { go.disabled = true; vibrate(30); act('go'); };
    app.querySelectorAll('[data-mark]').forEach((b) => (b.onclick = async () => {
      app.querySelectorAll('[data-mark]').forEach((x) => (x.disabled = true));
      vibrate(b.dataset.mark === 'buzz' ? [60, 40, 60] : 20);
      const r = await act('mark', { result: b.dataset.mark, pos: +b.dataset.pos });
      if (!r.ok || r.stale) app.querySelectorAll('[data-mark]').forEach((x) => (x.disabled = false));
    }));
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
