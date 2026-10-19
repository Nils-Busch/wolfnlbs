Versus.start({
  game: 'dots',
  token: (i) => `<i class="disc d${i}"></i>`,
  info(s) {
    return `<span>Kästchen: <b>${s.score[0]}</b> : <b>${s.score[1]}</b></span><span>Wer ein Kästchen schließt, ist nochmal dran.</span>`;
  },
  render(el, s, can, move) {
    const { W, H } = Rules.games.dots;
    const G = 60, M = 18; // Abstand der Punkte, Rand
    const x = (c) => M + c * G, y = (r) => M + r * G;
    const { h, v, boxes } = s.board;
    const isLast = (kind, idx) => s.last && s.last.kind === kind && s.last.idx === idx;
    let svg = `<svg viewBox="0 0 ${W * G + 2 * M} ${H * G + 2 * M}" role="img" aria-label="Käsekästchen-Spielfeld">`;

    // Kästchen
    boxes.forEach((o, i) => {
      if (o === null) return;
      const r = Math.floor(i / W), c = i % W;
      svg += `<rect class="box${o}" x="${x(c) + 4}" y="${y(r) + 4}" width="${G - 8}" height="${G - 8}" rx="6"/>`;
    });

    const line = (kind, idx, x1, y1, x2, y2) => {
      const o = (kind === 'h' ? h : v)[idx];
      const cls = 'ln' + (o !== null ? ' p' + o : can ? ' can' : '') + (isLast(kind, idx) ? ' last' : '');
      let out = `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      if (o === null && can) out += `<line class="hit" data-k="${kind}" data-i="${idx}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      return out;
    };
    // waagerecht
    for (let r = 0; r <= H; r++)
      for (let c = 0; c < W; c++) svg += line('h', r * W + c, x(c) + 8, y(r), x(c + 1) - 8, y(r));
    // senkrecht
    for (let r = 0; r < H; r++)
      for (let c = 0; c <= W; c++) svg += line('v', r * (W + 1) + c, x(c), y(r) + 8, x(c), y(r + 1) - 8);
    // Punkte
    for (let r = 0; r <= H; r++)
      for (let c = 0; c <= W; c++) svg += `<circle class="dot" cx="${x(c)}" cy="${y(r)}" r="5"/>`;
    svg += '</svg>';

    el.className = 'dots';
    el.innerHTML = svg;
    el.querySelectorAll('.hit').forEach((hit) => {
      const shown = hit.previousElementSibling;
      hit.addEventListener('mouseenter', () => shown.classList.add('hover'));
      hit.addEventListener('mouseleave', () => shown.classList.remove('hover'));
      hit.addEventListener('click', () => move({ kind: hit.dataset.k, idx: +hit.dataset.i }));
    });
  },
});
