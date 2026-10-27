import React from "react";
import { useGame } from "../store.jsx";
import DeathCard from "./DeathCard.jsx";

export default function VoteResult() {
  const { state } = useGame();
  const result = state.voteResult;
  if (!result) return null;

  return (
    <div className="card stack centered-note">
      <h2>Das Dorf hat entschieden</h2>
      {result.tie && (
        <>
          <p className="big-emoji">⚖️</p>
          <p>Stimmengleichheit – heute muss niemand gehen.</p>
        </>
      )}
      {!result.eliminated && !result.tie && (
        <>
          <p className="big-emoji">🕊️</p>
          <p>Niemand hat genug Stimmen bekommen.</p>
        </>
      )}
      {(result.eliminated || result.extraDeaths?.length > 0) && (
        <ul className="reveal-cards" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {result.eliminated && <DeathCard d={result.eliminated} how="wurde verbannt" delay={0.3} />}
          {result.extraDeaths?.map((d, i) => (
            <DeathCard key={d.id} d={d} how="vom Jäger mitgenommen" delay={1.1 + i * 0.8} />
          ))}
        </ul>
      )}
      <p className="hint">Gleich wird es wieder Nacht …</p>
    </div>
  );
}
