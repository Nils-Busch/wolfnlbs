'use strict';
/* Besucheransicht: Turnierliste und Turnierdetails mit automatischer Aktualisierung */
const app = document.getElementById('app');
let state = { tab: null, data: null, timer: null };

function currentId() {
  const m = location.hash.match(/^#t=(\d+)/);
  return m ? Number(m[1]) : null;
}

async function showList() {
  const list = await api('/api/tournaments');
  if (!list.length) { app.innerHTML = '<p class="empty">Noch keine Turniere angelegt.</p>'; return; }
  app.innerHTML = `<h1 class="page-title">Turniere</h1><ul class="t-list">${list.map(t => `
    <li><a href="#t=${t.id}">
      <span class="t-name">${esc(t.name)}</span>
      <span class="t-meta">${[SPORT_LABEL[t.sport] || SPORT_LABEL.tabletennis, fmtDate(t.event_date), t.location, FORMAT_LABEL[t.format], `${t.player_count} ${t.sport === 'football' ? 'Teams' : 'Teilnehmer'}`].filter(Boolean).map(esc).join(', ')}</span>
      <span class="badge ${t.status}">${STATUS_LABEL[t.status]}</span>
    </a></li>`).join('')}</ul>`;
}

function defaultTab(d) {
  if (d.tournament.status === 'draft') return 'players';
  if (d.matches.some(m => m.phase === 'ko')) return d.tournament.status === 'finished' ? 'bracket' : 'matches';
  return 'matches';
}

function renderMatches(d) {
  const P = nameMap(d.players);
  const playable = d.matches.filter(m => m.status !== 'bye');
  const open = playable.filter(m => m.status === 'pending' && m.player1_id && m.player2_id)
    .sort((a, b) => (b.table_no ? 1 : 0) - (a.table_no ? 1 : 0) || a.round - b.round);
  const done = playable.filter(m => m.status === 'done').sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const row = m => `<li class="match ${m.status}">
      <span class="m-info">${m.table_no ? `<span class="tableno">${words(d).table} ${m.table_no}</span>` : ''}${esc(matchTitle(m, d))}</span>
      <span class="m-p p1 ${m.winner_id && m.winner_id === m.player1_id ? 'win' : ''}">${playerLabel(P[m.player1_id])}</span>
      <span class="m-score">${setScore(m) || 'gegen'}</span>
      <span class="m-p right ${m.winner_id && m.winner_id === m.player2_id ? 'win' : ''}">${playerLabel(P[m.player2_id])}</span>
      <span class="m-sets">${[esc(setDetail(m)), scorerLine(m)].filter(Boolean).join(' · ')}</span></li>`;
  return `
    <section class="block"><h2>Als Nächstes</h2>${open.length ? `<ul class="matches">${open.map(row).join('')}</ul>` : '<p class="empty">Gerade keine spielbereiten Begegnungen.</p>'}</section>
    <section class="block"><h2>Ergebnisse</h2>${done.length ? `<ul class="matches">${done.map(row).join('')}</ul>` : '<p class="empty">Noch keine Ergebnisse.</p>'}</section>`;
}

function renderPlayers(d) {
  if (!d.players.length) return `<p class="empty">Noch keine ${words(d).entrants} gemeldet.</p>`;
  if (isFb(d)) {
    return `<div class="teams">${d.players.map(p => `<div class="card team"><div class="team-head"><strong>${esc(p.name)}</strong>${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}${p.group_no && d.tournament.format === 'group' ? ` <span class="seed">Gruppe ${String.fromCharCode(64 + p.group_no)}</span>` : ''}</div>
      <p class="kader">${(p.members || []).map(m => esc(m.name)).join(', ') || 'Kein Kader eingetragen.'}</p></div>`).join('')}</div>`;
  }
  return `<ol class="players">${d.players.map(p => `<li>${playerLabel(p)}${p.seed ? ` <span class="seed">Setzplatz ${p.seed}</span>` : ''}${p.group_no && d.tournament.format === 'group' ? ` <span class="seed">Gruppe ${String.fromCharCode(64 + p.group_no)}</span>` : ''}</li>`).join('')}</ol>`;
}

function winnerBanner(d) {
  if (d.tournament.status !== 'finished') return '';
  const P = nameMap(d.players);
  let w;
  if (d.tournament.format === 'league') {
    w = d.standings[0]?.rows[0]?.player_id;
  } else if (d.tournament.double_elim) {
    const gf1 = d.matches.find(m => m.bracket === 'gf' && m.round === 1);
    const gf2 = d.matches.find(m => m.bracket === 'gf' && m.round === 2);
    w = (gf2 && gf2.status === 'done' ? gf2 : gf1)?.winner_id;
  } else {
    w = d.matches.find(m => m.phase === 'ko' && !m.next_match_id)?.winner_id;
  }
  return w ? `<p class="champion">Turniersieg: <strong>${esc(P[w]?.name)}</strong></p>` : '';
}

function renderDetail() {
  const d = state.data, t = d.tournament;
  const tabs = [['matches', 'Spiele']];
  if (t.format !== 'ko') tabs.push(['table', t.format === 'group' ? 'Gruppen' : 'Tabelle']);
  if (t.format !== 'league') tabs.push(['bracket', 'Turnierbaum']);
  if (isFb(d)) tabs.push(['scorers', 'Torschützen']);
  tabs.push(['players', words(d).entrants]);
  if (!tabs.some(x => x[0] === state.tab)) state.tab = defaultTab(d);
  const body = { matches: renderMatches, table: renderStandings, bracket: x => renderBracket(x), scorers: x => renderScorers(x), players: renderPlayers }[state.tab](d);
  app.innerHTML = `
    <a class="back" href="#">Alle Turniere</a>
    <h1 class="page-title">${esc(t.name)}</h1>
    <p class="t-meta">${[fmtDate(t.event_date), t.location, ...modeParts(t)].filter(Boolean).map(esc).join(', ')}
      <span class="badge ${t.status}">${STATUS_LABEL[t.status]}</span>
      <a class="link" href="/tischtennis/live#t=${t.id}">📺 Liveansicht für den Bildschirm</a></p>
    ${winnerBanner(d)}
    ${renderTabs(tabs, state.tab)}
    <div class="tab-body">${body}</div>
    <p class="hint">Aktualisiert sich automatisch alle 15 Sekunden.</p>`;
}

async function route() {
  clearInterval(state.timer);
  const id = currentId();
  try {
    if (!id) { state.data = null; await showList(); return; }
    state.data = await api(`/api/tournaments/${id}`);
    state.tab = defaultTab(state.data);
    renderDetail();
    state.timer = setInterval(async () => {
      try { state.data = await api(`/api/tournaments/${id}`); renderDetail(); } catch { /* nächster Versuch */ }
    }, 15000);
  } catch (e) {
    app.innerHTML = `<p class="error">${esc(e.message)}</p><a class="back" href="#">Alle Turniere</a>`;
  }
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) { state.tab = b.dataset.tab; renderDetail(); }
});
window.addEventListener('hashchange', route);
route();
