/**
 * Versus – Lobby und Spielsteuerung für Duell-Spiele.
 *  Computer: gegen ai.js in drei Stufen, komplett im Browser.
 *  Lokal:  beide Spieler am selben Gerät, Regeln laufen im Browser.
 *  Online: ein eigener Raum (Durable Object) pro Partie, Server prüft jeden Zug.
 *
 * Versus.start({ game, token(i) -> html, render(boardEl, state, canMove, move) })
 */
const Versus = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  function start(cfg) {
    const rules = Rules.games[cfg.game];
    const app = $('app');
    app.className = 'vs';
    app.innerHTML = `
      <section class="panel vs-lobby" id="vsLobby">
        <label>Dein Name
          <input id="vsName" maxlength="16" placeholder="z. B. Nils" autocomplete="nickname">
        </label>
        <div class="vs-modes">
          <div class="vs-cpu" id="vsCpuBox" hidden>
            <button id="vsCpu">🤖 Gegen den Computer</button>
            <div class="vs-levels" role="radiogroup" aria-label="Stärke des Computers">
              <button type="button" data-level="easy" role="radio">Leicht</button>
              <button type="button" data-level="medium" role="radio">Mittel</button>
              <button type="button" data-level="hard" role="radio">Schwer</button>
            </div>
          </div>
          <button id="vsLocal" class="ghost">👥 Lokal – zu zweit an einem Gerät</button>
          <div class="or">oder online gegen jemand anderen</div>
          <button id="vsCreate" class="ghost">🌐 Raum erstellen</button>
          <div class="vs-join">
            <input id="vsCode" maxlength="4" placeholder="CODE" autocomplete="off" aria-label="Raumcode">
            <button id="vsJoin" class="ghost">Beitreten</button>
          </div>
        </div>
        <p class="error" id="vsError"></p>
      </section>

      <section id="vsGame" hidden>
        <div class="vs-share panel" id="vsShare" hidden>
          <div class="muted">Raumcode – teile ihn mit deinem Gegner</div>
          <div class="code" id="vsShareCode"></div>
          <div class="row">
            <input id="vsShareLink" readonly aria-label="Einladungslink">
            <button id="vsCopy" class="ghost">Link kopieren</button>
          </div>
        </div>
        <div class="scorebar">
          <div class="pl p0" id="vsP0"></div>
          <div class="vs-dash">:</div>
          <div class="pl p1 right" id="vsP1"></div>
        </div>
        <div class="vs-status" id="vsStatus" role="status" aria-live="polite"></div>
        <div class="vs-info" id="vsInfo"></div>
        <div id="vsBoard"></div>
        <p class="vs-hint" id="vsHint"></p>
        <div class="vs-actions">
          <button id="vsRematch" hidden>🔁 Nochmal</button>
          <button id="vsLeave" class="ghost">Zur Lobby</button>
        </div>
        <div class="room-tag" id="vsRoomTag"></div>
      </section>`;

    const nameInput = $('vsName');
    nameInput.value = store.get('gg-name');
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) $('vsCode').value = urlRoom.toUpperCase().slice(0, 4);

    // Zustand
    let mode = null;          // 'cpu' | 'local' | 'online'
    let level = store.get('gg-level') || 'medium';
    let cpuTimer = null;
    const hasCpu = typeof AI !== 'undefined' && AI.supports(cfg.game);
    let ws = null;
    let you = null;           // eigener Spielerindex (online)
    let state = null;
    let names = ['Spieler 1', 'Spieler 2'];
    let wins = [0, 0];
    let starter = 0;          // lokal: wer beginnt die nächste Runde
    let code = null;
    let notice = null;        // beendet das Spiel (Gegner weg, Verbindung weg)
    let rematchSent = false;

    function myName(fallback) {
      const n = nameInput.value.trim().slice(0, 16);
      if (n) store.set('gg-name', n);
      return n || fallback;
    }

    function showLobby(err = '') {
      $('vsLobby').hidden = false;
      $('vsGame').hidden = true;
      $('vsError').textContent = err;
    }
    function showGame() {
      $('vsLobby').hidden = true;
      $('vsGame').hidden = false;
    }

    function canMove() {
      if (mode === 'cpu') return !!state && !Rules.isOver(state) && state.turn === 0 && !cpuTimer;
      return !!state && !notice && !Rules.isOver(state) && (mode === 'local' || state.turn === you);
    }

    function statusText() {
      if (notice) return notice;
      if (!state) return 'Warte auf Mitspieler…';
      if (state.draw) return 'Unentschieden!';
      if (state.winner !== null) {
        if (mode === 'cpu') return state.winner === 0 ? 'Du hast gewonnen! 🎉' : 'Der Computer gewinnt.';
        if (mode === 'online') return state.winner === you ? 'Du hast gewonnen! 🎉' : 'Du hast verloren.';
        return `${names[state.winner]} gewinnt! 🎉`;
      }
      if (mode === 'cpu') {
        if (state.winner === 0) return 'Du hast gewonnen! 🎉';
        return state.turn === 0 ? 'Du bist am Zug' : 'Der Computer überlegt …';
      }
      if (mode === 'online') return state.turn === you ? 'Du bist am Zug' : `${names[state.turn]} ist am Zug …`;
      return `${names[state.turn]} ist am Zug`;
    }

    function playerHtml(i) {
      const me = mode === 'online' && i === you ? ' <small class="muted">(du)</small>' : '';
      return `${cfg.token(i)}<span>${esc(names[i])}${me}</span><b>${wins[i]}</b>`;
    }

    function render() {
      const view = state || rules.init(0);
      const live = state && !Rules.isOver(state) && !notice;
      [0, 1].forEach((i) => {
        const el = $('vsP' + i);
        el.innerHTML = playerHtml(i);
        el.classList.toggle('active', !!live && state.turn === i);
      });
      // Statuszeile hüpft bei jeder Änderung kurz, Sieg/Niederlage bekommen eigene Farbe
      const st = $('vsStatus'), text = statusText();
      if (st.textContent !== text) {
        st.textContent = text;
        st.classList.remove('bump');
        void st.offsetWidth;
        st.classList.add('bump');
      }
      const over = state && Rules.isOver(state) && !notice;
      const mine = mode === 'online' ? you : 0;
      st.classList.toggle('win', !!over && !state.draw && (mode === 'local' || state.winner === mine));
      st.classList.toggle('lose', !!over && !state.draw && mode !== 'local' && state.winner !== mine);
      $('vsInfo').innerHTML = cfg.info ? cfg.info(view, names, esc) : '';
      cfg.render($('vsBoard'), view, canMove(), move);
      $('vsRematch').hidden = !(state && Rules.isOver(state)) || !!notice;
      $('vsRematch').disabled = rematchSent;

      const waiting = mode === 'online' && !state && !notice;
      $('vsShare').hidden = !waiting;
      if (waiting) {
        $('vsShareCode').textContent = code;
        $('vsShareLink').value = `${location.origin}${location.pathname}?room=${code}`;
      }
      $('vsRoomTag').textContent = mode === 'online' && code ? `Online-Raum ${code}` : mode === 'local' ? 'Lokales Spiel' : mode === 'cpu' ? `Gegen den Computer · ${AI.LEVELS[level]}` : '';
      $('vsGame').classList.toggle('thinking', mode === 'cpu' && !!state && !Rules.isOver(state) && state.turn === 1);
    }

    function apply(mv) {
      const next = rules.move(state, state.turn, mv);
      if (!next) return false;
      state = next;
      if (next.winner !== null) {
        wins[next.winner]++;
        if (mode === 'cpu' && next.winner === 0 && window.VH) VH.confetti();
      }
      render();
      scheduleCpu();
      return true;
    }

    // Der Computer zieht mit kurzer Denkpause, damit man seinen Zug sieht.
    function scheduleCpu() {
      if (mode !== 'cpu' || !state || Rules.isOver(state) || state.turn !== 1 || cpuTimer) return;
      cpuTimer = setTimeout(() => {
        cpuTimer = null;
        if (mode !== 'cpu' || !state || state.turn !== 1) return;
        const t0 = performance.now();
        const mv = AI.pick(cfg.game, state, 1, level);
        const wait = Math.max(0, 250 - (performance.now() - t0));
        setTimeout(() => apply(mv), wait);
      }, 380 + Math.random() * 300);
      render();
    }

    function move(mv) {
      if (!canMove()) return;
      if (mode === 'local' || mode === 'cpu') {
        apply(mv);
      } else {
        send({ type: 'move', move: mv });
      }
    }

    /* ---------- Online: ein WebSocket pro Raum (Durable Object) ---------- */
    function send(msg) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    }

    function connectTo(roomCode, onOpen) {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/api/spiele/rooms/${roomCode}/ws`);
      ws = sock;
      sock.onopen = onOpen;
      sock.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        handle(msg);
      };
      sock.onclose = () => {
        if (ws !== sock) return; // bewusst geschlossen
        ws = null;
        if (!notice) { notice = 'Verbindung zum Server getrennt.'; render(); }
      };
    }

    function closeWs() {
      const s = ws;
      ws = null;
      if (s) s.close();
    }

    function handle(msg) {
      switch (msg.type) {
        case 'waiting':
          you = msg.you; code = msg.code; state = null;
          names = [myName('Spieler 1'), '…'];
          showGame(); render();
          break;
        case 'state':
          state = msg.state; names = msg.names; wins = msg.wins; you = msg.you; code = msg.code;
          rematchSent = false;
          $('vsHint').textContent = '';
          showGame(); render();
          break;
        case 'rematch_requested':
          $('vsHint').textContent = `${names[1 - you]} möchte nochmal spielen.`;
          break;
        case 'opponent_left':
          notice = 'Dein Gegner hat das Spiel verlassen.';
          $('vsHint').textContent = '';
          closeWs(); render();
          break;
        case 'error':
          closeWs(); reset(); showLobby(msg.message);
          break;
      }
    }

    function reset() {
      clearTimeout(cpuTimer); cpuTimer = null;
      mode = null; you = null; state = null; code = null; notice = null; rematchSent = false;
      names = ['Spieler 1', 'Spieler 2']; wins = [0, 0]; starter = 0;
      $('vsHint').textContent = '';
    }

    /* ---------- Buttons ---------- */
    function showLevel() {
      document.querySelectorAll('#vsCpuBox [data-level]').forEach((b) => {
        const on = b.dataset.level === level;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    if (hasCpu) {
      $('vsCpuBox').hidden = false;
      if (!AI.LEVELS[level]) level = 'medium';
      showLevel();
      document.querySelectorAll('#vsCpuBox [data-level]').forEach((b) => {
        b.onclick = () => { level = b.dataset.level; store.set('gg-level', level); showLevel(); };
      });
      $('vsCpu').onclick = () => {
        reset();
        mode = 'cpu';
        names = [myName('Du'), `Computer`];
        state = rules.init(starter);
        showGame(); render(); scheduleCpu();
      };
    }

    $('vsLocal').onclick = () => {
      reset();
      mode = 'local';
      const n = nameInput.value.trim();
      names = [n || 'Spieler 1', 'Spieler 2'];
      if (n) store.set('gg-name', n);
      state = rules.init(starter);
      showGame(); render();
    };

    $('vsCreate').onclick = async () => {
      reset();
      mode = 'online';
      showLobby('');
      try {
        const res = await fetch('/api/spiele/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: cfg.game }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Raum konnte nicht erstellt werden.');
        connectTo(data.roomCode, () => send({ type: 'hello', name: myName('Spieler 1'), game: cfg.game }));
      } catch (err) {
        mode = null;
        showLobby(err.message || 'Verbindung zum Server fehlgeschlagen.');
      }
    };

    const join = async () => {
      const c = $('vsCode').value.trim().toUpperCase();
      if (c.length !== 4) return showLobby('Bitte den 4-stelligen Raumcode eingeben.');
      reset();
      mode = 'online';
      try {
        const res = await fetch(`/api/spiele/rooms/${encodeURIComponent(c)}`);
        const info = await res.json();
        if (!info.exists) throw new Error('Raum nicht gefunden. Code prüfen?');
        if (info.game !== cfg.game) throw new Error('Dieser Raum gehört zu einem anderen Spiel.');
        if (info.full) throw new Error('Der Raum ist schon voll.');
      } catch (err) {
        mode = null;
        return showLobby(err.message || 'Raum nicht gefunden.');
      }
      connectTo(c, () => send({ type: 'hello', name: myName('Spieler 2'), game: cfg.game }));
    };
    $('vsJoin').onclick = join;
    $('vsCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

    $('vsRematch').onclick = () => {
      if (mode === 'local' || mode === 'cpu') {
        starter = 1 - starter;
        state = rules.init(starter);
        render();
        scheduleCpu();
      } else {
        rematchSent = true;
        send({ type: 'rematch' });
        $('vsHint').textContent = 'Warte auf deinen Gegner …';
        render();
      }
    };

    $('vsLeave').onclick = () => {
      closeWs();
      reset();
      if (location.search) history.replaceState(null, '', location.pathname);
      showLobby();
    };

    $('vsCopy').onclick = async () => {
      const input = $('vsShareLink');
      try {
        await navigator.clipboard.writeText(input.value);
        $('vsCopy').textContent = 'Kopiert ✓';
      } catch {
        input.select();
        $('vsCopy').textContent = 'Markiert – Strg+C';
      }
      setTimeout(() => ($('vsCopy').textContent = 'Link kopieren'), 2000);
    };

    showLobby();
  }

  return { start };
})();
