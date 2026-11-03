// Hilfen für die Tests: ein Gruppenspiel-Raum ohne Cloudflare (nur die Spiellogik).
import { extraMethods } from "../worker/src/spiele/partyExtra.js";
import { defaultSettings } from "../worker/src/spiele/evening.js";

export function fakeRoom(game, names, settings = {}) {
  const s = { game, phase: "LOBBY", players: {}, settings: { ...defaultSettings(game), ...settings }, round: 0, endsAt: null, runId: 1, gallery: [] };
  names.forEach((n, i) => {
    s.players["p" + i] = { id: "p" + i, name: n, score: 0, connected: true, joined: i, bot: /^Bot/.test(n) };
  });
  return Object.assign(
    {
      s,
      playersArr() { return Object.values(this.s.players).sort((a, b) => a.joined - b.joined); },
      online() { return this.playersArr().filter((p) => p.connected); },
    },
    extraMethods
  );
}

/** Zufall mit festem Startwert, damit Tests immer gleich laufen. */
export function seeded(seed = 42) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
