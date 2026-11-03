import { test } from "node:test";
import assert from "node:assert/strict";
import { Room, PHASES } from "../worker/src/woelfe/gameManager.js";
import { validateConfig, suggestWolfCount } from "../worker/src/woelfe/roles.js";

const transport = () => ({ sent: [], send() {}, broadcast() {}, scheduleAt() {} });

test("WoWölfe: Rollen-Prüfung", () => {
  assert.deepEqual(validateConfig(6, { wolves: 1, seer: true, witch: true, hunter: true }), []);
  assert.ok(validateConfig(3, { wolves: 1 }).length, "zu wenige Leute");
  assert.ok(validateConfig(6, { wolves: 1, urwolf: true }).length, "Urwolf braucht 2 Wölfe");
  assert.equal(suggestWolfCount(8), 2);
});

test("WoWölfe: Spielstart verteilt alle Rollen", () => {
  const room = new Room("TEST", transport());
  const names = ["Anna", "Ben", "Clara", "Dario", "Eva", "Finn"];
  names.forEach((name, i) => room.addPlayer({ name, token: "t" + i, isHost: i === 0 }));
  Object.assign(room.config, { wolves: 2, seer: true, witch: true, hunter: false, amor: false, wolfdog: false });
  room.startGame();
  const roles = [...room.players.values()].map((p) => p.role);
  const count = (r) => roles.filter((x) => x === r).length;
  assert.equal(count("WOLF"), 2);
  assert.equal(count("SEER"), 1);
  assert.equal(count("WITCH"), 1);
  assert.equal(count("VILLAGER"), 2);
  assert.ok([PHASES.NIGHT_WOLVES, PHASES.NIGHT_AMOR, PHASES.NIGHT_WOLFDOG].includes(room.phase));
});
