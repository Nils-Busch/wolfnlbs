/**
 * Gemeinsame Helfer für die Tagesrätsel.
 *   Daily.today()          – heutiges Datum in Deutschland, "JJJJ-MM-TT"
 *   Daily.number(start)    – laufende Rätselnummer seit dem Starttag (#1)
 *   Daily.rng(seed)        – reproduzierbarer Zufall (gleiches Rätsel für alle)
 *   Daily.untilMidnight()  – Millisekunden bis zum nächsten Rätsel
 *   Daily.store            – localStorage mit JSON, fehlertolerant
 *   Daily.board(el, key, unit, mark) / Daily.submit(key, name, score)
 */
const Daily = (() => {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function berlinParts(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    return Object.fromEntries(parts.map((p) => [p.type, p.value]));
  }
  function today() {
    const p = berlinParts();
    return `${p.year}-${p.month}-${p.day}`;
  }
  function number(start, date = today()) {
    return Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 86400000) + 1;
  }
  function untilMidnight() {
    const p = berlinParts();
    const secs = (+p.hour) * 3600 + (+p.minute) * 60 + (+p.second);
    return (86400 - secs) * 1000;
  }
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  function longDate(date = today()) {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  // mulberry32 mit Seed aus einem Text
  function rng(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) {
      h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    name() { try { return localStorage.getItem('gg-name') || ''; } catch { return ''; } },
    setName(n) { try { localStorage.setItem('gg-name', n); } catch {} },
  };

  const key = (prefix, date = today()) => prefix + date.replaceAll('-', '');

  async function list(k) {
    try {
      const r = await fetch(`/api/spiele/scores/${k}`);
      return r.ok ? await r.json() : [];
    } catch { return []; }
  }
  async function submit(k, name, score) {
    const r = await fetch(`/api/spiele/scores/${k}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Eintragen fehlgeschlagen');
    return data;
  }
  function table(entries, fmt, mark) {
    if (!entries.length) return '<p class="muted">Heute noch keine Einträge – sei die oder der Erste!</p>';
    const mi = mark ? entries.findIndex((e) => e.name === mark.name && e.score === mark.score) : -1;
    return `<ol class="hs">${entries.map((e, i) => `<li class="${i === mi ? 'me' : ''}"><span>${esc(e.name)}</span><b>${fmt(e.score)}</b></li>`).join('')}</ol>`;
  }
  async function board(el, k, fmt = String, mark = null) {
    el.innerHTML = table(await list(k), fmt, mark);
  }

  return { today, number, untilMidnight, fmtCountdown, longDate, rng, store, key, list, submit, table, board, esc };
})();
