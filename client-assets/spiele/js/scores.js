/**
 * Scores – Bestenlisten-Widget für Solo-Spiele.
 * const hs = Scores.panel(element, 'snake', { unit: 'Pkt' });
 * hs.offer(punkte)  → Formular zum Eintragen anzeigen
 */
const Scores = (() => {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getName = () => { try { return localStorage.getItem('gg-name') || ''; } catch { return ''; } };
  const setName = (n) => { try { localStorage.setItem('gg-name', n); } catch {} };

  async function list(game) {
    try {
      const r = await fetch(`/api/spiele/scores/${game}`);
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  }

  async function submit(game, name, score) {
    const r = await fetch(`/api/spiele/scores/${game}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Eintragen fehlgeschlagen');
    return data;
  }

  function table(entries, unit, mark) {
    if (!entries.length) return '<p class="muted">Noch keine Einträge – sei die oder der Erste!</p>';
    const markIdx = mark ? entries.findIndex((e) => e.name === mark.name && e.score === mark.score) : -1;
    return `<ol class="hs">${entries
      .map((e, i) => `<li class="${i === markIdx ? 'me' : ''}"><span>${esc(e.name)}</span><b>${e.score}${unit ? ' ' + unit : ''}</b></li>`)
      .join('')}</ol>`;
  }

  function panel(el, game, { unit = '', title = '🏆 Bestenliste' } = {}) {
    el.classList.add('panel');
    el.innerHTML = `<h2>${title}</h2><div class="hs-form" hidden></div><div class="hs-list"><p class="muted">Lade …</p></div>`;
    const listEl = el.querySelector('.hs-list');
    const formEl = el.querySelector('.hs-form');

    const refresh = async (mark) => { listEl.innerHTML = table(await list(game), unit, mark); };
    refresh();

    return {
      refresh,
      offer(score) {
        formEl.hidden = false;
        formEl.innerHTML = `
          <p>Dein Ergebnis: <b>${score}${unit ? ' ' + unit : ''}</b></p>
          <form><input name="n" maxlength="16" placeholder="Dein Name" required value="${esc(getName())}"><button>Eintragen</button></form>
          <p class="error"></p>`;
        const form = formEl.querySelector('form');
        const btn = form.querySelector('button');
        form.onsubmit = async (e) => {
          e.preventDefault();
          const name = form.elements.n.value.trim();
          if (!name) return;
          setName(name);
          btn.disabled = true;
          try {
            const entries = await submit(game, name, score);
            formEl.hidden = true;
            listEl.innerHTML = table(entries, unit, { name, score });
          } catch (err) {
            formEl.querySelector('.error').textContent = err.message;
            btn.disabled = false;
          }
        };
      },
      hide() { formEl.hidden = true; },
    };
  }

  return { panel, list };
})();

/** Hilfsfunktion für Wisch-Gesten (Touch). cb('up'|'down'|'left'|'right') */
function onSwipe(el, cb, min = 24) {
  let sx = 0, sy = 0, active = false;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; active = true; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
  el.addEventListener('touchend', (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return cb('tap');
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
}

/** true, wenn der Tastendruck in einem Eingabefeld passiert (dann nicht als Spielsteuerung werten) */
function typingIn(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
