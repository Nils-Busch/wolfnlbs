import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTeams, shuffleTeams, makeBoard, pickBoardWords, clueProblem, parseCards, cardsText, buildDeck, teamMethods } from "../worker/src/spiele/teamGames.js";
import { AG_WORDS, EX_CARDS } from "../worker/src/spiele/teamWords.js";
import { defaultSettings, teamPlacements, eveningSummary } from "../worker/src/spiele/evening.js";

// Kleiner Nachbau des Raums: nur das, was die Team-Methoden brauchen
function room(game, n) {
  const r = Object.assign({ s: { game, settings: defaultSettings(game), players: {}, teams: {}, phase: "LOBBY", round: 0 } }, teamMethods);
  r.playersArr = () => Object.values(r.s.players).sort((a, b) => a.joined - b.joined);
  for (let i = 0; i < n; i++) r.s.players["p" + i] = { id: "p" + i, name: "P" + i, joined: i, score: 0 };
  return r;
}

test("Wortlisten: genug Material und keine Doppelten", () => {
  assert.ok(AG_WORDS.length >= 300);
  assert.equal(new Set(AG_WORDS).size, AG_WORDS.length);
  assert.ok(EX_CARDS.length >= 120);
  for (const c of EX_CARDS) assert.equal(c.f.length, 5, c.t);
});

test("Teams: ausgeglichen, bestehende Zuordnung bleibt", () => {
  const t = fillTeams({ a: 1 }, ["a", "b", "c", "d", "e"]);
  assert.equal(t.a, 1);
  const c0 = Object.values(t).filter((x) => x === 0).length;
  assert.ok(Math.abs(c0 - (5 - c0)) <= 1);
  const s = shuffleTeams(["a", "b", "c", "d"]);
  assert.equal(Object.values(s).filter((x) => x === 0).length, 2);
});

test("Agentenrunde: Spielfeld 9/8/7/1", () => {
  const words = pickBoardWords({});
  assert.equal(words.length, 25);
  const b = makeBoard(words, 1);
  const count = (k) => b.key.filter((x) => x === k).length;
  assert.deepEqual([count(1), count(0), count("n"), count("x")], [9, 8, 7, 1]);
});

test("Agentenrunde: eigene Wörter je nach Modus", () => {
  const own = Array.from({ length: 30 }, (_, i) => "Eigen" + i);
  assert.equal(pickBoardWords({ own, mode: "only" }).filter((w) => w.startsWith("Eigen")).length, 25);
  assert.equal(pickBoardWords({ own, mode: "mix" }).filter((w) => w.startsWith("Eigen")).length, 10);
  assert.equal(pickBoardWords({ own, mode: "off" }).filter((w) => w.startsWith("Eigen")).length, 0);
});

test("Agentenrunde: Hinweise prüfen", () => {
  const board = ["Bank", "Schloss", "Tor", "Fußball"];
  assert.equal(clueProblem("Geld", 2, board), null);
  assert.match(clueProblem("zwei Wörter", 1, board), /einziges Wort/);
  assert.match(clueProblem("bank", 1, board), /steckt/);
  assert.match(clueProblem("Fußballschuh", 1, board), /steckt/);
  assert.equal(clueProblem("Motor", 1, board), null); // „Tor“ ist zu kurz für Teilwort-Treffer
  assert.equal(clueProblem("Bank", 1, board, [true]), null); // aufgedeckte Karten zählen nicht
  assert.match(clueProblem("Geld", 0, board), /Zahl/);
});

test("Agentenrunde: Ablauf mit Markieren, Aufdecken und Zugwechsel", () => {
  const r = room("agent", 4);
  r.agStart();
  const ag = r.s.ag;
  assert.equal(r.s.phase, "PLAYING");
  const t = ag.turn;
  const spy = ag.spy[t];
  const guesser = r.tmMembers(t).find((id) => id !== spy);
  assert.throws(() => r.agTap(guesser, 0), /nicht geraten/);
  assert.throws(() => r.agClue(guesser, "Hallo", 1), /Funker/);
  r.agClue(spy, "Zzzyx", 1);
  assert.equal(ag.step, "guess");
  assert.throws(() => r.agPass(guesser), /mindestens eine/);
  const own = ag.key.findIndex((k) => k === t);
  assert.deepEqual(r.agTap(guesser, own), { marked: own });
  assert.equal(ag.open[own], false);
  assert.deepEqual(r.agTap(guesser, own), { revealed: t });
  assert.equal(ag.open[own], true);
  assert.equal(ag.step, "guess"); // n = 1 → noch ein Bonusversuch
  const neutral = ag.key.findIndex((k) => k === "n");
  r.agTap(guesser, neutral);
  r.agTap(guesser, neutral);
  assert.equal(ag.turn, 1 - t);
  assert.equal(ag.step, "clue");
  const view = r.agView(guesser);
  assert.equal(view.cards.filter((c) => c.k != null).length, 2); // ratende Person sieht nur Aufgedecktes
  assert.equal(r.agView(spy).cards.filter((c) => c.k != null).length, 25);
});

