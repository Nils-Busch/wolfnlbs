import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";

export default function NightWitch() {
  const { state, me, myRole, witchInfo, witchAction } = useGame();
  const [save, setSave] = useState(false);
  const [wantsPoison, setWantsPoison] = useState(false);
  const [poisonTarget, setPoisonTarget] = useState(null);
  const [sent, setSent] = useState(false);

  const amWitch = myRole?.role === "WITCH" && me?.alive;
  if (!amWitch) {
    return <SleepOverlay text="Die Hexe braut in ihrer Hütte einen Trank …" />;
  }

  if (!witchInfo) {
    return (
      <div className="card centered-note">
        <p>Einen Moment, die Geister flüstern noch …</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card centered-note">
        <p>🧪 Du hast deine Entscheidung getroffen. Warte auf die anderen …</p>
      </div>
    );
  }

  const poisonable = state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id);

  async function confirm() {
    const res = await witchAction({
      save,
      poisonTargetId: wantsPoison ? poisonTarget : null,
    });
    if (res.ok) setSent(true);
  }

  const canConfirm = !wantsPoison || !!poisonTarget;

  return (
    <div className="card stack">
      <h2>🧪 Die Hexe braut</h2>

      {witchInfo.victimName ? (
        <p>
          Die Werwölfe haben <strong>{witchInfo.victimName}</strong> angegriffen.
        </p>
      ) : (
        <p>Die Werwölfe haben niemanden angegriffen.</p>
      )}

      {witchInfo.canSave ? (
        <label className="toggle-row card-inset">
          <span>💚 Heiltrank einsetzen und {witchInfo.victimName} retten</span>
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
        </label>
      ) : (
        <p className="hint">💚 Heiltrank bereits verbraucht.</p>
      )}

      {witchInfo.canPoison ? (
        <>
          <label className="toggle-row card-inset">
            <span>☠️ Gifttrank einsetzen</span>
            <input
              type="checkbox"
              checked={wantsPoison}
              onChange={(e) => {
                setWantsPoison(e.target.checked);
                if (!e.target.checked) setPoisonTarget(null);
              }}
            />
          </label>
          {wantsPoison && (
            <PlayerList
              players={poisonable}
              selectable
              onSelect={setPoisonTarget}
              highlightId={poisonTarget}
            />
          )}
        </>
      ) : (
        <p className="hint">☠️ Gifttrank bereits verbraucht.</p>
      )}

      <button className="btn btn-primary" disabled={!canConfirm} onClick={confirm}>
        Bestätigen
      </button>
    </div>
  );
}
