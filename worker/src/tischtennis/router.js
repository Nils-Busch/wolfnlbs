// Workers-Router für das Tischtennis-Turnier (ersetzt Express+Postgres durch
// den Fetch-Handler + D1). Routen und Verhalten entsprechen 1:1 dem
// ursprünglichen server.js – siehe Kommentare bei den paar Stellen, die sich
// zwangsläufig unterscheiden (keine FOR-UPDATE-Sperren, kein array_agg, …).

import bcrypt from "bcryptjs";
import * as L from "./logic.js";
import { init, ALL_PERMISSIONS, parseMatch, parsePlayer, deleteTournamentCascade, deleteUserCascade } from "./db.js";
import { randomToken, randomSlug, shuffle } from "./crypto.js";

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };
const intId = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) fail(400, "Ungültige ID."); return n; };
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const m = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function sessionCookieHeader(token, maxAgeSec, secure) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

/* ---------- Anmeldeversuche drosseln ----------
   Best-effort pro Worker-Isolate (kein globaler Zähler über alle Regionen
   hinweg) – für ein Vereinsturnier reicht das als Bremse gegen Durchprobieren. */
const loginFails = new Map();

async function loadUser(env, token) {
  if (!token) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`
  ).bind(token, now).first();
  if (!row) return null;
  const perms = await env.DB.prepare("SELECT permission FROM user_permissions WHERE user_id = ?").bind(row.id).all();
  return { ...row, token, permissions: perms.results.map((r) => r.permission) };
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
  const standings = groups.map((g) => ({
    group_no: g,
    rows: L.standings(
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
  return { tournament: t, players, matches, standings, koRoundNames: roundNames };
}

function tournamentFields(b, t = {}) {
  const out = {
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
}

async function assertDraft(env, tid) {
  const t = await env.DB.prepare("SELECT status FROM tournaments WHERE id = ?").bind(tid).first();
  if (!t) fail(404, "Turnier nicht gefunden.");
  if (t.status !== "draft") fail(409, "Teilnehmer lassen sich nur vor dem Start ändern. Turnier ggf. zurücksetzen.");
}
const seedVal = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 999) fail(400, "Setzplatz muss eine Zahl von 1–999 sein.");
  return n;
};

async function lockMatch(env, id) {
  const m = await env.DB.prepare(
    `SELECT m.*, t.best_of, t.status AS t_status FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = ?`
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
export async function handleTischtennisApi(request, env, path) {
  await init(env);
  const method = request.method;
  const SESSION_MS = (Number(env.SESSION_HOURS) || 12) * 3600 * 1000;

  // CSRF-Grundschutz: schreibende Requests nur als JSON.
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json") && !(method === "DELETE" && !request.headers.get("content-length"))) {
      return securityHeaders(json({ error: "Content-Type application/json erforderlich." }, 415));
    }
  }

  const token = readCookie(request, "sid");
  const user = await loadUser(env, token);
  const can = (perm) => !!user && user.permissions.includes(perm);
  const requireLogin = () => { if (!user) fail(401, "Bitte anmelden."); };
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
    const secure = new URL(request.url).protocol === "https:";

    /* ---------- Auth ---------- */
    if (path === "/auth/login" && method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const f = loginFails.get(ip);
      if (f && f.count >= 10 && f.until > Date.now()) fail(429, "Zu viele Fehlversuche. Bitte 15 Minuten warten.");
      const b = await readBody();
      const row = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND active = 1").bind(str(b.username)).first();
      const ok = row && (await bcrypt.compare(String(b.password || ""), row.password_hash));
      if (!ok) {
        const cur = f && f.until > Date.now() ? f : { count: 0 };
        loginFails.set(ip, { count: cur.count + 1, until: Date.now() + 15 * 60e3 });
        fail(401, "Benutzername oder Passwort falsch.");
      }
      loginFails.delete(ip);
      const tok = randomToken();
      await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)")
        .bind(tok, row.id, Date.now() + SESSION_MS).run();
      return securityHeaders(json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(tok, SESSION_MS / 1000, secure) }));
    }

    if (path === "/auth/logout" && method === "POST") {
      if (user) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(user.token).run();
      return securityHeaders(json({ ok: true }, 200, { "set-cookie": sessionCookieHeader("", 0, secure) }));
    }

    if (path === "/auth/me" && method === "GET") {
      if (!user) return securityHeaders(json({ user: null }));
      const { token: _t, ...u } = user;
      return securityHeaders(json({ user: u, allPermissions: ALL_PERMISSIONS }));
    }

    if (path === "/auth/password" && method === "POST") {
      requireLogin();
      const b = await readBody();
      const next = String(b.next || "");
      if (next.length < 8) fail(400, "Neues Passwort braucht mindestens 8 Zeichen.");
      const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
      if (!(await bcrypt.compare(String(b.current || ""), row.password_hash))) fail(400, "Aktuelles Passwort ist falsch.");
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await bcrypt.hash(next, 10), user.id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?").bind(user.id, user.token).run();
      return securityHeaders(json({ ok: true }));
    }

    /* ---------- Benutzerverwaltung ---------- */
    if (path === "/users" && method === "GET") {
      requirePerm("users.manage");
      const usersRaw = await env.DB.prepare("SELECT id, username, display_name, active, created_at FROM users ORDER BY username").all();
      const permsRaw = await env.DB.prepare("SELECT user_id, permission FROM user_permissions ORDER BY permission").all();
      const byUser = new Map();
      for (const p of permsRaw.results) {
        if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
        byUser.get(p.user_id).push(p.permission);
      }
      return securityHeaders(json(usersRaw.results.map((u) => ({ ...u, active: !!u.active, permissions: byUser.get(u.id) || [] }))));
    }

    async function assertAdminRemains(env) {
      const row = await env.DB.prepare(
        `SELECT count(*) AS n FROM users u JOIN user_permissions p ON p.user_id = u.id WHERE u.active = 1 AND p.permission = 'users.manage'`
      ).first();
      if (row.n === 0) fail(400, "Mindestens ein aktiver Benutzer muss Benutzer verwalten dürfen.");
    }
    const cleanPerms = (p) => [...new Set((Array.isArray(p) ? p : []).filter((x) => ALL_PERMISSIONS.includes(x)))];

    if (path === "/users" && method === "POST") {
      requirePerm("users.manage");
      const b = await readBody();
      const username = str(b.username, 50).toLowerCase();
      const password = String(b.password || "");
      if (!/^[a-z0-9._-]{3,50}$/.test(username)) fail(400, "Benutzername: 3–50 Zeichen, nur a–z, 0–9, Punkt, Bindestrich, Unterstrich.");
      if (password.length < 8) fail(400, "Passwort braucht mindestens 8 Zeichen.");
      const exists = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
      if (exists) fail(409, "Benutzername ist schon vergeben.");
      const hash = await bcrypt.hash(password, 10);
      const res = await env.DB.prepare("INSERT INTO users (username, display_name, password_hash, active, created_at) VALUES (?,?,?,1,?)")
        .bind(username, str(b.display_name, 80) || username, hash, Date.now()).run();
      const id = res.meta.last_row_id;
      const perms = cleanPerms(b.permissions);
      if (perms.length) await env.DB.batch(perms.map((p) => env.DB.prepare("INSERT INTO user_permissions (user_id, permission) VALUES (?,?)").bind(id, p)));
      return securityHeaders(json({ id }, 201));
    }

    let m;
    if ((m = path.match(/^\/users\/(\d+)$/)) && method === "PATCH") {
      requirePerm("users.manage");
      const id = intId(m[1]);
      const b = await readBody();
      if (id === user.id && b.active === false) fail(400, "Du kannst dein eigenes Konto nicht deaktivieren.");
      const u = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
      if (!u) fail(404, "Benutzer nicht gefunden.");
      if (b.display_name !== undefined) await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(str(b.display_name, 80) || "Ohne Namen", id).run();
      if (typeof b.active === "boolean") {
        await env.DB.prepare("UPDATE users SET active = ? WHERE id = ?").bind(b.active ? 1 : 0, id).run();
        if (!b.active) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      }
      if (b.password !== undefined && b.password !== "") {
        if (String(b.password).length < 8) fail(400, "Passwort braucht mindestens 8 Zeichen.");
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await bcrypt.hash(String(b.password), 10), id).run();
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      }
      if (b.permissions !== undefined) {
        await env.DB.prepare("DELETE FROM user_permissions WHERE user_id = ?").bind(id).run();
        const perms = cleanPerms(b.permissions);
        if (perms.length) await env.DB.batch(perms.map((p) => env.DB.prepare("INSERT INTO user_permissions (user_id, permission) VALUES (?,?)").bind(id, p)));
      }
      await assertAdminRemains(env);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/users\/(\d+)$/)) && method === "DELETE") {
      requirePerm("users.manage");
      const id = intId(m[1]);
      if (id === user.id) fail(400, "Du kannst dein eigenes Konto nicht löschen.");
      await deleteUserCascade(env, id);
      await assertAdminRemains(env);
      return securityHeaders(json({ ok: true }));
    }

    /* ---------- Turniere lesen (öffentlich) ---------- */
    if (path === "/tournaments" && method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT t.*, (SELECT count(*) FROM players p WHERE p.tournament_id = t.id) AS player_count
           FROM tournaments t ORDER BY t.event_date IS NULL, t.event_date DESC, t.id DESC`
      ).all();
      return securityHeaders(json(rows.results.map((t) => ({ ...t, double_elim: !!t.double_elim }))));
    }
    if ((m = path.match(/^\/tournaments\/(\d+)$/)) && method === "GET") {
      const data = await loadTournament(env, intId(m[1]));
      return securityHeaders(json({ ...data, tournament: { ...data.tournament, double_elim: !!data.tournament.double_elim } }));
    }

    /* ---------- Turniere verwalten ---------- */
    if (path === "/tournaments" && method === "POST") {
      requirePerm("tournaments.manage");
      const f = tournamentFields(await readBody());
      const res = await env.DB.prepare(
        `INSERT INTO tournaments (name, event_date, location, format, best_of, group_count, advance_per_group, double_elim, status, created_at)
         VALUES (?,?,?,?,?,?,?,?, 'draft', ?)`
      ).bind(f.name, f.event_date, f.location, f.format, f.best_of, f.group_count, f.advance_per_group, f.double_elim ? 1 : 0, Date.now()).run();
      return securityHeaders(json({ id: res.meta.last_row_id }, 201));
    }

    if ((m = path.match(/^\/tournaments\/(\d+)$/)) && method === "PATCH") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const t = await env.DB.prepare("SELECT * FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      const structural = ["format", "best_of", "group_count", "advance_per_group", "double_elim"].some(
        (k) => b[k] !== undefined && String(b[k]) !== String(t[k])
      );
      if (structural && t.status !== "draft") fail(409, "Modus, Satzanzahl und Loserbracket lassen sich nur vor dem Start ändern.");
      const f = tournamentFields(b, { ...t, double_elim: !!t.double_elim });
      await env.DB.prepare(
        `UPDATE tournaments SET name=?, event_date=?, location=?, format=?, best_of=?, group_count=?, advance_per_group=?, double_elim=? WHERE id=?`
      ).bind(f.name, f.event_date, f.location, f.format, f.best_of, f.group_count, f.advance_per_group, f.double_elim ? 1 : 0, id).run();
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

    // Besucher-Link: zufälligen Slug erzeugen (falls noch keiner existiert) und zurückgeben.
    if ((m = path.match(/^\/tournaments\/(\d+)\/visitor-link$/)) && method === "POST") {
      requirePerm("tournaments.manage");
      const id = intId(m[1]);
      const t = await env.DB.prepare("SELECT visitor_slug FROM tournaments WHERE id = ?").bind(id).first();
      if (!t) fail(404, "Turnier nicht gefunden.");
      let slug = t.visitor_slug;
      if (!slug) {
        for (let attempt = 0; attempt < 10 && !slug; attempt++) {
          const candidate = randomSlug();
          const clash = await env.DB.prepare("SELECT 1 FROM tournaments WHERE visitor_slug = ?").bind(candidate).first();
          if (!clash) slug = candidate;
        }
        if (!slug) fail(503, "Konnte keinen freien Link erzeugen. Bitte nochmal versuchen.");
        await env.DB.prepare("UPDATE tournaments SET visitor_slug = ? WHERE id = ?").bind(slug, id).run();
      }
      return securityHeaders(json({ ok: true, path: `/tischtennis/t/${slug}` }));
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
        : [{ name: b.name, club: b.club, seed: b.seed }];
      if (!entries.length) fail(400, "Keine Namen angegeben.");
      if (entries.length > 512) fail(400, "Maximal 512 Teilnehmer auf einmal.");
      await assertDraft(env, tid);
      for (const e of entries) {
        const name = str(e.name, 80);
        if (!name) fail(400, "Name fehlt.");
        await env.DB.prepare("INSERT INTO players (tournament_id, name, club, seed) VALUES (?,?,?,?)")
          .bind(tid, name, str(e.club, 80), seedVal(e.seed)).run();
      }
      return securityHeaders(json({ ok: true, added: entries.length }, 201));
    }

    if ((m = path.match(/^\/players\/(\d+)$/)) && method === "PATCH") {
      requirePerm("players.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
      if (!p) fail(404, "Teilnehmer nicht gefunden.");
      await assertDraft(env, p.tournament_id);
      const name = b.name !== undefined ? str(b.name, 80) : p.name;
      if (!name) fail(400, "Name fehlt.");
      await env.DB.prepare("UPDATE players SET name=?, club=?, seed=? WHERE id=?").bind(
        name,
        b.club !== undefined ? str(b.club, 80) : p.club,
        b.seed !== undefined ? seedVal(b.seed) : p.seed,
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
      const sets = Array.isArray(b.sets) ? b.sets.map((s) => (Array.isArray(s) ? s.map(Number) : s)) : null;
      const v = L.validateSets(sets, mm.best_of);
      if (!v.ok) fail(400, v.error);
      const winner = v.winner === 1 ? mm.player1_id : mm.player2_id;
      const loser = v.winner === 1 ? mm.player2_id : mm.player1_id;
      await env.DB.prepare("UPDATE matches SET sets=?, winner_id=?, status='done', updated_at=? WHERE id=?")
        .bind(JSON.stringify(sets), winner, Date.now(), id).run();
      await placeWinner(env, mm, winner);
      await placeLoser(env, mm, loser);
      await syncGrandFinalReset(env, mm, winner);
      await updateStatus(env, mm.tournament_id);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/matches\/(\d+)\/result$/)) && method === "DELETE") {
      requirePerm("results.enter");
      const id = intId(m[1]);
      const mm = await lockMatch(env, id);
      await env.DB.prepare("UPDATE matches SET sets='[]', winner_id=NULL, status='pending', updated_at=? WHERE id=?").bind(Date.now(), id).run();
      if (mm.status === "done") {
        await placeWinner(env, mm, null);
        await placeLoser(env, mm, null);
        if (mm.bracket === "gf" && mm.round === 1) await env.DB.prepare("DELETE FROM matches WHERE tournament_id = ? AND bracket = 'gf' AND round = 2").bind(mm.tournament_id).run();
      }
      await updateStatus(env, mm.tournament_id);
      return securityHeaders(json({ ok: true }));
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

/** Kurzer Besucher-Link (/tischtennis/t/<slug>) -> Redirect zur Besucheransicht. */
export async function resolveVisitorLink(env, slug) {
  await init(env);
  const t = await env.DB.prepare("SELECT id FROM tournaments WHERE visitor_slug = ?").bind(slug).first();
  if (!t) return new Response("Dieser Link ist nicht (mehr) gültig.", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: `/tischtennis/#t=${t.id}` } });
}