test("Agentenrunde: Doppelagent beendet die Partie", () => {
  const r = room("agent", 4);
  r.s.settings.rounds = 2;
  r.agStart();
  const ag = r.s.ag;
  const t = ag.turn;
  r.agClue(ag.spy[t], "Qwz", 3);
  const g = r.tmMembers(t).find((id) => id !== ag.spy[t]);
  const x = ag.key.indexOf("x");
  r.agTap(g, x);
  r.agTap(g, x);
  assert.equal(ag.winner, 1 - t);
  assert.equal(ag.reason, "trap");
  assert.equal(r.s.phase, "BOARD");
  assert.equal(r.s.players[g].score, 0);
  r.agNext();
  assert.equal(r.s.phase, "PLAYING");
  assert.equal(ag.match, 2);
  assert.equal(ag.start, 1 - t); // Startteam wechselt
  assert.equal(ag.turn, ag.start);
});

test("Agentenrunde: alle Agenten gefunden", () => {
  const r = room("agent", 5);
  r.agStart();
  const ag = r.s.ag;
  const t = ag.turn;
  const g = r.tmMembers(t).find((id) => id !== ag.spy[t]);
  r.agClue(ag.spy[t], "Qwz", 9);
  ag.key.forEach((k, i) => {
    if (k === t && r.s.phase === "PLAYING") { r.agTap(g, i); r.agTap(g, i); }
  });
  assert.equal(r.s.phase, "END");
  assert.equal(ag.winner, t);
  for (const id of r.tmMembers(t)) assert.equal(r.s.players[id].score, 1);
});

test("Agentenrunde: Funker verlässt das Spiel", () => {
  const r = room("agent", 5);
  r.agStart();
  const ag = r.s.ag;
  const t = ag.turn;
  const spy = ag.spy[t];
  delete r.s.players[spy];
  r.tmRemove(spy);
  assert.notEqual(ag.spy[t], spy);
  assert.ok(r.s.players[ag.spy[t]]);
});

test("Erklärbär: Karten einlesen", () => {
  const cards = parseCards("Vereinsheim: Verein, Haus, Bier\nGrillfest | Grill, Wurst\n\nVereinsheim: doppelt\nX");
  assert.deepEqual(cards.map((c) => c.t), ["Vereinsheim", "Grillfest"]);
  assert.deepEqual(cards[1].f, ["Grill", "Wurst"]);
  assert.equal(cardsText(cards), "Vereinsheim: Verein, Haus, Bier\nGrillfest: Grill, Wurst");
  const deck = buildDeck({ own: cards, mode: "mix" });
  assert.ok(deck.slice(0, 6).some((c) => c.t === "Vereinsheim"));
  assert.equal(buildDeck({ own: cards, mode: "only" }).length, EX_CARDS.length + 2); // zu wenige eigene → gemischt
});

test("Erklärbär: Runden, Punkte und Rollen", () => {
  const r = room("explain", 4);
  r.s.settings.rounds = 1;
  r.exStart();
  const ex = r.s.ex;
  assert.equal(r.s.phase, "READY");
  const team = ex.team;
  const explainer = ex.explainer;
  const mate = r.tmMembers(team).find((id) => id !== explainer);
  const opp = r.tmMembers(1 - team)[0];
  assert.throws(() => r.exGo(mate, false), /startet/);
  r.exGo(explainer, false);
  assert.equal(r.s.phase, "PLAY");
  assert.equal(r.exView(mate).card, null);
  assert.ok(r.exView(opp).card);
  assert.ok(r.exView(explainer).card);
  assert.throws(() => r.exMark(mate, "ok", ex.pos), /erklärt/);
  r.exMark(explainer, "ok", ex.pos);
  r.exMark(explainer, "ok", ex.pos);
  r.exMark(explainer, "skip", ex.pos);
  assert.deepEqual(r.exMark(opp, "buzz", ex.pos - 1), { stale: true });
  r.exMark(opp, "buzz", ex.pos);
  assert.equal(ex.scores[team], 1);
  assert.equal(r.s.players[explainer].score, 1);
  r.exEndTurn();
  assert.equal(r.s.phase, "READY");
  assert.equal(ex.team, 1 - team);
  assert.equal(ex.last.pts, 1);
  r.exGo(ex.explainer, false);
  r.exEndTurn();
  assert.equal(r.s.phase, "END");
});

test("Teamspiele im Spieleabend: ganzes Team teilt den Platz", () => {
  const p = teamPlacements([{ id: "a", name: "A", score: 2, team: 0 }, { id: "b", name: "B", score: 2, team: 0 }, { id: "c", name: "C", score: 1, team: 1 }]);
  assert.deepEqual(p.map((x) => [x.id, x.place, x.pts]), [["a", 1, 10], ["b", 1, 10], ["c", 2, 7]]);
  const sum = eveningSummary({ played: [{ game: "agent", name: "Agentenrunde", results: p }] });
  assert.equal(sum.titles[0].title, "Meisterspion");
  const tie = teamPlacements([{ id: "a", name: "A", score: 1 }, { id: "c", name: "C", score: 1 }]);
  assert.deepEqual(tie.map((x) => x.place), [1, 1]);
});
