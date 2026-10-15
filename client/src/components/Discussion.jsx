import React from "react";
import { useGame } from "../store.jsx";

export default function Discussion() {
  const { state } = useGame();
  return (
    <div className="card centered-note">
      <h2>💬 Diskutiert!</h2>
      <p>Wer verhält sich verdächtig? Redet darüber, bevor abgestimmt wird.</p>
      <p className="hint">
        {state.players.filter((p) => p.alive && !p.isNarrator).length} Spieler sind noch im Spiel.
      </p>
    </div>
  );
}
