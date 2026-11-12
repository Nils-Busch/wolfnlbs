import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLook, parsePrefs, LOOK_OPTIONS } from "../worker/src/konto/prefs.js";
import { readFileSync } from "node:fs";

test("Aussehen: nur bekannte Werte, Rest fällt auf Standard zurück", () => {
  assert.deepEqual(cleanLook({ theme: "nacht", night: "auto", font: "calm", size: "l", motion: "less" }), { theme: "nacht", night: "auto", font: "calm", size: "l", motion: "less" });
  assert.deepEqual(cleanLook({ theme: "<script>", size: "xxl", extra: 1 }), { theme: "vereinsheim", night: "off", font: "play", size: "m", motion: "full" });
  assert.equal(cleanLook(null), null);
  assert.equal(cleanLook("nacht"), null);
  assert.equal(cleanLook([1, 2]), null);
});

test("Aussehen: gespeicherte Einstellungen lesen", () => {
  assert.deepEqual(parsePrefs(JSON.stringify({ look: { theme: "filz" } })).look.theme, "filz");
  assert.equal(parsePrefs(null), null);
  assert.equal(parsePrefs("{kaputt"), null);
  assert.equal(parsePrefs("{}"), null);
});

test("Aussehen: Server und Browser kennen dieselben Themen", () => {
  const js = readFileSync(new URL("../client-assets/shared/theme.js", import.meta.url), "utf8");
  for (const id of LOOK_OPTIONS.theme) assert.ok(js.includes(`${id}: {`), `Thema ${id} fehlt in theme.js`);
  for (const [k, vals] of Object.entries(LOOK_OPTIONS)) assert.ok(js.includes(`${k}: ${k === "theme" ? "Object.keys(THEMES)" : JSON.stringify(vals).replace(/"/g, "'").replace(/,/g, ", ")}`), `Optionen ${k} weichen ab`);
});
