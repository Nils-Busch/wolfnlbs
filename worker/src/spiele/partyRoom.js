// Gruppenspiele mit Bildschirm + Handys: „Wer würde eher …?“ und Stadt-Land-Fluss.
// Ein Durable Object = ein Raum mit 4-stelligem Code. Aufbau wie beim Quiz-Raum:
//  - Bildschirm/Spielleitung ("host") weist sich mit dem geheimen hostKey aus.
//  - Handys ("player") treten mit Namen bei und bekommen ein Token für Neuladen.
// WebSocket-Hibernation, kompletter Zustand nach jeder Änderung im Storage,
// Timer über Alarms, Aufräumen nach 1 h ohne Verbindung.

import { DurableObject } from "cloudflare:workers";
import { makeId } from "../woelfe/ids.js";
import { SELF_HOST, extraMethods } from "./partyExtra.js";
import { KN_CATS, knScore, knTotals } from "./kniffel.js";
import { defaultSettings, placements, teamPlacements, eveningSummary, TITLES, EVENING_POINTS } from "./evening.js";
import { TEAM_GAMES, teamMethods, parseCards, cardsText } from "./teamGames.js";
export { defaultSettings, placements, teamPlacements, eveningSummary, TITLES, EVENING_POINTS };
export { KN_CATS, knScore, knTotals };

const EMPTY_CLEANUP_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 30;
const MAX_MESSAGE_BYTES = 8 * 1024;
const BOT_NAMES = ["Kalle", "Uschi", "Bernd", "Heike", "Jupp", "Gabi", "Rudi", "Moni"];

export const GAMES = { wwe: "Wer würde eher …?", slf: "Stadt-Land-Fluss", kniffel: "Kniffel", maexchen: "Mäxchen", draw: "Montagsmaler", agent: "Agentenrunde", explain: "Erklärbär" };

