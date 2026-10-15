import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";

export default function HunterShot() {
  const { state, me, hunterShot } = useGame();
  const [selected, setSelected] = useState(null);
  const pending = state.pendingHunter;

  if (!pending) return null;

  const isShooter = pending.shooterId === me?.id;

  if (!isShooter) {
    return (
      <div className="card centered-note">
        <div className="sleep-emoji">🏹</div>
        <p>
          <strong>{pending.shooterName}</strong> wurde als Jäger enttarnt und entscheidet, wen er mit in den
          Tod reißt …
        </p>
      </div>
    );
  }

  const targets = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);

  async function confirm() {
    if (!selected) return;
    await hunterShot(selected);
  }

  return (
    <div className="card stack">
      <h2>🏹 Dein letzter Schuss</h2>
      <p className="hint">Du wurdest getötet – doch bevor du gehst, reißt du noch jemanden mit dir.</p>
      <PlayerList players={targets} selectable onSelect={setSelected} highlightId={selected} />
      <button className="btn btn-primary" disabled={!selected} onClick={confirm}>
        Schießen
      </button>
    </div>
  );
}
