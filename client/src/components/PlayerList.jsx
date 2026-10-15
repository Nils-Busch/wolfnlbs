import React from "react";

export default function PlayerList({ players, highlightId, onSelect, selectable, excludeId, mayorId }) {
  return (
    <ul className="player-list">
      {players.map((p) => {
        const isExcluded = excludeId === p.id;
        const clickable = selectable && p.alive && !p.isNarrator && !isExcluded;
        return (
          <li
            key={p.id}
            className={[
              "player-item",
              !p.alive && "player-dead",
              !p.connected && "player-offline",
              highlightId === p.id && "player-selected",
              clickable && "player-clickable",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={clickable ? () => onSelect(p.id) : undefined}
          >
            <span className="player-name">
              {p.name}
              {p.isHost && " 👑"}
              {p.isNarrator && " 🎙️"}
              {mayorId && p.id === mayorId && " 🎗️"}
              {!p.connected && " (offline)"}
            </span>
            {!p.alive && (
              <span className="player-role-tag">
                💀 {p.roleInfo ? `${p.roleInfo.emoji} ${p.roleInfo.name}` : ""}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
