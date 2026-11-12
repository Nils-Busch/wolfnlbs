/*
 * Aussehen (Design-Auswahl): Farbthema, Schrift, Schriftgröße, Animationen.
 *
 * Wird auf jeder Seite ganz oben im <head> geladen – ohne defer, damit die
 * Seite gleich im gewählten Aussehen erscheint und nichts kurz aufblitzt.
 * Die Wahl liegt im Browser (localStorage "vh-look"); mit Konto wird sie
 * zusätzlich am Konto gespeichert und gilt dann auf allen Geräten
 * (Abgleich über /shared/account-link.js, Speichern über PUT /api/konto/prefs).
 *
 * Ein Thema setzt nur CSS-Variablen am <html>-Element:
 *   --vh-*    Flächen und Schrift der normalen Seiten („Brett“ und „Tisch“)
 *   --vh-g-*  die dunklen Spielflächen (Spielegalerie, Gruppenspiele, Rätsel)
 * Farben, die zum Spiel gehören (Spielsteine, Würfel, Karten), bleiben gleich.
 */
(function () {
  'use strict';
  var KEY = 'vh-look';
  var root = document.documentElement;

  var THEMES = {
    vereinsheim: { name: 'Vereinsheim', hint: 'Wie gewohnt', meta: '#172036', swatch: ['#172036', '#f5f6f8', '#2d6be0'], vars: {} },
    nacht: {
      name: 'Nachtschicht', hint: 'Dunkel', dark: true, meta: '#0a0f1e', swatch: ['#0a0f1e', '#182038', '#5b8cff'],
      vars: {
        '--vh-table': '#0a0f1e', '--vh-table-2': '#161e36', '--vh-board': '#0f1528', '--vh-surface': '#182038',
        '--vh-surface-2': '#222b47', '--vh-ink': '#e7ebf5', '--vh-ink-soft': '#9ba5bf', '--vh-line': '#2a3453',
        '--vh-line-strong': '#3c4870', '--vh-shadow': 'rgba(0, 0, 0, .5)', '--vh-edge': '#05080f',
        '--vh-g-bg': '#0a0f1e', '--vh-g-panel': '#151c33', '--vh-g-panel2': '#1f2843', '--vh-g-line': '#2b3556',
        '--vh-g-input': '#111830', '--vh-g-edge': '#05080f', '--vh-g-muted': '#9aa3bd',
      },
    },
    filz: {
      name: 'Filztisch', hint: 'Grün und ruhig', meta: '#12482b', swatch: ['#12482b', '#eef3ec', '#179e5e'],
      vars: {
        '--vh-table': '#12482b', '--vh-table-2': '#1b5c38', '--vh-board': '#eef3ec', '--vh-surface': '#ffffff',
        '--vh-surface-2': '#e1eadf', '--vh-ink': '#102a1b', '--vh-ink-soft': '#4c6656', '--vh-line': '#d0ddd2',
        '--vh-line-strong': '#afc2b4', '--vh-shadow': 'rgba(16, 48, 28, .18)', '--vh-edge': '#0a2a18',
        '--vh-g-bg': '#12482b', '--vh-g-panel': '#1a5a36', '--vh-g-panel2': '#216b41', '--vh-g-line': '#2f7a50',
        '--vh-g-input': '#154f30', '--vh-g-edge': '#0a2a18', '--vh-g-muted': '#a9c9b5',
      },
    },
    bonbon: {
      name: 'Bonbon', hint: 'Bunt', meta: '#4a2270', swatch: ['#4a2270', '#fbf4ff', '#e0457b'],
      vars: {
        '--vh-table': '#4a2270', '--vh-table-2': '#5b2d86', '--vh-board': '#fbf4ff', '--vh-surface': '#ffffff',
        '--vh-surface-2': '#f1e4fa', '--vh-ink': '#2a1540', '--vh-ink-soft': '#6c5884', '--vh-line': '#e9d8f5',
        '--vh-line-strong': '#d1b8e6', '--vh-shadow': 'rgba(74, 34, 112, .2)', '--vh-edge': '#2a0f44',
        '--vh-g-bg': '#3f1d60', '--vh-g-panel': '#4f2775', '--vh-g-panel2': '#5e3189', '--vh-g-line': '#7042a2',
        '--vh-g-input': '#46216a', '--vh-g-edge': '#26103c', '--vh-g-muted': '#d6c4ea',
      },
    },
    kontrast: {
      name: 'Kontrast', hint: 'Gut lesbar', meta: '#000000', swatch: ['#000000', '#ffffff', '#0040c0'],
      vars: {
        '--vh-table': '#000000', '--vh-table-2': '#1c1c1c', '--vh-board': '#ffffff', '--vh-surface': '#ffffff',
        '--vh-surface-2': '#ececec', '--vh-ink': '#000000', '--vh-ink-soft': '#262626', '--vh-line': '#000000',
        '--vh-line-strong': '#000000', '--vh-shadow': 'rgba(0, 0, 0, .35)', '--vh-edge': '#000000',
        '--vh-g-bg': '#000000', '--vh-g-panel': '#141414', '--vh-g-panel2': '#262626', '--vh-g-line': '#8c8c8c',
        '--vh-g-input': '#0d0d0d', '--vh-g-edge': '#000000', '--vh-g-muted': '#e6e6e6', '--vh-g-text': '#ffffff',
      },
    },
  };
  var OPTIONS = {
    theme: Object.keys(THEMES),
    night: ['off', 'auto'],   // abends: Thema behalten oder dem Gerät folgen (dunkel = Nachtschicht)
    font: ['play', 'calm'],   // verspielt (Bricolage Grotesque) oder schlicht (Figtree)
    size: ['m', 'l'],         // normal oder groß
    motion: ['full', 'less'], // alle Animationen oder weniger
  };
  var DEFAULTS = { theme: 'vereinsheim', night: 'off', font: 'play', size: 'm', motion: 'full' };

  function clean(p) {
    var out = {};
    for (var k in DEFAULTS) out[k] = p && OPTIONS[k].indexOf(p[k]) >= 0 ? p[k] : DEFAULTS[k];
    return out;
  }
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  var prefs = clean(read());
  var mm = window.matchMedia ? window.matchMedia.bind(window) : null;
  var darkMq = mm ? mm('(prefers-color-scheme: dark)') : null;
  var setVars = [];
  var listeners = [];

  // „Weniger Animationen“: Skripte fragen prefers-reduced-motion ab – die Antwort
  // passen wir an, damit Konfetti, Würfelrollen & Co. überall still bleiben.
  if (mm) {
    window.matchMedia = function (q) {
      if (prefs.motion === 'less' && /prefers-reduced-motion\s*:\s*reduce/.test(String(q))) {
        var fake = { matches: true, media: String(q), onchange: null };
        fake.addListener = fake.removeListener = fake.addEventListener = fake.removeEventListener = function () {};
        fake.dispatchEvent = function () { return false; };
        return fake;
      }
      return mm(q);
    };
  }

  var MOTION_CSS = '*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}' +
    '::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}.vh-confetti{display:none!important}';

  function themeId() {
    return prefs.night === 'auto' && darkMq && darkMq.matches ? 'nacht' : prefs.theme;
  }
  function apply() {
    var id = themeId();
    var t = THEMES[id];
    setVars.forEach(function (k) { root.style.removeProperty(k); });
    setVars = [];
    var vars = Object.assign({}, t.vars);
    if (prefs.font === 'calm') {
      vars['--vh-display'] = '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif';
      vars['--vh-g-display'] = vars['--vh-display'];
    }
    Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); setVars.push(k); });
    root.setAttribute('data-theme', id);
    root.setAttribute('data-font', prefs.font);
    root.setAttribute('data-motion', prefs.motion);
    root.setAttribute('data-size', prefs.size);
    root.style.fontSize = prefs.size === 'l' ? '112.5%' : '';
    root.style.colorScheme = t.dark ? 'dark' : '';
    var st = document.getElementById('vh-look-css');
    if (prefs.motion === 'less') {
      if (!st) {
        st = document.createElement('style');
        st.id = 'vh-look-css';
        (document.head || root).appendChild(st);
      }
      st.textContent = MOTION_CSS;
    } else if (st) st.textContent = '';
    metaColor();
  }
  function metaColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) return;
    if (!m.hasAttribute('data-orig')) m.setAttribute('data-orig', m.getAttribute('content') || '');
    var id = themeId();
    m.setAttribute('content', id === 'vereinsheim' ? m.getAttribute('data-orig') : THEMES[id].meta);
  }

  function push() {
    if (!api.account) return;
    try {
      fetch('/api/konto/prefs', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ look: prefs }),
      }).catch(function () {});
    } catch (e) {}
  }
  function changed() {
    write();
    apply();
    listeners.forEach(function (fn) { try { fn(api.get()); } catch (e) {} });
  }

  var api = {
    THEMES: THEMES,
    OPTIONS: OPTIONS,
    DEFAULTS: DEFAULTS,
    account: false,
    get: function () { return Object.assign({}, prefs); },
    current: themeId,
    /** Einstellung ändern (z. B. { theme: 'nacht' }); mit Konto auch dort speichern. */
    set: function (next) {
      prefs = clean(Object.assign({}, prefs, next));
      changed();
      push();
    },
    /** Stand vom Konto übernehmen (nach dem Anmelden bzw. auf einem neuen Gerät). */
    sync: function (server) {
      api.account = true;
      if (!server) {
        // Noch nichts am Konto gespeichert: die Wahl dieses Geräts mitnehmen
        if (JSON.stringify(prefs) !== JSON.stringify(DEFAULTS)) push();
        return;
      }
      var c = clean(server);
      if (JSON.stringify(c) === JSON.stringify(prefs)) return;
      prefs = c;
      changed();
    },
    onChange: function (fn) { listeners.push(fn); },
  };
  window.VHLook = api;

  apply();
  if (darkMq) {
    var re = function () { if (prefs.night === 'auto') changed(); };
    if (darkMq.addEventListener) darkMq.addEventListener('change', re); else if (darkMq.addListener) darkMq.addListener(re);
  }
  document.addEventListener('DOMContentLoaded', metaColor);
  // Andere Tabs: Änderungen sofort übernehmen
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    prefs = clean(read());
    apply();
    listeners.forEach(function (fn) { try { fn(api.get()); } catch (er) {} });
  });
})();
