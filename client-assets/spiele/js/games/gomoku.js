Versus.start({
  game: 'gomoku',
  token: (i) => `<i class="disc d${i}"></i>`,
  info(s, names, esc) {
    const n = s.board.filter((v) => v !== null).length;
    return n ? `<span>Zug <b>${n}</b></span>` : '<span>Rot oder Gelb – wer zuerst beginnt, wechselt jede Runde.</span>';
  },
  render(el, s, can, move) {
    const N = Rules.games.gomoku.SIZE;
    const STARS = new Set([3 * N + 3, 3 * N + 11, 7 * N + 7, 11 * N + 3, 11 * N + 11]);
    el.className = 'gm' + (can ? ' can' : '');
    el.innerHTML = '';
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N, v = s.board[i];
      const b = document.createElement('button');
      b.className = `pt r${r} c${c}` + (STARS.has(i) ? ' star' : '') + (v !== null ? ' d' + v : '') +
        (s.line && s.line.includes(i) ? ' win' : '') + (s.last === i ? ' last' : '');
      b.disabled = !can || v !== null;
      b.setAttribute('aria-label', `Reihe ${r + 1}, Spalte ${c + 1}` + (v === 0 ? ', rot' : v === 1 ? ', gelb' : ''));
      b.onclick = () => move({ cell: i });
      el.appendChild(b);
    }
  },
});
