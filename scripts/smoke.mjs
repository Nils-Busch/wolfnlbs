// Rauchtest: startet die Seite lokal (wrangler dev), prüft das Eingangstor (Code,
// Einladungslink, Konto), ruft die wichtigsten Seiten auf und spielt eine kurze
// Mäxchen-Runde über WebSockets. Läuft lokal und im GitHub-Workflow:
//   npm run test:smoke
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const persist = mkdtempSync(join(tmpdir(), "vh-smoke-"));
const bin = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const ADMIN_PW = "smoke-test-passwort";
const dev = spawn(join("node_modules", ".bin", bin), ["dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist, "--var", `ADMIN_PASSWORD:${ADMIN_PW}`], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } });
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));

let failed = 0;
const ok = (msg) => console.log(`✔ ${msg}`);
const bad = (msg) => { failed++; console.log(`✘ ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/robots.txt"); if (r.ok) return; } catch {}
    await sleep(1000);
  }
  throw new Error("wrangler dev ist nicht gestartet:\n" + log.slice(-3000));
}

// Mini-Keksdose: merkt sich Cookies aus Set-Cookie-Kopfzeilen
function jar() {
  const c = new Map();
  return {
    take(res) { for (const line of res.headers.getSetCookie()) { const [kv] = line.split(";"); const i = kv.indexOf("="); c.set(kv.slice(0, i), kv.slice(i + 1)); } return res; },
    get header() { return [...c].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; "); },
  };
}
const send = (path, j, opts = {}) => fetch(BASE + path, { redirect: "manual", ...opts, headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers || {}), cookie: j ? j.header : "" } }).then((r) => (j ? j.take(r) : r));
const admin = jar();

function client(code) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/spiele/party/${code}/ws`, { headers: { cookie: admin.header } });
  let seq = 0;
  const pending = new Map();
  const c = { ws, state: null, open: new Promise((r) => (ws.onopen = r)) };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    const m = JSON.parse(e.data);
    if (m.t === "res") { pending.get(m.id)?.(m.res); pending.delete(m.id); }
    else if (m.event === "state") c.state = m.payload;
  };
  c.emit = (event, payload = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, event, payload })); });
  return c;
}

