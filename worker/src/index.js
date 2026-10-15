// Einstiegspunkt des Cloudflare Workers.
//
// - Alles unter /api/* landet hier, alles andere (die React-App) liefert
//   Cloudflare direkt als statische Dateien aus (siehe "assets" in wrangler.jsonc).
// - Jeder Raum ist ein eigenes Durable Object, adressiert über seinen 4-stelligen Code.

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") {
      return json({ ok: true });
    }

    // Neuen Raum anlegen: freien Code suchen und das Durable Object initialisieren.
    if (path === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 30; attempt++) {
        const code = generateRoomCode();
        const result = await roomStub(env, code).init(code);
        if (result.created) {
          return json({ ok: true, roomCode: code });
        }
      }
      return json({ ok: false, error: "Konnte keinen freien Raum-Code finden. Bitte nochmal versuchen." }, 503);
    }

    // Prüfen, ob ein Raum existiert (schnelle Rückmeldung bei falsch eingetipptem Code).
    const infoMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
    if (infoMatch && request.method === "GET") {
      const code = decodeURIComponent(infoMatch[1]).toUpperCase();
      if (!isValidRoomCode(code)) return json({ ok: true, exists: false });
      const exists = await roomStub(env, code).exists();
      return json({ ok: true, exists });
    }

    // WebSocket-Verbindung zu einem Raum: /api/rooms/ABCD/ws
    const wsMatch = path.match(/^\/api\/rooms\/([^/]+)\/ws$/);
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
  },
};
