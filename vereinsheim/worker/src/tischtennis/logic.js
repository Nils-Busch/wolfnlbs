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
