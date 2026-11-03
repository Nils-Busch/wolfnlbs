import { test } from "node:test";
import assert from "node:assert/strict";
import { knScore, knTotals, KN_CATS } from "../worker/src/spiele/kniffel.js";

test("Kniffel: obere Felder zählen nur die passenden Augen", () => {
  assert.equal(knScore("ones", [1, 1, 3, 4, 1]), 3);
  assert.equal(knScore("sixes", [6, 6, 6, 2, 1]), 18);
  assert.equal(knScore("fives", [1, 2, 3, 4, 6]), 0);
});

test("Kniffel: Pasch, Full House, Straßen, Kniffel, Chance", () => {
  assert.equal(knScore("three", [3, 3, 3, 1, 2]), 12);
  assert.equal(knScore("three", [3, 3, 2, 1, 2]), 0);
  assert.equal(knScore("four", [5, 5, 5, 5, 2]), 22);
  assert.equal(knScore("full", [2, 2, 3, 3, 3]), 25);
  assert.equal(knScore("full", [2, 2, 3, 3, 4]), 0);
  assert.equal(knScore("full", [4, 4, 4, 4, 4]), 25, "Kniffel zählt auch als Full House");
  assert.equal(knScore("small", [1, 2, 3, 4, 6]), 30);
  assert.equal(knScore("small", [3, 4, 5, 6, 6]), 30);
  assert.equal(knScore("small", [1, 2, 3, 5, 6]), 0);
  assert.equal(knScore("large", [2, 3, 4, 5, 6]), 40);
  assert.equal(knScore("large", [1, 2, 3, 4, 6]), 0);
  assert.equal(knScore("kniffel", [6, 6, 6, 6, 6]), 50);
  assert.equal(knScore("chance", [1, 2, 3, 4, 6]), 16);
});

test("Kniffel: Bonus ab 63 Punkten oben", () => {
  const sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
  assert.deepEqual(knTotals(sheet), { upper: 63, bonus: 35, lower: 0, total: 98 });
  assert.equal(knTotals({ ...sheet, sixes: 12 }).bonus, 0);
  assert.equal(KN_CATS.length, 13);
});