try {
  await waitReady();
  ok("wrangler dev läuft");

  // Eingangstor
  let r0 = await send("/", null, { headers: { accept: "text/html" } });
  r0.status === 401 && (await r0.text()).includes("Geschlossene Gesellschaft") ? ok("ohne Zugang nur das Tor") : bad(`Tor fehlt (${r0.status})`);
  r0 = await send("/api/tischtennis/tournaments");
  r0.status === 401 ? ok("API ohne Zugang gesperrt") : bad(`API ohne Zugang -> ${r0.status}`);
  r0 = await send("/impressum");
  r0.status === 401 ? ok("kein öffentliches Impressum/keine Inhalte") : bad(`/impressum -> ${r0.status}`);
  r0 = await send("/");
  (r0.headers.get("x-robots-tag") || "").includes("noindex") ? ok("noindex gesetzt") : bad("X-Robots-Tag fehlt");
  r0 = await send("/api/konto/auth/login", admin, { method: "POST", body: JSON.stringify({ username: "admin", password: ADMIN_PW }) });
  r0.ok && admin.header.includes("vh_zugang=") ? ok("Konto-Anmeldung öffnet das Tor") : bad(`Anmelden -> ${r0.status}`);
  (await send("/", admin)).ok ? ok("mit Konto drin") : bad("mit Konto nicht drin");

  (await send("/api/zugang/admin/code", admin, { method: "PUT", body: JSON.stringify({ code: "Würfel Becher" }) })).ok ? ok("Zugangscode festgelegt") : bad("Code festlegen");
  const gast = jar();
  (await send("/api/zugang/code", gast, { method: "POST", body: JSON.stringify({ code: "falsch" }) })).status === 401 ? ok("falscher Code abgewiesen") : bad("falscher Code");
  (await send("/api/zugang/code", gast, { method: "POST", body: JSON.stringify({ code: "würfelbecher" }) })).ok ? ok("richtiger Code") : bad("richtiger Code");
  (await send("/spiele/", gast)).ok ? ok("Gast mit Code drin") : bad("Gast mit Code nicht drin");

  const inv = await (await send("/api/zugang/admin/invites", admin, { method: "POST", body: JSON.stringify({ label: "Oma", days: 0 }) })).json();
  const oma = jar();
  const redeem = await send(new URL(inv.link).pathname, oma);
  redeem.status === 302 && oma.header.includes("vh_zugang=") ? ok("Einladungslink eingelöst") : bad(`Einladungslink -> ${redeem.status}`);
  (await send("/raetsel/", oma)).ok ? ok("mit Einladung drin") : bad("mit Einladung nicht drin");
  const list = await (await send("/api/zugang/admin", admin)).json();
  list.invites[0]?.uses === 1 ? ok("Einladung gezählt") : bad("Einladung nicht gezählt");
  (await send(`/api/zugang/admin/invites/${list.invites[0].id}`, admin, { method: "DELETE", body: "{}" })).ok ? ok("Einladung gelöscht") : bad("Einladung löschen");
  (await send("/raetsel/", oma)).status === 401 ? ok("gelöschte Einladung sperrt aus") : bad("gelöschte Einladung gilt noch");
  await send("/api/zugang/admin/code", admin, { method: "PUT", body: JSON.stringify({ code: "neuer code" }) });
  (await send("/spiele/", gast)).status === 401 ? ok("Code geändert: alter Code-Zugang gesperrt") : bad("alter Code gilt noch");
  (await send("/", admin)).ok ? ok("Konto bleibt drin") : bad("Konto ausgesperrt");

  for (const path of ["/", "/spiele/", "/spiele/gruppe/", "/spiele/games/maexchen.html", "/spiele/games/kloetzchen.html", "/raetsel/puzzle.html", "/quiz/", "/raetsel/", "/konto/", "/tischtennis/", "/tischtennis/rangliste", "/tischtennis/live", "/datenschutz", "/robots.txt", "/manifest.webmanifest", "/sw.js", "/woelfe/"]) {
    const r = await send(path, admin, { redirect: "follow" });
    r.ok ? ok(`GET ${path}`) : bad(`GET ${path} -> ${r.status}`);
  }
  for (const path of ["/api/tischtennis/tournaments", "/api/tischtennis/ranking?sport=tabletennis"]) {
    const r = await send(path, admin);
    r.ok ? ok(`GET ${path}`) : bad(`GET ${path} -> ${r.status}`);
  }

  // Mäxchen online: Raum eröffnen, mitspielen, Computer dazu, starten, ein paar Züge
  const r = await send("/api/spiele/party", admin, { method: "POST", body: JSON.stringify({ game: "maexchen" }) });
  const room = await r.json();
  room.ok ? ok(`Raum ${room.roomCode} eröffnet`) : bad("Raum eröffnen");
  const anna = client(room.roomCode), ben = client(room.roomCode);
  await Promise.all([anna.open, ben.open]);
  const j1 = await anna.emit("join", { name: "Anna", hostKey: room.hostKey });
  const j2 = await ben.emit("join", { name: "Ben" });
  j1.ok && j1.host && j2.ok && !j2.host ? ok("Beitreten (Anna leitet)") : bad("Beitreten");
  (await ben.emit("start")).ok ? bad("Ben darf nicht starten") : ok("nur die Spielleitung startet");
  (await anna.emit("addBot")).ok ? ok("Computer dazugeholt") : bad("Computer dazuholen");
  (await anna.emit("start")).ok ? ok("Spiel gestartet") : bad("Spiel starten");
  await sleep(300);
  let moves = 0;
  for (let i = 0; i < 40 && moves < 6; i++) {
    const s = anna.state;
    if (!s || s.phase !== "PLAYING") break;
    const me = [anna, ben].find((c) => c.state?.me?.id === s.mx.cur);
    if (me && s.mx.step === "decide") { await me.emit("mx", { action: s.mx.prev ? "reveal" : "roll" }); moves++; }
    else if (me && s.mx.step === "rolled") { const st = me.state; const min = st.mx.prev ? st.mx.ladder.findIndex((x) => x.v === st.mx.prev.value) + 1 : 0; await me.emit("mx", { action: "say", value: st.mx.ladder[min].v }); moves++; }
    await sleep(500);
  }
  moves >= 3 ? ok(`${moves} Mäxchen-Züge gespielt`) : bad("Mäxchen-Züge");
  // Spieleabend: Spiel wechseln
  await anna.emit("restart");
  const sw = await anna.emit("switchGame", { game: "kniffel" });
  await sleep(300);
  sw.ok && anna.state.game === "kniffel" && !anna.state.players.some((p) => p.bot) ? ok("Spiel gewechselt, Computer entfernt") : bad("Spiel wechseln");
  anna.ws.close(); ben.ws.close();
} catch (e) {
  bad(e.message);
} finally {
  dev.kill("SIGTERM");
  await sleep(500);
  try { rmSync(persist, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : "\nAlles grün.");
process.exit(failed ? 1 : 0);
