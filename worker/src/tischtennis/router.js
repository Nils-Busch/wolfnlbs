// Workers-Router für das Tischtennis-Turnier (ersetzt Express+Postgres durch
// den Fetch-Handler + D1). Routen und Verhalten entsprechen 1:1 dem
// ursprünglichen server.js – siehe Kommentare bei den paar Stellen, die sich
// zwangsläufig unterscheiden (keine FOR-UPDATE-Sperren, kein array_agg, …).

import * as L from "./logic.js";
import { init, parseMatch, parsePlayer, deleteTournamentCascade, SPORTS } from "./db.js";
import { randomSlug, shuffle } from "./crypto.js";
import { HttpError, fail, intId, str } from "../konto/http.js";
import { getUser, handleKontoApi, isKontoPath } from "../konto/auth.js";
import { forgetGuestTournament } from "../zugang/gate.js";

function securityHeaders(res) {
  const h = new Headers(res.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "same-origin");
  return new Response(res.body, { status: res.status, headers: h });
}
function json(data, status = 200, extraHeaders) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(data), { status, headers });
}

/* ---------- Turnier-Ladehilfe (wie im Original) ---------- */
async function loadTournament(env, id) {
  const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(id).first();
  if (!t) fail(404, "Turnier nicht gefunden.");
  const playersRaw = await env.DB.prepare(
    "SELECT * FROM players WHERE tournament_id = ? ORDER BY seed IS NULL, seed, name"
  ).bind(id).all();
  const players = playersRaw.results.map(parsePlayer);
  const matchesRaw = await env.DB.prepare(
    "SELECT * FROM matches WHERE tournament_id = ? ORDER BY phase DESC, group_no, round, position"
  ).bind(id).all();
  const matches = matchesRaw.results.map(parseMatch);

  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const groups = [...new Set(players.map((p) => p.group_no).filter((g) => g != null))].sort((a, b) => a - b);
  const football = t.sport === "football";
  const table = football ? L.footballStandings : L.standings;
  const standings = groups.map((g) => ({
    group_no: g,
    rows: table(
      players.filter((p) => p.group_no === g).map((p) => p.id),
      matches.filter((m) => m.phase === "group" && m.group_no === g),
      names
    ),
  }));
  const koMatches = matches.filter((m) => m.phase === "ko");
  const wbMatches = koMatches.filter((m) => (m.bracket || "wb") === "wb");
  const lbMatches = koMatches.filter((m) => m.bracket === "lb");
  const wbCounts = {};
  wbMatches.forEach((m) => { wbCounts[m.round] = (wbCounts[m.round] || 0) + 1; });
  const wbNames = Object.fromEntries(Object.entries(wbCounts).map(([r, n]) => [r, L.koRoundName(n)]));
  const lbLastRound = lbMatches.reduce((max, m) => Math.max(max, m.round), 0);
  const lbNames = {};
  lbMatches.forEach((m) => { lbNames[m.round] = m.round === lbLastRound ? "Verliererbaum-Finale" : `Verliererbaum Runde ${m.round}`; });
  const roundNames = { wb: wbNames, lb: lbNames, gf: { 1: "Finale", 2: "Entscheidungsspiel" } };
  const tips = await tipSummary(env, id, matches);
  return { tournament: t, players, matches, standings, koRoundNames: roundNames, scorers: football ? L.topScorers(matches) : null, tips };
}

/* ---------- Tippspiel ---------- */
// Pro Spiel: wie viele auf Seite 1 / Unentschieden / Seite 2 getippt haben.
// Bestenliste: richtige Tipps je Gerät (Name = zuletzt benutzter Name), ohne Geräte-IDs.
async function tipSummary(env, tid, matches) {
  const rows = (await env.DB.prepare("SELECT match_id, device, name, pick, created_at FROM tips WHERE tournament_id = ?").bind(tid).all()).results;
  const counts = {};
  const people = new Map();
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  for (const r of rows) {
    const c = (counts[r.match_id] ||= [0, 0, 0]);
    c[r.pick === 1 ? 0 : r.pick === 0 ? 1 : 2]++;
    const m = byId[r.match_id];
    const p = people.get(r.device) || { name: r.name, at: 0, correct: 0, settled: 0, total: 0 };
    if (r.created_at >= p.at) { p.name = r.name; p.at = r.created_at; }
    p.total++;
    if (m && m.status === "done") {
      p.settled++;
      const win = m.winner_id == null ? 0 : m.winner_id === m.player1_id ? 1 : 2;
      if (win === r.pick) p.correct++;
    }
    people.set(r.device, p);
  }
  const board = [...people.values()]
    .filter((p) => p.settled > 0)
    .sort((a, b) => b.correct - a.correct || a.settled - b.settled || a.name.localeCompare(b.name, "de"))
    .slice(0, 25)
    .map(({ name, correct, settled, total }) => ({ name, correct, settled, total }));
  return { counts, board, people: people.size };
}
const DEVICE_RE = /^[A-Za-z0-9_-]{16,48}$/;

