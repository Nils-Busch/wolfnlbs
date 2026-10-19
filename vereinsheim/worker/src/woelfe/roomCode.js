// Erzeugt kurze, gut lesbare Raum-Codes (keine verwechselbaren Zeichen wie 0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 4) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Nur gültige Codes an ein Durable Object weiterreichen (verhindert, dass beliebige
// Pfade neue Objekte anlegen).
export function isValidRoomCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{4}$/.test(code);
}
