'use strict';
/* Bildschirm für den Fernseher/Beamer. Gehört der Person, die den Raum mit
   ihrem Konto eröffnet hat (geheimer hostKey im Browser gespeichert). */

const app = document.getElementById('app');
const Q = { code: codeFromHash(), sock: null, state: null, connected: false, gone: false, denied: false, tick: null, busy: false };
const joinUrl = () => `${location.origin}/quiz/play#${Q.code}`;
const prettyUrl = () => `${location.host}/quiz`;

function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'QR-Code zum Mitspielen' });
}

function bar(extra = '') {
  const s = Q.state;
  return `<header class="qs-bar">
    <span class="title">❓ ${esc(s?.title || 'Quiz')}</span>
    ${extra}
    <span class="count">${s ? `${s.players.length} Spieler` : ''}</span>
    <span class="code" title="Raum-Code">${esc(Q.code)}</span>
  </header>`;
}

function foot(buttons, info = '') {
  return `<footer class="qs-foot"><span class="info">${info}${Q.connected ? '' : ' ⚠️ Verbindung unterbrochen – verbinde neu …'}</span>${buttons}
    <button class="vh-btn" data-action="fullscreen" title="Vollbild">⛶</button></footer>`;
}

function answerTiles(q, reveal, answered) {
  const total = reveal ? reveal.counts.reduce((a, b) => a + b, 0) : 0;
  return `<div class="qs-answers">${q.answers
    .map((a, i) => {
      const st = ANSWER_STYLE[i];
      const cls = reveal ? (i === reveal.correct ? 'right' : 'dim') : '';
      const cnt = reveal ? reveal.counts[i] || 0 : null;
      return `<div class="qs-ans ${st.cls} ${cls}">
        <span class="shape">${st.shape}</span><span class="txt">${esc(a)}</span>
        ${reveal ? `<span class="cnt">${cnt}</span><span class="bar" style="width:${total ? (cnt / total) * 100 : 0}%"></span>` : ''}
      </div>`;
    })
    .join('')}</div>`;
}

function render() {
  clearInterval(Q.tick);
  if (Q.gone) {
    app.innerHTML = `<div class="qs-msg"><h1 class="vh-h1">Dieser Raum ist geschlossen.</h1><p><a class="vh-btn" href="/quiz/">Zur Quiz-Übersicht</a></p></div>`;
    return;
  }
  if (Q.denied) {
    app.innerHTML = `<div class="qs-msg"><h1 class="vh-h1">Das ist nicht dein Quiz-Bildschirm.</h1>
      <p>Diesen Bildschirm kann nur öffnen, wer den Raum gestartet hat – auf demselben Gerät und im selben Browser.
      Mitspielen geht hier: <a href="/quiz/play#${esc(Q.code)}">${esc(prettyUrl())} mit Code ${esc(Q.code)}</a>.</p>
      <p><a class="vh-btn" href="/quiz/">Zur Quiz-Übersicht</a></p></div>`;
    return;
  }
  const s = Q.state;
  if (!s) {
    app.innerHTML = `<p class="qs-msg">Verbinde mit Raum ${esc(Q.code)} …</p>`;
    return;
  }

  if (s.phase === 'LOBBY') {
    app.innerHTML = `${bar()}
      <main class="qs-main"><div class="qs-lobby">
        <div class="join">
          <span class="vh-eyebrow">Mach mit!</span>
          <h1>Handy raus und mitspielen</h1>
          <div class="url">Geh auf <b>${esc(prettyUrl())}</b> und gib diesen Code ein:</div>
          <div class="bigcode">${esc(Q.code)}</div>
        </div>
        <div class="qs-qr">${qrSvg(joinUrl())}<p>oder einfach scannen</p></div>
        <div class="qs-players">${
          s.players.length
            ? s.players.map((p) => `<span class="p ${p.connected ? '' : 'off'}" data-kick="${p.id}" title="Klicken zum Entfernen">${esc(p.name)}</span>`).join('')
            : '<span class="empty">Noch ist niemand da … gleich geht’s los!</span>'
        }</div>
      </div></main>
      ${foot(`<button class="vh-btn vh-btn-accent" data-action="start" ${s.players.length ? '' : 'disabled'}>▶ Quiz starten</button>`,
        `${s.total} Fragen · Spieler anklicken, um sie zu entfernen`)}`;
    return;
  }

  if (s.phase === 'QUESTION') {
    const q = s.question;
    app.innerHTML = `${bar()}
      <main class="qs-main"><div class="qs-question">
        <div class="qs-qhead"><span class="n">Frage ${s.index + 1}/${s.total}</span>
          <h1 class="qs-qtext">${esc(q.text)}</h1>
          <div class="qs-clock"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="ring" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="0"/></svg><span class="t" id="secs"></span></div>
        </div>
        <div class="qs-progress">${s.answered} von ${s.players.filter((p) => p.connected).length} haben geantwortet</div>
        ${answerTiles(q, null)}
      </div></main>
      ${foot(`<button class="vh-btn" data-action="next">Auflösen</button>`, 'Löst automatisch auf, wenn alle geantwortet haben oder die Zeit um ist.')}`;
    const total = q.seconds * 1000;
    const upd = () => {
      const left = clockSync.remaining(s.endsAt);
      const ring = document.getElementById('ring');
      const secs = document.getElementById('secs');
      if (ring) ring.setAttribute('stroke-dashoffset', String(276.5 * (1 - left / total)));
      if (secs) secs.textContent = Math.ceil(left / 1000);
    };
    upd();
    Q.tick = setInterval(upd, 200);
    return;
  }

  if (s.phase === 'REVEAL') {
    const q = s.question;
    const last = s.index + 1 >= s.total;
    app.innerHTML = `${bar()}
      <main class="qs-main"><div class="qs-question">
        <div class="qs-qhead"><span class="n">Frage ${s.index + 1}/${s.total}</span><h1 class="qs-qtext">${esc(q.text)}</h1></div>
        <div></div>
        <div class="qs-reveal">
          ${answerTiles(q, s.reveal)}
          <div><h3 class="qs-rank-title">Zwischenstand</h3><ol class="qs-rank">${s.reveal.ranking
            .map((p, i) => `<li><span class="r">${i + 1}.</span><span class="nm">${esc(p.name)}</span><span class="g">${p.gain ? '+' + p.gain : ''}</span><span class="s">${p.score}</span></li>`)
            .join('')}</ol></div>
        </div>
      </div></main>
      ${foot(`<button class="vh-btn vh-btn-accent" data-action="next">${last ? '🏆 Zum Ergebnis' : 'Nächste Frage →'}</button>`)}`;
    return;
  }

  if (s.phase === 'END') {
    const f = s.final;
    const top = (r) => f.filter((p) => p.rank === r);
    const col = (r, cls) => {
      const ps = top(r);
      if (!ps.length) return `<div class="col ${cls}"></div>`;
      return `<div class="col ${cls}"><span class="nm">${ps.map((p) => esc(p.name)).join(' & ')}</span><span class="pts">${ps[0].score} Punkte</span>
        <div class="block">${['🥇', '🥈', '🥉'][r - 1]}</div></div>`;
    };
    const rest = f.filter((p) => p.rank > 3);
    app.innerHTML = `${bar()}
      <main class="qs-main"><div class="qs-end">
        <span class="vh-eyebrow">Geschafft!</span>
        <h1>Das Siegertreppchen</h1>
        <div class="qs-podium">${col(2, 'p2')}${col(1, 'p1')}${col(3, 'p3')}</div>
        ${rest.length ? `<div class="qs-rest">${rest.map((p) => `<span>${p.rank}. ${esc(p.name)} (${p.score})</span>`).join('')}</div>` : ''}
      </div></main>
      ${foot(`<button class="vh-btn" data-action="restart">↻ Nochmal spielen</button><a class="vh-btn vh-btn-accent" href="/quiz/">Fertig</a>`)}`;
  }
}