/* ---------- Vereinsrangliste über alle Turniere ---------- */
// Personen werden über den Namen erkannt (Groß-/Kleinschreibung und Leerzeichen egal).
// Tischtennis-Doppel (Einträge mit mehreren Kaderplätzen) zählen nicht mit.
const personKey = (name) => String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
async function clubRanking(env, sport) {
  const ts = (await env.DB.prepare("SELECT * FROM tournaments WHERE sport = ? AND status != 'draft'").bind(sport).all()).results;
  if (!ts.length) return { players: [], tournaments: 0, games: 0 };
  const ids = ts.map((t) => t.id);
  const ph = ids.map(() => "?").join(",");
  const players = (await env.DB.prepare(`SELECT * FROM players WHERE tournament_id IN (${ph})`).bind(...ids).all()).results.map(parsePlayer);
  const matches = (await env.DB.prepare(`SELECT * FROM matches WHERE tournament_id IN (${ph}) AND status = 'done'`).bind(...ids).all()).results.map(parseMatch);
  const P = Object.fromEntries(players.map((p) => [p.id, p]));
  const isDouble = (p) => sport === "tabletennis" && Array.isArray(p?.members) && p.members.length > 1;
  const order = Object.fromEntries(ts.map((t) => [t.id, `${t.event_date || ""}|${String(t.created_at).padStart(15, "0")}`]));
  const info = new Map(); // key -> { name, club, tournaments:Set, titles }
  const note = (p, tid) => {
    const k = personKey(p.name);
    const i = info.get(k) || { name: p.name, club: "", tournaments: new Set(), titles: 0, last: "" };
    if (order[tid] >= i.last) { i.name = p.name; i.last = order[tid]; if (p.club) i.club = p.club; }
    i.tournaments.add(tid);
    info.set(k, i);
    return k;
  };
  const games = [];
  matches
    .filter((m) => P[m.player1_id] && P[m.player2_id] && !isDouble(P[m.player1_id]) && !isDouble(P[m.player2_id]))
    .sort((a, b) => (order[a.tournament_id] < order[b.tournament_id] ? -1 : order[a.tournament_id] > order[b.tournament_id] ? 1 : a.updated_at - b.updated_at))
    .forEach((m) => {
      const a = note(P[m.player1_id], m.tournament_id), b = note(P[m.player2_id], m.tournament_id);
      const result = m.winner_id == null ? 0.5 : m.winner_id === m.player1_id ? 1 : 0;
      games.push({ a, b, result });
    });
  // Turniersiege
  for (const t of ts.filter((x) => x.status === "finished")) {
    const tm = matches.filter((m) => m.tournament_id === t.id);
    let w = null;
    if (t.format === "league") {
      const ids2 = players.filter((p) => p.tournament_id === t.id).map((p) => p.id);
      const table = (sport === "football" ? L.footballStandings : L.standings)(ids2, tm.filter((m) => m.phase === "group"), {});
      w = table[0]?.player_id;
    } else if (t.double_elim) {
      const gf1 = tm.find((m) => m.bracket === "gf" && m.round === 1);
      const gf2 = tm.find((m) => m.bracket === "gf" && m.round === 2);
      w = (gf2 || gf1)?.winner_id;
    } else {
      w = tm.find((m) => m.phase === "ko" && !m.next_match_id)?.winner_id;
    }
    if (w && P[w] && !isDouble(P[w])) {
      const k = personKey(P[w].name);
      const i = info.get(k);
      if (i) i.titles++;
    }
  }
  const ranking = L.eloRanking(games).map((r) => {
    const i = info.get(r.key) || {};
    return { name: i.name, club: i.club || "", rating: r.rating, best: r.best, games: r.games, wins: r.wins, draws: r.draws, losses: r.losses, history: r.history, tournaments: i.tournaments ? i.tournaments.size : 0, titles: i.titles || 0 };
  });
  return { players: ranking, tournaments: ts.length, games: games.length };
}

function tournamentFields(b, t = {}) {
  const out = {
    sport: b.sport !== undefined ? b.sport : (t.sport ?? "tabletennis"),
    name: b.name !== undefined ? str(b.name, 120) : t.name,
    event_date: b.event_date !== undefined ? (b.event_date || null) : (t.event_date ?? null),
    location: b.location !== undefined ? str(b.location, 120) : (t.location ?? ""),
    format: b.format ?? t.format,
    best_of: b.best_of !== undefined ? Number(b.best_of) : (t.best_of ?? 5),
    group_count: b.group_count !== undefined ? Number(b.group_count) : (t.group_count ?? 2),
    advance_per_group: b.advance_per_group !== undefined ? Number(b.advance_per_group) : (t.advance_per_group ?? 2),
    double_elim: b.double_elim !== undefined ? !!b.double_elim : !!(t.double_elim ?? false),
  };
  if (!out.name) fail(400, "Name fehlt.");
  if (out.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.event_date).slice(0, 10))) fail(400, "Datum im Format JJJJ-MM-TT.");
  if (!SPORTS.includes(out.sport)) fail(400, "Unbekannte Sportart.");
  if (out.sport === "football") out.best_of = 1; // Fußball kennt keine Sätze
  if (!["ko", "league", "group"].includes(out.format)) fail(400, "Unbekannter Modus.");
  if (![1, 3, 5, 7].includes(out.best_of)) fail(400, "Spielmodus: Einzelspiel oder Best of 3, 5 oder 7.");
  if (!Number.isInteger(out.group_count) || out.group_count < 1 || out.group_count > 32) fail(400, "Gruppenanzahl 1–32.");
  if (!Number.isInteger(out.advance_per_group) || out.advance_per_group < 1 || out.advance_per_group > 16) fail(400, "Weiterkommende pro Gruppe 1–16.");
  if (out.format === "league") out.double_elim = false;
  return out;
}

function orderPlayers(players) {
  const seeded = players.filter((p) => p.seed != null).sort((a, b) => a.seed - b.seed);
  return [...seeded, ...shuffle(players.filter((p) => p.seed == null))].map((p) => p.id);
}

