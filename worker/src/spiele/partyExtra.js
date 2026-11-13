// Zusätzliche Gruppenspiele im PartyRoom (wie alle Gruppenspiele auch ganz
// ohne Fernseher spielbar – wer den Raum eröffnet, spielt mit und leitet):
//  - Mäxchen online: 2–10 Handys, Würfel verdeckt, ansagen, bluffen, aufdecken.
//  - Montagsmaler: eine Person zeichnet am Handy, alle anderen raten.
// Die Funktionen werden als Methoden an PartyRoom gehängt (this = Raum).

/* =================== Mäxchen =================== */
export const MX_ORDER = [31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 21];
const mxRank = (v) => MX_ORDER.indexOf(v);
export const mxValue = ([a, b]) => (a === b ? a * 11 : (a === 1 && b === 2) || (a === 2 && b === 1) ? 21 : Math.max(a, b) * 10 + Math.min(a, b));
export const mxLabel = (v) => (v === 21 ? "Mäxchen" : v % 11 === 0 ? `${v / 11}er-Pasch` : String(v));
const d6 = () => 1 + Math.floor(Math.random() * 6);
const REVEAL_MS = 3200;
// Computer: Wahrscheinlichkeit, dass ein frischer Wurf mindestens v ist
const mxChance = (v) => (v === 21 || v % 11 !== 0 ? 2 : 1) / 36;
export const mxAtLeast = (v) => MX_ORDER.slice(mxRank(v)).reduce((s, x) => s + mxChance(x), 0);

/** Entscheidung eines Computers: aufdecken (true) oder glauben (false). */
export function mxBotDoubt(prevValue, level, rnd = Math.random) {
  const pTrue = mxAtLeast(prevValue);
  if (prevValue === 21) return rnd() < { easy: 0.55, medium: 0.75, hard: 0.85 }[level];
  if (level === "easy") return rnd() < 0.65 - pTrue * 0.5;
  const r = mxRank(prevValue);
  const pBeat = r + 1 < MX_ORDER.length ? mxAtLeast(MX_ORDER[r + 1]) : 0;
  const t = level === "hard" ? 0.36 + (pBeat < 0.3 ? 0.12 : 0) : 0.3;
  return pTrue + (rnd() - 0.5) * 0.12 < t;
}
/** Ansage eines Computers für den eigenen Wurf (immer höher als prevValue). */
export function mxBotSay(dice, prevValue, level, rnd = Math.random) {
  const actual = mxValue(dice);
  const min = prevValue ? mxRank(prevValue) + 1 : 0;
  const legal = MX_ORDER.slice(min);
  const r = mxRank(actual);
  if (r >= min) {
    const lieUp = { easy: 0.05, medium: 0.12, hard: 0.22 }[level];
    return rnd() < lieUp && r < 12 ? MX_ORDER[Math.min(r + 1 + Math.floor(rnd() * 2), 19)] : actual;
  }
  if (level === "easy") return legal[Math.floor(rnd() * Math.min(5, legal.length))];
  const step = level === "hard" && rnd() < 0.3 ? 1 : 0;
  return legal[Math.min(step, legal.length - 1)];
}

