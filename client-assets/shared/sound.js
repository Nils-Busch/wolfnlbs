// Kleine Geräusche für Bildschirm-Ansichten (Fernseher), komplett synthetisch über
// WebAudio – keine Dateien, nichts wird nachgeladen. Abschaltbar über den Knopf
// unten rechts; die Wahl merkt sich der Browser.
//   VH.sound.play('pop' | 'ding' | 'fail' | 'roll' | 'shake' | 'tick' | 'start' | 'reveal' | 'fanfare' | 'gong')
(function () {
  'use strict';
  const KEY = 'vh-sound';
  let ctx = null;
  let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function audio() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // Ton mit Hüllkurve: f = Frequenz (Hz), t = Start (s), d = Dauer (s)
  function tone(f, t, d, { type = 'sine', vol = 0.18, slide = 0 } = {}) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    const t0 = a.currentTime + t;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  }
  function noise(t, d, vol = 0.12, hp = 1200) {
    const a = audio();
    if (!a) return;
    const len = Math.floor(a.sampleRate * d);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start(a.currentTime + t);
  }
  const SOUNDS = {
    pop: () => tone(660, 0, 0.12, { type: 'triangle', slide: 440 }),
    tick: () => tone(1200, 0, 0.05, { type: 'square', vol: 0.05 }),
    ding: () => { tone(988, 0, 0.5, { vol: 0.16 }); tone(1319, 0.08, 0.6, { vol: 0.12 }); },
    fail: () => { tone(330, 0, 0.22, { type: 'sawtooth', vol: 0.08, slide: -120 }); tone(220, 0.2, 0.35, { type: 'sawtooth', vol: 0.08, slide: -80 }); },
    roll: () => { for (let i = 0; i < 7; i++) noise(i * 0.06, 0.05, 0.09, 2500); },
    shake: () => { for (let i = 0; i < 5; i++) noise(i * 0.09, 0.07, 0.08, 900); },
    start: () => { tone(523, 0, 0.14, { type: 'triangle' }); tone(784, 0.11, 0.22, { type: 'triangle' }); },
    reveal: () => { tone(392, 0, 0.12, { type: 'triangle' }); tone(523, 0.1, 0.12, { type: 'triangle' }); tone(659, 0.2, 0.3, { type: 'triangle' }); },
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, i === 3 ? 0.8 : 0.2, { type: 'triangle', vol: 0.15 })); tone(784, 0.52, 0.8, { vol: 0.08 }); },
    gong: () => { tone(196, 0, 1.6, { vol: 0.22 }); tone(392, 0, 1.2, { vol: 0.08 }); tone(587, 0.02, 0.9, { vol: 0.04 }); },
  };
  function play(name) {
    if (!on || reduced() || document.visibilityState !== 'visible') return;
    try { SOUNDS[name] && SOUNDS[name](); } catch {}
  }
  function setOn(v) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {}
    if (v) { audio(); play('pop'); }
    btn && (btn.textContent = v ? '🔊' : '🔇', btn.setAttribute('aria-pressed', String(v)), btn.title = v ? 'Geräusche aus' : 'Geräusche an');
  }
  let btn = null;
  // Knopf zum Ein- und Ausschalten; Browser erlauben Ton erst nach einem Klick auf der Seite
  function toggleButton() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vh-sound-btn';
    btn.onclick = () => setOn(!on);
    setOn(on);
    document.body.appendChild(btn);
    document.addEventListener('pointerdown', () => on && audio(), { once: true });
    return btn;
  }
  window.VH = Object.assign(window.VH || {}, { sound: { play, toggleButton, get on() { return on; }, set: setOn } });
})();
