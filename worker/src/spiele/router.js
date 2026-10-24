export { DuelRoom } from "./duelRoom.js";
export { Leaderboard } from "./leaderboard.js";
export { Wordle } from "./wordle.js";

import { games as DUEL_GAMES } from "./rules.js";

// 'desc' = mehr ist besser, 'asc' = weniger ist besser (z.B. Züge bei Memory).
const SCORE_ORDER = { snake: "desc", "2048": "desc", memory: "asc", blockfall: "desc", mines9: "asc", mines16: "asc" };
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
    return asResult(await stub.submit(id, body.name));
  }
  return json({ error: "Nicht gefunden." }, 404);
}

// path: der Teil nach "/api/spiele".
export async function handleSpiele(request, env, path) {
  if (path.startsWith("/wordle/")) return handleWordle(request, env, path);

  // ---------- Bestenlisten ----------
  const scoreMatch = path.match(/^\/scores\/([a-z0-9]+)$/);
  if (scoreMatch) {
    const game = scoreMatch[1];
    if (!Object.hasOwn(SCORE_ORDER, game)) return json({ error: "Unbekanntes Spiel" }, 404);
    const lb = leaderboardStub(env);

    if (request.method === "GET") return json(await lb.list(game));

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Ungültige Daten" }, 400);
      }
      const name = String(body?.name || "").trim().slice(0, 16);
      const score = Number(body?.score);
      if (!name) return json({ error: "Name fehlt" }, 400);
      if (!Number.isInteger(score) || score < 0 || score > 10_000_000) return json({ error: "Ungültige Punktzahl" }, 400);
      const list = await lb.add(game, name, score, SCORE_ORDER[game]);
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
