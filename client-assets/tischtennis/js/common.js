'use strict';
/* Gemeinsame Helfer für Besucher- und Admin-Ansicht */

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  // Alle API-Pfade sind unter /api/tischtennis/* gebunden, weil sich der
  // Worker die Domain mit Spielegalerie und Werwolf teilt.
  const url = path.replace(/^\/api\//, '/api/tischtennis/');
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined || (opts.method && opts.method !== 'GET') ? { 'Content-Type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : (opts.method && opts.method !== 'GET' ? '{}' : undefined),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  // Turnierdaten: Sportart an Spiele und Teilnehmer hängen, damit die Anzeige-Helfer
  // unten (Ergebnis, Namen) wissen, ob es Tore oder Sätze sind.
  if (data && data.tournament && Array.isArray(data.matches)) {
    const fb = data.tournament.sport === 'football';
    data.matches.forEach(m => { m.fb = fb; });
    (data.players || []).forEach(p => { p.fb = fb; });
  }
  return data;
}

const SPORT_LABEL = { tabletennis: '🏓 Tischtennis', football: '⚽ Fußball' };
const isFb = d => !!d && d.tournament && d.tournament.sport === 'football';
/** Wörter, die sich je nach Sportart unterscheiden. */
function words(d) {
  return isFb(d)
    ? { table: 'Platz', tables: 'Auf den Plätzen', entrants: 'Teams', entrant: 'Team', icon: '⚽' }
    : { table: 'Tisch', tables: 'An den Tischen', entrants: 'Teilnehmer', entrant: 'Spieler', icon: '🏓' };
}
/** Kurzbeschreibung des Modus für Kopfzeilen, z. B. "⚽ Fußball, Gruppen + K.-o." */
function modeParts(t) {
  return [SPORT_LABEL[t.sport] || SPORT_LABEL.tabletennis, FORMAT_LABEL[t.format], t.sport === 'football' ? '' : bestOfLabel(t.best_of), t.double_elim ? 'mit Loserbracket' : ''].filter(Boolean);
}

const FORMAT_LABEL = { ko: 'K.-o.-System', league: 'Jeder gegen jeden', group: 'Gruppen + K.-o.' };
const STATUS_LABEL = { draft: 'In Vorbereitung', running: 'Läuft', finished: 'Beendet' };

/** Kurzlabel für den Spielmodus: Einzelspiel (best_of 1) oder Best of N. */
function bestOfLabel(bestOf) { return bestOf === 1 ? 'Einzelspiel' : `Best of ${bestOf}`; }

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}

function nameMap(players) { return Object.fromEntries(players.map(p => [p.id, p])); }

function setScore(m) {
  if (m.status !== 'done') return '';
  if (m.fb) {
    const [g1, g2] = m.sets[0] || [0, 0];
    return `${g1}:${g2}`;
  }
  let a = 0, b = 0;
  m.sets.forEach(([x, y]) => (x > y ? a++ : b++));
  return `${a}:${b}`;
}

function playerLabel(p, fallback = 'offen') {
  if (!p) return `<span class="muted">${fallback}</span>`;
  if (p.members && p.members.length && !p.fb) {
    const names = p.members.map(m => esc(m.name) + (m.club ? ` <span class="club">${esc(m.club)}</span>` : '')).join(' &amp; ');
    return `${esc(p.name)}<br><span class="club">${names}</span>`;
  }
  return `${esc(p.name)}${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}`;
}

