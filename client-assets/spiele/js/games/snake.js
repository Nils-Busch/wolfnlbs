(() => {
  'use strict';
  const N = 20;                 // Spielfeld N×N
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / N;
  const $ = (id) => document.getElementById(id);
  const hs = Scores.panel($('scores'), 'snake', { unit: 'Pkt' });

  let snake, dir, queue, food, score, speed, timer = null, running = false, paused = false;
  let best = +(localStorage.getItem('gg-best-snake') || 0);
  $('best').textContent = best;

  function reset() {
    snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0;
    speed = 140;
    placeFood();
    hud();
    draw();
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function hud() {
    $('score').textContent = score;
    $('length').textContent = snake.length;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = '#0f1626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Schachbrett-Hintergrund
    ctx.fillStyle = '#121a2d';
    for (let y = 0; y < N; y++) for (let x = (y % 2); x < N; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

    // Futter
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // Schlange
    snake.forEach((s, i) => {
      const t = i / Math.max(1, snake.length - 1);
      ctx.fillStyle = i === 0 ? '#86efac' : `hsl(142, 65%, ${55 - t * 20}%)`;
      roundRect(s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, CELL * 0.3);
    });
    // Augen
    const h = snake[0];
    ctx.fillStyle = '#0b1020';
    const cx = h.x * CELL + CELL / 2, cy = h.y * CELL + CELL / 2;
    const ox = dir.y !== 0 ? CELL * 0.2 : 0, oy = dir.x !== 0 ? CELL * 0.2 : 0;
    const fx = dir.x * CELL * 0.15, fy = dir.y * CELL * 0.15;
    [[1], [-1]].forEach(([k]) => {
      ctx.beginPath();
      ctx.arc(cx + fx + ox * k, cy + fy + oy * k, CELL * 0.08, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
    const eating = head.x === food.x && head.y === food.y;
    // Schwanzende bewegt sich weg (außer beim Fressen) → darf betreten werden
    const body = eating ? snake : snake.slice(0, -1);
    if (hitWall || body.some((s) => s.x === head.x && s.y === head.y)) return gameOver();

    snake.unshift(head);
    if (eating) {
      score += 10;
      speed = Math.max(60, speed - 3);
      if (snake.length === N * N) return gameOver(true);
      placeFood();
    } else {
      snake.pop();
    }
    hud();
    draw();
    timer = setTimeout(step, speed);
  }

  function start() {
    reset();
    hs.hide();
    $('overlay').hidden = true;
    running = true;
    paused = false;
    timer = setTimeout(step, speed);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      clearTimeout(timer);
      showOverlay('Pause', 'Weiter', togglePause);
    } else {
      $('overlay').hidden = true;
      timer = setTimeout(step, speed);
    }
  }

  function gameOver(won = false) {
    running = false;
    clearTimeout(timer);
    if (score > best) {
      best = score;
      localStorage.setItem('gg-best-snake', best);
      $('best').textContent = best;
    }
    showOverlay(won ? `Perfekt! ${score} Punkte 🏆` : `Game Over – ${score} Punkte`, 'Nochmal', start);
    if (score > 0) hs.offer(score);
  }

  function showOverlay(text, btnText, action) {
    $('ovText').textContent = text;
    $('ovBtn').textContent = btnText;
    $('ovBtn').onclick = action;
    $('overlay').hidden = false;
  }

  function turn(x, y) {
    if (!running || paused) return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if ((x === -last.x && y === -last.y) || (x === last.x && y === last.y)) return;
    if (queue.length < 3) queue.push({ x, y });
  }

  const KEYS = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  document.addEventListener('keydown', (e) => {
    if (typingIn(e)) return;
    if (KEYS[e.key]) {
      e.preventDefault();
      turn(...KEYS[e.key]);
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (!$('overlay').hidden) $('ovBtn').onclick();
      else togglePause();
    }
  });

  onSwipe(canvas.parentElement, (d) => {
    if (d === 'tap') return;
    const m = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
    turn(...m);
  });

  $('pause').onclick = togglePause;
  reset();
  showOverlay('Bereit?', 'Start', start);
})();
