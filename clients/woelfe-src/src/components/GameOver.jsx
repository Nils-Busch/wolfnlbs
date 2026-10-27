import React, { useEffect } from "react";
import { useGame } from "../store.jsx";
import { confetti } from "../lib/fx.js";

export default function GameOver() {
  const { state, me, isHost, hostRestart, leaveRoom } = useGame();
  const wolvesWon = state.winner === "WOLVES";
  const players = state.players.filter((p) => !p.isNarrator);
  const isWolf = (p) => p.role === "WOLF" || p.role === "URWOLF";
  const iWon = me && !me.isNarrator && (wolvesWon ? isWolf(me) : !isWolf(me));

  useEffect(() => {
    const t = setTimeout(() => confetti(wolvesWon ? ["#e23b3b", "#a82525", "#f6e7b5", "#18203e"] : ["#f2b705", "#2fbf77", "#f6e7b5", "#3f7be0"]), 700);
    return () => clearTimeout(t);
  }, [wolvesWon]);

  return (
    <div className="screen">
      <div className={`card win-banner ${wolvesWon ? "wolves" : "village"}`}>
        <span className="em">{wolvesWon ? "🐺" : "🏡"}</span>
        <h1>{wolvesWon ? "Die Werwölfe gewinnen!" : "Das Dorf gewinnt!"}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {me?.isNarrator ? "Danke fürs Leiten!" : iWon ? "Du bist im Gewinnerteam." : "Diesmal hat es nicht gereicht."}
        </p>
      </div>

      <div className="card stack">
        <h2>Alle Karten aufgedeckt</h2>
        <ul className="final-grid">
          {players.map((p, i) => {
            const wolf = isWolf(p);
            const won = wolvesWon ? wolf : !wolf;
            return (
              <li key={p.id} className={[wolf && "wolf", won && "won", !p.alive && "dead"].filter(Boolean).join(" ")} style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
                <span className="em">{p.roleInfo?.emoji}</span>
                <b>{p.name}</b>
                <small>
                  {p.roleInfo?.name}
                  {!p.alive && " †"}
                </small>
              </li>
            );
          })}
        </ul>
        {state.players.some((p) => p.isNarrator) && (
          <p className="hint">🎙️ Spielleitung: {state.players.filter((p) => p.isNarrator).map((p) => p.name).join(", ")}</p>
        )}
      </div>

      <div className="card stack">
        {isHost ? (
          <button className="btn btn-primary btn-large" onClick={hostRestart}>
            🔁 Neue Runde, gleiche Gruppe
          </button>
        ) : (
          <div className="wait-note">
            <span className="wait-dots" aria-hidden="true"><i /><i /><i /></span>
            <p style={{ margin: 0 }}>Warte auf die nächste Runde …</p>
          </div>
        )}
        <button className="btn btn-link" onClick={leaveRoom}>
          Raum verlassen
        </button>
      </div>
    </div>
  );
}
