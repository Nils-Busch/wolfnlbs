// Einzelspiele: Superhirn, Steckhalma, Patience und Sudoku (Regeln ohne Bildschirm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seeded } from "./helpers.js";

// Die Dateien sind normale Browser-Skripte; hier werden sie in einer eigenen Umgebung ausgeführt.
const browserScript = (file, name) => vm.runInNewContext(`${readFileSync(new URL(file, import.meta.url), "utf8")}\n;${name}`, {});
const { superhirn, steckhalma, patience } = browserScript("../client-assets/spiele/js/solo-regeln.js", "SoloRegeln");
const Sudoku = browserScript("../client-assets/raetsel/js/sudoku-core.js", "SudokuCore");
const plain = (x) => JSON.parse(JSON.stringify(x));

test("Superhirn: schwarz und weiß richtig gezählt", () => {
  assert.deepEqual(plain(superhirn.bewerten([0, 1, 2, 3], [0, 1, 2, 3])), { schwarz: 4, weiss: 0 });
  assert.deepEqual(plain(superhirn.bewerten([0, 1, 2, 3], [3, 2, 1, 0])), { schwarz: 0, weiss: 4 });
  assert.deepEqual(plain(superhirn.bewerten([0, 0, 1, 1], [0, 1, 0, 2])), { schwarz: 1, weiss: 2 });
  assert.deepEqual(plain(superhirn.bewerten([5, 5, 5, 5], [5, 4, 4, 4])), { schwarz: 1, weiss: 0 }, "doppelte Farben nicht doppelt zählen");
  assert.deepEqual(plain(superhirn.bewerten([1, 2, 3, 4], [4, 4, 4, 4])), { schwarz: 1, weiss: 0 });
  const code = superhirn.code(seeded(3));
  assert.equal(code.length, 4);
  assert.ok(code.every((f) => f >= 0 && f < 6));
});

test("Steckhalma: Start, Sprünge und Ende", () => {
  const b = steckhalma.start();
  assert.equal(b.filter((v) => v !== null).length, 33, "33 Löcher");
  assert.equal(steckhalma.rest(b), 32);
  assert.equal(b[steckhalma.MITTE], 0, "Mitte frei");
  assert.equal(steckhalma.zuege(b).length, 4, "am Anfang gehen genau 4 Sprünge");
  const von = 1 * 7 + 3, nach = steckhalma.MITTE;
  const b2 = steckhalma.springen(b, von, nach);
  assert.ok(b2);
  assert.equal(b2[nach], 1); assert.equal(b2[von], 0); assert.equal(b2[2 * 7 + 3], 0);
  assert.equal(steckhalma.rest(b2), 31);
  assert.equal(steckhalma.springen(b2, von, nach), null, "kein Sprung auf besetztes Feld");
  assert.equal(steckhalma.sprung(b, 0, 2), -1, "Ecke ist kein Loch");
  assert.equal(steckhalma.sprung(b, 3 * 7 + 1, 3 * 7 + 3), 3 * 7 + 2, "waagerecht über die Nachbarin");
});

test("Patience: Geben und Anlegen", () => {
  const s = patience.geben(seeded(7));
  assert.equal(s.reihen.reduce((n, r) => n + r.length, 0), 28);
  assert.equal(s.stapel.length, 24);
  assert.ok(s.reihen.every((r) => r[r.length - 1].offen && r.slice(0, -1).every((x) => !x.offen)));
  const alle = [...s.stapel, ...s.reihen.flat().map((x) => x.id)].sort((a, b) => a - b);
  assert.deepEqual(alle, [...Array(52).keys()], "jede Karte genau einmal");
  // Herz-Sieben (id 19) auf Pik-Acht (id 7)
  assert.equal(patience.passtAufReihe(19, 7), true);
  assert.equal(patience.passtAufReihe(18 + 1, 20), false, "gleiche Farbe geht nicht");
  assert.equal(patience.passtAufReihe(12, null), true, "König auf leere Reihe");
  assert.equal(patience.passtAufReihe(11, null), false);
  assert.equal(patience.passtAufZiel(0, []), true, "Ass zuerst");
  assert.equal(patience.passtAufZiel(1, [0]), true);
  assert.equal(patience.passtAufZiel(14, [0]), false, "andere Farbe");
  assert.equal(patience.folgeOk([{ id: 7, offen: true }, { id: 19, offen: true }], 0), true);
  assert.equal(patience.folgeOk([{ id: 7, offen: false }, { id: 19, offen: true }], 0), false);
});

test("Sudoku: eindeutige Rätsel in drei Stufen", () => {
  for (const stufe of [1, 2, 3]) {
    const { raetsel, loesung, vorgaben } = Sudoku.erzeugen(seeded(100 + stufe), stufe);
    assert.equal(raetsel.filter(Boolean).length, vorgaben);
    assert.ok(vorgaben <= Sudoku.STUFEN[stufe].vorgaben + 3, `Stufe ${stufe}: ${vorgaben} Vorgaben`);
    assert.equal(Sudoku.loesungen(raetsel, 2), 1, "genau eine Lösung");
    assert.deepEqual(Sudoku.loesen(raetsel), loesung);
    raetsel.forEach((d, i) => d && assert.equal(d, loesung[i]));
    for (let i = 0; i < 81; i++) for (const j of Sudoku.NACHBARN[i]) assert.notEqual(loesung[i], loesung[j]);
  }
});

test("Sudoku: gleicher Startwert, gleiches Rätsel (Tagesrätsel)", () => {
  const a = Sudoku.erzeugen(seeded(2026), 2), b = Sudoku.erzeugen(seeded(2026), 2);
  assert.deepEqual(a.raetsel, b.raetsel);
});
