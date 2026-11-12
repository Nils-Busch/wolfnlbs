// Teamspiele im PartyRoom: Team Rot (0) gegen Team Blau (1).
//
//  - Agentenrunde ("agent"): 25 Wörter liegen aus. Je Team kennt eine Person
//    (Funker) die Geheimkarte und gibt einen Hinweis aus einem Wort plus einer
//    Zahl. Das Team tippt Karten an: einmal tippen markiert, nochmal tippen
//    deckt auf. Wer zuerst alle eigenen Agenten findet, gewinnt die Partie –
//    wer den Doppelagenten aufdeckt, verliert sofort.
//  - Erklärbär ("explain"): Reihum erklärt eine Person ihrem Team Begriffe,
//    ohne die fünf verbotenen Wörter zu sagen. Das andere Team sieht die Karte
//    mit und drückt „Verboten!“, wenn eins fällt.
//
// Wie partyExtra.js: Die Methoden werden an PartyRoom gehängt (this = Raum).
// Die reinen Hilfsfunktionen sind exportiert und mit node --test prüfbar.

import { AG_WORDS, EX_CARDS } from "./teamWords.js";

export const TEAM_GAMES = new Set(["agent", "explain"]);
export const TEAM_NAMES = ["Rot", "Blau"];
const AG_SIZE = 25;

export const normWord = (t) =>
  String(t || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

export function shuffle(a, rnd = Math.random) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* =================== Teams =================== */

/** Behält bestehende Zuordnungen und verteilt alle anderen auf das kleinere Team. */
export function fillTeams(teams, ids, rnd = Math.random) {
  const out = {};
  for (const id of ids) if (teams?.[id] === 0 || teams?.[id] === 1) out[id] = teams[id];
  for (const id of shuffle(ids.filter((id) => !(id in out)), rnd)) {
    const vals = Object.values(out);
    const c0 = vals.filter((t) => t === 0).length;
    const c1 = vals.length - c0;
    out[id] = c0 < c1 ? 0 : c1 < c0 ? 1 : rnd() < 0.5 ? 0 : 1;
  }
  return out;
}

/** Neu gemischte, ausgeglichene Teams. */
export function shuffleTeams(ids, rnd = Math.random) {
  const start = rnd() < 0.5 ? 0 : 1;
  return Object.fromEntries(shuffle(ids, rnd).map((id, i) => [id, (i + start) % 2]));
}

/* =================== Agentenrunde: Hilfen =================== */

/**
 * Spielfeld: Das Startteam hat 9 Agenten, das andere 8, dazu 7 Passanten ("n")
 * und 1 Doppelagent ("x"). key[i] ist 0, 1, "n" oder "x".
 */
export function makeBoard(words, startTeam, rnd = Math.random) {
  if (words.length < AG_SIZE) throw new Error("Zu wenige Wörter für ein Spielfeld (mindestens 25).");
  const key = [...Array(9).fill(startTeam), ...Array(8).fill(1 - startTeam), ...Array(7).fill("n"), "x"];
  return { words: words.slice(0, AG_SIZE), key: shuffle(key, rnd) };
}

/** 25 Wörter wählen: eigene Wörter je nach Modus, möglichst keine schon benutzten. */
export function pickBoardWords({ own = [], mode = "mix", used = [] }, rnd = Math.random) {
  const fresh = (list) => {
    const f = list.filter((w) => !used.includes(w));
    return f.length >= AG_SIZE ? f : list;
  };
  const builtIn = shuffle(fresh(AG_WORDS), rnd);
  const mine = shuffle(fresh([...new Set(own)]), rnd);
  let words;
  if (mode === "only" && mine.length >= AG_SIZE) words = mine.slice(0, AG_SIZE);
  else if (mode === "off" || !mine.length) words = builtIn.slice(0, AG_SIZE);
  else {
    // gemischt: bis zu 10 eigene Wörter, Rest eingebaut (ohne Doppelte)
    const take = mode === "only" ? mine : mine.slice(0, 10);
    const seen = new Set(take.map(normWord));
    words = [...take, ...builtIn.filter((w) => !seen.has(normWord(w)))].slice(0, AG_SIZE);
  }
  return shuffle(words, rnd);
}

/** Prüft einen Hinweis. Ergebnis: Fehlermeldung oder null. */
export function clueProblem(word, n, board, open = []) {
  const w = String(word ?? "").trim();
  if (!w) return "Bitte einen Hinweis eingeben.";
  if (/\s/.test(w)) return "Nur ein einziges Wort als Hinweis.";
  if (w.length > 24) return "Der Hinweis ist zu lang.";
  if (!/^[\p{L}\p{N}-]+$/u.test(w)) return "Nur Buchstaben, Zahlen und Bindestrich.";
  const nw = normWord(w);
  for (let i = 0; i < board.length; i++) {
    if (open[i]) continue;
    const b = normWord(board[i]);
    const clash =
      nw === b ||
      (b.length >= 4 && (nw.startsWith(b) || nw.endsWith(b))) ||
      (nw.length >= 4 && (b.startsWith(nw) || b.endsWith(nw)));
    if (clash) return `„${w}“ steckt in „${board[i]}“ – such dir ein anderes Wort.`;
  }
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1 || num > 9) return "Bitte eine Zahl von 1 bis 9 wählen.";
  return null;
}

