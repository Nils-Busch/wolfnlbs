// Ewige Bestenliste der Tagesrätsel: Podium, Rekorde, Tabelle.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = Daily.esc;
  const me = (Daily.store.name() || '').trim().toLowerCase();
  const PALETTE = ['#e05252', '#3f7be0', '#22a06b', '#d99a00', '#8a5cf0', '#e0658f', '#1aa3a3', '#c4622d'];
  const colorFor = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const initials = (name) => { const p = name.trim().split(/\s+/); return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : [...p[0]].slice(0, 2).join('')).toUpperCase(); };
  const fmt = (n) => Number(n).toLocaleString('de-DE');
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  let range = 'all';
  const connFmt = (raw) => { const m = Math.floor(raw / 10000); return `${m} Fehler, ${fmtTime(raw % 10000)}`; };
  const tick = (p) => (p.account ? ' <span class="acct" title="Mit Konto">✓</span>' : '');

  function countUp(el, to) {
    if (window.VH) { el.dataset.from = 0; VH.countUp(el, to, 900); } else el.textContent = to;
  }

  function bests(b) {
    const out = [];
    if (b.wordle != null) out.push(`<span class="chip w" title="Wordle: weniger Versuche ist besser">🟩 ${b.wordle}/6</span>`);
    if (b.staedte != null) out.push(`<span class="chip s" title="Städteraten: beste Punktzahl">📍 ${fmt(b.staedte)}</span>`);
    if (b.nono != null) out.push(`<span class="chip n" title="Nonogramm: schnellste Zeit">▦ ${fmtTime(b.nono)}</span>`);
    if (b.conn != null) out.push(`<span class="chip c" title="Connections: wenigste Fehler, dann Zeit">🔗 ${connFmt(b.conn)}</span>`);
    return out.join('');
  }

  function render(data) {
    const list = data.players;
    // Podium: 2 – 1 – 3
    const top = [list[1], list[0], list[2]];
    $('podium').innerHTML = list.length
      ? top.map((p, i) => {
          if (!p) return '<div class="step empty"></div>';
          const place = [2, 1, 3][i];
          return `<div class="step p${place} ${p.name.toLowerCase() === me ? 'me' : ''}" style="--c:${colorFor(p.name)}">
            <span class="av">${esc(initials(p.name))}</span>
            <b class="nm">${esc(p.name)}${tick(p)}</b>
            <span class="pts"><span data-to="${p.points}">0</span> Pkt</span>
            <span class="block"><i>${place}</i></span>
          </div>`;
        }).join('')
      : '<p class="muted lb-empty">Noch keine Einträge. Löse ein Tagesrätsel und trag dich in die Tagesliste ein – dann stehst du hier.</p>';
    $('podium').querySelectorAll('[data-to]').forEach((el, i) => setTimeout(() => countUp(el, +el.dataset.to), 300 + i * 150));

    const r = data.records;
    const rec = (icon, title, value, who) => `<div class="rec-card"><span class="ic">${icon}</span><span class="t">${title}</span><b>${value}</b><small>${who}</small></div>`;
    $('records').innerHTML = [
      r.wordle ? rec('🟩', 'Bestes Wordle', `${r.wordle.raw}/6`, `${esc(r.wordle.name)}, ${fmtDate(r.wordle.date)}`) : '',
      r.staedte ? rec('📍', 'Beste Städte-Runde', fmt(r.staedte.raw), `${esc(r.staedte.name)}, ${fmtDate(r.staedte.date)}`) : '',
      r.nono ? rec('▦', 'Schnellstes Nonogramm', fmtTime(r.nono.raw), `${esc(r.nono.name)}, ${fmtDate(r.nono.date)}`) : '',
      r.conn ? rec('🔗', 'Bestes Connections', connFmt(r.conn.raw), `${esc(r.conn.name)}, ${fmtDate(r.conn.date)}`) : '',
      r.streak && r.streak.days > 1 ? rec('🔥', 'Längste Serie', `${r.streak.days} Tage`, esc(r.streak.name)) : '',
    ].join('');

    const body = $('table').querySelector('tbody');
    body.innerHTML = list.length
      ? list.map((p, i) => `
        <tr class="${p.name.toLowerCase() === me ? 'me' : ''}" style="animation-delay:${Math.min(i, 20) * 0.03}s">
          <td class="rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
          <td><span class="who"><span class="av" style="--c:${colorFor(p.name)}">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b>${tick(p)}${p.today ? `<small class="today">+${fmt(p.today)} heute</small>` : ''}</span></span></td>
          <td class="num"><b>${fmt(p.points)}</b><small class="avg">⌀ ${fmt(p.avg)}/Tag</small></td>
          <td class="num hide-s">${p.days}</td>
          <td class="num">${p.streak ? `<span class="fire" title="Beste Serie: ${p.bestStreak}">🔥 ${p.streak}</span>` : `<span class="muted" title="Beste Serie: ${p.bestStreak}">–</span>`}</td>
          <td class="num hide-s">${p.wins ? `🏆 ${p.wins}` : '<span class="muted">–</span>'}</td>
          <td class="hide-m"><span class="chips">${bests(p.best)}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="muted">Noch niemand dabei.</td></tr>';
  }

  async function load() {
    document.querySelectorAll('#range [data-range]').forEach((b) => b.classList.toggle('on', b.dataset.range === range));
    try {
      const r = await fetch('/api/spiele/daily/board?range=' + range);
      if (!r.ok) throw new Error();
      render(await r.json());
    } catch {
      $('table').querySelector('tbody').innerHTML = '<tr><td colspan="7" class="error">Bestenliste gerade nicht erreichbar. Bitte später neu laden.</td></tr>';
    }
  }

  // Meine Statistik (nur mit Konto)
  const GAME_INFO = [
    ['wordle', '🟩', 'Wordle', (v) => `${v}/6`],
    ['staedte', '📍', 'Städteraten', fmt],
    ['nono', '▦', 'Nonogramm', fmtTime],
    ['conn', '🔗', 'Connections', connFmt],
  ];
  async function loadMine() {
    let d = null;
    try { d = await (await fetch('/api/spiele/daily/me')).json(); } catch { d = null; }
    const el = $('mine');
    if (!d || !d.user) {
      el.innerHTML = `<div class="mine-cta"><span>🔒</span><p><b>Mit Konto spielen:</b> Deine Punkte gehören fest zu dir, niemand kann unter deinem Namen eintragen, und hier erscheint deine eigene Statistik.</p><a class="vh-btn" href="/konto/">Anmelden</a></div>`;
      return;
    }
    const max = Math.max(1, ...d.last30.map((x) => x.points));
    el.innerHTML = `
      <div class="panel mine">
        <div class="mine-head">
          <h2>Meine Statistik</h2>
          <span class="muted">${esc(d.user.name)}${d.rank ? `, Platz ${d.rank} von ${d.of}` : ''}</span>
        </div>
        <div class="mine-nums">
          <div><b data-to="${d.points}">0</b><span>Punkte</span></div>
          <div><b>${d.days}</b><span>Tage</span></div>
          <div><b>${d.streak ? '🔥 ' + d.streak : '–'}</b><span>Serie (beste ${d.bestStreak})</span></div>
          <div><b>${d.wins}</b><span>Tagessiege</span></div>
        </div>
        <div class="mine-chart" role="img" aria-label="Punkte der letzten 30 Tage">
          ${d.last30.map((x, i) => `<i style="--h:${Math.round((x.points / max) * 100)}%; animation-delay:${i * 0.015}s" title="${fmtDate(x.date)}: ${fmt(x.points)} Punkte"></i>`).join('')}
        </div>
        <p class="hint mine-cap">Punkte der letzten 30 Tage</p>
        <div class="mine-games">
          ${GAME_INFO.map(([k, ic, name, f]) => {
            const g = d.games[k];
            const done = d.todayDone.includes(k);
            return `<div class="mg ${done ? 'done' : ''}"><span class="ic">${ic}</span><b>${name}</b><small>${g.played}× gespielt</small><small>Bestwert: ${g.best == null ? '–' : f(g.best)}</small><small class="td">${done ? '✓ heute erledigt' : 'heute offen'}</small></div>`;
          }).join('')}
        </div>
      </div>`;
    el.querySelectorAll('[data-to]').forEach((b) => countUp(b, +b.dataset.to));
  }

  document.querySelectorAll('#range [data-range]').forEach((b) => (b.onclick = () => { range = b.dataset.range; load(); }));
  load();
  loadMine();
})();
