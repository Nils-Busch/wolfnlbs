/**
 * Städteraten: Wo liegt die Stadt? Auf die Deutschlandkarte tippen, Entfernung
 * in Kilometern ergibt Punkte (bis 1000 pro Stadt).
 *   Tageskarte – 5 Städte, für alle gleich, Tagesbestenliste
 *   Freies Spiel – 5 zufällige Städte, so oft man will
 *   Gegen den Computer – der Computer tippt mit, mal näher, mal weiter weg
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, store } = Daily;
  const D = window.STAEDTE;
  const START = '2026-10-26'; // Rätsel #1
  const ROUNDS = 5;
  const TIERS = [1, 2, 3, 3, 4];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const LEVELS = { easy: { label: 'Leicht', km: 110 }, medium: { label: 'Mittel', km: 55 }, hard: { label: 'Schwer', km: 24 } };

  /* ---------- Geometrie ---------- */
  const M = D.map;
  const toXY = (lat, lon) => [M.pad + (lon - M.lon0) * M.cos * M.k, M.pad + (M.lat1 - lat) * M.k];
  const fromXY = (x, y) => [M.lat1 - (y - M.pad) / M.k, M.lon0 + (x - M.pad) / (M.cos * M.k)];
  function km(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  const points = (d) => (d <= 5 ? 1000 : Math.round(1000 * Math.exp(-(d - 5) / 130)));
  const fmtKm = (d) => (d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d).toLocaleString('de-DE')) + ' km';
  const fmtPts = (p) => p.toLocaleString('de-DE');
  const square = (p) => (p >= 800 ? '🟩' : p >= 500 ? '🟨' : p >= 250 ? '🟧' : '🟥');

  /* ---------- Städte wählen ---------- */
  function pickCities(rand) {
    const used = new Set();
    return TIERS.map((t) => {
      const pool = D.cities.filter((c) => c[4] === t && !used.has(c[0]));
      const c = pool[Math.floor(rand() * pool.length)];
      used.add(c[0]);
      return { name: c[0], lat: c[1], lon: c[2], state: D.states[c[3]].name, stateIdx: c[3] };
    });
  }

  /* ---------- Zustand ---------- */
  const today = Daily.today();
  const num = Daily.number(START, today);
  let mode = 'daily';
  let level = store.get('st-level') || 'medium';
  let G = null;    // { cities, round, guesses: [{lat,lon,dist,pts}], cpu: [...], pin, phase }

  function newGame(m) {
    mode = m;
    if (m === 'daily') {
      const saved = store.get('staedte-day');
      const cities = pickCities(Daily.rng('staedte-' + today));
      if (saved && saved.date === today) {
        G = { cities, round: saved.guesses.length, guesses: saved.guesses, cpu: null, pin: null, phase: saved.guesses.length >= ROUNDS ? 'end' : 'guess', submitted: saved.submitted };
        if (G.phase === 'end') recordStats();
      } else {
        G = { cities, round: 0, guesses: [], cpu: null, pin: null, phase: 'guess' };
      }
    } else {
      G = { cities: pickCities(Math.random), round: 0, guesses: [], cpu: m === 'cpu' ? [] : null, pin: null, phase: 'guess' };
    }
    render();
  }

  function saveDaily() {
    if (mode !== 'daily') return;
    store.set('staedte-day', { date: today, guesses: G.guesses, submitted: G.submitted || null });
  }

  function recordStats() {
    if (mode !== 'daily') return;
    const st = store.get('staedte-stats') || { played: 0, best: 0, total: 0, last: null, streak: 0 };
    if (st.lastCounted === today) return;
    const sum = G.guesses.reduce((s, g) => s + g.pts, 0);
    st.played++;
    st.total += sum;
    st.best = Math.max(st.best, sum);
    st.streak = st.last && Daily.number(st.last, today) === 2 ? st.streak + 1 : 1;
    st.last = today;
    st.lastCounted = today;
    store.set('staedte-stats', st);
  }

  /* ---------- Karte ---------- */
  let svg, layer;
  function buildMap() {
    svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${M.w} ${M.h}`);
    svg.setAttribute('class', 'st-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Deutschlandkarte – tippe, wo die Stadt liegt');
    svg.innerHTML = D.states.map((s, i) => `<path class="st-land" data-i="${i}" d="${s.d}"><title>${esc(s.name)}</title></path>`).join('') +
      '<g class="st-layer"></g>';
    layer = svg.querySelector('.st-layer');
    svg.addEventListener('click', onMapClick);
    $('map').appendChild(svg);
  }
  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function onMapClick(evt) {
    if (!G || G.phase !== 'guess') return;
    const p = svgPoint(evt);
    if (p.x < 0 || p.y < 0 || p.x > M.w || p.y > M.h) return;
    G.pin = fromXY(p.x, p.y);
    renderMarkers();
    $('guessBtn').disabled = false;
  }
  function el(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  // Kartenausschnitt: zoomt nach dem Tipp auf Nadel und Ziel, danach zurück aufs ganze Land.
  let vb = [0, 0, M.w, M.h];
  let zoomAnim = 0;
  let zoom = 1;
  function fitBox(points) {
    let x0 = Math.min(...points.map((p) => p[0])), x1 = Math.max(...points.map((p) => p[0]));
    let y0 = Math.min(...points.map((p) => p[1])), y1 = Math.max(...points.map((p) => p[1]));
    const pad = 46, aspect = M.w / M.h;
    let w = Math.max(x1 - x0 + pad * 2, 170), h = Math.max(y1 - y0 + pad * 2, 170 / aspect);
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    if (w >= M.w || h >= M.h) return [0, 0, M.w, M.h];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const x = Math.min(Math.max(cx - w / 2, 0), M.w - w), y = Math.min(Math.max(cy - h / 2, 0), M.h - h);
    return [x, y, w, h];
  }
  function zoomTo(target, ms = 750) {
    cancelAnimationFrame(zoomAnim);
    const from = vb.slice();
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const step = (t) => {
      const k = reduced ? 1 : Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      vb = from.map((v, i) => v + (target[i] - v) * e);
      svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
      if (k < 1) zoomAnim = requestAnimationFrame(step);
    };
    zoomAnim = requestAnimationFrame(step);
  }
  function pin(x, y, cls, label) {
    const outer = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1 / zoom).toFixed(3)})` });
    const g = el('g', { class: 'st-pin ' + cls });
    outer.appendChild(g);
    g.appendChild(el('path', { d: 'M0 0 C-3 -7 -9 -10 -9 -17 A9 9 0 1 1 9 -17 C9 -10 3 -7 0 0 Z' }));
    g.appendChild(el('circle', { cx: 0, cy: -17, r: 3.4, class: 'st-pin-dot' }));
    if (label) {
      const t = el('text', { x: 0, y: -31, 'text-anchor': 'middle', class: 'st-pin-label' });
      t.textContent = label;
      g.appendChild(t);
    }
    return outer;
  }
  function renderMarkers() {
    layer.innerHTML = '';
    svg.querySelectorAll('.st-land.hit').forEach((p) => p.classList.remove('hit'));
    if (!G) return;
    const c = G.cities[Math.min(G.round, ROUNDS - 1)];
    // Ausschnitt bestimmen, bevor Nadeln gezeichnet werden (ihre Größe hängt vom Zoom ab)
    let box = [0, 0, M.w, M.h];
    if (G.phase === 'result' && G.guesses[G.round]) {
      const g = G.guesses[G.round], cp = G.cpu && G.cpu[G.round];
      const pts = [toXY(c.lat, c.lon), toXY(g.lat, g.lon)];
      if (cp) pts.push(toXY(cp.lat, cp.lon));
      box = fitBox(pts);
    }
    zoom = M.w / box[2];
    if (box.some((v, i) => Math.abs(v - vb[i]) > 0.5)) zoomTo(box);
    if (G.phase === 'result' || G.phase === 'end') {
      const list = G.phase === 'end' ? G.cities.map((city, i) => ({ city, g: G.guesses[i], cpu: G.cpu && G.cpu[i] })) : [{ city: c, g: G.guesses[G.round], cpu: G.cpu && G.cpu[G.round] }];
      for (const { city, g, cpu } of list) {
        if (!g) continue;
        const [tx, ty] = toXY(city.lat, city.lon);
        const [gx, gy] = toXY(g.lat, g.lon);
        if (G.phase === 'result') svg.querySelector(`.st-land[data-i="${city.stateIdx}"]`).classList.add('hit');
        if (cpu) {
          const [cx, cy] = toXY(cpu.lat, cpu.lon);
          layer.appendChild(el('line', { x1: cx, y1: cy, x2: tx, y2: ty, class: 'st-line cpu' }));
          layer.appendChild(pin(cx, cy, 'cpu'));
        }
        layer.appendChild(el('line', { x1: gx, y1: gy, x2: tx, y2: ty, class: 'st-line' }));
        layer.appendChild(pin(gx, gy, 'you'));
        const star = el('g', { class: 'st-target', transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${(1 / zoom).toFixed(3)})` });
        star.appendChild(el('circle', { r: 7, class: 'st-target-ring' }));
        star.appendChild(el('circle', { r: 3.2 }));
        const t = el('text', { x: 0, y: -12, 'text-anchor': 'middle', class: 'st-target-label' });
        t.textContent = city.name;
        star.appendChild(t);
        layer.appendChild(star);
      }
    } else if (G.pin) {
      const [x, y] = toXY(G.pin[0], G.pin[1]);
      layer.appendChild(pin(x, y, 'you placing'));
    }
  }

  /* ---------- Spielzüge ---------- */
  function cpuGuess(c) {
    const base = LEVELS[level].km * (c.tierHard ? 1.4 : 1);
    // Normalverteilter Fehler in km (Box-Muller), Richtung zufällig
    const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    const dist = Math.abs(g) * base;
    const ang = Math.random() * 2 * Math.PI;
    const lat = c.lat + (dist * Math.cos(ang)) / 111;
    const lon = c.lon + (dist * Math.sin(ang)) / (111 * Math.cos(c.lat * Math.PI / 180));
    const d = km(c.lat, c.lon, lat, lon);
    return { lat, lon, dist: d, pts: points(d) };
  }

  function submitGuess() {
    if (!G || G.phase !== 'guess' || !G.pin) return;
    const c = G.cities[G.round];
    const d = km(c.lat, c.lon, G.pin[0], G.pin[1]);
    G.guesses[G.round] = { lat: +G.pin[0].toFixed(4), lon: +G.pin[1].toFixed(4), dist: d, pts: points(d) };
    if (G.cpu) G.cpu[G.round] = cpuGuess({ ...c, tierHard: G.round === ROUNDS - 1 });
    G.pin = null;
    G.phase = 'result';
    saveDaily();
    render(true);
  }

  function next() {
    if (!G || G.phase !== 'result') return;
    G.round++;
    if (G.round >= ROUNDS) {
      G.phase = 'end';
      recordStats();
      saveDaily();
      const sum = G.guesses.reduce((s, g) => s + g.pts, 0);
      const won = G.cpu ? sum > G.cpu.reduce((s, g) => s + g.pts, 0) : sum >= 3500;
      if (won && window.VH) setTimeout(() => VH.confetti(), 400);
    } else {
      G.phase = 'guess';
    }
    render();
  }

  /* ---------- Anzeige ---------- */
  function total(list) { return (list || []).reduce((s, g) => s + (g ? g.pts : 0), 0); }

  function render(animate = false) {
    document.querySelectorAll('#modes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('cpuLevels').hidden = mode !== 'cpu';
    document.querySelectorAll('#cpuLevels [data-level]').forEach((b) => b.classList.toggle('on', b.dataset.level === level));
    $('stNum').textContent = mode === 'daily' ? `#${num}` : mode === 'cpu' ? 'Duell' : 'Frei';

    const r = Math.min(G.round, ROUNDS - 1);
    const c = G.cities[r];
    $('dots').innerHTML = G.cities.map((_, i) => {
      const g = G.guesses[i];
      const cls = g ? 'done ' + (g.pts >= 800 ? 'g' : g.pts >= 500 ? 'y' : g.pts >= 250 ? 'o' : 'r') : i === G.round ? 'now' : '';
      return `<i class="${cls}" title="Stadt ${i + 1}"></i>`;
    }).join('');
    $('stScore').textContent = fmtPts(total(G.guesses));
    $('stCpu').hidden = !G.cpu;
    if (G.cpu) $('stCpuScore').textContent = fmtPts(total(G.cpu));

    const prompt = $('prompt');
    const act = $('stActions');
    if (G.phase === 'guess') {
      prompt.innerHTML = `<small>Stadt ${G.round + 1} von ${ROUNDS}</small><h2>Wo liegt <span class="st-city">${esc(c.name)}</span>?</h2>`;
      act.innerHTML = `<button id="guessBtn" ${G.pin ? '' : 'disabled'}>Tipp abgeben</button>`;
      $('guessBtn').onclick = submitGuess;
      $('stResult').innerHTML = '<p class="muted">Tippe auf die Karte, um deine Nadel zu setzen. Du kannst sie verschieben, bis du den Tipp abgibst.</p>';
    } else if (G.phase === 'result') {
      const g = G.guesses[G.round];
      const cp = G.cpu && G.cpu[G.round];
      prompt.innerHTML = `<small>Stadt ${G.round + 1} von ${ROUNDS}</small><h2>${esc(c.name)} <span class="st-state">${esc(c.state)}</span></h2>`;
      $('stResult').innerHTML = `
        <div class="st-row you"><span>Du</span><b>${fmtKm(g.dist)}</b><em class="pts" data-pts="${g.pts}">+${fmtPts(animate ? 0 : g.pts)}</em></div>
        ${cp ? `<div class="st-row cpu"><span>Computer</span><b>${fmtKm(cp.dist)}</b><em>+${fmtPts(cp.pts)}</em></div>` : ''}
        ${g.dist <= 5 ? '<p class="st-bull">Volltreffer!</p>' : ''}`;
      act.innerHTML = `<button id="nextBtn">${G.round + 1 < ROUNDS ? 'Nächste Stadt' : 'Auswertung'}</button>`;
      $('nextBtn').onclick = next;
      $('nextBtn').focus({ preventScroll: true });
      if (animate) countPts($('stResult').querySelector('.pts'), g.pts);
    } else {
      const sum = total(G.guesses);
      const cs = G.cpu ? total(G.cpu) : null;
      let head = `${fmtPts(sum)} von 5.000 Punkten`;
      if (G.cpu) head = sum > cs ? 'Du schlägst den Computer!' : sum === cs ? 'Unentschieden!' : 'Der Computer war besser.';
      prompt.innerHTML = `<small>${mode === 'daily' ? `Tageskarte #${num}` : G.cpu ? `Duell gegen den Computer (${LEVELS[level].label})` : 'Freies Spiel'}</small><h2>${head}</h2>`;
      $('stResult').innerHTML = `<ol class="st-sum">${G.cities.map((city, i) => {
        const g = G.guesses[i], cp = G.cpu && G.cpu[i];
        return `<li><span>${square(g.pts)} ${esc(city.name)}</span><b>${fmtKm(g.dist)}</b><em>${fmtPts(g.pts)}</em>${cp ? `<em class="cpu">${fmtPts(cp.pts)}</em>` : ''}</li>`;
      }).join('')}</ol>`;
      act.innerHTML = `<button id="shareBtn" class="ghost">Ergebnis kopieren</button>${mode === 'daily' ? '' : '<button id="againBtn">Nochmal</button>'}`;
      $('shareBtn').onclick = share;
      if ($('againBtn')) $('againBtn').onclick = () => newGame(mode);
    }
    renderMarkers();
    renderSide();
  }

  function countPts(elm, to) {
    if (!elm) return;
    if (window.VH && !VH.reduced()) {
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 700);
        elm.textContent = '+' + fmtPts(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else elm.textContent = '+' + fmtPts(to);
  }

  async function share() {
    const sum = total(G.guesses);
    const title = mode === 'daily' ? `Städteraten #${num}` : 'Städteraten';
    const text = `${title}: ${fmtPts(sum)}/5.000\n${G.guesses.map((g) => square(g.pts)).join('')}\n${location.origin}/raetsel/staedte.html`;
    try {
      await navigator.clipboard.writeText(text);
      $('shareBtn').textContent = 'Kopiert ✓';
    } catch {
      $('shareBtn').textContent = 'Kopieren nicht möglich';
    }
    setTimeout(() => $('shareBtn') && ($('shareBtn').textContent = 'Ergebnis kopieren'), 2000);
  }

  /* ---------- Seitenleiste: Bestenliste + Statistik ---------- */
  const lbKey = Daily.key('staedte', today);
  function renderSide() {
    const side = $('side');
    if (mode !== 'daily') {
      side.innerHTML = `<div class="panel"><h2>${mode === 'cpu' ? '🤖 Gegen den Computer' : '🎲 Freies Spiel'}</h2><p class="muted">${mode === 'cpu'
        ? 'Der Computer tippt bei jeder Stadt mit. Auf „Leicht“ liegt er oft 100 km daneben, auf „Schwer“ meist in der Nähe.'
        : 'Fünf zufällige Städte, ohne Bestenliste. Ideal zum Üben.'}</p></div>`;
      return;
    }
    const st = store.get('staedte-stats') || { played: 0, best: 0, total: 0, streak: 0 };
    side.innerHTML = `
      <div class="panel"><h2>🏆 Tagesbestenliste</h2><p class="muted st-date">${esc(Daily.longDate(today))}</p>
        <div id="stForm"></div><div id="stBoard"><p class="muted">Lade …</p></div><a class="side-lb-link" href="/raetsel/bestenliste.html">🏆 Ewige Bestenliste</a></div>
      <div class="panel st-stats"><h2>📊 Deine Statistik</h2>
        <div class="nums"><div><b>${st.played}</b><span>gespielt</span></div><div><b>${st.played ? fmtPts(Math.round(st.total / st.played)) : 0}</b><span>Schnitt</span></div><div><b>${fmtPts(st.best)}</b><span>Rekord</span></div><div><b>${st.streak}</b><span>Serie</span></div></div>
        <p class="hint">Nur Tageskarten, gespeichert auf diesem Gerät.</p></div>`;
    const mark = G.submitted || null;
    Daily.board($('stBoard'), lbKey, fmtPts, mark);
    if (G.phase === 'end' && !G.submitted) {
      const sum = total(G.guesses);
      $('stForm').innerHTML = `<form class="hs-form"><p>Dein Ergebnis: <b>${fmtPts(sum)} Punkte</b></p><div class="row"><input name="n" maxlength="16" required placeholder="Dein Name" value="${esc(store.name())}"><button>Eintragen</button></div><p class="error"></p></form>`;
      const form = $('stForm').querySelector('form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.elements.n.value.trim();
        if (!name) return;
        store.setName(name);
        form.querySelector('button').disabled = true;
        try {
          const entries = await Daily.submit(lbKey, name, sum);
          G.submitted = { name, score: sum };
          saveDaily();
          $('stForm').innerHTML = '';
          $('stBoard').innerHTML = Daily.table(entries, fmtPts, G.submitted);
        } catch (err) {
          form.querySelector('.error').textContent = err.message;
          form.querySelector('button').disabled = false;
        }
      };
    }
  }

  /* ---------- Start ---------- */
  buildMap();
  document.querySelectorAll('#modes [data-mode]').forEach((b) => (b.onclick = () => newGame(b.dataset.mode)));
  document.querySelectorAll('#cpuLevels [data-level]').forEach((b) => (b.onclick = () => {
    level = b.dataset.level;
    store.set('st-level', level);
    newGame('cpu');
  }));
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') { if (G.phase === 'guess') submitGuess(); else if (G.phase === 'result') next(); }
  });
  newGame('daily');
})();
