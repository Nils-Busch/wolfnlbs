// Ewige Bestenliste der Tagesrätsel (Wordle, Städteraten, Nonogramm, Connections).
// Jede eingetragene Tageswertung landet als Zeile in D1; die Rangliste wird
// beim Abruf aus allen Zeilen berechnet. Pro Name, Rätsel und Tag zählt nur
// der erste Eintrag.
//
// Rätselpunkte (damit die drei Rätsel vergleichbar werden):
//   Wordle       (7 − Versuche) × 100      → 100 … 600
//   Städteraten  Punkte ÷ 10               →   0 … 500
//   Nonogramm    600 − Sekunden ÷ 2        → 100 … 600
//   Connections  600 − 100 × Fehler − Sekunden ÷ 6 (max. 100 Abzug) → 200 … 600
//
// Mit Konto eingetragene Ergebnisse gehören fest zum Konto (name_key "u:<id>");
// ohne Konto zählt der Name ("n:<name>").

let ready = false;

export const GAMES = ["wordle", "staedte", "nono", "conn"];

export function pointsFor(game, raw) {
  if (game === "wordle") return Math.max(0, (7 - raw) * 100);
  if (game === "staedte") return Math.round(raw / 10);
  if (game === "nono") return Math.max(100, Math.min(600, Math.round(600 - raw / 2)));
  if (game === "conn") {
    const mistakes = Math.floor(raw / 10000), secs = raw % 10000;
    return Math.max(200, 600 - 100 * mistakes - Math.min(100, Math.round(secs / 6)));
  }
  return 0;
}

async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS daily_results (
      name_key   TEXT NOT NULL,
      name       TEXT NOT NULL,
      game       TEXT NOT NULL,
      date       TEXT NOT NULL,
      raw        INTEGER NOT NULL,
      points     INTEGER NOT NULL,
      user_id    INTEGER,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (name_key, game, date)
    )`
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_results(date)").run();
  // Ältere Tabelle ohne Konto-Spalte nachrüsten
  const cols = await env.DB.prepare("PRAGMA table_info(daily_results)").all();
  if (!cols.results.some((c) => c.name === "user_id")) {
    await env.DB.prepare("ALTER TABLE daily_results ADD COLUMN user_id INTEGER").run();
  }
  ready = true;
}

const nameKey = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

// date: "JJJJ-MM-TT". Fehler beim Speichern dürfen das eigentliche Eintragen nie stören.
export async function recordResult(env, { game, name, userId = null, date, raw }) {
  if (!env.DB || !GAMES.includes(game) || !Number.isFinite(raw)) return;
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  try {
    await ensure(env);
    await env.DB.prepare(
      `INSERT INTO daily_results (name_key, name, game, date, raw, points, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
    )
      .bind(userId ? `u:${userId}` : `n:${nameKey(clean)}`, clean, game, date, Math.round(raw), pointsFor(game, raw), userId, Date.now())
      .run();
  } catch (err) {
    console.error("daily_results:", err);
  }
}

export function berlinDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const dayNum = (date) => Math.round(Date.parse(date + "T12:00:00Z") / 86400000);

// Einmalig beim allerersten Abruf: vorhandene Tageslisten übernehmen
// (Städteraten/Nonogramm der letzten 14 Tage, Wordle seit dem Start).
let backfilled = false;
export async function backfillIfEmpty(env, { leaderboardAll, wordleBoard }) {
  if (backfilled) return;
  backfilled = true;
  await ensure(env);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_results").first();
  if (row && row.n > 0) return;
  try {
    const all = await leaderboardAll();
    for (const [key, entries] of Object.entries(all || {})) {
      const m = key.match(/^(staedte|nono|conn)(\d{4})(\d{2})(\d{2})$/);
      if (!m) continue;
      for (const e of entries) await recordResult(env, { game: m[1], name: e.name, date: `${m[2]}-${m[3]}-${m[4]}`, raw: e.score });
    }
    const today = berlinDate();
    for (let t = Date.parse("2026-10-24T12:00:00Z"); t <= Date.parse(today + "T12:00:00Z"); t += 86400000) {
      const date = new Date(t).toISOString().slice(0, 10);
      const b = await wordleBoard(date);
      for (const e of b?.board || []) await recordResult(env, { game: "wordle", name: e.name, date, raw: e.attempts });
    }
  } catch (err) {
    console.error("Übernahme der Tageslisten:", err);
  }
}

// Lädt Ergebnisse ab einem Datum und ordnet sie Personen zu: Einträge mit Konto
// gehören zum Konto; ältere Einträge ohne Konto unter einem Kontonamen auch.
async function loadRows(env, since) {
  const { results } = await env.DB.prepare(
    "SELECT name_key, name, game, date, raw, points, user_id FROM daily_results WHERE date >= ? ORDER BY date, created_at"
  )
    .bind(since)
    .all();
  let users = [];
  try {
    users = (await env.DB.prepare("SELECT id, username, display_name FROM users WHERE active = 1").all()).results;
  } catch {
    users = [];
  }
  const byId = new Map(users.map((u) => [u.id, u]));
  const byName = new Map();
  for (const u of users) {
    byName.set(nameKey(u.display_name), u);
    byName.set(nameKey(u.display_name.slice(0, 16)), u);
    byName.set(nameKey(u.username), u);
  }
  const seen = new Set();
  const rows = [];
  for (const r of results) {
    const u = r.user_id ? byId.get(r.user_id) : byName.get(nameKey(r.name));
    const pkey = u ? `u:${u.id}` : `n:${nameKey(r.name)}`;
    const k = `${pkey}|${r.game}|${r.date}`;
    if (seen.has(k)) continue; // pro Person, Rätsel und Tag nur einmal
    seen.add(k);
    rows.push({ ...r, name_key: pkey, name: u ? u.display_name.slice(0, 16) : r.name, account: !!u, userId: u ? u.id : null });
  }
  return rows;
}

