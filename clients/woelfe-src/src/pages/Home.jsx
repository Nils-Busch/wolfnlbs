import React, { useState } from "react";
import { useGame } from "../store.jsx";

export default function Home() {
  const { createRoom, joinRoom } = useGame();
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const res = await createRoom(name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim()) return;
    setBusy(true);
    setError("");
    const res = await joinRoom(roomCode.trim(), name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="centered-screen">
      <a className="hub-back" href="/">← Vereinsheim</a>
      <div className="logo-title">
        <span className="wolf-emoji">🐺</span>
        <h1>Was für Wölfe</h1>
        <p className="subtitle">Werwolf für die ganze Gruppe – jede*r mit eigenem Handy</p>
      </div>

      {mode === null && (
        <div className="card stack">
          <button className="btn btn-primary" onClick={() => setMode("create")}>
            Raum erstellen
          </button>
          <button className="btn btn-secondary" onClick={() => setMode("join")}>
            Raum beitreten
          </button>
        </div>
      )}

      {mode === "create" && (
        <form className="card stack" onSubmit={handleCreate}>
          <label>
            Dein Name
            <input
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Nils"
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Erstelle Raum …" : "Raum erstellen"}
          </button>
          <button className="btn btn-link" type="button" onClick={() => setMode(null)}>
            Zurück
          </button>
        </form>
      )}

      {mode === "join" && (
        <form className="card stack" onSubmit={handleJoin}>
          <label>
            Raum-Code
            <input
              autoFocus
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
            <input maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Nils" />
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
