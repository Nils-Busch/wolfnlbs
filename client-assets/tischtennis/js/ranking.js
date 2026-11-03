'use strict';
/* Vereinsrangliste: Elo-Wertung über alle Turniere einer Sportart */
const app = document.getElementById('app');
const R = { sport: /football/.test(location.hash) ? 'football' : 'tabletennis', data: null };

function spark(h) {
  if (!h || h.length < 2) return '';
  const w = 90, ht = 26, min = Math.min(...h), max = Math.max(...h), span = Math.max(1, max - min);
  const pts = h.map((v, i) => `${((i / (h.length - 1)) * w).toFixed(1)},${(ht - 3 - ((v - min) / span) * (ht - 6)).toFixed(1)}`).join(' ');
  const up = h[h.length - 1] >= h[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
function trend(h) {
  if (!h || h.length < 2) return '';
  const d = h[h.length - 1] - h[Math.max(0, h.length - 6)];
  return d ? `<span class="trend ${d > 0 ? 'up' : 'down'}" title="Veränderung in den letzten Spielen">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>` : '<span class="trend">–</span>';
}

function render() {
  const d = R.data;
  const fb = R.sport === 'football';
  const tabs = renderTabs([['tabletennis', '🏓 Tischtennis'], ['football', '⚽ Fußball']], R.sport);
  let body;
  if (!d) body = '<p class="empty">Lädt …</p>';
  else if (!d.players.length) body = `<p class="empty">Noch keine gewerteten Spiele${fb ? '' : ' im Einzel'}. Die Rangliste füllt sich mit jedem eingetragenen Ergebnis.</p>`;
  else {
    let rank = 0, last = null;
    body = `<p class="t-meta">${d.players.length} ${fb ? 'Teams' : 'Personen'} · ${d.games} Spiele aus ${d.tournaments} ${d.tournaments === 1 ? 'Turnier' : 'Turnieren'}</p>
      <div class="scroll"><table class="standings ranking">
      <thead><tr><th>Platz</th><th class="left">${fb ? 'Team' : 'Name'}</th><th>Wertung</th><th class="hide-s">Verlauf</th><th title="Spiele">Sp</th><th>${fb ? 'S-U-N' : 'S:N'}</th><th title="Turniersiege">🏆</th></tr></thead>
      <tbody>${d.players.map((p, i) => { if (p.rating !== last) { rank = i + 1; last = p.rating; } return `
        <tr style="--i:${Math.min(i, 20)}" class="${rank <= 3 ? 'top' + rank : ''}">
          <td class="num"><span class="rk">${rank}</span></td>
          <td class="left"><strong>${esc(p.name)}</strong>${p.club ? ` <span class="club">${esc(p.club)}</span>` : ''}<span class="sub">${p.tournaments} ${p.tournaments === 1 ? 'Turnier' : 'Turniere'} · beste Wertung ${p.best}</span></td>
          <td class="num strong elo">${p.rating} ${trend(p.history)}</td>
          <td class="hide-s">${spark(p.history)}</td>
          <td class="num">${p.games}</td>
          <td class="num">${fb ? `${p.wins}-${p.draws}-${p.losses}` : `${p.wins}:${p.losses}`}</td>
          <td class="num">${p.titles || ''}</td>
        </tr>`; }).join('')}</tbody></table></div>`;
  }
  app.innerHTML = `<h1 class="page-title">Vereinsrangliste</h1>
    ${tabs}
    <div class="tab-body tab-in">${body}</div>
    <details class="hint how"><summary>Wie wird gerechnet?</summary>
      <p>Alle starten mit 1000 Punkten (Elo-System). Wer gewinnt, bekommt Punkte vom Gegner – gegen Stärkere mehr, gegen Schwächere weniger. In den ersten 10 Spielen bewegt sich die Wertung schneller, damit Neue rasch an ihren Platz kommen. Gezählt werden alle Spiele aller Turniere${fb ? '' : ' im Einzel; Doppel bleiben außen vor'}. Personen werden am Namen erkannt – also bitte in jedem Turnier gleich schreiben.</p></details>`;
}

async function load() {
  R.data = null;
  render();
  try { R.data = await api(`/api/ranking?sport=${R.sport}`); } catch (e) { app.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
  render();
}
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b || b.dataset.tab === R.sport) return;
  R.sport = b.dataset.tab;
  history.replaceState(null, '', R.sport === 'football' ? '#football' : '#');
  load();
});
load();
