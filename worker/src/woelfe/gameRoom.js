// Ein Durable Object = ein Spielraum.
//
// - Alle Handys eines Raums verbinden sich per WebSocket mit genau diesem Objekt.
// - WebSockets laufen über die "Hibernation API": Ist gerade nichts los, darf das
//   Objekt schlafen gehen, ohne dass die Verbindungen abbrechen. Deshalb wird der
//   komplette Spielzustand nach jeder Aktion im Storage des Objekts gespeichert und
//   beim Aufwachen wieder geladen.
// - Phasen-Timer laufen über einen "Alarm" (statt setTimeout), der auch einen
//   Ruhezustand übersteht.
// - Räume werden gelöscht, wenn eine Stunde lang niemand mehr verbunden war.

import { DurableObject } from "cloudflare:workers";
import { Room, PHASES } from "./gameManager.js";

const ROOM_CLEANUP_MS = 60 * 60 * 1000; // 1h ohne jede Verbindung
const MAX_MESSAGE_BYTES = 8 * 1024;

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;

    // "ping" beantwortet Cloudflare selbst, ohne das Objekt aufzuwecken (Heartbeat der Handys).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    ctx.blockConcurrencyWhile(async () => {
      const data = await ctx.storage.get("room");
      if (data) {
        this.room = Room.fromJSON(data, this.transport());
        // Verbindungsstatus an die tatsächlich offenen WebSockets angleichen
        // (z. B. nach einem Neustart des Objekts).
        const online = new Set(this.openSockets().map((ws) => this.attachment(ws).playerId).filter(Boolean));
        for (const p of this.room.players.values()) p.connected = online.has(p.id);
      }
    });
  }

  // ---------- Raum anlegen (vom Worker per RPC aufgerufen) ----------

  async init(code) {
    if (this.room) return { created: false };
    this.room = new Room(code, this.transport());
    await this.persist();
    return { created: true };
  }

  async exists() {
    return !!this.room;
  }

  // ---------- Transport für die Spiellogik ----------

  transport() {
    return {
      send: (playerId, event, payload) => {
        const msg = JSON.stringify({ t: "evt", event, payload });
        for (const ws of this.openSockets()) {
          if (this.attachment(ws).playerId === playerId) this.safeSend(ws, msg);
        }
      },
      broadcast: (event, payload) => {
        const msg = JSON.stringify({ t: "evt", event, payload });
        for (const ws of this.openSockets()) {
          if (this.attachment(ws).playerId) this.safeSend(ws, msg);
        }
      },
      // Der Alarm wird in persist() aus room.phaseEndsAt abgeleitet.
      scheduleAt: () => {},
    };
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

  safeSend(ws, msg) {
    try {
      ws.send(msg);
    } catch {
      // Verbindung ist gerade weg – der Client holt sich beim Reconnect alles neu.
    }
  }

  // ---------- Speichern + Alarm planen ----------

  async persist() {
    const room = this.room;
    if (!room) return;

    if (room.isEmpty()) {
      if (!room.emptyRoomSince) room.emptyRoomSince = Date.now();
    } else {
      room.emptyRoomSince = null;
    }

    await this.ctx.storage.put("room", room.toJSON());

    const times = [];
    if (room.phaseEndsAt) times.push(room.phaseEndsAt);
    if (room.emptyRoomSince) times.push(room.emptyRoomSince + ROOM_CLEANUP_MS);
    const next = times.length ? Math.min(...times) : null;

    const current = await this.ctx.storage.getAlarm();
    if (next == null) {
      if (current != null) await this.ctx.storage.deleteAlarm();
    } else if (current !== next) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  async alarm() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();

    if (room.phaseEndsAt && now >= room.phaseEndsAt - 500) {
      try {
        room.onPhaseTimeout();
      } catch (err) {
        console.error("Fehler beim Phasenwechsel:", err);
      }
      // Sicherheitsnetz: nie in einer Endlosschleife abgelaufener Timer landen.
      if (room.phaseEndsAt && room.phaseEndsAt <= now) room.phaseEndsAt = null;
    }

    if (room.isEmpty() && room.emptyRoomSince && now - room.emptyRoomSince >= ROOM_CLEANUP_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(4004, "Raum abgelaufen");
        } catch {}
      }
      return;
    }

    await this.persist();
  }

  // ---------- WebSocket-Verbindungen ----------

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket erwartet.", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null });
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
    const { id, event, payload } = msg || {};
    if (typeof event !== "string") return;

    let response;
    try {
      const handler = this.handlers[event];
      if (!handler) throw new Error("Unbekannte Aktion.");
      const result = handler.call(this, ws, payload || {});
      response = { ok: true, ...(result || {}) };
    } catch (err) {
      response = { ok: false, error: err?.message || "Unbekannter Fehler." };
    }

    if (id != null) this.safeSend(ws, JSON.stringify({ t: "res", id, res: response }));
    await this.persist();
  }

  async webSocketClose(ws, code, reason) {
    await this.handleDisconnect(ws);
    try {
      ws.close(code, reason);
    } catch {}
  }

  async webSocketError(ws) {
    await this.handleDisconnect(ws);
  }

  async handleDisconnect(ws) {
    const { playerId } = this.attachment(ws);
    if (!playerId || !this.room) return;
    const stillOnline = this.openSockets().some((other) => other !== ws && this.attachment(other).playerId === playerId);
    if (!stillOnline) {
      this.room.markDisconnected(playerId);
      this.room.broadcastState();
    }
    await this.persist();
  }

  // ---------- Aktionen der Spieler ----------
  // Entspricht 1:1 den früheren Socket.io-Events.

  requireRoom() {
    if (!this.room) throw new Error("Raum nicht gefunden. Code prüfen?");
    return this.room;
  }

  requirePlayer(ws) {
    const room = this.requireRoom();
    const { playerId } = this.attachment(ws);
    if (!playerId || !room.players.has(playerId)) throw new Error("Bitte zuerst dem Raum beitreten.");
    return { room, playerId };
  }

  requireHost(ws) {
    const ctx = this.requirePlayer(ws);
    if (ctx.room.hostId !== ctx.playerId) throw new Error("Nur der Gastgeber darf das.");
    return ctx;
  }

  handlers = {
    joinRoom(ws, { name, token }) {
      const room = this.requireRoom();
      let player = token ? room.findPlayerByToken(token) : null;

      if (player) {
        ws.serializeAttachment({ playerId: player.id });
        room.reconnectPlayer(player);
      } else {
        if (room.phase !== PHASES.LOBBY) {
          throw new Error("Das Spiel läuft schon – neue Spieler können nicht mehr beitreten.");
        }
        if (!name || !String(name).trim()) throw new Error("Bitte gib einen Namen ein.");
        if (room.findPlayerByName(String(name))) {
          throw new Error("Dieser Name ist in diesem Raum schon vergeben.");
        }
        // Wer einen frischen Raum als Erstes betritt, ist Gastgeber
        // (das ist die Person, die den Raum gerade erstellt hat).
        player = room.addPlayer({ name: String(name), isHost: !room.hostId });
        ws.serializeAttachment({ playerId: player.id });
      }

      // Falls das Spiel schon läuft, Rolle erneut privat zusenden (Reconnect).
      if (room.phase !== PHASES.LOBBY && player.role) {
        room.sendRoleTo(player);
      }

      room.broadcastState();
      return { playerId: player.id, token: player.token, roomCode: room.code };
    },

    updateConfig(ws, { config }) {
      const { room } = this.requireHost(ws);
      room.updateConfig(config || {});
      room.broadcastState();
    },

    startGame(ws) {
      const { room } = this.requireHost(ws);
      room.startGame();
    },

    hostSkipPhase(ws) {
      const { room } = this.requireHost(ws);
      room.hostSkipPhase();
    },

    hostRestart(ws) {
      const { room } = this.requireHost(ws);
      room.restartToLobby();
    },

    setNarrator(ws, { isNarrator }) {
      const { room } = this.requireHost(ws);
      room.setHostNarrator(isNarrator);
    },

    amorChoose(ws, { targetIds }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitAmor(playerId, targetIds);
    },

    wolfdogChoose(ws, { side }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitWolfdog(playerId, side);
    },

    wolfVote(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitWolfVote(playerId, targetId);
    },

    urwolfConvert(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitUrwolfConvert(playerId, targetId);
    },

    wolfChatSend(ws, { text }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitWolfChatMessage(playerId, text);
    },

    seerInspect(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitSeerInspect(playerId, targetId);
    },

    witchAction(ws, { save, poisonTargetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitWitchAction(playerId, { save, poisonTargetId });
    },

    hunterShot(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitHunterShot(playerId, targetId);
    },

    dayVote(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitDayVote(playerId, targetId);
    },

    mayorVote(ws, { targetId }) {
      const { room, playerId } = this.requirePlayer(ws);
      room.submitMayorVote(playerId, targetId);
    },
  };
}
