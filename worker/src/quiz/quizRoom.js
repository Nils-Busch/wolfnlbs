// Ein Durable Object = ein laufendes Quiz (ein Raum mit 4-stelligem Code).
//
// Zwei Arten von Verbindungen:
//  - Bildschirm/Moderation ("host"): weist sich mit dem geheimen hostKey aus,
//    den nur bekommt, wer den Raum mit Konto eröffnet hat. Darf starten,
//    weiterschalten, Spieler entfernen.
//  - Handys ("player"): treten mit Namen bei, kein Konto nötig. Bekommen ein
//    Token, mit dem sie nach einem Neuladen auf ihren Platz zurückkommen.
//
// Die richtige Antwort verlässt den Server erst bei der Auflösung – vorher
// kann sie auch auf einem manipulierten Handy niemand sehen.
//
// Wie beim Werwolf-Raum: WebSocket-Hibernation, kompletter Zustand nach jeder
// Änderung im Storage, Timer über Alarms, Aufräumen nach 1 h ohne Verbindung.

import { DurableObject } from "cloudflare:workers";
import { makeId } from "../woelfe/ids.js";

const EMPTY_CLEANUP_MS = 60 * 60 * 1000; // 1 h ohne jede Verbindung
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // spätestens nach 24 h weg
const MAX_PLAYERS = 100;
const MAX_MESSAGE_BYTES = 4 * 1024;

