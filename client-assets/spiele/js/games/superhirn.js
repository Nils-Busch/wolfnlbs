// Superhirn: vier versteckte Farben in höchstens zehn Versuchen finden.
// Bestenliste: Versuche × 10000 + Sekunden (weniger ist besser).
(() => {
  'use strict';
  const { superhirn: R } = SoloRegeln;
  const $ = (id) => document.getElementById(id);
  const FARBEN = [
    { name: 'Rot', c: '#e23b3b' }, { name: 'Blau', c: '#2d6be0' }, { name: 'Gelb', c: '#f2b705' },
    { name: 'Grün', c: '#179e5e' }, { name: 'Lila', c: '#8a5cf0' }, { name: 'Orange', c: '#f08a24' },
  ];
  // kleine weiße Zeichen in den Stiften, damit man die Farben auch ohne Farbsehen unterscheidet
  const ZEICHEN = [
    '<circle cx="12" cy="12" r="3.2"/>',
    '<path d="M12 7.5l4.5 8h-9z"/>',
    '<rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    '<path d="M12 7l5 5-5 5-5-5z"/>',
    '<circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" stroke-width="2"/>',
    '<path d="M10.5 7h3v3.5H17v3h-3.5V17h-3v-3.5H7v-3h3.5z"/>',
  ];
  const stift = (f) => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${FARBEN[f].c}"/><g fill="#fff" opacity=".55">${ZEICHEN[f]}</g></svg>`;
  const zeit = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const format = (score) => `${Math.floor(score / 10000)} Versuche, ${zeit(score % 10000)}`;
  const hs = Scores.panel($('scores'), 'superhirn', { title: 'Bestenliste', fmt: format });

  let code, versuche, aktuell, start, uhr, vorbei;

  function sekunden() { return start ? Math.min(9999, Math.floor((Date.now() - start) / 1000)) : 0; }
  function tick() { $('time').textContent = zeit(sekunden()); }

  function neu() {
    code = R.code();
    versuche = [];
    aktuell = [null, null, null, null];
    start = null;
    vorbei = false;
    clearInterval(uhr);
    $('overlay').hidden = true;
    hs.hide();
    tick();
    zeichnen();
  }

  function zeichnen() {
    const rows = [];
    for (let r = 0; r < R.VERSUCHE; r++) {
      const v = versuche[r];
      const istAktuell = !vorbei && r === versuche.length;
      const loecher = (v ? v.tipp : istAktuell ? aktuell : [null, null, null, null]).map((f, i) => {
        const inhalt = f == null ? '' : stift(f);
        if (istAktuell) return `<button type="button" class="mm-loch${f == null ? '' : ' voll'}" data-loch="${i}" aria-label="Stelle ${i + 1}: ${f == null ? 'leer' : FARBEN[f].name}">${inhalt}</button>`;
        return `<span class="mm-loch${f == null ? '' : ' voll'}">${inhalt}</span>`;
      }).join('');
      let pins = '';
      if (v) {
        const p = [...Array(v.fb.schwarz).fill('s'), ...Array(v.fb.weiss).fill('w')];
        while (p.length < 4) p.push('');
        pins = p.map((k, i) => `<i class="${k}" style="--i:${i}"></i>`).join('');
      } else pins = '<i></i><i></i><i></i><i></i>';
      const label = v ? `Versuch ${r + 1}: ${v.fb.schwarz} schwarz, ${v.fb.weiss} weiß` : `Versuch ${r + 1}`;
      rows.push(`<li class="mm-reihe${istAktuell ? ' aktiv' : ''}${v ? ' fertig' : ''}" aria-label="${label}"><span class="mm-nr">${r + 1}</span><span class="mm-loecher">${loecher}</span><span class="mm-pins">${pins}</span></li>`);
    }
    $('board').innerHTML = rows.join('');
    $('try').textContent = `${Math.min(versuche.length + 1, R.VERSUCHE)} / ${R.VERSUCHE}`;
    $('check').disabled = vorbei || aktuell.some((f) => f == null);
    $('back').disabled = vorbei || aktuell.every((f) => f == null);
    document.querySelectorAll('#palette button').forEach((b) => (b.disabled = vorbei));
  }

  function setzen(f) {
    if (vorbei) return;
    const i = aktuell.indexOf(null);
    if (i < 0) return;
    if (!start) { start = Date.now(); uhr = setInterval(tick, 500); }
    aktuell[i] = f;
    zeichnen();
    const loch = document.querySelector(`.mm-reihe.aktiv [data-loch="${i}"]`);
    if (loch) loch.classList.add('neu');
    if (window.VH && VH.sound) VH.sound.play('pop');
  }

  function wegnehmen(i) {
    if (vorbei) return;
    if (i == null) { for (let k = 3; k >= 0; k--) if (aktuell[k] != null) { i = k; break; } }
    if (i == null || aktuell[i] == null) return;
    aktuell[i] = null;
    zeichnen();
  }

  function pruefen() {
    if (vorbei || aktuell.some((f) => f == null)) return;
    const fb = R.bewerten(code, aktuell);
    versuche.push({ tipp: aktuell.slice(), fb });
    aktuell = [null, null, null, null];
    const geknackt = fb.schwarz === 4;
    if (geknackt || versuche.length >= R.VERSUCHE) {
      vorbei = true;
      clearInterval(uhr);
      tick();
    }
    zeichnen();
    if (geknackt) ende(true);
    else if (vorbei) ende(false);
  }

  function ende(gewonnen) {
    const s = sekunden();
    $('ovCode').innerHTML = code.map((f) => `<span class="mm-loch voll">${stift(f)}</span>`).join('');
    $('ovText').textContent = gewonnen
      ? `Geknackt mit ${versuche.length} ${versuche.length === 1 ? 'Versuch' : 'Versuchen'} in ${zeit(s)}!`
      : 'Leider nicht geknackt. Der Code war:';
    setTimeout(() => {
      $('overlay').hidden = false;
      if (gewonnen) {
        if (window.VH) VH.confetti();
        hs.offer(versuche.length * 10000 + s);
      }
    }, 650);
  }

  $('palette').innerHTML = FARBEN.map((f, i) => `<button type="button" data-f="${i}" aria-label="${f.name} (Taste ${i + 1})">${stift(i)}</button>`).join('');
  $('palette').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) setzen(+b.dataset.f);
  });
  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('[data-loch]');
    if (b) wegnehmen(+b.dataset.loch);
  });
  $('check').onclick = pruefen;
  $('back').onclick = () => wegnehmen();
  $('newGame').onclick = neu;
  $('ovBtn').onclick = neu;
  document.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    if (e.key >= '1' && e.key <= '6') setzen(+e.key - 1);
    else if (e.key === 'Backspace') { e.preventDefault(); wegnehmen(); }
    else if (e.key === 'Enter') pruefen();
  });
  neu();
})();
