// Spieleabend: Standard-Einstellungen je Spiel, Platzierungen, Abendwertung und Titel.
// Reine Logik ohne Cloudflare-Abhängigkeit (testbar mit node --test).

export function defaultSettings(game) {
  if (game === "wwe") return { rounds: 10, seconds: 25 };
  if (game === "kniffel") return { rounds: 13 };
  if (game === "maexchen") return { lives: 3, botLevel: "medium" };
  if (game === "draw") return { rounds: 2, seconds: 80, words: [], wordMode: "mix" };
  return { rounds: 5, seconds: 90, categories: ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"] };
}

// Abendpunkte nach Platzierung – so zählt jedes Spiel gleich viel
export const EVENING_POINTS = [10, 7, 5, 3, 2];
export const TITLES = {
  wwe: "Gesprächsthema des Abends",
  slf: "Wortakrobat",
  kniffel: "Würfelkönig",
  maexchen: "Bluff-Profi",
  draw: "Picasso des Abends",
};
/** Plätze aus Punkten (Gleichstand = gleicher Platz) und Abendpunkte. */
export function placements(list) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  let place = 0, last = null;
  return sorted.map((p, i) => {
    if (p.score !== last) { place = i + 1; last = p.score; }
    return { ...p, place, pts: EVENING_POINTS[place - 1] ?? 1 };
  });
}
/** Abendtabelle und Titel aus der Liste der gespielten Runden. */
export function eveningSummary(evening) {
  const table = {};
  for (const run of evening.played) {
    for (const r of run.results) {
      const t = (table[r.id] ||= { id: r.id, name: r.name, points: 0, games: 0, wins: 0 });
      t.name = r.name;
      t.points += r.pts;
      t.games++;
      if (r.place === 1) t.wins++;
    }
  }
  const ranking = Object.values(table).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, "de"));
  const titles = [];
  for (const g of Object.keys(TITLES)) {
    const runs = evening.played.filter((r) => r.game === g);
    if (!runs.length) continue;
    const wins = {};
    for (const run of runs) for (const r of run.results) if (r.place === 1) wins[r.id] = (wins[r.id] || 0) + 1;
    const best = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    if (best) titles.push({ game: g, title: TITLES[g], name: table[best[0]]?.name || "?", times: best[1] });
  }
  return { ranking, titles, played: evening.played.map((r) => ({ game: r.game, name: r.name, winner: r.results.find((x) => x.place === 1)?.name || null })) };
}
