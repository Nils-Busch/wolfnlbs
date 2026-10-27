import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";
import ActHead from "./ActHead.jsx";

function Potion({ kind, on, disabled, title, sub, onClick }) {
  return (
    <button type="button" className={`potion ${kind} ${on ? "on" : ""}`} disabled={disabled} onClick={onClick} aria-pressed={on}>
      {disabled && <span className="used">leer</span>}
      <span className="bottle" aria-hidden="true">
        <span className="bubble" style={{ left: "36%" }} />
        <span className="bubble b2" />
        <span className="bubble b3" />
      </span>
      <b>{title}</b>
      <small>{sub}</small>
    </button>
  );
}

export default function NightWitch() {
  const { state, me, myRole, witchInfo, witchAction } = useGame();
  const [save, setSave] = useState(false);
  const [wantsPoison, setWantsPoison] = useState(false);
  const [poisonTarget, setPoisonTarget] = useState(null);
  const [sent, setSent] = useState(false);

  const amWitch = myRole?.role === "WITCH" && me?.alive;
  if (!amWitch) return <SleepOverlay text="Die Hexe rührt in ihrem Kessel …" />;

  if (!witchInfo) {
    return (
      <div className="card centered-note">
        <div className="spinner" />
        <p>Die Geister flüstern noch …</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card centered-note">
        <p className="big-emoji">🧪</p>
        <p>Entschieden. Der Kessel brodelt weiter – warte auf den Morgen.</p>
      </div>
    );
  }

  const poisonable = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);
  const canConfirm = !wantsPoison || !!poisonTarget;

  async function confirm() {
    const res = await witchAction({ save, poisonTargetId: wantsPoison ? poisonTarget : null });
    if (res.ok) setSent(true);
  }

  return (
    <div className="card stack">
      <ActHead
        kind="witch"
        em="🧪"
        title="Deine Tränke"
        hint={witchInfo.victimName ? `Die Werwölfe haben ${witchInfo.victimName} angegriffen.` : "Die Werwölfe haben heute niemanden angegriffen."}
      />

      <div className="potions">
        <Potion
          kind="heal"
          on={save}
          disabled={!witchInfo.canSave}
          title="Heiltrank"
          sub={witchInfo.canSave ? `${witchInfo.victimName} retten` : "schon verbraucht"}
          onClick={() => setSave((v) => !v)}
        />
        <Potion
          kind="poison"
          on={wantsPoison}
          disabled={!witchInfo.canPoison}
          title="Gifttrank"
          sub={witchInfo.canPoison ? "jemanden vergiften" : "schon verbraucht"}
          onClick={() => {
            setWantsPoison((v) => !v);
            setPoisonTarget(null);
          }}
        />
      </div>

      {wantsPoison && (
        <>
          <p className="hint" style={{ margin: 0 }}>Wen willst du vergiften?</p>
          <PlayerList players={poisonable} selectable onSelect={setPoisonTarget} highlightId={poisonTarget} tone="wolf" />
        </>
      )}

      <button className="btn btn-primary" disabled={!canConfirm} onClick={confirm}>
        {save || wantsPoison ? "Tränke einsetzen" : "Diese Nacht nichts tun"}
      </button>
    </div>
  );
}
