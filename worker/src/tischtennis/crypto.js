// Kleine, abhängigkeitsfreie Zufallshelfer für den Worker (ersetzt Node's
// "crypto"-Modul, das es in Workers nicht gibt – nur Web Crypto).

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Gleichverteilte Zufallszahl 0..max-1 (Rejection Sampling, kein Modulo-Bias). */
export function randomInt(max) {
  const range = 256 - (256 % max);
  let b;
  do { b = randomBytes(1)[0]; } while (b >= range);
  return b % max;
}

export function randomToken() {
  return toHex(randomBytes(32));
}

export function randomPassword() {
  return toBase64Url(randomBytes(9));
}

const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'; // ohne l/o/0/1, leicht vorlesbar
export function randomSlug(length = 8) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  return out;
}

/** Fisher-Yates mit kryptografischem Zufall (ersetzt crypto.randomInt). */
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
