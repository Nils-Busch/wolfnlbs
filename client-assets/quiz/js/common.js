'use strict';
/* Gemeinsame Helfer für alle Quiz-Seiten (Übersicht, Bildschirm, Handy). */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Antwortfarben + Formen (damit man sie auch ohne Farben unterscheiden kann).
const ANSWER_STYLE = [
  { cls: 'a0', shape: '▲', name: 'Dreieck' },
  { cls: 'a1', shape: '◆', name: 'Raute' },
  { cls: 'a2', shape: '●', name: 'Kreis' },
  { cls: 'a3', shape: '■', name: 'Quadrat' },
];

async function api(path, opts = {}) {
  const hasBody = opts.body !== undefined || (opts.method && opts.method !== 'GET');
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : hasBody ? '{}' : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function toast(msg, isError = false) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'vh-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'vh-toast show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'vh-toast'), 3500);
}

const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
const codeFromHash = () => normCode((location.hash || '').replace(/^#/, ''));

/**
 * WebSocket-Verbindung zu einem Quiz-Raum, verbindet sich bei Abbruch selbst neu.
 *   sock.emit(event, payload) -> Promise<{ok, ...}>
 *   Callbacks: onOpen, onClose, onState(state), onEvent(event, payload), onGone()
 */
class QuizSocket {
  constructor(code, handlers) {
    this.code = code;
    this.h = handlers;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
    this.retry = 0;
    this.closed = false;
    this.open();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.closed && (!this.ws || this.ws.readyState > 1)) {
        this.retry = 0;
        this.open();
      }
    });
  }
  open() {
    clearTimeout(this.timer);
    const url = new URL(`/api/quiz/rooms/${this.code}/ws`, location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      clearInterval(this.hb);
      this.hb = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
      this.h.onOpen && this.h.onOpen();
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'res') {
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); clearTimeout(p.timer); p.resolve(m.res); }
      } else if (m.t === 'evt') {
        if (m.event === 'state') this.h.onState && this.h.onState(m.payload);
        else this.h.onEvent && this.h.onEvent(m.event, m.payload);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      clearInterval(this.hb);
      for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'Verbindung unterbrochen.' }); }
      this.pending.clear();
      this.h.onClose && this.h.onClose();
      if (e.code === 4004) { this.closed = true; this.h.onGone && this.h.onGone(); return; }
      if (!this.closed) this.timer = setTimeout(() => this.open(), Math.min(8000, 500 * 2 ** this.retry++));
    };
  }
  emit(event, payload = {}) {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== 1) return resolve({ ok: false, error: 'Keine Verbindung.' });
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: 'Keine Antwort vom Server.' }); }, 10000);
      this.pending.set(id, { resolve, timer });
      this.ws.send(JSON.stringify({ id, event, payload }));
    });
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.hb);
    try { this.ws && this.ws.close(1000); } catch {}
  }
}

/** Zeitabgleich mit dem Server, damit Countdown auf allen Geräten gleich läuft. */
const clockSync = {
  offset: 0,
  update(serverNow) { if (serverNow) this.offset = serverNow - Date.now(); },
  remaining(endsAt) { return endsAt ? Math.max(0, endsAt - (Date.now() + this.offset)) : 0; },
};
