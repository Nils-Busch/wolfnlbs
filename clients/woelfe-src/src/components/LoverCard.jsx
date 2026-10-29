import React from "react";
import { colorFor, initials } from "../lib/fx.js";

// Einblendung für Verliebte: Amor hat dich mit jemandem verbunden.
export default function LoverCard({ partner, onClose }) {
  return (
    <div className="role-modal" role="dialog" aria-modal="true" aria-label="Du bist verliebt">
      <div className="role-modal-inner lover-modal">
        <div className="hearts" aria-hidden="true"><i>💗</i><i>💘</i><i>💗</i></div>
        <h2 style={{ margin: 0 }}>Amors Pfeil hat dich getroffen!</h2>
        <div className="lover-pair">
          <span className="av" style={{ "--c": colorFor(partner.name) }}>{initials(partner.name)}</span>
        </div>
        <p>
          Du bist verliebt in <b style={{ color: "var(--text)" }}>{partner.name}</b>. Stirbt einer von euch, stirbt der andere aus Liebeskummer mit.
          Seid ihr in verschiedenen Teams, gewinnt ihr nur zu zweit als Letzte.
        </p>
        <button className="btn btn-gold btn-large" style={{ width: "100%" }} onClick={onClose}>
          Verstanden – geheim halten
        </button>
      </div>
    </div>
  );
}
