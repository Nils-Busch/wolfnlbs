// API des Party-Quiz (unter /api/quiz).
//
// Quizze pflegen (nur mit Konto):
//   GET    /quizzes             Liste: eigene + freigegebene (mit quiz.manage: alle)
//   GET    /quizzes/:id         Ein Quiz inkl. Fragen und Lösungen
//   POST   /quizzes             Neues Quiz            (quiz.create)
//   PUT    /quizzes/:id         Quiz speichern        (Besitzer mit quiz.create oder quiz.manage)
//   DELETE /quizzes/:id         Quiz löschen          (wie PUT)
//   POST   /quizzes/:id/copy    Kopie als eigenes Quiz anlegen (quiz.create)
//
// Live spielen:
//   POST /rooms { quizId }      Raum eröffnen (mit Konto) -> { roomCode, hostKey }
//   GET  /rooms/:code           Gibt es den Raum?
//   GET  /rooms/:code/ws        WebSocket für Bildschirm und Handys (ohne Konto)

import { fail, intId, json, securityHeaders, rejectNonJsonWrites, bodyReader, handleErrors } from "../konto/http.js";
import { getUser, hasPerm, randomToken } from "../konto/auth.js";
import { ensureQuizSchema, normalizeQuiz, loadQuiz, LIMITS } from "./store.js";
import { generateRoomCode, isValidRoomCode } from "../woelfe/roomCode.js";

export { QuizRoom } from "./quizRoom.js";

function roomStub(env, code) {
  return env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(code));
}

const canSee = (user, q) => q.owner_id === user.id || q.shared || hasPerm(user, "quiz.manage");
const canEdit = (user, q) => (q.owner_id === user.id && hasPerm(user, "quiz.create")) || hasPerm(user, "quiz.manage");