/* =================== Erklärbär: Hilfen =================== */

/** Eigene Karten: eine pro Zeile, „Begriff: verboten, verboten, …“. */
export function parseCards(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\n+/)) {
    const [t, rest = ""] = line.split(/[:|]/);
    const term = String(t || "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (term.length < 2 || seen.has(normWord(term))) continue;
    const f = rest.split(/[,;]/).map((x) => x.replace(/\s+/g, " ").trim().slice(0, 24)).filter(Boolean).slice(0, 6);
    seen.add(normWord(term));
    out.push({ t: term, f });
    if (out.length >= 200) break;
  }
  return out;
}
export const cardsText = (cards) => (cards || []).map((c) => (c.f.length ? `${c.t}: ${c.f.join(", ")}` : c.t)).join("\n");

/** Kartenstapel: eigene Karten werden (gemischt) regelmäßig eingestreut. */
export function buildDeck({ own = [], mode = "mix" }, rnd = Math.random) {
  const builtIn = shuffle(EX_CARDS, rnd);
  const mine = shuffle(own, rnd);
  if (mode === "only" && mine.length >= 5) return mine;
  if (mode === "off" || !mine.length) return builtIn;
  const out = [];
  let b = 0;
  for (let i = 0; i < mine.length; i++) {
    out.push(mine[i]);
    out.push(...builtIn.slice(b, b + 2));
    b += 2;
  }
  const seen = new Set(out.map((c) => normWord(c.t)));
  return [...out, ...builtIn.slice(b).filter((c) => !seen.has(normWord(c.t)))];
}

