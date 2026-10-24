// Gemeinsame Konten für das ganze Vereinsheim (Quiz, Tischtennis, …).
//
// - Jeder kann sich selbst registrieren. Neue Konten sind aber "wartend"
//   (pending) und können sich erst anmelden, wenn jemand mit dem Recht
//   "users.manage" sie freigeschaltet hat.
// - Rechte werden pro Person vergeben (siehe PERMISSIONS).
// - Ein Login gilt für die ganze Seite (Cookie "sid" mit Path=/).
//
// API (unter /api/konto, aus Kompatibilitätsgründen zusätzlich unter
// /api/tischtennis/auth/* und /api/tischtennis/users*):
//   POST /auth/register   { username, display_name, password }
//   POST /auth/login      { username, password }
//   POST /auth/logout
//   GET  /auth/me
//   POST /auth/password   { current, next }
//   GET  /users                         (users.manage)
//   POST /users                         (users.manage) – direkt aktives Konto anlegen
//   POST /users/:id/approve {permissions} (users.manage)
//   PATCH /users/:id                    (users.manage)
//   DELETE /users/:id                   (users.manage) – auch zum Ablehnen von Anfragen

import bcrypt from "bcryptjs";
import {
  fail,
  intId,
  str,
  json,
  securityHeaders,
  readCookie,
  rejectNonJsonWrites,
  bodyReader,
  handleErrors,
} from "./http.js";

export const PERMISSIONS = [
  { key: "users.manage", label: "Konten freischalten & Rechte vergeben", area: "Konten" },
  { key: "quiz.create", label: "Eigene Quizze erstellen & bearbeiten", area: "Quiz" },
  { key: "quiz.manage", label: "Alle Quizze bearbeiten & löschen", area: "Quiz" },
  { key: "tournaments.manage", label: "Turniere anlegen, starten, zurücksetzen", area: "Turniere" },
  { key: "players.manage", label: "Teilnehmer verwalten", area: "Turniere" },
  { key: "results.enter", label: "Ergebnisse und Tische eintragen", area: "Turniere" },
];
export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_permissions (
    user_id    INTEGER NOT NULL REFERENCES users(id),
    permission TEXT NOT NULL,
    PRIMARY KEY (user_id, permission)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  )`,
];

let ready = false;

// Legt die Konto-Tabellen an, migriert ältere Datenbanken und erzeugt beim
// allerersten Start ein Admin-Konto. Wird von jedem Bereich aufgerufen, der
// Konten braucht – läuft pro Worker-Instanz nur einmal wirklich.
export async function ensureAccounts(env) {
  if (ready) return;
  for (const stmt of SCHEMA_STATEMENTS) await env.DB.prepare(stmt).run();

  // Migration: Spalte "pending" für Konten, die auf Freischaltung warten.
  const cols = await env.DB.prepare("PRAGMA table_info(users)").all();
  if (!cols.results.some((c) => c.name === "pending")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN pending INTEGER NOT NULL DEFAULT 0").run();
    // Wer bisher Benutzer verwalten durfte, bekommt die neuen Quiz-Rechte dazu.
    const admins = await env.DB.prepare(
      "SELECT DISTINCT user_id FROM user_permissions WHERE permission = 'users.manage'"
    ).all();
    const stmts = [];
    for (const a of admins.results) {
      for (const p of ["quiz.create", "quiz.manage"]) {
        stmts.push(
          env.DB.prepare("INSERT OR IGNORE INTO user_permissions (user_id, permission) VALUES (?,?)").bind(a.user_id, p)
        );
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
  }

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();

  const { n } = await env.DB.prepare("SELECT count(*) AS n FROM users").first();
  if (n === 0) {
    const username = env.ADMIN_USERNAME || "admin";
    const password = env.ADMIN_PASSWORD || randomPassword();
    const hash = await bcrypt.hash(password, 10);
    const { meta } = await env.DB.prepare(
      "INSERT INTO users (username, display_name, password_hash, active, pending, created_at) VALUES (?,?,?,1,0,?)"
    )
      .bind(username, "Administrator", hash, Date.now())
      .run();
    await env.DB.batch(
      ALL_PERMISSIONS.map((p) =>
        env.DB.prepare("INSERT INTO user_permissions (user_id, permission) VALUES (?,?)").bind(meta.last_row_id, p)
      )
    );
    if (!env.ADMIN_PASSWORD) {
      console.log(`Erster Admin angelegt: ${username} / ${password}  (Passwort nach dem ersten Login ändern)`);
    }
  }
  ready = true;
}

/* ---------- Zufall ---------- */
function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
export function randomToken() {
  return [...randomBytes(32)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomPassword() {
  let bin = "";
  for (const b of randomBytes(9)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sessionCookieHeader(token, maxAgeSec, secure) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

/** Angemeldeten Benutzer aus dem Cookie laden (oder null). */
export async function getUser(request, env) {
  await ensureAccounts(env);
  const token = readCookie(request, "sid");
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.active = 1 AND u.pending = 0`
  )
    .bind(token, Date.now())
    .first();
  if (!row) return null;
  const perms = await env.DB.prepare("SELECT permission FROM user_permissions WHERE user_id = ?").bind(row.id).all();
  return { ...row, token, permissions: perms.results.map((r) => r.permission) };
}

