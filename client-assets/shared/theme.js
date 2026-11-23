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
 *   --vh-*    Wand, Flächen und Schrift der normalen Seiten, die Filztafel
 *   --vh-g-*  die Spieltische (Spielseiten, Gruppenspiele, Rätsel)
 * Farben, die zum Spiel gehören (Spielsteine, Würfel, Karten), bleiben gleich.
 */
(function () {
  'use strict';
  var KEY = 'vh-look';
  var root = document.documentElement;

  // Felder je Thema: Wand (--vh-board), helle Flächen, Schrift, Linien, die Filztafel
  // (--vh-table) und die Spieltische der Spielseiten (--vh-g-*). Die Grundwerte
  // („Vereinsheim“) stehen in vereinsheim.css und spiele/css/style.css.
  var THEMES = {
    vereinsheim: { name: 'Vereinsheim', hint: 'Salbei und Filz', meta: '#e6ebe3', swatch: ['#e6ebe3', '#203029', '#17694a'], vars: {} },
    nacht: {
      name: 'Nachtschicht', hint: 'Dunkel', dark: true, meta: '#141c18', swatch: ['#141c18', '#1c2722', '#f2c230'],
      vars: {
        '--vh-board': '#141c18', '--vh-surface': '#1c2722', '--vh-surface-2': '#25332c', '--vh-ink': '#e6ece6',
        '--vh-ink-soft': '#9db0a4', '--vh-line': '#2d3d35', '--vh-line-strong': '#42574b', '--vh-table': '#0d1411',
        '--vh-table-2': '#18231d', '--vh-letter': '#e9e6da', '--vh-shadow': 'rgba(0, 0, 0, .5)', '--vh-edge': '#070b09',
        '--vh-g-bg': '#121a16', '--vh-g-panel': '#1b2620', '--vh-g-panel2': '#24322b', '--vh-g-line': '#33463c',
        '--vh-g-input': '#0f1612', '--vh-g-edge': '#070b09', '--vh-g-muted': '#95a99c',
      },
    },
    // Die Kennung „filz“ bleibt (gespeicherte Einstellungen), das Thema heißt jetzt Turnhalle
    filz: {
      name: 'Turnhalle', hint: 'Blau und kühl', meta: '#e5eaf0', swatch: ['#e5eaf0', '#1b2638', '#24529f'],
      vars: {
        '--vh-board': '#e5eaf0', '--vh-surface': '#f7f9fb', '--vh-surface-2': '#dde3ea', '--vh-ink': '#141c26',
        '--vh-ink-soft': '#536173', '--vh-line': '#cbd3dd', '--vh-line-strong': '#a7b2c0', '--vh-table': '#1d2a3e',
        '--vh-table-2': '#26354d', '--vh-letter': '#eef1f6', '--vh-shadow': 'rgba(20, 28, 38, .18)', '--vh-edge': '#0e1522',
        '--vh-club': '#24529f',
        '--vh-g-bg': '#1b2638', '--vh-g-panel': '#243149', '--vh-g-panel2': '#2d3b56', '--vh-g-line': '#3a4a68',
        '--vh-g-input': '#172133', '--vh-g-edge': '#0e1522', '--vh-g-muted': '#a3aec4',
      },
    },
    bonbon: {
      name: 'Bonbon', hint: 'Bunt', meta: '#f7eef6', swatch: ['#f7eef6', '#3d1d4b', '#d6457c'],
      vars: {
        '--vh-board': '#f7eef6', '--vh-surface': '#fffafd', '--vh-surface-2': '#f0e1ee', '--vh-ink': '#2b1530',
        '--vh-ink-soft': '#6e5374', '--vh-line': '#ead6e6', '--vh-line-strong': '#d4b5cf', '--vh-table': '#4a2259',
        '--vh-table-2': '#5a2c6b', '--vh-letter': '#fbeef8', '--vh-shadow': 'rgba(74, 34, 89, .2)', '--vh-edge': '#220e2c',
        '--vh-club': '#b8336a',
        '--vh-g-bg': '#3d1d4b', '--vh-g-panel': '#4b2759', '--vh-g-panel2': '#5a3169', '--vh-g-line': '#6d4280',
        '--vh-g-input': '#341842', '--vh-g-edge': '#220e2c', '--vh-g-muted': '#dcc6e4',
      },
    },
    kontrast: {
      name: 'Kontrast', hint: 'Gut lesbar', meta: '#ffffff', swatch: ['#ffffff', '#000000', '#0040c0'],
      vars: {
        '--vh-board': '#ffffff', '--vh-surface': '#ffffff', '--vh-surface-2': '#ececec', '--vh-ink': '#000000',
        '--vh-ink-soft': '#1f1f1f', '--vh-line': '#000000', '--vh-line-strong': '#000000', '--vh-table': '#000000',
        '--vh-table-2': '#1c1c1c', '--vh-letter': '#ffffff', '--vh-shadow': 'rgba(0, 0, 0, .35)', '--vh-edge': '#000000',
        '--vh-club': '#0040c0',
        '--vh-g-bg': '#000000', '--vh-g-panel': '#141414', '--vh-g-panel2': '#262626', '--vh-g-line': '#8c8c8c',
        '--vh-g-input': '#0d0d0d', '--vh-g-edge': '#000000', '--vh-g-muted': '#e6e6e6', '--vh-g-text': '#ffffff',
      },
    },
  };
  var OPTIONS = {
    theme: Object.keys(THEMES),
    night: ['off', 'auto'],   // abends: Thema behalten oder dem Gerät folgen (dunkel = Nachtschicht)
    font: ['play', 'calm'],   // schmal (Barlow Condensed) oder breit (Barlow) für Überschriften
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
      vars['--vh-display'] = '"Barlow", system-ui, -apple-system, "Segoe UI", sans-serif';
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
