// Steckhalma (englisches Brett): Stifte überspringen, bis möglichst wenige übrig sind.
// Bestenliste: Reststifte × 10000 + Sekunden (weniger ist besser).
(() => {
  'use strict';
  const { steckhalma: R } = SoloRegeln;
  const $ = (id) => document.getElementById(id);
  const zeit = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const format = (score) => { const n = Math.floor(score / 10000); return `${n} ${n === 1 ? 'Stift' : 'Stifte'}, ${zeit(score % 10000)}`; };
  const hs = Scores.panel($('scores'), 'steckhalma', { title: 'Bestenliste', fmt: format });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let brett, wahl, verlauf, start, uhr, vorbei, laeuft;
  const board = $('board');

  function sekunden() { return start ? Math.min(9999, Math.floor((Date.now() - start) / 1000)) : 0; }
  function tick() { $('time').textContent = zeit(sekunden()); }

  function neu() {
    brett = R.start();
    wahl = -1;
    verlauf = [];
    start = null;
    vorbei = false;
    laeuft = false;
    clearInterval(uhr);
    $('overlay').hidden = true;
    hs.hide();
    tick();
    zeichnen();
  }

  function zeichnen() {
    const ziele = wahl >= 0 ? R.zieleVon(brett, wahl) : [];
    const zug = R.zuege(brett).map(([v]) => v);
    board.innerHTML = brett.map((v, i) => {
      if (v === null) return '<span class="sh-leer" aria-hidden="true"></span>';
      const cls = ['sh-loch'];
      if (i === R.MITTE) cls.push('mitte');
      if (i === wahl) cls.push('gewaehlt');
      if (ziele.includes(i)) cls.push('ziel');
      if (v === 1 && !vorbei && wahl < 0 && zug.includes(i)) cls.push('kann');
      const r = Math.floor(i / R.N) + 1, c = (i % R.N) + 1;
      const label = `Reihe ${r}, Spalte ${c}: ${v === 1 ? 'Stift' : 'frei'}${i === wahl ? ', ausgewählt' : ''}${ziele.includes(i) ? ', Ziel' : ''}`;
      return `<button type="button" class="${cls.join(' ')}" data-i="${i}" aria-label="${label}">${v === 1 ? '<i class="sh-stift"></i>' : ''}</button>`;
    }).join('');
    $('left').textContent = R.rest(brett);
    $('undo').disabled = !verlauf.length || laeuft;
  }

  function zellenMitte(i) {
    const el = board.querySelector(`[data-i="${i}"]`);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function springen(von, nach) {
    const ueber = R.sprung(brett, von, nach);
    if (ueber < 0) return;
    if (!start) { start = Date.now(); uhr = setInterval(tick, 500); }
    laeuft = true;
    const neu = R.springen(brett, von, nach);
    const fertig = () => {
      verlauf.push(brett);
      brett = neu;
      wahl = -1;
      laeuft = false;
      zeichnen();
      pruefeEnde();
    };
    if (reduced()) return fertig();
    // Der Stift hüpft in einem Bogen hinüber, der übersprungene fliegt raus
    const a = zellenMitte(von), b = zellenMitte(nach);
    const stiftEl = board.querySelector(`[data-i="${von}"] .sh-stift`);
    const raus = board.querySelector(`[data-i="${ueber}"] .sh-stift`);
    if (raus) raus.classList.add('raus');
    const dx = b.x - a.x, dy = b.y - a.y;
    stiftEl.style.zIndex = 5;
    stiftEl.animate([
      { transform: 'translate(0, 0) scale(1.15)' },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 26}px) scale(1.25)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
    ], { duration: 320, easing: 'ease-in-out', fill: 'forwards' }).finished.then(fertig, fertig);
  }

  function pruefeEnde() {
    if (R.zuege(brett).length) return;
    vorbei = true;
    clearInterval(uhr);
    tick();
    zeichnen();
    const rest = R.rest(brett), s = sekunden();
    let text;
    if (rest === 1) text = brett[R.MITTE] === 1 ? `Perfekt: der letzte Stift steht genau in der Mitte! (${zeit(s)})` : `Nur noch ein Stift übrig! (${zeit(s)})`;
    else text = `Kein Sprung mehr möglich: ${rest} Stifte übrig.`;
    $('ovText').textContent = text;
    setTimeout(() => {
      $('overlay').hidden = false;
      if (rest === 1 && window.VH) VH.confetti();
      hs.offer(rest * 10000 + s);
    }, 400);
  }

  board.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b || vorbei || laeuft) return;
    const i = +b.dataset.i;
    if (brett[i] === 1) {
      wahl = wahl === i ? -1 : i;
      zeichnen();
      board.querySelector(`[data-i="${i}"]`)?.focus();
    } else if (wahl >= 0 && R.sprung(brett, wahl, i) >= 0) {
      springen(wahl, i);
    } else if (wahl >= 0) {
      b.classList.remove('nein');
      void b.offsetWidth;
      b.classList.add('nein');
    }
  });
  $('undo').onclick = () => {
    if (!verlauf.length || laeuft) return;
    brett = verlauf.pop();
    wahl = -1;
    if (vorbei) { vorbei = false; $('overlay').hidden = true; hs.hide(); start = Date.now() - sekunden() * 1000; uhr = setInterval(tick, 500); }
    zeichnen();
  };
  $('newGame').onclick = neu;
  $('ovBtn').onclick = neu;
  document.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('undo').click(); }
    if (e.key === 'Escape' && wahl >= 0) { wahl = -1; zeichnen(); }
  });
  neu();
})();
