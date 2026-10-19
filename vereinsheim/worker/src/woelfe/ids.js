// Kleine, abhängigkeitsfreie ID-Erzeugung (ersetzt "nanoid"), läuft in Workers
// genauso wie in Node, weil beide crypto.getRandomValues anbieten.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

export function makeId(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) id += ALPHABET[bytes[i] & 63];
  return id;
}
