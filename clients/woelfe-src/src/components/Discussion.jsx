import React from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";

export default function Discussion() {
  const { state, me } = useGame();
  const alive = state.players.filter((p) => !p.isNarrator);
  return (
    <div className="card stack">
      <div className="centered-note">
        <h2>Wer ist verdächtig?</h2>
        <p className="hint" style={{ margin: 0 }}>Redet miteinander, bevor abgestimmt wird. Wer lügt, wer schweigt auffällig?</p>
      </div>
      <PlayerList players={alive} mayorId={state.mayorId} meId={me?.id} />
    </div>
  );
}
