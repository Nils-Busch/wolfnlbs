'use strict';
/* Besucheransicht: Turnierliste und Turnierdetails mit Liveticker, Tippspiel,
   Spielerprofil und sanfter automatischer Aktualisierung. */
const app = document.getElementById('app');
let state = { tab: null, data: null, timer: null, picks: {}, profile: null, id: null };

function currentId() {
  const m = location.hash.match(/^#t=(\d+)/);
  return m ? Number(m[1]) : null;
}

async function showList() {
  const list = await api('/api/tournaments');
  if (!list.length) { app.innerHTML = '<p class="empty">Noch keine Turniere angelegt.</p>'; return; }
  app.innerHTML = `<h1 class="page-title">Turniere</h1><ul class="t-list">${list.map((t, i) => `
    <li style="--i:${i}"><a href="#t=${t.id}">
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

const isLive = m => !!m.live && m.status === 'pending';

/* ---------- Tippspiel ---------- */
function tipBox(m, d) {
  if (d.tournament.status !== 'running' || isLive(m)) return '';
  const c = (d.tips && d.tips.counts[m.id]) || [0, 0, 0];
  const total = c[0] + c[1] + c[2];
  const mine = state.picks[m.id];
  const drawOk = m.fb && m.phase === 'group';
  const P = nameMap(d.players);
  const pct = n => (total ? Math.round((n / total) * 100) : 0);
  const btn = (pick, label) => `<button class="tip ${mine === pick ? 'on' : ''}" data-tip="${m.id}" data-pick="${pick}" aria-pressed="${mine === pick}">${label}</button>`;
  return `<div class="tipbox ${mine !== undefined ? 'tipped' : ''}">
    <span class="tip-q">Dein Tipp</span>
    ${btn(1, esc(P[m.player1_id]?.name || ''))}${drawOk ? btn(0, 'Remis') : ''}${btn(2, esc(P[m.player2_id]?.name || ''))}
    ${mine !== undefined && total ? `<span class="tipbar" aria-label="${pct(c[0])} Prozent für links, ${pct(c[2])} Prozent für rechts"><i style="--w:${pct(c[0])}%"></i>${drawOk ? `<i class="d" style="--w:${pct(c[1])}%"></i>` : ''}<i class="r" style="--w:${pct(c[2])}%"></i></span><span class="tip-n">${total} ${total === 1 ? 'Tipp' : 'Tipps'}</span>` : ''}
  </div>`;
}

function renderTips(d) {
  const tips = d.tips || { board: [], people: 0 };
  const me = Tip.name();
  return `<section class="block tipintro">
      <h2>Tippspiel</h2>
      <p>Tippe bei offenen Spielen, wer gewinnt. Sobald ein Spiel live läuft, ist der Tipp gesperrt. Für jeden richtigen Tipp gibt es einen Punkt.</p>
      <form class="tipname" data-form="tipname"><label>Dein Name in der Tabelle <input name="n" maxlength="24" value="${esc(me)}" placeholder="z. B. Onkel Heinz" autocomplete="nickname"></label><button class="small">Speichern</button></form>
    </section>
    <section class="block"><h2>Tipp-Tabelle</h2>
      ${tips.board.length ? `<ol class="tipboard">${tips.board.map((p, i) => `<li data-key="tp${esc(p.name)}" class="${p.name === me ? 'me' : ''}"><span class="rk">${i + 1}</span><b>${esc(p.name)}</b><span class="q">${p.correct} von ${p.settled} richtig</span><span class="pts" data-val="${p.correct}" data-vkey="tp${esc(p.name)}">${p.correct}</span></li>`).join('')}</ol>`
        : `<p class="empty">${tips.people ? `${tips.people} ${tips.people === 1 ? 'Person hat' : 'Personen haben'} getippt – die Tabelle erscheint mit dem ersten Ergebnis.` : 'Noch keine Tipps. Unter „Spiele“ geht’s los.'}</p>`}
    </section>`;
}

async function sendTip(mid, pick) {
  let name = Tip.name();
  if (!name) {
    name = (prompt('Unter welchem Namen sollen deine Tipps in der Tipp-Tabelle stehen?') || '').trim().slice(0, 24);
    if (!name) return;
    Tip.setName(name);
  }
  const prev = state.picks[mid];
  state.picks[mid] = pick;
  renderDetail();
  try {
    await api(`/api/matches/${mid}/tip`, { method: 'POST', body: { device: Tip.device(), name, pick } });
    await reload();
  } catch (e) {
    if (prev === undefined) delete state.picks[mid]; else state.picks[mid] = prev;
    renderDetail();
    alert(e.message);
  }
}

/* ---------- Spiele ---------- */
function renderMatches(d) {
  const P = nameMap(d.players);
  const playable = d.matches.filter(m => m.status !== 'bye');
  const live = playable.filter(isLive).sort((a, b) => (a.table_no || 99) - (b.table_no || 99));
  const open = playable.filter(m => m.status === 'pending' && m.player1_id && m.player2_id && !isLive(m))
    .sort((a, b) => (b.table_no ? 1 : 0) - (a.table_no ? 1 : 0) || a.round - b.round);
  const done = playable.filter(m => m.status === 'done').sort((a, b) => b.updated_at - a.updated_at);
  const pl = (pid, cls) => `<span class="m-p ${cls}" data-pid="${pid || ''}">${playerLabel(P[pid])}</span>`;
  const row = m => `<li class="match ${m.status}" data-key="m${m.id}">
      <span class="m-info">${m.table_no ? `<span class="tableno">${words(d).table} ${m.table_no}</span>` : ''}${esc(matchTitle(m, d))}</span>
      ${pl(m.player1_id, `p1 ${m.winner_id && m.winner_id === m.player1_id ? 'win' : ''}`)}
      <span class="m-score">${setScore(m) || 'gegen'}</span>
      ${pl(m.player2_id, `right ${m.winner_id && m.winner_id === m.player2_id ? 'win' : ''}`)}
      <span class="m-sets">${[esc(setDetail(m)), scorerLine(m)].filter(Boolean).join(' · ')}</span>
      ${m.status === 'pending' ? tipBox(m, d) : ''}</li>`;
  const liveRow = m => {
    const p = liveParts(m);
    return `<li class="match livematch" data-key="m${m.id}">
      <span class="m-info"><span class="livetag">Live</span>${m.table_no ? `<span class="tableno">${words(d).table} ${m.table_no}</span>` : ''}${esc(matchTitle(m, d))}</span>
      ${pl(m.player1_id, 'p1')}
      <span class="m-score live-score"><b data-val="${p.main[0]}" data-vkey="l${m.id}a">${p.main[0]}</b>:<b data-val="${p.main[1]}" data-vkey="l${m.id}b">${p.main[1]}</b></span>
      ${pl(m.player2_id, 'right')}
      <span class="m-sets">${p.cur ? `${p.setNo}. Satz <b class="cur" data-val="${p.cur.join(':')}" data-vkey="l${m.id}c">${p.cur[0]}:${p.cur[1]}</b>` : ''}</span></li>`;
  };
  return `
    ${live.length ? `<section class="block"><h2 class="h-live">Läuft gerade</h2><ul class="matches">${live.map(liveRow).join('')}</ul></section>` : ''}
    <section class="block"><h2>Als Nächstes</h2>${open.length ? `<ul class="matches">${open.map(row).join('')}</ul>` : '<p class="empty">Gerade keine spielbereiten Begegnungen.</p>'}</section>
    <section class="block"><h2>Ergebnisse</h2>${done.length ? `<ul class="matches">${done.map(row).join('')}</ul>` : '<p class="empty">Noch keine Ergebnisse.</p>'}</section>`;
}

function renderPlayers(d) {
  if (!d.players.length) return `<p class="empty">Noch keine ${words(d).entrants} gemeldet.</p>`;
  if (isFb(d)) {
    return `<div class="teams">${d.players.map(p => `<div class="card team" data-pid="${p.id}"><div class="team-head"><strong>${esc(p.name)}</strong>${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}${p.group_no && d.tournament.format === 'group' ? ` <span class="seed">Gruppe ${String.fromCharCode(64 + p.group_no)}</span>` : ''}</div>
      <p class="kader">${(p.members || []).map(m => esc(m.name)).join(', ') || 'Kein Kader eingetragen.'}</p></div>`).join('')}</div>`;
  }
  return `<ol class="players">${d.players.map(p => `<li data-pid="${p.id}">${playerLabel(p)}${p.seed ? ` <span class="seed">Setzplatz ${p.seed}</span>` : ''}${p.group_no && d.tournament.format === 'group' ? ` <span class="seed">Gruppe ${String.fromCharCode(64 + p.group_no)}</span>` : ''}</li>`).join('')}</ol>`;
}

function championId(d) {
  if (d.tournament.status !== 'finished') return null;
  if (d.tournament.format === 'league') return d.standings[0]?.rows[0]?.player_id;
  if (d.tournament.double_elim) {
    const gf1 = d.matches.find(m => m.bracket === 'gf' && m.round === 1);
    const gf2 = d.matches.find(m => m.bracket === 'gf' && m.round === 2);
    return (gf2 && gf2.status === 'done' ? gf2 : gf1)?.winner_id;
  }
  return d.matches.find(m => m.phase === 'ko' && !m.next_match_id)?.winner_id;
}
function winnerBanner(d) {
  const w = championId(d);
  return w ? `<p class="champion">Turniersieg: <strong>${esc(nameMap(d.players)[w]?.name)}</strong></p>` : '';
}

/* ---------- Spielerprofil ---------- */
function profileHtml(d, pid) {
  const P = nameMap(d.players);
  const p = P[pid];
  if (!p) return '';
  const ms = d.matches.filter(m => m.status !== 'bye' && (m.player1_id === pid || m.player2_id === pid));
  const done = ms.filter(m => m.status === 'done').sort((a, b) => a.updated_at - b.updated_at);
  const w = done.filter(m => m.winner_id === pid).length;
  const draws = done.filter(m => m.winner_id == null).length;
  const l = done.length - w - draws;
  let f = 0, a = 0;
  for (const m of done) {
    const me = m.player1_id === pid ? 0 : 1;
    if (m.fb) { const g = m.sets[0] || [0, 0]; f += g[me]; a += g[1 - me]; }
    else m.sets.forEach(s => { if (s[me] > s[1 - me]) f++; else a++; });
  }
  const form = done.slice(-5).map(m => m.winner_id == null ? '<i class="d" title="Unentschieden">U</i>' : m.winner_id === pid ? '<i class="w" title="Sieg">S</i>' : '<i class="l" title="Niederlage">N</i>').join('');
  const next = ms.find(m => m.status === 'pending' && m.player1_id && m.player2_id);
  const row = m => {
    const opp = P[m.player1_id === pid ? m.player2_id : m.player1_id];
    const res = m.status === 'done' ? (m.winner_id == null ? 'U' : m.winner_id === pid ? 'S' : 'N') : isLive(m) ? 'live' : '';
    let score = setScore(m);
    if (score && m.player2_id === pid) score = score.split(':').reverse().join(':');
    return `<li class="${res === 'S' ? 'w' : res === 'N' ? 'l' : ''}"><span class="r">${esc(matchTitle(m, d))}</span><span>gegen <b>${esc(opp?.name || 'offen')}</b></span><span class="s">${res === 'live' ? '<span class="livetag">Live</span>' : esc(score || '–')}</span></li>`;
  };
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="Profil ${esc(p.name)}">
    <div class="sheet-card">
      <button class="sheet-x" data-close aria-label="Schließen">✕</button>
      <p class="sheet-kick">${esc(words(d).entrant)}${p.club ? ` · ${esc(p.club)}` : ''}</p>
      <h2>${esc(p.name)}</h2>
      ${p.members && p.members.length ? `<p class="muted">${p.members.map(x => esc(x.name)).join(', ')}</p>` : ''}
      <div class="stats"><div><b>${w}</b><span>Siege</span></div>${m_fb(d) ? `<div><b>${draws}</b><span>Remis</span></div>` : ''}<div><b>${l}</b><span>Niederlagen</span></div><div><b>${f}:${a}</b><span>${m_fb(d) ? 'Tore' : 'Sätze'}</span></div></div>
      ${form ? `<p class="form"><span>Form</span>${form}</p>` : ''}
      ${next ? `<p class="nextup">Als Nächstes: <b>${esc(P[next.player1_id === pid ? next.player2_id : next.player1_id]?.name || '')}</b>${next.table_no ? ` an ${words(d).table} ${next.table_no}` : ''}</p>` : ''}
      ${ms.length ? `<ul class="plist">${ms.map(row).join('')}</ul>` : '<p class="empty">Noch keine Spiele.</p>'}
    </div></div>`;
}
const m_fb = d => isFb(d);
function openProfile(pid) {
  state.profile = pid;
  const box = document.getElementById('sheet') || Object.assign(document.createElement('div'), { id: 'sheet' });
  document.body.appendChild(box);
  box.innerHTML = profileHtml(state.data, pid);
  box.querySelector('.sheet-x')?.focus();
}
function closeProfile() {
  state.profile = null;
  const box = document.getElementById('sheet');
  if (!box || !box.firstElementChild) return;
  const el = box.firstElementChild;
  el.classList.add('out');
  setTimeout(() => { if (!state.profile) box.innerHTML = ''; }, 220);
}

/* ---------- Aufbau ---------- */
function bodyHtml(d) {
  return { matches: renderMatches, table: renderStandings, bracket: x => renderBracket(x), scorers: x => renderScorers(x), players: renderPlayers, tips: renderTips }[state.tab](d);
}

function renderDetail(opts = {}) {
  const d = state.data, t = d.tournament;
  const tabs = [['matches', 'Spiele']];
  if (t.format !== 'ko') tabs.push(['table', t.format === 'group' ? 'Gruppen' : 'Tabelle']);
  if (t.format !== 'league') tabs.push(['bracket', 'Turnierbaum']);
  if (isFb(d)) tabs.push(['scorers', 'Torschützen']);
  if (t.status !== 'draft') tabs.push(['tips', 'Tippspiel']);
  tabs.push(['players', words(d).entrants]);
  if (!tabs.some(x => x[0] === state.tab)) state.tab = defaultTab(d);
  const liveCount = d.matches.filter(isLive).length;
  const shell = app.querySelector('.t-detail');
  // Bei einer Aktualisierung nur den Inhalt sanft austauschen, damit nichts springt.
  if (shell && !opts.full && shell.dataset.id === String(t.id) && shell.dataset.cur === state.tab) {
    shell.querySelector('.t-head-status').innerHTML = statusHtml(t, liveCount);
    shell.querySelector('.champ-slot').innerHTML = winnerBanner(d);
    morph(shell.querySelector('.tab-body'), bodyHtml(d));
    drawConnectors(shell);
    if (state.profile) { const box = document.getElementById('sheet'); if (box) box.innerHTML = profileHtml(d, state.profile); }
    return;
  }
  app.innerHTML = `<div class="t-detail" data-id="${t.id}" data-cur="${state.tab}">
    <a class="back" href="#">Alle Turniere</a>
    <h1 class="page-title">${esc(t.name)}</h1>
    <p class="t-meta">${[fmtDate(t.event_date), t.location, ...modeParts(t)].filter(Boolean).map(esc).join(', ')}
      <span class="t-head-status">${statusHtml(t, liveCount)}</span>
      <a class="link" href="/tischtennis/live#t=${t.id}">📺 Liveansicht für den Bildschirm</a></p>
    <div class="champ-slot">${winnerBanner(d)}</div>
    ${renderTabs(tabs, state.tab)}
    <div class="tab-body ${opts.anim ? 'tab-in' : ''}">${bodyHtml(d)}</div>
    <p class="hint">Aktualisiert sich automatisch${liveCount ? ' – während Spiele live laufen alle paar Sekunden' : ' alle 15 Sekunden'}.</p></div>`;
  drawConnectors(app);
}
function statusHtml(t, liveCount) {
  return `<span class="badge ${t.status}">${STATUS_LABEL[t.status]}</span>${liveCount ? ` <span class="livetag">${liveCount} live</span>` : ''}`;
}

async function reload() {
  const id = state.id;
  const [data, mine] = await Promise.all([
    api(`/api/tournaments/${id}`),
    api(`/api/tournaments/${id}/tips?device=${Tip.device()}`).catch(() => ({ picks: {} })),
  ]);
  if (state.id !== id) return;
  state.data = data;
  state.picks = mine.picks || {};
  renderDetail();
}

function schedule() {
  clearTimeout(state.timer);
  const live = state.data && state.data.matches.some(isLive);
  state.timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') { try { await reload(); } catch { /* nächster Versuch */ } }
    schedule();
  }, live ? 5000 : 15000);
}

async function route() {
  clearTimeout(state.timer);
  closeProfile();
  const id = currentId();
  state.id = id;
  try {
    if (!id) { state.data = null; await showList(); return; }
    state.data = await api(`/api/tournaments/${id}`);
    state.picks = (await api(`/api/tournaments/${id}/tips?device=${Tip.device()}`).catch(() => ({}))).picks || {};
    state.tab = defaultTab(state.data);
    renderDetail({ full: true, anim: true });
    schedule();
  } catch (e) {
    app.innerHTML = `<p class="error">${esc(e.message)}</p><a class="back" href="#">Alle Turniere</a>`;
  }
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) {
    state.tab = b.dataset.tab;
    const go = () => renderDetail({ full: true, anim: true });
    if (document.startViewTransition && !prefersReduced()) document.startViewTransition(go); else go();
    return;
  }
  const tip = e.target.closest('[data-tip]');
  if (tip) return sendTip(Number(tip.dataset.tip), Number(tip.dataset.pick));
  const who = e.target.closest('[data-pid]');
  if (who && who.dataset.pid && state.data) openProfile(Number(who.dataset.pid));
});
// Turnierbaum: Weg einer Person durch den Baum hervorheben
app.addEventListener('mouseover', e => {
  const s = e.target.closest('.bracket [data-pid]');
  const pid = s ? s.dataset.pid : null;
  if (pid === app.dataset.hl) return;
  app.dataset.hl = pid || '';
  app.querySelectorAll('.bracket .path').forEach(x => x.classList.remove('path'));
  if (pid) app.querySelectorAll(`.bracket [data-pid="${pid}"]`).forEach(x => { x.classList.add('path'); x.closest('.bmatch')?.classList.add('path'); });
  if (pid) app.querySelectorAll(`.bracket svg path[data-w="${pid}"]`).forEach(x => x.classList.add('path'));
});
app.addEventListener('submit', e => {
  const f = e.target.closest('[data-form="tipname"]');
  if (!f) return;
  e.preventDefault();
  const n = f.n.value.trim().slice(0, 24);
  if (n) { Tip.setName(n); f.querySelector('button').textContent = 'Gespeichert ✓'; }
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target.classList.contains('sheet')) closeProfile();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfile(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.id) reload().catch(() => {}); });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => drawConnectors(app), 150); });
window.addEventListener('hashchange', route);
route();
