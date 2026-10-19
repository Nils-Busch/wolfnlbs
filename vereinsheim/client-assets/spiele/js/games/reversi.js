Versus.start({
  game: 'reversi',
  token: (i) => `<i class="disc d${i}"></i>`,
  info(s, names, esc) {
    const [a, b] = Rules.games.reversi.count(s.board);
    let html = `<span>Steine: <b>${a}</b> : <b>${b}</b></span>`;
    if (s.passed !== null && s.passed !== undefined && !Rules.isOver(s)) {
      html += `<span>${esc(names[s.passed])} kann nicht ziehen und muss aussetzen.</span>`;
    }
    return html;
  },
  render(el, s, can, move) {
    const rv = Rules.games.reversi;
    const valid = can ? new Set(rv.validMoves(s.board, s.turn)) : new Set();
    const flipped = new Set(s.flipped || []);
    el.className = 'rv';
    el.innerHTML = '';
    s.board.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'sq' + (v !== null ? ' d' + v : '') + (valid.has(i) ? ' hint' : '') +
        (s.last === i ? ' last' : '') + (flipped.has(i) ? ' flip' : '');
      b.disabled = !valid.has(i);
      b.setAttribute('aria-label', `Feld ${String.fromCharCode(65 + (i % 8))}${Math.floor(i / 8) + 1}`);
      b.onclick = () => move({ cell: i });
      el.appendChild(b);
    });
  },
});