// Kniffel-Regeln liegen in ./kniffel.js (ohne Cloudflare-Abhängigkeit, damit sie testbar sind)

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
        for (const p of Object.values(this.s.players)) p.connected = !!p.bot || online.has(p.id);
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
      settings: defaultSettings(game),
      // Spieleabend: Wertung über alle Spiele im Raum
      evening: { scores: {}, played: [] },
      runId: 0,
      recorded: 0,
      runPlayers: [],
      gallery: [],
      // Kniffel, Mäxchen, Montagsmaler
      kn: null,
      mx: null,
      dr: null,
      hostPlayer: null,
      // Teamspiele (Agentenrunde, Erklärbär)
      teams: {},
      ag: null,
      ex: null,
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
    return { id: p.id, name: p.name, connected: p.connected, score: p.score || 0, bot: !!p.bot };
  }

  /* ---------- Ansicht (Handys sehen fremde Antworten erst in der Auswertung) ---------- */
  view(role, playerId, isHost = false) {
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
      selfHost: SELF_HOST.has(s.game),
      hostPlayer: s.hostPlayer,
      games: GAMES,
      evening: s.evening && s.evening.played.length ? eveningSummary(s.evening) : null,
      galleryMeta: (s.gallery || []).map((g, i) => ({ i, word: g.word, drawer: g.drawer })),
    };
    // Eigene Montagsmaler-Wörter sieht nur die Spielleitung
    if (s.game === "draw") {
      const words = s.settings.words || [];
      v.settings = { ...s.settings, words: undefined, wordCount: words.length };
      if (role === "host" || isHost) v.wordsText = words.join("\n");
    }
    if (role === "player") {
      const me = s.players[playerId];
      v.me = me ? { id: me.id, name: me.name, score: me.score || 0, host: !!isHost, team: s.teams?.[me.id] ?? null } : null;
    }
    if (TEAM_GAMES.has(s.game)) {
      Object.assign(v, this.tmTeamsView());
      const own = role === "host" || isHost;
      if (s.game === "agent") {
        const words = s.settings.words || [];
        v.settings = { ...s.settings, words: undefined, wordCount: words.length };
        if (own) v.wordsText = words.join("\n");
        v.ag = this.agView(role === "player" ? playerId : null);
        v.timerTotal = (s.settings.seconds || 0) * 1000;
      } else {
        const cards = s.settings.cards || [];
        v.settings = { ...s.settings, cards: undefined, cardCount: cards.length };
        if (own) v.cardsText = cardsText(cards);
        v.ex = this.exView(role === "player" ? playerId : null);
        v.timerTotal = s.settings.seconds * 1000;
      }
      return v;
    }
    if (s.game === "maexchen") {
      v.mx = this.mxView(role === "player" ? playerId : null);
      return v;
    }
    if (s.game === "draw") {
      v.dr = this.drView(role === "player" ? playerId : null);
      v.timerTotal = s.dr ? s.dr.total : null;
      return v;
    }
    if (s.game === "wwe") {
      if (s.phase === "QUESTION" || s.phase === "RESULT") {
        v.question = s.questions[s.round - 1];
        v.voted = Object.keys(s.votes);
        if (role === "player") v.myVote = s.votes[playerId] || null;
      }
      if (s.phase === "RESULT") v.result = s.result;
      if (s.phase === "END") v.awards = this.wweAwards();
    } else if (s.game === "kniffel") {
      v.cats = KN_CATS;
      if (s.kn) {
        const kn = s.kn;
        const cur = kn.order[kn.turn];
        v.kn = {
          order: kn.order,
          current: cur,
          dice: kn.dice,
          held: kn.held,
          rollsLeft: kn.rollsLeft,
          rollId: kn.rollId,
          last: kn.last,
          sheets: kn.sheets,
          totals: Object.fromEntries(Object.entries(kn.sheets).map(([id, sh]) => [id, knTotals(sh)])),
          options: kn.rollsLeft < 3 ? Object.fromEntries(KN_CATS.filter((c) => kn.sheets[cur]?.[c.key] == null).map((c) => [c.key, knScore(c.key, kn.dice)])) : {},
        };
      }
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
    this.eveningRecord();
    let host = null;
    for (const ws of this.sockets()) {
      const a = this.att(ws);
      if (a.role === "host") {
        host = host || JSON.stringify({ t: "evt", event: "state", payload: this.view("host") });
        try {
          ws.send(host);
        } catch {}
      } else if (a.role === "player") {
        this.send(ws, { t: "evt", event: "state", payload: this.view("player", a.playerId, !!a.host) });
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

  /* ---------- Kniffel ---------- */
  knStart() {
    const s = this.s;
    const order = shuffle(this.playersArr().map((p) => p.id));
    s.kn = {
      order,
      turn: 0,
      dice: [1, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      rollsLeft: 3,
      rollId: 0,
      last: null,
      sheets: Object.fromEntries(order.map((id) => [id, {}])),
    };
    s.round = 1;
    s.phase = "PLAYING";
    s.endsAt = null;
  }
  knCurrent() {
    return this.s.kn.order[this.s.kn.turn];
  }
  knAdvance() {
    const s = this.s;
    const kn = s.kn;
    // nächste Person, die noch in diesem Spiel ist
    for (let k = 1; k <= kn.order.length; k++) {
      const idx = (kn.turn + k) % kn.order.length;
      if (idx === 0) s.round++;
      if (s.players[kn.order[idx]]) {
        kn.turn = idx;
        break;
      }
    }
    kn.held = [false, false, false, false, false];
    kn.rollsLeft = 3;
    const live = kn.order.filter((id) => s.players[id]);
    if (live.every((id) => KN_CATS.every((c) => kn.sheets[id]?.[c.key] != null))) {
      for (const id of live) s.players[id].score = knTotals(kn.sheets[id]).total;
      s.phase = "END";
    }
  }
  knEnter(pid, key) {
    const kn = this.s.kn;
    const sheet = kn.sheets[pid];
    if (!KN_CATS.some((c) => c.key === key)) throw new Error("Unbekanntes Feld.");
    if (sheet[key] != null) throw new Error("Dieses Feld ist schon belegt.");
    const pts = knScore(key, kn.dice);
    sheet[key] = pts;
    kn.last = { player: pid, key, points: pts };
    this.s.players[pid].score = knTotals(sheet).total;
    this.knAdvance();
  }
  // Host überspringt: bester freier Wert wird eingetragen (ohne Wurf: Würfel werden einmal geworfen)
  knSkip() {
    const kn = this.s.kn;
    const pid = this.knCurrent();
    if (kn.rollsLeft === 3) {
      kn.dice = kn.dice.map(() => 1 + Math.floor(Math.random() * 6));
      kn.rollId++;
    }
    const free = KN_CATS.filter((c) => kn.sheets[pid][c.key] == null);
    const best = free.reduce((b, c) => (knScore(c.key, kn.dice) > knScore(b.key, kn.dice) ? c : b), free[free.length - 1]);
    this.knEnter(pid, best.key);
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

  /* ---------- Spieleabend ---------- */
  eveningRecord() {
    const s = this.s;
    if (s.phase !== "END" || !s.runId || s.recorded === s.runId) return;
    s.recorded = s.runId;
    const list = (s.runPlayers || []).map((id) => s.players[id]).filter(Boolean).map((p) => ({ id: p.id, name: p.name, score: p.score || 0, team: s.teams?.[p.id] }));
    if (list.length < 2) return;
    const team = TEAM_GAMES.has(s.game);
    s.evening.played.push({ game: s.game, name: GAMES[s.game], at: Date.now(), results: team ? teamPlacements(list) : placements(list) });
    if (s.evening.played.length > 60) s.evening.played.shift();
  }

  /* ---------- Speichern & Alarm ---------- */
  async persist() {
    const s = this.s;
    if (!s) return;
    if (this.sockets().length) s.emptySince = null;
    else if (!s.emptySince) s.emptySince = Date.now();
    if (s.game === "maexchen") this.mxBotPlan();
    if (this.pendingImgs?.length) {
      for (const [k, v] of this.pendingImgs.splice(0)) await this.ctx.storage.put(k, v);
    }
    if (this.dropImgs?.length) await this.ctx.storage.delete(this.dropImgs.splice(0));
    await this.ctx.storage.put("state", s);
    const times = [s.createdAt + MAX_AGE_MS];
    if (s.game === "maexchen" && s.mx?.botAt) times.push(s.mx.botAt);
    if (s.endsAt && (s.phase === "QUESTION" || s.phase === "WRITING" || s.phase === "PLAYING" || s.phase === "CHOOSE" || s.phase === "DRAW" || s.phase === "REVEAL" || s.phase === "PLAY")) times.push(s.endsAt + 150);
    if (s.game === "draw" && s.phase === "DRAW" && s.dr?.hintTimes?.length) times.push(s.dr.hintTimes[0] + 50);
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
    if (s.game === "draw") {
      if (this.drTick(now)) this.broadcast();
    } else if (s.game === "agent") {
      if (this.agTick(now)) this.broadcast();
    } else if (s.game === "explain") {
      if (this.exTick(now)) this.broadcast();
    } else if (s.game === "maexchen") {
      if (s.endsAt && now >= s.endsAt && s.mx?.step === "reveal") {
        this.mxLose(s.mx.reveal.loser, s.mx.reveal.amount);
        this.broadcast();
      } else if (s.mx?.botAt && now >= s.mx.botAt) {
        s.mx.botAt = null;
        try { this.mxBotStep(); } catch (e) { console.error(e); }
        this.broadcast();
      }
    } else if (s.endsAt && now >= s.endsAt) {
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
      const result = await handler.call(this, ws, payload || {});
      if (result?.ink) {
        const msg = JSON.stringify({ t: "evt", event: "ink", payload: result.ink });
        for (const o of this.sockets()) if (o !== ws) try { o.send(msg); } catch {}
      }
      response = { ok: true, ...(result?.reply || result || {}) };
      delete response.ink;
      changed = result?.quiet ? false : true;
      if (result?.noPersist) {
        if (id != null) this.send(ws, { t: "res", id, res: response });
        return;
      }
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
    const a = this.att(ws);
    if (a.role !== "host" && !(a.role === "player" && a.host)) throw new Error("Nur die Spielleitung darf das.");
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
      } else if (s.game === "kniffel") {
        s.settings = { rounds: 13 };
      } else if (s.game === "maexchen") {
        const lives = Math.round(Number(settings?.lives));
        const lvl = ["easy", "medium", "hard"].includes(settings?.botLevel) ? settings.botLevel : s.settings.botLevel || "medium";
        s.settings = { lives: [3, 5, 7].includes(lives) ? lives : 3, botLevel: lvl };
      } else if (s.game === "draw") {
        // Eigene Wörter: eins pro Zeile oder mit Komma getrennt
        let words = s.settings.words || [];
        if (typeof settings?.words === "string") {
          words = [...new Set(settings.words.split(/[\n,;]+/).map((w) => w.replace(/\s+/g, " ").trim().slice(0, 30)).filter((w) => w.length >= 2))].slice(0, 300);
        }
        const mode = ["mix", "only", "off"].includes(settings?.wordMode) ? settings.wordMode : s.settings.wordMode || "mix";
        s.settings = { rounds: Math.min(3, Math.max(1, rounds || 2)), seconds: [60, 80, 100, 120].includes(seconds) ? seconds : 80, words, wordMode: mode };
      } else if (s.game === "agent") {
        let words = s.settings.words || [];
        if (typeof settings?.words === "string") {
          words = [...new Set(settings.words.split(/[\n,;]+/).map((w) => w.replace(/\s+/g, " ").trim().slice(0, 20)).filter((w) => w.length >= 2))].slice(0, 300);
        }
        const mode = ["mix", "only", "off"].includes(settings?.wordMode) ? settings.wordMode : s.settings.wordMode || "mix";
        s.settings = { rounds: [1, 2, 3].includes(rounds) ? rounds : 1, seconds: [0, 60, 90, 120, 180].includes(seconds) ? seconds : 0, words, wordMode: mode };
      } else if (s.game === "explain") {
        const cards = typeof settings?.cards === "string" ? parseCards(settings.cards) : s.settings.cards || [];
        const mode = ["mix", "only", "off"].includes(settings?.cardMode) ? settings.cardMode : s.settings.cardMode || "mix";
        s.settings = { rounds: Math.min(6, Math.max(1, rounds || 3)), seconds: [45, 60, 90].includes(seconds) ? seconds : 60, cards, cardMode: mode };
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
      s.runId = (s.runId || 0) + 1;
      s.runPlayers = this.playersArr().map((p) => p.id);
      if (s.game === "wwe") this.wweStart();
      else if (s.game === "kniffel") this.knStart();
      else if (s.game === "maexchen") this.mxStart();
      else if (s.game === "draw") this.drStart();
      else if (s.game === "agent") this.agStart();
      else if (s.game === "explain") this.exStart();
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
      } else if (s.game === "kniffel") {
        if (s.phase === "PLAYING") this.knSkip();
      } else if (s.game === "maexchen") {
        if (s.phase === "PLAYING") this.mxSkip();
      } else if (s.game === "draw") {
        if (s.phase === "CHOOSE") this.drChoose(0);
        else if (s.phase === "DRAW") this.drEndTurn("skip");
        else if (s.phase === "REVEAL") this.drNextTurn();
      } else if (s.game === "agent") {
        this.agNext();
      } else if (s.game === "explain") {
        if (s.phase === "READY") this.exGo(null, true);
        else if (s.phase === "PLAY") this.exEndTurn();
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
      Object.assign(s, { phase: "LOBBY", round: 0, endsAt: null, votes: {}, result: null, history: [], answers: {}, flags: {}, roundScores: null, letter: null, usedLetters: [], stoppedBy: null, kn: null, mx: null, dr: null, ag: null, ex: null });
      if (TEAM_GAMES.has(s.game)) this.tmSync();
    },
    // Spieleabend: im selben Raum ein anderes Spiel wählen (Mitspielende bleiben)
    switchGame(ws, { game }) {
      this.requireHost(ws);
      const s = this.s;
      if (!Object.hasOwn(GAMES, game)) throw new Error("Unbekanntes Spiel.");
      if (!["LOBBY", "END", "FINALE"].includes(s.phase)) throw new Error("Erst das laufende Spiel beenden.");
      if (game !== "maexchen") for (const p of this.playersArr()) if (p.bot) delete s.players[p.id];
      s.game = game;
      s.settings = defaultSettings(game);
      for (const p of this.playersArr()) p.score = 0;
      Object.assign(s, { phase: "LOBBY", round: 0, endsAt: null, votes: {}, result: null, history: [], answers: {}, flags: {}, roundScores: null, letter: null, usedLetters: [], stoppedBy: null, kn: null, mx: null, dr: null, ag: null, ex: null });
      if (TEAM_GAMES.has(game)) this.tmSync();
    },
    finale(ws) {
      this.requireHost(ws);
      const s = this.s;
      if (!["LOBBY", "END"].includes(s.phase)) throw new Error("Erst das laufende Spiel beenden.");
      if (!s.evening.played.length) throw new Error("Es wurde noch kein Spiel zu Ende gespielt.");
      s.phase = "FINALE";
      s.endsAt = null;
    },
    // Mäxchen: Computer an den Tisch holen
    addBot(ws) {
      this.requireHost(ws);
      const s = this.s;
      if (s.game !== "maexchen" || s.phase !== "LOBBY") throw new Error("Computer gibt es nur im Mäxchen-Warteraum.");
      const bots = this.playersArr().filter((p) => p.bot);
      if (bots.length >= 6) throw new Error("Höchstens 6 Computer.");
      if (this.playersArr().length >= MAX_PLAYERS) throw new Error("Der Raum ist voll.");
      const taken = new Set(this.playersArr().map((p) => p.name.toLowerCase()));
      const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) || `Computer ${bots.length + 1}`;
      const p = { id: makeId(8), token: null, name, score: 0, connected: true, joined: ++s.order, bot: true };
      s.players[p.id] = p;
    },
    // Montagsmaler-Galerie: ein Bild nachladen (Bilder liegen getrennt im Speicher)
    async galleryItem(ws, { i }) {
      const meta = this.s.gallery?.[Number(i)];
      if (!meta) throw new Error("Bild nicht gefunden.");
      const img = await this.ctx.storage.get(meta.key);
      return { quiet: true, noPersist: true, reply: { word: meta.word, drawer: meta.drawer, strokes: img || [] } };
    },

    kick(ws, { playerId }) {
      this.requireHost(ws);
      if (!this.s.players[playerId]) throw new Error("Spieler nicht gefunden.");
      delete this.s.players[playerId];
      delete this.s.votes[playerId];
      delete this.s.answers[playerId];
      if (this.s.game === "maexchen") this.mxRemove(playerId);
      if (TEAM_GAMES.has(this.s.game)) this.tmRemove(playerId);
      if (this.s.game === "draw" && this.s.dr && this.s.dr.drawer === playerId && (this.s.phase === "CHOOSE" || this.s.phase === "DRAW")) this.drEndTurn("left");
      if (this.s.game === "kniffel" && this.s.phase === "PLAYING" && this.s.kn) {
        if (this.knCurrent() === playerId) this.knAdvance();
        else if (this.s.kn.order.every((id) => !this.s.players[id])) this.s.phase = "END";
      }
      for (const o of this.sockets()) {
        if (this.att(o).playerId === playerId) {
          this.send(o, { t: "evt", event: "kicked", payload: {} });
          o.serializeAttachment({ role: null });
        }
      }
    },

    /* Handys */
    join(ws, { name, token, hostKey }) {
      const s = this.s;
      let p = typeof token === "string" && token ? this.playersArr().find((x) => x.token === token) : null;
      if (!p) {
        const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 16);
        if (!clean) throw new Error("Bitte gib einen Namen ein.");
        if (this.playersArr().some((x) => x.name.toLowerCase() === clean.toLowerCase())) throw new Error("Dieser Name ist schon vergeben.");
        if (this.playersArr().length >= MAX_PLAYERS) throw new Error("Der Raum ist voll.");
        p = { id: makeId(8), token: makeId(16), name: clean, score: 0, connected: true, joined: ++s.order };
        s.players[p.id] = p;
        if (TEAM_GAMES.has(s.game)) this.tmSync();
      }
      p.connected = true;
      // Bei Mäxchen/Montagsmaler spielt die Spielleitung selbst mit (hostKey beim Beitreten)
      const isHost = typeof hostKey === "string" && hostKey === s.hostKey;
      if (isHost) s.hostPlayer = p.id;
      ws.serializeAttachment({ role: "player", playerId: p.id, host: isHost });
      return { playerId: p.id, token: p.token, host: isHost };
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
    // Kniffel: nur wer dran ist
    roll(ws) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "kniffel" || s.phase !== "PLAYING") throw new Error("Gerade wird nicht gewürfelt.");
      if (this.knCurrent() !== pid) throw new Error("Du bist nicht dran.");
      const kn = s.kn;
      if (kn.rollsLeft <= 0) throw new Error("Keine Würfe mehr – trag ein Ergebnis ein.");
      if (kn.rollsLeft === 3) kn.held = [false, false, false, false, false];
      kn.dice = kn.dice.map((d, i) => (kn.held[i] ? d : 1 + Math.floor(Math.random() * 6)));
      kn.rollsLeft--;
      kn.rollId++;
      kn.last = null;
    },
    hold(ws, { index }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "kniffel" || s.phase !== "PLAYING" || this.knCurrent() !== pid) throw new Error("Du bist nicht dran.");
      const kn = s.kn;
      if (kn.rollsLeft === 3 || kn.rollsLeft === 0) throw new Error("Jetzt kann nichts festgehalten werden.");
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i > 4) throw new Error("Ungültiger Würfel.");
      kn.held[i] = !kn.held[i];
    },
    score(ws, { key }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "kniffel" || s.phase !== "PLAYING" || this.knCurrent() !== pid) throw new Error("Du bist nicht dran.");
      if (s.kn.rollsLeft === 3) throw new Error("Erst würfeln.");
      this.knEnter(pid, key);
    },

    // Mäxchen
    mx(ws, payload) {
      const pid = this.requirePlayer(ws);
      this.mxAct(pid, payload || {});
    },
    // Montagsmaler
    choose(ws, { index }) {
      const pid = this.requirePlayer(ws);
      const s = this.s;
      if (s.game !== "draw" || s.phase !== "CHOOSE" || s.dr.drawer !== pid) throw new Error("Du wählst gerade kein Wort.");
      const i = Number(index);
      if (![0, 1, 2].includes(i)) throw new Error("Ungültige Wahl.");
      this.drChoose(i);
    },
    guess(ws, { text }) {
      const pid = this.requirePlayer(ws);
      return this.drGuess(pid, text);
    },
    ink(ws, payload) {
      const pid = this.requirePlayer(ws);
      const ink = this.drInk(pid, payload || {});
      return { quiet: true, noPersist: true, ink: ink || undefined, reply: {} };
    },
    undo(ws) {
      const pid = this.requirePlayer(ws);
      const dr = this.s.dr;
      if (this.s.game !== "draw" || this.s.phase !== "DRAW" || dr.drawer !== pid) throw new Error("Du zeichnest gerade nicht.");
      dr.strokes.pop();
      dr.rev++;
    },
    clear(ws) {
      const pid = this.requirePlayer(ws);
      const dr = this.s.dr;
      if (this.s.game !== "draw" || this.s.phase !== "DRAW" || dr.drawer !== pid) throw new Error("Du zeichnest gerade nicht.");
      dr.strokes = [];
      dr.rev++;
    },
    strokes() {
      const dr = this.s.dr;
      return { quiet: true, noPersist: true, reply: { strokes: dr ? dr.strokes : [], rev: dr ? dr.rev : 0 } };
    },

    // Teamspiele
    team(ws, { team, playerId }) {
      const pid = playerId ? (this.requireHost(ws), playerId) : this.requirePlayer(ws);
      this.tmSet(pid, Number(team));
    },
    shuffleTeams(ws) {
      this.requireHost(ws);
      this.tmShuffle();
    },
    clue(ws, { word, n }) {
      const pid = this.requirePlayer(ws);
      this.agClue(pid, word, n);
    },
    tap(ws, { index }) {
      const pid = this.requirePlayer(ws);
      return { reply: this.agTap(pid, index) || {} };
    },
    pass(ws) {
      const pid = this.requirePlayer(ws);
      this.agPass(pid);
    },
    go(ws) {
      const pid = this.requirePlayer(ws);
      this.exGo(pid, !!this.att(ws).host);
    },
    mark(ws, { result, pos }) {
      const pid = this.requirePlayer(ws);
      const r = this.exMark(pid, result, pos);
      return r?.stale ? { quiet: true, reply: { stale: true } } : { reply: r || {} };
    },

    leave(ws) {
      const { playerId } = this.att(ws);
      const s = this.s;
      if (playerId && s.players[playerId] && s.phase === "LOBBY") {
        delete s.players[playerId];
        if (TEAM_GAMES.has(s.game)) this.tmRemove(playerId);
      }
      else if (playerId && s.players[playerId]) s.players[playerId].connected = false;
      ws.serializeAttachment({ role: null });
      if (s.game === "wwe") this.wweMaybeAll();
    },
  };
}

Object.assign(PartyRoom.prototype, extraMethods, teamMethods);
