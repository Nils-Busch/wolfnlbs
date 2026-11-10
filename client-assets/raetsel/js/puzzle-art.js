/**
 * Bilder für das Tagespuzzle – jeden Tag ein neues, selbst gemaltes Motiv.
 * Alles wird mit Zufall aus dem Datum auf ein Canvas gezeichnet: keine
 * Bilddateien, keine fremden Rechte, für alle dasselbe Bild.
 *   PuzzleArt.paint(ctx, W, H, rand) → Titel des Bildes
 */
const PuzzleArt = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const between = (r, a, b) => a + r() * (b - a);
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
  function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
  function vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function glow(ctx, x, y, r, color, a = 0.6) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Bergkamm per Mittelpunktverschiebung
  function ridge(r, W, base, rough, steps = 7) {
    let pts = [[0, base + between(r, -rough, rough) * 0.3], [W, base + between(r, -rough, rough) * 0.3]];
    let amp = rough;
    for (let s = 0; s < steps; s++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        next.push([(x0 + x1) / 2, (y0 + y1) / 2 + between(r, -amp, amp)], [x1, y1]);
      }
      pts = next;
      amp *= 0.52;
    }
    return pts;
  }
  function fillRidge(ctx, pts, H, style) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0], H);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }
  function cloud(ctx, r, x, y, s, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(x + between(r, -1.2, 1.2) * s, y + between(r, -0.25, 0.2) * s, between(r, 0.5, 0.95) * s, between(r, 0.32, 0.5) * s, 0, 0, TAU);
      ctx.fill();
    }
  }
  function pine(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = y - h * (0.25 + i * 0.22), w = h * (0.32 - i * 0.06);
      ctx.moveTo(x, yy - h * 0.3);
      ctx.lineTo(x - w, yy + h * 0.06);
      ctx.lineTo(x + w, yy + h * 0.06);
    }
    ctx.fill();
    ctx.fillRect(x - h * 0.03, y - h * 0.25, h * 0.06, h * 0.25);
  }
  function stars(ctx, r, W, H, n) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(255,255,255,${between(r, 0.3, 1)})`;
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, between(r, 0.6, 2.2), 0, TAU);
      ctx.fill();
    }
  }
  function birds(ctx, r, W, y0, n, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = between(r, W * 0.2, W * 0.8);
    for (let i = 0; i < n; i++) {
      const x = cx + between(r, -140, 140), y = y0 + between(r, -50, 50), s = between(r, 9, 17);
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.4);
      ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y);
      ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.7, x + s, y - s * 0.4);
      ctx.stroke();
    }
  }

  const SKIES = {
    morgen: { name: 'im Morgenlicht', sky: ['#7fb2e8', '#f7c9a9', '#ffe3b3'], sun: '#fff1c1', far: '#8d9fc4', near: '#3d5a80', water: '#6f9bd1', night: false },
    mittag: { name: 'am Mittag', sky: ['#2f7fd8', '#76b6f0', '#c9e6ff'], sun: '#fffbe6', far: '#7d98c4', near: '#2e5a3c', water: '#3d86c6', night: false },
    abend: { name: 'im Abendrot', sky: ['#3b2a63', '#e0567a', '#ffb25b'], sun: '#ffd56b', far: '#7a4a7a', near: '#2c1f3d', water: '#c45c7a', night: false },
    nacht: { name: 'bei Nacht', sky: ['#070b22', '#1b2457', '#3a4a8c'], sun: '#f4f1d0', far: '#2e3a6e', near: '#11163a', water: '#22306a', night: true },
  };

  /* ---------- Motiv 1: Bergsee ---------- */
  function lake(ctx, W, H, r) {
    const k = pick(r, Object.keys(SKIES)), S = SKIES[k];
    const horizon = H * between(r, 0.56, 0.64);
    ctx.fillStyle = vgrad(ctx, 0, horizon, [[0, S.sky[0]], [0.65, S.sky[1]], [1, S.sky[2]]]);
    ctx.fillRect(0, 0, W, horizon);
    if (S.night) stars(ctx, r, W, horizon * 0.8, 260);
    const sx = between(r, W * 0.15, W * 0.85), sy = horizon * between(r, 0.25, 0.6), sr = between(r, 38, 70);
    glow(ctx, sx, sy, sr * 5, S.sun, S.night ? 0.25 : 0.55);
    ctx.fillStyle = S.sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) cloud(ctx, r, r() * W, between(r, 40, horizon * 0.55), between(r, 40, 90), rgba(S.night ? '#8e9ad0' : '#ffffff', S.night ? 0.12 : 0.55));
    // drei Bergketten, vorne dunkler
    const layers = 4;
    const ridges = [];
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const pts = ridge(r, W, horizon - (layers - i) * between(r, 45, 80) + 30, 170 - i * 30);
      ridges.push(pts);
      fillRidge(ctx, pts, horizon, mix(S.far, S.near, t));
      if (i === 0) {
        // Schneekappen
        ctx.save();
        ctx.beginPath(); ctx.moveTo(0, horizon); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(W, horizon); ctx.closePath(); ctx.clip();
        const top = Math.min(...pts.map((p) => p[1]));
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(0, top, W, 38);
        ctx.restore();
      }
    }
    // Ufer mit Tannen
    const shore = ridge(r, W, horizon - 12, 14, 5);
    fillRidge(ctx, shore, horizon + 2, S.near);
    for (let x = 0; x < W; x += between(r, 14, 40)) {
      if (r() < 0.65) pine(ctx, x, horizon + 2, between(r, 50, 130), mix(S.near, '#000000', 0.25));
    }
    // See mit Spiegelung
    ctx.save();
    ctx.translate(0, horizon * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(ctx.canvas, 0, 0, W, horizon, 0, 0, W, horizon);
    ctx.restore();
    ctx.fillStyle = vgrad(ctx, horizon, H, [[0, rgba(S.water, 0.45)], [1, rgba(S.water, 0.85)]]);
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const y = between(r, horizon + 8, H), x = r() * W, w = between(r, 20, 120) * (y / H);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    }
    // Steg und Boot
    if (r() < 0.6) {
      const bx = between(r, W * 0.15, W * 0.75), by = between(r, horizon + 70, H - 60);
      ctx.fillStyle = '#5b3a22';
      ctx.beginPath(); ctx.moveTo(bx - 70, by); ctx.lineTo(bx + 70, by); ctx.lineTo(bx + 50, by + 24); ctx.lineTo(bx - 50, by + 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = pick(r, ['#e23b3b', '#f2b705', '#ffffff']);
      ctx.fillRect(bx - 70, by - 6, 140, 8);
    }
    if (!S.night) birds(ctx, r, W, horizon * 0.35, 5, rgba('#1b1b2f', 0.6));
    return `Bergsee ${S.name}`;
  }

  /* ---------- Motiv 2: Heißluftballons ---------- */
  function balloons(ctx, W, H, r) {
    const k = pick(r, ['morgen', 'mittag', 'abend']), S = SKIES[k];
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, S.sky[0]], [0.6, S.sky[1]], [1, S.sky[2]]]);
    ctx.fillRect(0, 0, W, H);
    glow(ctx, between(r, 100, W - 100), between(r, 80, 300), 380, S.sun, 0.5);
    for (let i = 0; i < 7; i++) cloud(ctx, r, r() * W, between(r, 40, H * 0.6), between(r, 40, 100), 'rgba(255,255,255,.5)');
    // Hügel mit Feldern
    const greens = ['#6aa84f', '#93c47d', '#4e8b3a', '#b6d77a', '#d9c36a', '#8fbf5a'];
    for (let i = 0; i < 4; i++) {
      const base = H * (0.62 + i * 0.1);
      const pts = ridge(r, W, base, 60 - i * 8, 6);
      fillRidge(ctx, pts, H, pick(r, greens));
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0, H); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(W, H); ctx.closePath(); ctx.clip();
      for (let x = between(r, -200, 0); x < W; x += between(r, 90, 200)) {
        ctx.fillStyle = rgba(pick(r, ['#ffffff', '#000000', '#f2b705']), 0.08);
        ctx.beginPath(); ctx.moveTo(x, base - 120); ctx.lineTo(x + 60, base - 120); ctx.lineTo(x + 160, H); ctx.lineTo(x + 40, H); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      for (let t = 0; t < 6; t++) {
        const x = r() * W, y = base + between(r, -10, 40);
        ctx.fillStyle = '#2f5d27';
        ctx.beginPath(); ctx.arc(x, y - 16, between(r, 10, 20), 0, TAU); ctx.fill();
      }
    }
    // Ballons
    const cols = ['#e23b3b', '#f2b705', '#2d6be0', '#179e5e', '#8a5cf0', '#ff7a3d', '#e0658f', '#1aa3a3', '#ffffff'];
    const n = 5 + Math.floor(r() * 4);
    const list = Array.from({ length: n }, () => ({ x: between(r, 60, W - 60), y: between(r, 70, H * 0.62), s: between(r, 28, 95) })).sort((a, b) => a.s - b.s);
    for (const b of list) {
      const c1 = pick(r, cols), c2 = pick(r, cols.filter((c) => c !== c1));
      const stripes = 6 + Math.floor(r() * 4);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(0, b.s * 1.25);
      ctx.bezierCurveTo(-b.s * 1.25, b.s * 0.35, -b.s * 1.05, -b.s * 1.05, 0, -b.s * 1.05);
      ctx.bezierCurveTo(b.s * 1.05, -b.s * 1.05, b.s * 1.25, b.s * 0.35, 0, b.s * 1.25);
      ctx.closePath();
      ctx.clip();
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? c1 : c2;
        const x0 = -b.s * 1.2 + (i * 2.4 * b.s) / stripes;
        ctx.fillRect(x0, -b.s * 1.2, (2.4 * b.s) / stripes + 1, b.s * 2.6);
      }
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.ellipse(-b.s * 0.35, -b.s * 0.4, b.s * 0.25, b.s * 0.5, -0.3, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(60,40,20,.7)';
      ctx.lineWidth = Math.max(1, b.s / 40);
      ctx.beginPath();
      ctx.moveTo(b.x - b.s * 0.25, b.y + b.s * 1.15); ctx.lineTo(b.x - b.s * 0.16, b.y + b.s * 1.5);
      ctx.moveTo(b.x + b.s * 0.25, b.y + b.s * 1.15); ctx.lineTo(b.x + b.s * 0.16, b.y + b.s * 1.5);
      ctx.stroke();
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(b.x - b.s * 0.18, b.y + b.s * 1.5, b.s * 0.36, b.s * 0.26);
    }
    return `Ballonfahrt ${S.name}`;
  }

  /* ---------- Motiv 3: Stadt am Fluss ---------- */
  function city(ctx, W, H, r) {
    const dusk = r() < 0.5;
    const sky = dusk ? ['#1d1b4b', '#6b3b7a', '#f08a5d'] : ['#04061a', '#121a4a', '#2c3a7a'];
    const horizon = H * 0.66;
    ctx.fillStyle = vgrad(ctx, 0, horizon, [[0, sky[0]], [0.6, sky[1]], [1, sky[2]]]);
    ctx.fillRect(0, 0, W, horizon);
    stars(ctx, r, W, horizon * 0.6, dusk ? 80 : 240);
    const mx = between(r, 100, W - 100), my = between(r, 70, 200);
    glow(ctx, mx, my, 220, '#fff4d0', 0.3);
    ctx.fillStyle = '#fff4d0';
    ctx.beginPath(); ctx.arc(mx, my, 44, 0, TAU); ctx.fill();
    ctx.fillStyle = sky[0];
    ctx.beginPath(); ctx.arc(mx + 18, my - 10, 40, 0, TAU); ctx.fill();
    const windowCols = ['#ffd66b', '#ffe9a8', '#ffb347', '#9ad1ff'];
    for (let layer = 0; layer < 3; layer++) {
      const shade = mix(layer === 0 ? '#3a3f73' : layer === 1 ? '#262a52' : '#14162f', '#000000', 0);
      let x = between(r, -40, 0);
      while (x < W) {
        const w = between(r, 40, 110) * (1 + layer * 0.2), h = between(r, 80, 300) * (1.2 - layer * 0.25) + layer * 30;
        const top = horizon - h;
        ctx.fillStyle = shade;
        ctx.fillRect(x, top, w, h);
        if (r() < 0.3) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w / 2, top - between(r, 20, 60)); ctx.lineTo(x + w, top); ctx.fill(); }
        if (r() < 0.2) ctx.fillRect(x + w / 2 - 2, top - 50, 4, 50);
        const lit = 0.2 + layer * 0.15;
        for (let wy = top + 10; wy < horizon - 12; wy += 16) {
          for (let wx = x + 7; wx < x + w - 10; wx += 13) {
            if (r() < lit) { ctx.fillStyle = pick(r, windowCols); ctx.fillRect(wx, wy, 6, 8); }
          }
        }
        x += w + between(r, -10, 12);
      }
    }
    // Fluss mit Lichtern
    ctx.fillStyle = vgrad(ctx, horizon, H, [[0, '#1b2350'], [1, '#090c22']]);
    ctx.fillRect(0, horizon, W, H - horizon);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = between(r, horizon + 4, H), w = between(r, 6, 40);
      ctx.fillStyle = rgba(pick(r, windowCols), between(r, 0.15, 0.6) * (1 - (y - horizon) / (H - horizon)));
      ctx.fillRect(x, y, w, 2);
    }
    // Brücke
    const by = horizon + between(r, 30, 70);
    ctx.strokeStyle = '#0d0f24';
    ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
    ctx.lineWidth = 8;
    for (let x = 0; x < W; x += 200) { ctx.beginPath(); ctx.arc(x + 100, by + 70, 100, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
    for (let x = 20; x < W; x += 60) { ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, by - 14, 4, 0, TAU); ctx.fill(); glow(ctx, x, by - 14, 22, '#ffe9a8', 0.35); }
    return dusk ? 'Stadt in der Dämmerung' : 'Stadt bei Nacht';
  }

  /* ---------- Motiv 4: Unterwasser ---------- */
  function sea(ctx, W, H, r) {
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, '#33c2e0'], [0.5, '#1373b8'], [1, '#0a2f6b']]);
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = between(r, -100, W), w = between(r, 30, 110);
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w + 260, H); ctx.lineTo(x + 180, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Sand
    const floor = ridge(r, W, H * 0.82, 40, 6);
    fillRidge(ctx, floor, H, vgrad(ctx, H * 0.75, H, [[0, '#e8cf8a'], [1, '#b8955a']]));
    // Seegras
    for (let i = 0; i < 18; i++) {
      const x = r() * W, h = between(r, 120, 320), sway = between(r, -40, 40);
      ctx.strokeStyle = pick(r, ['#2f9e5a', '#1f7a43', '#5cbf5a', '#3aa37a']);
      ctx.lineWidth = between(r, 6, 12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, H - 30);
      ctx.bezierCurveTo(x + sway, H - h * 0.4, x - sway, H - h * 0.7, x + sway * 0.5, H - h);
      ctx.stroke();
    }
    // Korallen
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = between(r, H * 0.82, H - 20), s = between(r, 25, 60);
      ctx.fillStyle = pick(r, ['#ff6b8b', '#ff9f43', '#c56cf0', '#ff4757', '#ffd166']);
      for (let j = 0; j < 7; j++) { ctx.beginPath(); ctx.arc(x + between(r, -s, s), y - between(r, 0, s * 1.4), between(r, s * 0.25, s * 0.5), 0, TAU); ctx.fill(); }
    }
    // Fische
    const fishCols = [['#ff9f1c', '#ffffff'], ['#ffd166', '#2d6be0'], ['#ef476f', '#ffd166'], ['#06d6a0', '#073b4c'], ['#c56cf0', '#ffffff']];
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = between(r, 60, H * 0.75), s = between(r, 18, 52), dir = r() < 0.5 ? 1 : -1;
      const [c1, c2] = pick(r, fishCols);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2;
      ctx.fillRect(-s * 0.2, -s * 0.5, s * 0.18, s);
      ctx.fillRect(s * 0.25, -s * 0.45, s * 0.12, s * 0.9);
      ctx.fillStyle = '#10142a';
      ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.12, s * 0.09, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // Blasen
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H * 0.85, between(r, 3, 12), 0, TAU); ctx.stroke(); }
    return 'Im Korallenriff';
  }

  /* ---------- Motiv 5: Leuchtturm ---------- */
  function lighthouse(ctx, W, H, r) {
    const k = pick(r, ['mittag', 'abend', 'morgen']), S = SKIES[k];
    const horizon = H * between(r, 0.55, 0.62);
    ctx.fillStyle = vgrad(ctx, 0, horizon, [[0, S.sky[0]], [0.7, S.sky[1]], [1, S.sky[2]]]);
    ctx.fillRect(0, 0, W, horizon);
    const sx = between(r, W * 0.1, W * 0.5), sy = horizon - between(r, 40, 220);
    glow(ctx, sx, sy, 300, S.sun, 0.5);
    ctx.fillStyle = S.sun;
    ctx.beginPath(); ctx.arc(sx, sy, 52, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) cloud(ctx, r, r() * W, between(r, 40, horizon * 0.6), between(r, 40, 90), 'rgba(255,255,255,.55)');
    // Meer
    ctx.fillStyle = vgrad(ctx, horizon, H, [[0, mix(S.water, '#ffffff', 0.15)], [1, mix(S.water, '#001030', 0.5)]]);
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 90; i++) {
      const y = between(r, horizon + 6, H), x = r() * W, w = between(r, 10, 60) * (0.5 + (y - horizon) / (H - horizon));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 6, x + w, y); ctx.stroke();
    }
    // Felsen und Leuchtturm
    const right = r() < 0.5;
    const cx = right ? W * between(r, 0.68, 0.8) : W * between(r, 0.2, 0.32);
    ctx.fillStyle = '#4a4e5a';
    ctx.beginPath();
    ctx.moveTo(cx - 260, H);
    ctx.lineTo(cx - 200, horizon + 90); ctx.lineTo(cx - 80, horizon + 40); ctx.lineTo(cx + 90, horizon + 50); ctx.lineTo(cx + 210, horizon + 110); ctx.lineTo(cx + 290, H);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b7080';
    ctx.beginPath(); ctx.moveTo(cx - 200, horizon + 90); ctx.lineTo(cx - 80, horizon + 40); ctx.lineTo(cx - 40, horizon + 120); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5f8f3a';
    ctx.beginPath(); ctx.moveTo(cx - 110, horizon + 48); ctx.lineTo(cx + 100, horizon + 52); ctx.lineTo(cx + 60, horizon + 70); ctx.lineTo(cx - 90, horizon + 66); ctx.closePath(); ctx.fill();
    const base = horizon + 55, top = horizon - 300, w0 = 46, w1 = 30;
    const sc = pick(r, ['#e23b3b', '#2d6be0', '#179e5e']);
    for (let i = 0; i < 6; i++) {
      const y0 = base - (i * (base - top)) / 6, y1 = base - ((i + 1) * (base - top)) / 6;
      const a0 = w0 - ((w0 - w1) * i) / 6, a1 = w0 - ((w0 - w1) * (i + 1)) / 6;
      ctx.fillStyle = i % 2 ? '#ffffff' : sc;
      ctx.beginPath(); ctx.moveTo(cx - a0, y0); ctx.lineTo(cx + a0, y0); ctx.lineTo(cx + a1, y1); ctx.lineTo(cx - a1, y1); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2a2d3a';
    ctx.fillRect(cx - 40, top - 8, 80, 10);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(cx - 24, top - 52, 48, 44);
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.moveTo(cx - 32, top - 52); ctx.lineTo(cx, top - 90); ctx.lineTo(cx + 32, top - 52); ctx.closePath(); ctx.fill();
    glow(ctx, cx, top - 30, 160, '#fff3b0', 0.55);
    // Segelboote
    for (let i = 0; i < 3; i++) {
      const bx = right ? between(r, 60, W * 0.5) : between(r, W * 0.5, W - 60), by = between(r, horizon + 20, horizon + 160), s = between(r, 22, 46);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(bx, by - s * 2); ctx.lineTo(bx, by - 4); ctx.lineTo(bx + s * 1.1, by - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = pick(r, ['#e23b3b', '#f2b705', '#2d6be0']);
      ctx.beginPath(); ctx.moveTo(bx - 4, by - s * 1.6); ctx.lineTo(bx - 4, by - 4); ctx.lineTo(bx - s * 0.8, by - 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5b3a22';
      ctx.beginPath(); ctx.moveTo(bx - s, by); ctx.lineTo(bx + s * 1.2, by); ctx.lineTo(bx + s * 0.9, by + s * 0.35); ctx.lineTo(bx - s * 0.7, by + s * 0.35); ctx.closePath(); ctx.fill();
    }
    birds(ctx, r, W, horizon * 0.4, 6, 'rgba(30,30,50,.55)');
    return `Leuchtturm ${S.name}`;
  }

  /* ---------- Motiv 6: Blumenwiese ---------- */
  function meadow(ctx, W, H, r) {
    const S = SKIES[pick(r, ['morgen', 'mittag'])];
    const horizon = H * 0.45;
    ctx.fillStyle = vgrad(ctx, 0, horizon, [[0, S.sky[0]], [1, S.sky[2]]]);
    ctx.fillRect(0, 0, W, horizon);
    glow(ctx, between(r, 100, W - 100), between(r, 60, 180), 260, S.sun, 0.6);
    for (let i = 0; i < 6; i++) cloud(ctx, r, r() * W, between(r, 30, horizon * 0.7), between(r, 40, 80), 'rgba(255,255,255,.7)');
    fillRidge(ctx, ridge(r, W, horizon - 30, 50, 6), horizon + 40, '#7d9fc4');
    fillRidge(ctx, ridge(r, W, horizon, 30, 6), H, vgrad(ctx, horizon, H, [[0, '#8fc95a'], [1, '#2f7a32']]));
    // Baum
    const tx = between(r, W * 0.15, W * 0.85), ty = horizon + 40;
    ctx.fillStyle = '#5b3a22';
    ctx.fillRect(tx - 14, ty - 150, 28, 160);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pick(r, ['#2f7a32', '#3f9142', '#4fa84f']);
      ctx.beginPath(); ctx.arc(tx + between(r, -90, 90), ty - between(r, 150, 260), between(r, 50, 85), 0, TAU); ctx.fill();
    }
    // Blumen: hinten klein, vorne groß
    const petals = ['#ff5d73', '#ffd166', '#ffffff', '#c56cf0', '#ff9f43', '#4dabf7', '#ff7ac6'];
    for (let i = 0; i < 260; i++) {
      const y = between(r, horizon + 20, H + 20), depth = (y - horizon) / (H - horizon), s = 3 + depth * 20, x = r() * W;
      ctx.strokeStyle = '#2f7a32';
      ctx.lineWidth = Math.max(1, s / 6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 2); ctx.stroke();
      const c = pick(r, petals);
      ctx.fillStyle = c;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c === '#ffd166' ? '#c56b1f' : '#ffd166';
      ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, TAU); ctx.fill();
    }
    // Schmetterlinge
    for (let i = 0; i < 4; i++) {
      const x = between(r, 80, W - 80), y = between(r, horizon - 80, H * 0.75), s = between(r, 14, 26), c = pick(r, petals);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(x - s * 0.6, y, s * 0.6, s * 0.8, -0.4, 0, TAU); ctx.ellipse(x + s * 0.6, y, s * 0.6, s * 0.8, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 2, y - s * 0.7, 4, s * 1.4);
    }
    return 'Sommerwiese';
  }

  const SCENES = [lake, balloons, city, sea, lighthouse, meadow];
  function paint(ctx, W, H, rand) {
    const scene = SCENES[Math.floor(rand() * SCENES.length)];
    ctx.save();
    const title = scene(ctx, W, H, rand);
    ctx.restore();
    // leichte Vignette, damit die Ränder sich unterscheiden
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return title;
  }
  return { paint, SCENES };
})();
