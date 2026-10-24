'use strict';
/* Admin-Ansicht: Turniere, Teilnehmer, Ergebnisse.
   Anmeldung, Benutzer & Rechte liegen jetzt auf der gemeinsamen Konto-Seite (/konto/). */
const app = document.getElementById('app');
const S = { user: null, perms: [], view: 'list', tid: null, tab: null, data: null, showDone: false, editing: new Set() };
const can = p => S.perms.includes(p);

function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = isError ? 'show error' : 'show';
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 3500);
}
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); await render(); }
  catch (e) { if (e.status === 401) { S.user = null; await render(); } toast(e.message, true); }
}
const formData = f => Object.fromEntries(new FormData(f).entries());

/* ---------- Login ---------- */
function loginView() {
  app.innerHTML = `
    <form class="card narrow" data-form="login">
      <h1 class="page-title">Anmelden</h1>
      <label>Benutzername<input name="username" autocomplete="username" required autofocus></label>
      <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="primary">Anmelden</button>
    </form>
    <p class="hint" style="text-align:center">Noch kein Konto? <a href="/konto/#register">Hier registrieren</a> – danach muss der Admin dich freischalten.</p>`;
}

function shell(content) {
  const nav = [['list', 'Turniere']];
  const links = [];
  if (can('users.manage')) links.push(['/konto/#users', 'Benutzer & Rechte']);
  links.push(['/konto/', 'Mein Konto']);
  app.innerHTML = `
    <div class="adminbar">
      <nav>${nav.map(([v, l]) => `<button data-action="nav" data-view="${v}" class="${S.view === v || (v === 'list' && S.view === 'tournament') ? 'active' : ''}">${l}</button>`).join('')}${links.map(([h, l]) => `<a class="navlink" href="${h}">${l}</a>`).join('')}</nav>
      <span class="who">${esc(S.user.display_name)} <button class="link" data-action="logout">Abmelden</button></span>
    </div>${content}`;
}

/* ---------- Turnierliste ---------- */
async function listView() {
  const list = await api('/api/tournaments');
  shell(`
    <h1 class="page-title">Turniere</h1>
    ${list.length ? `<ul class="t-list">${list.map(t => `
      <li><a href="#" data-action="open" data-id="${t.id}">
        <span class="t-name">${esc(t.name)}</span>
        <span class="t-meta">${[SPORT_LABEL[t.sport] || SPORT_LABEL.tabletennis, fmtDate(t.event_date), FORMAT_LABEL[t.format], `${t.player_count} ${t.sport === 'football' ? 'Teams' : 'Teilnehmer'}`].filter(Boolean).map(esc).join(', ')}</span>
        <span class="badge ${t.status}">${STATUS_LABEL[t.status]}</span></a></li>`).join('')}</ul>`
      : '<p class="empty">Noch kein Turnier. Lege unten das erste an.</p>'}
    ${can('tournaments.manage') ? `<form class="card" data-form="create-t"><h2>Neues Turnier</h2>${tournamentFields({ sport: 'tabletennis', format: 'group', best_of: 5, group_count: 2, advance_per_group: 2 }, false)}<button class="primary">Turnier anlegen</button></form>` : ''}`);
}