function renderFootballStandings(data) {
  const P = nameMap(data.players);
  return data.standings.map(g => `
    <section class="block">
      ${data.tournament.format === 'group' ? `<h3>Gruppe ${String.fromCharCode(64 + g.group_no)}</h3>` : ''}
      <div class="scroll"><table class="standings">
        <thead><tr><th>Platz</th><th class="left">Team</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Unentschieden">U</th><th title="Niederlagen">N</th><th>Tore</th><th title="Tordifferenz">Diff</th><th>Punkte</th></tr></thead>
        <tbody>${g.rows.map((r, i) => `
          <tr class="${data.tournament.format === 'group' && i < data.tournament.advance_per_group ? 'qualified' : ''}" data-key="s${r.player_id}" data-pid="${r.player_id}">
            <td class="num">${i + 1}</td><td class="left">${playerLabel(P[r.player_id])}</td>
            <td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td>
            <td class="num">${r.goalsFor}:${r.goalsAgainst}</td><td class="num">${r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}${r.goalsFor - r.goalsAgainst}</td>
            <td class="num strong">${r.points}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`).join('') +
    `<p class="hint">Sieg 3 Punkte, Unentschieden 1 Punkt, Niederlage 0. Bei Gleichstand zählen Tordifferenz, dann mehr erzielte Tore, dann der direkte Vergleich.${data.tournament.format === 'group' ? ' Markierte Plätze erreichen die K.-o.-Runde.' : ''}</p>`;
}

/** Torschützenliste (nur Fußball). */
function renderScorers(data, limit = 0) {
  const list = data.scorers || [];
  if (!list.length) return '<p class="empty">Noch keine Torschützen eingetragen.</p>';
  const P = nameMap(data.players);
  const rows = limit ? list.slice(0, limit) : list;
  let rank = 0, last = null;
  return `<div class="scroll"><table class="standings scorers">
    <thead><tr><th>Platz</th><th class="left">Spieler</th><th class="left">Team</th><th>Tore</th></tr></thead>
    <tbody>${rows.map((s, i) => { if (s.goals !== last) { rank = i + 1; last = s.goals; } return `
      <tr><td class="num">${rank}</td><td class="left">${esc(s.name)}</td><td class="left">${esc(P[s.team_id]?.name || '')}</td><td class="num strong">${s.goals}</td></tr>`; }).join('')}</tbody>
  </table></div>`;
}

/** Torschützen eines Spiels als kurze Zeile, z. B. "⚽ Max 2, Tim – Jonas". */
function scorerLine(m) {
  if (!m.fb || m.status !== 'done') return '';
  const sc = (m.extra && m.extra.scorers) || [];
  if (!sc.length) return '';
  const side = n => sc.filter(x => x.side === n).map(x => esc(x.name) + (x.goals > 1 ? ` ${x.goals}×` : '')).join(', ');
  return `⚽ ${side(1) || '–'} | ${side(2) || '–'}`;
}

function renderStandings(data) {
  const P = nameMap(data.players);
  if (!data.standings.length) return '<p class="empty">Noch keine Tabelle – das Turnier hat keine Gruppenphase oder ist nicht gestartet.</p>';
  if (isFb(data)) return renderFootballStandings(data);
  return data.standings.map(g => `
    <section class="block">
      ${data.tournament.format === 'group' ? `<h3>Gruppe ${String.fromCharCode(64 + g.group_no)}</h3>` : ''}
      <div class="scroll"><table class="standings">
        <thead><tr><th>Platz</th><th class="left">Spieler</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Niederlagen">N</th><th>Sätze</th><th>Bälle</th><th>Punkte</th></tr></thead>
        <tbody>${g.rows.map((r, i) => `
          <tr class="${data.tournament.format === 'group' && i < data.tournament.advance_per_group ? 'qualified' : ''}" data-key="s${r.player_id}" data-pid="${r.player_id}">
            <td class="num">${i + 1}</td><td class="left">${playerLabel(P[r.player_id])}</td>
            <td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.lost}</td>
            <td class="num">${r.setsFor}:${r.setsAgainst}</td><td class="num">${r.ballsFor}:${r.ballsAgainst}</td>
            <td class="num strong">${r.points}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>`).join('') +
    `<p class="hint">Sieg 2 Punkte, Niederlage 1 Punkt. Bei Gleichstand zählen Satz-, dann Balldifferenz, dann der direkte Vergleich.${data.tournament.format === 'group' ? ' Markierte Plätze erreichen die K.-o.-Runde.' : ''}</p>`;
}

/** Ein Satz Runden-Spalten (ein Baum). renderMatch(m) liefert optional zusätzliches HTML (z.B. Eingabe im Admin). */
function renderBracketSection(ms, names, P, extra, sideTag) {
  const rounds = [...new Set(ms.map(m => m.round))].sort((a, b) => a - b);
  return `<div class="bracket scroll">${rounds.map(r => `
    <div class="round">
      <h3>${esc((names || {})[r] || `Runde ${r}`)}</h3>
      <div class="round-matches">${ms.filter(m => m.round === r).sort((a, b) => a.position - b.position).map(m => {
        const side = (pid, idx) => `
          <div class="side ${m.winner_id && m.winner_id === pid ? 'win' : ''} ${m.winner_id && pid && m.winner_id !== pid ? 'lose' : ''}" ${pid ? `data-pid="${pid}"` : ''}>
            <span class="pname">${m.status === 'bye' && !pid ? '<span class="muted">Freilos</span>' : playerLabel(P[pid])}${sideTag ? sideTag(idx) : ''}</span>
            <span class="sets">${m.live && m.status === 'pending' ? liveSide(m, idx) : m.status !== 'done' ? '' : m.fb ? (m.sets[0] || [])[idx - 1] ?? '' : m.sets.filter(([a, b]) => (idx === 1 ? a > b : b > a)).length}</span>
          </div>`;
        return `<div class="bmatch ${m.status} ${m.live && m.status === 'pending' ? 'is-live' : ''}" data-key="b${m.id}" data-mid="${m.id}" ${m.next_match_id ? `data-next="${m.next_match_id}"` : ''} ${m.winner_id && m.status === 'done' ? `data-w="${m.winner_id}"` : ''}>${side(m.player1_id, 1)}${side(m.player2_id, 2)}${extra(m)}</div>`;
      }).join('')}</div>
    </div>`).join('')}</div>`;
}

/** KO-Baum: einfacher K.-o. als ein Baum, Doppel-K.-o. als Gewinnerbaum + Verliererbaum + Finale. */
function renderBracket(data, extra = () => '') {
  const ko = data.matches.filter(m => m.phase === 'ko');
  if (!ko.length) return '<p class="empty">Der Turnierbaum erscheint, sobald die K.-o.-Runde ausgelost ist.</p>';
  const P = nameMap(data.players);
  if (!data.tournament.double_elim) return renderBracketSection(ko, data.koRoundNames.wb, P, extra);
  const wb = ko.filter(m => (m.bracket || 'wb') === 'wb');
  const lb = ko.filter(m => m.bracket === 'lb');
  const gf = ko.filter(m => m.bracket === 'gf');
  const gfTag = idx => `<span class="origin">${idx === 1 ? 'Gewinnerbaum' : 'Verliererbaum'}</span>`;
  return `
    <section class="block"><h3 class="bracket-heading">Gewinnerbaum</h3>${renderBracketSection(wb, data.koRoundNames.wb, P, extra)}</section>
    ${lb.length ? `<section class="block"><h3 class="bracket-heading">Verliererbaum</h3>${renderBracketSection(lb, data.koRoundNames.lb, P, extra)}</section>` : ''}
    ${gf.length ? `<section class="block"><h3 class="bracket-heading">Finale</h3>${renderBracketSection(gf, data.koRoundNames.gf, P, extra, gfTag)}</section>` : ''}`;
}

function matchTitle(m, data) {
  if (m.phase === 'ko') {
    const bucket = m.bracket || 'wb';
    const label = (data.koRoundNames[bucket] || {})[m.round] || `Runde ${m.round}`;
    return bucket === 'wb' && data.tournament.double_elim ? `Gewinnerbaum: ${label}` : label;
  }
  const g = data.tournament.format === 'group' ? `Gruppe ${String.fromCharCode(64 + m.group_no)}, ` : '';
  return `${g}Runde ${m.round}`;
}

function setDetail(m) {
  if (m.status !== 'done') return '';
  if (m.fb) {
    const p = m.extra && m.extra.penalties;
    return p ? `n. E. ${p[0]}:${p[1]}` : '';
  }
  return m.sets.map(([a, b]) => `${a}:${b}`).join(', ');
}

function renderTabs(tabs, active) {
  return `<nav class="tabs" role="tablist">${tabs.map(([key, label]) =>
    `<button role="tab" data-tab="${key}" aria-selected="${key === active}">${esc(label)}</button>`).join('')}</nav>`;
}


/* ---------- Liveticker ---------- */
/** Zwischenstand eines laufenden Spiels. Tischtennis: Sätze + aktueller Satz, Fußball: Tore. */
function liveParts(m) {
  const sets = (m.live && m.live.sets) || [[0, 0]];
  if (m.fb) return { main: sets[0] || [0, 0], cur: null };
  const done = sets.slice(0, -1);
  const won = [0, 0];
  done.forEach(([a, b]) => { if (a > b) won[0]++; else if (b > a) won[1]++; });
  return { main: won, cur: sets[sets.length - 1] || [0, 0], setNo: sets.length };
}
function liveSide(m, idx) {
  const p = liveParts(m);
  return p.cur ? `${p.main[idx - 1]}<small class="lp">${p.cur[idx - 1]}</small>` : `${p.main[idx - 1]}`;
}
/** Kurztext, z. B. "1:0 · 7:5 im 2. Satz" oder "2:1". */
function liveText(m) {
  const p = liveParts(m);
  return p.cur ? `${p.main[0]}:${p.main[1]} · ${p.cur[0]}:${p.cur[1]} im ${p.setNo}. Satz` : `${p.main[0]}:${p.main[1]}`;
}

/* ---------- Tippspiel: Geräte-Kennung und Name ---------- */
const Tip = {
  device() {
    try {
      let d = localStorage.getItem('tt-device');
      if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('tt-device', d); }
      return d;
    } catch { return Tip._mem ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); }
  },
  name() { try { return localStorage.getItem('tt-tipname') || ''; } catch { return ''; } },
  setName(n) { try { localStorage.setItem('tt-tipname', n); } catch {} },
};

