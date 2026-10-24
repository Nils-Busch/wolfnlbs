// Quiz-Speicher in D1 (dieselbe Datenbank wie Konten und Tischtennis).
// Ein Quiz wird als eine Zeile mit den Fragen als JSON gespeichert – so wird
// beim Bearbeiten immer das ganze Quiz auf einmal (atomar) gespeichert.

import { fail, str } from "../konto/http.js";

let ready = false;

export async function ensureQuizSchema(env) {
  if (ready) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS quizzes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id    INTEGER NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      shared      INTEGER NOT NULL DEFAULT 0,
      questions   TEXT NOT NULL DEFAULT '[]',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(owner_id)").run();
  ready = true;
}

export const LIMITS = {
  questions: 100,
  title: 100,
  description: 300,
  questionText: 300,
  answerText: 120,
  minSeconds: 5,
  maxSeconds: 120,
};

// Prüft und säubert ein Quiz aus dem Editor. Wirft verständliche Fehler.
export function normalizeQuiz(b) {
  const title = str(b?.title, LIMITS.title);
  if (!title) fail(400, "Bitte gib dem Quiz einen Titel.");
  const description = str(b?.description, LIMITS.description);
  const shared = !!b?.shared;
  const raw = Array.isArray(b?.questions) ? b.questions : [];
  if (raw.length > LIMITS.questions) fail(400, `Höchstens ${LIMITS.questions} Fragen pro Quiz.`);
  const questions = raw.map((q, i) => {
    const n = i + 1;
    const text = str(q?.text, LIMITS.questionText);
    if (!text) fail(400, `Frage ${n}: Der Fragetext fehlt.`);
    const answers = (Array.isArray(q?.answers) ? q.answers : []).map((a) => str(a, LIMITS.answerText));
    while (answers.length && !answers[answers.length - 1]) answers.pop(); // leere Antworten am Ende ignorieren
    if (answers.length < 2) fail(400, `Frage ${n}: Es braucht mindestens 2 Antworten.`);
    if (answers.length > 4) fail(400, `Frage ${n}: Höchstens 4 Antworten.`);
    if (answers.some((a) => !a)) fail(400, `Frage ${n}: Eine Antwort ist leer.`);
    const correct = Number(q?.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= answers.length) {
      fail(400, `Frage ${n}: Bitte markiere die richtige Antwort.`);
    }
    let seconds = Number(q?.seconds);
    if (!Number.isFinite(seconds)) seconds = 20;
    seconds = Math.round(Math.min(LIMITS.maxSeconds, Math.max(LIMITS.minSeconds, seconds)));
    return { text, answers, correct, seconds };
  });
  return { title, description, shared, questions };
}

export function parseQuiz(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_name: row.owner_name ?? null,
    title: row.title,
    description: row.description,
    shared: !!row.shared,
    questions: JSON.parse(row.questions || "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadQuiz(env, id) {
  const row = await env.DB.prepare(
    `SELECT q.*, u.display_name AS owner_name FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id WHERE q.id = ?`
  )
    .bind(id)
    .first();
  if (!row) fail(404, "Quiz nicht gefunden.");
  return parseQuiz(row);
}
