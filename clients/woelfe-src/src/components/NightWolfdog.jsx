import React, { useState } from "react";
import { useGame } from "../store.jsx";
import SleepOverlay from "./SleepOverlay.jsx";
import ActHead from "./ActHead.jsx";

export default function NightWolfdog() {
  const { me, myRole, wolfdogChoose } = useGame();
  const [side, setSide] = useState(null);

  if (!(myRole?.role === "WOLFDOG" && me?.alive)) return <SleepOverlay text="Irgendwo im Dorf knurrt ein Hund …" />;

  return (
    <div className="card stack">
      <ActHead kind="wolfdog" em="🐕" title="Wohin gehörst du?" hint="Entscheide dich einmal für das ganze Spiel. Niemand erfährt deine Wahl." />
      <div className="sides">
        <button type="button" className={`side village ${side === "VILLAGE" ? "on" : ""}`} onClick={() => setSide("VILLAGE")} aria-pressed={side === "VILLAGE"}>
          <span className="em">🏡</span>
          <b>Treuer Hund</b>
          <small>Du bleibst im Dorf und jagst die Werwölfe.</small>
        </button>
        <button type="button" className={`side wolves ${side === "WOLVES" ? "on" : ""}`} onClick={() => setSide("WOLVES")} aria-pressed={side === "WOLVES"}>
          <span className="em">🐺</span>
          <b>Zum Rudel</b>
          <small>Du wirst zum Werwolf und jagst ab heute Nacht mit.</small>
        </button>
      </div>
      <button className="btn btn-primary" disabled={!side} onClick={() => wolfdogChoose(side)}>
        Entscheidung treffen
      </button>
    </div>
  );
}
