(() => {
  'use strict';
  const SIZE = 4;
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const hs = Scores.panel($('scores'), '2048', { unit: 'Pkt' });

  let grid, score, won, over, newIdx, merged;
  let best = +(localStorage.getItem('gg-best-2048') || 0);
  $('best').textContent = best;

  function addTile() {
    const empty = [];
    grid.forEach((v, i) => { if (!v) empty.push(i); });
    if (!empty.length) return;
    const i = empty[Math.floor(Math.random() * empty.length)];
    grid[i] = Math.random() < 0.9 ? 2 : 4;
    newIdx = i;
  }

  function slideLine(values) {
    const vals = values.filter((v) => v);
    const out = [], mergedPos = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        mergedPos.push(out.length - 1);
        gained += vals[i] * 2;
        i++;
      } else out.push(vals[i]);
    }
    while (out.length < SIZE) out.push(0);
    return { out, gained, mergedPos };
  }

  function indexFor(dir, line, pos) {
    switch (dir) {
      case 'left': return line * SIZE + pos;
      case 'right': return line * SIZE + (SIZE - 1 - pos);
      case 'up': return pos * SIZE + line;
      case 'down': return (SIZE - 1 - pos) * SIZE + line;
    }
  }

  function move(dir) {
    if (over) return;
    let moved = false, gained = 0;
    merged = new Set();
    newIdx = -1;
    for (let line = 0; line < SIZE; line++) {
      const idx = Array.from({ length: SIZE }, (_, p) => indexFor(dir, line, p));
      const res = slideLine(idx.map((i) => grid[i]));
      res.out.forEach((v, p) => {
        if (grid[idx[p]] !== v) { moved = true; grid[idx[p]] = v; }
      });
      res.mergedPos.forEach((p) => merged.add(idx[p]));
      gained += res.gained;
    }
    if (!moved) return;
    score += gained;
    addTile();
    render();

    if (!won && grid.some((v) => v >= 2048)) {
      won = true;
      showOverlay('2048 erreicht! 🎉', [['Weiterspielen', hideOverlay], ['Neues Spiel', start]]);
    } else if (!canMove()) {
      over = true;
      showOverlay(`Keine Züge mehr – ${score} Punkte`, [['Nochmal', start]]);
      if (score > 0) hs.offer(score);
    }
  }

  function canMove() {
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!grid[i]) return true;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      if (c < SIZE - 1 && grid[i] === grid[i + 1]) return true;
      if (r < SIZE - 1 && grid[i] === grid[i + SIZE]) return true;
    }
    return false;
  }

  function render() {
    boardEl.innerHTML = grid
      .map((v, i) => {
        const cls = v ? (v > 2048 ? 'vbig' : 'v' + v) : '';
        const anim = i === newIdx ? ' new' : merged && merged.has(i) ? ' merged' : '';
        return `<div class="tile ${cls}${anim}">${v || ''}</div>`;
      })
      .join('');
    $('score').textContent = score;
    if (score > best) {
      best = score;
      localStorage.setItem('gg-best-2048', best);
      $('best').textContent = best;
    }
  }

  function showOverlay(text, buttons) {
    $('ovText').textContent = text;
    const row = $('ovButtons');
    row.innerHTML = '';
    buttons.forEach(([label, fn], i) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (i > 0) b.className = 'ghost';
      b.onclick = fn;
      row.appendChild(b);
    });
    $('overlay').hidden = false;
    row.firstChild.focus();
  }
  function hideOverlay() { $('overlay').hidden = true; }

  function start() {
    grid = Array(SIZE * SIZE).fill(0);
    score = 0; won = false; over = false; merged = null;
    addTile(); addTile();
    hs.hide();
    hideOverlay();
    render();
  }

  const KEYS = {
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  };
  document.addEventListener('keydown', (e) => {
    if (typingIn(e) || !$('overlay').hidden) return;
    if (KEYS[e.key]) { e.preventDefault(); move(KEYS[e.key]); }
  });
  onSwipe(boardEl, (d) => { if (d !== 'tap' && $('overlay').hidden) move(d); });
  $('newGame').onclick = start;

  start();
})();
