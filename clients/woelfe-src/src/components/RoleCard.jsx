import React, { useState } from "react";

// Spielkarte mit der eigenen Rolle. Startet verdeckt, damit niemand mitliest;
// Tippen dreht sie um.
export default function RoleCard({ myRole, startOpen = false, requireOpen = false, onClose, title, note }) {
  const [seen, setSeen] = useState(startOpen);
  const [open, setOpen] = useState(startOpen);
  const info = myRole.roleInfo;
  const wolf = myRole.role === "WOLF" || myRole.role === "URWOLF";
  const mates = myRole.wolfTeammates || [];

  return (
    <div className="role-modal" role="dialog" aria-modal="true" aria-label="Deine Rolle">
      <div className="role-modal-inner">
        {title && <h2 style={{ margin: 0 }}>{title}</h2>}
        <button
          type="button"
          className={`flip ${open ? "open" : "closed"}`}
          onClick={() => { setOpen((v) => !v); setSeen(true); }}
          aria-label={open ? "Karte verdecken" : "Karte umdrehen"}
        >
          <span className="flip-inner">
            <span className="flip-face flip-back">
              <span className="moonmark" />
              <b>Deine Rolle</b>
              <small>Tippen zum Aufdecken – niemand darf mitschauen</small>
            </span>
            <span className={`flip-face flip-front ${wolf ? "team-wolf" : ""}`}>
              <span className="em">{info.emoji}</span>
              <strong className="rname">{info.name}</strong>
              <span className="team">{wolf ? "Team Werwölfe" : "Team Dorf"}</span>
              <span className="desc">{info.description}</span>
              {mates.length > 0 && <span className="desc mates">Dein Rudel: {mates.map((w) => w.name).join(", ")}</span>}
            </span>
          </span>
        </button>
        {note && <p>{note}</p>}
        <button className="btn btn-gold btn-large" style={{ width: "100%" }} onClick={onClose} disabled={requireOpen && !seen}>
          {requireOpen && !seen ? "Erst Karte aufdecken" : "Verstanden – Karte weglegen"}
        </button>
      </div>
    </div>
  );
}
