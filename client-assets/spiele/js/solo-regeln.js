/**
 * Regeln der Einzelspiele Superhirn, Steckhalma und Patience – ohne Bildschirm,
 * damit sie im Browser und in den Tests (Node) gleich laufen.
 *   SoloRegeln.superhirn.bewerten(code, tipp) → { schwarz, weiss }
 *   SoloRegeln.steckhalma.start() / zuege(brett) / sprung(brett, von, nach)
 *   SoloRegeln.patience.geben(zufall) / passtAufReihe(karte, oben) / passtAufAblage(karte, stapel)
 */
const SoloRegeln = (() => {
  'use strict';

  function mischen(arr, zufall = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(zufall() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- Superhirn ---------- */
  const superhirn = {
    FARBEN: 6,
    STELLEN: 4,
    VERSUCHE: 10,
    code(zufall = Math.random) {
      return Array.from({ length: 4 }, () => Math.floor(zufall() * 6));
    },
    // schwarz = richtige Farbe an richtiger Stelle, weiß = richtige Farbe an falscher Stelle
    bewerten(code, tipp) {
      let schwarz = 0;
      const restCode = [], restTipp = [];
      for (let i = 0; i < code.length; i++) {
        if (code[i] === tipp[i]) schwarz++;
        else { restCode.push(code[i]); restTipp.push(tipp[i]); }
      }
      let weiss = 0;
      for (const f of restTipp) {
        const k = restCode.indexOf(f);
        if (k >= 0) { weiss++; restCode.splice(k, 1); }
      }
      return { schwarz, weiss };
    },
  };

  /* ---------- Steckhalma (englisches Brett, 33 Löcher) ---------- */
  const N = 7;
  const gueltig = (r, c) => r >= 0 && c >= 0 && r < N && c < N && ((r >= 2 && r <= 4) || (c >= 2 && c <= 4));
  const RICHTUNGEN = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const steckhalma = {
    N,
    MITTE: 3 * N + 3,
    gueltig: (i) => gueltig(Math.floor(i / N), i % N),
    // null = kein Loch, 1 = Stift, 0 = leeres Loch
    start() {
      return Array.from({ length: N * N }, (_, i) => (gueltig(Math.floor(i / N), i % N) ? (i === 3 * N + 3 ? 0 : 1) : null));
    },
    // Feld, über das gesprungen wird, oder -1, wenn der Sprung nicht geht
    sprung(brett, von, nach) {
      const r1 = Math.floor(von / N), c1 = von % N, r2 = Math.floor(nach / N), c2 = nach % N;
      const dr = r2 - r1, dc = c2 - c1;
      if (!((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0))) return -1;
      const ueber = (r1 + dr / 2) * N + (c1 + dc / 2);
      return brett[von] === 1 && brett[ueber] === 1 && brett[nach] === 0 ? ueber : -1;
    },
    zieleVon(brett, von) {
      if (brett[von] !== 1) return [];
      const r = Math.floor(von / N), c = von % N, out = [];
      for (const [dr, dc] of RICHTUNGEN) {
        const rr = r + 2 * dr, cc = c + 2 * dc;
        if (!gueltig(rr, cc)) continue;
        const nach = rr * N + cc;
        if (steckhalma.sprung(brett, von, nach) >= 0) out.push(nach);
      }
      return out;
    },
    zuege(brett) {
      const out = [];
      brett.forEach((v, i) => { if (v === 1) for (const nach of steckhalma.zieleVon(brett, i)) out.push([i, nach]); });
      return out;
    },
    springen(brett, von, nach) {
      const ueber = steckhalma.sprung(brett, von, nach);
      if (ueber < 0) return null;
      const neu = brett.slice();
      neu[von] = 0; neu[ueber] = 0; neu[nach] = 1;
      return neu;
    },
    rest: (brett) => brett.filter((v) => v === 1).length,
  };

  /* ---------- Patience (Klondike, eine Karte ziehen) ---------- */
  // Karten 0 … 51: farbe = Math.floor(id / 13) (0 Pik, 1 Herz, 2 Karo, 3 Kreuz), wert = id % 13 + 1
  const karte = (id) => ({ id, farbe: Math.floor(id / 13), wert: (id % 13) + 1, rot: Math.floor(id / 13) === 1 || Math.floor(id / 13) === 2 });
  const patience = {
    karte,
    geben(zufall = Math.random) {
      const deck = mischen([...Array(52).keys()], zufall);
      const reihen = [];
      let k = 0;
      for (let i = 0; i < 7; i++) {
        const reihe = [];
        for (let j = 0; j <= i; j++) reihe.push({ id: deck[k++], offen: j === i });
        reihen.push(reihe);
      }
      return { stapel: deck.slice(k), ablage: [], ziel: [[], [], [], []], reihen };
    },
    // Karte auf eine Reihe legen: auf leere Reihe nur der König, sonst eins kleiner und andere Farbe
    passtAufReihe(id, obenId) {
      const k = karte(id);
      if (obenId == null) return k.wert === 13;
      const o = karte(obenId);
      return o.rot !== k.rot && k.wert === o.wert - 1;
    },
    // Karte auf einen Zielstapel: Ass zuerst, dann gleiche Farbe aufsteigend
    passtAufZiel(id, stapel) {
      const k = karte(id);
      if (!stapel.length) return k.wert === 1;
      const o = karte(stapel[stapel.length - 1]);
      return o.farbe === k.farbe && k.wert === o.wert + 1;
    },
    // Eine offene Folge in einer Reihe ab Position i, die man zusammen bewegen darf
    folgeOk(reihe, i) {
      if (!reihe[i] || !reihe[i].offen) return false;
      for (let j = i + 1; j < reihe.length; j++) if (!patience.passtAufReihe(reihe[j].id, reihe[j - 1].id)) return false;
      return true;
    },
    gewonnen: (s) => s.ziel.every((z) => z.length === 13),
    // Alles offen und nichts mehr im Stapel: dann kann der Rest automatisch auf die Ziele
    fertigLegbar: (s) => !s.stapel.length && !s.ablage.length && s.reihen.every((r) => r.every((x) => x.offen)),
  };

  return { mischen, superhirn, steckhalma, patience };
})();
if (typeof module !== 'undefined') module.exports = SoloRegeln;
