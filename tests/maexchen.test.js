import { test } from "node:test";
import assert from "node:assert/strict";
import { MX_ORDER, mxValue, mxBotSay, mxBotDoubt, mxAtLeast } from "../worker/src/spiele/partyExtra.js";
import { fakeRoom, seeded } from "./helpers.js";

test("Mäxchen: Werte und Reihenfolge", () => {
  assert.equal(mxValue([5, 3]), 53);
  assert.equal(mxValue([3, 5]), 53);
  assert.equal(mxValue([4, 4]), 44);
  assert.equal(mxValue([1, 2]), 21);
  assert.equal(mxValue([2, 1]), 21);
  assert.equal(MX_ORDER.at(-1), 21, "Mäxchen ist das Höchste");
  assert.ok(MX_ORDER.indexOf(11) > MX_ORDER.indexOf(65), "Pasch schlägt 65");
  assert.ok(Math.abs(mxAtLeast(31) - 1) < 1e-9, "irgendein Wurf ist mindestens 31");
});

test("Mäxchen: Computer sagen immer etwas Höheres an", () => {
  const rnd = seeded(7);
  for (let i = 0; i < 500; i++) {
    const prev = MX_ORDER[Math.floor(rnd() * (MX_ORDER.length - 1))];
    const dice = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    for (const lvl of ["easy", "medium", "hard"]) {
      const say = mxBotSay(dice, prev, lvl, rnd);
      assert.ok(MX_ORDER.indexOf(say) > MX_ORDER.indexOf(prev), `${say} muss ${prev} schlagen`);
    }
  }
  assert.equal(typeof mxBotDoubt(21, "hard"), "boolean");
});

test("Mäxchen: Lüge aufgedeckt – Lügner verliert, Mäxchen kostet zwei Deckel", () => {
  const r = fakeRoom("maexchen", ["Anna", "Ben"], { lives: 3 });
  r.mxStart();
  const [a, b] = r.s.mx.order;
  r.s.mx.cur = a;
  r.mxAct(a, { action: "roll" });
  r.s.mx.dice = [3, 1]; // in Wahrheit 31
  r.mxAct(a, { action: "say", value: 21 }); // behauptet Mäxchen
  assert.equal(r.s.mx.cur, b);
  r.mxAct(b, { action: "reveal" });
  assert.equal(r.s.mx.reveal.truth, false);
  assert.equal(r.s.mx.reveal.loser, a);
  r.mxLose(r.s.mx.reveal.loser, r.s.mx.reveal.amount);
  assert.equal(r.s.mx.lives[a], 1);
  assert.equal(r.s.mx.cur, a, "wer verliert, fängt an");
});

test("Mäxchen: zu Unrecht gezweifelt kostet den Zweifler", () => {
  const r = fakeRoom("maexchen", ["Anna", "Ben"]);
  r.mxStart();
  const [a, b] = r.s.mx.order;
  r.s.mx.cur = a;
  r.mxAct(a, { action: "roll" });
  r.s.mx.dice = [6, 6];
  r.mxAct(a, { action: "say", value: 55 });
  r.mxAct(b, { action: "reveal" });
  assert.equal(r.s.mx.reveal.truth, true);
  assert.equal(r.s.mx.reveal.loser, b);
  assert.throws(() => r.mxAct(b, { action: "roll" }), "während des Aufdeckens geht nichts");
});

test("Mäxchen: Ansage muss höher sein, nur wer dran ist darf", () => {
  const r = fakeRoom("maexchen", ["Anna", "Ben", "Clara"]);
  r.mxStart();
  const [a, b] = r.s.mx.order;
  r.s.mx.cur = a;
  assert.throws(() => r.mxAct(b, { action: "roll" }), /nicht dran/);
  r.mxAct(a, { action: "roll" });
  r.mxAct(a, { action: "say", value: 54 });
  r.mxAct(b, { action: "believe" });
  assert.throws(() => r.mxAct(b, { action: "say", value: 53 }), /mehr als 54/);
});

test("Mäxchen: eine Partie nur mit Computern endet mit genau einem Sieger", () => {
  for (let g = 0; g < 20; g++) {
    const r = fakeRoom("maexchen", ["Bot1", "Bot2", "Bot3", "Bot4"], { lives: 3, botLevel: ["easy", "medium", "hard"][g % 3] });
    r.mxStart();
    let steps = 0;
    while (r.s.phase === "PLAYING" && steps++ < 5000) {
      if (r.s.mx.step === "reveal") r.mxLose(r.s.mx.reveal.loser, r.s.mx.reveal.amount);
      else r.mxBotStep();
    }
    assert.equal(r.s.phase, "END", "Spiel endet");
    assert.ok(r.s.mx.winner, "es gibt einen Sieger");
    assert.equal(r.mxAlive().length, 1);
    const scores = r.playersArr().map((p) => p.score).sort((x, y) => x - y);
    assert.deepEqual(scores, [1, 2, 3, 4], "Platzierung als Punkte");
  }
});

test("Mäxchen: Rauswurf der Person am Zug geht sauber weiter", () => {
  const r = fakeRoom("maexchen", ["Anna", "Ben", "Clara"]);
  r.mxStart();
  const cur = r.s.mx.cur;
  delete r.s.players[cur];
  r.mxRemove(cur);
  assert.notEqual(r.s.mx.cur, cur);
  assert.equal(r.s.phase, "PLAYING");
});
