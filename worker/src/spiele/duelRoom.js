// Ein Durable Object = ein Duell-Raum (Tic-Tac-Toe, Vier gewinnt, Reversi, Käsekästchen, Gomoku).
// Nach dem Vorbild von "Was für Wölfe": WebSocket-Hibernation, Zustand im Storage,
// Aufräum-Alarm nach einer Stunde Leerstand. Anders als bei Werwolf gibt es hier
// keinen Reconnect-Token – verlässt eine Seite den Raum, ist die Partie vorbei
// (genau wie im ursprünglichen ws-Server).

import { DurableObject } from "cloudflare:workers";
import { games, isOver } from "./rules.js";

const ROOM_CLEANUP_MS = 60 * 60 * 1000;
const MAX_MESSAGE_BYTES = 4096;

export class DuelRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get("room")) || null;
    });
  }

  async init(code, game) {
    if (this.room) return { created: false };
    if (!Object.hasOwn(games, game)) return { created: false, error: "Unbekanntes Spiel." };
    this.room = {
      code,
      game,
      names: ["Spieler 1", "…"],
      wins: [0, 0],
      starter: 0,
      state: null,
      rematch: [false, false],
      playerCount: 0,
      emptySince: Date.now(),
    };
    await this.persist();
    return { created: true };
  }

  async exists() {
    return this.room ? { exists: true, game: this.room.game, full: this.room.playerCount >= 2 } : { exists: false };
  }

  openSockets() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  attachment(ws) {
    try {
      return ws.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }

  send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Verbindung ist schon weg.
    }
  }

  broadcastState() {
    const room = this.room;
    for (const ws of this.openSockets()) {
      const { idx } = this.attachment(ws);
      if (idx === 0 || idx === 1) {
        this.send(ws, { type: "state", state: room.state, names: room.names, wins: room.wins, you: idx, code: room.code });
      }
    }
  }

  async persist() {
    const room = this.room;
    if (!room) return;
    if (room.playerCount <= 0) {
      if (!room.emptySince) room.emptySince = Date.now();
    } else {
      room.emptySince = null;
    }
    await this.ctx.storage.put("room", room);
    if (room.emptySince) {
      await this.ctx.storage.setAlarm(room.emptySince + ROOM_CLEANUP_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  async alarm() {
    const room = this.room;
    if (!room) return;
    if (room.playerCount <= 0 && room.emptySince && Date.now() - room.emptySince >= ROOM_CLEANUP_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
    }
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket erwartet.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ idx: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      this.handle(ws, msg);
    } catch (err) {
      this.send(ws, { type: "error", message: err?.message || "Unbekannter Fehler." });
    }
    await this.persist();
  }

  handle(ws, msg) {
    const room = this.room;
    const { idx } = this.attachment(ws);

    if (msg.type === "hello") {
      if (!room) return this.send(ws, { type: "error", message: "Raum nicht gefunden oder schon abgelaufen." });
      if (msg.game && msg.game !== room.game) return this.send(ws, { type: "error", message: "Dieser Raum gehört zu einem anderen Spiel." });
    }
    if (!room) return;

    switch (msg.type) {
      case "hello": {
        if (idx !== null) return; // schon beigetreten
        if (room.playerCount >= 2) return this.send(ws, { type: "error", message: "Der Raum ist schon voll." });
        const slot = room.playerCount; // 0 = erste Person (hat den Raum erstellt), 1 = zweite
        room.names[slot] = String(msg.name || "").trim().slice(0, 16) || `Spieler ${slot + 1}`;
        room.playerCount++;
        ws.serializeAttachment({ idx: slot });
        if (room.playerCount === 2 && !room.state) {
          room.state = games[room.game].init(room.starter);
        }
        if (room.playerCount === 2) this.broadcastState();
        else this.send(ws, { type: "waiting", code: room.code, you: slot });
        break;
      }

      case "move": {
        if (idx === null || !room.state) return;
        const rules = games[room.game];
        const next = rules.move(room.state, idx, msg.move || {});
        if (!next) return;
        room.state = next;
        if (next.winner !== null) room.wins[next.winner]++;
        this.broadcastState();
        break;
      }

      case "rematch": {
        if (idx === null || !room.state || !isOver(room.state) || room.playerCount < 2) return;
        room.rematch[idx] = true;
        if (room.rematch[0] && room.rematch[1]) {
          room.rematch = [false, false];
          room.starter = 1 - room.starter;
          room.state = games[room.game].init(room.starter);
          this.broadcastState();
        } else {
          for (const other of this.openSockets()) {
            const a = this.attachment(other);
            if (a.idx === 1 - idx) this.send(other, { type: "rematch_requested" });
          }
        }
        break;
      }
    }
  }

  async webSocketClose(ws) {
    await this.handleLeave(ws);
  }
  async webSocketError(ws) {
    await this.handleLeave(ws);
  }

  async handleLeave(ws) {
    const room = this.room;
    const { idx } = this.attachment(ws);
    if (!room || idx === null) return;
    room.playerCount = Math.max(0, room.playerCount - 1);
    for (const other of this.openSockets()) {
      if (other !== ws) this.send(other, { type: "opponent_left" });
    }
    // Wie beim ursprünglichen Server: sobald jemand geht, ist die Partie vorbei.
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}
