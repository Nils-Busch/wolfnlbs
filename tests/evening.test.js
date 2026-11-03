import { test } from "node:test";
import assert from "node:assert/strict";
import { placements, eveningSummary, defaultSettings } from "../worker/src/spiele/evening.js";

test("Spieleabend: Platzierung mit Gleichstand", () => {
  const p = placements([{ id: "a", name: "A", score: 5 }, { id: "b", name: "B", score: 9 }, { id: "c", name: "C", score: 9 }, { id: "d", name: "D", score: 1 }]);
  assert.deepEqual(p.map((x) => [x.id, x.place, x.pts]), [["b", 1, 10], ["c", 1, 10], ["a", 3, 5], ["d", 4, 3]]);
});

test("Spieleabend: Gesamtwertung und Titel", () => {
  const evening = {
    played: [
      { game: "kniffel", name: "Kniffel", results: placements([{ id: "a", name: "Anna", score: 200 }, { id: "b", name: "Ben", score: 150 }]) },
      { game: "draw", name: "Montagsmaler", results: placements([{ id: "a", name: "Anna", score: 20 }, { id: "b", name: "Ben", score: 40 }]) },
      { game: "kniffel", name: "Kniffel", results: placements([{ id: "a", name: "Anna", score: 180 }, { id: "b", name: "Ben", score: 220 }, { id: "c", name: "Clara", score: 230 }]) },
    ],
  };
  const sum = eveningSummary(evening);
  assert.deepEqual(sum.ranking.map((r) => [r.name, r.points]), [["Ben", 24], ["Anna", 22], ["Clara", 10]]);
  const kn = sum.titles.find((t) => t.game === "kniffel");
  assert.equal(kn.title, "Würfelkönig");
  assert.ok(["Anna", "Clara"].includes(kn.name));
  assert.equal(sum.titles.find((t) => t.game === "draw").name, "Ben");
  assert.equal(sum.played.length, 3);
});

test("Standard-Einstellungen für alle Spiele", () => {
  for (const g of ["wwe", "slf", "kniffel", "maexchen", "draw"]) assert.ok(defaultSettings(g));
  assert.deepEqual(defaultSettings("draw").words, []);
});
