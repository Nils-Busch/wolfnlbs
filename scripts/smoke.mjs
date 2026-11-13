// Rauchtest: startet die Seite lokal (wrangler dev), prüft das Eingangstor (Code,
// Einladungslink, Konto, Turnier-Gastlink), ruft die wichtigsten Seiten auf,
// speichert ein Aussehen am Konto und spielt kurze Runden Mäxchen, Agentenrunde
// und Erklärbär über WebSockets. Läuft lokal und im GitHub-Workflow:
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

  for (const path of ["/", "/spiele/", "/spiele/gruppe/", "/spiele/games/maexchen.html", "/spiele/games/kloetzchen.html", "/raetsel/puzzle.html", "/shared/theme.js", "/shared/look.js", "/quiz/", "/raetsel/", "/konto/", "/tischtennis/", "/tischtennis/rangliste", "/tischtennis/live", "/datenschutz", "/robots.txt", "/manifest.webmanifest", "/sw.js", "/woelfe/"]) {
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

  // Teamspiele: Agentenrunde mit 4 Personen – Hinweis geben, Karte markieren und aufdecken
  const ag = await (await send("/api/spiele/party", admin, { method: "POST", body: JSON.stringify({ game: "agent" }) })).json();
  const four = ["Anna", "Ben", "Clara", "Dieter"].map(() => client(ag.roomCode));
  await Promise.all(four.map((c) => c.open));
  for (const [i, c] of four.entries()) await c.emit("join", { name: ["Anna", "Ben", "Clara", "Dieter"][i], hostKey: i === 0 ? ag.hostKey : undefined });
  await sleep(200);
  const teams = four[0].state.teams;
  [0, 1].every((t) => Object.values(teams).filter((x) => x === t).length === 2) ? ok("Agentenrunde: zwei Teams à 2") : bad("Teams nicht ausgeglichen");
  (await four[0].emit("start")).ok ? ok("Agentenrunde gestartet") : bad("Agentenrunde starten");
  await sleep(300);
  const st0 = four[0].state.ag;
  const spyC = four.find((c) => c.state.me.id === st0.spy[st0.turn]);
  const guessC = four.find((c) => c.state.me.team === st0.turn && c !== spyC);
  spyC.state.ag.cards.every((c) => c.k != null) && guessC.state.ag.cards.every((c) => c.k == null) ? ok("nur der Funker sieht die Geheimkarte") : bad("Geheimkarte sichtbar");
  (await spyC.emit("clue", { word: spyC.state.ag.cards[0].w, n: 1 })).ok ? bad("Wort vom Feld als Hinweis erlaubt") : ok("Wort vom Feld als Hinweis abgelehnt");
  (await spyC.emit("clue", { word: "Quatsch", n: 1 })).ok ? ok("Hinweis gegeben") : bad("Hinweis geben");
  await sleep(200);
  const own = spyC.state.ag.cards.findIndex((c) => c.k === st0.turn);
  const t1 = await guessC.emit("tap", { index: own });
  const t2 = await guessC.emit("tap", { index: own });
  t1.marked === own && t2.revealed === st0.turn ? ok("Karte markiert und aufgedeckt") : bad(`Aufdecken: ${JSON.stringify([t1, t2])}`);
  four.forEach((c) => c.ws.close());

  // Erklärbär: Runde starten, erraten, verbotenes Wort melden
  const ex = await (await send("/api/spiele/party", admin, { method: "POST", body: JSON.stringify({ game: "explain" }) })).json();
  const ex4 = [0, 1, 2, 3].map(() => client(ex.roomCode));
  await Promise.all(ex4.map((c) => c.open));
  for (const [i, c] of ex4.entries()) await c.emit("join", { name: "P" + i, hostKey: i === 0 ? ex.hostKey : undefined });
  await ex4[0].emit("start");
  await sleep(300);
  const e0 = ex4[0].state.ex;
  const expl = ex4.find((c) => c.state.me.id === e0.explainer);
  const opp = ex4.find((c) => c.state.me.team === 1 - e0.team);
  (await expl.emit("go")).ok ? ok("Erklärbär-Runde gestartet") : bad("Erklärbär starten");
  await sleep(200);
  const card = expl.state.ex.card;
  card && opp.state.ex.card?.t === card.t && !ex4.find((c) => c.state.me.team === e0.team && c !== expl).state.ex.card ? ok("Karte nur für Erklärer und Gegenteam") : bad("Karte falsch sichtbar");
  await expl.emit("mark", { result: "ok", pos: expl.state.ex.pos });
  await sleep(150);
  await opp.emit("mark", { result: "buzz", pos: opp.state.ex.pos });
  await sleep(200);
  expl.state.ex.scores[e0.team] === 0 && expl.state.ex.log.length === 2 ? ok("Erraten und „Verboten!“ gezählt") : bad(`Erklärbär-Punkte ${JSON.stringify(expl.state.ex.scores)}`);
  ex4.forEach((c) => c.ws.close());

  // Aussehen am Konto
  const pr = await send("/api/konto/prefs", admin, { method: "PUT", body: JSON.stringify({ look: { theme: "nacht", size: "l", font: "unsinn" } }) });
  const me = await (await send("/api/konto/auth/me", admin)).json();
  pr.ok && me.user.prefs?.look?.theme === "nacht" && me.user.prefs.look.font === "play" ? ok("Aussehen am Konto gespeichert") : bad("Aussehen speichern");
  (await send("/api/konto/prefs", null, { method: "PUT", body: JSON.stringify({ look: {} }) })).status === 401 ? ok("Aussehen ohne Zugang gesperrt") : bad("Aussehen ohne Zugang");

  // Angemeldet bleiben: 90 Tage statt 12 Stunden, „überall abmelden“ beendet alle Sitzungen
  const maxAge = (r) => Number((r.headers.getSetCookie().find((c) => c.startsWith("sid=")) || "").match(/Max-Age=(\d+)/)?.[1]);
  const kurz = jar(), lang = jar();
  const rk = await send("/api/konto/auth/login", kurz, { method: "POST", body: JSON.stringify({ username: "admin", password: ADMIN_PW }) });
  const rl = await send("/api/konto/auth/login", lang, { method: "POST", body: JSON.stringify({ username: "admin", password: ADMIN_PW, remember: true }) });
  maxAge(rk) === 12 * 3600 && maxAge(rl) === 90 * 86400 ? ok("Anmeldung: 12 Stunden bzw. 90 Tage mit „Angemeldet bleiben“") : bad(`Anmeldedauer ${maxAge(rk)} / ${maxAge(rl)}`);
  const ml = await (await send("/api/konto/auth/me", lang)).json();
  ml.user?.keep === true ? ok("„Angemeldet bleiben“ wird angezeigt") : bad("keep fehlt in /auth/me");
  await send("/api/konto/auth/logout-all", lang, { method: "POST", body: "{}" });
  (await (await send("/api/konto/auth/me", kurz)).json()).user === null ? ok("überall abgemeldet") : bad("andere Sitzung lebt noch");
  r0 = await send("/api/konto/auth/login", admin, { method: "POST", body: JSON.stringify({ username: "admin", password: ADMIN_PW }) });

  // Turnier-Gastlink: nur dieses Turnier, nur ansehen und tippen
  const tid = (await (await send("/api/tischtennis/tournaments", admin, { method: "POST", body: JSON.stringify({ name: "Hallenturnier", format: "league", best_of: 3, sport: "tabletennis" }) })).json()).id;
  for (const n of ["Anna", "Ben"]) await send(`/api/tischtennis/tournaments/${tid}/players`, admin, { method: "POST", body: JSON.stringify({ name: n }) });
  await send(`/api/tischtennis/tournaments/${tid}/start`, admin, { method: "POST", body: "{}" });
  const vl = await (await send(`/api/tischtennis/tournaments/${tid}/visitor-link`, admin, { method: "POST", body: "{}" })).json();
  const zuschauer = jar();
  const in1 = await send(vl.path, zuschauer);
  in1.status === 302 && zuschauer.header.includes("vh_gast=") ? ok("Gastlink öffnet das Turnier") : bad(`Gastlink -> ${in1.status}`);
  const tp = await send("/tischtennis/", zuschauer, { headers: { accept: "text/html" } });
  const tpHtml = await tp.text();
  tp.ok && tpHtml.includes("vh-guest") && !tpHtml.includes('href="/quiz/"') ? ok("Gast sieht die Turnierseite ohne Menü") : bad(`Gast-Turnierseite -> ${tp.status}`);
  (await send(`/api/tischtennis/tournaments/${tid}`, zuschauer)).ok ? ok("Gast liest Turnierdaten") : bad("Gast Turnierdaten");
  (await send("/spiele/", zuschauer)).status === 401 ? ok("Gast kommt nicht in andere Bereiche") : bad("Gast in anderen Bereichen");
  (await send("/api/tischtennis/ranking?sport=tabletennis", zuschauer)).status === 403 ? ok("Gast ohne Vereinsrangliste") : bad("Gast Rangliste");
  await send(`/api/tischtennis/tournaments/${tid}/visitor-link`, admin, { method: "POST", body: JSON.stringify({ days: 0 }) });
  (await send("/tischtennis/", zuschauer)).status === 401 ? ok("beendeter Gastzugang sperrt aus") : bad("Gastzugang gilt nach dem Beenden noch");
} catch (e) {
  bad(e.message);
} finally {
  dev.kill("SIGTERM");
  await sleep(500);
  try { rmSync(persist, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : "\nAlles grün.");
process.exit(failed ? 1 : 0);
