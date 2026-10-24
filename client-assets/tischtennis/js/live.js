'use strict';
/* Liveansicht für einen Bildschirm: laufende Tische, nächste Spiele, Tabellen
   bzw. Turnierbaum und letzte Ergebnisse. Aktualisiert sich alle 10 Sekunden,
   die rechte Spalte blättert alle 12 Sekunden weiter. */

const app = document.getElementById('app');
const REFRESH_MS = 10000;
const ROTATE_MS = 12000;
const L = { id: null, data: null, page: 0, pages: [], lastOk: 0, timers: [] };

function currentId() {
  const m = location.hash.match(/t=(\d+)/) || location.search.match(/[?&]t=(\d+)/);
  return m ? Number(m[1]) : null;
}

function clock() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function nameOf(P, id) {
  return P[id] ? esc(P[id].name) : '<span style="color:var(--muted)">offen</span>';
}

function winnerId(d) {
  if (d.tournament.status !== 'finished') return null;
  if (d.tournament.format === 'league') return d.standings[0]?.rows[0]?.player_id;
  if (d.tournament.double_elim) {
    const gf1 = d.matches.find((m) => m.bracket === 'gf' && m.round === 1);
    const gf2 = d.matches.find((m) => m.bracket === 'gf' && m.round === 2);
    return (gf2 && gf2.status === 'done' ? gf2 : gf1)?.winner_id;
  }
  return d.matches.find((m) => m.phase === 'ko' && !m.next_match_id)?.winner_id;
}

function sortMatches(a, b) {
  const phase = (m) => (m.phase === 'group' ? 0 : 1);
  return phase(a) - phase(b) || (a.group_no || 0) - (b.group_no || 0) || a.round - b.round || a.position - b.position;
}

/* ---------- rechte Spalte: Seiten zum Durchblättern ---------- */
function buildPages(d) {
  const P = nameMap(d.players);
  const pages = [];
  for (const g of d.standings) {
    const title = d.tournament.format === 'group' ? `Gruppe ${String.fromCharCode(64 + g.group_no)}` : 'Tabelle';
    pages.push({
      title,
      html: `<table class="standings"><thead><tr><th>#</th><th class="l">Spieler</th><th>Sp</th><th>S:N</th><th>Sätze</th><th>Pkt</th></tr></thead><tbody>${g.rows
        .map(
          (r, i) => `<tr class="${d.tournament.format === 'group' && i < d.tournament.advance_per_group ? 'q' : ''}">
            <td>${i + 1}</td><td class="l">${nameOf(P, r.player_id)}</td><td>${r.played}</td><td>${r.won}:${r.lost}</td>
            <td>${r.setsFor}:${r.setsAgainst}</td><td class="pts">${r.points}</td></tr>`
        )
        .join('')}</tbody></table>`,
    });
  }
  const ko = d.matches.filter((m) => m.phase === 'ko' && m.status !== 'bye');
  if (ko.length) {
    const buckets = d.tournament.double_elim ? ['wb', 'lb', 'gf'] : ['wb'];
    for (const b of buckets) {
      const ms = ko.filter((m) => (m.bracket || 'wb') === b);
      if (!ms.length) continue;
      // Aktuelle Runde = früheste Runde mit offenem Spiel, sonst die letzte.
      const open = ms.filter((m) => m.status === 'pending');
      const round = open.length ? Math.min(...open.map((m) => m.round)) : Math.max(...ms.map((m) => m.round));
      const names = (d.koRoundNames || {})[b] || {};
      const label = names[round] || `Runde ${round}`;
      const prefix = b === 'lb' ? 'Verliererbaum: ' : b === 'gf' ? '' : d.tournament.double_elim ? 'Gewinnerbaum: ' : '';
      pages.push({
        title: prefix + label,
        html: `<div class="bracket-round">${ms
          .filter((m) => m.round === round)
          .sort((a, c) => a.position - c.position)
          .map(
            (m) => `<div class="m">
              <span class="${m.winner_id && m.winner_id === m.player1_id ? 'w' : ''}">${nameOf(P, m.player1_id)}</span>
              <span class="s">${m.status === 'done' ? setScore(m).split(':')[0] : ''}</span>
              <span class="${m.winner_id && m.winner_id === m.player2_id ? 'w' : ''}">${nameOf(P, m.player2_id)}</span>
              <span class="s">${m.status === 'done' ? setScore(m).split(':')[1] : ''}</span>
            </div>`
          )
          .join('')}</div>`,
      });
    }
  }
  const done = d.matches.filter((m) => m.status === 'done').sort((a, b) => b.updated_at - a.updated_at).slice(0, 7);
  if (done.length) {
    pages.push({
      title: 'Letzte Ergebnisse',
      html: `<ul class="results">${done
        .map(
          (m) => `<li>
            <span class="${m.winner_id === m.player1_id ? 'w' : ''}">${nameOf(P, m.player1_id)}</span>
            <span class="score">${setScore(m)}</span>
            <span class="r ${m.winner_id === m.player2_id ? 'w' : ''}">${nameOf(P, m.player2_id)}</span>
            <span class="sets">${esc(setDetail(m))}</span>
          </li>`
        )
        .join('')}</ul>`,
    });
  }
  return pages;
}

