// Schlanker Ersatz für socket.io-client auf Basis normaler Browser-WebSockets.
//
// Jeder Raum ist auf dem Server ein eigenes Durable Object, deshalb verbindet sich
// der Client immer mit genau einem Raum: /api/woelfe/rooms/<CODE>/ws
//
// Die API ist bewusst ähnlich wie bei Socket.io gehalten:
//   socket.connect(code)          – mit einem Raum verbinden (verbindet bei Abbruch selbst neu)
//   socket.disconnect()           – Verbindung bewusst trennen (Raum verlassen)
//   socket.emit(event, payload, ack)
//   socket.on(event, fn) / socket.off(event, fn)
//   Eingebaute Events: "connect", "disconnect"

const HEARTBEAT_MS = 25000;
const ACK_TIMEOUT_MS = 10000;

class RoomSocket {
  constructor() {
    this.ws = null;
    this.code = null;
    this.connected = false;
    this.listeners = new Map();
    this.pending = new Map();
    this.seq = 0;
    this.retry = 0;
    this.reconnectTimer = null;
    this.heartbeat = null;

    // Handy wieder entsperrt / Tab wieder sichtbar → sofort neu verbinden statt auf den Backoff zu warten.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.code && !this.connected) {
          this.retry = 0;
          this.open();
        }
      });
    }
  }

  url(code) {
    const base = import.meta.env.VITE_SERVER_URL || window.location.origin;
    const u = new URL(`/api/woelfe/rooms/${encodeURIComponent(code)}/ws`, base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }

  connect(code) {
    const upper = (code || "").toUpperCase();
    if (this.code === upper && this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.disconnect();
    this.code = upper;
    this.retry = 0;
    this.open();
  }

  disconnect() {
    this.code = null;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close(1000, "bye");
      } catch {}
      this.handleClosed();
    }
  }

  open() {
    clearTimeout(this.reconnectTimer);
    if (!this.code) return;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }

    const code = this.code;
    const ws = new WebSocket(this.url(code));
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.retry = 0;
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, HEARTBEAT_MS);
      this.dispatch("connect");
    };

    ws.onmessage = (e) => {
      if (this.ws !== ws || e.data === "pong") return;
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === "res") {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          entry.resolve(msg.res);
        }
      } else if (msg.t === "evt") {
        this.dispatch(msg.event, msg.payload);
      }
    };

    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.handleClosed();
      // Raum wurde serverseitig gelöscht → nicht endlos neu verbinden.
      if (e.code === 4004) {
        this.code = null;
        this.dispatch("roomGone");
        return;
      }
      if (this.code === code) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose folgt automatisch.
    };
  }

  handleClosed() {
    clearInterval(this.heartbeat);
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: "Verbindung unterbrochen." });
    }
    this.pending.clear();
    if (this.connected) {
      this.connected = false;
      this.dispatch("disconnect");
    }
  }

  scheduleReconnect() {
    const delay = Math.min(10000, 500 * 2 ** this.retry);
    this.retry++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  // Wartet, bis die Verbindung steht (für Raum erstellen / beitreten).
  waitForOpen(timeoutMs = 8000) {
    if (this.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (ok) => {
        clearTimeout(timer);
        this.off("connect", onConnect);
        resolve(ok);
      };
      const onConnect = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      this.on("connect", onConnect);
    });
  }

  emit(event, payload, ack) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (typeof ack === "function") ack({ ok: false, error: "Keine Verbindung zum Server." });
      return;
    }
    const id = ++this.seq;
    if (typeof ack === "function") {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        ack({ ok: false, error: "Keine Antwort vom Server." });
      }, ACK_TIMEOUT_MS);
      this.pending.set(id, { resolve: ack, timer });
    }
    ws.send(JSON.stringify({ id, event, payload: payload ?? {} }));
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }

  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }

  dispatch(event, payload) {
    for (const fn of [...(this.listeners.get(event) || [])]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

export const socket = new RoomSocket();
