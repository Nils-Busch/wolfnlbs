import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken, isValidForState, isPublicPath, normalizeCode, MAX_AGE_SEC } from "../worker/src/zugang/token.js";

const now = Date.now();
const t = Math.floor(now / 1000);
const state = { code: "Würfelbecher", codeVersion: 3, invites: new Map([[5, null], [6, now - 1000], [7, now + 86_400_000]]), users: new Set([1, 2]) };

test("Zugang: Cookie signieren und prüfen", async () => {
  const tok = await signToken("geheim", { k: "c", id: 0, v: 3, t });
  assert.deepEqual(await verifyToken("geheim", tok), { k: "c", id: 0, v: 3, t });
  assert.equal(await verifyToken("anderes-geheimnis", tok), null, "falscher Schlüssel");
  const [body, sig] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "u", id: 1, t })).toString("base64url");
  assert.equal(await verifyToken("geheim", `${forged}.${sig}`), null, "veränderter Inhalt");
  assert.equal(await verifyToken("geheim", body), null, "ohne Signatur");
  assert.equal(await verifyToken("geheim", "kaputt.!!"), null);
});

test("Zugang: Code-Zugang gilt nur für die aktuelle Code-Version", () => {
  assert.ok(isValidForState({ k: "c", id: 0, v: 3, t }, state, now));
  assert.ok(!isValidForState({ k: "c", id: 0, v: 2, t }, state, now), "Code wurde geändert");
  assert.ok(!isValidForState({ k: "c", id: 0, v: 3, t }, { ...state, code: "" }, now), "Code abgeschaltet");
});

test("Zugang: Einladungen und Konten", () => {
  assert.ok(isValidForState({ k: "i", id: 5, t }, state, now), "ohne Ablauf");
  assert.ok(!isValidForState({ k: "i", id: 6, t }, state, now), "abgelaufen");
  assert.ok(isValidForState({ k: "i", id: 7, t }, state, now), "noch gültig");
  assert.ok(!isValidForState({ k: "i", id: 8, t }, state, now), "gelöscht");
  assert.ok(isValidForState({ k: "u", id: 2, t }, state, now));
  assert.ok(!isValidForState({ k: "u", id: 3, t }, state, now), "Konto gesperrt");
  assert.ok(!isValidForState({ k: "u", id: 2, t: t - MAX_AGE_SEC - 10 }, state, now), "Cookie zu alt");
});

test("Zugang: nur das Tor und seine Zutaten sind öffentlich", () => {
  for (const p of ["/shared/fonts/figtree.woff2", "/shared/vereinsheim.css", "/robots.txt", "/datenschutz", "/api/zugang/code", "/api/konto/auth/login", "/zugang/0123456789abcdef0123456789abcdef"]) {
    assert.ok(isPublicPath(p), p);
  }
  for (const p of ["/", "/woelfe/", "/spiele/", "/api/konto/auth/register", "/api/zugang/admin", "/api/spiele/party", "/tischtennis/t/abc", "/impressum", "/shared/me.js", "/zugang/nicht-hex"]) {
    assert.ok(!isPublicPath(p), p);
  }
});

test("Zugang: Code-Vergleich ohne Groß-/Kleinschreibung und Leerzeichen", () => {
  assert.equal(normalizeCode(" Würfel Becher "), normalizeCode("würfelbecher"));
  assert.notEqual(normalizeCode("wuerfelbecher"), normalizeCode("würfelbecher"));
});
