export { DuelRoom } from "./duelRoom.js";
export { Leaderboard } from "./leaderboard.js";
export { Wordle } from "./wordle.js";
export { PartyRoom } from "./partyRoom.js";

import { games as DUEL_GAMES } from "./rules.js";
import { recordResult, dailyBoard, backfillIfEmpty, myStats } from "./dailyStats.js";
import { resolveName, NameError } from "./names.js";

// 'desc' = mehr ist besser, 'asc' = weniger ist besser (z.B. Züge bei Memory).
const SCORE_ORDER = { snake: "desc", "2048": "desc", memory: "asc", blockfall: "desc", mines9: "asc", mines16: "asc" };
// Tagesrätsel: eine Bestenliste pro Tag, z. B. "staedte20261026" (Punkte) oder "nono20261026" (Sekunden).
// conn = Connections: Fehler × 10000 + Sekunden (weniger ist besser)
const DAILY_ORDER = { staedte: "desc", nono: "asc", conn: "asc" };
const DAILY_MAX = { staedte: 5000, nono: 24 * 3600, conn: 3 * 10000 + 24 * 3600 };

function scoreOrder(game) {
  if (Object.hasOwn(SCORE_ORDER, game)) return SCORE_ORDER[game];
  const m = game.match(/^([a-z]+)(\d{8})$/);
  if (!m || !Object.hasOwn(DAILY_ORDER, m[1])) return null;
  // nur heute und gestern (Zeitzone egal) annehmen
  const today = new Date();
  const ok = [0, 1, -1].some((d) => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10).replaceAll("-", "") === m[2]);
  return ok ? DAILY_ORDER[m[1]] : null;
}
function scoreMax(game) {
  const m = game.match(/^([a-z]+)\d{8}$/);
  return m && DAILY_MAX[m[1]] ? DAILY_MAX[m[1]] : 10_000_000;
}
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function randomCode(length = 4) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return code;
}

function isValidCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{4}$/.test(code);
}

function leaderboardStub(env) {
  return env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"));
}
function duelStub(env, code) {
  return env.DUEL_ROOM.get(env.DUEL_ROOM.idFromName(code));
}

function wordleStub(env) {
  return env.WORDLE.get(env.WORDLE.idFromName("global"));
}

