import React from "react";
import { useGame } from "../store.jsx";

export default function GameOver() {
  const { state, isHost, hostRestart, leaveRoom } = useGame();
  const winner = state.winner;

  return (
    <div className="screen">
      <div className="card centered-note">
        <h1>{winner === "WOLVES" ? "🐺 Die Werwölfe gewinnen!" : "🏡 Das Dorf gewinnt!"}</h1>
        <p className="hint">So haben sich alle Rollen am Ende verteilt:</p>
      </div>

      <div className="card">
        <ul className="death-list">
          {state.players
            .filter((p) => !p.isNarrator)
            .map((p) => (
              <li key={p.id}>
                {p.roleInfo?.emoji} <strong>{p.name}</strong> – {p.roleInfo?.name}
                {!p.alive && " (gestorben)"}
              </li>
            ))}
          {state.players
            .filter((p) => p.isNarrator)
            .map((p) => (
              <li key={p.id}>
                🎙️ <strong>{p.name}</strong> – Erzähler (hat nicht mitgespielt)
              </li>
            ))}
        </ul>
      </div>

      <div className="card stack">
        {isHost ? (
          <button className="btn btn-primary btn-large" onClick={hostRestart}>
            🔁 Neue Runde mit gleicher Gruppe
          </button>
        ) : (
          <p className="hint">Warte, bis der Gastgeber eine neue Runde startet …</p>
        )}
        <button className="btn btn-link" onClick={leaveRoom}>
          Raum verlassen
        </button>
      </div>
    </div>
  );
}
