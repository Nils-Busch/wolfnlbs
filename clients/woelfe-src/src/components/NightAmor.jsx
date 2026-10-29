import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";
import ActHead from "./ActHead.jsx";

export default function NightAmor() {
  const { state, me, myRole, amorChoose } = useGame();
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  if (!(myRole?.role === "AMOR" && me?.alive)) return <SleepOverlay text="Amor schleicht durchs Dorf und spannt seinen Bogen …" />;

  const candidates = state.players.filter((p) => p.alive && !p.isNarrator);
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-1), id]));

  return (
    <div className="card stack">
      <ActHead kind="amor" em="💘" title="Wen verkuppelst du?" hint="Wähle zwei Personen – du darfst auch dich selbst nehmen. Die beiden erfahren voneinander." />
      <PlayerList players={candidates} selectable onSelect={toggle} highlightIds={picked} meId={me.id} tone="amor" />
      <button
        className="btn btn-primary"
        disabled={picked.length !== 2 || busy}
        onClick={async () => {
          setBusy(true);
          await amorChoose(picked);
          setBusy(false);
        }}
      >
        {picked.length === 2 ? "💘 Pfeile abschießen" : `Noch ${2 - picked.length} wählen`}
      </button>
    </div>
  );
}
