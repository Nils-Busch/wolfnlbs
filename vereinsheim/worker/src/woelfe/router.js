// API-Teil von "Was für Wölfe" – unverändert aus dem eigenständigen
// Cloudflare-Projekt übernommen, nur die Pfade laufen jetzt unter /api/woelfe/*,
// weil sich der Worker die Domain mit Spielegalerie und Tischtennis-Turnier teilt.

import { generateRoomCode, isValidRoomCode } from "./roomCode.js";

export { GameRoom } from "./gameRoom.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function roomStub(env, code) {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
}

// path: der Teil nach "/api/woelfe" (z.B. "/rooms" oder "/rooms/ABCD/ws").
export async function handleWoelfe(request, env, path) {
  if (path === "/health") {
    return json({ ok: true });
  }

  if (path === "/rooms" && request.method === "POST") {
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = generateRoomCode();
      const result = await roomStub(env, code).init(code);
      if (result.created) {
        return json({ ok: true, roomCode: code });
      }
    }
    return json({ ok: false, error: "Konnte keinen freien Raum-Code finden. Bitte nochmal versuchen." }, 503);
  }

  const infoMatch = path.match(/^\/rooms\/([^/]+)$/);
  if (infoMatch && request.method === "GET") {
    const code = decodeURIComponent(infoMatch[1]).toUpperCase();
    if (!isValidRoomCode(code)) return json({ ok: true, exists: false });
    const exists = await roomStub(env, code).exists();
    return json({ ok: true, exists });
  }

  const wsMatch = path.match(/^\/rooms\/([^/]+)\/ws$/);
  if (wsMatch) {
    const code = decodeURIComponent(wsMatch[1]).toUpperCase();
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "WebSocket erwartet." }, 426);
    }
    if (!isValidRoomCode(code)) {
      return json({ ok: false, error: "Ungültiger Raum-Code." }, 404);
    }
    return roomStub(env, code).fetch(request);
  }

  return json({ ok: false, error: "Nicht gefunden." }, 404);
}
