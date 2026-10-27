import React, { useState } from "react";
import { useGame } from "../store.jsx";

const savedName = () => {
  try { return localStorage.getItem("gg-name") || ""; } catch { return ""; }
};
const urlRoom = () => {
  try { return (new URLSearchParams(location.search).get("room") || "").toUpperCase().slice(0, 6); } catch { return ""; }
};

function WolfMark() {
  return (
    <svg className="home-wolf" viewBox="0 0 120 120" aria-hidden="true">
      {/* sitzender Wolf, der den Mond anheult */}
      <path className="body" d="M38 112 C30 96 34 78 44 66 C50 58 56 54 62 54 L74 56 C82 64 86 78 86 92 C86 102 90 108 96 112 Z" />
      <path className="body" d="M84 104 C96 104 106 98 110 88 C104 96 96 98 88 96 Z" />
      <g className="head">
        <path className="body" d="M48 70 C46 58 48 46 54 38 L56 22 L62 34 L66 30 L68 40 C74 34 82 24 86 14 C88 22 84 32 78 40 C80 44 78 50 74 54 C70 62 62 70 48 70 Z" />
        <circle className="eye" cx="66" cy="44" r="2.2" />
      </g>
    </svg>
  );
}

export default function Home() {
  const { createRoom, joinRoom } = useGame();
  const initialRoom = urlRoom();
  const [mode, setMode] = useState(initialRoom ? "join" : null); // null | 'create' | 'join'
  const [name, setName] = useState(savedName);
  const [roomCode, setRoomCode] = useState(initialRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function remember(n) {
    try { localStorage.setItem("gg-name", n); } catch { /* egal */ }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    remember(name.trim());
    const res = await createRoom(name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim()) return;
    setBusy(true);
    setError("");
    remember(name.trim());
    const res = await joinRoom(roomCode.trim(), name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="centered-screen">
      <a className="hub-back" href="/">← Vereinsheim</a>
      <div className="home-hero enter">
        <WolfMark />
        <h1 className="home-title">Was für Wölfe</h1>
        <p className="subtitle">Werwolf für die ganze Runde. Jede*r spielt mit dem eigenen Handy.</p>
      </div>

      {mode === null && (
        <div className="card stack enter" style={{ animationDelay: "0.1s" }}>
          <button className="btn btn-primary btn-large" onClick={() => setMode("create")}>
            Raum eröffnen
          </button>
          <button className="btn btn-secondary" onClick={() => setMode("join")}>
            Mit Code beitreten
          </button>
        </div>
      )}

      {mode === "create" && (
        <form className="card stack enter" onSubmit={handleCreate}>
          <label>
            Dein Name
            <input autoFocus maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Nils" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Eröffne Raum …" : "Raum eröffnen"}
          </button>
          <button className="btn btn-link" type="button" onClick={() => setMode(null)}>
            Zurück
          </button>
        </form>
      )}

      {mode === "join" && (
        <form className="card stack enter" onSubmit={handleJoin}>
          <label>
            Raum-Code
            <input
              autoFocus={!initialRoom}
              maxLength={6}
              className="room-code-input"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              autoCapitalize="characters"
            />
          </label>
          <label>
            Dein Name
            <input autoFocus={!!initialRoom} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Nils" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !roomCode.trim()}>
            {busy ? "Trete bei …" : "Beitreten"}
          </button>
          <button className="btn btn-link" type="button" onClick={() => setMode(null)}>
            Zurück
          </button>
        </form>
      )}
    </div>
  );
}
