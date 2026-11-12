// Geschlossene Gesellschaft: Das Vereinsheim ist nur für einen festen Kreis
// (Freunde und Familie) erreichbar. Hereinkommen geht auf drei Wegen:
//   1. gemeinsamer Zugangscode (Admin legt ihn fest, Ändern sperrt alte Geräte aus)
//   2. persönlicher Einladungslink /zugang/<token> (einzeln löschbar)
//   3. Anmelden mit einem freigeschalteten Konto
// Ohne Zugang liefert der Worker für jede Adresse nur die Tor-Seite aus.
//
// Zusätzlich gibt es Turnier-Gastlinks (/tischtennis/t/<kennung>): Sie öffnen
// für eine begrenzte Zeit nur Spielplan, Liveansicht und Tippspiel genau eines
// Turniers – praktisch für Zuschauer in der Halle (QR-Code am Eingang).
//
// API (unter /api/zugang):
//   POST   /code                 { code }            – ohne Zugang erreichbar
//   GET    /admin                                    (users.manage)
//   PUT    /admin/code           { code }  ("" = aus) (users.manage)
//   POST   /admin/invites        { label, days }     (users.manage)
//   DELETE /admin/invites/:id                        (users.manage)

import { ensureAccounts, getUser, hasPerm } from "../konto/auth.js";
import { fail, intId, str, json, securityHeaders, readCookie, rejectNonJsonWrites, bodyReader, handleErrors } from "../konto/http.js";
import { COOKIE, GUEST_COOKIE, RENEW_AFTER_SEC, signToken, verifyToken, cookieHeader, normalizeCode, isValidForState, isValidGuest, guestAllows, isPublicPath } from "./token.js";
import { gatePage } from "./page.js";
import { init as initTurniere } from "../tischtennis/db.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS access_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS access_invites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT UNIQUE NOT NULL,
    label      TEXT NOT NULL,
    created_by INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    uses       INTEGER NOT NULL DEFAULT 0,
    last_used  INTEGER
  )`,
];
const CACHE_MS = 60_000;
let tablesReady = false;
let cache = null; // { at, secret, code, codeVersion, invites: Map, users: Set }

function randomHex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function ensureTables(env) {
  if (tablesReady) return;
  await ensureAccounts(env);
  for (const s of SCHEMA) await env.DB.prepare(s).run();
  await env.DB.prepare("INSERT OR IGNORE INTO access_settings (k, v) VALUES ('secret', ?)").bind(randomHex(32)).run();
  await env.DB.prepare("INSERT OR IGNORE INTO access_settings (k, v) VALUES ('code_version', '1')").run();
  tablesReady = true;
}

/** Aktueller Stand (höchstens 60 s alt pro Worker-Instanz). */
async function loadState(env, force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  await ensureTables(env);
  const [settings, invites, users] = await env.DB.batch([
    env.DB.prepare("SELECT k, v FROM access_settings"),
    env.DB.prepare("SELECT id, expires_at FROM access_invites"),
    env.DB.prepare("SELECT id FROM users WHERE active = 1 AND pending = 0"),
  ]);
  const s = Object.fromEntries(settings.results.map((r) => [r.k, r.v]));
  cache = {
    at: Date.now(),
    secret: s.secret,
    code: s.code || "",
    codeVersion: Number(s.code_version) || 1,
    invites: new Map(invites.results.map((r) => [r.id, r.expires_at])),
    users: new Set(users.results.map((r) => r.id)),
  };
  return cache;
}

const isSecure = (request) => new URL(request.url).protocol === "https:";

/* ---------- Turnier-Gäste ---------- */
const GUEST_CACHE_MS = 30_000;
const guestCache = new Map(); // Turnier-ID -> { at, row }
async function guestTournament(env, tid, force = false) {
  const hit = guestCache.get(tid);
  if (!force && hit && Date.now() - hit.at < GUEST_CACHE_MS) return hit.row;
  await initTurniere(env);
  const row = await env.DB.prepare("SELECT id, name, visitor_slug, guest_until FROM tournaments WHERE id = ?").bind(tid).first();
  guestCache.set(tid, { at: Date.now(), row: row || null });
  if (guestCache.size > 200) guestCache.delete(guestCache.keys().next().value);
  return row || null;
}
/** Nach Änderungen am Gastlink (Turnierverwaltung) sofort neu laden. */
export function forgetGuestTournament(tid) {
  guestCache.delete(Number(tid));
}

/** Set-Cookie-Kopfzeile für einen neuen Zugang (Code, Einladung oder Konto). */
export async function issueAccessCookie(env, request, kind, id = 0) {
  const st = await loadState(env, true);
  const payload = { k: kind, id, t: Math.floor(Date.now() / 1000) };
  if (kind === "c") payload.v = st.codeVersion;
  return cookieHeader(await signToken(st.secret, payload), isSecure(request));
}

function wantsHtml(request) {
  if (request.method !== "GET") return false;
  if (request.headers.get("sec-fetch-mode") === "navigate") return true;
  return (request.headers.get("accept") || "").includes("text/html");
}

/** Tor-Antwort für Anfragen ohne Zugang. */
async function denied(request, env, path, message, back = null) {
  if (path.startsWith("/api/")) {
    return securityHeaders(json({ error: back ? message : "Kein Zugang – bitte zuerst den Zugangscode eingeben.", zugang: true }, back ? 403 : 401));
  }
  if (!wantsHtml(request)) {
    return new Response("Kein Zugang.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  const st = await loadState(env);
  return securityHeaders(
    new Response(gatePage({ codeEnabled: !!st.code, message, back }), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  );
}

/**
 * Prüft den Zugang. Ergebnis:
 *   { response }  – Anfrage abweisen (Tor-Seite bzw. 401)
 *   { setCookie } – durchlassen, ggf. mit verlängertem Cookie
 */
export async function guard(request, env, path) {
  if (isPublicPath(path)) return {};
  const raw = readCookie(request, COOKIE);
  const guestRaw = readCookie(request, GUEST_COOKIE);
  if (raw) {
    const st = await loadState(env);
    const p = await verifyToken(st.secret, raw);
    if (isValidForState(p, st)) {
      const age = Date.now() / 1000 - p.t;
      if (age > RENEW_AFTER_SEC) {
        const fresh = { ...p, t: Math.floor(Date.now() / 1000) };
        return { setCookie: cookieHeader(await signToken(st.secret, fresh), isSecure(request)) };
      }
      return {};
    }
  }
  // Turnier-Gast: nur das eine Turnier
  if (guestRaw) {
    const st = await loadState(env);
    const p = await verifyToken(st.secret, guestRaw);
    const t = p && p.k === "g" ? await guestTournament(env, p.id) : null;
    if (isValidGuest(p, t)) {
      if (guestAllows(path, request.method, t.id)) return { guest: { tid: t.id, name: t.name } };
      return { response: await denied(request, env, path, `Mit deinem Gastzugang siehst du nur das Turnier „${t.name}“.`, { href: `/tischtennis/#t=${t.id}`, label: "Zurück zum Turnier" }) };
    }
  }
  const response = await denied(request, env, path, raw ? "Dein Zugang gilt nicht mehr – vermutlich wurde der Code geändert." : "");
  if (raw) {
    const h = new Headers(response.headers);
    h.append("set-cookie", cookieHeader("", isSecure(request), 0));
    return { response: new Response(response.body, { status: response.status, headers: h }) };
  }
  return { response };
}

