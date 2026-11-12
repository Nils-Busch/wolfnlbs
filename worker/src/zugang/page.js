// Die Tor-Seite: wird für jede Adresse ausgeliefert, solange ein Gerät keinen
// Zugang hat. Sie verrät absichtlich nichts über die Inhalte dahinter. Nach dem
// Hereinkommen lädt sie dieselbe Adresse neu – QR-Codes und Links funktionieren
// also auch für Gäste, die zum ersten Mal da sind.

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function gatePage({ codeEnabled, message = "", back = null }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="/shared/theme.js"></script>
<meta name="robots" content="noindex, nofollow">
<title>Vereinsheim – Zugang</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚪</text></svg>">
<link rel="stylesheet" href="/shared/vereinsheim.css">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#172036">
<script src="/shared/pwa.js" defer></script>
<style>
  body.vh-body.gate { background: radial-gradient(120% 80% at 50% 0%, var(--vh-table-2), var(--vh-table) 70%); color: #fff; min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
  .gate main { flex: 1; display: grid; place-items: center; padding: 2rem 1rem; }
  .door { width: min(100%, 420px); text-align: center; animation: vh-rise .45s var(--vh-ease-out) both; }
  .pawns { display: flex; justify-content: center; gap: .55rem; margin-bottom: 1.4rem; }
  .pawns i { width: 1.1rem; height: 1.1rem; border-radius: 50%; animation: vh-drop-in .5s var(--vh-ease-out) both; }
  .pawns i:nth-child(1) { background: var(--vh-red); }
  .pawns i:nth-child(2) { background: var(--vh-blue); animation-delay: .08s; }
  .pawns i:nth-child(3) { background: var(--vh-green); animation-delay: .16s; }
  .pawns i:nth-child(4) { background: var(--vh-yellow); animation-delay: .24s; }
  .sign { display: inline-block; font: 800 .78rem var(--vh-body); letter-spacing: .14em; text-transform: uppercase; color: var(--vh-table); background: var(--vh-yellow); padding: .3rem .8rem; border-radius: 6px; transform: rotate(-3deg); box-shadow: 0 3px 0 var(--vh-yellow-deep); }
  .door h1 { font: 800 clamp(1.9rem, 7vw, 2.5rem)/1.05 var(--vh-display); margin: 1rem 0 .7rem; letter-spacing: -.02em; }
  .door .lead { color: rgba(255,255,255,.78); margin: 0 auto 1.6rem; max-width: 34ch; line-height: 1.5; }
  .door .vh-card { text-align: left; color: var(--vh-ink); }
  .door .vh-card h2 { font-size: 1.1rem; }
  .code-input { font: 750 1.5rem var(--vh-display) !important; letter-spacing: .12em; text-align: center; }
  .door .vh-btn { width: 100%; justify-content: center; }
  .note { background: rgba(255,255,255,.1); border-radius: var(--vh-r-field); padding: .7rem .9rem; margin: 0 0 1rem; font-size: .92rem; }
  details.konto { margin-top: 1.1rem; }
  details.konto summary { cursor: pointer; color: rgba(255,255,255,.82); font-weight: 650; list-style: none; }
  details.konto summary::-webkit-details-marker { display: none; }
  details.konto summary::after { content: " ▾"; }
  details.konto[open] summary { margin-bottom: .8rem; }
  .shake { animation: vh-shake .4s; }
  .gate .vh-legal a { color: #fff; }
</style>
</head>
<body class="vh-body vh-area-konto gate">
<main>
  <div class="door">
    <div class="pawns" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <span class="sign">Privat</span>
    <h1>Geschlossene Gesellschaft</h1>
    <p class="lead">Das Vereinsheim ist ein privater Treffpunkt für Freunde und Familie. Mit ${
      codeEnabled ? "dem Zugangscode oder deinem persönlichen Einladungslink" : "deinem persönlichen Einladungslink"
    } kommst du rein.</p>
    ${message ? `<p class="note" role="status">${esc(message)}</p>` : ""}
    ${back ? `<p><a class="vh-btn" href="${esc(back.href)}">${esc(back.label)}</a></p>` : ""}
    ${
      codeEnabled
        ? `<form class="vh-card" id="code-form">
      <h2>Zugangscode</h2>
      <label class="vh-field"><span class="vh-hint">Steht auf der Einladung oder bekommst du vor Ort.</span>
        <input class="code-input" name="code" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="64" autofocus aria-label="Zugangscode"></label>
      <button class="vh-btn vh-btn-accent">Reinkommen</button>
      <p class="vh-error" data-error></p>
    </form>`
        : ""
    }
    <details class="konto"${codeEnabled ? "" : " open"}>
      <summary>Ich habe ein Konto</summary>
      <form class="vh-card" id="login-form">
        <label class="vh-field">Benutzername<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="vh-field">Passwort<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="vh-btn">Anmelden</button>
        <p class="vh-error" data-error></p>
      </form>
    </details>
  </div>
</main>
<script>
(function () {
  function bind(id, url, body) {
    var f = document.getElementById(id);
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = f.querySelector('[data-error]');
      var btn = f.querySelector('button');
      err.textContent = '';
      btn.disabled = true;
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body(f)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) { location.replace(location.pathname === '/zugang' || location.pathname.indexOf('/zugang/') === 0 ? '/' : location.href); return; }
          err.textContent = x.d.error || 'Das hat nicht geklappt.';
          f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
          btn.disabled = false;
        })
        .catch(function () { err.textContent = 'Keine Verbindung.'; btn.disabled = false; });
    });
  }
  bind('code-form', '/api/zugang/code', function (f) { return { code: f.code.value }; });
  bind('login-form', '/api/konto/auth/login', function (f) { return { username: f.username.value.toLowerCase(), password: f.password.value }; });
})();
</script>
</body>
</html>`;
}
