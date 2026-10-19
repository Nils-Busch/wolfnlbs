import React from "react";

export default function SleepOverlay({ text }) {
  return (
    <div className="card centered-note sleep-overlay">
      <div className="sleep-emoji">😴</div>
      <p>{text}</p>
      <p className="hint">Leg dein Handy mit dem Bildschirm nach unten und warte.</p>
    </div>
  );
}
