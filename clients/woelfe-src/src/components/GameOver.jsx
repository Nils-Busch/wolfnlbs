import React, { useEffect } from "react";
import { useGame } from "../store.jsx";
import { confetti } from "../lib/fx.js";

export default function GameOver() {
  const { state, me, isHost, hostRestart, leaveRoom } = useGame();
  const wolvesWon = state.winner === "WOLVES";
  const loversWon = state.winner === "LOVERS";
  const players = state.players.filter((p) => !p.isNarrator);
  const isWolf = (p) => p.role === "WOLF" || p.role === "URWOLF";
  const wonBy = (p) => (loversWon ? !!p.lover : wolvesWon ? isWolf(p) : !isWolf(p));
  const iWon = me && !me.isNarrator && wonBy(me);

  useEffect(() => {
    const t = setTimeout(() => confetti(loversWon ? ["#ff5c9a", "#ffb3cf", "#f6e7b5", "#e23b3b"] : wolvesWon ? ["#e23b3b", "#a82525", "#f6e7b5", "#18203e"] : ["#f2b705", "#2fbf77", "#f6e7b5", "#3f7be0"]), 700);
    return () => clearTimeout(t);
  }, [wolvesWon]);

  return (
    <div className="screen">
      <div className={`card win-banner ${loversWon ? "lovers" : wolvesWon ? "wolves" : "village"}`}>
        <span className="em">{loversWon ? "💘" : wolvesWon ? "🐺" : "🏡"}</span>
        <h1>{loversWon ? "Die Verliebten gewinnen!" : wolvesWon ? "Die Werwölfe gewinnen!" : "Das Dorf gewinnt!"}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {me?.isNarrator ? "Danke fürs Leiten!" : iWon ? "Du bist im Gewinnerteam." : "Diesmal hat es nicht gereicht."}
        </p>
      </div>

      <div className="card stack">
        <h2>Alle Karten aufgedeckt</h2>
        <ul className="final-grid">
          {players.map((p, i) => {
            const wolf = isWolf(p);
            const won = wonBy(p);
            return (
              <li key={p.id} className={[wolf && "wolf", won && "won", !p.alive && "dead"].filter(Boolean).join(" ")} style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
                <span className="em">{p.roleInfo?.emoji}{p.lover ? "💘" : ""}</span>
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
