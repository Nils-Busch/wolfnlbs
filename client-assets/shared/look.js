/*
 * Aussehen: Auswahl-Feld für Farbthema, Schrift, Schriftgröße und Animationen.
 * Wird bei Bedarf nachgeladen – vom Pinsel-Knopf in der Kopfzeile (pwa.js)
 * und auf der Konto-Seite (Reiter „Aussehen“). Die eigentliche Arbeit macht
 * /shared/theme.js (window.VHLook).
 */
(function () {
  'use strict';
  if (window.VHLookUI || !window.VHLook) return;
  var L = window.VHLook;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var GROUPS = [
    ['night', 'Abends', [['off', 'Thema behalten'], ['auto', 'Wie das Gerät']]],
    ['font', 'Schrift', [['play', 'Verspielt'], ['calm', 'Schlicht']]],
    ['size', 'Schriftgröße', [['m', 'Normal'], ['l', 'Groß']]],
    ['motion', 'Animationen', [['full', 'Alle'], ['less', 'Weniger']]],
  ];
  var boxes = [];

  function html(withTitle) {
    var p = L.get();
    var themes = Object.keys(L.THEMES).map(function (id) {
      var t = L.THEMES[id];
      return '<button type="button" class="vh-look-theme" data-look-theme="' + id + '" aria-pressed="' + (p.theme === id) + '">' +
        '<span class="sw" aria-hidden="true">' + t.swatch.map(function (c, i) { return '<i style="background:' + c + ';flex:' + (i < 2 ? 2 : 1) + '"></i>'; }).join('') + '</span>' +
        '<b>' + esc(t.name) + '</b><small>' + esc(t.hint) + '</small></button>';
    }).join('');
    var groups = GROUPS.map(function (g) {
      return '<div class="vh-look-row"><span class="lbl" id="vl-' + g[0] + '">' + g[1] + '</span><div class="vh-look-seg" role="group" aria-labelledby="vl-' + g[0] + '">' +
        g[2].map(function (o) { return '<button type="button" data-look-key="' + g[0] + '" data-look-val="' + o[0] + '" aria-pressed="' + (p[g[0]] === o[0]) + '">' + o[1] + '</button>'; }).join('') +
        '</div></div>';
    }).join('');
    return (withTitle ? '<p class="vh-look-title">Aussehen</p>' : '') +
      '<div class="vh-look-themes" role="group" aria-label="Farbthema">' + themes + '</div>' + groups +
      '<p class="vh-look-note">' + (L.account ? 'Gilt auf allen Geräten, mit denen du angemeldet bist.' : 'Gilt auf diesem Gerät. Mit Konto auf allen Geräten.') + '</p>';
  }

  // Neu zeichnen, ohne dass der Tastatur-Fokus verloren geht
  function draw(box) {
    var f = document.activeElement;
    var sel = null;
    if (f && box.contains(f)) {
      sel = f.hasAttribute('data-look-theme')
        ? '[data-look-theme="' + f.getAttribute('data-look-theme') + '"]'
        : '[data-look-key="' + f.getAttribute('data-look-key') + '"][data-look-val="' + f.getAttribute('data-look-val') + '"]';
    }
    box.innerHTML = html(box.classList.contains('vh-look-pop'));
    if (sel) { var n = box.querySelector(sel); if (n) n.focus(); }
  }
  L.onChange(function () {
    boxes = boxes.filter(function (b) { return b.isConnected; });
    boxes.forEach(draw);
  });

  function attach(box) {
    box.classList.add('vh-look');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-look-theme],[data-look-key]');
      if (!b) return;
      if (b.hasAttribute('data-look-theme')) return L.set({ theme: b.getAttribute('data-look-theme') });
      var o = {};
      o[b.getAttribute('data-look-key')] = b.getAttribute('data-look-val');
      L.set(o);
    });
    boxes.push(box);
    draw(box);
    return box;
  }

  /** Auswahl in ein Element zeichnen (Konto-Seite). */
  function panel(el) {
    return attach(el);
  }

  /** Aufklapp-Feld unter dem Knopf in der Kopfzeile. */
  var pop = null;
  var btnRef = null;
  function close() {
    if (!pop) return;
    if (btnRef) btnRef.setAttribute('aria-expanded', 'false');
    pop.remove();
    pop = null;
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  }
  function outside(e) {
    if (pop && !pop.contains(e.target) && !(btnRef && btnRef.contains(e.target))) close();
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    close();
    if (btnRef) btnRef.focus();
  }
  function toggle(btn) {
    if (pop) return close();
    btnRef = btn;
    pop = document.createElement('div');
    pop.className = 'vh-look-pop';
    pop.id = 'vhLookPop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Aussehen');
    document.body.appendChild(pop);
    attach(pop);
    var r = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var w = pop.offsetWidth;
    pop.style.top = Math.round(r.bottom + window.scrollY + 8) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(8, r.right - w), vw - w - 8) + window.scrollX) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', 'vhLookPop');
    setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
    document.addEventListener('keydown', onKey);
    var first = pop.querySelector('[aria-pressed="true"]');
    if (first) first.focus({ preventScroll: true });
  }

  window.VHLookUI = { panel: panel, toggle: toggle, close: close };
})();