/* =================== Montagsmaler =================== */
export const DR_WORDS = [
  "Apfel", "Banane", "Birne", "Erdbeere", "Ananas", "Kirsche", "Karotte", "Pilz", "Brezel", "Pizza", "Eis", "Torte", "Kaffee", "Spiegelei", "Wurst",
  "Hund", "Katze", "Maus", "Elefant", "Giraffe", "Schlange", "Pinguin", "Eule", "Fisch", "Hai", "Krake", "Schnecke", "Spinne", "Biene", "Schmetterling",
  "Igel", "Hase", "Pferd", "Kuh", "Schwein", "Frosch", "Krokodil", "Dinosaurier", "Drache", "Einhorn", "Wolf", "Fuchs", "Bär", "Affe", "Löwe",
  "Haus", "Burg", "Kirche", "Leuchtturm", "Brücke", "Zelt", "Iglu", "Windmühle", "Pyramide", "Hochhaus",
  "Auto", "Fahrrad", "Bus", "Zug", "Flugzeug", "Hubschrauber", "Rakete", "Schiff", "U-Boot", "Traktor", "Feuerwehr", "Roller", "Skateboard",
  "Sonne", "Mond", "Stern", "Wolke", "Regenbogen", "Blitz", "Schneemann", "Vulkan", "Berg", "Insel", "Baum", "Blume", "Kaktus", "Palme", "Tannenbaum",
  "Brille", "Hut", "Krone", "Schuh", "Socke", "Regenschirm", "Rucksack", "Uhr", "Schlüssel", "Schere", "Hammer", "Leiter", "Kerze", "Glühbirne",
  "Telefon", "Fernseher", "Computer", "Kamera", "Gitarre", "Trommel", "Klavier", "Trompete", "Ball", "Fußball", "Tor", "Pokal", "Medaille",
  "Würfel", "Drachen", "Luftballon", "Geschenk", "Kuchen", "Zauberer", "Pirat", "Ritter", "Roboter", "Gespenst", "Vampir", "Hexe", "Werwolf",
  "Feuer", "Anker", "Herz", "Schatzkiste", "Bett", "Stuhl", "Badewanne", "Toilette", "Zahnbürste", "Buch", "Brief", "Ampel", "Bank", "Briefkasten",
  "Schaukel", "Rutsche", "Sandburg", "Muschel", "Qualle", "Seestern", "Wal", "Delfin", "Papagei", "Flamingo", "Kamel", "Känguru", "Zebra", "Nashorn",
];
export const DR_COLORS = ["#172036", "#e23b3b", "#2d6be0", "#179e5e", "#f2b705", "#8a5a2b", "#e0658f", "#ffffff"];
export const DR_WIDTHS = [6, 14, 30, 60];
const DR_CHOOSE_MS = 15000;
const DR_REVEAL_MS = 7000;
const DR_MAX_POINTS = 60000;

