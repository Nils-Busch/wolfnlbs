// Einfacher Missbrauchsschutz: höchstens N Anfragen pro IP-Adresse und Zeitfenster.
//
// Die Zähler liegen im Speicher der jeweiligen Worker-Instanz. Cloudflare startet
// bei Bedarf mehrere Instanzen, deshalb ist das eine Bremse gegen Massenanfragen
// (Skripte, Spam), keine exakte Abrechnung – für ein Vereinsheim genau richtig,
// ohne zusätzliche Kosten oder Dienste.

const buckets = new Map();
const MAX_BUCKETS = 10_000;

/** Regeln: Methode + Pfad (Regex) -> Grenze pro Fenster. */
export const RULES = [
  // Neue Räume (Werwolf, Spielegalerie-Duelle, Gruppenspiele, Quiz)
  { method: "POST", re: /^\/api\/(woelfe|spiele|quiz)\/(rooms|party)$/, key: "room", limit: 30, windowMs: 10 * 60_000 },
  // Tippspiel
  { method: "POST", re: /^\/api\/tischtennis\/matches\/\d+\/tip$/, key: "tip", limit: 60, windowMs: 60_000 },
  // Anmelden und Registrieren (gegen Passwort-Raten)
  { method: "POST", re: /\/auth\/(login|register)$/, key: "auth", limit: 10, windowMs: 5 * 60_000 },
  // Zugangscode raten
  { method: "POST", re: /^\/api\/zugang\/code$/, key: "zugang", limit: 10, windowMs: 5 * 60_000 },
  // Bestenlisten-Einträge
  { method: "POST", re: /^\/api\/spiele\/scores\/[a-z0-9]+$/, key: "score", limit: 60, windowMs: 10 * 60_000 },
];

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "lokal";
}

/** Zählt eine Anfrage. Gibt 0 zurück, wenn sie erlaubt ist, sonst die Wartezeit in Sekunden. */
export function hit(key, ip, { limit, windowMs }, now = Date.now()) {
  const k = `${key}|${ip}`;
  let b = buckets.get(k);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, n: 0, windowMs };
    buckets.set(k, b);
  }
  b.n++;
  if (buckets.size > MAX_BUCKETS) {
    for (const [kk, bb] of buckets) if (now - bb.start >= bb.windowMs) buckets.delete(kk);
  }
  return b.n > limit ? Math.max(1, Math.ceil((b.start + windowMs - now) / 1000)) : 0;
}

/** Prüft eine Anfrage gegen RULES. Gibt eine 429-Antwort zurück oder null. */
export function checkRateLimit(request, path) {
  const rule = RULES.find((r) => r.method === request.method && r.re.test(path));
  if (!rule) return null;
  const ip = clientIp(request);
  // Lokale Entwicklung (wrangler dev) nicht ausbremsen
  if (ip === "127.0.0.1" || ip === "::1" || ip === "lokal") return null;
  const wait = hit(rule.key, ip, rule);
  if (!wait) return null;
  return new Response(JSON.stringify({ error: `Zu viele Anfragen – bitte in ${wait} Sekunden nochmal versuchen.` }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "retry-after": String(wait), "cache-control": "no-store" },
  });
}

/** Nur für Tests. */
export function _reset() {
  buckets.clear();
}
