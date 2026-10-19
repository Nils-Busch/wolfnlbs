import React from "react";
import { useGame } from "../store.jsx";

export default function DayReveal() {
  const { state } = useGame();
  const result = state.nightResult;

  return (
    <div className="card stack centered-note">
      <h2>☀️ Das Dorf wacht auf</h2>

      {result?.saved && (
        <p className="good-text">💚 {result.saved.name} wurde von der Hexe gerettet!</p>
      )}

      {result?.deaths?.length ? (
        <ul className="death-list">
          {result.deaths.map((d) => (
            <li key={d.id}>
              💀 <strong>{d.name}</strong> war {d.roleInfo.emoji} {d.roleInfo.name}
            </li>
          ))}
        </ul>
      ) : (
        <p>In dieser Nacht ist niemand gestorben.</p>
      )}

      <p className="hint">Gleich geht's weiter mit der Diskussion …</p>
    </div>
  );
}
