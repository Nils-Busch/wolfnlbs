import { test } from "node:test";
import assert from "node:assert/strict";
import { hit, checkRateLimit, _reset } from "../worker/src/ratelimit.js";

test("Rate-Limit: nach der Grenze kommt eine Wartezeit", () => {
  _reset();
  const rule = { limit: 3, windowMs: 60_000 };
  const t = 1_000_000;
  assert.equal(hit("x", "1.2.3.4", rule, t), 0);
  assert.equal(hit("x", "1.2.3.4", rule, t), 0);
  assert.equal(hit("x", "1.2.3.4", rule, t), 0);
  assert.equal(hit("x", "1.2.3.4", rule, t + 1000), 59);
  assert.equal(hit("x", "5.6.7.8", rule, t), 0, "andere IP ist unabhängig");
  assert.equal(hit("x", "1.2.3.4", rule, t + 60_000), 0, "neues Fenster");
});

test("Rate-Limit: Regeln greifen auf Raum-Erstellung", () => {
  _reset();
  const req = () => new Request("https://x/api/spiele/party", { method: "POST", headers: { "cf-connecting-ip": "9.9.9.9" } });
  let res = null;
  for (let i = 0; i < 31; i++) res = checkRateLimit(req(), "/api/spiele/party");
  assert.equal(res.status, 429);
  assert.equal(checkRateLimit(new Request("https://x/api/spiele/party", { method: "GET" }), "/api/spiele/party"), null);
});