/* =================== Methoden am Raum =================== */
export const teamMethods = {
  /* ---------- Teams ---------- */
  tmIds() {
    return this.playersArr().filter((p) => !p.bot).map((p) => p.id);
  },
  tmSync() {
    this.s.teams = fillTeams(this.s.teams || {}, this.tmIds());
  },
  tmMembers(team) {
    return this.playersArr().filter((p) => this.s.teams?.[p.id] === team).map((p) => p.id);
  },
  tmCheck() {
    this.tmSync();
    if (this.tmMembers(0).length < 2 || this.tmMembers(1).length < 2) throw new Error("Jedes Team braucht mindestens 2 Personen.");
  },
  tmScores(scores) {
    for (const p of this.playersArr()) {
      const t = this.s.teams?.[p.id];
      p.score = t === 0 || t === 1 ? scores[t] : 0;
    }
  },
  tmSet(pid, team) {
    const s = this.s;
    if (!TEAM_GAMES.has(s.game)) throw new Error("Teams gibt es nur bei den Teamspielen.");
    if (!["LOBBY", "END"].includes(s.phase)) throw new Error("Teams lassen sich nur vor dem Spiel ändern.");
    if (team !== 0 && team !== 1) throw new Error("Unbekanntes Team.");
    if (!s.players[pid]) throw new Error("Spieler nicht gefunden.");
    this.tmSync();
    s.teams[pid] = team;
  },
  tmShuffle() {
    const s = this.s;
    if (!TEAM_GAMES.has(s.game) || !["LOBBY", "END"].includes(s.phase)) throw new Error("Teams lassen sich nur vor dem Spiel mischen.");
    s.teams = shuffleTeams(this.tmIds());
  },
  tmRemove(pid) {
    const s = this.s;
    if (s.teams) delete s.teams[pid];
    if (s.game === "agent") this.agRemove(pid);
    if (s.game === "explain") this.exRemove(pid);
  },
  tmTeamsView() {
    const s = this.s;
    return { teams: s.teams || {}, teamNames: TEAM_NAMES };
  },

  /* ---------- Agentenrunde ---------- */
  agStart() {
    const s = this.s;
    this.tmCheck();
    s.ag = { match: 0, wins: [0, 0], start: Math.random() < 0.5 ? 0 : 1, spyCount: {}, used: [] };
    this.tmScores([0, 0]);
    this.agBoard();
  },
  agBoard() {
    const s = this.s;
    const ag = s.ag;
    ag.match++;
    const words = pickBoardWords({ own: s.settings.words || [], mode: s.settings.wordMode || "mix", used: ag.used });
    const board = makeBoard(words, ag.start);
    Object.assign(ag, {
      words: board.words,
      key: board.key,
      open: Array(AG_SIZE).fill(false),
      by: Array(AG_SIZE).fill(null),
      turn: ag.start,
      step: "clue",
      clue: null,
      guesses: 0,
      marks: {},
      log: [],
      winner: null,
      reason: null,
    });
    ag.used = [...ag.used, ...board.words].slice(-200);
    ag.spy = [this.agPickSpy(0), this.agPickSpy(1)];
    s.phase = "PLAYING";
    s.round = ag.match;
    this.agTimer();
  },
  // Funker reihum: wer es am seltensten war, ist dran
  agPickSpy(team) {
    const ag = this.s.ag;
    const m = this.tmMembers(team);
    if (!m.length) return null;
    const min = Math.min(...m.map((id) => ag.spyCount[id] || 0));
    const cands = m.filter((id) => (ag.spyCount[id] || 0) === min);
    const id = cands[Math.floor(Math.random() * cands.length)];
    ag.spyCount[id] = (ag.spyCount[id] || 0) + 1;
    return id;
  },
  agTimer() {
    const s = this.s;
    s.endsAt = s.settings.seconds ? Date.now() + s.settings.seconds * 1000 : null;
  },
  agLeft(team) {
    const ag = this.s.ag;
    return ag.key.filter((k, i) => k === team && !ag.open[i]).length;
  },
  agClue(pid, word, n) {
    const s = this.s;
    const ag = s.ag;
    if (s.game !== "agent" || s.phase !== "PLAYING" || ag.step !== "clue") throw new Error("Gerade wird kein Hinweis gegeben.");
    if (ag.spy[ag.turn] !== pid) throw new Error("Nur der Funker des Teams am Zug gibt den Hinweis.");
    const err = clueProblem(word, n, ag.words, ag.open);
    if (err) throw new Error(err);
    ag.clue = { word: String(word).trim(), n: Number(n), team: ag.turn };
    ag.guesses = 0;
    ag.step = "guess";
    ag.marks = {};
    ag.log.push({ team: ag.turn, word: ag.clue.word, n: ag.clue.n, picks: [] });
    if (ag.log.length > 30) ag.log.shift();
    this.agTimer();
  },
  agGuesser(pid) {
    const s = this.s;
    const ag = s.ag;
    if (s.game !== "agent" || s.phase !== "PLAYING" || ag.step !== "guess") throw new Error("Gerade wird nicht geraten.");
    if (s.teams?.[pid] !== ag.turn) throw new Error("Dein Team ist gerade nicht dran.");
    if (ag.spy[ag.turn] === pid) throw new Error("Als Funker rätst du nicht mit.");
  },
  // Einmal tippen markiert die Karte fürs Team, nochmal tippen deckt sie auf.
  agTap(pid, index) {
    this.agGuesser(pid);
    const ag = this.s.ag;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= AG_SIZE || ag.open[i]) throw new Error("Diese Karte ist schon aufgedeckt.");
    if ((ag.marks[i] || []).includes(pid)) return this.agReveal(pid, i);
    for (const k of Object.keys(ag.marks)) {
      ag.marks[k] = ag.marks[k].filter((x) => x !== pid);
      if (!ag.marks[k].length) delete ag.marks[k];
    }
    ag.marks[i] = [...(ag.marks[i] || []), pid];
    return { marked: i };
  },
  agReveal(pid, i) {
    const s = this.s;
    const ag = s.ag;
    const k = ag.key[i];
    const team = ag.turn;
    ag.open[i] = true;
    ag.by[i] = s.players[pid]?.name || null;
    ag.marks = {};
    ag.guesses++;
    ag.log[ag.log.length - 1]?.picks.push({ w: ag.words[i], k });
    if (k === "x") this.agFinish(1 - team, "trap");
    else if (this.agLeft(team) === 0) this.agFinish(team, "all");
    else if (this.agLeft(1 - team) === 0) this.agFinish(1 - team, "all");
    else if (k !== team || ag.guesses >= ag.clue.n + 1) this.agEndTurn();
    return { revealed: k };
  },
  agPass(pid) {
    this.agGuesser(pid);
    if (this.s.ag.guesses < 1) throw new Error("Deckt erst mindestens eine Karte auf.");
    this.agEndTurn();
  },
  agEndTurn() {
    const ag = this.s.ag;
    ag.turn = 1 - ag.turn;
    ag.step = "clue";
    ag.clue = null;
    ag.guesses = 0;
    ag.marks = {};
    this.agTimer();
  },
  agFinish(winner, reason) {
    const s = this.s;
    const ag = s.ag;
    ag.winner = winner;
    ag.reason = reason;
    ag.wins[winner]++;
    ag.step = "over";
    ag.marks = {};
    s.endsAt = null;
    this.tmScores(ag.wins);
    s.phase = ag.match >= s.settings.rounds ? "END" : "BOARD";
  },
  agNext() {
    const s = this.s;
    const ag = s.ag;
    if (s.phase === "BOARD") {
      ag.start = 1 - ag.start;
      return this.agBoard();
    }
    if (s.phase === "PLAYING") {
      // Spielleitung: Zug beenden (z. B. wenn ein Funker nicht reagiert)
      if (ag.step === "clue") ag.log.push({ team: ag.turn, word: null, n: 0, picks: [] });
      this.agEndTurn();
    }
  },
  agTick(now) {
    const s = this.s;
    if (s.phase !== "PLAYING" || !s.endsAt || now < s.endsAt) return false;
    this.agNext();
    return true;
  },
  agRemove(pid) {
    const s = this.s;
    const ag = s.ag;
    if (!ag || !ag.spy) return;
    for (const k of Object.keys(ag.marks || {})) {
      ag.marks[k] = ag.marks[k].filter((x) => x !== pid);
      if (!ag.marks[k].length) delete ag.marks[k];
    }
    const t = ag.spy.indexOf(pid);
    if (t >= 0) {
      const m = this.tmMembers(t).filter((id) => id !== pid);
      ag.spy[t] = m.length ? m[Math.floor(Math.random() * m.length)] : null;
    }
  },
  agView(pid) {
    const s = this.s;
    const ag = s.ag;
    if (!ag || !ag.words) return null;
    const iSpy = !!pid && ag.spy.includes(pid);
    const showKey = iSpy || s.phase !== "PLAYING";
    const name = (id) => s.players[id]?.name || null;
    return {
      match: ag.match,
      rounds: s.settings.rounds,
      wins: ag.wins,
      turn: ag.turn,
      step: ag.step,
      clue: ag.clue,
      guesses: ag.guesses,
      left: [this.agLeft(0), this.agLeft(1)],
      winner: ag.winner,
      reason: ag.reason,
      spy: ag.spy,
      spyNames: ag.spy.map(name),
      iSpy,
      cards: ag.words.map((w, i) => ({
        w,
        k: ag.open[i] || showKey ? ag.key[i] : null,
        open: ag.open[i],
        by: ag.by[i],
        marks: (ag.marks[i] || []).map(name).filter(Boolean),
        mine: !!pid && (ag.marks[i] || []).includes(pid),
      })),
      log: ag.log.slice(-8),
    };
  },

  /* ---------- Erklärbär ---------- */
  exStart() {
    const s = this.s;
    this.tmCheck();
    s.ex = {
      order: [shuffle(this.tmMembers(0)), shuffle(this.tmMembers(1))],
      ptr: [0, 0],
      team: Math.random() < 0.5 ? 0 : 1,
      turnNo: 0,
      total: s.settings.rounds * 2,
      deck: buildDeck({ own: s.settings.cards || [], mode: s.settings.cardMode || "mix" }),
      pos: 0,
      log: [],
      scores: [0, 0],
      last: null,
      explainer: null,
    };
    this.tmScores([0, 0]);
    this.exReady();
  },
  exReady() {
    const s = this.s;
    const ex = s.ex;
    for (const t of [0, 1]) for (const id of this.tmMembers(t)) if (!ex.order[t].includes(id)) ex.order[t].push(id);
    const live = ex.order[ex.team].filter((id) => s.players[id] && s.teams?.[id] === ex.team);
    if (!live.length) {
      s.phase = "END";
      s.endsAt = null;
      return;
    }
    ex.explainer = live[ex.ptr[ex.team] % live.length];
    ex.log = [];
    s.phase = "READY";
    s.round = Math.floor(ex.turnNo / 2) + 1;
    s.endsAt = null;
  },
  exGo(pid, isHost) {
    const s = this.s;
    const ex = s.ex;
    if (s.game !== "explain" || s.phase !== "READY") throw new Error("Die Runde läuft schon.");
    if (pid !== ex.explainer && !isHost) throw new Error("Wer erklärt, startet die Runde.");
    s.phase = "PLAY";
    ex.log = [];
    s.endsAt = Date.now() + s.settings.seconds * 1000;
  },
  exMark(pid, result, pos) {
    const s = this.s;
    const ex = s.ex;
    if (s.game !== "explain" || s.phase !== "PLAY") throw new Error("Gerade läuft keine Erklärrunde.");
    if (Number(pos) !== ex.pos) return { stale: true }; // die Karte ist schon weiter
    if (result === "ok" || result === "skip") {
      if (pid !== ex.explainer) throw new Error("Das tippt nur, wer gerade erklärt.");
    } else if (result === "buzz") {
      if (s.teams?.[pid] !== 1 - ex.team) throw new Error("Auf verbotene Wörter achtet das andere Team.");
    } else throw new Error("Unbekannte Aktion.");
    ex.log.push({ t: ex.deck[ex.pos].t, r: result, by: result === "buzz" ? s.players[pid]?.name || null : null });
    if (result === "ok") ex.scores[ex.team]++;
    if (result === "buzz") ex.scores[ex.team]--;
    ex.pos++;
    if (ex.pos >= ex.deck.length) {
      ex.deck = buildDeck({ own: s.settings.cards || [], mode: s.settings.cardMode || "mix" });
      ex.pos = 0;
    }
    this.tmScores(ex.scores);
    return { result };
  },
  exEndTurn() {
    const s = this.s;
    const ex = s.ex;
    const pts = ex.log.reduce((a, l) => a + (l.r === "ok" ? 1 : l.r === "buzz" ? -1 : 0), 0);
    ex.last = { team: ex.team, name: s.players[ex.explainer]?.name || "?", log: ex.log.slice(), pts };
    ex.turnNo++;
    ex.ptr[ex.team]++;
    ex.team = 1 - ex.team;
    this.tmScores(ex.scores);
    if (ex.turnNo >= ex.total) {
      s.phase = "END";
      s.endsAt = null;
      return;
    }
    this.exReady();
  },
  exNext(isHostPid) {
    const s = this.s;
    if (s.phase === "READY") return this.exGo(isHostPid, true);
    if (s.phase === "PLAY") return this.exEndTurn();
  },
  exTick(now) {
    const s = this.s;
    if (s.phase !== "PLAY" || !s.endsAt || now < s.endsAt) return false;
    this.exEndTurn();
    return true;
  },
  exRemove(pid) {
    const s = this.s;
    const ex = s.ex;
    if (!ex || ex.explainer !== pid) return;
    if (s.phase === "PLAY") this.exEndTurn();
    else if (s.phase === "READY") this.exReady();
  },
  exView(pid) {
    const s = this.s;
    const ex = s.ex;
    if (!ex) return null;
    const seeCard = s.phase === "PLAY" && !!pid && (pid === ex.explainer || s.teams?.[pid] === 1 - ex.team);
    const c = ex.deck[ex.pos];
    return {
      team: ex.team,
      explainer: ex.explainer,
      explainerName: s.players[ex.explainer]?.name || null,
      turnNo: ex.turnNo,
      total: ex.total,
      scores: ex.scores,
      last: ex.last,
      log: ex.log,
      pos: ex.pos,
      card: seeCard && c ? { t: c.t, f: c.f } : null,
      iExplain: !!pid && pid === ex.explainer,
    };
  },
};
