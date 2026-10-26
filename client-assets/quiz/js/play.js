'use strict';
/* Handy-Ansicht: beitreten, antworten, Ergebnis sehen. Kein Konto nötig. */

const app = document.getElementById('app');
const P = { code: codeFromHash(), sock: null, state: null, joined: false, connected: false, kicked: false, gone: false, sending: false, tick: null };

function session() {
  const s = store.get('quiz-play');
  return s && s.code === P.code ? s : null;
}

function topline() {
  const s = P.state;
  return `<div class="topline"><span>Raum <b>${esc(P.code)}</b>${s && s.index >= 0 && s.phase !== 'END' ? `, Frage ${s.index + 1} von ${s.total}` : ''}${P.connected ? '' : ' – ⚠️ offline'}</span>
    ${s && s.me ? `<span class="score" title="${esc(s.me.name)}">${s.me.score} Pkt</span>` : ''}</div>`;
}

function joinForm(error = '') {
  const s = store.get('quiz-play');
  app.innerHTML = `
    <div class="qz-center">
      <div class="big">❓</div>
      <h2>Quiz mitspielen</h2>
      <form class="vh-card pinned" data-form="join" style="width:100%;text-align:left">
        <label class="vh-field">Raum-Code<input name="code" class="qz-code-input" maxlength="4" value="${esc(P.code)}" autocomplete="off" autocapitalize="characters" required></label>
        <label class="vh-field">Dein Name<input name="name" maxlength="16" value="${esc(s?.name || '')}" required autofocus placeholder="z. B. Nils"></label>
        <button class="vh-btn vh-btn-accent" style="width:100%;justify-content:center">Los geht's</button>
        <p class="vh-error">${esc(error)}</p>
      </form>
      <a class="vh-link" href="/quiz/">Zur Quiz-Übersicht</a>
    </div>`;
}

function render() {
  clearInterval(P.tick);
  if (P.gone) {
    app.innerHTML = `<div class="qz-center"><div class="big">🏁</div><h2>Dieser Raum ist vorbei.</h2>
      <p>Der Raum existiert nicht mehr.</p><a class="vh-btn" href="/quiz/">Zur Quiz-Übersicht</a></div>`;
    return;
  }
  if (P.kicked) {
    app.innerHTML = `<div class="qz-center"><div class="big">👋</div><h2>Du wurdest aus dem Raum entfernt.</h2>
      <button class="vh-btn vh-btn-accent" data-action="rejoin">Neu beitreten</button></div>`;
    return;
  }
  const s = P.state;
  if (!P.joined || !s || s.role !== 'player') {
    // Formular nicht neu zeichnen, während jemand gerade tippt.
    if (app.querySelector('form[data-form="join"]')) return;
    return joinForm();
  }

  let body = '';
  if (s.phase === 'LOBBY') {
    body = `<div class="qz-center"><div class="big">✅</div><h2>Du bist drin, ${esc(s.me.name)}!</h2>
      <p>Schau auf den großen Bildschirm – gleich geht's los.</p>
      <p class="vh-hint">${s.playerCount} Spieler im Raum</p>
      <button class="vh-link" data-action="leave">Doch nicht mitspielen</button></div>`;
  } else if (s.phase === 'QUESTION') {
    const q = s.question;
    const answered = s.myChoice !== null && s.myChoice !== undefined;
    body = `
      <div class="qz-timer"><i id="bar" style="width:100%"></i></div>
      <div class="qz-qtext">${esc(q.text)}</div>
      ${
        answered
          ? `<div class="qz-center"><div class="qz-btn ${ANSWER_STYLE[s.myChoice].cls}" style="width:70%;min-height:120px"><span class="shape">${ANSWER_STYLE[s.myChoice].shape}</span>${esc(q.answers[s.myChoice])}</div>
              <h2>Antwort ist raus!</h2><p class="vh-hint">Warte, bis alle geantwortet haben …</p></div>`
          : `<div class="qz-btns ${q.answers.length === 2 ? 'n2' : ''}">${q.answers
              .map((a, i) => `<button class="qz-btn ${ANSWER_STYLE[i].cls}" data-choice="${i}" ${P.sending ? 'disabled' : ''}><span class="shape">${ANSWER_STYLE[i].shape}</span>${esc(a)}</button>`)
              .join('')}</div>`
      }`;
  } else if (s.phase === 'REVEAL') {
    const r = s.reveal;
    const none = s.myChoice === null || s.myChoice === undefined;
    const cls = none ? 'none' : r.wasCorrect ? 'ok' : 'no';
    body = `<div class="qz-center">
      <div class="qz-result ${cls}">
        <div class="big">${none ? '⏰' : r.wasCorrect ? '✓' : '✗'}</div>
        <h2>${none ? 'Keine Antwort' : r.wasCorrect ? `Richtig! +${r.gain}` : 'Leider falsch'}</h2>
        ${!r.wasCorrect ? `<p>Richtig war: <strong>${ANSWER_STYLE[r.correct].shape} ${esc(s.question.answers[r.correct])}</strong></p>` : ''}
      </div>
      <p class="qz-score">Du hast <b data-count="${s.me.score}" data-from="${s.me.score - (r.gain || 0)}">${s.me.score}</b> Punkte und bist auf <b>Platz ${s.me.rank}</b> von ${s.playerCount}.</p>
      <p class="vh-hint">Gleich kommt die nächste Frage …</p></div>`;
  } else if (s.phase === 'END') {
    const medal = ['🥇', '🥈', '🥉'][s.me.rank - 1] || '🎉';
    body = `<div class="qz-center"><div class="big">${medal}</div>
      <h2>Platz ${s.me.rank} von ${s.playerCount}</h2>
      <p class="qz-score">mit <b>${s.me.score}</b> Punkten</p>
      <div class="vh-card" style="width:100%"><strong>Siegertreppchen</strong>
        <ol class="qz-podium-mini">${s.final.podium.map((p) => `<li>${['🥇', '🥈', '🥉'][p.rank - 1] || ''} ${esc(p.name)} – ${p.score}</li>`).join('')}</ol></div>
      <a class="vh-btn" href="/quiz/">Fertig</a></div>`;
  }
  app.innerHTML = topline() + body;
  // Punkte hochzählen und Sieg feiern – nur beim ersten Anzeigen dieser Phase
  const key = `${s.phase}:${s.index}`;
  if (key !== P.animatedKey) {
    P.animatedKey = key;
    const c = app.querySelector('[data-count]');
    if (c && window.VH) VH.countUp(c, Number(c.dataset.count), 900);
    if (s.phase === 'END' && s.me.rank === 1 && window.VH) VH.confetti();
  }

  if (s.phase === 'QUESTION') {
    const total = s.question.seconds * 1000;
    const upd = () => {
      const bar = document.getElementById('bar');
      const left = clockSync.remaining(s.endsAt);
      if (bar) { bar.style.width = `${(left / total) * 100}%`; bar.classList.toggle('low', left <= 5000); }
    };
    upd();
    P.tick = setInterval(upd, 250);
  }
}

