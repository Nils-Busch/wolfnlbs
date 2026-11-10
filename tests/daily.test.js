import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsFor, GAMES } from "../worker/src/spiele/dailyStats.js";

test("Tagesrätsel: Punkte fürs Puzzle", () => {
  assert.ok(GAMES.includes("jig"));
  assert.equal(pointsFor("jig", 0), 600);
  assert.equal(pointsFor("jig", 300), 500, "5 Minuten = 500 Punkte");
  assert.equal(pointsFor("jig", 5000), 100, "nie unter 100");
});

test("Tagesrätsel: bisherige Wertungen unverändert", () => {
  assert.equal(pointsFor("wordle", 3), 400);
  assert.equal(pointsFor("nono", 200), 500);
  assert.equal(pointsFor("staedte", 4200), 420);
});
