'use strict';
/* Konto-Seite: Anmelden, Registrieren, eigenes Konto, Freischaltung & Rechte, Zugang zur Seite. */

const app = document.getElementById('app');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, perms: [], info: [], pendingCount: 0, tab: null, users: null, registered: false, access: null, qr: null };
const can = (p) => S.perms.includes(p);

async function api(path, opts = {}) {
  const hasBody = opts.body !== undefined || (opts.method && opts.method !== 'GET');
  const res = await fetch((path.startsWith('/zugang/') ? '/api' : '/api/konto') + path, {
    method: opts.method || 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : hasBody ? '{}' : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'vh-toast show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'vh-toast'), 3500);
}

const nextUrl = () => {
  const n = new URLSearchParams(location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
};
const fmtDate = (ms) => new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const formData = (f) => Object.fromEntries(new FormData(f).entries());
const checkedPerms = (root) => [...root.querySelectorAll('input[name="perm"]:checked')].map((x) => x.value);

function permCheckboxes(selected, prefix = '') {
  let lastArea = null;
  return `<div class="perm-grid">${S.info
    .map((p) => {
      const head = p.area !== lastArea ? `<span class="area">${esc(p.area)}</span>` : '';
      lastArea = p.area;
      return `${head}<label class="vh-check"><input type="checkbox" name="perm" value="${p.key}" ${prefix}${selected.includes(p.key) ? 'checked' : ''}> ${esc(p.label)}</label>`;
    })
    .join('')}</div>`;
}

/* ---------- Abgemeldet: Anmelden / Registrieren ---------- */
function loggedOutView() {
  const tab = S.tab === 'register' ? 'register' : 'login';
  if (S.registered) {
    app.innerHTML = `
      <div class="vh-card pinned vh-narrow success-box">
        <div class="big">📬</div>
        <h2>Fast geschafft!</h2>
        <p>Dein Konto ist angelegt und wartet jetzt auf <strong>Freischaltung durch den Admin</strong>.
        Sobald das passiert ist, kannst du dich hier anmelden.</p>
        <p><button class="vh-btn" data-action="to-login">Zur Anmeldung</button></p>
      </div>`;
    return;
  }
  app.innerHTML = `
    <div class="vh-narrow">
      <div class="konto-pawns" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h1 class="vh-h1">${tab === 'login' ? 'Anmelden' : 'Konto erstellen'}</h1>
      <div class="vh-tabs" role="tablist">
        <button role="tab" data-tab="login" aria-selected="${tab === 'login'}">Anmelden</button>
        <button role="tab" data-tab="register" aria-selected="${tab === 'register'}">Registrieren</button>
      </div>
      ${
        tab === 'login'
          ? `<form class="vh-card taped" data-form="login">
              <label class="vh-field">Benutzername<input name="username" autocomplete="username" required autofocus autocapitalize="none"></label>
              <label class="vh-field">Passwort<input name="password" type="password" autocomplete="current-password" required></label>
              <button class="vh-btn vh-btn-accent">Anmelden</button>
              <p class="vh-error" data-error></p>
            </form>
            <p class="vh-hint">Noch kein Konto? <button class="vh-link" data-tab="register">Hier registrieren.</button>
              Zum Mitspielen beim Quiz oder Werwolf brauchst du übrigens kein Konto.</p>`
          : `<form class="vh-card taped" data-form="register">
              <label class="vh-field">Benutzername<input name="username" autocomplete="username" required autofocus autocapitalize="none"
                pattern="[a-z0-9._\\-]{3,50}" title="3–50 Zeichen: a–z, 0–9, Punkt, Bindestrich, Unterstrich"></label>
              <label class="vh-field">Anzeigename (so sehen dich andere)<input name="display_name" maxlength="80" placeholder="z. B. Nils B."></label>
              <label class="vh-field">Passwort (mind. 8 Zeichen)<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
              <label class="vh-field">Passwort wiederholen<input name="password2" type="password" minlength="8" required autocomplete="new-password"></label>
              <button class="vh-btn vh-btn-accent">Konto erstellen</button>
              <p class="vh-error" data-error></p>
            </form>
            <p class="vh-hint">Neue Konten müssen erst vom Admin freigeschaltet werden. Benutzername nur mit Kleinbuchstaben,
              Zahlen, Punkt, Binde- oder Unterstrich.</p>`
      }
    </div>`;
}

/* ---------- Angemeldet ---------- */
function shell(content) {
  const tabs = [['account', 'Mein Konto'], ['look', '🎨 Aussehen']];
  if (can('users.manage')) tabs.push(['users', `Konten & Rechte${S.pendingCount ? ` (${S.pendingCount} neu)` : ''}`]);
  if (can('users.manage')) tabs.push(['access', '🚪 Zugang']);
  app.innerHTML = `
    <div class="konto-head">
      <div class="konto-hello"><span class="avatar" aria-hidden="true">${esc((S.me.display_name || '?').trim().charAt(0).toUpperCase())}</span><h1 class="vh-h1">Hallo, ${esc(S.me.display_name)}!</h1></div>
      <button class="vh-btn vh-btn-small" data-action="logout">Abmelden</button>
    </div>
    ${tabs.length > 1 ? `<div class="vh-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${esc(l)}</button>`).join('')}</div>` : ''}
    ${content}`;
}

function accountView() {
  const mine = S.info.filter((p) => can(p.key));
  const links = [];
  if (can('quiz.create') || can('quiz.manage')) links.push(['/quiz/', '❓ Meine Quizze verwalten']);
  else links.push(['/quiz/', '❓ Quiz starten']);
  if (can('tournaments.manage') || can('players.manage') || can('results.enter')) links.push(['/tischtennis/admin', '🏆 Turnierleitung']);
  shell(`
    <div class="konto-grid">
      <section class="vh-card pinned">
        <h2>Dein Konto</h2>
        <p>Angemeldet als <strong>${esc(S.me.username)}</strong>.</p>
        ${
          mine.length
            ? `<ul class="rights">${mine.map((p) => `<li><b>${esc(p.area)}</b>${esc(p.label)}</li>`).join('')}</ul>`
            : '<p class="vh-hint">Du hast noch keine besonderen Rechte. Du kannst freigegebene Quizze starten; alles andere schaltet der Admin frei.</p>'
        }
        <div class="links">${links.map(([h, l]) => `<a class="vh-btn" href="${h}">${l}</a>`).join('')}</div>
      </section>
      <form class="vh-card taped" data-form="password">
        <h2>Passwort ändern</h2>
        <label class="vh-field">Aktuelles Passwort<input name="current" type="password" required autocomplete="current-password"></label>
        <label class="vh-field">Neues Passwort (mind. 8 Zeichen)<input name="next" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="vh-btn vh-btn-accent">Passwort ändern</button>
      </form>
    </div>`);
}

function lookView() {
  shell(`
    <section class="vh-card pinned konto-look">
      <h2>Aussehen</h2>
      <p class="vh-hint">Farben, Schrift und Bewegung so, wie es dir gefällt. Die Wahl hängt an deinem Konto und gilt auf jedem Gerät, mit dem du angemeldet bist.</p>
      <div id="lookPanel"></div>
    </section>`);
  const el = document.getElementById('lookPanel');
  if (window.VHLookUI && el) window.VHLookUI.panel(el);
}

async function usersView() {
  S.users = await api('/users');
  const pending = S.users.filter((u) => u.pending);
  const others = S.users.filter((u) => !u.pending);
  S.pendingCount = pending.length;
  shell(`
    ${
      pending.length
        ? `<section class="vh-card pending">
            <h2>Warten auf Freischaltung (${pending.length})</h2>
            ${pending
              .map(
                (u) => `<form class="pending-item" data-form="approve" data-id="${u.id}">
                  <div class="who">${esc(u.display_name)} <span class="vh-hint">(${esc(u.username)})</span></div>
                  <div class="when">registriert am ${fmtDate(u.created_at)}</div>
                  ${permCheckboxes(['quiz.create'])}
                  <div class="vh-row">
                    <button class="vh-btn vh-btn-accent vh-btn-small">✓ Freischalten</button>
                    <button type="button" class="vh-btn vh-btn-small vh-btn-danger" data-action="reject" data-id="${u.id}">Ablehnen &amp; löschen</button>
                  </div>
                </form>`
              )
              .join('')}
          </section>`
        : '<p class="vh-hint">Gerade wartet niemand auf Freischaltung.</p>'
    }
    <section class="vh-card" style="margin-top:1.25rem">
      <h2>Alle Konten</h2>
      ${others
        .map(
          (u) => `<form class="user-row" data-form="user" data-id="${u.id}">
            <div class="top">
              <div class="name"><strong>${esc(u.display_name)}</strong> <span class="uname">${esc(u.username)}</span></div>
              <span class="vh-pill state-pill ${u.active ? 'on' : 'off'}">${u.active ? 'aktiv' : 'gesperrt'}</span>
            </div>
            <div class="vh-hint">${u.permissions.length ? S.info.filter((p) => u.permissions.includes(p.key)).map((p) => esc(p.label)).join(' · ') : 'keine besonderen Rechte'}</div>
            <details>
              <summary>Bearbeiten</summary>
              <div class="edit">
                <label class="vh-field">Anzeigename<input name="display_name" value="${esc(u.display_name)}" maxlength="80"></label>
                ${permCheckboxes(u.permissions)}
                <label class="vh-check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${u.id === S.me.id ? 'disabled' : ''}> Konto aktiv (darf sich anmelden)</label>
                <label class="vh-field">Neues Passwort setzen (optional)<input name="password" type="password" minlength="8" autocomplete="new-password" placeholder="unverändert"></label>
                <div class="vh-row">
                  <button class="vh-btn vh-btn-accent vh-btn-small">Speichern</button>
                  ${u.id !== S.me.id ? `<button type="button" class="vh-btn vh-btn-small vh-btn-danger" data-action="del-user" data-id="${u.id}">Konto löschen</button>` : ''}
                </div>
              </div>
            </details>
          </form>`
        )
        .join('')}
    </section>
    <form class="vh-card taped" data-form="create-user" style="margin-top:1.5rem">
      <h2>Konto direkt anlegen</h2>
      <p class="vh-hint">Für Leute, die sich nicht selbst registrieren sollen. Das Konto ist sofort aktiv.</p>
      <div class="konto-grid">
        <label class="vh-field">Benutzername<input name="username" required pattern="[a-z0-9._\\-]{3,50}" autocapitalize="none"></label>
        <label class="vh-field">Anzeigename<input name="display_name" maxlength="80"></label>
        <label class="vh-field">Startpasswort<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      </div>
      ${permCheckboxes(['quiz.create'])}
      <button class="vh-btn vh-btn-accent">Konto anlegen</button>
    </form>`);
}

/* ---------- Zugang zur Seite: Code und Einladungslinks ---------- */
function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true, alt: 'QR-Code' });
}

async function accessView() {
  S.access = await api('/zugang/admin');
  const { code, invites } = S.access;
  const fmtDay = (ms) => new Date(ms).toLocaleDateString('de-DE', { dateStyle: 'medium' });
  shell(`
    <p class="vh-hint access-intro">Das Vereinsheim ist nur für Freunde und Familie da. Wer nicht drin ist, sieht nur das Eingangstor.
      Reinkommen geht mit dem gemeinsamen Code, einem persönlichen Einladungslink oder einem Konto.
      Gib Code und Links nur an Leute aus diesem Kreis weiter und veröffentliche sie nirgends.</p>
    <div class="konto-grid">
      <form class="vh-card pinned" data-form="access-code">
        <h2>Gemeinsamer Zugangscode</h2>
        ${
          code
            ? `<p>Aktuell: <code class="access-code">${esc(code)}</code></p>`
            : '<p class="vh-hint">Kein Code eingerichtet – reinkommen geht gerade nur mit Einladungslink oder Konto.</p>'
        }
        <label class="vh-field">${code ? 'Neuer Code' : 'Code festlegen'} (mind. 4 Zeichen)
          <input name="code" minlength="4" maxlength="64" required autocomplete="off" autocapitalize="none" placeholder="z. B. Würfelbecher"></label>
        <button class="vh-btn vh-btn-accent">${code ? 'Code ändern' : 'Code festlegen'}</button>
        ${code ? '<button type="button" class="vh-btn vh-btn-small vh-btn-danger" data-action="code-off" style="margin-top:.6rem">Code abschalten</button>' : ''}
        <p class="vh-hint">Groß-/Kleinschreibung und Leerzeichen sind egal. Ändern oder Abschalten sperrt alle Geräte aus,
          die nur mit dem alten Code drin waren – Einladungen und Konten bleiben gültig.</p>
      </form>
      <form class="vh-card taped" data-form="invite">
        <h2>Persönlicher Einladungslink</h2>
        <label class="vh-field">Für wen?<input name="label" maxlength="60" required placeholder="z. B. Oma Gisela"></label>
        <label class="vh-field">Gültig
          <select name="days"><option value="0">ohne Ablauf</option><option value="1">1 Tag (Partygäste)</option><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="365">1 Jahr</option></select></label>
        <button class="vh-btn vh-btn-accent">Link erstellen</button>
        <p class="vh-hint">Wer den Link öffnet, ist auf diesem Gerät drin. Löschst du die Einladung, ist der Zugang darüber sofort weg.</p>
      </form>
    </div>
    <section class="vh-card" style="margin-top:1.25rem">
      <h2>Einladungen (${invites.length})</h2>
      ${
        invites.length
          ? invites
              .map(
                (i) => `<div class="invite-row${i.expired ? ' expired' : ''}">
              <div class="top">
                <div class="name"><strong>${esc(i.label)}</strong>
                  <span class="vh-hint">erstellt ${fmtDay(i.created_at)}${i.created_by_name ? ` von ${esc(i.created_by_name)}` : ''}</span></div>
                <span class="vh-pill">${i.expired ? 'abgelaufen' : i.expires_at ? `bis ${fmtDay(i.expires_at)}` : 'ohne Ablauf'}</span>
              </div>
              <div class="vh-hint">${i.uses ? `${i.uses}× geöffnet, zuletzt ${fmtDate(i.last_used)}` : 'noch nicht geöffnet'}</div>
              <div class="vh-row">
                <button class="vh-btn vh-btn-small" data-action="copy-invite" data-id="${i.id}">🔗 Link kopieren</button>
                <button class="vh-btn vh-btn-small" data-action="qr-invite" data-id="${i.id}">QR-Code</button>
                <button class="vh-btn vh-btn-small vh-btn-danger" data-action="del-invite" data-id="${i.id}">Löschen</button>
              </div>
              ${S.qr === i.id ? `<div class="invite-qr">${qrSvg(i.link)}<p class="vh-hint">${esc(i.link)}</p></div>` : ''}
            </div>`
              )
              .join('')
          : '<p class="vh-hint">Noch keine Einladungen.</p>'
      }
    </section>`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link kopiert.');
  } catch {
    prompt('Link zum Kopieren:', text);
  }
}

/* ---------- Rendern & Ereignisse ---------- */
async function loadMe() {
  const me = await api('/auth/me');
  S.me = me.user;
  S.perms = me.user?.permissions || [];
  S.info = me.permissionInfo || [];
  S.pendingCount = me.pendingCount || 0;
  if (me.user && window.VHLook) window.VHLook.sync(me.user.prefs && me.user.prefs.look);
}

async function render() {
  try {
    if (S.me === null) await loadMe();
    if (!S.me) return loggedOutView();
    if (!S.tab || (['users', 'access'].includes(S.tab) && !can('users.manage')) || !['account', 'users', 'access', 'look'].includes(S.tab)) S.tab = 'account';
    if (S.tab === 'users') await usersView();
    else if (S.tab === 'access') await accessView();
    else if (S.tab === 'look') lookView();
    else accountView();
  } catch (e) {
    if (e.status === 401) {
      S.me = undefined;
      return loggedOutView();
    }
    app.innerHTML = `<p class="vh-error">${esc(e.message)}</p>`;
  }
}

async function run(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}

app.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.id;
  const errEl = f.querySelector('[data-error]');
  const showErr = (msg) => {
    if (errEl) errEl.textContent = msg;
    else toast(msg, true);
  };
  const kind = f.dataset.form;

  if (kind === 'login') {
    try {
      await api('/auth/login', { method: 'POST', body: formData(f) });
      const n = nextUrl();
      if (n) return location.assign(n);
      S.me = null;
      S.tab = location.hash === '#users' ? 'users' : 'account';
      history.replaceState(null, '', location.pathname + location.search + (S.tab === 'users' ? '#users' : ''));
      await render();
    } catch (err) {
      showErr(err.message);
      f.password.value = '';
      f.password.focus();
    }
    return;
  }
  if (kind === 'register') {
    const d = formData(f);
    if (d.password !== d.password2) return showErr('Die beiden Passwörter sind nicht gleich.');
    try {
      await api('/auth/register', { method: 'POST', body: { username: d.username.toLowerCase(), display_name: d.display_name, password: d.password } });
      S.registered = true;
      render();
    } catch (err) {
      showErr(err.message);
    }
    return;
  }
  if (kind === 'password') {
    return run(async () => {
      await api('/auth/password', { method: 'POST', body: formData(f) });
      f.reset();
    }, 'Passwort geändert.');
  }
  if (kind === 'approve') {
    return run(() => api(`/users/${id}/approve`, { method: 'POST', body: { permissions: checkedPerms(f) } }), 'Konto freigeschaltet.');
  }
  if (kind === 'user') {
    const d = formData(f);
    const body = { display_name: d.display_name, permissions: checkedPerms(f) };
    if (!f.elements.active.disabled) body.active = f.elements.active.checked;
    if (d.password) body.password = d.password;
    return run(async () => {
      await api(`/users/${id}`, { method: 'PATCH', body });
      if (Number(id) === S.me.id) S.me = null; // eigene Rechte neu laden
    }, 'Gespeichert.');
  }
  if (kind === 'access-code') {
    return run(() => api('/zugang/admin/code', { method: 'PUT', body: { code: formData(f).code } }), 'Zugangscode gespeichert.');
  }
  if (kind === 'invite') {
    const d = formData(f);
    return run(async () => {
      const r = await api('/zugang/admin/invites', { method: 'POST', body: { label: d.label, days: Number(d.days) } });
      await copyText(r.link);
    });
  }
  if (kind === 'create-user') {
    const d = formData(f);
    return run(
      () => api('/users', { method: 'POST', body: { username: d.username.toLowerCase(), display_name: d.display_name, password: d.password, permissions: checkedPerms(f) } }),
      'Konto angelegt.'
    );
  }
});

app.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    e.preventDefault();
    S.tab = tab.dataset.tab;
    S.registered = false;
    history.replaceState(null, '', location.pathname + location.search + (S.tab === 'account' || S.tab === 'login' ? '' : '#' + S.tab));
    return render();
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  const a = el.dataset.action;
  if (a === 'logout') run(async () => { await api('/auth/logout', { method: 'POST' }); S.me = undefined; S.tab = 'login'; if (window.VHLook) window.VHLook.account = false; }, 'Abgemeldet.');
  if (a === 'to-login') { S.registered = false; S.tab = 'login'; render(); }
  if (a === 'reject' && confirm('Diese Anfrage ablehnen? Das Konto wird gelöscht.')) run(() => api(`/users/${id}`, { method: 'DELETE' }), 'Anfrage abgelehnt.');
  if (a === 'del-user' && confirm('Dieses Konto endgültig löschen?')) run(() => api(`/users/${id}`, { method: 'DELETE' }), 'Konto gelöscht.');
  const invite = S.access && S.access.invites.find((i) => String(i.id) === id);
  if (a === 'copy-invite' && invite) copyText(invite.link);
  if (a === 'qr-invite' && invite) { S.qr = S.qr === invite.id ? null : invite.id; render(); }
  if (a === 'del-invite' && invite && confirm(`Einladung für „${invite.label}“ löschen? Wer damit drin ist, sieht danach nur noch das Eingangstor.`)) {
    run(() => api(`/zugang/admin/invites/${id}`, { method: 'DELETE' }), 'Einladung gelöscht.');
  }
  if (a === 'code-off' && confirm('Zugangscode abschalten? Geräte, die nur mit dem Code drin waren, sind dann ausgesperrt.')) {
    run(() => api('/zugang/admin/code', { method: 'PUT', body: { code: '' } }), 'Zugangscode abgeschaltet.');
  }
});

S.tab = (location.hash || '').slice(1) || null;
render();