// range: "all" | "30" | "7"
export async function dailyBoard(env, range = "all") {
  await ensure(env);
  const today = berlinDate();
  const days = range === "7" ? 7 : range === "30" ? 30 : 0;
  const since = days ? new Date(Date.parse(today + "T12:00:00Z") - (days - 1) * 86400000).toISOString().slice(0, 10) : "0000-00-00";
  const results = await loadRows(env, since);

  const players = new Map();
  const dayTotals = new Map(); // date -> Map(name_key -> Punkte)
  for (const r of results) {
    let p = players.get(r.name_key);
    if (!p) {
      p = { key: r.name_key, name: r.name, account: r.account, points: 0, entries: 0, dates: new Set(), best: {}, solved: {}, wins: 0 };
      players.set(r.name_key, p);
    }
    if (!p.account) p.name = r.name; // zuletzt benutzte Schreibweise
    p.points += r.points;
    p.entries++;
    p.dates.add(r.date);
    p.solved[r.game] = (p.solved[r.game] || 0) + 1;
    const better = r.game === "staedte" ? r.raw > (p.best[r.game] ?? -1) : r.raw < (p.best[r.game] ?? Infinity);
    if (better) p.best[r.game] = r.raw;
    if (!dayTotals.has(r.date)) dayTotals.set(r.date, new Map());
    const dt = dayTotals.get(r.date);
    dt.set(r.name_key, (dt.get(r.name_key) || 0) + r.points);
  }

  // Tagessiege: höchste Tagessumme (bei Gleichstand bekommen alle Besten einen)
  for (const [date, totals] of dayTotals) {
    if (date === today) continue; // der laufende Tag ist noch offen
    const max = Math.max(...totals.values());
    for (const [k, v] of totals) if (v === max) players.get(k).wins++;
  }

  const t = dayNum(today);
  const list = [...players.values()].map((p) => {
    const nums = [...p.dates].map(dayNum).sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    for (const n of nums) {
      run = prev !== null && n === prev + 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = n;
    }
    // aktuelle Serie zählt, wenn heute oder gestern gespielt wurde
    const last = nums[nums.length - 1];
    const current = last === t || last === t - 1 ? run : 0;
    return {
      name: p.name,
      account: p.account,
      points: p.points,
      days: p.dates.size,
      entries: p.entries,
      avg: Math.round(p.points / p.dates.size),
      streak: current,
      bestStreak: best,
      wins: p.wins,
      solved: p.solved,
      best: p.best,
      today: dayTotals.get(today)?.get(p.key) || 0,
    };
  });
  list.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, "de"));

  // Rekorde über alle
  const pick = (game, better) => {
    let rec = null;
    for (const r of results) if (r.game === game && (!rec || better(r.raw, rec.raw))) rec = r;
    return rec ? { name: rec.name, raw: rec.raw, date: rec.date } : null;
  };
  const records = {
    wordle: pick("wordle", (a, b) => a < b),
    staedte: pick("staedte", (a, b) => a > b),
    nono: pick("nono", (a, b) => a < b),
    conn: pick("conn", (a, b) => a < b),
    streak: list.reduce((m, p) => (!m || p.bestStreak > m.bestStreak ? p : m), null),
  };

  return {
    range: days ? String(days) : "all",
    today,
    players: list.slice(0, 100),
    records: {
      ...records,
      streak: records.streak ? { name: records.streak.name, days: records.streak.bestStreak } : null,
    },
    totalPlayers: list.length,
  };
}

// Persönliche Statistik für angemeldete Personen (Bestenliste „Meine Statistik“).
export async function myStats(env, user) {
  await ensure(env);
  const today = berlinDate();
  const rows = (await loadRows(env, "0000-00-00")).filter((r) => r.userId === user.id);
  const board = await dailyBoard(env, "all");
  const rank = board.players.findIndex((p) => p.account && p.name === user.display_name.slice(0, 16)) + 1;
  const per = {};
  for (const g of GAMES) per[g] = { played: 0, points: 0, best: null };
  const daily = new Map();
  for (const r of rows) {
    const g = per[r.game];
    g.played++;
    g.points += r.points;
    const better = r.game === "staedte" ? r.raw > (g.best ?? -1) : r.raw < (g.best ?? Infinity);
    if (better) g.best = r.raw;
    daily.set(r.date, (daily.get(r.date) || 0) + r.points);
  }
  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.parse(today + "T12:00:00Z") - i * 86400000).toISOString().slice(0, 10);
    last30.push({ date: d, points: daily.get(d) || 0 });
  }
  const me = board.players.find((p) => p.account && p.name === user.display_name.slice(0, 16));
  return {
    user: { name: user.display_name },
    rank: rank || null,
    of: board.totalPlayers,
    points: me ? me.points : 0,
    days: daily.size,
    streak: me ? me.streak : 0,
    bestStreak: me ? me.bestStreak : 0,
    wins: me ? me.wins : 0,
    games: per,
    last30,
    todayDone: GAMES.filter((g) => rows.some((r) => r.game === g && r.date === today)),
  };
}