/**
 * GET /tischtennis/t/<kennung>: Turnier-Link. Wer schon Zugang hat, landet
 * direkt im Turnier. Alle anderen bekommen – solange der Gastzugang des
 * Turniers läuft – ein Gast-Cookie nur für dieses Turnier.
 */
export async function enterTournamentLink(request, env, slug) {
  await initTurniere(env);
  const t = await env.DB.prepare("SELECT id, name, visitor_slug, guest_until FROM tournaments WHERE visitor_slug = ?").bind(slug).first();
  const full = !(await guard(new Request(new URL("/", request.url), { headers: request.headers }), env, "/")).response;
  const to = (tid, setCookie) => {
    const headers = { location: `/tischtennis/#t=${tid}`, "cache-control": "no-store" };
    if (setCookie) headers["set-cookie"] = setCookie;
    return new Response(null, { status: 302, headers });
  };
  if (t && full) return to(t.id);
  if (!t) {
    if (full) return new Response("Dieser Link ist nicht (mehr) gültig.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return denied(request, env, "/tischtennis/t", "Dieser Turnier-Link ist nicht (mehr) gültig. Frag die Turnierleitung nach dem aktuellen QR-Code.");
  }
  if (!(Number(t.guest_until) > Date.now())) {
    return denied(request, env, "/tischtennis/t", `Der Gastzugang für „${t.name}“ ist abgelaufen. Frag die Turnierleitung oder komm mit dem Zugangscode rein.`);
  }
  const st = await loadState(env);
  const maxAge = Math.max(60, Math.floor((Number(t.guest_until) - Date.now()) / 1000));
  const value = await signToken(st.secret, { k: "g", id: t.id, s: t.visitor_slug, t: Math.floor(Date.now() / 1000) });
  guestCache.set(t.id, { at: Date.now(), row: t });
  return to(t.id, cookieHeader(value, isSecure(request), maxAge, GUEST_COOKIE));
}

/** GET /zugang/<token>: Einladungslink einlösen. */
export async function redeemInvite(request, env, token) {
  await ensureTables(env);
  const row = await env.DB.prepare("SELECT id, expires_at FROM access_invites WHERE token = ?").bind(token).first();
  if (!row || (row.expires_at && row.expires_at < Date.now())) {
    // Wer schon drin ist (z. B. alter Link nochmal geöffnet), landet einfach auf der Startseite.
    const already = await guard(request, env, "/");
    if (!already.response) return new Response(null, { status: 302, headers: { location: "/", "cache-control": "no-store" } });
    return denied(request, env, "/zugang", "Dieser Einladungslink gilt nicht (mehr). Frag nach einem neuen oder nach dem Zugangscode.");
  }
  await env.DB.prepare("UPDATE access_invites SET uses = uses + 1, last_used = ? WHERE id = ?").bind(Date.now(), row.id).run();
  await loadState(env, true);
  return new Response(null, {
    status: 302,
    headers: { location: "/", "set-cookie": await issueAccessCookie(env, request, "i", row.id), "cache-control": "no-store" },
  });
}

/** /api/zugang/* */
export async function handleZugangApi(request, env, path) {
  const rejected = rejectNonJsonWrites(request);
  if (rejected) return rejected;
  return handleErrors(async () => {
    await ensureTables(env);
    const method = request.method;
    const readBody = bodyReader(request, 10_000);

    if (path === "/code" && method === "POST") {
      const st = await loadState(env, true);
      const b = await readBody();
      if (!st.code) fail(403, "Gerade ist kein Zugangscode eingerichtet. Nutze deinen Einladungslink oder melde dich an.");
      if (normalizeCode(b.code) !== normalizeCode(st.code)) fail(401, "Der Code stimmt nicht.");
      return securityHeaders(json({ ok: true }, 200, { "set-cookie": await issueAccessCookie(env, request, "c") }));
    }

    const user = await getUser(request, env);
    if (!user) fail(401, "Bitte anmelden.");
    if (!hasPerm(user, "users.manage")) fail(403, "Dafür fehlt dir das Recht.");
    const origin = new URL(request.url).origin;
    let m;

    if (path === "/admin" && method === "GET") {
      const st = await loadState(env, true);
      const rows = await env.DB.prepare(
        `SELECT i.id, i.token, i.label, i.created_at, i.expires_at, i.uses, i.last_used, u.display_name AS created_by_name
           FROM access_invites i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC`
      ).all();
      return securityHeaders(
        json({
          code: st.code,
          invites: rows.results.map(({ token, ...r }) => ({ ...r, link: `${origin}/zugang/${token}`, expired: !!(r.expires_at && r.expires_at < Date.now()) })),
        })
      );
    }

    if (path === "/admin/code" && method === "PUT") {
      const b = await readBody();
      const code = str(b.code, 64);
      if (code && normalizeCode(code).length < 4) fail(400, "Der Code braucht mindestens 4 Zeichen.");
      const st = await loadState(env, true);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO access_settings (k, v) VALUES ('code', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(code),
        env.DB.prepare("UPDATE access_settings SET v = ? WHERE k = 'code_version'").bind(String(st.codeVersion + 1)),
      ]);
      await loadState(env, true);
      return securityHeaders(json({ ok: true, code }));
    }

    if (path === "/admin/invites" && method === "POST") {
      const b = await readBody();
      const label = str(b.label, 60);
      if (!label) fail(400, "Bitte einen Namen angeben, für wen der Link ist.");
      const days = Number(b.days) || 0;
      if (days < 0 || days > 3650) fail(400, "Ungültige Gültigkeitsdauer.");
      const { n } = await env.DB.prepare("SELECT count(*) AS n FROM access_invites").first();
      if (n >= 200) fail(409, "Es gibt schon sehr viele Einladungen – lösch erst ein paar alte.");
      const token = randomHex(16);
      await env.DB.prepare("INSERT INTO access_invites (token, label, created_by, created_at, expires_at) VALUES (?,?,?,?,?)")
        .bind(token, label, user.id, Date.now(), days ? Date.now() + days * 86_400_000 : null)
        .run();
      await loadState(env, true);
      return securityHeaders(json({ ok: true, link: `${origin}/zugang/${token}` }, 201));
    }

    if ((m = path.match(/^\/admin\/invites\/(\d+)$/)) && method === "DELETE") {
      await env.DB.prepare("DELETE FROM access_invites WHERE id = ?").bind(intId(m[1])).run();
      await loadState(env, true);
      return securityHeaders(json({ ok: true }));
    }

    fail(404, "Nicht gefunden.");
  });
}

/** Nur für Tests. */
export function _resetCache() {
  cache = null;
  tablesReady = false;
  guestCache.clear();
}
