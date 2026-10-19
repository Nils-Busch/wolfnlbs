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
  return data;
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
  let a = 0, b = 0;
  m.sets.forEach(([x, y]) => (x > y ? a++ : b++));
  return `${a}:${b}`;
}

function playerLabel(p, fallback = 'offen') {
  if (!p) return `<span class="muted">${fallback}</span>`;
  if (p.members && p.members.length) {
    const names = p.members.map(m => esc(m.name) + (m.club ? ` <span class="club">${esc(m.club)}</span>` : '')).join(' &amp; ');
    return `${esc(p.name)}<br><span class="club">${names}</span>`;
  }
  return `${esc(p.name)}${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}`;
}

function renderStandings(data) {
  const P = nameMap(data.players);
  if (!data.standings.length) return '<p class="empty">Noch keine Tabelle – das Turnier hat keine Gruppenphase oder ist nicht gestartet.</p>';
  return data.standings.map(g => `
    <section class="block">
      ${data.tournament.format === 'group' ? `<h3>Gruppe ${String.fromCharCode(64 + g.group_no)}</h3>` : ''}
      <div class="scroll"><table class="standings">
        <thead><tr><th>Platz</th><th class="left">Spieler</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Niederlagen">N</th><th>Sätze</th><th>Bälle</th><th>Punkte</th></tr></thead>
        <tbody>${g.rows.map((r, i) => `
          <tr class="${data.tournament.format === 'group' && i < data.tournament.advance_per_group ? 'qualified' : ''}">
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
          <div class="side ${m.winner_id && m.winner_id === pid ? 'win' : ''}">
            <span class="pname">${m.status === 'bye' && !pid ? '<span class="muted">Freilos</span>' : playerLabel(P[pid])}${sideTag ? sideTag(idx) : ''}</span>
            <span class="sets">${m.status === 'done' ? m.sets.filter(([a, b]) => (idx === 1 ? a > b : b > a)).length : ''}</span>
          </div>`;
        return `<div class="bmatch ${m.status}">${side(m.player1_id, 1)}${side(m.player2_id, 2)}${extra(m)}</div>`;
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
  return m.status === 'done' ? m.sets.map(([a, b]) => `${a}:${b}`).join(', ') : '';
}

function renderTabs(tabs, active) {
  return `<nav class="tabs" role="tablist">${tabs.map(([key, label]) =>
    `<button role="tab" data-tab="${key}" aria-selected="${key === active}">${esc(label)}</button>`).join('')}</nav>`;
}