async function send(event, payload) {
  if (Q.busy) return;
  Q.busy = true;
  const res = await Q.sock.emit(event, payload);
  Q.busy = false;
  if (!res.ok) toast(res.error, true);
}

app.addEventListener('click', (e) => {
  const kick = e.target.closest('[data-kick]');
  if (kick) {
    if (confirm(`${kick.textContent} aus dem Raum entfernen?`)) send('kick', { playerId: kick.dataset.kick });
    return;
  }
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (!a) return;
  if (a === 'fullscreen') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  } else if (a === 'restart') {
    if (confirm('Alle Punkte zurücksetzen und das Quiz nochmal von vorne spielen?')) send('restart');
  } else send(a);
});

// Leertaste / Pfeil rechts = weiter (praktisch mit Presenter oder Tastatur)
document.addEventListener('keydown', (e) => {
  if (!Q.state || e.target.closest('input, textarea')) return;
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault();
    if (Q.state.phase === 'LOBBY' && Q.state.players.length) send('start');
    else if (Q.state.phase === 'QUESTION' || Q.state.phase === 'REVEAL') send('next');
  }
});

(function start() {
  if (Q.code.length !== 4) {
    app.innerHTML = `<div class="qs-msg"><h1 class="vh-h1">Kein Raum angegeben.</h1><p><a class="vh-btn" href="/quiz/">Zur Quiz-Übersicht</a></p></div>`;
    return;
  }
  const host = store.get('quiz-host-' + Q.code);
  if (!host) {
    Q.denied = true;
    return render();
  }
  Q.sock = new QuizSocket(Q.code, {
    onOpen: async () => {
      Q.connected = true;
      const res = await Q.sock.emit('host', { hostKey: host.hostKey });
      if (!res.ok) {
        if (/nicht gefunden/i.test(res.error)) Q.gone = true;
        else Q.denied = true;
      }
      render();
    },
    onClose: () => {
      Q.connected = false;
      render();
    },
    onState: (st) => {
      clockSync.update(st.serverNow);
      Q.state = st;
      render();
    },
    onGone: () => {
      Q.gone = true;
      render();
    },
  });
  render();
})();