function render() {
  const d = L.data;
  if (!d) return;
  const t = d.tournament;
  const P = nameMap(d.players);
  const champ = winnerId(d);

  const ready = d.matches.filter((m) => m.status === 'pending' && m.player1_id && m.player2_id);
  const atTables = ready.filter((m) => m.table_no).sort((a, b) => a.table_no - b.table_no);
  const next = ready.filter((m) => !m.table_no).sort(sortMatches);
  const waiting = d.matches.filter((m) => m.status === 'pending' && !(m.player1_id && m.player2_id)).length;
  const maxTables = 6;
  const maxNext = 7;

  L.pages = buildPages(d);
  if (L.page >= L.pages.length) L.page = 0;
  const page = L.pages[L.page];

  let main;
  if (t.status === 'draft') {
    main = `<div class="cols" style="grid-template-columns:1fr"><div class="col"><p class="live-empty">Das Turnier startet gleich – ${d.players.length} Teilnehmer gemeldet.</p></div></div>`;
  } else {
    main = `<div class="cols">
      <section class="col">
        <h2>An den Tischen</h2>
        ${
          atTables.length
            ? atTables
                .slice(0, maxTables)
                .map(
                  (m) => `<div class="tablecard"><div class="no"><small>Tisch</small>${m.table_no}</div>
                    <div class="who"><span class="round">${esc(matchTitle(m, d))}</span>
                      <span class="pname">${nameOf(P, m.player1_id)}</span><span class="vs">gegen</span><span class="pname">${nameOf(P, m.player2_id)}</span></div></div>`
                )
                .join('') + (atTables.length > maxTables ? `<p class="more">+ ${atTables.length - maxTables} weitere Tische</p>` : '')
            : `<p class="more">Gerade ist kein Tisch belegt.${next.length ? ' Die nächsten Spiele stehen rechts daneben.' : ''}</p>`
        }
      </section>
      <section class="col">
        <h2 class="cyan">Als Nächstes</h2>
        ${
          next.length
            ? `<ul class="next">${next
                .slice(0, maxNext)
                .map((m) => `<li><span class="round">${esc(matchTitle(m, d))}</span><span class="pair">${nameOf(P, m.player1_id)} – ${nameOf(P, m.player2_id)}</span></li>`)
                .join('')}</ul>${next.length > maxNext ? `<p class="more">+ ${next.length - maxNext} weitere Spiele</p>` : ''}`
            : '<p class="more">Keine weiteren Spiele bereit.</p>'
        }
        ${waiting ? `<p class="more">${waiting} Spiel${waiting === 1 ? '' : 'e'} warten noch auf Sieger aus der Vorrunde.</p>` : ''}
      </section>
      <section class="col">
        ${page ? `<h2>${esc(page.title)}${L.pages.length > 1 ? `<span class="page">${L.page + 1}/${L.pages.length}</span>` : ''}</h2>${page.html}` : '<h2>Tabelle</h2><p class="more">Noch keine Ergebnisse.</p>'}
      </section>
    </div>`;
  }

  const stale = Date.now() - L.lastOk > REFRESH_MS * 3;
  app.innerHTML = `
    <header class="bar"><span class="logo">🏓 Live</span><h1>${esc(t.name)}</h1>
      <span class="meta">${esc([FORMAT_LABEL[t.format], bestOfLabel(t.best_of)].join(' · '))}</span>
      <span class="clock">${clock()}</span></header>
    ${main}
    <footer class="ticker ${stale ? 'stale' : ''}"><span><span class="dot"></span>${stale ? 'Verbindung unterbrochen – versuche es weiter …' : 'Live – aktualisiert sich automatisch'}</span>
      <span>${esc(location.host)}/tischtennis</span></footer>
    ${champ ? `<div class="champ"><div class="cup">🏆</div><div class="label">Turniersieg</div><div class="name">${esc(P[champ]?.name || '')}</div><div class="t">${esc(t.name)}</div></div>` : ''}`;
}

async function refresh() {
  try {
    L.data = await api(`/api/tournaments/${L.id}`);
    L.lastOk = Date.now();
  } catch (e) {
    if (e.status === 404) {
      app.innerHTML = `<p class="live-empty">Dieses Turnier gibt es nicht (mehr).<br><a href="/tischtennis/live" style="color:var(--cyan)">Anderes Turnier wählen</a></p>`;
      L.data = null;
      return;
    }
  }
  render();
}

async function pickView() {
  let list = [];
  try {
    list = await api('/api/tournaments');
  } catch {}
  const shown = list.filter((t) => t.status !== 'finished');
  app.innerHTML = `<div class="pick">
    <h1>📺 Liveansicht</h1>
    <p>Welches Turnier soll auf dem Bildschirm laufen?</p>
    ${
      (shown.length ? shown : list).length
        ? `<ul>${(shown.length ? shown : list)
            .map((t) => `<li><a href="#t=${t.id}">${esc(t.name)} <span>${esc(STATUS_LABEL[t.status])} · ${t.player_count} Teilnehmer</span></a></li>`)
            .join('')}</ul>`
        : '<p>Noch keine Turniere angelegt.</p>'
    }
    <p><a href="/tischtennis/" style="color:var(--cyan)">← Zur Turnierseite</a></p></div>`;
}

function route() {
  L.timers.forEach(clearInterval);
  L.timers = [];
  L.id = currentId();
  L.page = 0;
  L.data = null;
  if (!L.id) return pickView();
  app.innerHTML = '<p class="live-empty">Lädt …</p>';
  refresh();
  L.timers.push(setInterval(refresh, REFRESH_MS));
  L.timers.push(
    setInterval(() => {
      if (L.pages.length > 1) {
        L.page = (L.page + 1) % L.pages.length;
        render();
      }
    }, ROTATE_MS)
  );
  // Uhr jede halbe Minute auffrischen, auch wenn sich sonst nichts ändert.
  L.timers.push(setInterval(() => document.querySelector('.clock') && (document.querySelector('.clock').textContent = clock()), 30000));
}

/* Vollbild + Mauszeiger ausblenden, wenn er nicht bewegt wird */
document.getElementById('fs').addEventListener('click', () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
});
let idleTimer;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
}
['mousemove', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
wake();

window.addEventListener('hashchange', route);
route();