export const hasPerm = (user, perm) => !!user && user.permissions.includes(perm);

/* ---------- Drosselung (best-effort pro Worker-Instanz) ---------- */
const loginFails = new Map();
const registrations = new Map();
const MAX_PENDING = 50;

const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
const USERNAME_HINT = "Benutzername: 3–50 Zeichen, nur a–z, 0–9, Punkt, Bindestrich, Unterstrich.";

async function setPermissions(env, id, permissions) {
  const perms = [...new Set((Array.isArray(permissions) ? permissions : []).filter((x) => ALL_PERMISSIONS.includes(x)))];
  await env.DB.prepare("DELETE FROM user_permissions WHERE user_id = ?").bind(id).run();
  if (perms.length) {
    await env.DB.batch(
      perms.map((p) => env.DB.prepare("INSERT INTO user_permissions (user_id, permission) VALUES (?,?)").bind(id, p))
    );
  }
}

async function assertAdminRemains(env) {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM users u JOIN user_permissions p ON p.user_id = u.id
     WHERE u.active = 1 AND u.pending = 0 AND p.permission = 'users.manage'`
  ).first();
  if (row.n === 0) fail(400, "Mindestens ein aktiver Benutzer muss Konten verwalten dürfen.");
}

export async function deleteUserCascade(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM user_permissions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
}

/**
 * Prüft, ob dieser Pfad ein Konto-Pfad ist (für die Weiterleitung aus dem
 * Tischtennis-Router, damit dessen alte Oberfläche weiter funktioniert).
 */
export function isKontoPath(path) {
  return path.startsWith("/auth/") || path === "/users" || path.startsWith("/users/");
}

// path: Teil nach "/api/konto" (bzw. "/api/tischtennis").
export async function handleKontoApi(request, env, path) {
  const rejected = rejectNonJsonWrites(request);
  if (rejected) return rejected;

  return handleErrors(async () => {
    await ensureAccounts(env);
    const method = request.method;
    const readBody = bodyReader(request);
    const secure = new URL(request.url).protocol === "https:";
    const SESSION_MS = (Number(env.SESSION_HOURS) || 12) * 3600 * 1000;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const user = await getUser(request, env);
    const requireLogin = () => {
      if (!user) fail(401, "Bitte anmelden.");
    };
    const requirePerm = (perm) => {
      requireLogin();
      if (!user.permissions.includes(perm)) fail(403, "Dafür fehlt dir das Recht.");
    };
    let m;

    /* ---------- Registrieren ---------- */
    if (path === "/auth/register" && method === "POST") {
      const r = registrations.get(ip);
      const now = Date.now();
      if (r && r.count >= 5 && r.until > now) fail(429, "Zu viele Registrierungen von hier. Bitte später nochmal versuchen.");
      const b = await readBody();
      const username = str(b.username, 50).toLowerCase();
      const password = String(b.password || "");
      const displayName = str(b.display_name, 80) || username;
      if (!USERNAME_RE.test(username)) fail(400, USERNAME_HINT);
      if (password.length < 8) fail(400, "Passwort braucht mindestens 8 Zeichen.");
      if (password.length > 200) fail(400, "Passwort ist zu lang.");
      const exists = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
      if (exists) fail(409, "Benutzername ist schon vergeben.");
      const { n } = await env.DB.prepare("SELECT count(*) AS n FROM users WHERE pending = 1").first();
      if (n >= MAX_PENDING) fail(429, "Gerade warten zu viele Anfragen auf Freischaltung. Bitte später nochmal versuchen.");
      await env.DB.prepare(
        "INSERT INTO users (username, display_name, password_hash, active, pending, created_at) VALUES (?,?,?,0,1,?)"
      )
        .bind(username, displayName, await bcrypt.hash(password, 10), now)
        .run();
      const cur = r && r.until > now ? r : { count: 0 };
      registrations.set(ip, { count: cur.count + 1, until: now + 60 * 60e3 });
      return securityHeaders(json({ ok: true, pending: true }, 201));
    }

    /* ---------- Anmelden / Abmelden ---------- */
    if (path === "/auth/login" && method === "POST") {
      const f = loginFails.get(ip);
      if (f && f.count >= 10 && f.until > Date.now()) fail(429, "Zu viele Fehlversuche. Bitte 15 Minuten warten.");
      const b = await readBody();
      const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?")
        .bind(str(b.username, 50).toLowerCase())
        .first();
      const ok = row && (row.active || row.pending) && (await bcrypt.compare(String(b.password || ""), row.password_hash));
      if (!ok) {
        const cur = f && f.until > Date.now() ? f : { count: 0 };
        loginFails.set(ip, { count: cur.count + 1, until: Date.now() + 15 * 60e3 });
        fail(401, "Benutzername oder Passwort falsch.");
      }
      loginFails.delete(ip);
      if (row.pending) fail(403, "Dein Konto wartet noch auf Freischaltung durch den Admin.");
      const tok = randomToken();
      await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)")
        .bind(tok, row.id, Date.now() + SESSION_MS)
        .run();
      return securityHeaders(json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(tok, SESSION_MS / 1000, secure) }));
    }

    if (path === "/auth/logout" && method === "POST") {
      if (user) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(user.token).run();
      return securityHeaders(json({ ok: true }, 200, { "set-cookie": sessionCookieHeader("", 0, secure) }));
    }

    if (path === "/auth/me" && method === "GET") {
      if (!user) return securityHeaders(json({ user: null, permissionInfo: PERMISSIONS }));
      const { token: _t, ...u } = user;
      let pendingCount = 0;
      if (hasPerm(user, "users.manage")) {
        pendingCount = (await env.DB.prepare("SELECT count(*) AS n FROM users WHERE pending = 1").first()).n;
      }
      return securityHeaders(json({ user: u, allPermissions: ALL_PERMISSIONS, permissionInfo: PERMISSIONS, pendingCount }));
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
      const usersRaw = await env.DB.prepare(
        "SELECT id, username, display_name, active, pending, created_at FROM users ORDER BY pending DESC, username"
      ).all();
      const permsRaw = await env.DB.prepare("SELECT user_id, permission FROM user_permissions").all();
      const byUser = new Map();
      for (const p of permsRaw.results) {
        if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
        byUser.get(p.user_id).push(p.permission);
      }
      return securityHeaders(
        json(
          usersRaw.results.map((u) => ({
            ...u,
            active: !!u.active,
            pending: !!u.pending,
            permissions: byUser.get(u.id) || [],
          }))
        )
      );
    }

    if (path === "/users" && method === "POST") {
      requirePerm("users.manage");
      const b = await readBody();
      const username = str(b.username, 50).toLowerCase();
      const password = String(b.password || "");
      if (!USERNAME_RE.test(username)) fail(400, USERNAME_HINT);
      if (password.length < 8) fail(400, "Passwort braucht mindestens 8 Zeichen.");
      const exists = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
      if (exists) fail(409, "Benutzername ist schon vergeben.");
      const res = await env.DB.prepare(
        "INSERT INTO users (username, display_name, password_hash, active, pending, created_at) VALUES (?,?,?,1,0,?)"
      )
        .bind(username, str(b.display_name, 80) || username, await bcrypt.hash(password, 10), Date.now())
        .run();
      const id = res.meta.last_row_id;
      await setPermissions(env, id, b.permissions);
      return securityHeaders(json({ id }, 201));
    }

    if ((m = path.match(/^\/users\/(\d+)\/approve$/)) && method === "POST") {
      requirePerm("users.manage");
      const id = intId(m[1]);
      const b = await readBody();
      const u = await env.DB.prepare("SELECT id, pending FROM users WHERE id = ?").bind(id).first();
      if (!u) fail(404, "Benutzer nicht gefunden.");
      if (!u.pending) fail(409, "Dieses Konto ist schon freigeschaltet.");
      await env.DB.prepare("UPDATE users SET active = 1, pending = 0 WHERE id = ?").bind(id).run();
      await setPermissions(env, id, b.permissions);
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/users\/(\d+)$/)) && method === "PATCH") {
      requirePerm("users.manage");
      const id = intId(m[1]);
      const b = await readBody();
      if (id === user.id && b.active === false) fail(400, "Du kannst dein eigenes Konto nicht deaktivieren.");
      const u = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
      if (!u) fail(404, "Benutzer nicht gefunden.");
      if (b.display_name !== undefined) {
        await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
          .bind(str(b.display_name, 80) || "Ohne Namen", id)
          .run();
      }
      if (typeof b.active === "boolean") {
        await env.DB.prepare("UPDATE users SET active = ?, pending = 0 WHERE id = ?").bind(b.active ? 1 : 0, id).run();
        if (!b.active) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      }
      if (b.password !== undefined && b.password !== "") {
        if (String(b.password).length < 8) fail(400, "Passwort braucht mindestens 8 Zeichen.");
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
          .bind(await bcrypt.hash(String(b.password), 10), id)
          .run();
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      }
      if (b.permissions !== undefined) await setPermissions(env, id, b.permissions);
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

    fail(404, "Unbekannter Endpunkt.");
  });
}