/* ---------- Sanfte Aktualisierung ----------
   Ersetzt den Inhalt eines Containers und
   - behält horizontale Scrollpositionen (Turnierbaum) bei,
   - lässt Elemente mit gleichem data-key von ihrer alten an die neue Stelle gleiten (FLIP),
   - markiert Elemente, deren data-val sich geändert hat, mit .bump (kurzer Puls). */
const prefersReduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function morph(el, html) {
  const scrolls = [...el.querySelectorAll('.scroll')].map((x) => x.scrollLeft);
  const before = new Map();
  const vals = new Map();
  el.querySelectorAll('[data-key]').forEach((n) => { before.set(n.dataset.key, n.getBoundingClientRect()); });
  el.querySelectorAll('[data-val]').forEach((n) => vals.set(n.dataset.vkey || '', n.dataset.val));
  el.innerHTML = html;
  el.querySelectorAll('.scroll').forEach((x, i) => { if (scrolls[i]) x.scrollLeft = scrolls[i]; });
  if (prefersReduced()) return;
  el.querySelectorAll('[data-key]').forEach((n) => {
    const old = before.get(n.dataset.key);
    if (!old) return;
    const now = n.getBoundingClientRect();
    const dy = old.top - now.top, dx = old.left - now.left;
    if (Math.abs(dy) < 2 && Math.abs(dx) < 2) return;
    n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  });
  el.querySelectorAll('[data-val]').forEach((n) => {
    const k = n.dataset.vkey || '';
    if (vals.has(k) && vals.get(k) !== n.dataset.val) {
      n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump');
    }
  });
}

