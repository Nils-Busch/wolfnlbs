// Reine Turnierlogik – unverändert aus dem ursprünglichen Projekt übernommen,
// nur als ES-Modul statt CommonJS (sonst 1:1 identisch, keine DB-Abhängigkeit).
'use strict';

/** Jeder gegen jeden (Kreisverfahren). Liefert [{round, a, b}] ohne Freilos-Spiele. */
export function roundRobin(ids) {
  const list = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a !== null && b !== null) out.push({ round: r + 1, a: r % 2 ? b : a, b: r % 2 ? a : b });
    }
    list.splice(1, 0, list.pop());
  }
  return out;
}

/** Setzpositionen im KO-Baum, z.B. 8 -> [1,8,4,5,2,7,3,6] */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2 + 1;
    order = order.flatMap(s => [s, m - s]);
  }
  return order;
}

export function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

/** Exakte Zweierpotenz, benötigt für den Doppel-K.-o. (Verliererbaum) ohne Freilos-Sonderfälle. */
export function isPow2(n) { return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0; }

/** Verteilt sortierte Spieler per Schlangenlinie auf Gruppen. */
export function snakeGroups(sortedIds, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  sortedIds.forEach((id, i) => {
    const row = Math.floor(i / groupCount), col = i % groupCount;
    groups[row % 2 ? groupCount - 1 - col : col].push(id);
  });
  return groups;
}

/**
 * Prüft Satzergebnisse nach Tischtennisregeln (Satz bis 11, 2 Punkte Abstand).
 * Liefert {ok:true, winner:1|2} oder {ok:false, error}.
 */
export function validateSets(sets, bestOf) {
  if (!Array.isArray(sets) || sets.length === 0) return { ok: false, error: 'Keine Sätze angegeben.' };
  const need = (bestOf + 1) / 2;
  let w1 = 0, w2 = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (!Array.isArray(s) || s.length !== 2 || !s.every(x => Number.isInteger(x) && x >= 0 && x <= 99))
      return { ok: false, error: `Satz ${i + 1}: ungültige Eingabe.` };
    if (w1 === need || w2 === need) return { ok: false, error: `Satz ${i + 1}: Spiel war bereits entschieden.` };
    const [a, b] = s, hi = Math.max(a, b), diff = Math.abs(a - b);
    if (hi < 11 || diff < 2 || (hi > 11 && diff !== 2))
      return { ok: false, error: `Satz ${i + 1} (${a}:${b}) ist kein gültiges Satzergebnis.` };
    a > b ? w1++ : w2++;
  }
  if (w1 !== need && w2 !== need) {
    const mode = bestOf === 1 ? 'Das Einzelspiel ist' : `Best of ${bestOf} braucht ${need} Gewinnsätze – das Spiel ist`;
    return { ok: false, error: `${mode} noch nicht entschieden.` };
  }
  return { ok: true, winner: w1 === need ? 1 : 2 };
}

/**
 * Tabelle einer Gruppe. Sieg 2 Punkte, Niederlage 1 Punkt (TT-Zählweise).
 * Sortierung: Punkte, Satzdifferenz, Balldifferenz, direkter Vergleich (bei 2 Gleichen), Name.
 */
export function standings(playerIds, matches, playerNames = {}) {
  const row = id => ({ player_id: id, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, ballsFor: 0, ballsAgainst: 0, points: 0 });
  const t = new Map(playerIds.map(id => [id, row(id)]));
  const done = matches.filter(m => m.status === 'done');
  for (const m of done) {
    const p1 = t.get(m.player1_id), p2 = t.get(m.player2_id);
    if (!p1 || !p2) continue;
    for (const [a, b] of m.sets) {
      p1.ballsFor += a; p1.ballsAgainst += b; p2.ballsFor += b; p2.ballsAgainst += a;
      if (a > b) { p1.setsFor++; p2.setsAgainst++; } else { p2.setsFor++; p1.setsAgainst++; }
    }
    p1.played++; p2.played++;
    const [win, lose] = m.winner_id === m.player1_id ? [p1, p2] : [p2, p1];
    win.won++; win.points += 2; lose.lost++; lose.points += 1;
  }
  const h2h = (a, b) => {
    const m = done.find(x => (x.player1_id === a && x.player2_id === b) || (x.player1_id === b && x.player2_id === a));
    return m ? (m.winner_id === a ? -1 : 1) : 0;
  };
  return [...t.values()].sort((x, y) =>
    (y.points - x.points) ||
    ((y.setsFor - y.setsAgainst) - (x.setsFor - x.setsAgainst)) ||
    ((y.ballsFor - y.ballsAgainst) - (x.ballsFor - x.ballsAgainst)) ||
    h2h(x.player_id, y.player_id) ||
    String(playerNames[x.player_id] || '').localeCompare(String(playerNames[y.player_id] || ''), 'de'));
}

