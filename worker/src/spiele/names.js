// Namen in Bestenlisten an Konten koppeln.
//   Angemeldet:      es wird immer der Kontoname eingetragen.
//   Nicht angemeldet: Namen, die zu einem Konto gehören, sind gesperrt.
import { getUser } from "../konto/auth.js";

export class NameError extends Error {}

export const keyOf = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

// Liefert { name, userId } oder wirft NameError mit einer verständlichen Meldung.
export async function resolveName(request, env, rawName) {
  let user = null;
  if (env.DB) {
    try {
      user = await getUser(request, env);
    } catch {
      user = null;
    }
  }
  if (user) return { name: String(user.display_name || user.username).trim().slice(0, 16), userId: user.id };

  const name = String(rawName || "").trim().slice(0, 16);
  if (!name) throw new NameError("Name fehlt.");
  if (env.DB) {
    const k = keyOf(name);
    const owner = await env.DB.prepare(
      "SELECT id FROM users WHERE active = 1 AND (lower(display_name) = ? OR lower(username) = ? OR lower(substr(display_name, 1, 16)) = ?) LIMIT 1"
    )
      .bind(k, k, k)
      .first()
      .catch(() => null);
    if (owner) throw new NameError(`„${name}“ gehört zu einem Konto. Melde dich an, um unter diesem Namen einzutragen.`);
  }
  return { name, userId: null };
}
