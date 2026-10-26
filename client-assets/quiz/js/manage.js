'use strict';
/* Quiz-Übersicht: Mitspielen per Code, eigene/freigegebene Quizze, Editor. */

const app = document.getElementById('app');
const M = { me: undefined, list: null, canCreate: false, limits: null, filter: 'all', draft: null, dirty: false, saving: false };
const SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function route() {
  const h = location.hash.replace(/^#/, '');
  if (h === 'new') return { view: 'edit', id: null };
  const m = h.match(/^edit=(\d+)$/);
  if (m) return { view: 'edit', id: Number(m[1]) };
  return { view: 'home' };
}

async function loadMe() {
  const me = await api('/api/konto/auth/me');
  M.me = me.user;
}

/* ---------- Startseite ---------- */
function joinCard() {
  const last = store.get('quiz-play');
  return `<form class="qz-join" data-form="join">
    <h2>Mitspielen</h2>
    <p class="vh-hint">Code vom Bildschirm eingeben – ein Konto brauchst du dafür nicht.</p>
    <label class="vh-field">Raum-Code<input name="code" class="qz-code-input" maxlength="4" autocomplete="off" autocapitalize="characters" required placeholder="ABCD"></label>
    <label class="vh-field">Dein Name<input name="name" maxlength="16" required value="${esc(last?.name || '')}" placeholder="z. B. Nils"></label>
    <button class="vh-btn vh-btn-accent">Beitreten</button>
    <p class="vh-error" data-error></p>
  </form>`;
}

function hostCard() {
  if (!M.me) {
    return `<div class="vh-card qz-host">
      <h2>Quiz leiten</h2>
      <p>Zum Starten und Erstellen von Quizzen brauchst du ein Konto. Die Fragen erscheinen dann auf einem großen Bildschirm,
      alle anderen antworten mit dem Handy.</p>
      <div class="vh-row"><a class="vh-btn vh-btn-accent" href="/konto/?next=/quiz/">Anmelden</a>
      <a class="vh-btn" href="/konto/#register">Konto erstellen</a></div>
    </div>`;
  }
  return `<div class="vh-card qz-host">
    <h2>Quiz leiten</h2>
    <p>Such dir unten ein Quiz aus und klick auf <strong>Starten</strong>. Diese Seite wird dann zum Bildschirm für alle –
      am besten auf einem Fernseher oder Beamer öffnen.</p>
    ${M.canCreate ? '<a class="vh-btn vh-btn-accent" href="#new" style="align-self:flex-start">＋ Neues Quiz erstellen</a>' : '<p class="vh-hint">Eigene Quizze erstellen darfst du noch nicht – frag den Admin, ob er dir das Recht gibt.</p>'}
  </div>`;
}

function quizItem(q) {
  return `<li class="qz-item">
    <span class="count" title="${q.question_count} Fragen">${q.question_count}<small>Fragen</small></span>
    <div><h3>${esc(q.title)}</h3>
      <div class="meta"><span>${q.mine ? 'von dir' : 'von ' + esc(q.owner_name)}</span><span class="vh-pill">${q.shared ? 'für alle' : 'privat'}</span></div></div>
    ${q.description ? `<p class="desc">${esc(q.description)}</p>` : ''}
    <div class="actions">
      <button class="vh-btn vh-btn-accent vh-btn-small" data-action="start" data-id="${q.id}" ${q.question_count ? '' : 'disabled title="Noch keine Fragen"'}>▶ Starten</button>
      ${q.can_edit ? `<a class="vh-btn vh-btn-small" href="#edit=${q.id}">✎ Bearbeiten</a>` : ''}
      ${M.canCreate && !q.mine ? `<button class="vh-btn vh-btn-small" data-action="copy" data-id="${q.id}">Kopieren</button>` : ''}
      ${q.can_edit ? `<button class="vh-btn vh-btn-small vh-btn-danger" data-action="delete" data-id="${q.id}">Löschen</button>` : ''}
    </div>
  </li>`;
}

async function homeView() {
  if (M.me) {
    const r = await api('/api/quiz/quizzes');
    M.list = r.quizzes;
    M.canCreate = r.canCreate;
    M.limits = r.limits;
  }
  const list = (M.list || []).filter((q) => M.filter === 'all' || (M.filter === 'mine' ? q.mine : !q.mine));
  app.innerHTML = `
    <div class="qz-top"><div>
      <h1 class="vh-h1">Party-Quiz</h1>
      <p>Fragen auf dem Fernseher, Antworten am Handy. Wer schneller richtig liegt, bekommt mehr Punkte.</p>
    </div></div>
    <div class="qz-hero">${joinCard()}${hostCard()}</div>
    ${
      M.me
        ? `<div class="qz-section-title"><h2>Quizze</h2>
            <div class="qz-filter vh-tabs" style="margin:0">
              ${[['all', 'Alle'], ['mine', 'Meine'], ['others', 'Von anderen']].map(([k, l]) => `<button data-filter="${k}" aria-selected="${M.filter === k}">${l}</button>`).join('')}
            </div></div>
          ${list.length ? `<ul class="qz-list">${list.map(quizItem).join('')}</ul>` : `<div class="qz-list qz-empty">${M.filter === 'mine' || !M.list.length ? 'Noch keine Quizze. ' + (M.canCreate ? '<a class="vh-link" href="#new">Leg das erste an.</a>' : '') : 'In dieser Auswahl gibt es keine Quizze.'}</div>`}`
        : ''
    }`;
}

/* ---------- Editor ---------- */
const emptyQuestion = () => ({ text: '', answers: ['', '', '', ''], correct: 0, seconds: 20 });

async function editView(id) {
  if (!M.me) {
    location.hash = '';
    return;
  }
  if (!M.draft || M.draft.id !== id) {
    if (id) {
      const q = await api(`/api/quiz/quizzes/${id}`);
      if (!q.can_edit) throw new Error('Dieses Quiz darfst du nicht bearbeiten.');
      M.draft = { id, title: q.title, description: q.description, shared: q.shared, questions: q.questions.map((x) => ({ ...x, answers: [...x.answers, '', '', ''].slice(0, 4) })) };
    } else {
      M.draft = { id: null, title: '', description: '', shared: false, questions: [emptyQuestion()] };
    }
    M.dirty = false;
  }
  renderEditor();
}

function renderEditor() {
  const d = M.draft;
  app.innerHTML = `
    <a class="vh-link" href="#" data-action="back">← Zurück zur Übersicht</a>
    <h1 class="vh-h1">${d.id ? 'Quiz bearbeiten' : 'Neues Quiz'}</h1>
    <form class="qz-editor" data-form="editor" novalidate>
      <section class="vh-card pinned">
        <label class="vh-field">Titel<input name="title" maxlength="100" value="${esc(d.title)}" placeholder="z. B. Vereinsgeschichte" required></label>
        <label class="vh-field">Beschreibung (optional)<textarea name="description" maxlength="300" rows="2">${esc(d.description)}</textarea></label>
        <label class="vh-check"><input type="checkbox" name="shared" ${d.shared ? 'checked' : ''}> Für alle freigeben – dann können auch andere mit Konto dieses Quiz starten (aber nicht ändern).</label>
      </section>
      ${d.questions.map((q, i) => questionCard(q, i, d.questions.length)).join('')}
      <button type="button" class="vh-btn qz-add" data-action="add">＋ Frage hinzufügen</button>
      <div class="qz-savebar">
        <span class="state${M.dirty ? ' dirty' : ''}">${d.questions.length} Frage${d.questions.length === 1 ? '' : 'n'}${M.dirty ? ', nicht gespeichert' : ''}</span>
        <button type="button" class="vh-btn" data-action="back">Abbrechen</button>
        <button class="vh-btn vh-btn-accent" ${M.saving ? 'disabled' : ''}>💾 Speichern</button>
      </div>
    </form>`;
}

function questionCard(q, i, total) {
  return `<section class="vh-card qz-q" data-q="${i}">
    <div class="qhead"><span class="num">${i + 1}</span><span class="label">Frage ${i + 1} von ${total}</span>
      <span class="tools">
        <button type="button" data-action="up" data-q="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben">↑</button>
        <button type="button" data-action="down" data-q="${i}" ${i === total - 1 ? 'disabled' : ''} title="Nach unten">↓</button>
        <button type="button" data-action="dup" data-q="${i}" title="Duplizieren">⧉</button>
        <button type="button" data-action="del" data-q="${i}" title="Löschen">🗑</button>
      </span></div>
    <label class="vh-field">Frage<textarea data-field="text" rows="2" maxlength="300" placeholder="Wie heißt …?">${esc(q.text)}</textarea></label>
    <div class="qz-answers">${q.answers
      .map(
        (a, j) => `<div class="qz-ans ${ANSWER_STYLE[j].cls} ${q.correct === j ? 'correct' : ''}">
          <span class="shape" aria-hidden="true">${ANSWER_STYLE[j].shape}</span>
          <input type="text" data-field="answer" data-a="${j}" maxlength="120" value="${esc(a)}" placeholder="Antwort ${j + 1}${j > 1 ? ' (optional)' : ''}" aria-label="Antwort ${j + 1}">
          <label><input type="radio" name="correct${i}" data-field="correct" data-a="${j}" ${q.correct === j ? 'checked' : ''}> richtig</label>
        </div>`
      )
      .join('')}</div>
    <div class="row2">⏱ Zeit zum Antworten
      <select data-field="seconds">${SECONDS.map((s) => `<option value="${s}" ${q.seconds === s ? 'selected' : ''}>${s} Sekunden</option>`).join('')}</select>
    </div>
  </section>`;
}

// Eingaben laufend in den Entwurf übernehmen (ohne neu zu zeichnen, damit der Fokus bleibt).
app.addEventListener('input', (e) => {
  const f = e.target.closest('form[data-form="editor"]');
  if (!f || !M.draft) return;
  const t = e.target;
  if (t.name === 'title') M.draft.title = t.value;
  else if (t.name === 'description') M.draft.description = t.value;
  else if (t.name === 'shared') M.draft.shared = t.checked;
  else {
    const card = t.closest('[data-q]');
    if (!card) return;
    const q = M.draft.questions[Number(card.dataset.q)];
    if (t.dataset.field === 'text') q.text = t.value;
    if (t.dataset.field === 'answer') q.answers[Number(t.dataset.a)] = t.value;
    if (t.dataset.field === 'seconds') q.seconds = Number(t.value);
    if (t.dataset.field === 'correct') {
      q.correct = Number(t.dataset.a);
      card.querySelectorAll('.qz-ans').forEach((el, j) => el.classList.toggle('correct', j === q.correct));
    }
  }
  if (!M.dirty) {
    M.dirty = true;
    const st = app.querySelector('.qz-savebar .state');
    if (st) { st.textContent += ', nicht gespeichert'; st.classList.add('dirty'); }
  }
});
app.addEventListener('change', (e) => {
  if (e.target.matches('select[data-field], input[type=radio][data-field], input[name=shared]')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
});

function payload() {
  const d = M.draft;
  return {
    title: d.title,
    description: d.description,
    shared: d.shared,
    questions: d.questions.map((q) => {
      // Leere Antworten dazwischen entfernen und die richtige Antwort mitziehen.
      const kept = q.answers.map((a, j) => ({ a: a.trim(), j })).filter((x) => x.a);
      const correct = kept.findIndex((x) => x.j === q.correct);
      return { text: q.text, answers: kept.map((x) => x.a), correct, seconds: q.seconds };
    }),
  };
}

async function save() {
  const d = M.draft;
  const body = payload();
  const bad = body.questions.findIndex((q) => q.correct < 0 && q.answers.length >= 2);
  if (bad >= 0) return toast(`Frage ${bad + 1}: Die als richtig markierte Antwort ist leer.`, true);
  M.saving = true;
  try {
    if (d.id) await api(`/api/quiz/quizzes/${d.id}`, { method: 'PUT', body });
    else {
      const r = await api('/api/quiz/quizzes', { method: 'POST', body });
      d.id = r.id;
      history.replaceState(null, '', '#edit=' + r.id);
    }
    M.dirty = false;
    toast('Gespeichert.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    M.saving = false;
    renderEditor();
  }
}

/* ---------- Ereignisse ---------- */
app.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'editor') return save();
  if (f.dataset.form === 'join') {
    const code = normCode(f.elements.code.value);
    const name = f.elements.name.value.trim();
    const err = f.querySelector('[data-error]');
    if (code.length !== 4) return (err.textContent = 'Der Code hat 4 Zeichen.');
    try {
      const r = await api(`/api/quiz/rooms/${code}`);
      if (!r.exists) return (err.textContent = 'Diesen Raum gibt es nicht. Code prüfen?');
    } catch {
      return (err.textContent = 'Server nicht erreichbar.');
    }
    const prev = store.get('quiz-play');
    store.set('quiz-play', { code, name, token: prev && prev.code === code ? prev.token : null });
    location.href = `/quiz/play#${code}`;
  }
});