/**
 * Setzliste für die KO-Phase aus Gruppen-Qualifikanten.
 * ranked[g] = [Erster, Zweiter, …] der Gruppe g. Gruppensieger bekommen die oberen Setzplätze
 * (und damit ggf. Freilose); jeder weitere Qualifikant wird so gesetzt, dass er Spielern
 * aus der eigenen Gruppe so spät wie möglich begegnet.
 */
export function koSeedingFromGroups(ranked) {
  const total = ranked.reduce((n, g) => n + g.length, 0);
  const size = Math.max(2, nextPow2(total));
  const pos = {};
  seedOrder(size).forEach((seed, i) => { pos[seed] = i; });
  const meet = (a, b) => Math.floor(Math.log2(pos[a] ^ pos[b])) + 1;
  const seeds = [];
  const placed = ranked.map(() => []);
  let next = 1;
  const maxRank = Math.max(...ranked.map(g => g.length));
  for (let r = 0; r < maxRank; r++) {
    const groups = ranked.map((g, i) => i).filter(i => ranked[i][r] !== undefined);
    const free = groups.map((_, k) => next + k);
    next += groups.length;
    for (const g of groups) {
      let best = free[0], bestScore = -1;
      for (const s of free) {
        const score = placed[g].length ? Math.min(...placed[g].map(o => meet(s, o))) : 0;
        if (score > bestScore) { best = s; bestScore = score; }
      }
      free.splice(free.indexOf(best), 1);
      placed[g].push(best);
      seeds[best - 1] = ranked[g][r];
    }
  }
  return seeds;
}

/** Rundenname im KO-Baum anhand der Spiele in der Runde. */
export function koRoundName(matchesInRound) {
  return { 1: 'Finale', 2: 'Halbfinale', 4: 'Viertelfinale', 8: 'Achtelfinale' }[matchesInRound] || `Runde der letzten ${matchesInRound * 2}`;
}

/* =========================================================================
   Fußball
   ========================================================================= */

/**
 * Prüft ein Fußball-Ergebnis. goals = [Tore links, Tore rechts].
 * In der K.-o.-Runde braucht ein Unentschieden ein Elfmeterschießen (penalties).
 * Liefert {ok:true, winner: 1|2|0 (0 = Unentschieden), penalties: [a,b]|null} oder {ok:false, error}.
 */
export function validateFootball(goals, penalties, isKo) {
  const okNum = (x) => Number.isInteger(x) && x >= 0 && x <= 99;
  if (!Array.isArray(goals) || goals.length !== 2 || !goals.every(okNum)) return { ok: false, error: 'Bitte die Tore beider Teams eintragen (0–99).' };
  const [a, b] = goals;
  if (a !== b) return { ok: true, winner: a > b ? 1 : 2, penalties: null };
  if (!isKo) return { ok: true, winner: 0, penalties: null };
  if (!Array.isArray(penalties) || penalties.length !== 2 || !penalties.every(okNum))
    return { ok: false, error: 'Unentschieden in der K.-o.-Runde: Bitte das Ergebnis des Elfmeterschießens eintragen.' };
  if (penalties[0] === penalties[1]) return { ok: false, error: 'Das Elfmeterschießen braucht einen Sieger.' };
  return { ok: true, winner: penalties[0] > penalties[1] ? 1 : 2, penalties };
}

