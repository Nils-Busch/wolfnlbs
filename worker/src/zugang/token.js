// Zugangs-Cookie "vh_zugang": wer einmal den Zugangscode eingegeben, einen
// Einladungslink geöffnet oder sich mit Konto angemeldet hat, bekommt ein
// signiertes Cookie. Ohne gültiges Cookie zeigt die Seite nur das Tor.
//
// Aufbau: base64url(JSON) + "." + base64url(HMAC-SHA256)
//   k  Art des Zugangs: "c" Code, "i" Einladung, "u" Konto
//   id Einladungs- bzw. Konto-ID (beim Code 0)
//   v  Code-Version (nur bei "c"; ändert sich, wenn der Code geändert wird)
//   t  Ausstellungszeit in Sekunden

export const COOKIE = "vh_zugang";
export const MAX_AGE_SEC = 180 * 24 * 3600; // 180 Tage
export const RENEW_AFTER_SEC = 7 * 24 * 3600; // nach einer Woche still verlängern

const enc = new TextEncoder();
const keyCache = new Map();

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  let k = keyCache.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, k);
  }
  return k;
}

export async function signToken(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Prüft die Signatur und gibt den Inhalt zurück (oder null). Läuft nicht ab, das prüft der Aufrufer. */
export async function verifyToken(secret, token) {
  if (typeof token !== "string" || token.length > 600) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!p || !["c", "i", "u"].includes(p.k) || !Number.isFinite(p.t)) return null;
    return p;
  } catch {
    return null;
  }
}

export function cookieHeader(value, secure, maxAge = MAX_AGE_SEC) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** Zugangscodes vergleichen: Groß-/Kleinschreibung und Leerzeichen egal. */
export const normalizeCode = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/**
 * Ist dieses Cookie (schon geprüfte Signatur) nach dem aktuellen Stand gültig?
 * state: { code, codeVersion, invites: Map<id, expiresAt|null>, users: Set<id> }
 */
export function isValidForState(p, state, nowMs = Date.now()) {
  if (!p) return false;
  if (p.t * 1000 + MAX_AGE_SEC * 1000 < nowMs) return false;
  if (p.k === "c") return !!state.code && p.v === state.codeVersion;
  if (p.k === "i") {
    if (!state.invites.has(p.id)) return false;
    const exp = state.invites.get(p.id);
    return !exp || exp > nowMs;
  }
  if (p.k === "u") return state.users.has(p.id);
  return false;
}

/** Pfade, die auch ohne Zugang erreichbar sind: das Tor selbst und was es zum Anzeigen braucht. */
const PUBLIC = [
  /^\/shared\/(fonts|icons)\//,
  /^\/shared\/(vereinsheim\.css|pwa\.js)$/,
  /^\/(manifest\.webmanifest|robots\.txt|sw\.js|favicon\.ico)$/,
  /^\/(offline|datenschutz)(\.html)?$/,
  /^\/zugang\/[a-f0-9]{16,64}$/,
  /^\/api\/zugang\/code$/,
  /^\/api\/(konto|tischtennis)\/auth\/login$/,
];
export const isPublicPath = (path) => PUBLIC.some((re) => re.test(path));