async function readJson(request) {
  try {
    const text = await request.text();
    if (text.length > 2000) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

// ---------- Wordle ----------
//   POST /wordle/start   { mode: "daily" | "free" }
//   GET  /wordle/session/:id
//   POST /wordle/guess   { sessionId, word }
//   POST /wordle/submit  { sessionId, name }
//   GET  /wordle/board[?date=JJJJ-MM-TT]
async function handleWordle(request, env, path) {
  const stub = wordleStub(env);
  const method = request.method;
  const asResult = (r) => (r && r.error ? json(r, 400) : json(r));

  if (path === "/wordle/board" && method === "GET") {
    return json(await stub.board(new URL(request.url).searchParams.get("date")));
  }
  const sm = path.match(/^\/wordle\/session\/([a-f0-9]{32})$/);
  if (sm && method === "GET") {
    const v = await stub.get(sm[1]);
    return v ? json(v) : json({ error: "Diese Runde gibt es nicht mehr." }, 404);
  }
  if (method !== "POST") return json({ error: "Nicht gefunden." }, 404);
  const body = await readJson(request);
  if (!body) return json({ error: "Ungültige Daten" }, 400);
  const id = typeof body.sessionId === "string" && /^[a-f0-9]{32}$/.test(body.sessionId) ? body.sessionId : null;

  if (path === "/wordle/start") return json(await stub.start(body.mode === "free" ? "free" : "daily"));
  if (path === "/wordle/guess") {
    if (!id) return json({ error: "Runde fehlt." }, 400);
    return asResult(await stub.guess(id, body.word));
  }
  if (path === "/wordle/submit") {
    if (!id) return json({ error: "Runde fehlt." }, 400);
    let who;
    try {
      who = await resolveName(request, env, body.name);
    } catch (e) {
      if (e instanceof NameError) return json({ error: e.message }, 403);
      throw e;
    }
    const r = await stub.submit(id, who.name);
    if (r && !r.error && r.entry) await recordResult(env, { game: "wordle", name: r.entry.name, userId: who.userId, date: r.date, raw: r.entry.attempts });
    return asResult(r);
  }
  return json({ error: "Nicht gefunden." }, 404);
}

function partyStub(env, code) {
  return env.PARTY_ROOM.get(env.PARTY_ROOM.idFromName(code));
}

// ---------- Gruppenspiele (Wer würde eher, Stadt-Land-Fluss) ----------
//   POST /party            { game: "wwe" | "slf" } -> { roomCode, hostKey }
//   GET  /party/:code      Gibt es den Raum?
//   GET  /party/:code/ws   WebSocket für Bildschirm und Handys
async function handleParty(request, env, path) {
  if (path === "/party" && request.method === "POST") {
    const body = (await readJson(request)) || {};
    const game = body.game === "slf" ? "slf" : body.game === "wwe" ? "wwe" : null;
    if (!game) return json({ error: "Unbekanntes Spiel" }, 400);
    const hostKey = randomCode(12) + randomCode(12);
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = randomCode();
      const r = await partyStub(env, code).init(code, { game, hostKey });
      if (r.created) return json({ ok: true, roomCode: code, hostKey });
    }
    return json({ error: "Konnte keinen freien Raum-Code finden." }, 503);
  }
  const ws = path.match(/^\/party\/([^/]+)\/ws$/);
  if (ws) {
    const code = decodeURIComponent(ws[1]).toUpperCase();
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket erwartet." }, 426);
    if (!isValidCode(code)) return json({ error: "Ungültiger Raum-Code." }, 404);
    return partyStub(env, code).fetch(request);
  }
  const info = path.match(/^\/party\/([^/]+)$/);
  if (info && request.method === "GET") {
    const code = decodeURIComponent(info[1]).toUpperCase();
    if (!isValidCode(code)) return json({ exists: false });
    return json(await partyStub(env, code).exists());
  }
  return json({ error: "Nicht gefunden." }, 404);
}

// path: der Teil nach "/api/spiele".
export async function handleSpiele(request, env, path) {
  if (path === "/party" || path.startsWith("/party/")) return handleParty(request, env, path);
  if (path.startsWith("/wordle/")) return handleWordle(request, env, path);

  // ---------- Ewige Bestenliste der Tagesrätsel ----------
  if (path === "/daily/board" && request.method === "GET") {
    const range = new URL(request.url).searchParams.get("range");
    await backfillIfEmpty(env, {
      leaderboardAll: () => leaderboardStub(env).all(),
      wordleBoard: (date) => wordleStub(env).board(date),
    });
    return json(await dailyBoard(env, range === "7" || range === "30" ? range : "all"));
  }
  if (path === "/daily/me" && request.method === "GET") {
    const { getUser } = await import("../konto/auth.js");
    const user = env.DB ? await getUser(request, env).catch(() => null) : null;
    if (!user) return json({ user: null });
    return json(await myStats(env, user));
  }

  // ---------- Bestenlisten ----------
  const scoreMatch = path.match(/^\/scores\/([a-z0-9]+)$/);
  if (scoreMatch) {
    const game = scoreMatch[1];
    const order = scoreOrder(game);
    if (!order) return json({ error: "Unbekanntes Spiel" }, 404);
    const lb = leaderboardStub(env);

    if (request.method === "GET") return json(await lb.list(game));

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Ungültige Daten" }, 400);
      }
      const score = Number(body?.score);
      let who;
      try {
        who = await resolveName(request, env, body?.name);
      } catch (e) {
        if (e instanceof NameError) return json({ error: e.message }, 403);
        throw e;
      }
      const name = who.name;
      if (!Number.isInteger(score) || score < 0 || score > scoreMax(game)) return json({ error: "Ungültige Punktzahl" }, 400);
      const list = await lb.add(game, name, score, order);
      const dm = game.match(/^(staedte|nono|conn)(\d{4})(\d{2})(\d{2})$/);
      if (dm) await recordResult(env, { game: dm[1], name, userId: who.userId, date: `${dm[2]}-${dm[3]}-${dm[4]}`, raw: score });
      return json(list);
    }
    return json({ error: "Methode nicht erlaubt" }, 405);
  }

  // ---------- Duell-Räume ----------
  if (path === "/rooms" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const game = body?.game;
    if (!Object.hasOwn(DUEL_GAMES, game)) return json({ error: "Unbekanntes Spiel" }, 400);
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = randomCode();
      const result = await duelStub(env, code).init(code, game);
      if (result.created) return json({ ok: true, roomCode: code });
    }
    return json({ error: "Konnte keinen freien Raum-Code finden. Bitte nochmal versuchen." }, 503);
  }

  const infoMatch = path.match(/^\/rooms\/([^/]+)$/);
  if (infoMatch && request.method === "GET") {
    const code = decodeURIComponent(infoMatch[1]).toUpperCase();
    if (!isValidCode(code)) return json({ exists: false });
    return json(await duelStub(env, code).exists());
  }

  const wsMatch = path.match(/^\/rooms\/([^/]+)\/ws$/);
  if (wsMatch) {
    const code = decodeURIComponent(wsMatch[1]).toUpperCase();
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket erwartet." }, 426);
    }
    if (!isValidCode(code)) return json({ error: "Ungültiger Raum-Code." }, 404);
    return duelStub(env, code).fetch(request);
  }

  return json({ error: "Nicht gefunden." }, 404);
}
