// Spielegalerie: Rekorde aus der Bestenliste und die Auswahl
// „Wie viele seid ihr?“, die nur die passenden Spiele stehen lässt.
(function () {
  'use strict';

  // Rekord je Einzelspiel
  document.querySelectorAll('.g[data-game]').forEach(async (a) => {
    try {
      const list = await (await fetch('/api/spiele/scores/' + a.dataset.game)).json();
      if (!list.length) return;
      const top = list[0];
      a.querySelector('.g-rec').textContent = `Rekord ${Number(top.score).toLocaleString('de-DE')} ${a.dataset.unit || 'Pkt.'}, ${top.name}`;
    } catch {}
  });

  const chips = [...document.querySelectorAll('.stein')];
  const out = document.querySelector('.gal-filter-out');
  const items = [...document.querySelectorAll('.gal-list li')];
  const sections = [...document.querySelectorAll('.gal-sec')];
  if (!chips.length || !out) return;
  const intro = out.textContent;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Jede Karte bekommt einen eigenen Namen, damit sie beim Filtern an ihren neuen Platz gleitet
  items.forEach((li, i) => { li.style.viewTransitionName = 'spiel-' + i; });

  function who(from, to) {
    if (from === 1 && to === 1) return 'dich allein';
    if (from === to) return `${from} Personen`;
    if (to >= 30) return `${from} oder mehr Personen`;
    return `${from} bis ${to} Personen`;
  }

  function apply(chip) {
    const on = chip && chip.getAttribute('aria-pressed') !== 'true';
    chips.forEach((c) => c.setAttribute('aria-pressed', String(on && c === chip)));
    let shown = 0;
    const from = on ? +chip.dataset.from : 0, to = on ? +chip.dataset.to : 0;
    items.forEach((li) => {
      const fits = !on || (+li.dataset.min <= from && +li.dataset.max >= to);
      li.hidden = !fits;
      if (fits) shown++;
    });
    sections.forEach((s) => { s.hidden = !s.querySelector('li:not([hidden])'); });
    out.textContent = on ? `${shown} ${shown === 1 ? 'Spiel passt' : 'Spiele passen'} für ${who(from, to)}.` : intro;
  }

  chips.forEach((chip) => chip.addEventListener('click', () => {
    if (document.startViewTransition && !reduced) document.startViewTransition(() => apply(chip));
    else apply(chip);
  }));
})();
