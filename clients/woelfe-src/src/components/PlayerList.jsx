import React from "react";
import { colorFor, initials } from "../lib/fx.js";

// Spieler als Raster aus runden Spielsteinen.
//   selectable/onSelect/highlightId – Auswahl
//   counts      – { [spielerId]: Anzahl Stimmen } für Stimmsteine
//   tone        – "wolf" | "hunter" für die Farbe der Auswahl
export default function PlayerList({ players, highlightId, onSelect, selectable, excludeId, mayorId, meId, counts, tone, voteTone }) {
  const max = counts ? Math.max(0, ...Object.values(counts)) : 0;
  return (
    <ul className="pgrid">
      {players.map((p, i) => {
        const isExcluded = excludeId === p.id;
        const clickable = selectable && p.alive && !p.isNarrator && !isExcluded;
        const n = counts?.[p.id] || 0;
        const cls = [
          "ptile",
          !p.alive && "dead",
          !p.connected && "offline",
          highlightId === p.id && "selected",
          clickable && "clickable",
          meId === p.id && "me",
          tone && `target-${tone}`,
          n > 0 && n === max && "leading",
        ]
          .filter(Boolean)
          .join(" ");
        const tags = [p.isHost && "👑", p.isNarrator && "🎙️", mayorId && p.id === mayorId && "🎗️"].filter(Boolean).join("");
        const Tag = clickable ? "button" : "div";
        return (
          <li key={p.id}>
            <Tag
              className={cls}
              onClick={clickable ? () => onSelect(p.id) : undefined}
              type={clickable ? "button" : undefined}
              aria-pressed={clickable ? highlightId === p.id : undefined}
              style={{ animationDelay: `${Math.min(i, 12) * 0.035}s` }}
            >
              {n > 0 && (
                <span className="votes" aria-label={`${n} Stimmen`}>
                  {Array.from({ length: Math.min(n, 8) }, (_, k) => (
                    <i key={k} className={voteTone || ""} />
                  ))}
                </span>
              )}
              {tags && <span className="tags">{tags}</span>}
              <span className="av" style={{ "--c": colorFor(p.name) }}>
                {initials(p.name)}
              </span>
              <span className="nm">{p.name}</span>
              {!p.alive && p.roleInfo && (
                <span className="sub">
                  {p.roleInfo.emoji} {p.roleInfo.name}
                </span>
              )}
              {p.alive && !p.connected && <span className="sub">offline</span>}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}
