import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import VoteProgress, { tally } from "./VoteProgress.jsx";

export default function MayorElection() {
  const { state, me, mayorVote } = useGame();
  const [selected, setSelected] = useState(null);

  const myVote = state.mayorVotes.find((v) => v.voterId === me?.id);
  const alive = me?.alive && !me?.isNarrator;
  const candidates = state.players.filter((p) => p.alive && !p.isNarrator);

  return (
    <div className="card stack">
      <div>
        <h2>Wer führt das Dorf?</h2>
        <p className="hint">Bürgermeister*innen haben bei der Abstimmung am Tag eine doppelte Stimme.</p>
        {!alive && <p className="hint">Du schaust nur zu, während das Dorf wählt.</p>}
      </div>

      <PlayerList
        players={candidates}
        selectable={alive && !myVote}
        onSelect={setSelected}
        highlightId={myVote ? myVote.targetId : selected}
        meId={me?.id}
        counts={tally(state.mayorVotes)}
      />

      {alive && !myVote && (
        <div className="row-buttons">
          <button className="btn btn-gold" disabled={!selected} onClick={() => mayorVote(selected)}>
            Wählen
          </button>
          <button className="btn btn-secondary" onClick={() => mayorVote(null)}>
            Enthalten
          </button>
        </div>
      )}

      <VoteProgress votes={state.mayorVotes} total={candidates.length} />
    </div>
  );
}
