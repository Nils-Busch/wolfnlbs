// Gruppenspiele mit Bildschirm + Handys: „Wer würde eher …?“ und Stadt-Land-Fluss.
// Ein Durable Object = ein Raum mit 4-stelligem Code. Aufbau wie beim Quiz-Raum:
//  - Bildschirm/Spielleitung ("host") weist sich mit dem geheimen hostKey aus.
//  - Handys ("player") treten mit Namen bei und bekommen ein Token für Neuladen.
// WebSocket-Hibernation, kompletter Zustand nach jeder Änderung im Storage,
// Timer über Alarms, Aufräumen nach 1 h ohne Verbindung.

import { DurableObject } from "cloudflare:workers";
import { makeId } from "../woelfe/ids.js";

const EMPTY_CLEANUP_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 30;
const MAX_MESSAGE_BYTES = 8 * 1024;

export const GAMES = { wwe: "Wer würde eher …?", slf: "Stadt-Land-Fluss" };

// ---------- „Wer würde eher …?“ ----------
const WWE_QUESTIONS = [
  "… beim Kochen die Küche abfackeln?",
  "… im Lotto gewinnen und es niemandem erzählen?",
  "… auf einer einsamen Insel als Erstes verzweifeln?",
  "… beim Karaoke das Mikro nicht mehr hergeben?",
  "… aus Versehen auf „Allen antworten“ klicken?",
  "… seinen eigenen Geburtstag vergessen?",
  "… bei einem Horrorfilm einschlafen?",
  "… spontan auswandern?",
  "… den ganzen Tag im Schlafanzug bleiben?",
  "… bei „Wer wird Millionär“ die Million holen?",
  "… sich im eigenen Wohnort verlaufen?",
  "… mit dem Chef Freundschaft schließen?",
  "… das letzte Stück Pizza essen, ohne zu fragen?",
  "… eine Woche ohne Handy überleben?",
  "… auf der Party als Letztes nach Hause gehen?",
  "… als Erstes einschlafen?",
  "… einen Marathon laufen?",
  "… zu spät zur eigenen Hochzeit kommen?",
  "… heimlich Schlager hören?",
  "… beim Monopoly schummeln?",
  "… im Zoo ein Tier mit nach Hause nehmen wollen?",
  "… berühmt werden?",
  "… ein Buch schreiben?",
  "… im Supermarkt mehr kaufen als auf der Liste steht?",
  "… beim Wandern als Erstes nach einer Pause fragen?",
  "… eine Spinne retten statt sie zu töten?",
  "… beim Flaschendrehen schummeln?",
  "… sich ein Tattoo stechen lassen und es bereuen?",
  "… in einer Castingshow mitmachen?",
  "… den Weg ohne Navi finden?",
  "… nachts um drei noch Nudeln kochen?",
  "… einen Streit mit dem Navi anfangen?",
  "… bei einem Escape Room als Erstes das Rätsel lösen?",
  "… im Urlaub ein Hotelhandtuch einpacken?",
  "… eine Pflanze sterben lassen, die eigentlich unsterblich ist?",
  "… sich mit Fremden im Zug anfreunden?",
  "… bei einem Werwolf-Spiel sofort auffliegen?",
  "… den Gruppenchat stumm schalten?",
  "… Weihnachtsgeschenke erst am 24. kaufen?",
  "… im Restaurant zurückgehen lassen?",
  "… die Fernbedienung im Kühlschrank verlegen?",
  "… ein Selfie mit einem Promi machen?",
  "… sich vom Kater in ein Gespräch verwickeln lassen?",
  "… beim Bowling eine Strike-Serie werfen?",
  "… auf einer Hochzeit spontan eine Rede halten?",
  "… ein Haustier nach einem Essen benennen?",
  "… einen Sonnenbrand im Winter bekommen?",
  "… eine Woche nur Fast Food essen?",
  "… mit 80 noch Skateboard fahren?",
  "… bei einem Quiz die verrückteste Antwort geben?",
  "… seinen Koffer am Flughafen vergessen?",
  "… sich als Superheld verkleiden, ohne dass es eine Party gibt?",
  "… beim Umzug mehr kaputt machen als tragen?",
  "… eine Nacht im Spukhaus verbringen?",
  "… heimlich die Serie weiterschauen, die man zusammen schaut?",
  "… beim Grillen alles verkohlen lassen?",
  "… einen Tanzkurs machen und Turniere gewinnen?",
  "… im Fitnessstudio angemeldet sein, aber nie hingehen?",
  "… jemandem einen Streich spielen und sich dabei selbst verraten?",
  "… in einem Film mitspielen?",
];

