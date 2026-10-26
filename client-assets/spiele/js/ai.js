/**
 * Computergegner für die Duell-Spiele.
 *   AI.pick(game, state, player, level) -> Zug-Objekt (wie bei Rules.move)
 *   level: 'easy' | 'medium' | 'hard'
 * Läuft komplett im Browser und nutzt dieselben Regeln wie das Spiel (rules.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.AI = factory(root.Rules);
})(typeof self !== 'undefined' ? self : this, function (Rules) {
  'use strict';

  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const G = Rules.games;

  /* ---------------- Tic-Tac-Toe: Minimax ---------------- */
  function tttScore(s, me, depth) {
    if (s.winner === me) return 10 - depth;
    if (s.winner !== null) return depth - 10;
    if (s.draw) return 0;
    let best = s.turn === me ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (s.board[i] !== null) continue;
      const v = tttScore(G.tictactoe.move(s, s.turn, { cell: i }), me, depth + 1);
      best = s.turn === me ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  function tictactoe(s, me, level) {
    const free = s.board.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (level === 'easy') {
      const win = free.find((i) => G.tictactoe.move(s, me, { cell: i }).winner === me);
      return { cell: win !== undefined && chance(0.7) ? win : rnd(free) };
    }
    if (level === 'medium' && chance(0.3)) return { cell: rnd(free) };
    let best = -Infinity, moves = [];
    for (const i of free) {
      const v = tttScore(G.tictactoe.move(s, me, { cell: i }), me, 1);
      if (v > best) { best = v; moves = [i]; } else if (v === best) moves.push(i);
    }
    return { cell: rnd(moves) };
  }

  /* ---------------- Vier gewinnt: Negamax mit Alpha-Beta ---------------- */
  const C4 = G.connect4;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  function c4Eval(board, me) {
    const { ROWS, COLS } = C4;
    let score = 0;
    for (let r = 0; r < ROWS; r++) if (board[r * COLS + 3] === me) score += 3; else if (board[r * COLS + 3] === 1 - me) score -= 3;
    const win = (cells) => {
      let m = 0, o = 0;
      for (const v of cells) { if (v === me) m++; else if (v !== null) o++; }
      if (m && o) return 0;
      if (m === 3) return 5; if (m === 2) return 2;
      if (o === 3) return -6; if (o === 2) return -2;
      return 0;
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * 3, ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        const cells = [];
        for (let k = 0; k < 4; k++) cells.push(board[(r + dr * k) * COLS + c + dc * k]);
        score += win(cells);
      }
    }
    return score;
  }
  // Wert aus Sicht des Spielers, der in s am Zug ist.
  function c4Negamax(s, depth, alpha, beta) {
    if (s.winner !== null) return -(100000 + depth); // der Vorgänger hat gewonnen
    if (s.draw) return 0;
    if (depth === 0) return c4Eval(s.board, s.turn);
    let best = -Infinity;
    for (const col of ORDER) {
      const n = C4.move(s, s.turn, { col });
      if (!n) continue;
      const v = -c4Negamax(n, depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  function connect4(s, me, level) {
    const legal = ORDER.filter((col) => C4.move(s, me, { col }));
    // Sofort gewinnen oder sofort blocken – das kann jede Stufe außer manchmal "leicht"
    const win = legal.find((col) => C4.move(s, me, { col }).winner === me);
    if (win !== undefined && (level !== 'easy' || chance(0.8))) return { col: win };
    if (level === 'easy') {
      const opp = { ...s, turn: 1 - me };
      const block = legal.find((col) => { const n = C4.move(opp, 1 - me, { col }); return n && n.winner === 1 - me; });
      if (block !== undefined && chance(0.5)) return { col: block };
      return { col: rnd(legal) };
    }
    const depth = level === 'hard' ? 7 : 4;
    let best = -Infinity, moves = [];
    for (const col of legal) {
      const v = -c4Negamax(C4.move(s, me, { col }), depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; moves = [col]; } else if (v === best) moves.push(col);
    }
    if (level === 'medium' && chance(0.15)) return { col: rnd(legal) };
    return { col: rnd(moves) };
  }

  /* ---------------- Reversi: Feldwerte + Beweglichkeit ---------------- */
  const RV = G.reversi;
  const W = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, 1, 1, 1, 1, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 1, 1, 1, 1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100,
  ];
  function rvEval(s, me) {
    if (s.winner !== null) return s.winner === me ? 100000 : -100000;
    if (s.draw) return 0;
    let pos = 0;
    s.board.forEach((v, i) => { if (v === me) pos += W[i]; else if (v !== null) pos -= W[i]; });
    const mob = RV.validMoves(s.board, me).length - RV.validMoves(s.board, 1 - me).length;
    const filled = s.board.filter((v) => v !== null).length;
    const [a, b] = RV.count(s.board);
    const disc = (me === 0 ? a - b : b - a) * (filled > 52 ? 10 : 0);
    return pos + mob * 6 + disc;
  }
  function rvSearch(s, depth, alpha, beta, me) {
    if (depth === 0 || s.winner !== null || s.draw) return rvEval(s, me);
    const moves = RV.validMoves(s.board, s.turn);
    const maxing = s.turn === me;
    let best = maxing ? -Infinity : Infinity;
    for (const cell of moves) {
      const v = rvSearch(RV.move(s, s.turn, { cell }), depth - 1, alpha, beta, me);
      if (maxing) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
      else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (alpha >= beta) break;
    }
    return best;
  }
  function reversi(s, me, level) {
    const moves = RV.validMoves(s.board, me);
    if (level === 'easy') {
      if (chance(0.5)) return { cell: rnd(moves) };
      // gierig: möglichst viele Steine umdrehen
      let most = -1, pick = [];
      for (const cell of moves) {
        const n = RV.move(s, me, { cell }).flipped.length;
        if (n > most) { most = n; pick = [cell]; } else if (n === most) pick.push(cell);
      }
      return { cell: rnd(pick) };
    }
    const depth = level === 'hard' ? 4 : 2;
    let best = -Infinity, pick = [];
    for (const cell of moves) {
      const v = rvSearch(RV.move(s, me, { cell }), depth - 1, -Infinity, Infinity, me);
      if (v > best) { best = v; pick = [cell]; } else if (v === best) pick.push(cell);
    }
    return { cell: rnd(pick) };
  }

  /* ---------------- Käsekästchen ---------------- */
  const DT = G.dots;
  function dotLines(s) {
    const out = [];
    s.board.h.forEach((v, idx) => v === null && out.push({ kind: 'h', idx }));
    s.board.v.forEach((v, idx) => v === null && out.push({ kind: 'v', idx }));
    return out;
  }
  function sides(s, r, c) {
    const { W: BW } = DT;
    const { h, v } = s.board;
    return (h[r * BW + c] !== null) + (h[(r + 1) * BW + c] !== null) + (v[r * (BW + 1) + c] !== null) + (v[r * (BW + 1) + c + 1] !== null);
  }
  function boxesOf(mv) {
    const { W: BW, H: BH } = DT;
    const out = [];
    if (mv.kind === 'h') {
      const r = Math.floor(mv.idx / BW), c = mv.idx % BW;
      if (r > 0) out.push([r - 1, c]);
      if (r < BH) out.push([r, c]);
    } else {
      const r = Math.floor(mv.idx / (BW + 1)), c = mv.idx % (BW + 1);
      if (c > 0) out.push([r, c - 1]);
      if (c < BW) out.push([r, c]);
    }
    return out;
  }
  const closes = (s, mv) => boxesOf(mv).some(([r, c]) => sides(s, r, c) === 3);
  const safe = (s, mv) => boxesOf(mv).every(([r, c]) => sides(s, r, c) < 2);
  // Wie viele Kästchen kann der Gegner nach diesem Zug am Stück einsammeln?
  function giveaway(s, mv, me) {
    let n = DT.move(s, me, mv);
    let taken = 0, guard = 0;
    while (n && n.winner === null && !n.draw && guard++ < 80) {
      const take = dotLines(n).find((m) => closes(n, m));
      if (!take) break;
      const before = n.score[1 - me];
      n = DT.move(n, n.turn, take);
      taken += n.score[1 - me] - before;
    }
    return taken;
  }
  function dots(s, me, level) {
    const lines = dotLines(s);
    const closing = lines.filter((m) => closes(s, m));
    if (closing.length && (level !== 'easy' || chance(0.7))) return rnd(closing);
    if (level === 'easy') return rnd(lines);
    const safeMoves = lines.filter((m) => safe(s, m));
    if (safeMoves.length) return rnd(safeMoves);
    if (level === 'medium') return rnd(lines);
    let least = Infinity, pick = [];
    for (const m of lines) {
      const g = giveaway(s, m, me);
      if (g < least) { least = g; pick = [m]; } else if (g === least) pick.push(m);
    }
    return rnd(pick);
  }

  /* ---------------- Gomoku: Musterbewertung ---------------- */
  const GM = G.gomoku;
  function lineValue(count, open) {
    if (count >= 5) return 1000000;
    if (open === 0) return 0;
    if (count === 4) return open === 2 ? 100000 : 12000;
    if (count === 3) return open === 2 ? 10000 : 900;
    if (count === 2) return open === 2 ? 600 : 80;
    if (count === 1) return open === 2 ? 20 : 4;
    return 0;
  }
  function cellValue(board, cell, who) {
    const N = GM.SIZE;
    const r0 = Math.floor(cell / N), c0 = cell % N;
    let total = 0, strong = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let count = 1, open = 0;
      for (const sgn of [1, -1]) {
        let r = r0 + dr * sgn, c = c0 + dc * sgn;
        while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === who) { count++; r += dr * sgn; c += dc * sgn; }
        if (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === null) open++;
      }
      const v = lineValue(count, open);
      if (v >= 10000) strong++;
      total += v;
    }
    if (strong >= 2) total += 50000; // Doppeldrohung
    return total;
  }
  function gomoku(s, me, level) {
    const N = GM.SIZE;
    const b = s.board;
    if (b.every((v) => v === null)) return { cell: Math.floor(N / 2) * N + Math.floor(N / 2) };
    const cand = [];
    for (let i = 0; i < N * N; i++) {
      if (b[i] !== null) continue;
      const r = Math.floor(i / N), c = i % N;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2 && !near; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] !== null) near = true;
      }
      if (near) cand.push(i);
    }
    const defW = level === 'hard' ? 0.95 : level === 'medium' ? 0.7 : 0.4;
    const scored = cand.map((cell) => ({ cell, v: cellValue(b, cell, me) + defW * cellValue(b, cell, 1 - me) + Math.random() }));
    scored.sort((x, y) => y.v - x.v);
    if (level === 'easy') {
      const win = scored.find((m) => cellValue(b, m.cell, me) >= 1000000);
      if (win && chance(0.8)) return { cell: win.cell };
      return { cell: rnd(scored.slice(0, 6)).cell };
    }
    if (level === 'medium' && chance(0.25)) return { cell: rnd(scored.slice(0, 3)).cell };
    return { cell: scored[0].cell };
  }

  const impl = { tictactoe, connect4, reversi, dots, gomoku };
  const LEVELS = { easy: 'leicht', medium: 'mittel', hard: 'schwer' };

  return {
    LEVELS,
    supports: (game) => Object.hasOwn(impl, game),
    pick(game, state, player, level = 'medium') {
      return impl[game](state, player, LEVELS[level] ? level : 'medium');
    },
  };
});
