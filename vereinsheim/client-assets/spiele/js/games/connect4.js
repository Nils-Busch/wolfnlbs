Versus.start({
  game: 'connect4',
  token: (i) => `<i class="disc d${i}"></i>`,
  render(el, s, can, move) {
    const { ROWS, COLS } = Rules.games.connect4;
    el.className = 'c4';
    el.innerHTML = '';
    const slots = [];
    const hover = (col, on) => slots.forEach((b) => b.classList.toggle('hover', on && +b.dataset.col === col));

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const v = s.board[i];
        const b = document.createElement('button');
        b.className = 'slot' + (v !== null ? ' d' + v : '') + (s.line && s.line.includes(i) ? ' win' : '') + (s.last === i ? ' last' : '');
        b.dataset.col = c;
        b.disabled = !can || s.board[c] !== null; // oberstes Feld belegt = Spalte voll
        b.setAttribute('aria-label', `Spalte ${c + 1}`);
        b.onclick = () => move({ col: c });
        if (!b.disabled) {
          b.onmouseenter = () => hover(c, true);
          b.onmouseleave = () => hover(c, false);
        }
        slots.push(b);
        el.appendChild(b);
      }
    }
  },
});

// Tasten 1–7 werfen in die jeweilige Spalte
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 7) {
    const btn = document.querySelector(`#vsBoard .slot[data-col="${n - 1}"]:not(:disabled)`);
    if (btn) btn.click();
  }
});
