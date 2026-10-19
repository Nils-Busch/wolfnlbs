import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";

export default function Vote() {
  const { state, me, dayVote } = useGame();
  const [selected, setSelected] = useState(null);

  const myVote = state.dayVotes.find((v) => v.voterId === me?.id);
  const alive = me?.alive && !me?.isNarrator;
  const isMayor = !!state.mayorId && me?.id === state.mayorId;

  async function confirm() {
    await dayVote(selected);
  }

  async function abstain() {
    await dayVote(null);
  }

  return (
    <div className="card stack">
      <h2>🗳️ Wer soll verbannt werden?</h2>
      {isMayor && <p className="hint">🎗️ Du bist Bürgermeister*in – deine Stimme zählt doppelt.</p>}

      {alive ? (
        myVote ? (
          <p>
            Du hast für <strong>{myVote.targetName || "Enthaltung"}</strong> gestimmt. Warte auf die
            anderen …
          </p>
        ) : (
          <>
            <PlayerList
              players={state.players.filter((p) => p.alive && !p.isNarrator && p.id !== me.id)}
              selectable
              onSelect={setSelected}
              highlightId={selected}
              mayorId={state.mayorId}
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
        <p className="hint">Du bist tot und kannst nur noch zuschauen.</p>
      )}

      <div className="progress-box">
        <p className="hint">
          {state.dayVotes.length}/{state.players.filter((p) => p.alive).length} haben abgestimmt
        </p>
        <ul className="vote-feed">
          {state.dayVotes.map((v, i) => (
            <li key={i}>
              {v.voterName} → {v.targetName || "Enthaltung"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