// ---------- Stadt-Land-Fluss ----------
export const SLF_CATEGORIES = [
  "Stadt", "Land", "Fluss", "Name", "Tier", "Beruf",
  "Pflanze", "Essen", "Getränk", "Marke", "Sportart", "Film/Serie",
  "Promi", "Körperteil", "Gegenstand im Haus", "Hobby", "Musikband", "Kleidung",
];
const SLF_LETTERS = "ABDEFGHIKLMNOPRSTUVWZ";

const norm = (t) =>
  String(t || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class PartyRoom extends DurableObject {
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
  async init(code, { game, hostKey }) {
    if (this.s) return { created: false };
    this.s = {
      code,
      game,
      hostKey,
      phase: "LOBBY",
      players: {},
      order: 0,
      round: 0,
      endsAt: null,
      createdAt: Date.now(),
      emptySince: Date.now(),
      settings:
        game === "wwe"
          ? { rounds: 10, seconds: 25 }
          : { rounds: 5, seconds: 90, categories: ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"] },
      // Wer würde eher
      questions: [],
      votes: {},
      result: null,
      history: [],
      // Stadt-Land-Fluss
      letter: null,
      usedLetters: [],
      answers: {},
      flags: {},
      roundScores: null,
      stoppedBy: null,
    };
    await this.persist();
    return { created: true };
  }
  async exists() {
    return this.s ? { exists: true, game: this.s.game } : { exists: false };
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
    return Object.values(this.s.players).sort((a, b) => a.joined - b.joined);
  }
  online() {
    return this.playersArr().filter((p) => p.connected);
  }
  pub(p) {
    return { id: p.id, name: p.name, connected: p.connected, score: p.score || 0 };
  }

  /* ---------- Ansicht (Handys sehen fremde Antworten erst in der Auswertung) ---------- */
  view(role, playerId) {
    const s = this.s;
    const v = {
      role,
      code: s.code,
      game: s.game,
      gameName: GAMES[s.game],
      phase: s.phase,
      round: s.round,
      settings: s.settings,
      serverNow: Date.now(),
      endsAt: s.endsAt,
      players: this.playersArr().map((p) => this.pub(p)),
      categoriesAll: SLF_CATEGORIES,
    };
    if (role === "player") {
      const me = s.players[playerId];
      v.me = me ? { id: me.id, name: me.name, score: me.score || 0 } : null;
    }
    if (s.game === "wwe") {
      if (s.phase === "QUESTION" || s.phase === "RESULT") {
        v.question = s.questions[s.round - 1];
        v.voted = Object.keys(s.votes);
        if (role === "player") v.myVote = s.votes[playerId] || null;
      }
      if (s.phase === "RESULT") v.result = s.result;
      if (s.phase === "END") v.awards = this.wweAwards();
    } else {
      v.letter = s.letter;
      v.stoppedBy = s.stoppedBy ? s.players[s.stoppedBy]?.name || null : null;
      if (s.phase === "WRITING") {
        v.done = Object.keys(s.answers).filter((id) => s.answers[id]?.final);
        if (role === "player") v.myAnswers = s.answers[playerId]?.values || {};
      }
      if (s.phase === "REVIEW" || s.phase === "SCORES") {
        v.answers = Object.fromEntries(
          this.playersArr().map((p) => [p.id, s.answers[p.id]?.values || {}])
        );
        v.flags = Object.fromEntries(
          Object.entries(s.flags).map(([k, set]) => [k, Object.keys(set)])
        );
        v.auto = this.slfAutoInvalid();
      }
      if (s.phase === "SCORES") v.roundScores = s.roundScores;
    }
    return v;
  }

  broadcast() {
    if (!this.s) return;
    let host = null;
    for (const ws of this.sockets()) {
      const a = this.att(ws);
      if (a.role === "host") {
        host = host || JSON.stringify({ t: "evt", event: "state", payload: this.view("host") });
        try {
          ws.send(host);
        } catch {}
      } else if (a.role === "player") {
        this.send(ws, { t: "evt", event: "state", payload: this.view("player", a.playerId) });
      }
    }
  }

  /* ---------- Wer würde eher ---------- */
  wweStart() {
    const s = this.s;
    s.questions = shuffle(WWE_QUESTIONS).slice(0, s.settings.rounds);
    s.history = [];
    s.round = 0;
    this.wweNext();
  }
  wweNext() {
    const s = this.s;
    if (s.round >= s.questions.length) {
      s.phase = "END";
      s.endsAt = null;
      return;
    }
    s.round++;
    s.phase = "QUESTION";
    s.votes = {};
    s.result = null;
    s.endsAt = Date.now() + s.settings.seconds * 1000;
  }
  wweReveal() {
    const s = this.s;
    if (s.phase !== "QUESTION") return;
    const tally = {};
    for (const t of Object.values(s.votes)) tally[t] = (tally[t] || 0) + 1;
    const ranking = Object.entries(tally)
      .map(([id, n]) => ({ id, name: s.players[id]?.name || "?", votes: n }))
      .sort((a, b) => b.votes - a.votes);
    const top = ranking.length ? ranking[0].votes : 0;
    const winners = ranking.filter((r) => r.votes === top && top > 0);
    for (const w of winners) if (s.players[w.id]) s.players[w.id].score = (s.players[w.id].score || 0) + 1;
    s.result = { ranking, winners: winners.map((w) => w.name), total: Object.keys(s.votes).length };
    s.history.push({ q: s.questions[s.round - 1], winners: winners.map((w) => w.name) });
    s.phase = "RESULT";
    s.endsAt = null;
  }
  wweAwards() {
    const players = this.playersArr().map((p) => ({ name: p.name, score: p.score || 0 })).sort((a, b) => b.score - a.score);
    return { players, history: this.s.history };
  }
  wweMaybeAll() {
    const s = this.s;
    if (s.phase !== "QUESTION") return;
    const on = this.online();
    if (on.length && on.every((p) => s.votes[p.id])) this.wweReveal();
  }

  /* ---------- Stadt-Land-Fluss ---------- */
  slfStartRound() {
    const s = this.s;
    s.round++;
    const left = [...SLF_LETTERS].filter((l) => !s.usedLetters.includes(l));
    const pool = left.length ? left : [...SLF_LETTERS];
    s.letter = pool[Math.floor(Math.random() * pool.length)];
    s.usedLetters.push(s.letter);
    s.answers = {};
    s.flags = {};
    s.roundScores = null;
    s.stoppedBy = null;
    s.phase = "WRITING";
    s.endsAt = Date.now() + (3 + s.settings.seconds) * 1000; // 3 s Buchstaben-Animation
  }
  slfToReview() {
    const s = this.s;
    if (s.phase !== "WRITING") return;
    s.phase = "REVIEW";
    s.endsAt = null;
  }
  // Antworten, die nicht mit dem Buchstaben beginnen, zählen automatisch nicht.
  slfAutoInvalid() {
    const s = this.s;
    const out = [];
    const L = norm(s.letter || "");
    for (const p of this.playersArr()) {
      const vals = s.answers[p.id]?.values || {};
      for (const cat of s.settings.categories) {
        const v = norm(vals[cat]);
        if (v && !v.startsWith(L)) out.push(`${p.id}|${cat}`);
      }
    }
    return out;
  }
  slfScore() {
    const s = this.s;
    const players = this.playersArr();
    const auto = new Set(this.slfAutoInvalid());
    const voters = players.length;
    const scores = {};
    const detail = {};
    for (const p of players) {
      scores[p.id] = 0;
      detail[p.id] = {};
    }
    for (const cat of s.settings.categories) {
      const valid = [];
      for (const p of players) {
        const v = norm(s.answers[p.id]?.values?.[cat]);
        const key = `${p.id}|${cat}`;
        const flagged = Object.keys(s.flags[key] || {}).length;
        // ungültig, wenn automatisch erkannt oder wenn mindestens die Hälfte der anderen widerspricht
        const invalid = !v || auto.has(key) || (voters > 1 && flagged * 2 >= voters - 1 && flagged > 0);
        if (!invalid) valid.push({ id: p.id, v });
        else detail[p.id][cat] = 0;
      }
      for (const a of valid) {
        const same = valid.filter((b) => b.v === a.v).length;
        const pts = valid.length === 1 ? 20 : same > 1 ? 5 : 10;
        scores[a.id] += pts;
        detail[a.id][cat] = pts;
      }
    }
    for (const p of players) p.score = (p.score || 0) + scores[p.id];
    s.roundScores = { scores, detail };
    s.phase = "SCORES";
  }

  /* ---------- Speichern & Alarm ---------- */
  async persist() {
    const s = this.s;
    if (!s) return;
    if (this.sockets().length) s.emptySince = null;
    else if (!s.emptySince) s.emptySince = Date.now();
    await this.ctx.storage.put("state", s);
    const times = [s.createdAt + MAX_AGE_MS];
    if (s.endsAt && (s.phase === "QUESTION" || s.phase === "WRITING")) times.push(s.endsAt + 250);
    if (s.emptySince) times.push(s.emptySince + EMPTY_CLEANUP_MS);
    const next = Math.min(...times);
    if ((await this.ctx.storage.getAlarm()) !== next) await this.ctx.storage.setAlarm(next);
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
    if (s.endsAt && now >= s.endsAt) {
      if (s.phase === "QUESTION") this.wweReveal();
      else if (s.phase === "WRITING") this.slfToReview();
      this.broadcast();
    }
    await this.persist();
  }

  /* ---------- WebSocket ---------- */
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket erwartet.", { status: 426 });
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
      changed = result?.quiet ? false : true;
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
        if (this.s.game === "wwe") this.wweMaybeAll();
        this.broadcast();
      }
    }
    await this.persist();
  }

  requireHost(ws) {
    if (this.att(ws).role !== "host") throw new Error("Nur die Spielleitung darf das.");
  }
  requirePlayer(ws) {
    const { role, playerId } = this.att(ws);
    if (role !== "player" || !this.s.players[playerId]) throw new Error("Bitte erst beitreten.");
    return playerId;
  }

  handlers = {
    /* Spielleitung */
    host(ws, { hostKey }) {
      if (typeof hostKey !== "string" || hostKey !== this.s.hostKey) throw new Error("Kein Zugriff auf diesen Raum.");
      ws.serializeAttachment({ role: "host" });
    },
    settings(ws, { settings }) {
      this.requireHost(ws);
      const s = this.s;
      if (s.phase !== "LOBBY") throw new Error("Einstellungen nur vor dem Start.");
      const rounds = Math.round(Number(settings?.rounds));
      const seconds = Math.round(Number(settings?.seconds));
      if (s.game === "wwe") {
        s.settings = { rounds: Math.min(30, Math.max(3, rounds || 10)), seconds: Math.min(90, Math.max(10, seconds || 25)) };
      } else {
        const cats = Array.isArray(settings?.categories) ? settings.categories.filter((c) => SLF_CATEGORIES.includes(c)) : [];
        if (cats.length < 3) throw new Error("Bitte mindestens 3 Kategorien wählen.");
        s.settings = {
          rounds: Math.min(15, Math.max(1, rounds || 5)),
          seconds: Math.min(300, Math.max(30, seconds || 90)),
          categories: [...new Set(cats)].slice(0, 10),
        };
      }
    },
    start(ws) {
      this.requireHost(ws);
      const s = this.s;
      if (s.phase !== "LOBBY") throw new Error("Das Spiel läuft schon.");
      if (this.playersArr().length < 2) throw new Error("Es braucht mindestens 2 Mitspielende.");
      for (const p of this.playersArr()) p.score = 0;
      s.round = 0;
      if (s.game === "wwe") this.wweStart();
      else {
        s.usedLetters = [];
        this.slfStartRound();
      }
    },
    next(ws) {
      this.requireHost(ws);
      const s = this.s;
      if (s.game === "wwe") {
        if (s.phase === "QUESTION") this.wweReveal();
        else if (s.phase === "RESULT") this.wweNext();
      } else {
        if (s.phase === "WRITING") this.slfToReview();
        else if (s.phase === "REVIEW") this.slfScore();
        else if (s.phase === "SCORES") {
          if (s.round >= s.settings.rounds) {
            s.phase = "END";
            s.endsAt = null;
          } else this.slfStartRound();
        }
      }
    },
    restart(ws) {
      this.requireHost(ws);
      const s = this.s;
      for (const p of this.playersArr()) p.score = 0;
      Object.assign(s, { phase: "LOBBY", round: 0, endsAt: null, votes: {}, result: null, history: [], answers: {}, flags: {}, roundScores: null, letter: null, usedLetters: [], stoppedBy: null });
    },
    kick(ws, { playerId }) {
      this.requireHost(ws);
      if (!this.s.players[playerId]) throw new Error("Spieler nicht gefunden.");
      delete this.s.players[playerId];
      delete this.s.votes[playerId];
      delete this.s.answers[playerId];
      for (const o of this.sockets()) {
        if (this.att(o).playerId === playerId) {
          this.send(o, { t: "evt", event: "kicked", payload: {} });
          o.serializeAttachment({ role: null });
        }
      }
    },

    /* Handys */
    join(ws, { name, token }) {
      const s = this.s;
      let p = typeof token === "string" && token ? this.playersArr().find((x) => x.token === token) : null;
      if (!p) {
        const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 16);
        if (!clean) throw new Error("Bitte gib einen Namen ein.");
        if (this.playersArr().some((x) => x.name.toLowerCase() === clean.toLowerCase())) throw new Error("Dieser Name ist schon vergeben.");
        if (this.playersArr().length >= MAX_PLAYERS) throw new Error("Der Raum ist voll.");
        p = { id: makeId(8), token: makeId(16), name: clean, score: 0, connected: true, joined: ++s.order };
        s.players[p.id] = p;
      }
      p.connected = true;
      ws.serializeAttachment({ role: "player", playerId: p.id });
      return { playerId: p.id, token: p.token };
    },
    vote(ws, { targetId }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "wwe" || s.phase !== "QUESTION") throw new Error("Gerade wird nicht abgestimmt.");
      if (!s.players[targetId]) throw new Error("Ungültige Wahl.");
      s.votes[pid] = targetId;
      this.wweMaybeAll();
    },
    // Zwischenspeichern beim Tippen (ohne Broadcast an alle) und Abgabe
    answers(ws, { values, final }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "slf" || s.phase !== "WRITING") throw new Error("Gerade wird nicht geschrieben.");
      const clean = {};
      for (const cat of s.settings.categories) clean[cat] = String(values?.[cat] || "").trim().slice(0, 40);
      const prev = s.answers[pid];
      s.answers[pid] = { values: clean, final: !!final || !!prev?.final };
      if (final) {
        const on = this.online();
        if (on.length && on.every((p) => s.answers[p.id]?.final)) this.slfToReview();
        return {};
      }
      return { quiet: true };
    },
    // „Stopp!“ – wer alles ausgefüllt hat, verkürzt die Zeit für alle auf 10 Sekunden
    stop(ws) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "slf" || s.phase !== "WRITING") throw new Error("Gerade wird nicht geschrieben.");
      const vals = s.answers[pid]?.values || {};
      if (!s.settings.categories.every((c) => String(vals[c] || "").trim())) throw new Error("Erst alle Felder ausfüllen.");
      if (s.stoppedBy) return {};
      s.stoppedBy = pid;
      s.endsAt = Math.min(s.endsAt, Date.now() + 10_000);
    },
    flag(ws, { playerId, cat }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "slf" || s.phase !== "REVIEW") throw new Error("Gerade wird nicht ausgewertet.");
      if (playerId === pid) throw new Error("Eigene Antworten kannst du nicht anzweifeln.");
      if (!s.players[playerId] || !s.settings.categories.includes(cat)) throw new Error("Ungültig.");
      const key = `${playerId}|${cat}`;
      s.flags[key] = s.flags[key] || {};
      if (s.flags[key][pid]) delete s.flags[key][pid];
      else s.flags[key][pid] = true;
    },
    leave(ws) {
      const { playerId } = this.att(ws);
      const s = this.s;
      if (playerId && s.players[playerId] && s.phase === "LOBBY") delete s.players[playerId];
      else if (playerId && s.players[playerId]) s.players[playerId].connected = false;
      ws.serializeAttachment({ role: null });
      if (s.game === "wwe") this.wweMaybeAll();
    },
  };
}
