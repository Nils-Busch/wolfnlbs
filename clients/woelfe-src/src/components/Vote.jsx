import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import VoteProgress, { tally } from "./VoteProgress.jsx";

export default function Vote() {
  const { state, me, dayVote } = useGame();
  const [selected, setSelected] = useState(null);

  const myVote = state.dayVotes.find((v) => v.voterId === me?.id);
  const alive = me?.alive && !me?.isNarrator;
  const isMayor = !!state.mayorId && me?.id === state.mayorId;
  const candidates = state.players.filter((p) => p.alive && !p.isNarrator);
  const voters = state.players.filter((p) => p.alive && !p.isNarrator).length;

  return (
    <div className="card stack">
      <div>
        <h2>Wer soll das Dorf verlassen?</h2>
        {isMayor && <p className="hint">🎗️ Du bist Bürgermeister*in – deine Stimme zählt doppelt.</p>}
        {alive && myVote && (
          <p className="hint">
            Deine Stimme: <b>{myVote.targetName || "Enthaltung"}</b>. Die Steine zeigen den Zwischenstand.
          </p>
        )}
        {!alive && <p className="hint">Du schaust nur noch zu.</p>}
      </div>

      <PlayerList
        players={candidates}
        selectable={alive && !myVote}
        onSelect={setSelected}
        highlightId={myVote ? myVote.targetId : selected}
        excludeId={me?.id}
        mayorId={state.mayorId}
        meId={me?.id}
        counts={tally(state.dayVotes, state.mayorId)}
      />

      {alive && !myVote && (
        <div className="row-buttons">
          <button className="btn btn-primary" disabled={!selected} onClick={() => dayVote(selected)}>
            Stimme abgeben
          </button>
          <button className="btn btn-secondary" onClick={() => dayVote(null)}>
            Enthalten
          </button>
        </div>
      )}

      <VoteProgress votes={state.dayVotes} total={voters} />
    </div>
  );
}
