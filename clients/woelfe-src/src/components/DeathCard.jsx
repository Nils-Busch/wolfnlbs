import React from "react";

// Eine Karte pro Toten; die Rolle wird umgedreht sichtbar.
export default function DeathCard({ d, how, delay = 0 }) {
  const wolf = d.role === "WOLF" || d.role === "URWOLF";
  return (
    <li className={`death-card ${wolf ? "wolf" : ""}`} style={{ animationDelay: `${delay}s` }}>
      <span className="grave" aria-hidden="true">🪦</span>
      <span className="who">
        <b>{d.name}</b>
        <small>{how}</small>
      </span>
      <span className="role" style={{ animationDelay: `${delay + 0.45}s` }}>
        <span>{d.roleInfo.emoji}</span>
        {d.roleInfo.name}
      </span>
    </li>
  );
}
