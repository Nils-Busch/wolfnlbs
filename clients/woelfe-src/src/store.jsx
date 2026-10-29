import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { socket } from "./socket.js";

const GameContext = createContext(null);

const SESSION_KEY = "werwolf_session_v1";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// In der Entwicklung (vite dev) kann VITE_SERVER_URL auf "wrangler dev" zeigen.
const API_BASE = import.meta.env.VITE_SERVER_URL || "";

function emitAsync(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res || { ok: false, error: "Keine Antwort vom Server." }));
  });
}

export function GameProvider({ children }) {
  const [connected, setConnected] = useState(socket.connected);
  const [session, setSession] = useState(loadSession());
  const [state, setState] = useState(null); // public room state
  const [myRole, setMyRole] = useState(null);
  const [seerResult, setSeerResult] = useState(null);
  const [wolfProgress, setWolfProgress] = useState(null);
  const [witchInfo, setWitchInfo] = useState(null);
  const [wolfChat, setWolfChat] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      const s = loadSession();
      if (s?.roomCode && s?.token) {
        emitAsync("joinRoom", { name: s.name, token: s.token }).then((res) => {
          // Nur bei einer echten Ablehnung des Servers die Sitzung verwerfen –
          // nicht, wenn die Verbindung einfach wieder kurz weg war.
          if (!res.ok && res.error !== "Verbindung unterbrochen." && res.error !== "Keine Verbindung zum Server.") {
            socket.disconnect();
            clearSession();
            setSession(null);
            setState(null);
            setMyRole(null);
            showToast(res.error || "Konnte Raum nicht wiederfinden.");
          }
        });
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(s) {
      setState(s);
    }
    function onYourRole(payload) {
      setMyRole(payload);
    }
    function onSeerResult(payload) {
      setSeerResult(payload);
    }
    function onWolfProgress(payload) {
      setWolfProgress(payload);
    }
    function onWitchInfo(payload) {
      setWitchInfo(payload);
    }
    function onWolfChatMessage(entry) {
      setWolfChat((prev) => [...prev, entry]);
    }
    function onWolfChatHistory(entries) {
      setWolfChat(entries || []);
    }
    function onErrorMsg(payload) {
      showToast(payload.message);
    }
    function onRoomGone() {
      clearSession();
      setSession(null);
      setState(null);
      setMyRole(null);
      showToast("Der Raum ist abgelaufen.");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("yourRole", onYourRole);
    socket.on("seerResult", onSeerResult);
    socket.on("wolfProgress", onWolfProgress);
    socket.on("witchNightInfo", onWitchInfo);
    socket.on("wolfChatMessage", onWolfChatMessage);
    socket.on("wolfChatHistory", onWolfChatHistory);
    socket.on("errorMsg", onErrorMsg);
    socket.on("roomGone", onRoomGone);

    // Gespeicherte Sitzung (z. B. nach Neuladen der Seite) → direkt wieder verbinden.
    const saved = loadSession();
    if (saved?.roomCode) socket.connect(saved.roomCode);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("yourRole", onYourRole);
      socket.off("seerResult", onSeerResult);
      socket.off("wolfProgress", onWolfProgress);
      socket.off("witchNightInfo", onWitchInfo);
      socket.off("wolfChatMessage", onWolfChatMessage);
      socket.off("wolfChatHistory", onWolfChatHistory);
      socket.off("errorMsg", onErrorMsg);
      socket.off("roomGone", onRoomGone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset ephemeral per-night info whenever the phase changes.
  useEffect(() => {
    if (!state) return;
    if (state.phase === "NIGHT_WOLVES") {
      setSeerResult(null);
      setWitchInfo(null);
      setWolfChat([]);
    }
  }, [state?.phase, state?.day]);

  // Verbindet sich mit einem Raum und tritt ihm bei (gemeinsamer Teil von Erstellen/Beitreten).
  const connectAndJoin = useCallback(async (roomCode, name) => {
    const code = roomCode.trim().toUpperCase();
    socket.connect(code);
    const opened = await socket.waitForOpen();
    if (!opened) {
      socket.disconnect();
      return { ok: false, error: "Raum nicht gefunden oder Server nicht erreichbar. Code prüfen?" };
    }
    const res = await emitAsync("joinRoom", { name });
    if (res.ok) {
      const s = { roomCode: res.roomCode, playerId: res.playerId, token: res.token, name };
      saveSession(s);
      setSession(s);
    } else {
      socket.disconnect();
    }
    return res;
  }, []);

  const createRoom = useCallback(
    async (name) => {
      let data;
      try {
        const r = await fetch(`${API_BASE}/api/woelfe/rooms`, { method: "POST" });
        data = await r.json();
      } catch {
        return { ok: false, error: "Server nicht erreichbar." };
      }
      if (!data?.ok) return { ok: false, error: data?.error || "Raum konnte nicht erstellt werden." };
      return connectAndJoin(data.roomCode, name);
    },
    [connectAndJoin]
  );

  const joinRoom = useCallback(
    async (roomCode, name) => {
      const code = roomCode.trim().toUpperCase();
      try {
        const r = await fetch(`${API_BASE}/api/woelfe/rooms/${encodeURIComponent(code)}`);
        const data = await r.json();
        if (!data?.exists) return { ok: false, error: "Raum nicht gefunden. Code prüfen?" };
      } catch {
        return { ok: false, error: "Server nicht erreichbar." };
      }
      return connectAndJoin(code, name);
    },
    [connectAndJoin]
  );

  const leaveRoom = useCallback(() => {
    socket.disconnect();
    clearSession();
    setSession(null);
    setState(null);
    setMyRole(null);
  }, []);

  const call = useCallback(
    async (event, payload) => {
      const res = await emitAsync(event, payload);
      if (!res.ok) showToast(res.error || "Fehler");
      return res;
    },
    [showToast]
  );

  const me = state?.players?.find((p) => p.id === session?.playerId) || null;
  const isHost = !!(me && state && state.hostId === me.id);

  const value = {
    connected,
    session,
    state,
    me,
    isHost,
    myRole,
    seerResult,
    wolfProgress,
    witchInfo,
    wolfChat,
    toast,
    createRoom,
    joinRoom,
    leaveRoom,
    updateConfig: (config) => call("updateConfig", { config }),
    setNarrator: (isNarrator) => call("setNarrator", { isNarrator }),
    startGame: () => call("startGame"),
    hostSkipPhase: () => call("hostSkipPhase"),
    hostRestart: () => call("hostRestart"),
    wolfVote: (targetId) => call("wolfVote", { targetId }),
    urwolfConvert: (targetId) => call("urwolfConvert", { targetId }),
    wolfChatSend: (text) => call("wolfChatSend", { text }),
    seerInspect: (targetId) => call("seerInspect", { targetId }),
    witchAction: (payload) => call("witchAction", payload),
    hunterShot: (targetId) => call("hunterShot", { targetId }),
    dayVote: (targetId) => call("dayVote", { targetId }),
    mayorVote: (targetId) => call("mayorVote", { targetId }),
    amorChoose: (targetIds) => call("amorChoose", { targetIds }),
    wolfdogChoose: (side) => call("wolfdogChoose", { side }),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame muss innerhalb von GameProvider verwendet werden.");
  return ctx;
}