const normWord = (t) =>
  String(t || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // vertauschte Nachbarbuchstaben („Elefnat“) zählen als ein Fehler
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[m][n];
}
function pick(arr, n, avoid = []) {
  const pool = arr.filter((x) => !avoid.includes(x));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

export const extraMethods = {
  /* ---------- Mäxchen ---------- */
  mxStart() {
    const s = this.s;
    const order = this.playersArr().map((p) => p.id);
    const lives = Object.fromEntries(order.map((id) => [id, s.settings.lives]));
    s.mx = { order, lives, cur: order[Math.floor(Math.random() * order.length)], step: "decide", prev: null, dice: null, reveal: null, log: [], out: [], winner: null, rollId: 0 };
    for (const id of order) s.players[id].score = 0;
    s.phase = "PLAYING";
    s.endsAt = null;
    this.mxLog(`${s.players[s.mx.cur].name} fängt an.`);
  },
  mxLog(t) {
    const mx = this.s.mx;
    mx.log.push(t);
    if (mx.log.length > 30) mx.log.shift();
  },
  mxAlive() {
    const { mx, players } = this.s;
    return mx.order.filter((id) => mx.lives[id] > 0 && players[id]);
  },
  mxNext(id) {
    const mx = this.s.mx;
    const alive = new Set(this.mxAlive());
    const i = mx.order.indexOf(id);
    for (let k = 1; k <= mx.order.length; k++) {
      const c = mx.order[(i + k) % mx.order.length];
      if (alive.has(c)) return c;
    }
    return id;
  },
  mxName(id) {
    return this.s.players[id]?.name || "?";
  },
  mxRoll() {
    const mx = this.s.mx;
    mx.dice = [d6(), d6()];
    mx.step = "rolled";
    mx.rollId++;
  },
  mxSay(pid, value) {
    const mx = this.s.mx;
    const v = Number(value);
    if (!MX_ORDER.includes(v)) throw new Error("Ungültige Ansage.");
    if (mx.prev && mxRank(v) <= mxRank(mx.prev.value)) throw new Error(`Du musst mehr als ${mxLabel(mx.prev.value)} ansagen.`);
    mx.prev = { value: v, by: pid, dice: mx.dice };
    this.mxLog(`${this.mxName(pid)} sagt ${mxLabel(v)}.`);
    mx.dice = null;
    mx.cur = this.mxNext(pid);
    mx.step = "decide";
  },
  mxReveal(pid) {
    const mx = this.s.mx;
    const prev = mx.prev;
    const actual = mxValue(prev.dice);
    const truth = mxRank(actual) >= mxRank(prev.value);
    const loser = truth ? pid : prev.by;
    const amount = prev.value === 21 ? 2 : 1;
    mx.step = "reveal";
    mx.reveal = { dice: prev.dice, actual, said: prev.value, truth, loser, amount, by: prev.by, who: pid };
    this.mxLog(`${this.mxName(pid)} deckt auf: ${mxLabel(actual)}, angesagt war ${mxLabel(prev.value)} – ${truth ? "stimmt" : "gelogen"}!`);
    this.s.endsAt = Date.now() + REVEAL_MS;
  },
  mxLose(id, n) {
    const s = this.s;
    const mx = s.mx;
    mx.lives[id] = Math.max(0, (mx.lives[id] || 0) - n);
    this.mxLog(`${this.mxName(id)} verliert ${n === 2 ? "zwei Deckel" : "einen Deckel"}${mx.lives[id] ? "" : " und ist raus"}.`);
    if (!mx.lives[id] && !mx.out.includes(id)) mx.out.push(id);
    mx.prev = null;
    mx.reveal = null;
    mx.dice = null;
    s.endsAt = null;
    this.mxCheckEnd(mx.lives[id] ? id : this.mxNext(id));
  },
  mxCheckEnd(nextCur) {
    const s = this.s;
    const mx = s.mx;
    const alive = this.mxAlive();
    if (alive.length <= 1) {
      mx.winner = alive[0] || null;
      mx.step = "over";
      s.phase = "END";
      s.endsAt = null;
      // Punkte = Platzierung (wer zuletzt rausfliegt, bekommt mehr)
      mx.out.forEach((id, i) => { if (s.players[id]) s.players[id].score = i + 1; });
      if (mx.winner && s.players[mx.winner]) s.players[mx.winner].score = mx.order.length;
      return;
    }
    mx.cur = nextCur;
    mx.step = "decide";
  },
  // Spielleitung überspringt eine Person, die nicht reagiert
  mxSkip() {
    const mx = this.s.mx;
    const pid = mx.cur;
    if (mx.step === "reveal") return this.mxLose(mx.reveal.loser, mx.reveal.amount);
    if (mx.step === "decide") {
      if (mx.prev) return this.mxReveal(pid);
      this.mxRoll();
    }
    if (mx.step === "rolled") {
      const actual = mxValue(mx.dice);
      const min = mx.prev ? mxRank(mx.prev.value) + 1 : 0;
      this.mxSay(pid, mxRank(actual) >= min ? actual : MX_ORDER[Math.min(min, MX_ORDER.length - 1)]);
    }
  },
  mxRemove(id) {
    const s = this.s;
    const mx = s.mx;
    if (!mx || s.phase !== "PLAYING" || !mx.order.includes(id)) return;
    mx.lives[id] = 0;
    if (mx.cur === id || mx.prev?.by === id) {
      mx.prev = null;
      mx.reveal = null;
      mx.dice = null;
      s.endsAt = null;
    }
    this.mxCheckEnd(mx.cur === id ? this.mxNext(id) : mx.cur);
  },
  // Ist ein Computer dran, plant persist() seinen Zug ein (kleine Denkpause)
  mxBotPlan() {
    const s = this.s;
    const mx = s.mx;
    if (!mx || s.phase !== "PLAYING" || mx.step === "reveal" || mx.step === "over") { if (mx) mx.botAt = null; return; }
    const p = s.players[mx.cur];
    if (!p?.bot) { mx.botAt = null; return; }
    if (!mx.botAt) mx.botAt = Date.now() + (mx.step === "rolled" ? 1100 : 1300) + Math.floor(Math.random() * 700);
  },
  mxBotStep() {
    const s = this.s;
    const mx = s.mx;
    if (!mx || s.phase !== "PLAYING") return;
    const pid = mx.cur;
    if (!s.players[pid]?.bot) return;
    const lvl = s.settings.botLevel || "medium";
    if (mx.step === "decide") {
      if (!mx.prev) return this.mxAct(pid, { action: "roll" });
      return this.mxAct(pid, { action: mxBotDoubt(mx.prev.value, lvl) ? "reveal" : "believe" });
    }
    if (mx.step === "rolled") this.mxAct(pid, { action: "say", value: mxBotSay(mx.dice, mx.prev?.value, lvl) });
  },
  mxView(playerId) {
    const mx = this.s.mx;
    if (!mx) return null;
    return {
      order: mx.order.filter((id) => this.s.players[id]),
      lives: mx.lives,
      maxLives: this.s.settings.lives,
      cur: mx.cur,
      step: mx.step,
      prev: mx.prev ? { value: mx.prev.value, by: mx.prev.by, label: mxLabel(mx.prev.value) } : null,
      reveal: mx.reveal ? { ...mx.reveal, actualLabel: mxLabel(mx.reveal.actual), saidLabel: mxLabel(mx.reveal.said) } : null,
      log: mx.log.slice(-8),
      winner: mx.winner,
      rollId: mx.rollId,
      myDice: playerId && playerId === mx.cur && mx.step === "rolled" ? mx.dice : null,
      ladder: MX_ORDER.map((v) => ({ v, label: mxLabel(v) })),
    };
  },
  mxAct(pid, { action, value }) {
    const s = this.s;
    const mx = s.mx;
    if (s.game !== "maexchen" || s.phase !== "PLAYING" || !mx) throw new Error("Gerade läuft kein Mäxchen.");
    if (mx.cur !== pid) throw new Error("Du bist nicht dran.");
    if (action === "roll") {
      if (mx.step !== "decide" || mx.prev) throw new Error("Jetzt nicht.");
      this.mxRoll();
    } else if (action === "believe") {
      if (mx.step !== "decide" || !mx.prev) throw new Error("Jetzt nicht.");
      if (mx.prev.value === 21) {
        this.mxLog(`${this.mxName(pid)} glaubt das Mäxchen und gibt auf.`);
        return this.mxLose(pid, 1);
      }
      this.mxLog(`${this.mxName(pid)} glaubt es.`);
      this.mxRoll();
    } else if (action === "reveal") {
      if (mx.step !== "decide" || !mx.prev) throw new Error("Es gibt nichts aufzudecken.");
      this.mxReveal(pid);
    } else if (action === "say") {
      if (mx.step !== "rolled") throw new Error("Erst würfeln.");
      this.mxSay(pid, value);
    } else throw new Error("Unbekannte Aktion.");
  },

  /* ---------- Montagsmaler ---------- */
  drStart() {
    const s = this.s;
    const order = this.playersArr().map((p) => p.id).sort(() => Math.random() - 0.5);
    const seq = [];
    for (let r = 0; r < s.settings.rounds; r++) seq.push(...order);
    s.dr = { seq, perRound: order.length, idx: -1, drawer: null, word: null, choices: [], used: [], strokes: [], rev: 0, guessed: {}, feed: [], hints: [], hintTimes: [], total: 0, last: null };
    for (const p of this.playersArr()) p.score = 0;
    this.drNextTurn();
  },
  drNextTurn() {
    const s = this.s;
    const dr = s.dr;
    do dr.idx++;
    while (dr.idx < dr.seq.length && !s.players[dr.seq[dr.idx]]);
    if (dr.idx >= dr.seq.length || this.playersArr().length < 2) {
      s.phase = "END";
      s.endsAt = null;
      return;
    }
    dr.drawer = dr.seq[dr.idx];
    dr.choices = this.drPickWords(dr.used);
    dr.word = null;
    dr.strokes = [];
    dr.rev++;
    dr.guessed = {};
    dr.feed = [];
    dr.hints = [];
    dr.hintTimes = [];
    dr.last = null;
    s.round = Math.floor(dr.idx / dr.perRound) + 1;
    s.phase = "CHOOSE";
    dr.total = DR_CHOOSE_MS;
    s.endsAt = Date.now() + DR_CHOOSE_MS;
  },
  drPickWords(used) {
    const st = this.s.settings;
    const own = (st.words || []).filter((w) => !used.includes(w));
    if (st.wordMode === "only" && own.length >= 3) return pick(own, 3);
    if (st.wordMode !== "off" && own.length) {
      const mine = pick(own, Math.min(own.length, st.wordMode === "only" ? 3 : 1 + Math.floor(Math.random() * 2)));
      return [...mine, ...pick(DR_WORDS, 3 - mine.length, [...used, ...mine])].sort(() => Math.random() - 0.5);
    }
    return pick(DR_WORDS, 3, used);
  },
  drChoose(i) {
    const s = this.s;
    const dr = s.dr;
    const w = dr.choices[i] ?? dr.choices[0];
    dr.word = w;
    dr.used.push(w);
    const T = s.settings.seconds * 1000;
    const now = Date.now();
    dr.total = T;
    s.endsAt = now + T;
    dr.hintTimes = [now + T * 0.5, now + T * 0.75];
    s.phase = "DRAW";
  },
  drHint() {
    const dr = this.s.dr;
    const free = [...dr.word].map((c, i) => (/[A-Za-zÄÖÜäöüß]/.test(c) && !dr.hints.includes(i) ? i : -1)).filter((i) => i >= 0);
    // mindestens zwei Buchstaben bleiben verdeckt
    if (free.length > 2) dr.hints.push(free[Math.floor(Math.random() * free.length)]);
  },
  drEndTurn(reason) {
    const s = this.s;
    const dr = s.dr;
    // Bild für die Galerie „Bilder des Abends“ getrennt speichern (persist schreibt es)
    if (dr.strokes.length && dr.word) {
      s.gallery ||= [];
      const key = `img:${s.runId || 0}-${dr.idx}-${Date.now().toString(36)}`;
      s.gallery.push({ key, word: dr.word, drawer: s.players[dr.drawer]?.name || "?" });
      (this.pendingImgs ||= []).push([key, dr.strokes]);
      while (s.gallery.length > 40) (this.dropImgs ||= []).push(s.gallery.shift().key);
    }
    dr.last = { word: dr.word, reason, guessed: Object.keys(dr.guessed).length };
    s.phase = "REVEAL";
    dr.total = DR_REVEAL_MS;
    s.endsAt = Date.now() + DR_REVEAL_MS;
    dr.hintTimes = [];
  },
  drTick(now) {
    const s = this.s;
    const dr = s.dr;
    if (!dr) return false;
    let changed = false;
    if (s.phase === "DRAW") {
      while (dr.hintTimes.length && now >= dr.hintTimes[0]) {
        dr.hintTimes.shift();
        this.drHint();
        changed = true;
      }
    }
    if (s.endsAt && now >= s.endsAt) {
      if (s.phase === "CHOOSE") this.drChoose(Math.floor(Math.random() * 3));
      else if (s.phase === "DRAW") this.drEndTurn("time");
      else if (s.phase === "REVEAL") this.drNextTurn();
      changed = true;
    }
    return changed;
  },
  drGuessersLeft() {
    const s = this.s;
    const dr = s.dr;
    return this.online().filter((p) => p.id !== dr.drawer && !dr.guessed[p.id]);
  },
  drGuess(pid, text) {
    const s = this.s;
    const dr = s.dr;
    if (s.game !== "draw" || s.phase !== "DRAW") throw new Error("Gerade wird nicht geraten.");
    if (pid === dr.drawer) throw new Error("Du zeichnest gerade.");
    if (dr.guessed[pid]) return { already: true };
    const raw = String(text || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!raw) throw new Error("Bitte etwas eingeben.");
    const g = normWord(raw);
    const w = normWord(dr.word);
    const name = s.players[pid].name;
    if (g === w) {
      const left = Math.max(0, s.endsAt - Date.now());
      const pts = 5 + Math.round((10 * left) / dr.total) + (Object.keys(dr.guessed).length === 0 ? 3 : 0);
      dr.guessed[pid] = pts;
      s.players[pid].score = (s.players[pid].score || 0) + pts;
      if (s.players[dr.drawer]) s.players[dr.drawer].score = (s.players[dr.drawer].score || 0) + 4;
      dr.feed.push({ n: name, ok: true, pts });
      if (dr.feed.length > 40) dr.feed.shift();
      if (!this.drGuessersLeft().length) this.drEndTurn("all");
      return { correct: true, pts };
    }
    const close = w.length >= 4 && lev(g, w) <= 1;
    if (!close) {
      dr.feed.push({ n: name, t: raw });
      if (dr.feed.length > 40) dr.feed.shift();
    }
    return { close };
  },
  drView(playerId) {
    const s = this.s;
    const dr = s.dr;
    if (!dr) return null;
    const knows = s.phase === "REVEAL" || playerId == null ? s.phase === "REVEAL" : playerId === dr.drawer || !!dr.guessed[playerId];
    const word = dr.word || "";
    return {
      drawer: dr.drawer,
      inkRev: dr.rev,
      choices: playerId && playerId === dr.drawer && s.phase === "CHOOSE" ? dr.choices : null,
      word: knows ? word : null,
      mask: word ? [...word].map((c, i) => (/[A-Za-zÄÖÜäöüß]/.test(c) ? (dr.hints.includes(i) ? c : "_") : c)) : null,
      guessed: Object.keys(dr.guessed),
      gotPts: playerId ? dr.guessed[playerId] || null : null,
      feed: dr.feed.slice(-14),
      last: dr.last,
      turn: dr.idx + 1,
      turns: dr.seq.length,
      colors: DR_COLORS,
      widths: DR_WIDTHS,
    };
  },
  drInk(pid, { sid, c, w, pts, rev }) {
    const s = this.s;
    const dr = s.dr;
    if (s.game !== "draw" || s.phase !== "DRAW" || dr.drawer !== pid) throw new Error("Du zeichnest gerade nicht.");
    if (rev !== dr.rev) return null;
    if (!DR_COLORS.includes(c) || !DR_WIDTHS.includes(w)) throw new Error("Ungültiger Stift.");
    if (!Array.isArray(pts) || pts.length % 2 || pts.length > 600) throw new Error("Ungültige Linie.");
    const clean = pts.map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0))));
    const total = dr.strokes.reduce((a, st) => a + st.p.length, 0);
    if (total + clean.length > DR_MAX_POINTS) throw new Error("Das Bild ist voll – lösch etwas.");
    const id = String(sid || "").slice(0, 24);
    const last = dr.strokes[dr.strokes.length - 1];
    if (last && last.sid === id) last.p.push(...clean);
    else dr.strokes.push({ sid: id, c, w, p: clean });
    return { sid: id, c, w, pts: clean, rev };
  },
};