async function createKo(env, tid, orderedIds) {
  const size = Math.max(2, L.nextPow2(orderedIds.length));
  const rounds = Math.log2(size);
  const ids = {};
  const now = Date.now();
  for (let r = rounds; r >= 1; r--) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      const next = r < rounds ? ids[`${r + 1}-${Math.ceil(p / 2)}`] : null;
      const res = await env.DB.prepare(
        `INSERT INTO matches (tournament_id, phase, bracket, round, position, next_match_id, next_slot, updated_at)
         VALUES (?,'ko','wb',?,?,?,?,?)`
      ).bind(tid, r, p, next, next ? (p % 2 ? 1 : 2) : null, now).run();
      ids[`${r}-${p}`] = res.meta.last_row_id;
    }
  }
  const order = L.seedOrder(size);
  for (let p = 1; p <= size / 2; p++) {
    const a = orderedIds[order[2 * p - 2] - 1] ?? null;
    const b = orderedIds[order[2 * p - 1] - 1] ?? null;
    const matchId = ids[`1-${p}`];
    const row = await env.DB.prepare("UPDATE matches SET player1_id=?, player2_id=? WHERE id=? RETURNING *").bind(a, b, matchId).first();
    if ((a === null) !== (b === null)) {
      const w = a ?? b;
      await env.DB.prepare("UPDATE matches SET status='bye', winner_id=? WHERE id=?").bind(w, matchId).run();
      await placeWinner(env, row, w);
    }
  }
}

// Kleine Helfer, weil createKo oben next_match_id der Runde-1-Partie braucht,
// um ein Freilos sofort weiterzureichen (wie im Original per m.next_match_id).
async function placeWinner(env, m, winnerId) {
  if (!m.next_match_id) return;
  const col = m.next_slot === 1 ? "player1_id" : "player2_id";
  await env.DB.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).bind(winnerId, m.next_match_id).run();
}
async function placeLoser(env, m, loserId) {
  if (!m.loser_next_match_id) return;
  const col = m.loser_next_slot === 1 ? "player1_id" : "player2_id";
  await env.DB.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).bind(loserId, m.loser_next_match_id).run();
}

async function createDoubleKo(env, tid, orderedIds) {
  const size = orderedIds.length;
  const wbRounds = Math.log2(size);
  const lbRounds = 2 * (wbRounds - 1);
  const now = Date.now();
  const ins = async (bracket, round, position) => {
    const res = await env.DB.prepare(
      `INSERT INTO matches (tournament_id, phase, bracket, round, position, updated_at) VALUES (?,'ko',?,?,?,?)`
    ).bind(tid, bracket, round, position, now).run();
    return res.meta.last_row_id;
  };

  const wbIds = {}, lbIds = {};
  for (let r = 1; r <= wbRounds; r++) for (let p = 1; p <= size / 2 ** r; p++) wbIds[`${r}-${p}`] = await ins("wb", r, p);
  for (let lr = 1; lr <= lbRounds; lr++) { const j = Math.ceil(lr / 2); for (let p = 1; p <= size / 2 ** (j + 1); p++) lbIds[`${lr}-${p}`] = await ins("lb", lr, p); }
  const gf1 = await ins("gf", 1, 1);

  for (let r = 1; r <= wbRounds; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      const next = r === wbRounds ? gf1 : wbIds[`${r + 1}-${Math.ceil(p / 2)}`];
      const nextSlot = r === wbRounds ? 1 : (p % 2 ? 1 : 2);
      const loserNext = r === 1 ? lbIds[`1-${Math.ceil(p / 2)}`] : lbIds[`${2 * (r - 1)}-${p}`];
      const loserSlot = r === 1 ? (p % 2 ? 1 : 2) : 2;
      await env.DB.prepare(
        "UPDATE matches SET next_match_id=?, next_slot=?, loser_next_match_id=?, loser_next_slot=? WHERE id=?"
      ).bind(next, nextSlot, loserNext, loserSlot, wbIds[`${r}-${p}`]).run();
    }
  }
  for (let lr = 1; lr <= lbRounds; lr++) {
    const j = Math.ceil(lr / 2);
    const count = size / 2 ** (j + 1);
    for (let p = 1; p <= count; p++) {
      let next, slot;
      if (lr === lbRounds) { next = gf1; slot = 2; }
      else if (lr % 2 === 1) { next = lbIds[`${lr + 1}-${p}`]; slot = 1; }
      else { next = lbIds[`${lr + 1}-${Math.ceil(p / 2)}`]; slot = p % 2 ? 1 : 2; }
      await env.DB.prepare("UPDATE matches SET next_match_id=?, next_slot=? WHERE id=?").bind(next, slot, lbIds[`${lr}-${p}`]).run();
    }
  }

  const order = L.seedOrder(size);
  for (let p = 1; p <= size / 2; p++) {
    const a = orderedIds[order[2 * p - 2] - 1];
    const b = orderedIds[order[2 * p - 1] - 1];
    await env.DB.prepare("UPDATE matches SET player1_id=?, player2_id=? WHERE id=?").bind(a, b, wbIds[`1-${p}`]).run();
  }
}

async function createRoundRobin(env, tid, groupNo, ids) {
  const rr = L.roundRobin(ids);
  let pos = 0;
  const now = Date.now();
  for (const g of rr) {
    await env.DB.prepare(
      `INSERT INTO matches (tournament_id, phase, group_no, round, position, player1_id, player2_id, updated_at)
       VALUES (?,'group',?,?,?,?,?,?)`
    ).bind(tid, groupNo, g.round, ++pos, g.a, g.b, now).run();
  }
}

