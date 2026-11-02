/**
 * Gruppenspiele: „Wer würde eher …?“, Stadt-Land-Fluss und Kniffel.
 *   /spiele/gruppe/            Start: Spiel wählen oder mit Code beitreten
 *   /spiele/gruppe/#host=CODE  Bildschirm/Spielleitung (Fernseher oder Laptop)
 *   /spiele/gruppe/?room=CODE  Handy einer mitspielenden Person
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
  const ICON = { wwe: '🫵', slf: '🔤', kniffel: '🎲' };

  /* ---------- Kniffel-Würfel ---------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const die = (v, { held = false, roll = false, i = 0, btn = false, dis = false } = {}) => {
    const pips = Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[v].includes(k) ? 'on' : ''}"></i>`).join('');
    const cls = `kn-die ${held ? 'held' : ''} ${roll ? 'roll' : ''}`;
    const st = roll ? ` style="--d:${(i * 0.06).toFixed(2)}s; --r:${(Math.random() * 60 - 30).toFixed(0)}deg"` : '';
    return btn
      ? `<button class="${cls}" data-hold="${i}" ${dis ? 'disabled' : ''} aria-pressed="${held}" aria-label="Würfel ${v}${held ? ', gehalten' : ''}"${st}>${pips}</button>`
      : `<span class="${cls}" role="img" aria-label="Würfel ${v}${held ? ', gehalten' : ''}"${st}>${pips}</span>`;
  };
  // Würfel nur animieren, wenn wirklich neu geworfen wurde
  function knDice(kn, btn, canHold) {
    const rolled = kn.rollId !== G.knRoll;
    G.knRoll = kn.rollId;
    const first = kn.rollsLeft === 3;
    return `<div class="kn-dice ${first ? 'idle' : ''}">${kn.dice.map((v, i) => die(v, { held: kn.held[i], roll: rolled && !kn.held[i] && !first && !reduced(), i, btn, dis: !canHold })).join('')}</div>`;
  }
  const rollDots = (kn) => `<span class="kn-rolls" aria-label="Noch ${kn.rollsLeft} Würfe">${[0, 1, 2].map((k) => `<i class="${k < kn.rollsLeft ? 'on' : ''}"></i>`).join('')}</span>`;

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
        else if (m.t === 'evt') m.event === 'state' ? this.h.onState(m.payload) : this.h.onEvent && this.h.onEvent(m.event, m.payload);
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

  const G = { mode: null, code: null, sock: null, s: null, connected: false, tick: null, typing: null, lastPhaseKey: '' };

  async function act(event, payload) {
    const r = await G.sock.emit(event, payload);
    if (!r.ok) toast(r.error || 'Fehler');
    return r;
  }

  /* ---------- Start ---------- */
  function renderStart(err = '') {
    G.mode = 'start';
    const name = (() => { try { return localStorage.getItem('gg-name') || ''; } catch { return ''; } })();
    const pre = normCode(new URLSearchParams(location.search).get('room'));
    app.className = 'gp gp-start';
    app.innerHTML = `
      <section class="hero"><h1>Gruppenspiele</h1><p>Ein Bildschirm für alle, jede Person spielt am eigenen Handy. Ideal für den Fernseher im Vereinsheim.</p></section>
      <div class="gp-games">
        <article class="gp-game wwe" data-tilt>
          <span class="gp-icon">🫵</span>
          <h2>Wer würde eher …?</h2>
          <p>Eine Frage, alle stimmen auf dem Handy ab, wer am ehesten passt. Der Bildschirm löst auf – mit Applaus oder Gelächter.</p>
          <button data-create="wwe">Raum eröffnen</button>
        </article>
        <article class="gp-game slf" data-tilt>
          <span class="gp-icon">🔤</span>
          <h2>Stadt-Land-Fluss</h2>
          <p>Der Bildschirm würfelt einen Buchstaben, alle schreiben am Handy. Gleiche Antworten geben weniger Punkte, Unsinn wird gemeinsam rausgewählt.</p>
          <button data-create="slf">Raum eröffnen</button>
        </article>
        <article class="gp-game kn" data-tilt>
          <span class="gp-icon">🎲</span>
          <h2>Kniffel</h2>
          <p>Wer dran ist, würfelt am eigenen Handy, hält Würfel fest und trägt ein. Der Bildschirm zeigt die Würfel groß und den Block aller.</p>
          <button data-create="kniffel">Raum eröffnen</button>
        </article>
      </div>
      <form class="panel gp-join" id="joinForm">
        <h2>Mitspielen</h2>
        <div class="row">
          <input name="code" maxlength="4" placeholder="CODE" autocomplete="off" aria-label="Raumcode" value="${esc(pre)}" class="gp-code-in">
          <input name="name" maxlength="16" placeholder="Dein Name" value="${esc(name)}" aria-label="Dein Name">
          <button>Beitreten</button>
        </div>
        <p class="error">${esc(err)}</p>
      </form>`;
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
  }

  async function create(game) {
    try {
      const r = await fetch('/api/spiele/party', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Raum konnte nicht erstellt werden.');
      store.set('gp-host-' + d.roomCode, d.hostKey);
      location.hash = 'host=' + d.roomCode;
      startHost(d.roomCode);
    } catch (e) {
      renderStart(e.message);
    }
  }

  /* ---------- Bildschirm ---------- */
  function startHost(code) {
    G.mode = 'host';
    G.code = code;
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
    const total = s.game === 'slf' ? s.settings.seconds * 1000 : s.settings.seconds * 1000;
    const step = () => {
      const left = clock.left(s.endsAt);
      const bar = document.getElementById('gpBar'), lab = document.getElementById('gpLeft');
      if (bar) bar.style.width = Math.min(100, (left / total) * 100) + '%';
      if (lab) lab.textContent = Math.ceil(left / 1000);
      document.querySelector('.gp-timer')?.classList.toggle('low', left < 10000);
      if (!left) clearInterval(G.tick);
    };
    step();
    G.tick = setInterval(step, 200);
  }

  function renderHost() {
    const s = G.s;
    const key = `${s.phase}-${s.round}`;
    const fresh = key !== G.lastPhaseKey;
    G.lastPhaseKey = key;
    const head = `<header class="gp-bar"><span class="t">${ICON[s.game] || ''} ${esc(s.gameName)}</span>${s.round ? `<span class="r">Runde ${s.round} von ${s.settings.rounds}</span>` : ''}<span class="code">${esc(s.code)}</span>${G.connected ? '' : '<span class="warn">Verbindung unterbrochen …</span>'}</header>`;
    let body = '';
    let foot = '';
    if (s.phase === 'LOBBY') {
      body = `<div class="gp-lobby">
        <div class="gp-joininfo">
          <div class="gp-qr">${qr(joinUrl())}</div>
          <div><p class="muted">Am Handy öffnen:</p><p class="url">${esc(location.host)}/spiele/gruppe</p><p class="muted">Code eingeben:</p>
          <p class="gp-tiles">${[...s.code].map((c) => `<span>${esc(c)}</span>`).join('')}</p></div>
        </div>
        <div class="gp-people">${s.players.length ? s.players.map((p) => `<span class="gp-chip ${p.connected ? '' : 'off'}">${av(p)}<b>${esc(p.name)}</b><button class="x" data-kick="${p.id}" title="Entfernen">✕</button></span>`).join('') : '<p class="muted">Noch niemand da. Scannt den Code!</p>'}</div>
        ${settingsHtml(s)}
      </div>`;
      foot = `<button class="big" data-host="start" ${s.players.length < 2 ? 'disabled' : ''}>Los geht’s</button>`;
    } else if (s.game === 'wwe') {
      if (s.phase === 'QUESTION') {
        body = `<div class="wwe-q ${fresh ? 'fresh' : ''}"><p class="kick">Wer würde eher …</p><h2>${esc(s.question.replace(/^… ?/, ''))}</h2></div>${timerBar()}
          <div class="gp-voted">${s.players.map((p) => `<span class="${s.voted.includes(p.id) ? 'in' : ''}">${av(p)}</span>`).join('')}</div>
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
        const kn = s.kn;
        const byId = Object.fromEntries(s.players.map((p) => [p.id, p]));
        const cur = byId[kn.current] || { name: '?' };
        const order = kn.order.filter((id) => byId[id]);
        const lastP = kn.last && byId[kn.last.player];
        const lastCat = kn.last && s.cats.find((c) => c.key === kn.last.key);
        body = `<div class="kn-host">
          <section class="kn-turn">
            <p class="kn-who">${av(cur)} <b>${esc(cur.name)}</b> ist dran ${rollDots(kn)}</p>
            ${knDice(kn, false, false)}
            <p class="kn-last" aria-live="polite">${lastP ? `${esc(lastP.name)} trägt <b>${kn.last.points}</b> bei ${esc(lastCat?.name || '')} ein` : kn.rollsLeft === 3 ? 'Am Handy auf „Würfeln“ tippen' : `Noch ${kn.rollsLeft} ${kn.rollsLeft === 1 ? 'Wurf' : 'Würfe'}`}</p>
          </section>
          <div class="kn-sheet-wrap"><table class="kn-sheet"><thead><tr><th></th>${order.map((id) => `<th class="${id === kn.current ? 'cur' : ''}">${av(byId[id])}<span>${esc(byId[id].name)}</span></th>`).join('')}</tr></thead><tbody>
            ${s.cats.map((c, ci) => `${ci === 6 ? `<tr class="sub"><th>Oben + Bonus</th>${order.map((id) => { const t = kn.totals[id]; return `<td class="${id === kn.current ? 'cur' : ''}">${t.upper}${t.bonus ? ' <em>+35</em>' : ` <small>/63</small>`}</td>`; }).join('')}</tr>` : ''}<tr><th>${esc(c.name)}</th>${order.map((id) => {
              const v = kn.sheets[id]?.[c.key];
              const isCur = id === kn.current;
              const fresh2 = kn.last && kn.last.player === id && kn.last.key === c.key;
              if (v != null) return `<td class="${isCur ? 'cur' : ''} ${fresh2 ? 'just' : ''} ${v === 0 ? 'zero' : ''}">${v}</td>`;
              const opt = isCur ? kn.options[c.key] : undefined;
              return `<td class="${isCur ? 'cur' : ''} open">${opt !== undefined ? `<span class="opt ${opt ? '' : 'z'}">${opt}</span>` : ''}</td>`;
            }).join('')}</tr>`).join('')}
            <tr class="total"><th>Gesamt</th>${order.map((id) => `<td class="${id === kn.current ? 'cur' : ''}">${kn.totals[id].total}</td>`).join('')}</tr>
          </tbody></table></div></div>`;
        foot = `<button class="ghost" data-host="next" title="Trägt für die Person den besten freien Wert ein">Zug überspringen</button>`;
      } else if (s.phase === 'END') {
        body = `<div class="gp-end"><h2>Endstand</h2>${podium([...s.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score })))}</div>`;
        foot = `<button data-host="restart">Nochmal spielen</button>`;
      }
    } else {
      if (s.phase === 'WRITING') {
        body = `<div class="slf-letter ${fresh ? 'spin' : ''}" id="slfLetter"><span>${esc(s.letter)}</span></div>
          <p class="slf-cats">${s.settings.categories.map((c, i) => `<span style="${fresh ? `animation-delay:${2.6 + i * 0.08}s` : 'animation:none'}">${esc(c)}</span>`).join('')}</p>${timerBar()}
          ${s.stoppedBy ? `<p class="slf-stop">✋ ${esc(s.stoppedBy)} ist fertig – noch 10 Sekunden!</p>` : ''}
          <div class="gp-voted">${s.players.map((p) => `<span class="${s.done.includes(p.id) ? 'in' : ''}">${av(p)}</span>`).join('')}</div>`;
        foot = `<button data-host="next">Stopp – auswerten</button>`;
      } else if (s.phase === 'REVIEW' || s.phase === 'SCORES') {
        const auto = new Set(s.auto);
        const scores = s.roundScores;
        body = `<div class="slf-head"><span class="slf-mini">${esc(s.letter)}</span><p>${s.phase === 'REVIEW' ? 'Antworten prüfen: Am Handy könnt ihr Unsinn anzweifeln. Ab der Hälfte der Stimmen zählt die Antwort nicht.' : 'Punkte dieser Runde: 20 = als Einzige, 10 = eigene Idee, 5 = doppelt'}</p></div>
          <div class="slf-table-wrap"><table class="slf-table"><thead><tr><th></th>${s.settings.categories.map((c) => `<th>${esc(c)}</th>`).join('')}${scores ? '<th>Runde</th>' : ''}</tr></thead><tbody>
          ${s.players.map((p, i) => `<tr style="animation-delay:${i * 0.06}s"><th>${av(p)} ${esc(p.name)}</th>${s.settings.categories.map((c) => {
            const v = s.answers[p.id]?.[c] || '';
            const k = `${p.id}|${c}`;
            const fl = (s.flags[k] || []).length;
            const pts = scores ? scores.detail[p.id]?.[c] ?? 0 : null;
            const bad = auto.has(k) || (scores && v && pts === 0);
            return `<td class="${bad ? 'bad' : ''} ${!v ? 'empty' : ''}">${v ? esc(v) : '–'}${fl ? `<small class="fl">👎 ${fl}</small>` : ''}${pts !== null ? `<em class="pts p${pts}">${pts}</em>` : ''}</td>`;
          }).join('')}${scores ? `<td class="sum">+${scores.scores[p.id] || 0}</td>` : ''}</tr>`).join('')}
          </tbody></table></div>
          ${scores ? `<div class="slf-rank">${[...s.players].sort((a, b) => b.score - a.score).map((p, i) => `<span class="gp-chip" style="animation-delay:${0.2 + i * 0.08}s">${i + 1}. ${av(p)}<b>${esc(p.name)}</b><em>${p.score}</em></span>`).join('')}</div>` : ''}`;
        foot = s.phase === 'REVIEW' ? `<button data-host="next">Punkte vergeben</button>` : `<button data-host="next">${s.round >= s.settings.rounds ? 'Zum Endstand' : 'Nächster Buchstabe'}</button>`;
      } else if (s.phase === 'END') {
        body = `<div class="gp-end"><h2>Endstand</h2>${podium([...s.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, score: p.score })))}</div>`;
        foot = `<button data-host="restart">Nochmal spielen</button>`;
      }
    }
    app.classList.toggle('calm', !fresh);
    app.innerHTML = `${head}<main class="gp-stage">${body}</main><footer class="gp-foot">${foot}<button class="ghost" data-host="full" title="Vollbild">⛶</button></footer>`;
    bindHost();
    runTimer();
    if (s.phase === 'END' && fresh && window.VH) setTimeout(() => VH.confetti(), 600);
    if (s.phase === 'RESULT' && fresh && s.result.winners.length && window.VH) setTimeout(() => VH.confetti({ count: 50 }), 500);
    if (s.game === 'kniffel' && s.kn?.last && s.kn.last.key === 'kniffel' && s.kn.last.points === 50 && G.knParty !== s.kn.rollId && window.VH) { G.knParty = s.kn.rollId; VH.confetti({ count: 80 }); }
  }

  function podium(list) {
    const top = [list[1], list[0], list[2]];
    return `<div class="gp-podium">${top.map((p, i) => p ? `<div class="st p${[2, 1, 3][i]}">${av(p)}<b>${esc(p.name)}</b><span>${p.score} ${p.score === 1 ? 'Punkt' : 'Punkte'}</span><i>${[2, 1, 3][i]}</i></div>` : '<div></div>').join('')}</div>
      ${list.length > 3 ? `<ol class="gp-rest" start="4">${list.slice(3).map((p) => `<li>${esc(p.name)} <b>${p.score}</b></li>`).join('')}</ol>` : ''}`;
  }

  function settingsHtml(s) {
    if (s.game === 'kniffel') return `<p class="muted center">13 Runden, alle Felder einmal. Wer dran ist, würfelt am Handy bis zu drei Mal.</p>`;
    if (s.game === 'wwe') {
      return `<form class="gp-settings" id="setForm"><label>Fragen <input type="number" name="rounds" min="3" max="30" value="${s.settings.rounds}"></label>
        <label>Sekunden pro Frage <input type="number" name="seconds" min="10" max="90" value="${s.settings.seconds}"></label></form>`;
    }
    return `<form class="gp-settings" id="setForm"><label>Runden <input type="number" name="rounds" min="1" max="15" value="${s.settings.rounds}"></label>
      <label>Sekunden zum Schreiben <input type="number" name="seconds" min="30" max="300" step="15" value="${s.settings.seconds}"></label>
      <div class="cats">${s.categoriesAll.map((c) => `<label class="cat ${s.settings.categories.includes(c) ? 'on' : ''}"><input type="checkbox" name="cat" value="${esc(c)}" ${s.settings.categories.includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></form>`;
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
    const f = document.getElementById('setForm');
    if (f) f.onchange = () => {
      const settings = { rounds: +f.rounds.value, seconds: +f.seconds.value };
      if (G.s.game === 'slf') settings.categories = [...f.querySelectorAll('[name=cat]:checked')].map((x) => x.value);
      act('settings', { settings });
    };
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
        const r = await G.sock.emit('join', { name: j.name, token: j.token });
        if (!r.ok) { G.sock.closed = true; store.del('gp-join-' + code); history.replaceState(null, '', '/spiele/gruppe/?room=' + code); return renderStart(r.error); }
        store.set('gp-join-' + code, { name: j.name, token: r.token });
        history.replaceState(null, '', '/spiele/gruppe/?room=' + code);
      },
      onClose: () => { G.connected = false; },
      onState: (s) => { clock.sync(s.serverNow); const prev = G.s; G.s = s; renderPlayer(prev); },
      onEvent: (e) => { if (e === 'kicked') { G.sock.closed = true; store.del('gp-join-' + code); renderStart('Du wurdest aus dem Raum entfernt.'); } },
      onGone: () => renderStart('Der Raum ist abgelaufen.'),
    });
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
    const top = `<header class="gp-me">${av(s.me)}<b>${esc(s.me.name)}</b><span class="pts">${s.me.score} Pkt</span><span class="code">${esc(s.code)}</span></header>`;
    let body = '';
    if (s.phase === 'LOBBY') {
      body = `<div class="gp-wait"><p class="big">Du bist drin!</p><p class="muted">Gleich geht’s los. Schau auf den Bildschirm.</p><div class="gp-people">${s.players.map((p) => `<span class="gp-chip">${av(p)}<b>${esc(p.name)}</b></span>`).join('')}</div></div>`;
    } else if (s.game === 'wwe') {
      if (s.phase === 'QUESTION') {
        body = s.myVote
          ? `<div class="gp-wait"><p class="big">Abgestimmt ✓</p><p class="muted">Du hast ${esc(s.players.find((p) => p.id === s.myVote)?.name || '')} gewählt. Warte auf die anderen …</p></div>`
          : `<p class="kick">Wer würde eher …</p><h2 class="wwe-phone-q">${esc(s.question.replace(/^… ?/, ''))}</h2>${timerBar()}
            <div class="gp-pick">${s.players.map((p, i) => `<button data-vote="${p.id}" style="animation-delay:${i * 0.04}s">${av(p)}<b>${esc(p.name)}</b></button>`).join('')}</div>`;
      } else if (s.phase === 'RESULT') {
        const mine = s.result.ranking.find((r) => r.id === s.me.id);
        body = `<div class="gp-wait"><p class="kick">Ergebnis</p><p class="big">${s.result.winners.length ? s.result.winners.map(esc).join(' & ') : 'Niemand'}</p>
          <p class="muted">${mine ? `Für dich gab es ${mine.votes} ${mine.votes === 1 ? 'Stimme' : 'Stimmen'}.` : 'Für dich hat niemand gestimmt.'}</p></div>`;
      } else {
        body = endPhone(s.awards.players);
      }
    } else if (s.game === 'kniffel') {
      if (s.phase === 'PLAYING') {
        const kn = s.kn;
        const mine = kn.current === s.me.id;
        const sheet = kn.sheets[s.me.id] || {};
        const tot = kn.totals[s.me.id] || { total: 0, upper: 0, bonus: 0 };
        if (mine) {
          const canHold = kn.rollsLeft > 0 && kn.rollsLeft < 3;
          const opts = kn.options;
          const best = Math.max(0, ...Object.values(opts));
          body = `<p class="kick">Du bist dran ${rollDots(kn)}</p>
            ${knDice(kn, true, canHold)}
            <p class="muted small center">${kn.rollsLeft === 3 ? 'Los geht’s: würfeln!' : canHold ? `Tippe Würfel an, um sie festzuhalten. Noch ${kn.rollsLeft} ${kn.rollsLeft === 1 ? 'Wurf' : 'Würfe'}.` : 'Keine Würfe mehr – trag ein Ergebnis ein.'}</p>
            <button class="big kn-roll" data-roll ${kn.rollsLeft ? '' : 'disabled'}>🎲 Würfeln</button>
            <div class="kn-opts">${s.cats.map((c) => {
              const v = sheet[c.key];
              if (v != null) return `<div class="kn-opt done"><span>${esc(c.name)}</span><b>${v}</b></div>`;
              const o = opts[c.key];
              return `<button class="kn-opt ${o !== undefined && o === best && best > 0 ? 'best' : ''} ${o === 0 ? 'zero' : ''}" data-score="${c.key}" ${o === undefined ? 'disabled' : ''}><span>${esc(c.name)}</span><b>${o !== undefined ? o : ''}</b></button>`;
            }).join('')}</div>
            <p class="muted small center">Oben ${tot.upper}/63${tot.bonus ? ' ✓ Bonus' : ''} · Gesamt ${tot.total}</p>`;
        } else {
          const cur = s.players.find((p) => p.id === kn.current) || { name: '?' };
          body = `<div class="gp-wait"><p class="kick">${av(cur)} ${esc(cur.name)} ist dran ${rollDots(kn)}</p>${knDice(kn, false, false)}
            <p class="big">${tot.total} Punkte</p><p class="muted">Oben ${tot.upper}/63${tot.bonus ? ' ✓ Bonus' : ''} · Runde ${s.round} von 13</p>
            <div class="kn-opts mini">${s.cats.map((c) => `<div class="kn-opt ${sheet[c.key] != null ? 'done' : ''}"><span>${esc(c.name)}</span><b>${sheet[c.key] ?? ''}</b></div>`).join('')}</div></div>`;
        }
      } else {
        body = endPhone([...s.players].sort((a, b) => b.score - a.score));
      }
    } else {
      if (s.phase === 'WRITING') {
        const vals = s.myAnswers || {};
        const final = s.done && s.done.includes(s.me.id);
        body = final
          ? `<div class="gp-wait"><div class="slf-letter small"><span>${esc(s.letter)}</span></div><p class="big">Abgegeben ✓</p><p class="muted">Warte, bis die Zeit um ist …</p></div>`
          : `<div class="slf-top"><div class="slf-letter small ${fresh ? 'spin' : ''}"><span>${esc(s.letter)}</span></div>${timerBar()}</div>
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
        const rank = [...s.players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === s.me.id) + 1;
        body = `<div class="gp-wait"><p class="kick">Runde ${s.round}</p><p class="big pop">+${pts}</p><p class="muted">Gesamt ${s.me.score} Punkte, Platz ${rank} von ${s.players.length}</p>
          <ul class="slf-mine">${s.settings.categories.map((c) => `<li><span>${esc(c)}</span><b>${esc(s.answers[s.me.id]?.[c] || '–')}</b><em class="p${s.roundScores.detail[s.me.id]?.[c] ?? 0}">${s.roundScores.detail[s.me.id]?.[c] ?? 0}</em></li>`).join('')}</ul></div>`;
      } else {
        body = endPhone([...s.players].sort((a, b) => b.score - a.score));
      }
    }
    app.innerHTML = `${top}<main class="gp-phone">${body}</main>${G.connected ? '' : '<p class="warn center">Verbindung unterbrochen …</p>'}`;
    bindPlayer();
    runTimer();
    if (s.phase === 'WRITING' && fresh) setTimeout(() => document.querySelector('#slfForm input')?.focus(), reduced() ? 0 : 2900);
    if (s.phase === 'END' && fresh) {
      const list = s.game === 'wwe' ? s.awards.players : [...s.players].sort((a, b) => b.score - a.score);
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
      if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
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
    app.querySelectorAll('[data-hold]').forEach((b) => (b.onclick = () => {
      b.classList.toggle('held');
      if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
      act('hold', { index: +b.dataset.hold });
    }));
    const rb = app.querySelector('[data-roll]');
    if (rb) rb.onclick = async () => {
      rb.disabled = true;
      app.querySelectorAll('.kn-die:not(.held)').forEach((d) => d.classList.add('shake'));
      if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch {}
      const r = await act('roll');
      if (!r.ok) rb.disabled = false;
    };
    app.querySelectorAll('[data-score]').forEach((b) => (b.onclick = async () => {
      app.querySelectorAll('[data-score]').forEach((x) => (x.disabled = true));
      b.classList.add('chosen');
      const r = await act('score', { key: b.dataset.score });
      if (!r.ok) app.querySelectorAll('[data-score]').forEach((x) => (x.disabled = false));
    }));
    app.querySelectorAll('[data-flag]').forEach((b) => (b.onclick = () => act('flag', { playerId: b.dataset.flag, cat: b.dataset.cat })));
  }

  /* ---------- Einstieg ---------- */
  const hash = (location.hash || '').match(/host=([A-Z0-9]{4})/i);
  const room = normCode(new URLSearchParams(location.search).get('room'));
  if (hash) startHost(normCode(hash[1]));
  else if (room && store.get('gp-join-' + room)?.token) startPlayer(room);
  else renderStart();
})();
