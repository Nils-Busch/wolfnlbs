import React from "react";
import { useGame } from "../store.jsx";

export default function VoteResult() {
  const { state } = useGame();
  const result = state.voteResult;
  if (!result) return null;

  return (
    <div className="card stack centered-note">
      <h2>📜 Das Dorf hat entschieden</h2>

      {result.tie && <p>Stimmengleichheit – niemand wird heute verbannt.</p>}

      {result.eliminated && (
        <p>
          💀 <strong>{result.eliminated.name}</strong> wird verbannt und war{" "}
          {result.eliminated.roleInfo.emoji} {result.eliminated.roleInfo.name}.
        </p>
      )}

      {!result.eliminated && !result.tie && <p>Niemand hat genug Stimmen erhalten.</p>}

      {result.extraDeaths?.map((d) => (
        <p key={d.id}>
          🏹 <strong>{d.name}</strong> wurde vom Jäger mitgenommen und war {d.roleInfo.emoji}{" "}
          {d.roleInfo.name}.
        </p>
      ))}

      <p className="hint">Gleich wird es wieder Nacht …</p>
    </div>
  );
}
