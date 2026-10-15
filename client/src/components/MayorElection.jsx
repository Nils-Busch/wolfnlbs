import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";

export default function MayorElection() {
  const { state, me, mayorVote } = useGame();
  const [selected, setSelected] = useState(null);

  const myVote = state.mayorVotes.find((v) => v.voterId === me?.id);
  const alive = me?.alive && !me?.isNarrator;

  async function confirm() {
    await mayorVote(selected);
  }

  async function abstain() {
    await mayorVote(null);
  }

  return (
    <div className="card stack">
      <h2>🎗️ Wer soll Bürgermeister*in werden?</h2>
      <p className="hint">
        Der*die Bürgermeister*in hat bei der Tagesabstimmung eine doppelte Stimme.
      </p>

      {alive ? (
        myVote ? (
          <p>
            Du hast für <strong>{myVote.targetName || "Enthaltung"}</strong> gestimmt. Warte auf die
            anderen …
          </p>
        ) : (
          <>
            <PlayerList
              players={state.players.filter((p) => p.alive && !p.isNarrator)}
              selectable
              onSelect={setSelected}
              highlightId={selected}
            />
            <div className="row-buttons">
              <button className="btn btn-primary" disabled={!selected} onClick={confirm}>
                Abstimmen
              </button>
              <button className="btn btn-secondary" onClick={abstain}>
                Enthalten
              </button>
            </div>
          </>
        )
      ) : (
        <p className="hint">Du schaust nur zu, während das Dorf wählt.</p>
      )}

      <div className="progress-box">
        <p className="hint">
          {state.mayorVotes.length}/{state.players.filter((p) => p.alive && !p.isNarrator).length} haben
          abgestimmt
        </p>
        <ul className="vote-feed">
          {state.mayorVotes.map((v, i) => (
            <li key={i}>
              {v.voterName} → {v.targetName || "Enthaltung"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
