// Persönliche Einstellungen am Konto. Bisher nur das Aussehen
// (siehe /shared/theme.js): Farbthema, Abendmodus, Schrift, Größe, Animationen.
// Unbekannte Werte fallen auf den Standard zurück, damit nichts Fremdes in der
// Datenbank landet.

export const LOOK_OPTIONS = {
  theme: ["vereinsheim", "nacht", "filz", "bonbon", "kontrast"],
  night: ["off", "auto"],
  font: ["play", "calm"],
  size: ["m", "l"],
  motion: ["full", "less"],
};

/** Aussehen prüfen; null, wenn gar nichts Brauchbares kommt. */
export function cleanLook(look) {
  if (!look || typeof look !== "object" || Array.isArray(look)) return null;
  const out = {};
  for (const [k, vals] of Object.entries(LOOK_OPTIONS)) out[k] = vals.includes(look[k]) ? look[k] : vals[0];
  return out;
}

/** Gespeicherte Einstellungen lesen (kaputtes JSON = keine Einstellungen). */
export function parsePrefs(raw) {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const look = cleanLook(p?.look);
    return look ? { look } : null;
  } catch {
    return null;
  }
}