export async function handleQuiz(request, env, path) {
  // WebSocket und Raum-Check brauchen kein Konto – Mitspieler haben keins.
  const wsMatch = path.match(/^\/rooms\/([^/]+)\/ws$/);
  if (wsMatch) {
    const code = decodeURIComponent(wsMatch[1]).toUpperCase();
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket erwartet." }, 426);
    if (!isValidRoomCode(code)) return json({ error: "Ungültiger Raum-Code." }, 404);
    return roomStub(env, code).fetch(request);
  }
  const infoMatch = path.match(/^\/rooms\/([^/]+)$/);
  if (infoMatch && request.method === "GET") {
    const code = decodeURIComponent(infoMatch[1]).toUpperCase();
    if (!isValidRoomCode(code)) return json({ exists: false });
    return json({ exists: await roomStub(env, code).exists() });
  }

  const rejected = rejectNonJsonWrites(request);
  if (rejected) return rejected;

  return handleErrors(async () => {
    await ensureQuizSchema(env);
    const method = request.method;
    const readBody = bodyReader(request, 300_000);
    const user = await getUser(request, env);
    if (!user) fail(401, "Bitte anmelden.");
    let m;

    if (path === "/quizzes" && method === "GET") {
      const all = hasPerm(user, "quiz.manage");
      const rows = await env.DB.prepare(
        `SELECT q.id, q.owner_id, q.title, q.description, q.shared, q.questions, q.updated_at, u.display_name AS owner_name
           FROM quizzes q LEFT JOIN users u ON u.id = q.owner_id
          WHERE ? OR q.owner_id = ? OR q.shared = 1
          ORDER BY q.updated_at DESC`
      )
        .bind(all ? 1 : 0, user.id)
        .all();
      return securityHeaders(
        json({
          quizzes: rows.results.map((r) => {
            const q = { ...r, shared: !!r.shared };
            return {
              id: r.id,
              title: r.title,
              description: r.description,
              shared: !!r.shared,
              owner_name: r.owner_name || "gelöschtes Konto",
              mine: r.owner_id === user.id,
              question_count: JSON.parse(r.questions || "[]").length,
              updated_at: r.updated_at,
              can_edit: canEdit(user, q),
            };
          }),
          canCreate: hasPerm(user, "quiz.create") || hasPerm(user, "quiz.manage"),
          limits: LIMITS,
        })
      );
    }

    if ((m = path.match(/^\/quizzes\/(\d+)$/)) && method === "GET") {
      const q = await loadQuiz(env, intId(m[1]));
      if (!canSee(user, q)) fail(404, "Quiz nicht gefunden.");
      return securityHeaders(json({ ...q, can_edit: canEdit(user, q) }));
    }

    if (path === "/quizzes" && method === "POST") {
      if (!hasPerm(user, "quiz.create") && !hasPerm(user, "quiz.manage")) fail(403, "Du darfst (noch) keine Quizze erstellen.");
      const q = normalizeQuiz(await readBody());
      const now = Date.now();
      const res = await env.DB.prepare(
        "INSERT INTO quizzes (owner_id, title, description, shared, questions, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
      )
        .bind(user.id, q.title, q.description, q.shared ? 1 : 0, JSON.stringify(q.questions), now, now)
        .run();
      return securityHeaders(json({ id: res.meta.last_row_id }, 201));
    }

    if ((m = path.match(/^\/quizzes\/(\d+)$/)) && method === "PUT") {
      const id = intId(m[1]);
      const existing = await loadQuiz(env, id);
      if (!canEdit(user, existing)) fail(403, "Dieses Quiz darfst du nicht bearbeiten.");
      const q = normalizeQuiz(await readBody());
      await env.DB.prepare("UPDATE quizzes SET title=?, description=?, shared=?, questions=?, updated_at=? WHERE id=?")
        .bind(q.title, q.description, q.shared ? 1 : 0, JSON.stringify(q.questions), Date.now(), id)
        .run();
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/quizzes\/(\d+)$/)) && method === "DELETE") {
      const id = intId(m[1]);
      const existing = await loadQuiz(env, id);
      if (!canEdit(user, existing)) fail(403, "Dieses Quiz darfst du nicht löschen.");
      await env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(id).run();
      return securityHeaders(json({ ok: true }));
    }

    if ((m = path.match(/^\/quizzes\/(\d+)\/copy$/)) && method === "POST") {
      if (!hasPerm(user, "quiz.create") && !hasPerm(user, "quiz.manage")) fail(403, "Du darfst (noch) keine Quizze erstellen.");
      const q = await loadQuiz(env, intId(m[1]));
      if (!canSee(user, q)) fail(404, "Quiz nicht gefunden.");
      const now = Date.now();
      const title = `${q.title} (Kopie)`.slice(0, LIMITS.title);
      const res = await env.DB.prepare(
        "INSERT INTO quizzes (owner_id, title, description, shared, questions, created_at, updated_at) VALUES (?,?,?,0,?,?,?)"
      )
        .bind(user.id, title, q.description, JSON.stringify(q.questions), now, now)
        .run();
      return securityHeaders(json({ id: res.meta.last_row_id }, 201));
    }

    if (path === "/rooms" && method === "POST") {
      const b = await readBody();
      const q = await loadQuiz(env, intId(b.quizId));
      if (!canSee(user, q)) fail(404, "Quiz nicht gefunden.");
      if (!q.questions.length) fail(400, "Dieses Quiz hat noch keine Fragen.");
      const hostKey = randomToken();
      for (let attempt = 0; attempt < 30; attempt++) {
        const code = generateRoomCode();
        const result = await roomStub(env, code).init(code, {
          title: q.title,
          questions: q.questions,
          hostKey,
          hostName: user.display_name,
        });
        if (result.created) return securityHeaders(json({ roomCode: code, hostKey }, 201));
      }
      fail(503, "Konnte keinen freien Raum-Code finden. Bitte nochmal versuchen.");
    }

    fail(404, "Unbekannter Endpunkt.");
  });
}