async function updateStatus(env, tid) {
  const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(tid).first();
  if (t.status === "draft") return;
  const msRaw = await env.DB.prepare("SELECT * FROM matches WHERE tournament_id = ?").bind(tid).all();
  const ms = msRaw.results;
  let finished;
  if (t.format === "league") {
    finished = ms.length > 0 && ms.every((m) => m.status !== "pending");
  } else if (t.double_elim) {
    const gf1 = ms.find((m) => m.bracket === "gf" && m.round === 1);
    const gf2 = ms.find((m) => m.bracket === "gf" && m.round === 2);
    finished = !!gf1 && gf1.status === "done" && (gf1.winner_id === gf1.player1_id || (!!gf2 && gf2.status === "done"));
  } else {
    finished = ms.some((m) => m.phase === "ko" && !m.next_match_id && m.status !== "pending");
  }
  await env.DB.prepare("UPDATE tournaments SET status = ? WHERE id = ?").bind(finished ? "finished" : "running", tid).run();
  // Nach dem letzten Spiel gilt ein laufender Gastzugang noch 12 Stunden.
  if (finished) {
    const cap = Date.now() + 12 * 3_600_000;
    const r = await env.DB.prepare("UPDATE tournaments SET guest_until = ? WHERE id = ? AND guest_until > ?").bind(cap, tid, cap).run();
    if (r.meta?.changes) forgetGuestTournament(tid);
  }
}

async function assertDraft(env, tid) {
  const t = await env.DB.prepare("SELECT status FROM tournaments WHERE id = ?").bind(tid).first();
  if (!t) fail(404, "Turnier nicht gefunden.");
  if (t.status !== "draft") fail(409, "Teilnehmer lassen sich nur vor dem Start ändern. Turnier ggf. zurücksetzen.");
}
// Kader eines Teams: Text mit einem Namen pro Zeile oder Liste -> JSON [{name}] (null = kein Kader).
const membersVal = (v) => {
  if (v === undefined || v === null) return null;
  const list = (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x?.name)) : String(v).split("\n"))
    .map((x) => str(x, 80))
    .filter(Boolean)
    .slice(0, 60);
  return list.length ? JSON.stringify(list.map((name) => ({ name }))) : null;
};
const seedVal = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 999) fail(400, "Setzplatz muss eine Zahl von 1–999 sein.");
  return n;
};

async function lockMatch(env, id) {
  const m = await env.DB.prepare(
    `SELECT m.*, t.best_of, t.sport, t.status AS t_status FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = ?`
  ).bind(id).first();
  if (!m) fail(404, "Spiel nicht gefunden.");
  if (m.status === "bye") fail(409, "Freilos – hier gibt es kein Ergebnis.");
  if (m.t_status === "draft") fail(409, "Turnier ist nicht gestartet.");
  if (m.next_match_id) {
    const n = await env.DB.prepare("SELECT status FROM matches WHERE id = ?").bind(m.next_match_id).first();
    if (n.status === "done") fail(409, "Das Folgespiel hat schon ein Ergebnis. Erst dieses zurücksetzen.");
  }
  if (m.loser_next_match_id) {
    const n = await env.DB.prepare("SELECT status FROM matches WHERE id = ?").bind(m.loser_next_match_id).first();
    if (n.status === "done") fail(409, "Das Spiel im Verliererbaum, in das der/die Verlierer:in gefallen ist, hat schon ein Ergebnis. Erst dieses zurücksetzen.");
  }
  if (m.bracket === "gf" && m.round === 1) {
    const gf2 = await env.DB.prepare("SELECT status FROM matches WHERE tournament_id = ? AND bracket = 'gf' AND round = 2").bind(m.tournament_id).first();
    if (gf2 && gf2.status === "done") fail(409, "Das Entscheidungsspiel hat schon ein Ergebnis. Erst dieses zurücksetzen.");
  }
  if (m.phase === "group") {
    const ko = await env.DB.prepare("SELECT 1 FROM matches WHERE tournament_id = ? AND phase = 'ko' LIMIT 1").bind(m.tournament_id).first();
    if (ko) fail(409, "Die KO-Phase läuft schon – Gruppenergebnisse sind gesperrt.");
  }
  return parseMatch(m);
}

async function syncGrandFinalReset(env, m, winnerId) {
  if (!(m.bracket === "gf" && m.round === 1)) return;
  const needsReset = winnerId === m.player2_id;
  const existing = await env.DB.prepare("SELECT id FROM matches WHERE tournament_id = ? AND bracket = 'gf' AND round = 2").bind(m.tournament_id).first();
  if (needsReset && !existing) {
    await env.DB.prepare(
      `INSERT INTO matches (tournament_id, phase, bracket, round, position, player1_id, player2_id, updated_at)
       VALUES (?,'ko','gf',2,1,?,?,?)`
    ).bind(m.tournament_id, m.player1_id, m.player2_id, Date.now()).run();
  } else if (!needsReset && existing) {
    await env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(existing.id).run();
  }
}

/* =========================================================================
   Haupt-Handler
   path: Pfad relativ zu "/api/tischtennis", z.B. "/auth/login", "/tournaments/5"
   ========================================================================= */