/* ---------- Turnierbaum: Verbindungslinien ----------
   Zeichnet pro Baum ein SVG hinter die Spiele: von jedem Spiel zu seinem Folgespiel.
   Linien von entschiedenen Spielen sind rot (Weg des Siegers). */
function drawConnectors(root) {
  (root || document).querySelectorAll('.bracket').forEach((br) => {
    br.querySelector(':scope > svg.links')?.remove();
    const box = br.getBoundingClientRect();
    const W = br.scrollWidth, H = br.scrollHeight;
    const byId = {};
    br.querySelectorAll('.bmatch[data-mid]').forEach((n) => (byId[n.dataset.mid] = n));
    let paths = '';
    for (const n of Object.values(byId)) {
      const to = byId[n.dataset.next];
      if (!to) continue;
      const a = n.getBoundingClientRect(), b = to.getBoundingClientRect();
      const x1 = a.right - box.left + br.scrollLeft, y1 = a.top + a.height / 2 - box.top + br.scrollTop;
      const x2 = b.left - box.left + br.scrollLeft, y2 = b.top + b.height / 2 - box.top + br.scrollTop;
      const mx = x1 + (x2 - x1) / 2;
      paths += `<path d="M${x1} ${y1}H${mx}V${y2}H${x2}" class="${n.dataset.w ? 'won' : ''}" ${n.dataset.w ? `data-w="${n.dataset.w}"` : ''}/>`;
    }
    if (!paths) return;
    br.insertAdjacentHTML('afterbegin', `<svg class="links" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${paths}</svg>`);
  });
}
