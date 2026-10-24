// Kleine HTTP-Helfer, die sich Konten, Quiz und Tischtennis teilen.

export class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

export const fail = (status, msg) => {
  throw new HttpError(status, msg);
};

export const intId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) fail(400, "Ungültige ID.");
  return n;
};

export const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function securityHeaders(res) {
  const h = new Headers(res.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "same-origin");
  return new Response(res.body, { status: res.status, headers: h });
}

export function json(data, status = 200, extraHeaders) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(data), { status, headers });
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const m = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

// CSRF-Grundschutz: schreibende Requests nur als JSON (ein fremdes Formular kann
// keinen application/json-Request mit Cookies abschicken).
export function rejectNonJsonWrites(request) {
  const method = request.method;
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("application/json") && !(method === "DELETE" && !request.headers.get("content-length"))) {
      return securityHeaders(json({ error: "Content-Type application/json erforderlich." }, 415));
    }
  }
  return null;
}

// Liest den JSON-Body genau einmal (mit Größenlimit).
export function bodyReader(request, maxBytes = 100_000) {
  let body = null;
  return async () => {
    if (body !== null) return body;
    const text = await request.text();
    if (text.length > maxBytes) fail(413, "Anfrage zu groß.");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      fail(400, "Ungültiges JSON.");
    }
    return body;
  };
}

// Einheitliche Fehlerbehandlung für alle JSON-APIs.
export async function handleErrors(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return securityHeaders(json({ error: err.message }, err.status));
    console.error(err);
    return securityHeaders(json({ error: "Interner Fehler." }, 500));
  }
}
