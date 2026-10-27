import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import ActHead from "./ActHead.jsx";

export default function HunterShot() {
  const { state, me, hunterShot } = useGame();
  const [selected, setSelected] = useState(null);
  const pending = state.pendingHunter;
  if (!pending) return null;

  if (pending.shooterId !== me?.id) {
    return (
      <div className="card centered-note">
        <p className="big-emoji">🏹</p>
        <p>
          <strong>{pending.shooterName}</strong> war Jäger*in und legt ein letztes Mal an …
        </p>
      </div>
    );
  }

  const targets = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);
  return (
    <div className="card stack">
      <ActHead kind="hunter" em="🏹" title="Dein letzter Schuss" hint="Du bist gefallen – aber du nimmst noch jemanden mit." />
      <PlayerList players={targets} selectable onSelect={setSelected} highlightId={selected} tone="hunter" />
      <button className="btn btn-gold" disabled={!selected} onClick={() => selected && hunterShot(selected)}>
        Schießen
      </button>
    </div>
  );
}
