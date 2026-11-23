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
<link rel="icon" href="/shared/icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/shared/vereinsheim.css">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#e6ebe3">
<script src="/shared/pwa.js" defer></script>
<style>
  body.vh-body.gate { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
  .gate main { flex: 1; display: grid; place-items: center; padding: 2rem 1rem; }
  .door { width: min(100%, 440px); text-align: center; animation: vh-rise .45s var(--vh-ease-out) both; }
  /* Die Stecktafel an der Tür */
  .door h1.vh-filz { margin: 0 0 1.4rem; font-size: clamp(1.5rem, 6vw, 2.1rem); line-height: 1.15; transform: rotate(-1deg); text-wrap: balance; }
  .door .lead { color: var(--vh-ink-soft); margin: 0 auto 1.6rem; max-width: 36ch; line-height: 1.5; }
  .door .vh-card { text-align: left; }
  .door .vh-card h2 { font-size: 1.4rem; }
  .code-input { font: 700 1.6rem var(--vh-display) !important; letter-spacing: .12em; text-align: center; }
  .door .vh-btn { width: 100%; justify-content: center; }
  .note { background: var(--vh-surface-2); border-radius: 8px; padding: .7rem .9rem; margin: 0 0 1rem; font-size: .95rem; }
  details.konto { margin-top: 1.1rem; }
  details.konto summary { cursor: pointer; color: var(--vh-ink-soft); font-weight: 600; list-style: none; text-decoration: underline; text-underline-offset: 3px; }
  details.konto summary::-webkit-details-marker { display: none; }
  details.konto[open] summary { margin-bottom: .8rem; }
  .shake { animation: vh-shake .4s; }
</style>
</head>
<body class="vh-body vh-area-konto gate">
<main>
  <div class="door">
    <h1 class="vh-filz">Geschlossene Gesellschaft</h1>
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
        <label class="vh-check"><input type="checkbox" name="remember" checked> <span>Angemeldet bleiben</span></label>
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
  bind('login-form', '/api/konto/auth/login', function (f) { return { username: f.username.value.toLowerCase(), password: f.password.value, remember: f.remember.checked }; });
})();
</script>
</body>
</html>`;
}