async function doJoin(name) {
  const prev = session();
  const res = await P.sock.emit('join', { name: name || prev?.name, token: prev?.token || null });
  if (res.ok) {
    P.joined = true;
    store.set('quiz-play', { code: P.code, name: name || prev?.name, token: res.token });
  } else if (prev?.token) {
    // Alter Platz existiert nicht mehr – Formular zeigen.
    store.set('quiz-play', { code: P.code, name: prev.name, token: null });
    P.joined = false;
  }
  return res;
}

function connect() {
  if (P.sock) P.sock.close();
  P.sock = new QuizSocket(P.code, {
    onOpen: async () => {
      P.connected = true;
      const s = session();
      if (s && s.token) await doJoin();
      render();
    },
    onClose: () => {
      P.connected = false;
      render();
    },
    onState: (st) => {
      clockSync.update(st.serverNow);
      // Neue Frage -> Sende-Sperre lösen
      if (!P.state || st.index !== P.state.index || st.phase !== P.state.phase) P.sending = false;
      P.state = st;
      if (st.role === 'player') P.joined = true;
      render();
    },
    onEvent: (ev) => {
      if (ev === 'kicked') {
        P.kicked = true;
        P.joined = false;
        const s = session();
        if (s) store.set('quiz-play', { ...s, token: null });
        render();
      }
    },
    onGone: () => {
      P.gone = true;
      render();
    },
  });
}

app.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form="join"]');
  if (!f) return;
  e.preventDefault();
  const code = normCode(f.elements.code.value);
  const name = f.elements.name.value.trim();
  if (code.length !== 4) return joinForm('Der Code hat 4 Zeichen.');
  if (code !== P.code) {
    P.code = code;
    history.replaceState(null, '', '#' + code);
    P.state = null;
    P.joined = false;
    store.set('quiz-play', { code, name, token: null });
    const r = await api(`/api/quiz/rooms/${code}`).catch(() => ({ exists: false }));
    if (!r.exists) return joinForm('Diesen Raum gibt es nicht. Code prüfen?');
    connect();
  }
  for (let i = 0; i < 50 && !P.connected; i++) await new Promise((res) => setTimeout(res, 100));
  if (!P.connected) return joinForm('Keine Verbindung zum Server.');
  const btn = f.querySelector('button');
  btn.disabled = true;
  const res = await doJoin(name);
  if (!res.ok) {
    joinForm(res.error);
    return;
  }
  render();
});

app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-choice]');
  if (b && !P.sending) {
    P.sending = true;
    app.querySelectorAll('[data-choice]').forEach((x) => {
      x.disabled = true;
      if (x === b) x.classList.add('chosen');
    });
    if (navigator.vibrate) navigator.vibrate(30);
    const res = await P.sock.emit('answer', { choice: Number(b.dataset.choice) });
    if (!res.ok) {
      toast(res.error, true);
      P.sending = false;
      render();
    }
    return;
  }
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (a === 'rejoin') {
    P.kicked = false;
    joinForm();
  }
  if (a === 'leave') {
    await P.sock.emit('leave');
    const s = session();
    if (s) store.set('quiz-play', { ...s, token: null });
    location.href = '/quiz/';
  }
});

(async function start() {
  if (P.code.length !== 4) return joinForm();
  const r = await api(`/api/quiz/rooms/${P.code}`).catch(() => null);
  if (r && !r.exists) {
    P.gone = true;
    return render();
  }
  const s = session();
  if (!s || !s.token) {
    // Name aus der Übersicht übernommen? Dann gleich beitreten.
    connect();
    if (s && s.name) {
      const wait = setInterval(async () => {
        if (P.connected) {
          clearInterval(wait);
          const res = await doJoin(s.name);
          if (!res.ok) joinForm(res.error);
          else render();
        }
      }, 100);
      setTimeout(() => clearInterval(wait), 8000);
    } else joinForm();
    return;
  }
  connect();
})();
