// Kleine Effekt-Helfer für die Werwolf-Oberfläche.

const PALETTE = ["#e05252", "#3f7be0", "#22a06b", "#d99a00", "#8a5cf0", "#e0658f", "#1aa3a3", "#c4622d"];

// Gleiche Namen bekommen immer dieselbe Farbe.
export function colorFor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join("").toUpperCase();
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Kurz vibrieren (Handy liegt umgedreht auf dem Tisch).
export function buzz(pattern = [90, 70, 90]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* nicht unterstützt */
  }
}

export function confetti(colors) {
  if (typeof window !== "undefined" && window.VH && window.VH.confetti) window.VH.confetti(colors ? { colors } : undefined);
}

export const NIGHT_PHASES = new Set(["NIGHT_AMOR", "NIGHT_WOLFDOG", "NIGHT_WOLVES", "NIGHT_SEER", "NIGHT_WITCH"]);

export const PHASES = {
  NIGHT_AMOR: { em: "💘", title: "Amor erwacht", sub: "Zwei Herzen werden verbunden.", label: "Amor" },
  NIGHT_WOLFDOG: { em: "🐕", title: "Der Wolfshund erwacht", sub: "Dorf oder Rudel?", label: "Wolfshund" },
  NIGHT_WOLVES: { em: "🌙", title: "Die Nacht bricht herein", sub: "Alle schließen die Augen. Die Werwölfe erwachen.", label: "Werwölfe" },
  NIGHT_SEER: { em: "🔮", title: "Die Seherin erwacht", sub: "Sie blickt in eine fremde Seele.", label: "Seherin" },
  NIGHT_WITCH: { em: "🧪", title: "Die Hexe erwacht", sub: "Zwei Tränke, eine Entscheidung.", label: "Hexe" },
  HUNTER_SHOT: { em: "🏹", title: "Der Jäger legt an", sub: "Ein letzter Schuss.", label: "Der Jäger schießt" },
  DAY_REVEAL: { em: "🌅", title: "Das Dorf erwacht", sub: "Wer hat die Nacht überlebt?", label: "Der Morgen danach", day: true },
  MAYOR_ELECTION: { em: "🎗️", title: "Wahl im Dorf", sub: "Wer soll das Dorf anführen?", label: "Bürgermeisterwahl", day: true },
  DAY_DISCUSSION: { em: "💬", title: "Beratung", sub: "Wer verhält sich verdächtig?", label: "Diskussion", day: true },
  DAY_VOTE: { em: "🗳️", title: "Abstimmung", sub: "Das Dorf richtet.", label: "Abstimmung", day: true },
  VOTE_RESULT: { em: "📜", title: "Das Urteil", sub: "", label: "Ergebnis", day: true },
};
