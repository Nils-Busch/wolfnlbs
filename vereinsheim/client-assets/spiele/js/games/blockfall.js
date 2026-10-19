(() => {
  'use strict';
  const W = 10, H = 20, S = 30; // Spalten, Zeilen, Pixel pro Feld
  const $ = (id) => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d');
  const nextCv = $('next'), nctx = nextCv.getContext('2d');
  canvas.width = W * S; canvas.height = H * S;
  const hs = Scores.panel($('scores'), 'blockfall', { unit: 'Pkt' });

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const COLORS = { I: '#2dd4bf', O: '#ffd166', T: '#b18cff', S: '#4ade80', Z: '#ff5d73', J: '#7c9cff', L: '#ff9966' };

  let grid, piece, nextQueue, bag, score, lines, level, dropMs, acc, last, running = false, paused = false;

  const rotateCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
  const rotateCCW = (m) => m[0].map((_, i) => m.map((r) => r[r.length - 1 - i]));

  function nextType() {
    if (!bag.length) bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5); // 7er-Beutel
    return bag.pop();
  }

  function spawn() {
    const t = nextQueue.shift();
    nextQueue.push(nextType());
    const m = SHAPES[t].map((r) => r.slice());
    piece = { t, m, x: Math.floor((W - m[0].length) / 2), y: t === 'I' ? -1 : 0 };
    if (collide(piece.m, piece.x, piece.y)) gameOver();
    drawNext();
  }

  function collide(m, x, y) {
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const gx = x + c, gy = y + r;
        if (gx < 0 || gx >= W || gy >= H) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    return false;
  }

  function move(dx) {
    if (!piece || collide(piece.m, piece.x + dx, piece.y)) return;
    piece.x += dx;
    draw();
  }

  function rotate(dir = 1) {
    const m = dir > 0 ? rotateCW(piece.m) : rotateCCW(piece.m);
    for (const k of [0, -1, 1, -2, 2]) {
      if (!collide(m, piece.x + k, piece.y)) {
        piece.m = m;
        piece.x += k;
        return draw();
      }
    }
  }

  function softDrop() {
    if (!collide(piece.m, piece.x, piece.y + 1)) {
      piece.y++;
      score += 1;
      acc = 0;
      hud(); draw();
    } else lock();
  }

  function hardDrop() {
    let d = 0;
    while (!collide(piece.m, piece.x, piece.y + 1)) { piece.y++; d++; }
    score += d * 2;
    lock();
  }

  function lock() {
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && piece.y + r >= 0) grid[piece.y + r][piece.x + c] = piece.t;
    }));
    let cleared = 0;
    for (let r = H - 1; r >= 0; r--) {
      if (grid[r].every((v) => v)) {
        grid.splice(r, 1);
        grid.unshift(Array(W).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      score += [0, 100, 300, 500, 800][cleared] * level;
      lines += cleared;
      level = 1 + Math.floor(lines / 10);
      dropMs = Math.max(80, 800 - (level - 1) * 70);
    }
    acc = 0;
    hud();
    if (running) spawn();
    draw();
  }

  function cell(c, x, y, color, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x * S + 1, y * S + 1, S - 2, S - 2, 5);
    c.fill();
    c.globalAlpha = alpha * 0.35;
    c.fillStyle = '#fff';
    c.fillRect(x * S + 4, y * S + 3, S - 8, 3);
    c.globalAlpha = 1;
  }

  function draw() {
    ctx.fillStyle = '#0f1626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#162036';
    ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) { ctx.beginPath(); ctx.moveTo(x * S + .5, 0); ctx.lineTo(x * S + .5, H * S); ctx.stroke(); }
    for (let y = 1; y < H; y++) { ctx.beginPath(); ctx.moveTo(0, y * S + .5); ctx.lineTo(W * S, y * S + .5); ctx.stroke(); }
    grid.forEach((row, y) => row.forEach((t, x) => t && cell(ctx, x, y, COLORS[t])));
    if (!piece) return;
    // Geisterstein: zeigt, wo der Stein landet
    let gy = piece.y;
    while (!collide(piece.m, piece.x, gy + 1)) gy++;
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && gy + r >= 0) cell(ctx, piece.x + c, gy + r, COLORS[piece.t], 0.18);
    }));
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && piece.y + r >= 0) cell(ctx, piece.x + c, piece.y + r, COLORS[piece.t]);
    }));
  }

  function drawNext() {
    nctx.fillStyle = '#0f1626';
    nctx.fillRect(0, 0, nextCv.width, nextCv.height);
    const t = nextQueue[0], m = SHAPES[t];
    const rows = m.filter((r) => r.some((v) => v));
    const top = m.findIndex((r) => r.some((v) => v));
    const cols = m[0].map((_, c) => m.some((r) => r[c])).filter(Boolean).length;
    const left = m[0].findIndex((_, c) => m.some((r) => r[c]));
    const ox = (4 - cols) / 2 - left, oy = (4 - rows.length) / 2 - top;
    m.forEach((row, r) => row.forEach((v, c) => v && cell(nctx, c + ox, r + oy, COLORS[t])));
  }

  function hud() {
    $('score').textContent = score;
    $('lines').textContent = lines;
    $('level').textContent = level;
  }

  function loop(now) {
    if (!running) return;
    if (!paused) {
      acc += now - last;
      if (acc >= dropMs) {
        acc = 0;
        if (!collide(piece.m, piece.x, piece.y + 1)) { piece.y++; draw(); }
        else lock();
      }
    }
    last = now;
    if (running) requestAnimationFrame(loop);
  }

  function start() {
    grid = Array.from({ length: H }, () => Array(W).fill(null));
    bag = [];
    nextQueue = [nextType(), nextType()];
    score = 0; lines = 0; level = 1; dropMs = 800; acc = 0;
    running = true; paused = false;
    hs.hide();
    $('overlay').hidden = true;
    hud();
    spawn();
    draw();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    showOverlay(`Game Over – ${score} Punkte`, 'Nochmal', start);
    if (score > 0) hs.offer(score);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) showOverlay('Pause', 'Weiter', togglePause);
    else { $('overlay').hidden = true; last = performance.now(); }
  }

  function showOverlay(text, btn, fn) {
    $('ovText').textContent = text;
    $('ovBtn').textContent = btn;
    $('ovBtn').onclick = fn;
    $('overlay').hidden = false;
  }

  const playing = () => running && !paused;
  document.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    const k = e.key;
    if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); return togglePause(); }
    if (!$('overlay').hidden && (k === ' ' || k === 'Enter')) { e.preventDefault(); return $('ovBtn').onclick(); }
    if (!playing()) return;
    const map = {
      ArrowLeft: () => move(-1), a: () => move(-1), A: () => move(-1),
      ArrowRight: () => move(1), d: () => move(1), D: () => move(1),
      ArrowUp: () => rotate(1), w: () => rotate(1), W: () => rotate(1), x: () => rotate(1), X: () => rotate(1),
      z: () => rotate(-1), Z: () => rotate(-1), y: () => rotate(-1), Y: () => rotate(-1),
      ArrowDown: softDrop, s: softDrop, S: softDrop,
      ' ': hardDrop,
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  // Touch: wischen auf dem Feld + Knöpfe
  onSwipe(canvas, (d) => {
    if (!playing()) return;
    ({ tap: () => rotate(1), left: () => move(-1), right: () => move(1), down: hardDrop, up: () => rotate(1) })[d]();
  });
  const pad = { padL: () => move(-1), padR: () => move(1), padRot: () => rotate(1), padDown: softDrop, padDrop: hardDrop };
  Object.entries(pad).forEach(([id, fn]) => ($(id).onclick = () => playing() && fn()));
  $('pause').onclick = togglePause;

  grid = Array.from({ length: H }, () => Array(W).fill(null));
  piece = null;
  draw();
  bag = []; nextQueue = [nextType()];
  drawNext();
  showOverlay('Bereit?', 'Start', start);
})();