function tournamentFields(t, locked) {
  const dis = locked ? 'disabled' : '';
  const fb = t.sport === 'football';
  return `<div class="grid sport-form" data-sport="${fb ? 'football' : 'tabletennis'}">
    <fieldset class="span2 sport-pick"><legend>Sportart</legend>
      ${Object.entries(SPORT_LABEL).map(([k, v]) => `<label class="sport-opt"><input type="radio" name="sport" value="${k}" ${(t.sport || 'tabletennis') === k ? 'checked' : ''} ${dis}> ${v}</label>`).join('')}
      <span class="hint sport-hint">${fb ? 'Tore statt Sätze, Unentschieden möglich (3/1/0 Punkte), Teams mit Kader, Torschützenliste.' : 'Sätze bis 11, Best-of-Modus, Einzel oder Doppel.'}</span>
    </fieldset>
    <label class="span2">Name<input name="name" required maxlength="120" value="${esc(t.name)}"></label>
    <label>Datum<input name="event_date" type="date" value="${esc(t.event_date || '')}"></label>
    <label>Ort<input name="location" maxlength="120" value="${esc(t.location || '')}"></label>
    <label>Modus<select name="format" ${dis}>${Object.entries(FORMAT_LABEL).map(([k, v]) => `<option value="${k}" ${t.format === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="tt-only">Spielmodus<select name="best_of" ${dis}>${[1, 3, 5, 7].map(n => `<option value="${n}" ${t.best_of === n ? 'selected' : ''}>${n === 1 ? 'Einzelspiel (1 Spiel bis 11, bei 10:10 Entscheidung)' : `Best of ${n} (${(n + 1) / 2} Gewinnsätze)`}</option>`).join('')}</select></label>
    <label>Gruppen<input name="group_count" type="number" min="1" max="32" value="${t.group_count}" ${dis}></label>
    <label>Weiter pro Gruppe<input name="advance_per_group" type="number" min="1" max="16" value="${t.advance_per_group}" ${dis}></label>
    <label class="check span2"><input type="checkbox" name="double_elim" ${dis} ${t.double_elim ? 'checked' : ''}> Loserbracket (Doppel-K.-o.)</label>
  </div>
  <p class="hint">Gruppen und „Weiter pro Gruppe“ gelten nur für den Modus „Gruppen + K.-o.“. Loserbracket gilt für „K.-o.-System“ und „Gruppen + K.-o.“ und braucht eine Zweierpotenz an Teilnehmern bzw. Qualifikanten (4, 8, 16, 32 …).${locked ? ' Sportart, Modus, Sätze und Loserbracket sind nach dem Start gesperrt.' : ''}</p>`;
}

function tPayload(f) {
  const d = formData(f);
  ['best_of', 'group_count', 'advance_per_group'].forEach(k => { if (d[k] !== undefined) d[k] = Number(d[k]); });
  if (d.sport === 'football') d.best_of = 1;
  d.double_elim = !!f.elements.double_elim?.checked;
  return d;
}

/* ---------- Turnierdetail ---------- */
async function tournamentView() {
  S.data = await api(`/api/tournaments/${S.tid}`);
  const d = S.data, t = d.tournament;
  const hasKo = d.matches.some(m => m.phase === 'ko');
  const tabs = [['matches', 'Spiele & Ergebnisse']];
  if (t.format !== 'ko') tabs.push(['table', t.format === 'group' ? 'Gruppen' : 'Tabelle']);
  if (t.format !== 'league') tabs.push(['bracket', 'Turnierbaum']);
  if (isFb(d)) tabs.push(['scorers', 'Torschützen']);
  tabs.push(['players', `${words(d).entrants} (${d.players.length})`], ['settings', 'Einstellungen']);
  if (!tabs.some(x => x[0] === S.tab)) S.tab = t.status === 'draft' ? 'players' : 'matches';

  const actions = [];
  if (can('tournaments.manage')) {
    if (t.status === 'draft') actions.push(`<button class="primary" data-action="start">Turnier starten und auslosen</button>`);
    if (t.format === 'group' && t.status === 'running' && !hasKo) {
      const open = d.matches.filter(m => m.status === 'pending').length;
      actions.push(`<button class="primary" data-action="ko" ${open ? 'disabled' : ''}>K.-o.-Runde auslosen</button>${open ? `<span class="hint">noch ${open} Gruppenspiele offen</span>` : ''}`);
    }
    if (t.status !== 'draft') actions.push(`<button class="danger" data-action="reset">Auslosung zurücksetzen</button>`);
  }

  const body = {
    matches: adminMatches, table: renderStandings,
    bracket: x => renderBracket(x), scorers: x => renderScorers(x), players: adminPlayers, settings: adminSettings,
  }[S.tab](d);

  shell(`
    <a class="back" href="#" data-action="nav" data-view="list">Alle Turniere</a>
    <h1 class="page-title">${esc(t.name)}</h1>
    <p class="t-meta">${[fmtDate(t.event_date), t.location, ...modeParts(t)].filter(Boolean).map(esc).join(', ')}
      <span class="badge ${t.status}">${STATUS_LABEL[t.status]}</span>
      <a class="link" href="/tischtennis/#t=${t.id}" target="_blank" rel="noopener">Besucheransicht öffnen</a>
      <a class="link" href="/tischtennis/live#t=${t.id}" target="_blank" rel="noopener">📺 Liveansicht (Bildschirm)</a>
      ${can('tournaments.manage') ? `<button class="link" type="button" data-action="visitor-qr">🔗 Besucher-Link &amp; QR-Code</button>` : ''}</p>
    <div id="qrbox"></div>
    ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}
    ${renderTabs(tabs, S.tab)}
    <div class="tab-body">${body}</div>`);
  app.querySelectorAll('form.fbform').forEach(syncScorerFields);
}

function setInputs(m, bestOf) {
  const rows = [];
  for (let i = 0; i < bestOf; i++) {
    const s = m.sets[i] || ['', ''];
    const label = bestOf === 1 ? 'Ergebnis' : `Satz ${i + 1}`;
    rows.push(`<span class="setpair"><input type="number" min="0" max="99" inputmode="numeric" name="a${i}" value="${s[0]}" aria-label="${label} links"><span>:</span><input type="number" min="0" max="99" inputmode="numeric" name="b${i}" value="${s[1]}" aria-label="${label} rechts"></span>`);
  }
  return rows.join('');
}

function adminMatches(d) {
  if (d.tournament.status === 'draft') return '<p class="empty">Noch keine Spiele. Teilnehmer eintragen und das Turnier starten.</p>';
  const P = nameMap(d.players);
  const enter = can('results.enter');
  const W = words(d);
  const fb = isFb(d);
  let ms = d.matches.filter(m => m.status !== 'bye');
  if (!S.showDone) ms = ms.filter(m => m.status === 'pending' || S.editing.has(m.id));
  const row = m => {
    const ready = m.player1_id && m.player2_id;
    const edit = enter && ready && (m.status === 'pending' || S.editing.has(m.id));
    return `<li class="amatch ${m.status}">
      <div class="am-head"><span>${esc(matchTitle(m, d))}</span>
        ${enter ? `<label class="tbl">${W.table} <input type="number" min="1" max="99" value="${m.table_no ?? ''}" data-table="${m.id}"></label>` : (m.table_no ? `${W.table} ${m.table_no}` : '')}</div>
      <div class="am-players"><span class="${m.winner_id && m.winner_id === m.player1_id ? 'win' : ''}">${playerLabel(P[m.player1_id])}</span>
        <span class="m-score">${setScore(m) || 'gegen'}</span>
        <span class="right ${m.winner_id && m.winner_id === m.player2_id ? 'win' : ''}">${playerLabel(P[m.player2_id])}</span></div>
      ${edit ? `<form class="setform${fb ? ' fbform' : ''}" data-form="result" data-id="${m.id}">${fb ? footballInputs(m, P) : setInputs(m, d.tournament.best_of)}
          <button class="primary">Ergebnis speichern</button>${m.status === 'done' ? '<button type="button" class="link" data-action="cancel-edit" data-id="' + m.id + '">Abbrechen</button>' : ''}</form>`
      : m.status === 'done' ? `<div class="am-done"><span class="m-sets">${[setDetail(m), scorerLine(m)].filter(Boolean).join(' · ')}</span>
          ${enter ? `<button class="link" data-action="edit-result" data-id="${m.id}">Korrigieren</button><button class="link danger" data-action="clear-result" data-id="${m.id}">Ergebnis löschen</button>` : ''}</div>`
      : !ready ? '<p class="hint">Wartet auf die Sieger der Vorrunde.</p>' : ''}
    </li>`;
  };
  return `
    <label class="check"><input type="checkbox" data-action="toggle-done" ${S.showDone ? 'checked' : ''}> Gespielte Partien anzeigen</label>
    ${ms.length ? `<ul class="amatches">${ms.map(row).join('')}</ul>` : '<p class="empty">Alle Spiele sind eingetragen.</p>'}
    <p class="hint">${fb
      ? 'Tore von links nach rechts eintragen, z. B. 3:1. Für jedes Tor erscheint ein Feld für den Torschützen (optional, Vorschläge aus dem Kader). Unentschieden in der K.-o.-Runde: zusätzlich das Elfmeterschießen eintragen.'
      : 'Ergebnis von links nach rechts eintragen, z.B. 11:7. Leere Sätze werden ignoriert. Ein Satz endet bei 11 Punkten mit 2 Punkten Abstand – bei 10:10 geht es auf Entscheidung (Stechen) weiter.'}</p>`;
}

/* ---------- Fußball: Tore, Elfmeter, Torschützen ---------- */
function footballInputs(m, P) {
  const [g1, g2] = m.sets[0] || ['', ''];
  const pen = (m.extra && m.extra.penalties) || ['', ''];
  const sc = (m.extra && m.extra.scorers) || [];
  // Gespeicherte Torschützen auf einzelne Tore verteilen (Max 2× -> zwei Felder "Max").
  const perGoal = side => sc.filter(x => x.side === side).flatMap(x => Array(x.goals).fill(x.name));
  const kader = id => (P[id]?.members || []).map(x => `<option value="${esc(x.name)}">`).join('');
  return `
    <span class="setpair goals"><input type="number" min="0" max="99" inputmode="numeric" name="g1" value="${g1}" aria-label="Tore links" required><span>:</span><input type="number" min="0" max="99" inputmode="numeric" name="g2" value="${g2}" aria-label="Tore rechts" required></span>
    ${m.phase === 'ko' ? `<span class="pens" ${g1 !== '' && g1 === g2 ? '' : 'hidden'}>Elfmeter <span class="setpair"><input type="number" min="0" max="99" inputmode="numeric" name="p1" value="${pen[0] ?? ''}" aria-label="Elfmeter links"><span>:</span><input type="number" min="0" max="99" inputmode="numeric" name="p2" value="${pen[1] ?? ''}" aria-label="Elfmeter rechts"></span></span>` : ''}
    <datalist id="k${m.id}-1">${kader(m.player1_id)}</datalist><datalist id="k${m.id}-2">${kader(m.player2_id)}</datalist>
    <div class="scorer-cols" data-prefill='${esc(JSON.stringify({ 1: perGoal(1), 2: perGoal(2) }))}'>
      <div class="scorer-col" data-side="1"></div><div class="scorer-col" data-side="2"></div>
    </div>`;
}

// Torschützen-Felder passend zur eingegebenen Toranzahl erzeugen (Eingaben bleiben erhalten).
function syncScorerFields(form) {
  const cols = form.querySelector('.scorer-cols');
  if (!cols) return;
  let prefill = {};
  try { prefill = JSON.parse(cols.dataset.prefill || '{}'); } catch {}
  const id = form.dataset.id;
  for (const side of [1, 2]) {
    const col = cols.querySelector(`[data-side="${side}"]`);
    const n = Math.max(0, Math.min(20, Number(form.elements['g' + side].value) || 0));
    const old = [...col.querySelectorAll('input')].map(x => x.value);
    const vals = old.length ? old : prefill[side] || [];
    col.innerHTML = n ? `<span class="scorer-head">Torschützen ${side === 1 ? 'links' : 'rechts'}</span>` + Array.from({ length: n }, (_, i) =>
      `<input name="s${side}" list="k${id}-${side}" maxlength="80" placeholder="${i + 1}. Tor (optional)" value="${esc(vals[i] || '')}">`).join('') : '';
  }
  const pens = form.querySelector('.pens');
  if (pens) pens.hidden = !(form.elements.g1.value !== '' && form.elements.g1.value === form.elements.g2.value);
}

function footballPayload(f) {
  const goals = [Number(f.elements.g1.value), Number(f.elements.g2.value)];
  const body = { goals, scorers: [] };
  for (const side of [1, 2]) {
    [...f.querySelectorAll(`input[name="s${side}"]`)].forEach(x => { if (x.value.trim()) body.scorers.push({ side, name: x.value.trim(), goals: 1 }); });
  }
  if (f.elements.p1 && f.elements.p1.value !== '' && f.elements.p2.value !== '') body.penalties = [Number(f.elements.p1.value), Number(f.elements.p2.value)];
  return body;
}

function memberList(p) {
  return p.members && p.members.length ? p.members.map(m => esc(m.name) + (m.club ? ` <span class="club">${esc(m.club)}</span>` : '')).join(', ') : '';
}

function footballTeams(d) {
  const draft = d.tournament.status === 'draft';
  const manage = can('players.manage');
  const teams = d.players.length ? `<div class="teams">${d.players.map(p => `
      <form class="card team" data-form="team" data-id="${p.id}">
        <div class="team-head">${manage && draft
          ? `<input name="name" value="${esc(p.name)}" required maxlength="80" aria-label="Teamname"><input name="club" value="${esc(p.club || '')}" maxlength="80" placeholder="Verein (optional)" aria-label="Verein">
             <input name="seed" type="number" min="1" max="999" value="${p.seed ?? ''}" class="short" placeholder="Setzpl." aria-label="Setzplatz">`
          : `<strong>${esc(p.name)}</strong>${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}${p.group_no && d.tournament.format === 'group' ? ` <span class="seed">Gruppe ${String.fromCharCode(64 + p.group_no)}</span>` : ''}`}</div>
        ${manage
          ? `<label>Kader (ein Name pro Zeile)<textarea name="members" rows="5" placeholder="Max Mustermann&#10;Tim Beispiel">${esc((p.members || []).map(m => m.name).join('\n'))}</textarea></label>
             <div class="row"><button class="small">Speichern</button>${draft ? `<button type="button" class="link danger" data-action="del-player" data-id="${p.id}">Team entfernen</button>` : ''}</div>`
          : `<p class="kader">${(p.members || []).map(m => esc(m.name)).join(', ') || '<span class="muted">Kein Kader eingetragen.</span>'}</p>`}
      </form>`).join('')}</div>` : '<p class="empty">Noch keine Teams.</p>';
  if (!manage || !draft) return teams + (!draft ? '<p class="hint">Nach dem Start stehen die Teams fest. Den Kader kannst du trotzdem jederzeit ändern (z. B. für Torschützen).</p>' : '');
  return `${teams}
    <div class="two">
      <form class="card" data-form="add-team"><h2>Team hinzufügen</h2>
        <label>Teamname<input name="name" required maxlength="80" placeholder="z. B. FC Vereinsheim"></label>
        <label>Verein (optional)<input name="club" maxlength="80"></label>
        <label>Kader (ein Name pro Zeile, optional)<textarea name="members" rows="5"></textarea></label>
        <button class="primary">Hinzufügen</button></form>
      <form class="card" data-form="bulk-players"><h2>Mehrere Teams auf einmal</h2>
        <label>Ein Teamname pro Zeile<textarea name="lines" rows="7" placeholder="Rote Teufel&#10;Blaue Blitze&#10;Grüne Gämsen"></textarea></label>
        <button class="primary">Alle hinzufügen</button></form>
    </div>
    ${d.players.length >= 4 && !d.players.some(p => p.members && p.members.length) ? `<form class="card" data-form="shuffle-teams"><h2>Zufällige Teams aus Einzelpersonen</h2>
      <p class="hint">Hast du oben Einzelpersonen statt Teams eingetragen? Dann werden sie hier zufällig zu Teams gemischt; die Personen landen automatisch im Kader.</p>
      <label>Teamgröße<input name="team_size" type="number" min="2" max="8" value="5" required></label>
      <button class="primary">Teams mischen</button></form>` : ''}`;
}

function adminPlayers(d) {
  if (isFb(d)) return footballTeams(d);
  const editable = can('players.manage') && d.tournament.status === 'draft';
  const hasTeams = d.players.some(p => p.members && p.members.length);
  const list = d.players.length ? `<div class="scroll"><table class="ptable">
      <thead><tr><th class="left">Name</th><th class="left">Verein</th>${hasTeams ? '<th class="left">Mitglieder</th>' : ''}<th>Setzplatz</th>${d.tournament.format === 'group' ? '<th>Gruppe</th>' : ''}${editable ? '<th></th>' : ''}</tr></thead>
      <tbody>${d.players.map(p => editable ? `
        <tr><td><input form="p${p.id}" name="name" value="${esc(p.name)}" required maxlength="80"></td>
          <td><input form="p${p.id}" name="club" value="${esc(p.club || '')}" maxlength="80"></td>
          ${hasTeams ? `<td class="left">${memberList(p)}</td>` : ''}
          <td><input form="p${p.id}" name="seed" type="number" min="1" max="999" value="${p.seed ?? ''}" class="short"></td>
          <td class="nowrap"><form id="p${p.id}" data-form="player" data-id="${p.id}"><button class="small">Speichern</button></form>
            <button class="link danger" data-action="del-player" data-id="${p.id}">Entfernen</button></td></tr>` : `
        <tr><td class="left">${esc(p.name)}</td><td class="left">${esc(p.club || '')}</td>${hasTeams ? `<td class="left">${memberList(p)}</td>` : ''}<td class="num">${p.seed ?? ''}</td>${d.tournament.format === 'group' ? `<td class="num">${p.group_no ? String.fromCharCode(64 + p.group_no) : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Noch keine Teilnehmer.</p>';
  if (!editable) return list + (d.tournament.status !== 'draft' ? '<p class="hint">Nach dem Start sind die Teilnehmer fest. Zum Ändern die Auslosung zurücksetzen.</p>' : '');
  return `${list}
    <div class="two">
      <form class="card" data-form="add-player"><h2>Teilnehmer hinzufügen</h2>
        <label>Name<input name="name" required maxlength="80"></label>
        <label>Verein<input name="club" maxlength="80"></label>
        <label>Setzplatz (optional)<input name="seed" type="number" min="1" max="999"></label>
        <button class="primary">Hinzufügen</button></form>
      <form class="card" data-form="bulk-players"><h2>Liste einfügen</h2>
        <label>Eine Zeile pro Person, Verein optional nach Semikolon<textarea name="lines" rows="7" placeholder="Anna Becker; TTC Lüdenscheid&#10;Jonas Weber"></textarea></label>
        <button class="primary">Alle hinzufügen</button></form>
    </div>
    <p class="hint">Gesetzte Spieler werden beim Start nach Setzplatz verteilt, alle anderen zufällig ausgelost.</p>
    ${d.players.length >= 4 ? `<form class="card" data-form="shuffle-teams"><h2>Zufällige Teams bilden</h2>
      <label>Teamgröße<input name="team_size" type="number" min="2" max="8" value="2" required></label>
      <button class="primary">Teams mischen</button></form>
      <p class="hint">Mischt alle eingetragenen Teilnehmer zufällig zu Teams und ersetzt die Einzel-Einträge dadurch – Namen und Setzplätze gehen verloren, die Teamgröße muss glatt aufgehen. Nur vor dem Turnierstart möglich.</p>` : ''}`;
}

function adminSettings(d) {
  if (!can('tournaments.manage')) return '<p class="empty">Du darfst die Turniereinstellungen nicht ändern.</p>';
  return `<form class="card" data-form="edit-t">${tournamentFields(d.tournament, d.tournament.status !== 'draft')}
      <button class="primary">Änderungen speichern</button></form>
    <div class="card dangerzone"><h2>Turnier löschen</h2><p>Löscht das Turnier mit allen Teilnehmern und Ergebnissen endgültig.</p>
      <button class="danger" data-action="del-t">Turnier löschen</button></div>`;
}

/* ---------- Rendering & Events ---------- */
async function render() {
  try {
    if (!S.user) {
      const me = await api('/api/auth/me');
      S.user = me.user; S.perms = me.user?.permissions || [];
    }
    if (!S.user) return loginView();
    await ({ list: listView, tournament: tournamentView }[S.view] || listView)();
  } catch (e) {
    if (e.status === 401) { S.user = null; return loginView(); }
    if (e.status === 404 && S.view === 'tournament') { S.view = 'list'; return render(); }
    app.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

app.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.id;
  const actions = {
    login: async () => { // bei Fehler nicht neu zeichnen, damit der Benutzername stehen bleibt
      try { await api('/api/auth/login', { method: 'POST', body: formData(f) }); S.user = null; await render(); }
      catch (err) { toast(err.message, true); f.password.value = ''; f.password.focus(); }
    },
    'create-t': () => run(async () => { const r = await api('/api/tournaments', { method: 'POST', body: tPayload(f) }); S.view = 'tournament'; S.tid = r.id; S.tab = 'players'; }, 'Turnier angelegt.'),
    'edit-t': () => run(() => api(`/api/tournaments/${S.tid}`, { method: 'PATCH', body: tPayload(f) }), 'Einstellungen gespeichert.'),
    'add-player': () => run(() => api(`/api/tournaments/${S.tid}/players`, { method: 'POST', body: formData(f) }), 'Teilnehmer hinzugefügt.'),
    'bulk-players': () => run(async () => { const r = await api(`/api/tournaments/${S.tid}/players`, { method: 'POST', body: formData(f) }); toast(`${r.added} Teilnehmer hinzugefügt.`); }),
    'shuffle-teams': () => {
      if (!confirm('Alle eingetragenen Teilnehmer zufällig zu Teams mischen? Die bisherigen Einzel-Einträge (inkl. Setzplätze) werden ersetzt und können nicht wiederhergestellt werden.')) return;
      const body = { team_size: Number(formData(f).team_size) };
      run(async () => { const r = await api(`/api/tournaments/${S.tid}/players/shuffle-teams`, { method: 'POST', body }); toast(`${r.teams} Teams gebildet.`); });
    },
    player: () => run(() => api(`/api/players/${id}`, { method: 'PATCH', body: formData(f) }), 'Teilnehmer gespeichert.'),
    'add-team': () => run(() => api(`/api/tournaments/${S.tid}/players`, { method: 'POST', body: formData(f) }), 'Team hinzugefügt.'),
    team: () => {
      const d = formData(f);
      const body = S.data.tournament.status === 'draft' ? d : { members: d.members };
      run(() => api(`/api/players/${id}`, { method: 'PATCH', body }), 'Team gespeichert.');
    },
    result: () => {
      if (isFb(S.data)) {
        const body = footballPayload(f);
        return run(async () => { await api(`/api/matches/${id}/result`, { method: 'POST', body }); S.editing.delete(Number(id)); }, 'Ergebnis gespeichert.');
      }
      const d = formData(f), sets = [];
      for (let i = 0; i < S.data.tournament.best_of; i++) {
        const a = d['a' + i], b = d['b' + i];
        if (a === '' && b === '') continue;
        if (a === '' || b === '') return toast(`Satz ${i + 1} ist nur halb ausgefüllt.`, true);
        sets.push([Number(a), Number(b)]);
      }
      run(async () => { await api(`/api/matches/${id}/result`, { method: 'POST', body: { sets } }); S.editing.delete(Number(id)); }, 'Ergebnis gespeichert.');
    },
  };
  actions[f.dataset.form]?.();
});

app.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { S.tab = tab.dataset.tab; return render(); }
  const el = e.target.closest('[data-action]');
  if (!el || el.type === 'checkbox') return;
  const id = el.dataset.id;
  const a = el.dataset.action;
  if (el.tagName === 'A') e.preventDefault();
  const handlers = {
    nav: () => { S.view = el.dataset.view; S.tab = null; render(); },
    open: () => { S.view = 'tournament'; S.tid = Number(id); S.tab = null; S.editing.clear(); render(); },
    logout: () => run(async () => { await api('/api/auth/logout', { method: 'POST' }); S.user = null; S.view = 'list'; }),
    start: () => confirm('Turnier jetzt starten? Danach lassen sich Teilnehmer und Modus nicht mehr ändern.') &&
      run(async () => { await api(`/api/tournaments/${S.tid}/start`, { method: 'POST' }); S.tab = 'matches'; }, 'Turnier gestartet, Spiele ausgelost.'),
    ko: () => run(async () => { await api(`/api/tournaments/${S.tid}/ko`, { method: 'POST' }); S.tab = 'bracket'; }, 'K.-o.-Runde ausgelost.'),
    reset: () => confirm('Alle Spiele und Ergebnisse dieses Turniers löschen? Die Teilnehmer bleiben erhalten.') &&
      run(() => api(`/api/tournaments/${S.tid}/reset`, { method: 'POST' }), 'Auslosung zurückgesetzt.'),
    'del-t': () => confirm('Turnier endgültig löschen?') &&
      run(async () => { await api(`/api/tournaments/${S.tid}`, { method: 'DELETE' }); S.view = 'list'; }, 'Turnier gelöscht.'),
    'del-player': () => run(() => api(`/api/players/${id}`, { method: 'DELETE' }), 'Teilnehmer entfernt.'),
    'edit-result': () => { S.editing.add(Number(id)); render(); },
    'cancel-edit': () => { S.editing.delete(Number(id)); render(); },
    'clear-result': () => confirm('Ergebnis löschen?') && run(() => api(`/api/matches/${id}/result`, { method: 'DELETE' }), 'Ergebnis gelöscht.'),
    'visitor-qr': async () => {
      try {
        const r = await api(`/api/tournaments/${S.tid}/visitor-link`, { method: 'POST' });
        showVisitorQr(`${location.origin}${r.path}`);
      } catch (err) { toast(err.message, true); }
    },
    'copy-visitor-link': async () => {
      const url = el.dataset.url;
      try { await navigator.clipboard.writeText(url); toast('Link kopiert.'); }
      catch { prompt('Besucher-Link (zum Kopieren markieren):', url); }
    },
    'print-qr': () => window.print(),
    'close-qr': () => { document.getElementById('qrbox').innerHTML = ''; },
  };
  handlers[a]?.();
});

app.addEventListener('change', e => {
  if (e.target.matches('[data-action="toggle-done"]')) { S.showDone = e.target.checked; return render(); }
  if (e.target.matches('input[name="sport"]')) {
    const box = e.target.closest('.sport-form');
    box.dataset.sport = e.target.value;
    box.querySelector('.sport-hint').textContent = e.target.value === 'football'
      ? 'Tore statt Sätze, Unentschieden möglich (3/1/0 Punkte), Teams mit Kader, Torschützenliste.'
      : 'Sätze bis 11, Best-of-Modus, Einzel oder Doppel.';
    return;
  }
  const t = e.target.closest('[data-table]');
  const W = words(S.data);
  if (t) run(() => api(`/api/matches/${t.dataset.table}`, { method: 'PATCH', body: { table_no: t.value } }), t.value ? `${W.table} ${t.value} zugewiesen.` : `${W.table} entfernt.`);
});

// Fußball: Torschützen-Felder mitwachsen lassen, wenn die Tore eingegeben werden.
app.addEventListener('input', e => {
  if (e.target.matches('.fbform input[name="g1"], .fbform input[name="g2"]')) syncScorerFields(e.target.closest('form'));
});

/* ---------- Besucher-Link mit QR-Code ---------- */
function showVisitorQr(url) {
  const box = document.getElementById('qrbox');
  if (!box) return;
  let svg = '';
  if (typeof qrcode === 'function') {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: 'QR-Code zum Turnier' });
  }
  const t = S.data.tournament;
  box.innerHTML = `
    <div class="card qr-card print-area">
      <div class="qr-img">${svg}</div>
      <div class="qr-text">
        <h2>${esc(t.name)}</h2>
        <p>Spielplan, Ergebnisse und Tabelle live auf dem Handy:</p>
        <p class="qr-url"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ''))}</a></p>
        <div class="row no-print">
          <button class="primary" type="button" data-action="copy-visitor-link" data-url="${esc(url)}">Link kopieren</button>
          <button type="button" data-action="print-qr">🖨 Drucken</button>
          <button class="link" type="button" data-action="close-qr">Schließen</button>
        </div>
        <p class="hint no-print">Der Link bleibt für dieses Turnier immer gleich – gut für Aushänge.</p>
      </div>
    </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

render();
