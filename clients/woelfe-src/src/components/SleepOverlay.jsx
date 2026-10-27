import React from "react";

export default function SleepOverlay({ text }) {
  return (
    <div className="card sleep">
      <div className="sleep-moon" aria-hidden="true">
        <span className="m" />
        <span className="z">Z</span>
        <span className="z">z</span>
        <span className="z">z</span>
      </div>
      <p>{text}</p>
      <p className="hint">Augen zu und Handy umdrehen. Auf den meisten Android-Handys vibriert es, wenn du dran bist.</p>
    </div>
  );
}