export async function handleTischtennisApi(request, env, path, ctx = {}) {
  // Turnier-Gast (Gastlink): nur lesen und tippen, nur „sein“ Turnier
  const guestTid = ctx.guestTid ?? null;
  if (guestTid != null && !/^\/(tournaments(\/\d+(\/tips)?)?|matches\/\d+\/tip)$/.test(path)) {
    return securityHeaders(json({ error: "Mit dem Gastzugang kannst du nur zuschauen und tippen." }, 403));
  }
  // Anmeldung und Benutzerverwaltung gehören jetzt zu den gemeinsamen Konten.
  // Die alten Pfade unter /api/tischtennis/auth/* und /users* leiten wir
  // weiter, damit nichts kaputtgeht.
  if (isKontoPath(path)) return handleKontoApi(request, env, path);

  await init(env);
  const method = request.method;

  // CSRF-Grundschutz: schreibende Requests nur als JSON.
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json") && !(method === "DELETE" && !request.headers.get("content-length"))) {
      return securityHeaders(json({ error: "Content-Type application/json erforderlich." }, 415));
    }
  }

  const user = await getUser(request, env);
  const requirePerm = (perm) => { if (!user) fail(401, "Bitte anmelden."); if (!user.permissions.includes(perm)) fail(403, `Fehlendes Recht: ${perm}`); };

  let body = null;
  const readBody = async () => {
    if (body !== null) return body;
    const text = await request.text();
    if (text.length > 100_000) fail(413, "Anfrage zu groß.");
    try { body = text ? JSON.parse(text) : {}; } catch { fail(400, "Ungültiges JSON."); }
    return body;
  };

  try {
    let m;
    /* ---------- Turniere lesen (öffentlich) ---------- */
    if (path === "/tournaments" && method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT t.*, (SELECT count(*) FROM players p WHERE p.tournament_id = t.id) AS player_count
           FROM tournaments t ORDER BY t.event_date IS NULL, t.event_date DESC, t.id DESC`
      ).all();
      const list = guestTid != null ? rows.results.filter((t) => t.id === guestTid) : rows.results;
      return securityHeaders(json(list.map((t) => ({ ...t, double_elim: !!t.double_elim }))));
    }
    if (path === "/ranking" && method === "GET") {
      const sport = new URL(request.url).searchParams.get("sport") === "football" ? "football" : "tabletennis";
      const data = await clubRanking(env, sport);
      return securityHeaders(json({ sport, ...data }, 200, { "cache-control": "public, max-age=30" }));
    }
    if ((m = path.match(/^\/tournaments\/(\d+)$/)) && method === "GET") {
      if (guestTid != null && intId(m[1]) !== guestTid) fail(403, "Mit dem Gastzugang siehst du nur dein Turnier.");
      const data = await loadTournament(env, intId(m[1]));
      return securityHeaders(json({ ...data, tournament: { ...data.tournament, double_elim: !!data.tournament.double_elim } }));
    }

    /* ---------- Turniere verwalten ---------- */
    if (path === "/tournaments" && method === "POST") {
      requirePerm("tournaments.manage");
      const f = tournamentFields(await readBody());
      const res = await env.DB.prepare(
        `INSERT INTO tournaments (name, event_date, location, format, best_of, group_count, advance_per_group, double_elim, sport, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?, 'draft', ?)`
      ).bind(f.name, f.event_date, f.location, f.format, f.best_of, f.group_count, f.advance_per_group, f.double_elim ? 1 : 0, f.sport, Date.now()).run();
      return securityHeaders(json({ id: res.meta.last_row_id }, 201));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)$/)) && method === "PATCH") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      const structural = ["sport", "format", "best_of", "group_count", "advance_per_group", "double_elim"].some(
        (k) => b[k] !== undefined && String(b[k]) !== String(t[k])
      );
      if (structural && t.status !== "draft") fail(409, "Sportart, Modus, Satzanzahl und Loserbracket lassen sich nur vor dem Start ändern.");
      const f = tournamentFields(b, { ...t, double_elim: !!t.double_elim });
      await env.DB.prepare(
        `UPDATE tournaments SET name=?, event_date=?, location=?, format=?, best_of=?, group_count=?, advance_per_group=?, double_elim=?, sport=? WHERE id=?`
      ).bind(f.name, f.event_date, f.location, f.format, f.best_of, f.group_count, f.advance_per_group, f.double_elim ? 1 : 0, f.sport, id).run();
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)$/)) && method === "DELETE") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const t = await env.DB.prepare("SELECT id FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      await deleteTournamentCascade(env, id);
      return securityHeaders(json({ ok: true }));
    }

    // Besucher- und Gastlink: Slug erzeugen (falls noch keiner existiert bzw. „renew“),
    // Gastzugang ein- oder ausschalten ({ days }: 0 = aus). Beim ersten Mal gilt er 3 Tage.
    if ((m = path.match(/^\/tournaments\/(\d+)\/visitor-link$/)) && method === "POST") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const t = await env.DB.prepare("SELECT visitor_slug, guest_until FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      let slug = b.renew ? null : t.visitor_slug;
      let until = t.guest_until;
      if (b.days !== undefined) {
        const days = Number(b.days);
        if (![0, 1, 3, 7].includes(days)) fail(400, "Gastzugang: 0, 1, 3 oder 7 Tage.");
        until = days ? Date.now() + days * 86_400_000 : 0;
      } else if (!t.visitor_slug) until = Date.now() + 3 * 86_400_000;
      if (!slug) {
        for (let attempt = 0; attempt < 10 && !slug; attempt++) {
          const candidate = randomSlug();
          const clash = await env.DB.prepare("SELECT 1 FROM tournaments WHERE visitor_slug = ?").bind(candidate).first();
          if (!clash) slug = candidate;
        }
        if (!slug) fail(503, "Konnte keinen freien Link erzeugen. Bitte nochmal versuchen.");
      }
      await env.DB.prepare("UPDATE tournaments SET visitor_slug = ?, guest_until = ? WHERE id = ?").bind(slug, until || 0, id).run();
      forgetGuestTournament(id);
      return securityHeaders(json({ ok: true, path: `/tischtennis/t/${slug}`, guest_until: until || 0 }));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)\/start$/)) && method === "POST") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      if (t.status !== "draft") fail(409, "Turnier läuft bereits.");
      const playersRaw = await env.DB.prepare("SELECT * FROM players WHERE tournament_id = ?").bind(id).all();
      const players = playersRaw.results;
      if (players.length < 2) fail(400, "Mindestens 2 Teilnehmer nötig.");
      const ordered = orderPlayers(players);

      if (t.format === "ko") {
        if (t.double_elim) {
          if (!L.isPow2(ordered.length) || ordered.length < 4)
            fail(400, `Loserbracket braucht eine Zweierpotenz an Teilnehmern (4, 8, 16, 32 …). Aktuell: ${ordered.length}. Teilnehmerzahl anpassen oder einfaches K.-o. wählen.`);
          await createDoubleKo(env, id, ordered);
        } else {
          await createKo(env, id, ordered);
        }
      } else if (t.format === "league") {
        await env.DB.prepare("UPDATE players SET group_no = 1 WHERE tournament_id = ?").bind(id).run();
        await createRoundRobin(env, id, 1, ordered);
      } else {
        const g = t.group_count;
        if (players.length < g * 2) fail(400, `Für ${g} Gruppen sind mindestens ${g * 2} Teilnehmer nötig.`);
        const minSize = Math.floor(players.length / g);
        if (t.advance_per_group > minSize) fail(400, `Pro Gruppe können höchstens ${minSize} weiterkommen (kleinste Gruppe hat ${minSize} Spieler).`);
        if (g * t.advance_per_group < 2) fail(400, "Für die KO-Phase müssen mindestens 2 Spieler weiterkommen.");
        const groups = L.snakeGroups(ordered, g);
        for (let i = 0; i < g; i++) {
          await env.DB.batch(groups[i].map((pid) => env.DB.prepare("UPDATE players SET group_no = ? WHERE id = ?").bind(i + 1, pid)));
          await createRoundRobin(env, id, i + 1, groups[i]);
        }
      }
      await env.DB.prepare("UPDATE tournaments SET status = 'running' WHERE id = ?").bind(id).run();
      await updateStatus(env, id);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)\/ko$/)) && method === "POST") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      if (t.format !== "group" || t.status !== "running") fail(409, "KO-Phase nur bei laufendem Gruppenturnier.");
      const data = await loadTournament(env, id);
      if (data.matches.some((x) => x.phase === "ko")) fail(409, "KO-Phase wurde schon erstellt.");
      const open = data.matches.filter((x) => x.phase === "group" && x.status === "pending").length;
      if (open) fail(409, `Es sind noch ${open} Gruppenspiele offen.`);
      const ranked = data.standings.map((g) => g.rows.slice(0, t.advance_per_group).map((r) => r.player_id));
      const totalQualified = ranked.reduce((n, g) => n + g.length, 0);
      const qualified = L.koSeedingFromGroups(ranked);
      if (t.double_elim) {
        if (!L.isPow2(totalQualified) || totalQualified < 4)
          fail(400, `Loserbracket braucht eine Zweierpotenz an Qualifikanten (4, 8, 16, 32 …). Aktuell: ${totalQualified}. Gruppen/Weiterkommende anpassen oder einfaches K.-o. wählen.`);
        await createDoubleKo(env, id, qualified);
      } else {
        await createKo(env, id, qualified);
      }
      await updateStatus(env, id);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)\/reset$/)) && method === "POST") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const t = await env.DB.prepare("SELECT id FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      await env.DB.prepare("UPDATE tournaments SET status = 'draft' WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM tips WHERE tournament_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM matches WHERE tournament_id = ?").bind(id).run();
      await env.DB.prepare("UPDATE players SET group_no = NULL WHERE tournament_id = ?").bind(id).run();
      return securityHeaders(json({ ok: true }));
    }

    /* ---------- Teilnehmer ---------- */
    if ((m = path.match(/^\/tournaments\/(\d+)\/players$/)) && method === "POST") {
      requirePerm("players.manage");
      const tid = intId(m[1]);
      const b = await readBody();
      const entries = typeof b.lines === "string"
        ? b.lines.split("\n").map((l) => l.split(";")).filter((p) => p[0].trim()).map((p) => ({ name: p[0], club: p[1] || "" }))
        : [{ name: b.name, club: b.club, seed: b.seed, members: b.members }];
      if (!entries.length) fail(400, "Keine Namen angegeben.");
      if (entries.length > 512) fail(400, "Maximal 512 Teilnehmer auf einmal.");
      await assertDraft(env, tid);
      for (const e of entries) {
        const name = str(e.name, 80);
        if (!name) fail(400, "Name fehlt.");
        await env.DB.prepare("INSERT INTO players (tournament_id, name, club, seed, members) VALUES (?,?,?,?,?)")
          .bind(tid, name, str(e.club, 80), seedVal(e.seed), membersVal(e.members)).run();
      }
      return securityHeaders(json({ ok: true, added: entries.length }, 201));
    }

    if ((m = path.match(/^\/players\/(\d+)$/)) && method === "PATCH") {
      requirePerm("players.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
      if (!p) fail(404, "Teilnehmer nicht gefunden.");
      // Den Kader eines Teams darf man auch während des Turniers noch ändern
      // (Nachmeldungen, Torschützen); alles andere nur vor dem Start.
      const onlyMembers = Object.keys(b).length > 0 && Object.keys(b).every((k) => k === "members");
      if (!onlyMembers) await assertDraft(env, p.tournament_id);
      const name = b.name !== undefined ? str(b.name, 80) : p.name;
      if (!name) fail(400, "Name fehlt.");
      await env.DB.prepare("UPDATE players SET name=?, club=?, seed=?, members=? WHERE id=?").bind(
        name,
        b.club !== undefined ? str(b.club, 80) : p.club,
        b.seed !== undefined ? seedVal(b.seed) : p.seed,
        b.members !== undefined ? membersVal(b.members) : p.members,
        id
      ).run();
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/players\/(\d+)$/)) && method === "DELETE") {
      requirePerm("players.manage");
      const id = intId(m[1]);
      const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
      if (!p) fail(404, "Teilnehmer nicht gefunden.");
      await assertDraft(env, p.tournament_id);
      await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)\/players\/shuffle-teams$/)) && method === "POST") {
      requirePerm("players.manage");
      const tid = intId(m[1]);
      const b = await readBody();
      const teamSize = Number(b.team_size);
      if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 8) fail(400, "Teamgröße muss 2–8 sein.");
      await assertDraft(env, tid);
      const playersRaw = await env.DB.prepare("SELECT * FROM players WHERE tournament_id = ?").bind(tid).all();
      const players = playersRaw.results;
      if (players.length < teamSize * 2) fail(400, `Für Teams aus ${teamSize} braucht es mindestens ${teamSize * 2} Teilnehmer (für 2 Teams).`);
      if (players.length % teamSize !== 0)
        fail(400, `${players.length} Teilnehmer passen nicht glatt auf Teams à ${teamSize}. Teilnehmerzahl anpassen (${Math.ceil(players.length / teamSize) * teamSize} oder ${Math.floor(players.length / teamSize) * teamSize}) oder andere Teamgröße wählen.`);
      const shuffled = shuffle(players.map((p) => p));
      const groups = [];
      for (let i = 0; i < shuffled.length; i += teamSize) groups.push(shuffled.slice(i, i + teamSize));
      await env.DB.prepare("DELETE FROM players WHERE tournament_id = ?").bind(tid).run();
      for (const g of groups) {
        const members = g.map((p) => ({ name: p.name, club: p.club || null }));
        const name = str(g.map((p) => p.name).join(" & "), 80) || "Team";
        const clubs = [...new Set(g.map((p) => p.club).filter(Boolean))];
        const club = str(clubs.join(" / "), 80);
        await env.DB.prepare("INSERT INTO players (tournament_id, name, club, members) VALUES (?,?,?,?)")
          .bind(tid, name, club, JSON.stringify(members)).run();
      }
      return securityHeaders(json({ ok: true, teams: groups.length }));
    }

    /* ---------- Ergebnisse ---------- */
    if ((m = path.match(/^\/matches\/(\d+)\/result$/)) && method === "POST") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const mm = await lockMatch(env, id);
      if (!mm.player1_id || !mm.player2_id) fail(409, "Die Paarung steht noch nicht fest.");
      const b = await readBody();
      let sets, extra = {}, winnerSide;
      if (mm.sport === "football") {
        const goals = Array.isArray(b.goals) ? b.goals.map(Number) : null;
        const pens = Array.isArray(b.penalties) ? b.penalties.map(Number) : null;
        const v = L.validateFootball(goals, pens, mm.phase === "ko");
        if (!v.ok) fail(400, v.error);
        const sc = L.normalizeScorers(b.scorers, goals);
        if (!sc.ok) fail(400, sc.error);
        sets = [goals];
        extra = { penalties: v.penalties, scorers: sc.scorers };
        winnerSide = v.winner;
      } else {
        sets = Array.isArray(b.sets) ? b.sets.map((s) => (Array.isArray(s) ? s.map(Number) : s)) : null;
        const v = L.validateSets(sets, mm.best_of);
        if (!v.ok) fail(400, v.error);
        winnerSide = v.winner;
      }
      const winner = winnerSide === 1 ? mm.player1_id : winnerSide === 2 ? mm.player2_id : null;
      const loser = winnerSide === 1 ? mm.player2_id : winnerSide === 2 ? mm.player1_id : null;
      await env.DB.prepare("UPDATE matches SET sets=?, extra=?, winner_id=?, status='done', live=NULL, updated_at=? WHERE id=?")
        .bind(JSON.stringify(sets), JSON.stringify(extra), winner, Date.now(), id).run();
      if (winner) {
        await placeWinner(env, mm, winner);
        await placeLoser(env, mm, loser);
        await syncGrandFinalReset(env, mm, winner);
      }
      await updateStatus(env, mm.tournament_id);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/matches\/(\d+)\/result$/)) && method === "DELETE") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const mm = await lockMatch(env, id);
      await env.DB.prepare("UPDATE matches SET sets='[]', extra='{}', winner_id=NULL, status='pending', live=NULL, updated_at=? WHERE id=?").bind(Date.now(), id).run();
      if (mm.status === "done") {
        await placeWinner(env, mm, null);
        await placeLoser(env, mm, null);
        if (mm.bracket === "gf" && mm.round === 1) await env.DB.prepare("DELETE FROM matches WHERE tournament_id = ? AND bracket = 'gf' AND round = 2").bind(mm.tournament_id).run();
      }
      await updateStatus(env, mm.tournament_id);
      return securityHeaders(json({ ok: true }));
    }

    /* ---------- Liveticker ---------- */
    if ((m = path.match(/^\/matches\/(\d+)\/live$/)) && method === "POST") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const mm = await env.DB.prepare("SELECT m.*, t.status AS t_status, t.best_of FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = ?").bind(id).first();
      if (!mm) fail(404, "Spiel nicht gefunden.");
      if (mm.t_status !== "running") fail(409, "Das Turnier läuft gerade nicht.");
      if (mm.status !== "pending" || !mm.player1_id || !mm.player2_id) fail(409, "Nur offene Spiele mit feststehender Paarung können live laufen.");
      const b = await readBody();
      const sets = Array.isArray(b.sets) && b.sets.length ? b.sets : [[0, 0]];
      if (sets.length > Math.max(1, mm.best_of)) fail(400, "Zu viele Sätze.");
      const clean = sets.map((x) => {
        if (!Array.isArray(x) || x.length !== 2) fail(400, "Ungültiger Spielstand.");
        return x.map((n) => {
          const v = Number(n);
          if (!Number.isInteger(v) || v < 0 || v > 99) fail(400, "Spielstand 0–99.");
          return v;
        });
      });
      const prev = mm.live ? JSON.parse(mm.live) : null;
      const live = { sets: clean, since: prev?.since || Date.now() };
      await env.DB.prepare("UPDATE matches SET live = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(live), Date.now(), id).run();
      return securityHeaders(json({ ok: true, live }));
    }
    if ((m = path.match(/^\/matches\/(\d+)\/live$/)) && method === "DELETE") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const res = await env.DB.prepare("UPDATE matches SET live = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), id).run();
      if (!res.meta.changes) fail(404, "Spiel nicht gefunden.");
      return securityHeaders(json({ ok: true }));
    }

    /* ---------- Tippspiel (öffentlich, ohne Anmeldung) ---------- */
    if ((m = path.match(/^\/matches\/(\d+)\/tip$/)) && method === "POST") {
      const id = intId(m[1]);
      const b = await readBody();
      const device = String(b.device || "");
      if (!DEVICE_RE.test(device)) fail(400, "Ungültige Geräte-Kennung.");
      const name = str(b.name, 24);
      if (!name) fail(400, "Bitte einen Namen für die Tipp-Tabelle angeben.");
      const pick = Number(b.pick);
      const mm = await env.DB.prepare("SELECT m.*, t.status AS t_status, t.sport FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = ?").bind(id).first();
      if (!mm || (guestTid != null && mm.tournament_id !== guestTid)) fail(404, "Spiel nicht gefunden.");
      const drawOk = mm.sport === "football" && mm.phase === "group";
      if (!(pick === 1 || pick === 2 || (pick === 0 && drawOk))) fail(400, "Ungültiger Tipp.");
      if (mm.t_status !== "running" || mm.status !== "pending" || !mm.player1_id || !mm.player2_id) fail(409, "Auf dieses Spiel kann man nicht (mehr) tippen.");
      if (mm.live) fail(409, "Das Spiel läuft schon – Tipps sind geschlossen.");
      await env.DB.prepare(
        `INSERT INTO tips (match_id, tournament_id, device, name, pick, created_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(match_id, device) DO UPDATE SET pick = excluded.pick, name = excluded.name, created_at = excluded.created_at`
      ).bind(id, mm.tournament_id, device, name, pick, Date.now()).run();
      return securityHeaders(json({ ok: true }));
    }
    if ((m = path.match(/^\/tournaments\/(\d+)\/tips$/)) && method === "GET") {
      const id = intId(m[1]);
      if (guestTid != null && id !== guestTid) fail(403, "Mit dem Gastzugang siehst du nur dein Turnier.");
      const device = new URL(request.url).searchParams.get("device") || "";
      if (!DEVICE_RE.test(device)) return securityHeaders(json({ picks: {} }));
      const rows = (await env.DB.prepare("SELECT match_id, pick FROM tips WHERE tournament_id = ? AND device = ?").bind(id, device).all()).results;
      return securityHeaders(json({ picks: Object.fromEntries(rows.map((r) => [r.match_id, r.pick])) }));
    }

    if ((m = path.match(/^\/matches\/(\d+)$/)) && method === "PATCH") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const b = await readBody();
      const tn = b.table_no === "" || b.table_no == null ? null : Number(b.table_no);
      if (tn !== null && (!Number.isInteger(tn) || tn < 1 || tn > 99)) fail(400, "Tischnummer 1–99.");
      const res = await env.DB.prepare("UPDATE matches SET table_no = ?, updated_at = ? WHERE id = ?").bind(tn, Date.now(), id).run();
      if (!res.meta.changes) fail(404, "Spiel nicht gefunden.");
      return securityHeaders(json({ ok: true }));
    }

    return securityHeaders(json({ error: "Unbekannter Endpunkt." }, 404));
  } catch (err) {
    if (err instanceof HttpError) return securityHeaders(json({ error: err.message }, err.status));
    console.error(err);
    return securityHeaders(json({ error: "Interner Fehler." }, 500));
  }
}
