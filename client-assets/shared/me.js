// Bestenlisten mit Konto: Wer angemeldet ist, trägt sich automatisch unter dem
// Kontonamen ein. Füllt jedes Namensfeld in Bestenlisten-Formularen
// (input[name="n"]) aus und sperrt es; ohne Anmeldung bleibt alles wie gehabt.
(function () {
  'use strict';
  const me = fetch('/api/konto/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && d.user ? d.user : null))
    .catch(() => null);
  window.VHMe = me;

  function lock(input, user) {
    if (input.dataset.locked) return;
    input.dataset.locked = '1';
    input.value = String(user.display_name || user.username).slice(0, 16);
    input.readOnly = true;
    input.classList.add('vh-locked-name');
    input.title = 'Eingetragen wird mit deinem Konto';
    const hint = document.createElement('small');
    hint.className = 'vh-account-hint';
    hint.textContent = '🔒 Mit deinem Konto';
    (input.closest('form') || input.parentElement).appendChild(hint);
  }

  me.then((user) => {
    if (!user) return;
    const scan = (root) => root.querySelectorAll && root.querySelectorAll('input[name="n"]').forEach((i) => lock(i, user));
    scan(document);
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('input[name="n"]') ? lock(n, user) : scan(n)))))
      .observe(document.body, { childList: true, subtree: true });
  });
})();
