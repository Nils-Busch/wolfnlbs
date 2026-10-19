/**
 * Spielregeln der Duell-Spiele.
 * Wird vom Server (Online-Modus, prüft jeden Zug) und vom Browser (lokaler Modus) genutzt.
 * move(state, spieler, zug) liefert einen neuen Zustand oder null bei ungültigem Zug.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function base(board, turn) {
    return { board, turn, winner: null, line: null, draw: false, last: null };
  }

  /* ---------------- Tic-Tac-Toe ---------------- */
  const TTT_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  const tictactoe = {
    init(starter = 0) {
      return base(Array(9).fill(null), starter);
    },
    move(s, player, mv) {
      if (s.winner !== null || s.draw || player !== s.turn) return null;
      const cell = mv && mv.cell;
      if (!Number.isInteger(cell) || cell < 0 || cell > 8 || s.board[cell] !== null) return null;
      const board = s.board.slice();
      board[cell] = player;
      const n = base(board, 1 - player);
      n.last = cell;
      const line = TTT_LINES.find((l) => l.every((i) => board[i] === player));
      if (line) {
        n.winner = player;
        n.line = line;
      } else if (board.every((v) => v !== null)) n.draw = true;
      return n;
    },
  };

  /* ---------------- Vier gewinnt ---------------- */
  const ROWS = 6, COLS = 7;

  const connect4 = {
    ROWS,
    COLS,
    init(starter = 0) {
      return base(Array(ROWS * COLS).fill(null), starter);
    },
    move(s, player, mv) {
      if (s.winner !== null || s.draw || player !== s.turn) return null;
      const col = mv && mv.col;
      if (!Number.isInteger(col) || col < 0 || col >= COLS) return null;
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (s.board[r * COLS + col] === null) { row = r; break; }
      }
      if (row < 0) return null; // Spalte voll
      const board = s.board.slice();
      const idx = row * COLS + col;
      board[idx] = player;
      const n = base(board, 1 - player);
      n.last = idx;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const line = [idx];
        for (const sgn of [1, -1]) {
          let r = row + dr * sgn, c = col + dc * sgn;
          while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === player) {
            line.push(r * COLS + c);
            r += dr * sgn;
            c += dc * sgn;
          }
        }
        if (line.length >= 4) { n.winner = player; n.line = line; break; }
      }
      if (n.winner === null && board.every((v) => v !== null)) n.draw = true;
      return n;
    },
  };

  /* ---------------- Reversi ---------------- */
  const R = 8;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function flipsFor(board, player, cell) {
    if (board[cell] !== null) return [];
    const r0 = Math.floor(cell / R), c0 = cell % R;
    const all = [];
    for (const [dr, dc] of DIRS) {
      const run = [];
      let r = r0 + dr, c = c0 + dc;
      while (r >= 0 && r < R && c >= 0 && c < R && board[r * R + c] === 1 - player) {
        run.push(r * R + c);
        r += dr; c += dc;
      }
      if (run.length && r >= 0 && r < R && c >= 0 && c < R && board[r * R + c] === player) all.push(...run);
    }
    return all;
  }

  function validMoves(board, player) {
    const out = [];
    for (let i = 0; i < R * R; i++) if (board[i] === null && flipsFor(board, player, i).length) out.push(i);
    return out;
  }

  function count(board) {
    return [board.filter((v) => v === 0).length, board.filter((v) => v === 1).length];
  }

  const reversi = {
    SIZE: R,
    validMoves,
    count,
    init(starter = 0) {
      const b = Array(R * R).fill(null);
      b[27] = 1; b[28] = 0; b[35] = 0; b[36] = 1;
      const s = base(b, starter);
      s.passed = null;
      s.flipped = [];
      return s;
    },
    move(s, player, mv) {
      if (s.winner !== null || s.draw || player !== s.turn) return null;
      const cell = mv && mv.cell;
      if (!Number.isInteger(cell) || cell < 0 || cell >= R * R) return null;
      const flips = flipsFor(s.board, player, cell);
      if (!flips.length) return null;
      const board = s.board.slice();
      board[cell] = player;
      flips.forEach((i) => (board[i] = player));
      const n = base(board, 1 - player);
      n.last = cell;
      n.flipped = flips;
      n.passed = null;
      if (!validMoves(board, 1 - player).length) {
        if (validMoves(board, player).length) {
          n.turn = player;      // Gegner muss aussetzen
          n.passed = 1 - player;
        } else {
          const [a, b] = count(board); // keiner kann mehr ziehen
          if (a === b) n.draw = true;
          else n.winner = a > b ? 0 : 1;
        }
      }
      return n;
    },
  };

  /* ---------------- Käsekästchen (Dots & Boxes) ---------------- */
  const BW = 5, BH = 5; // Kästchen in Breite/Höhe

  const dots = {
    W: BW,
    H: BH,
    init(starter = 0) {
      return {
        board: {
          h: Array((BH + 1) * BW).fill(null), // waagerechte Striche
          v: Array(BH * (BW + 1)).fill(null), // senkrechte Striche
          boxes: Array(BW * BH).fill(null),
        },
        score: [0, 0],
        turn: starter, winner: null, line: null, draw: false, last: null,
      };
    },
    move(s, player, mv) {
      if (s.winner !== null || s.draw || player !== s.turn || !mv) return null;
      const kind = mv.kind, idx = mv.idx;
      if ((kind !== 'h' && kind !== 'v') || !Number.isInteger(idx)) return null;
      const arr = s.board[kind];
      if (idx < 0 || idx >= arr.length || arr[idx] !== null) return null;

      const h = s.board.h.slice(), v = s.board.v.slice(), boxes = s.board.boxes.slice();
      (kind === 'h' ? h : v)[idx] = player;

      const done = (r, c) =>
        r >= 0 && r < BH && c >= 0 && c < BW &&
        h[r * BW + c] !== null && h[(r + 1) * BW + c] !== null &&
        v[r * (BW + 1) + c] !== null && v[r * (BW + 1) + c + 1] !== null;

      const candidates = [];
      if (kind === 'h') {
        const r = Math.floor(idx / BW), c = idx % BW;
        candidates.push([r - 1, c], [r, c]);
      } else {
        const r = Math.floor(idx / (BW + 1)), c = idx % (BW + 1);
        candidates.push([r, c - 1], [r, c]);
      }
      const score = s.score.slice();
      let closed = 0;
      for (const [r, c] of candidates) {
        if (done(r, c) && boxes[r * BW + c] === null) {
          boxes[r * BW + c] = player;
          score[player]++;
          closed++;
        }
      }
      const n = {
        board: { h, v, boxes }, score,
        turn: closed ? player : 1 - player, // wer ein Kästchen schließt, ist nochmal dran
        winner: null, line: null, draw: false, last: { kind, idx },
      };
      if (boxes.every((b) => b !== null)) {
        if (score[0] === score[1]) n.draw = true;
        else n.winner = score[0] > score[1] ? 0 : 1;
      }
      return n;
    },
  };

  return {
    games: { tictactoe, connect4, reversi, dots },
    isOver: (s) => !!s && (s.winner !== null || s.draw),
  };
});
