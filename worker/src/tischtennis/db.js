// D1-Zugriff für das Tischtennis-Turnier (ersetzt den früheren Postgres-Pool).
//
// Wichtige Unterschiede zu Postgres, die beim Lesen auffallen:
//  - Zeitstempel sind Unix-Millisekunden (INTEGER), nicht TIMESTAMPTZ – immer von
//    der App gesetzt (Date.now()), nicht per SQL-Default.
//  - boolean-Spalten sind 0/1 (SQLite kennt keinen eigenen Typ dafür).
//  - "sets" und "members" sind JSON-Text-Spalten, die die App selbst parst.
//  - Es gibt keine FOR-UPDATE-Sperren wie in Postgres. D1 serialisiert Schreib-
//    zugriffe pro Datenbank ohnehin; für ein Turnier, an dem jeweils ein, zwei
//    Leute am Tisch gleichzeitig tippen, reicht das. Kaskadierende Löschungen
//    (Turnier -> Spiele/Teilnehmer, Benutzer -> Sessions/Rechte) führt die App
//    explizit aus, statt sich auf das D1-Fremdschlüssel-Pragma zu verlassen.

import { ensureAccounts } from "../konto/auth.js";

// Einzelne, vollständige Statements (nicht ein großer exec()-Blob): D1s exec()
// erwartet ein Statement pro Zeile, was mehrzeilig formatiertes SQL zerreißen
// würde. prepare() parst dagegen jedes Statement unabhängig vom Zeilenumbruch
// korrekt, deshalb hier eine Liste statt eines einzigen Strings.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    event_date        TEXT,
    location          TEXT,
    format            TEXT NOT NULL CHECK (format IN ('ko','league','group')),
    best_of           INTEGER NOT NULL DEFAULT 5 CHECK (best_of IN (1,3,5,7)),
    group_count       INTEGER NOT NULL DEFAULT 2 CHECK (group_count >= 1),
    advance_per_group INTEGER NOT NULL DEFAULT 2 CHECK (advance_per_group >= 1),
    double_elim       INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','finished')),
    created_at        INTEGER NOT NULL,
    visitor_slug      TEXT UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    name          TEXT NOT NULL,
    club          TEXT,
    seed          INTEGER,
    group_no      INTEGER,
    members       TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id        INTEGER NOT NULL REFERENCES tournaments(id),
    phase                TEXT NOT NULL CHECK (phase IN ('group','ko')),
    bracket              TEXT CHECK (bracket IN ('wb','lb','gf')),
    group_no             INTEGER,
    round                INTEGER NOT NULL,
    position             INTEGER NOT NULL,
    player1_id           INTEGER REFERENCES players(id),
    player2_id           INTEGER REFERENCES players(id),
    sets                 TEXT NOT NULL DEFAULT '[]',
    winner_id            INTEGER REFERENCES players(id),
    status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','bye')),
    table_no             INTEGER,
    next_match_id        INTEGER REFERENCES matches(id),
    next_slot            INTEGER CHECK (next_slot IN (1,2)),
    loser_next_match_id  INTEGER REFERENCES matches(id),
    loser_next_slot      INTEGER CHECK (loser_next_slot IN (1,2)),
    updated_at           INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_matches_t ON matches(tournament_id)`,
  `CREATE INDEX IF NOT EXISTS idx_players_t ON players(tournament_id)`,
];

let initialized = false;

// Konten (users, user_permissions, sessions) liegen jetzt in ../konto/auth.js,
// weil Quiz und Tischtennis sich dieselben Konten teilen.
export async function init(env) {
  await ensureAccounts(env);
  if (initialized) return;
  for (const stmt of SCHEMA_STATEMENTS) {
    await env.DB.prepare(stmt).run();
  }
  initialized = true;
}

/* ---------- kleine Hilfsfunktionen für Zeilen mit JSON-Feldern ---------- */
export function parseMatch(row) {
  if (!row) return row;
  return { ...row, sets: JSON.parse(row.sets || "[]") };
}
export function parsePlayer(row) {
  if (!row) return row;
  return { ...row, members: row.members ? JSON.parse(row.members) : null };
}

/** Kaskadierendes Löschen eines Turniers (Matches + Spieler zuerst). */
export async function deleteTournamentCascade(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM matches WHERE tournament_id = ?").bind(id),
    env.DB.prepare("DELETE FROM players WHERE tournament_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tournaments WHERE id = ?").bind(id),
  ]);
}
