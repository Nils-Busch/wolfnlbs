// Ewige Bestenliste der Tagesrätsel: Podium, Rekorde, Tabelle.
(() => {
  'use strict';
  // Kleine Symbole der Tagesrätsel (wie auf der Rätsel-Seite)
  const IC = {"wordle": "<svg class=\"rt-mini\" viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect class=\"a-karte\" style=\"--n:0\" x=\"2\" y=\"15\" width=\"8.5\" height=\"18\" rx=\"2\" fill=\"var(--vh-green)\"/><rect class=\"a-karte\" style=\"--n:1\" x=\"11\" y=\"15\" width=\"8.5\" height=\"18\" rx=\"2\" fill=\"var(--vh-yellow)\"/><rect class=\"a-karte\" style=\"--n:2\" x=\"20\" y=\"15\" width=\"8.5\" height=\"18\" rx=\"2\" fill=\"#8b968f\"/><rect class=\"a-karte\" style=\"--n:3\" x=\"29\" y=\"15\" width=\"8.5\" height=\"18\" rx=\"2\" fill=\"var(--vh-green)\"/><rect class=\"a-karte\" style=\"--n:4\" x=\"38\" y=\"15\" width=\"8.5\" height=\"18\" rx=\"2\" fill=\"var(--vh-green)\"/><text x=\"6.25\" y=\"28\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"11\" fill=\"#fff\">R</text><text x=\"15.25\" y=\"28\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"11\" fill=\"#fff\">A</text><text x=\"24.25\" y=\"28\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"11\" fill=\"#fff\">T</text><text x=\"33.25\" y=\"28\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"11\" fill=\"#fff\">E</text><text x=\"42.25\" y=\"28\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"11\" fill=\"#fff\">N</text></svg>", "staedte": "<svg class=\"rt-mini\" viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M14 6l9 4 8-3 9 5v30l-9-4-8 4-9-4-8 3V9z\" fill=\"#dfe6da\" stroke=\"var(--vh-ink)\" stroke-width=\"1.5\" stroke-linejoin=\"round\" opacity=\".9\"/><path d=\"M23 10v30M31 7v31\" stroke=\"var(--vh-ink)\" stroke-width=\"1\" opacity=\".35\"/><g class=\"a-hoch\"><path d=\"M27 31c-4-6-7-8.5-7-12.5a7 7 0 0 1 14 0c0 4-3 6.5-7 12.5z\" fill=\"var(--vh-red)\"/><circle cx=\"27\" cy=\"18.5\" r=\"2.6\" fill=\"#fff\"/></g></svg>", "nono": "<svg class=\"rt-mini\" viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" fill=\"#cfd6cc\"/><rect x=\"22\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"30\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"38\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" fill=\"#cfd6cc\"/><rect x=\"14\" y=\"22\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"22\" y=\"22\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"30\" y=\"22\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"38\" y=\"22\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"14\" y=\"30\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"22\" y=\"30\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"30\" y=\"30\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"38\" y=\"30\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"14\" y=\"38\" width=\"7\" height=\"7\" rx=\"1\" fill=\"#cfd6cc\"/><rect x=\"22\" y=\"38\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"30\" y=\"38\" width=\"7\" height=\"7\" rx=\"1\" fill=\"var(--vh-ink)\"/><rect x=\"38\" y=\"38\" width=\"7\" height=\"7\" rx=\"1\" fill=\"#cfd6cc\"/><text x=\"5\" y=\"21\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"9\" fill=\"var(--vh-ink)\">2</text><text x=\"5\" y=\"37\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"9\" fill=\"var(--vh-ink)\">2</text><text x=\"5\" y=\"29\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"9\" fill=\"var(--vh-ink)\">4</text><text x=\"18\" y=\"10\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"9\" fill=\"var(--vh-ink)\">2</text><text x=\"34\" y=\"10\" text-anchor=\"middle\" font-family=\"Barlow Condensed, sans-serif\" font-weight=\"800\" font-size=\"9\" fill=\"var(--vh-ink)\">2</text></svg>", "conn": "<svg class=\"rt-mini\" viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect class=\"a-karte\" style=\"--n:0\" x=\"3\" y=\"3\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#f2c230\"/><rect class=\"a-karte\" style=\"--n:1\" x=\"14\" y=\"3\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#f2c230\"/><rect class=\"a-karte\" style=\"--n:2\" x=\"25\" y=\"3\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#f2c230\"/><rect class=\"a-karte\" style=\"--n:3\" x=\"36\" y=\"3\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#f2c230\"/><rect class=\"a-karte\" style=\"--n:4\" x=\"3\" y=\"14\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#4fbf7f\"/><rect class=\"a-karte\" style=\"--n:5\" x=\"14\" y=\"14\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#4fbf7f\"/><rect class=\"a-karte\" style=\"--n:6\" x=\"25\" y=\"14\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#4fbf7f\"/><rect class=\"a-karte\" style=\"--n:7\" x=\"36\" y=\"14\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#4fbf7f\"/><rect class=\"a-karte\" style=\"--n:8\" x=\"3\" y=\"25\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#5b8de0\"/><rect class=\"a-karte\" style=\"--n:9\" x=\"14\" y=\"25\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#5b8de0\"/><rect class=\"a-karte\" style=\"--n:10\" x=\"25\" y=\"25\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#5b8de0\"/><rect class=\"a-karte\" style=\"--n:11\" x=\"36\" y=\"25\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#5b8de0\"/><rect class=\"a-karte\" style=\"--n:12\" x=\"3\" y=\"36\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#a979d8\"/><rect class=\"a-karte\" style=\"--n:13\" x=\"14\" y=\"36\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#a979d8\"/><rect class=\"a-karte\" style=\"--n:14\" x=\"25\" y=\"36\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#a979d8\"/><rect class=\"a-karte\" style=\"--n:15\" x=\"36\" y=\"36\" width=\"9.5\" height=\"9.5\" rx=\"2\" fill=\"#a979d8\"/></svg>", "jig": "<svg class=\"rt-mini\" viewBox=\"0 0 48 48\" aria-hidden=\"true\"><g class=\"a-hoch\"><path d=\"M6 8h14c0-6 10-6 10 0h12v12c-6 0-6 10 0 10v12H30c0-6-10-6-10 0H6V30c6 0 6-10 0-10z\" fill=\"#5b8de0\"/></g><path d=\"M6 8h14c0-6 10-6 10 0h12\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.5\"/></svg>", "fire": "<svg class=\"rt-mini\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 .5 2 1.5 3 2.5 3C11 7 11 5 12 2z\" fill=\"#ff7a2f\"/><path d=\"M12 13c.6 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 1.5-3.5.3 1 .8 1.5 1.5 1.5-.3-1 0-2 0-3z\" fill=\"#f2c230\"/></svg>", "lock": "<svg class=\"rt-mini\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2.5\" fill=\"currentColor\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"/></svg>"};
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
    if (b.wordle != null) out.push(`<span class="chip w" title="Wordle: weniger Versuche ist besser">${IC.wordle} ${b.wordle}/6</span>`);
    if (b.staedte != null) out.push(`<span class="chip s" title="Städteraten: beste Punktzahl">${IC.staedte} ${fmt(b.staedte)}</span>`);
    if (b.nono != null) out.push(`<span class="chip n" title="Nonogramm: schnellste Zeit">${IC.nono} ${fmtTime(b.nono)}</span>`);
    if (b.jig != null) out.push(`<span class="chip j" title="Puzzle: schnellste Zeit">${IC.jig} ${fmtTime(b.jig)}</span>`);
    if (b.conn != null) out.push(`<span class="chip c" title="Connections: wenigste Fehler, dann Zeit">${IC.conn} ${connFmt(b.conn)}</span>`);
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
      r.wordle ? rec(IC.wordle, 'Bestes Wordle', `${r.wordle.raw}/6`, `${esc(r.wordle.name)}, ${fmtDate(r.wordle.date)}`) : '',
      r.staedte ? rec(IC.staedte, 'Beste Städte-Runde', fmt(r.staedte.raw), `${esc(r.staedte.name)}, ${fmtDate(r.staedte.date)}`) : '',
      r.nono ? rec(IC.nono, 'Schnellstes Nonogramm', fmtTime(r.nono.raw), `${esc(r.nono.name)}, ${fmtDate(r.nono.date)}`) : '',
      r.conn ? rec(IC.conn, 'Bestes Connections', connFmt(r.conn.raw), `${esc(r.conn.name)}, ${fmtDate(r.conn.date)}`) : '',
      r.jig ? rec(IC.jig, 'Schnellstes Puzzle', fmtTime(r.jig.raw), `${esc(r.jig.name)}, ${fmtDate(r.jig.date)}`) : '',
      r.streak && r.streak.days > 1 ? rec(IC.fire, 'Längste Serie', `${r.streak.days} Tage`, esc(r.streak.name)) : '',
    ].join('');

    const body = $('table').querySelector('tbody');
    body.innerHTML = list.length
      ? list.map((p, i) => `
        <tr class="${p.name.toLowerCase() === me ? 'me' : ''}" style="animation-delay:${Math.min(i, 20) * 0.03}s">
          <td class="rank">${i < 3 ? `<span class="medal m${i + 1}">${i + 1}</span>` : i + 1}</td>
          <td><span class="who"><span class="av" style="--c:${colorFor(p.name)}">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b>${tick(p)}${p.today ? `<small class="today">+${fmt(p.today)} heute</small>` : ''}</span></span></td>
          <td class="num"><b>${fmt(p.points)}</b><small class="avg">⌀ ${fmt(p.avg)}/Tag</small></td>
          <td class="num hide-s">${p.days}</td>
          <td class="num">${p.streak ? `<span class="fire" title="Beste Serie: ${p.bestStreak}">${IC.fire} ${p.streak}</span>` : `<span class="muted" title="Beste Serie: ${p.bestStreak}">–</span>`}</td>
          <td class="num hide-s">${p.wins ? `${p.wins}` : '<span class="muted">–</span>'}</td>
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
    ['wordle', IC.wordle, 'Wordle', (v) => `${v}/6`],
    ['staedte', IC.staedte, 'Städteraten', fmt],
    ['nono', IC.nono, 'Nonogramm', fmtTime],
    ['conn', IC.conn, 'Connections', connFmt],
    ['jig', IC.jig, 'Puzzle', fmtTime],
  ];
  async function loadMine() {
    let d = null;
    try { d = await (await fetch('/api/spiele/daily/me')).json(); } catch { d = null; }
    const el = $('mine');
    if (!d || !d.user) {
      el.innerHTML = `<div class="mine-cta"><span>${IC.lock}</span><p><b>Mit Konto spielen:</b> Deine Punkte gehören fest zu dir, niemand kann unter deinem Namen eintragen, und hier erscheint deine eigene Statistik.</p><a class="vh-btn" href="/konto/">Anmelden</a></div>`;
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
          <div><b>${d.streak ? IC.fire + ' ' + d.streak : '–'}</b><span>Serie (beste ${d.bestStreak})</span></div>
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
