Versus.start({
  game: 'tictactoe',
  token: (i) => `<b class="sym${i}">${i === 0 ? '✕' : '◯'}</b>`,
  render(el, s, can, move) {
    el.className = 'ttt' + (can ? ' can' : '');
    el.innerHTML = '';
    s.board.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'cell' + (v !== null ? ' p' + v : '') + (s.line && s.line.includes(i) ? ' win' : '') + (s.last === i ? ' last' : '');
      b.textContent = v === 0 ? '✕' : v === 1 ? '◯' : '';
      b.disabled = !can || v !== null;
      b.setAttribute('aria-label', `Feld ${i + 1}`);
      b.onclick = () => move({ cell: i });
      el.appendChild(b);
    });
  },
});
