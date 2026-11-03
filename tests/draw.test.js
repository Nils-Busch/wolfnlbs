import { test } from "node:test";
import assert from "node:assert/strict";
import { DR_WORDS } from "../worker/src/spiele/partyExtra.js";
import { fakeRoom } from "./helpers.js";

function started(names = ["Anna", "Ben", "Clara"], settings) {
  const r = fakeRoom("draw", names, settings);
  r.drStart();
  assert.equal(r.s.phase, "CHOOSE");
  return r;
}

test("Montagsmaler: Wort wählen, raten, Punkte", () => {
  const r = started();
  const dr = r.s.dr;
  assert.equal(dr.choices.length, 3);
  r.drChoose(1);
  assert.equal(r.s.phase, "DRAW");
  const word = dr.word;
  const guessers = r.playersArr().filter((p) => p.id !== dr.drawer);
  assert.throws(() => r.drGuess(dr.drawer, word), /zeichnest/);
  const wrong = r.drGuess(guessers[0].id, "Quatsch");
  assert.equal(wrong.correct, undefined);
  const ok = r.drGuess(guessers[0].id, word.toUpperCase() + " ");
  assert.equal(ok.correct, true);
  assert.ok(ok.pts >= 8 && ok.pts <= 18, "schnell geraten = viele Punkte");
  assert.equal(r.s.players[dr.drawer].score, 4, "Zeichner bekommt Punkte pro Treffer");
  assert.deepEqual(r.drGuess(guessers[0].id, word), { already: true });
  r.drGuess(guessers[1].id, word);
  assert.equal(r.s.phase, "REVEAL", "alle haben es – Runde endet");
  assert.equal(r.s.gallery.length, 0, "ohne Striche kein Galeriebild");
});

test("Montagsmaler: knapp daneben wird erkannt, aber nicht verraten", () => {
  const r = started();
  r.s.dr.choices = ["Elefant", "Hund", "Katze"];
  r.drChoose(0);
  const g = r.playersArr().find((p) => p.id !== r.s.dr.drawer);
  const res = r.drGuess(g.id, "Elefnat");
  assert.equal(res.close, true);
  assert.equal(r.s.dr.feed.length, 0, "knappe Tipps erscheinen nicht für alle");
});

test("Montagsmaler: Striche prüfen, Galerie speichern", () => {
  const r = started();
  r.drChoose(0);
  const d = r.s.dr.drawer;
  const ink = r.drInk(d, { sid: "a1", c: r.s.dr.colors?.[0] || "#172036", w: 14, pts: [10, 10, 2000, -5], rev: r.s.dr.rev });
  assert.deepEqual(ink.pts, [10, 10, 1000, 0], "Koordinaten werden begrenzt");
  r.drInk(d, { sid: "a1", c: "#172036", w: 14, pts: [20, 20], rev: r.s.dr.rev });
  assert.equal(r.s.dr.strokes.length, 1, "gleiche Strich-ID wird fortgesetzt");
  assert.throws(() => r.drInk(d, { sid: "a2", c: "#123456", w: 14, pts: [1, 1], rev: r.s.dr.rev }), /Stift/);
  assert.equal(r.drInk(d, { sid: "x", c: "#172036", w: 14, pts: [1, 1], rev: r.s.dr.rev - 1 }), null, "alte Fassung wird ignoriert");
  r.drEndTurn("time");
  assert.equal(r.s.gallery.length, 1);
  assert.equal(r.pendingImgs.length, 1);
});

test("Montagsmaler: eigene Wörter", () => {
  const own = ["Vereinsheim", "Grillfest", "Trainer Heinz", "Pokalnacht"];
  const r = started(["Anna", "Ben"], { words: own, wordMode: "only" });
  assert.ok(r.s.dr.choices.every((w) => own.includes(w)), "nur eigene Wörter");
  const mix = started(["Anna", "Ben"], { words: own, wordMode: "mix" });
  assert.ok(mix.s.dr.choices.some((w) => own.includes(w)), "gemischt enthält eigene");
  assert.ok(mix.s.dr.choices.some((w) => DR_WORDS.includes(w)), "gemischt enthält eingebaute");
  const off = started(["Anna", "Ben"], { words: own, wordMode: "off" });
  assert.ok(off.s.dr.choices.every((w) => DR_WORDS.includes(w)));
});

test("Montagsmaler: jede Person zeichnet pro Runde einmal, dann Ende", () => {
  const r = started(["Anna", "Ben", "Clara"], { rounds: 2 });
  const drawers = [];
  while (r.s.phase !== "END") {
    drawers.push(r.s.dr.drawer);
    r.drChoose(0);
    r.drEndTurn("time");
    r.drNextTurn();
  }
  assert.equal(drawers.length, 6);
  for (const id of ["p0", "p1", "p2"]) assert.equal(drawers.filter((x) => x === id).length, 2);
});
