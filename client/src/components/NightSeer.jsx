import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";

export default function NightSeer() {
  const { state, me, myRole, seerInspect, seerResult } = useGame();
  const [selected, setSelected] = useState(null);

  const amSeer = myRole?.role === "SEER" && me?.alive;
  if (!amSeer) {
    return <SleepOverlay text="Die Seherin blickt in die Zukunft eines Mitspielers …" />;
  }

  if (seerResult) {
    return (
      <div className="card centered-note">
        <h2>🔮 Deine Vision</h2>
        <p className="reveal-emoji">{seerResult.roleInfo.emoji}</p>
        <p>
          <strong>{seerResult.targetName}</strong> ist: <strong>{seerResult.roleInfo.name}</strong>
        </p>
        <p className="hint">Merk dir das gut – niemand sonst erfährt davon.</p>
      </div>
    );
  }

  const selectable = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);

  async function confirm() {
    if (!selected) return;
    await seerInspect(selected);
  }

  return (
    <div className="card stack">
      <h2>🔮 Wessen Rolle willst du sehen?</h2>
      <PlayerList players={selectable} selectable onSelect={setSelected} highlightId={selected} />
      <button className="btn btn-primary" disabled={!selected} onClick={confirm}>
        Bestätigen
      </button>
    </div>
  );
}