export class QuizRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get("state")) || null;
      if (this.s) {
        const online = new Set(this.sockets().map((ws) => this.att(ws).playerId).filter(Boolean));
        for (const p of Object.values(this.s.players)) p.connected = online.has(p.id);
      }
    });
  }

  /* ---------- vom Worker per RPC ---------- */

  async init(code, { title, questions, hostKey, hostName }) {
    if (this.s) return { created: false };
    this.s = {
      code,
      title,
      questions,
      hostKey,
      hostName,
      phase: "LOBBY",
      index: -1,
      startedAt: null,
      endsAt: null,
      players: {},
      order: 0,
      answers: {},
      reveal: null,
      createdAt: Date.now(),
      emptySince: Date.now(),
    };
    await this.persist();
    return { created: true };
  }

  async exists() {
    return !!this.s;
  }

  /* ---------- Hilfen ---------- */

  sockets() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }
  att(ws) {
    try {
      return ws.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }
  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }
  playersArr() {
    return Object.values(this.s.players);
  }
  ranking() {
    return this.playersArr().sort((a, b) => b.score - a.score || a.joined - b.joined);
  }
  rankOf(id) {
    const r = this.ranking();
    const me = this.s.players[id];
    if (!me) return null;
    // Gleiche Punktzahl = gleicher Platz.
    return 1 + r.filter((p) => p.score > me.score).length;
  }
  question() {
    const s = this.s;
    return s.index >= 0 && s.index < s.questions.length ? s.questions[s.index] : null;
  }
  connectedPlayers() {
    return this.playersArr().filter((p) => p.connected);
  }

  /* ---------- Ansichten (jede Verbindung bekommt ihre eigene) ---------- */

  hostView() {
    const s = this.s;
    const q = this.question();
    const answered = Object.keys(s.answers).length;
    const base = {
      role: "host",
      code: s.code,
      title: s.title,
      hostName: s.hostName,
      phase: s.phase,
      index: s.index,
      total: s.questions.length,
      serverNow: Date.now(),
      endsAt: s.endsAt,
      answered,
      players: (s.phase === "LOBBY" ? this.playersArr().sort((a, b) => a.joined - b.joined) : this.ranking()).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
      })),
    };
    if (q && (s.phase === "QUESTION" || s.phase === "REVEAL")) {
      base.question = { text: q.text, answers: q.answers, seconds: q.seconds };
    }
    if (s.phase === "REVEAL" && s.reveal) {
      base.reveal = {
        correct: s.reveal.correct,
        counts: s.reveal.counts,
        ranking: this.ranking()
          .slice(0, 8)
          .map((p) => ({ name: p.name, score: p.score, gain: s.reveal.gains[p.id] || 0 })),
      };
    }
    if (s.phase === "END") {
      base.final = this.ranking().map((p) => ({ name: p.name, score: p.score, rank: this.rankOf(p.id) }));
    }
    return base;
  }

  playerView(id) {
    const s = this.s;
    const me = s.players[id];
    if (!me) return { role: "none" };
    const q = this.question();
    const mine = s.answers[id];
    const view = {
      role: "player",
      code: s.code,
      title: s.title,
      phase: s.phase,
      index: s.index,
      total: s.questions.length,
      serverNow: Date.now(),
      endsAt: s.endsAt,
      playerCount: this.playersArr().length,
      me: { id: me.id, name: me.name, score: me.score, rank: this.rankOf(id) },
      myChoice: mine ? mine.choice : null,
    };
    if (q && (s.phase === "QUESTION" || s.phase === "REVEAL")) {
      view.question = { text: q.text, answers: q.answers, seconds: q.seconds };
    }
    if (s.phase === "REVEAL" && s.reveal) {
      view.reveal = {
        correct: s.reveal.correct,
        gain: s.reveal.gains[id] || 0,
        wasCorrect: !!mine && mine.choice === s.reveal.correct,
      };
    }
    if (s.phase === "END") {
      view.final = {
        podium: this.ranking()
          .slice(0, 3)
          .map((p) => ({ name: p.name, score: p.score, rank: this.rankOf(p.id) })),
      };
    }
    return view;
  }

  broadcast() {
    if (!this.s) return;
    let host = null;
    for (const ws of this.sockets()) {
      const a = this.att(ws);
      if (a.role === "host") {
        host = host || JSON.stringify({ t: "evt", event: "state", payload: this.hostView() });
        try {
          ws.send(host);
        } catch {}
      } else if (a.role === "player") {
        this.send(ws, { t: "evt", event: "state", payload: this.playerView(a.playerId) });
      }
    }
  }

  /* ---------- Spielablauf ---------- */

  startQuestion(index) {
    const s = this.s;
    s.index = index;
    s.phase = "QUESTION";
    s.answers = {};
    s.reveal = null;
    const q = this.question();
    s.startedAt = Date.now();
    s.endsAt = s.startedAt + q.seconds * 1000;
  }

  revealQuestion() {
    const s = this.s;
    const q = this.question();
    if (s.phase !== "QUESTION" || !q) return;
    const counts = q.answers.map(() => 0);
    const gains = {};
    const duration = q.seconds * 1000;
    for (const [pid, a] of Object.entries(s.answers)) {
      const p = s.players[pid];
      if (!p) continue;
      counts[a.choice] = (counts[a.choice] || 0) + 1;
      if (a.choice === q.correct) {
        // Richtig: 500–1000 Punkte, je schneller desto mehr.
        const frac = Math.min(1, Math.max(0, a.ms / duration));
        const gain = Math.round(1000 - 500 * frac);
        p.score += gain;
        gains[pid] = gain;
      }
    }
    s.phase = "REVEAL";
    s.endsAt = null;
    s.reveal = { correct: q.correct, counts, gains };
  }

  next() {
    const s = this.s;
    if (s.phase === "LOBBY") {
      if (!this.playersArr().length) throw new Error("Es ist noch niemand beigetreten.");
      this.startQuestion(0);
    } else if (s.phase === "QUESTION") {
      this.revealQuestion();
    } else if (s.phase === "REVEAL") {
      if (s.index + 1 < s.questions.length) this.startQuestion(s.index + 1);
      else {
        s.phase = "END";
        s.endsAt = null;
      }
    }
  }

  maybeAllAnswered() {
    const s = this.s;
    if (s.phase !== "QUESTION") return;
    const online = this.connectedPlayers();
    if (online.length && online.every((p) => s.answers[p.id])) this.revealQuestion();
  }

  /* ---------- Speichern & Alarm ---------- */

  async persist() {
    const s = this.s;
    if (!s) return;
    const anyone = this.sockets().length > 0;
    if (anyone) s.emptySince = null;
    else if (!s.emptySince) s.emptySince = Date.now();
    await this.ctx.storage.put("state", s);
    const times = [s.createdAt + MAX_AGE_MS];
    if (s.phase === "QUESTION" && s.endsAt) times.push(s.endsAt + 250);
    if (s.emptySince) times.push(s.emptySince + EMPTY_CLEANUP_MS);
    const next = Math.min(...times);
    const current = await this.ctx.storage.getAlarm();
    if (current !== next) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    if (now >= s.createdAt + MAX_AGE_MS || (s.emptySince && now >= s.emptySince + EMPTY_CLEANUP_MS)) {
      await this.ctx.storage.deleteAll();
      this.s = null;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(4004, "Raum abgelaufen");
        } catch {}
      }
      return;
    }
    if (s.phase === "QUESTION" && s.endsAt && now >= s.endsAt) {
      this.revealQuestion();
      this.broadcast();
    }
    await this.persist();
  }

  /* ---------- WebSocket ---------- */

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket erwartet.", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null });
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
    let changed = false;
    try {
      if (!this.s) throw new Error("Raum nicht gefunden. Code prüfen?");
      const handler = this.handlers[event];
      if (!handler) throw new Error("Unbekannte Aktion.");
      const result = handler.call(this, ws, payload || {});
      response = { ok: true, ...(result || {}) };
      changed = true;
    } catch (err) {
      response = { ok: false, error: err?.message || "Fehler." };
    }
    if (id != null) this.send(ws, { t: "res", id, res: response });
    if (changed) this.broadcast();
    await this.persist();
  }

  async webSocketClose(ws, code, reason) {
    await this.dropSocket(ws);
    try {
      ws.close(code, reason);
    } catch {}
  }
  async webSocketError(ws) {
    await this.dropSocket(ws);
  }
  async dropSocket(ws) {
    if (!this.s) return;
    const { role, playerId } = this.att(ws);
    if (role === "player" && playerId && this.s.players[playerId]) {
      const still = this.sockets().some((o) => o !== ws && this.att(o).playerId === playerId);
      if (!still) {
        this.s.players[playerId].connected = false;
        this.maybeAllAnswered();
        this.broadcast();
      }
    }
    await this.persist();
  }

  requireHost(ws) {
    if (this.att(ws).role !== "host") throw new Error("Nur die Moderation darf das.");
  }

  handlers = {
    // Bildschirm / Moderation
    host(ws, { hostKey }) {
      if (typeof hostKey !== "string" || hostKey !== this.s.hostKey) throw new Error("Kein Zugriff auf diesen Raum.");
      ws.serializeAttachment({ role: "host" });
    },
    start(ws) {
      this.requireHost(ws);
      if (this.s.phase !== "LOBBY") throw new Error("Das Quiz läuft schon.");
      this.next();
    },
    next(ws) {
      this.requireHost(ws);
      this.next();
    },
    kick(ws, { playerId }) {
      this.requireHost(ws);
      const p = this.s.players[playerId];
      if (!p) throw new Error("Spieler nicht gefunden.");
      delete this.s.players[playerId];
      delete this.s.answers[playerId];
      for (const o of this.sockets()) {
        if (this.att(o).playerId === playerId) {
          this.send(o, { t: "evt", event: "kicked", payload: {} });
          o.serializeAttachment({ role: null });
        }
      }
      this.maybeAllAnswered();
    },
    restart(ws) {
      this.requireHost(ws);
      const s = this.s;
      for (const p of this.playersArr()) p.score = 0;
      s.phase = "LOBBY";
      s.index = -1;
      s.answers = {};
      s.reveal = null;
      s.endsAt = null;
    },

    // Handys
    join(ws, { name, token }) {
      const s = this.s;
      let p = typeof token === "string" && token ? this.playersArr().find((x) => x.token === token) : null;
      if (!p) {
        if (s.phase === "END") throw new Error("Dieses Quiz ist schon vorbei.");
        const clean = String(name || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 16);
        if (!clean) throw new Error("Bitte gib einen Namen ein.");
        if (this.playersArr().some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
          throw new Error("Dieser Name ist schon vergeben.");
        }
        if (this.playersArr().length >= MAX_PLAYERS) throw new Error("Der Raum ist voll.");
        p = { id: makeId(8), token: makeId(16), name: clean, score: 0, connected: true, joined: ++s.order };
        s.players[p.id] = p;
      }
      p.connected = true;
      ws.serializeAttachment({ role: "player", playerId: p.id });
      return { playerId: p.id, token: p.token };
    },
    answer(ws, { choice }) {
      const s = this.s;
      const { role, playerId } = this.att(ws);
      if (role !== "player" || !s.players[playerId]) throw new Error("Bitte erst beitreten.");
      if (s.phase !== "QUESTION") throw new Error("Gerade läuft keine Frage.");
      if (s.answers[playerId]) throw new Error("Du hast schon geantwortet.");
      const q = this.question();
      const c = Number(choice);
      if (!Number.isInteger(c) || c < 0 || c >= q.answers.length) throw new Error("Ungültige Antwort.");
      const ms = Date.now() - s.startedAt;
      if (ms > q.seconds * 1000 + 500) throw new Error("Zu spät – die Zeit ist um.");
      s.answers[playerId] = { choice: c, ms };
      this.maybeAllAnswered();
    },
    leave(ws) {
      const s = this.s;
      const { playerId } = this.att(ws);
      if (playerId && s.players[playerId] && s.phase === "LOBBY") delete s.players[playerId];
      else if (playerId && s.players[playerId]) s.players[playerId].connected = false;
      ws.serializeAttachment({ role: null });
      this.maybeAllAnswered();
    },
  };
}
