import React from "react";
import { useGame } from "../store.jsx";
import DeathCard from "./DeathCard.jsx";

export default function DayReveal() {
  const { state } = useGame();
  const result = state.nightResult;
  const deaths = result?.deaths || [];

  return (
    <div className="card stack centered-note">
      <h2>{deaths.length ? "Das Dorf trauert" : "Alle sind wach!"}</h2>
      {result?.saved && <p className="saved-note">💚 Die Hexe hat {result.saved.name} gerettet.</p>}
      {deaths.length ? (
        <ul className="reveal-cards" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {deaths.map((d, i) => (
            <DeathCard key={d.id} d={d} how="ist in der Nacht gestorben" delay={0.3 + i * 0.8} />
          ))}
        </ul>
      ) : (
        <>
          <p className="big-emoji">🌅</p>
          <p>In dieser Nacht ist niemand gestorben.</p>
        </>
      )}
      <p className="hint">Gleich beginnt die Beratung …</p>
    </div>
  );
}
