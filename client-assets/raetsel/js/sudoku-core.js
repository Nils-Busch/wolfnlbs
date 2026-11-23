/**
 * Sudoku-Kern: volles Gitter bauen, Felder entfernen, solange die Lösung
 * eindeutig bleibt, und Lösungen zählen. Läuft im Browser und in den Tests.
 *   SudokuCore.erzeugen(zufall, stufe) → { raetsel, loesung, vorgaben }
 *   SudokuCore.loesungen(gitter, grenze) → Anzahl Lösungen (höchstens grenze)
 * Gitter: 81 Zahlen, 0 = leer.
 */
const SudokuCore = (() => {
  'use strict';
  const R = [], C = [], B = [];
  for (let i = 0; i < 81; i++) {
    R[i] = Math.floor(i / 9);
    C[i] = i % 9;
    B[i] = Math.floor(R[i] / 3) * 3 + Math.floor(C[i] / 3);
  }
  // Nachbarn: alle Felder in derselben Zeile, Spalte oder demselben Block
  const NACHBARN = Array.from({ length: 81 }, (_, i) => {
    const out = [];
    for (let j = 0; j < 81; j++) if (j !== i && (R[j] === R[i] || C[j] === C[i] || B[j] === B[i])) out.push(j);
    return out;
  });
  const STUFEN = {
    1: { name: 'Leicht', vorgaben: 38 },
    2: { name: 'Mittel', vorgaben: 31 },
    3: { name: 'Schwer', vorgaben: 25 },
  };
  const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // Backtracking mit „Feld mit den wenigsten Möglichkeiten zuerst“
  function suche(gitter, grenze, reihenfolge) {
    const g = gitter.slice();
    const zr = new Array(9).fill(0), zc = new Array(9).fill(0), zb = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      const d = g[i];
      if (!d) continue;
      const b = 1 << d;
      if (zr[R[i]] & b || zc[C[i]] & b || zb[B[i]] & b) return { anzahl: 0, erste: null };
      zr[R[i]] |= b; zc[C[i]] |= b; zb[B[i]] |= b;
    }
    let anzahl = 0, erste = null;
    function weiter() {
      let best = -1, bestM = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ~(zr[R[i]] | zc[C[i]] | zb[B[i]]) & 0x3fe;
        const n = bits(m);
        if (n < bestN) { best = i; bestM = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) {
        anzahl++;
        if (!erste) erste = g.slice();
        return anzahl >= grenze;
      }
      if (!bestN) return false;
      for (const d of reihenfolge) {
        const b = 1 << d;
        if (!(bestM & b)) continue;
        g[best] = d; zr[R[best]] |= b; zc[C[best]] |= b; zb[B[best]] |= b;
        if (weiter()) return true;
        g[best] = 0; zr[R[best]] &= ~b; zc[C[best]] &= ~b; zb[B[best]] &= ~b;
      }
      return false;
    }
    weiter();
    return { anzahl, erste };
  }

  const loesungen = (gitter, grenze = 2) => suche(gitter, grenze, [1, 2, 3, 4, 5, 6, 7, 8, 9]).anzahl;
  const loesen = (gitter) => suche(gitter, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9]).erste;

  function mischen(arr, zufall) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(zufall() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function erzeugen(zufall = Math.random, stufe = 2) {
    const ziel = (STUFEN[stufe] || STUFEN[2]).vorgaben;
    const loesung = suche(new Array(81).fill(0), 1, mischen([1, 2, 3, 4, 5, 6, 7, 8, 9], zufall)).erste;
    const raetsel = loesung.slice();
    let vorgaben = 81;
    // paarweise und punktsymmetrisch entfernen, solange die Lösung eindeutig bleibt
    for (const i of mischen([...Array(41).keys()], zufall)) {
      if (vorgaben <= ziel) break;
      const j = 80 - i;
      const a = raetsel[i], b = raetsel[j];
      raetsel[i] = 0; raetsel[j] = 0;
      if (loesungen(raetsel, 2) !== 1) { raetsel[i] = a; raetsel[j] = b; continue; }
      vorgaben -= i === j ? 1 : 2;
    }
    // Reicht das nicht (meist bei „Schwer“), einzelne Felder nachlegen
    if (vorgaben > ziel) {
      for (const i of mischen([...Array(81).keys()], zufall)) {
        if (vorgaben <= ziel) break;
        if (!raetsel[i]) continue;
        const a = raetsel[i];
        raetsel[i] = 0;
        if (loesungen(raetsel, 2) !== 1) raetsel[i] = a;
        else vorgaben--;
      }
    }
    return { raetsel, loesung, vorgaben };
  }

  return { erzeugen, loesungen, loesen, NACHBARN, STUFEN, zeile: (i) => R[i], spalte: (i) => C[i], block: (i) => B[i] };
})();
if (typeof module !== 'undefined') module.exports = SudokuCore;