app.addEventListener('click', async (e) => {
  const fb = e.target.closest('[data-filter]');
  if (fb) {
    M.filter = fb.dataset.filter;
    return render();
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  const qi = el.dataset.q !== undefined ? Number(el.dataset.q) : null;
  const d = M.draft;

  if (a === 'back') {
    e.preventDefault();
    if (M.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    M.draft = null;
    M.dirty = false;
    location.hash = '';
    return;
  }
  if (a === 'start') {
    el.disabled = true;
    try {
      const r = await api('/api/quiz/rooms', { method: 'POST', body: { quizId: Number(id) } });
      store.set('quiz-host-' + r.roomCode, { hostKey: r.hostKey, at: Date.now() });
      location.href = `/quiz/screen#${r.roomCode}`;
    } catch (err) {
      toast(err.message, true);
      el.disabled = false;
    }
    return;
  }
  if (a === 'copy') {
    try {
      const r = await api(`/api/quiz/quizzes/${id}/copy`, { method: 'POST' });
      toast('Kopie angelegt – du kannst sie jetzt bearbeiten.');
      location.hash = 'edit=' + r.id;
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (a === 'delete') {
    if (!confirm('Dieses Quiz endgültig löschen?')) return;
    try {
      await api(`/api/quiz/quizzes/${id}`, { method: 'DELETE' });
      toast('Quiz gelöscht.');
      render();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  // Editor-Werkzeuge
  if (!d) return;
  if (a === 'add') {
    if (M.limits && d.questions.length >= M.limits.questions) return toast(`Höchstens ${M.limits.questions} Fragen.`, true);
    d.questions.push(emptyQuestion());
  } else if (a === 'del') {
    if (d.questions[qi].text && !confirm(`Frage ${qi + 1} löschen?`)) return;
    d.questions.splice(qi, 1);
    if (!d.questions.length) d.questions.push(emptyQuestion());
  } else if (a === 'dup') {
    d.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(d.questions[qi])));
  } else if (a === 'up' && qi > 0) {
    [d.questions[qi - 1], d.questions[qi]] = [d.questions[qi], d.questions[qi - 1]];
  } else if (a === 'down' && qi < d.questions.length - 1) {
    [d.questions[qi + 1], d.questions[qi]] = [d.questions[qi], d.questions[qi + 1]];
  } else return;
  M.dirty = true;
  renderEditor();
  if (a === 'add') app.querySelector(`[data-q="${d.questions.length - 1}"] textarea`)?.focus();
});

window.addEventListener('beforeunload', (e) => {
  if (M.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function render() {
  try {
    if (M.me === undefined) await loadMe();
    const r = route();
    if (r.view === 'edit') await editView(r.id);
    else {
      M.draft = null;
      await homeView();
    }
  } catch (e) {
    app.innerHTML = `<p class="vh-error">${esc(e.message)}</p><p><a class="vh-link" href="#">← Zur Übersicht</a></p>`;
  }
}

window.addEventListener('hashchange', () => {
  // Beim Verlassen des Editors per Zurück-Taste nachfragen
  if (M.dirty && route().view !== 'edit') {
    if (!confirm('Ungespeicherte Änderungen verwerfen?')) {
      history.pushState(null, '', M.draft.id ? '#edit=' + M.draft.id : '#new');
      return;
    }
    M.dirty = false;
  }
  render();
});
render();
