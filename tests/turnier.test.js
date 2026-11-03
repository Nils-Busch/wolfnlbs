import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../worker/src/tischtennis/logic.js";

test("Turnier: Satz-Prüfung", () => {
  assert.equal(L.validateSets([[11, 5], [11, 9]], 3).ok, true);
  assert.equal(L.validateSets([[11, 5], [11, 9]], 3).winner, 1);
  assert.equal(L.validateSets([[11, 10]], 1).ok, false, "zwei Punkte Abstand nötig");
  assert.equal(L.validateSets([[12, 10], [5, 11], [13, 11]], 3).winner, 1);
});

test("Turnier: Jeder gegen jeden – alle Paarungen genau einmal", () => {
  const ids = [1, 2, 3, 4, 5];
  const games = L.roundRobin(ids);
  assert.equal(games.length, 10);
  const pairs = new Set(games.map((g) => [g.a, g.b].sort().join("-")));
  assert.equal(pairs.size, 10);
});

test("Turnier: Setzliste und Zweierpotenzen", () => {
  assert.deepEqual(L.seedOrder(4), [1, 4, 2, 3]);
  assert.equal(L.nextPow2(5), 8);
  assert.equal(L.isPow2(16), true);
  assert.equal(L.isPow2(12), false);
});

test("Vereinsrangliste: Elo", () => {
  const r = L.eloRanking([{ a: "anna", b: "ben", result: 1 }]);
  assert.equal(r[0].key, "anna");
  assert.equal(r[0].rating + r[1].rating, 2000, "Punkte wandern nur zwischen den beiden");
  assert.equal(r[0].rating, 1020);
  const upset = L.eloRanking([
    ...Array.from({ length: 10 }, () => ({ a: "profi", b: "x", result: 1 })),
    { a: "neu", b: "profi", result: 1 },
  ]);
  const neu = upset.find((p) => p.key === "neu");
  assert.ok(neu.rating > 1020, "Sieg gegen Stärkere bringt mehr");
  const draw = L.eloRanking([{ a: "a", b: "b", result: 0.5 }]);
  assert.equal(draw[0].rating, 1000);
  assert.equal(draw[0].draws, 1);
});
