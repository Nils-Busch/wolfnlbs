import React, { useEffect, useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";
import ActHead from "./ActHead.jsx";

export default function NightSeer() {
  const { state, me, myRole, seerInspect, seerResult } = useGame();
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!seerResult) return;
    const t = setTimeout(() => setOpen(true), 500); // Karte dreht sich von selbst um
    return () => clearTimeout(t);
  }, [seerResult]);

  const amSeer = myRole?.role === "SEER" && me?.alive;
  if (!amSeer) return <SleepOverlay text="Die Seherin blickt in die Seele eines Mitspielers …" />;

  if (seerResult) {
    const wolf = seerResult.role === "WOLF" || seerResult.role === "URWOLF";
    return (
      <div className="card centered-note">
        <ActHead kind="seer" em="🔮" title="Deine Vision" />
        <div className={`flip vision ${open ? "open" : "closed"}`} aria-live="polite">
          <span className="flip-inner">
            <span className="flip-face flip-back">
              <span className="moonmark" />
              <b>{seerResult.targetName}</b>
            </span>
            <span className={`flip-face flip-front ${wolf ? "team-wolf" : ""}`}>
              <span className="em">{seerResult.roleInfo.emoji}</span>
              <h3 style={{ fontSize: "1.5rem" }}>{seerResult.roleInfo.name}</h3>
              <p><b>{seerResult.targetName}</b></p>
            </span>
          </span>
        </div>
        <p className="hint">Merk es dir gut – niemand sonst erfährt davon.</p>
      </div>
    );
  }

  const selectable = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);
  return (
    <div className="card stack">
      <ActHead kind="seer" em="🔮" title="Wessen Rolle willst du sehen?" hint="Tippe eine Person an und bestätige." />
      <PlayerList players={selectable} selectable onSelect={setSelected} highlightId={selected} />
      <button className="btn btn-primary" disabled={!selected} onClick={() => selected && seerInspect(selected)}>
        In die Seele blicken
      </button>
    </div>
  );
}