/**
 * Torschützen säubern: [{side:1|2, name, goals}] – gleiche Namen pro Seite werden
 * zusammengefasst. Mehr Torschützen-Tore als echte Tore sind nicht erlaubt.
 */
export function normalizeScorers(raw, goals) {
  if (raw == null) return { ok: true, scorers: [] };
  if (!Array.isArray(raw) || raw.length > 200) return { ok: false, error: 'Ungültige Torschützen.' };
  const map = new Map();
  for (const s of raw) {
    const side = Number(s?.side);
    const name = typeof s?.name === 'string' ? s.name.trim().slice(0, 80) : '';
    const n = s?.goals === undefined ? 1 : Number(s.goals);
    if (!name) continue;
    if (side !== 1 && side !== 2) return { ok: false, error: 'Ungültige Torschützen.' };
    if (!Number.isInteger(n) || n < 1 || n > 20) return { ok: false, error: 'Ungültige Toranzahl bei einem Torschützen.' };
    const key = `${side}|${name.toLowerCase()}`;
    const cur = map.get(key);
    if (cur) cur.goals += n; else map.set(key, { side, name, goals: n });
  }
  const scorers = [...map.values()];
  for (const side of [1, 2]) {
    const sum = scorers.filter((x) => x.side === side).reduce((t, x) => t + x.goals, 0);
    if (sum > goals[side - 1]) return { ok: false, error: `Mehr Torschützen als Tore beim ${side === 1 ? 'linken' : 'rechten'} Team.` };
  }
  return { ok: true, scorers };
}

/**
 * Fußball-Tabelle: Sieg 3, Unentschieden 1, Niederlage 0 Punkte.
 * Sortierung: Punkte, Tordifferenz, erzielte Tore, direkter Vergleich, Name.
 */
export function footballStandings(playerIds, matches, playerNames = {}) {
  const row = (id) => ({ player_id: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
  const t = new Map(playerIds.map((id) => [id, row(id)]));
  const done = matches.filter((m) => m.status === 'done' && m.sets && m.sets[0]);
  for (const m of done) {
    const p1 = t.get(m.player1_id), p2 = t.get(m.player2_id);
    if (!p1 || !p2) continue;
    const [a, b] = m.sets[0];
    p1.played++; p2.played++;
    p1.goalsFor += a; p1.goalsAgainst += b; p2.goalsFor += b; p2.goalsAgainst += a;
    if (a > b) { p1.won++; p1.points += 3; p2.lost++; }
    else if (b > a) { p2.won++; p2.points += 3; p1.lost++; }
    else { p1.drawn++; p2.drawn++; p1.points++; p2.points++; }
  }
  const h2h = (x, y) => {
    let px = 0, py = 0;
    for (const m of done) {
      if (!((m.player1_id === x && m.player2_id === y) || (m.player1_id === y && m.player2_id === x))) continue;
      const [a, b] = m.sets[0];
      const gx = m.player1_id === x ? a : b, gy = m.player1_id === x ? b : a;
      if (gx > gy) px += 3; else if (gy > gx) py += 3; else { px++; py++; }
    }
    return py - px;
  };
  return [...t.values()].sort((x, y) =>
    (y.points - x.points) ||
    ((y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)) ||
    (y.goalsFor - x.goalsFor) ||
    h2h(x.player_id, y.player_id) ||
    String(playerNames[x.player_id] || '').localeCompare(String(playerNames[y.player_id] || ''), 'de'));
}

/** Torschützenliste über alle Spiele: [{name, team_id, goals}] absteigend. */
export function topScorers(matches) {
  const map = new Map();
  for (const m of matches) {
    if (m.status !== 'done') continue;
    for (const s of (m.extra && m.extra.scorers) || []) {
      const team = s.side === 1 ? m.player1_id : m.player2_id;
      const key = `${team}|${s.name.toLowerCase()}`;
      const cur = map.get(key);
      if (cur) cur.goals += s.goals; else map.set(key, { name: s.name, team_id: team, goals: s.goals });
    }
  }
  return [...map.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'de'));
}
